// ─────────────────────────────────────────────────────────────
// DentCare – js/stock-requests.js (stock take-outs, approved by Dr. Gapit)
// ─────────────────────────────────────────────────────────────
//
// ── WHY THIS EXISTS (2026-10-01, Dr. Gapit) ──────────────────────────────
//
// Recording a visit used to take supplies off the shelf: the dentist picked
// what she used, with quantities, while the patient was still in the chair.
// She asked for that to go. She does not touch the inventory while she treats.
//
// Stock still has to go down when something is used, wasted or expires, so
// that job moved to the front desk, with a check on it:
//
//   staff file a take-out   ->   Dr. Gapit approves it   ->   the shelf count drops
//
// Until she approves, NOTHING moves. A request is its own document in
// stock_requests; approving it lowers the item and writes the usual
// inventory_movements row in one transaction, so Stock History reads exactly
// as it always has, with both names on it.
//
// Only take-OUTS go through here. A delivery, the opening balance and a shelf
// count stay immediate in js/inventory.js, because a count is the check on
// everything else and must never wait on anybody.
//
// ── WHAT THE DATABASE ENFORCES, AND WHAT IT DOES NOT ─────────────────────
//
// firestore.rules (stock_requests) lets only staff file a request, only the
// dentist decide one, only a pending one be decided, and nobody delete one.
// It does NOT stop staff from lowering stock directly: they must still be able
// to write the item for a delivery and a count. So "a take-out needs Doc's
// approval" is enforced by these screens, not by the database. The clinic was
// told this plainly (docs/revisions-2026-09-30/PLAN.md, section 4, item 8).
//
// Collection stock_requests/{autoId}:
//   itemId, itemName, unit, qty (int 1..10000), reason (use|wastage|expired),
//   note, [appointmentId, patientName], status (Pending|Approved|Rejected|
//   Withdrawn), requestedBy, requestedByName, requestedAt,
//   and once decided: decidedBy, decidedByName, decidedAt, decisionNote,
//   and once approved: movementId, balanceAfter.
// ─────────────────────────────────────────────────────────────

/** The take-out reasons that need approval. The labels are js/inventory.js's. */
const STOCK_REQUEST_REASONS = ["use", "wastage", "expired"];

/** The most one request may take: matches the cap in firestore.rules. */
const STOCK_REQUEST_MAX_QTY = 10000;

/** How many decided requests the "recently decided" lists show. */
const STOCK_DECISIONS_SHOWN = 20;

/** What the front desk is told when a take-out is filed. */
const STOCK_REQUEST_SENT = "Sent to Dr. Gapit for approval. The stock does not change until she approves it.";

/** The pending requests Doc's tab last drew, by id. */
let stockApprovalsById = {};

function stockRequestIsStaff() {
    return typeof currentRole !== "undefined" && (currentRole === "staff" || currentRole === "admin");
}

function stockRequestIsDentist() {
    return typeof currentRole !== "undefined" && currentRole === "dentist";
}

function stockRequestReasonLabel(reason) {
    return typeof stockReasonLabel === "function" ? stockReasonLabel(reason) : reason;
}

function stockRequestNow() {
    return new Date().toISOString();
}

function stockRequestToday() {
    return typeof localDateKey === "function" ? localDateKey() : new Date().toISOString().slice(0, 10);
}

/** An error the screens show as it is, rather than as "could not save". */
function stockRequestError(message) {
    const err = new Error(message);
    err.code = "stock-request";
    return err;
}

/**
 * File a take-out for Dr. Gapit to approve. Staff only. Moves no stock.
 *
 * @param {object} req  itemId, itemName, unit, itemType, qty, reason, note,
 *                      and optionally appointmentId and patientName
 * @return {Promise<{id: string}>}
 */
function submitStockRequest(req) {
    if (!stockRequestIsStaff()) {
        return Promise.reject(stockRequestError("Only the front desk files a take-out for approval."));
    }
    const r = req || {};
    const qty = Number(r.qty);
    if (!r.itemId) return Promise.reject(stockRequestError("Choose the supply item first."));
    if (!Number.isInteger(qty) || qty < 1 || qty > STOCK_REQUEST_MAX_QTY) {
        return Promise.reject(stockRequestError("Enter a whole number of units, from 1 to " +
                                                STOCK_REQUEST_MAX_QTY + "."));
    }
    if (STOCK_REQUEST_REASONS.indexOf(r.reason) === -1) {
        return Promise.reject(stockRequestError("Choose what happened to the item."));
    }
    // The same rule js/inventory.js applies: a reusable instrument is
    // sterilised and used again, so it is never used up by a treatment.
    if (r.itemType === "reusable" && r.reason === "use") {
        return Promise.reject(stockRequestError("A reusable instrument is not used up by a treatment. " +
                                                "Record a breakage under \"damaged\" instead."));
    }

    const doc = {
        itemId: String(r.itemId),
        itemName: String(r.itemName || "").slice(0, 150),
        unit: String(r.unit || "").slice(0, 30),
        qty: qty,
        reason: r.reason,
        note: String(r.note || "").trim().slice(0, 500),
        status: "Pending",
        requestedBy: currentUserId || "",
        requestedByName: String(currentUser || "").slice(0, 200),
        requestedAt: stockRequestNow()
    };
    // The visit is only meaningful for something used on a patient.
    if (r.reason === "use" && r.appointmentId) {
        doc.appointmentId = String(r.appointmentId).slice(0, 128);
        doc.patientName = String(r.patientName || "").slice(0, 200);
    }

    const ref = db.collection("stock_requests").doc();
    return ref.set(doc).then(() => ({ id: ref.id }));
}

/**
 * Take back one's own request before Dr. Gapit has decided it. Staff only.
 * Read live, so a request she approved a moment ago cannot be withdrawn.
 */
function withdrawStockRequest(id) {
    if (!stockRequestIsStaff()) {
        return Promise.reject(stockRequestError("Only the front desk withdraws a take-out."));
    }
    const ref = db.collection("stock_requests").doc(id);
    return db.runTransaction(tx => tx.get(ref).then(snap => {
        if (!snap.exists) throw stockRequestError("That request no longer exists.");
        const r = snap.data();
        if (r.requestedBy !== currentUserId) throw stockRequestError("Only the person who filed a request can withdraw it.");
        if (r.status !== "Pending") throw stockRequestError("This request was already decided.");
        tx.update(ref, { status: "Withdrawn" });
        return r;
    }));
}

/**
 * Approve a take-out: the shelf count drops by exactly the quantity asked for.
 *
 * One transaction, all reads first: the request (still pending?), then the
 * item. Then the item's new quantity, the movement row, and the request marked
 * Approved with the movement it made. Two windows, or a double click, cannot
 * take the stock twice: the second sees the request already Approved.
 *
 * Stock may go below zero, as it can for any take-out: refusing would only
 * mean real usage never gets recorded. The caller warns when it does.
 *
 * @return {Promise<{after: number, itemName: string, unit: string}>}
 */
function approveStockRequest(id) {
    if (!stockRequestIsDentist()) {
        return Promise.reject(stockRequestError("Only Dr. Gapit approves a take-out."));
    }
    const reqRef = db.collection("stock_requests").doc(id);
    const movementRef = db.collection("inventory_movements").doc();

    return db.runTransaction(tx => tx.get(reqRef).then(reqSnap => {
        if (!reqSnap.exists) throw stockRequestError("That request no longer exists.");
        const r = reqSnap.data();
        if (r.status !== "Pending") throw stockRequestError("This request was already decided.");
        const qty = Number(r.qty);
        if (!Number.isInteger(qty) || qty < 1) throw stockRequestError("This request has no valid quantity.");

        const itemRef = db.collection("inventory").doc(r.itemId);
        return tx.get(itemRef).then(itemSnap => {
            if (!itemSnap.exists) throw stockRequestError("That supply item no longer exists.");
            const item = itemSnap.data();
            if (item.itemType === "reusable" && r.reason === "use") {
                throw stockRequestError("A reusable instrument is not used up by a treatment. Reject this request.");
            }

            const before = Number(item.quantity) || 0;
            const after = before - qty;
            const now = stockRequestNow();
            const asked = r.requestedByName || "the front desk";
            const note = (r.note ? "Approved request: " + r.note : "Approved request") + " (asked by " + asked + ")";

            tx.update(itemRef, { quantity: after });
            tx.set(movementRef, {
                itemId: r.itemId,
                itemName: item.itemName || r.itemName || "",
                changeQty: -qty,
                balanceAfter: after,
                reason: r.reason,
                note: note,
                performedBy: currentUserId || "",
                performedByName: currentUser || "",
                createdAt: now,
                movementDate: stockRequestToday(),
                requestId: id,
                requestedBy: r.requestedBy || "",
                requestedByName: r.requestedByName || ""
            });
            tx.update(reqRef, {
                status: "Approved",
                decidedBy: currentUserId || "",
                decidedByName: String(currentUser || "").slice(0, 200),
                decidedAt: now,
                decisionNote: "",
                movementId: movementRef.id,
                balanceAfter: after
            });
            return { after: after, itemName: item.itemName || r.itemName || "", unit: item.unit || r.unit || "" };
        });
    }));
}

/** Refuse a take-out. Nothing moves. The note is optional. */
function rejectStockRequest(id, note) {
    if (!stockRequestIsDentist()) {
        return Promise.reject(stockRequestError("Only Dr. Gapit decides a take-out."));
    }
    const ref = db.collection("stock_requests").doc(id);
    return db.runTransaction(tx => tx.get(ref).then(snap => {
        if (!snap.exists) throw stockRequestError("That request no longer exists.");
        if (snap.data().status !== "Pending") throw stockRequestError("This request was already decided.");
        tx.update(ref, {
            status: "Rejected",
            decidedBy: currentUserId || "",
            decidedByName: String(currentUser || "").slice(0, 200),
            decidedAt: stockRequestNow(),
            decisionNote: String(note || "").trim().slice(0, 500)
        });
        return snap.data();
    }));
}

/** {itemId: units waiting} over the requests still pending. */
function pendingQtyByItem(requests) {
    const out = {};
    (requests || []).forEach(r => {
        if (!r || r.status !== "Pending" || !r.itemId) return;
        out[r.itemId] = (out[r.itemId] || 0) + (Number(r.qty) || 0);
    });
    return out;
}

/** Every pending request, oldest first. Bounded by the status filter. */
function fetchPendingStockRequests() {
    return pendingStockRequestsQuery().get().then(pendingStockRows);
}

/** The take-outs waiting, as a query: read once above, or listened to (R20). */
function pendingStockRequestsQuery() {
    return db.collection("stock_requests").where("status", "==", "Pending");
}

/** Rows from a snapshot of pending take-outs, oldest first. */
function pendingStockRows(snap) {
    const rows = [];
    snap.forEach(doc => rows.push(Object.assign({ id: doc.id }, doc.data())));
    rows.sort((a, b) => String(a.requestedAt || "").localeCompare(String(b.requestedAt || "")));
    return rows;
}

/** The most recent decisions, newest first. */
function fetchRecentStockDecisions() {
    return recentStockDecisionsQuery().get().then(stockDecisionRows);
}

function recentStockDecisionsQuery() {
    return db.collection("stock_requests")
        .orderBy("decidedAt", "desc")
        .limit(STOCK_DECISIONS_SHOWN);
}

function stockDecisionRows(snap) {
    const rows = [];
    snap.forEach(doc => rows.push(Object.assign({ id: doc.id }, doc.data())));
    return rows;
}

/**
 * Medical Inventory and Stock Approvals, live (2026-10-02, R20): the supplies,
 * the take-outs waiting and the recent decisions, each listened to with the
 * query it was read with. onReady(itemsSnap, pending, decided) whenever any of
 * them changes, once all three have arrived.
 *
 * The recent decisions are a courtesy: if they cannot be read they count as
 * none. So can the waiting take-outs when `pendingOptional` (the inventory
 * list must not be lost over them); otherwise their failure is onError's.
 */
function watchStockLists(tabKey, onReady, onError, pendingOptional) {
    const state = { items: null, pending: null, decided: null };
    const fire = () => {
        if (state.items && state.pending && state.decided) onReady(state.items, state.pending, state.decided);
    };
    watchLive(tabKey + ":items", db.collection("inventory"), snap => {
        if (typeof checkDialogRecords === "function") checkDialogRecords("inventory", snap.docs);
        state.items = snap;
        fire();
    }, onError);
    watchLive(tabKey + ":pending", pendingStockRequestsQuery(), snap => {
        state.pending = pendingStockRows(snap);
        fire();
    }, err => {
        if (!pendingOptional) return onError(err);
        console.warn("Stock requests unavailable:", err);
        state.pending = [];
        fire();
    });
    watchLive(tabKey + ":decided", recentStockDecisionsQuery(), snap => {
        state.decided = stockDecisionRows(snap);
        fire();
    }, () => { state.decided = []; fire(); });
}

/**
 * Today's and yesterday's completed visits, for "Used on a patient": which
 * visit the take-out was for. Two dates, one query.
 */
function fetchRecentVisitsForStock() {
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const key = d => (typeof localDateKey === "function" ? localDateKey(d) : d.toISOString().slice(0, 10));
    return db.collection("appointments")
        .where("appointmentDate", "in", [key(today), key(yesterday)])
        .get()
        .then(snap => {
            const rows = [];
            snap.forEach(doc => {
                const a = doc.data();
                if (a.status === "Completed") rows.push(Object.assign({ id: doc.id }, a));
            });
            rows.sort((a, b) => String(b.completedAt || "").localeCompare(String(a.completedAt || "")));
            return rows;
        });
}

function stockRequestWhen(iso) {
    const d = new Date(iso);
    if (!iso || isNaN(d.getTime())) return "";
    return d.toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function stockRequestQtyText(r) {
    return (Number(r.qty) || 0) + (r.unit ? " " + r.unit : "");
}


// ─────────────────────────────────────────────────────────────
// Staff: the "Waiting for approval" panel in Medical Inventory
// ─────────────────────────────────────────────────────────────

/**
 * Draw the staff member's own pending requests (with Withdraw) and the most
 * recent decisions. Called by loadStaffInventory() with the pending list it
 * already fetched, so the per-item counts and this panel agree.
 */
function renderStaffStockRequests(pending, decided) {
    const host = document.getElementById("inventory-requests");
    if (!host) return;
    const mine = (pending || []).filter(r => r.requestedBy === currentUserId);
    const others = (pending || []).length - mine.length;
    const recent = (decided || []).filter(r => r.status === "Approved" || r.status === "Rejected");

    if (!(pending || []).length && !recent.length) {
        host.innerHTML = "";
        host.hidden = true;
        return;
    }
    host.hidden = false;

    const pendingRows = mine.map(r =>
        '<li class="stock-req">' +
            '<span class="stock-req__main"><strong>' + escapeHtml(r.itemName || "Item") + "</strong> · " +
                escapeHtml(stockRequestQtyText(r)) + " · " + escapeHtml(stockRequestReasonLabel(r.reason)) +
                (r.patientName ? " · " + escapeHtml(r.patientName) : "") +
                (r.note ? '<span class="stock-req__note">' + escapeHtml(r.note) + "</span>" : "") +
            "</span>" +
            '<span class="stock-req__meta">' + escapeHtml(stockRequestWhen(r.requestedAt)) + "</span>" +
            '<button type="button" class="btn-secondary btn-sm" onclick="onWithdrawStockRequest(\'' +
                escapeJsAttr(r.id) + '\')">Withdraw</button>' +
        "</li>").join("");

    const decidedRows = recent.map(r =>
        '<li class="stock-req stock-req--decided">' +
            '<span class="stock-req__main"><strong>' + escapeHtml(r.itemName || "Item") + "</strong> · " +
                escapeHtml(stockRequestQtyText(r)) + " · " + escapeHtml(stockRequestReasonLabel(r.reason)) +
                '<span class="stock-req__note">' +
                    escapeHtml((r.status === "Approved" ? "Approved" : "Rejected") + " by " + (r.decidedByName || "Dr. Gapit")) +
                    (r.decisionNote ? ": " + escapeHtml(r.decisionNote) : "") +
                "</span>" +
            "</span>" +
            '<span class="badge ' + (r.status === "Approved" ? "badge-completed" : "badge-rejected") + '">' +
                escapeHtml(r.status) + "</span>" +
        "</li>").join("");

    host.innerHTML =
        '<h3>Waiting for approval</h3>' +
        '<p class="card-hint">Take-outs go to Dr. Gapit. The stock changes only when she approves them.</p>' +
        (mine.length
            ? '<ul class="stock-req-list">' + pendingRows + "</ul>"
            : '<p class="field-hint">Nothing of yours is waiting.</p>') +
        (others > 0
            ? '<p class="field-hint">' + others + " more from other staff " + (others === 1 ? "is" : "are") + " waiting.</p>"
            : "") +
        (recent.length
            ? '<h4 class="stock-req-heading">Recently decided</h4><ul class="stock-req-list">' + decidedRows + "</ul>"
            : "");
}

function onWithdrawStockRequest(id) {
    withdrawStockRequest(id)
        .then(() => {
            showToast("Request withdrawn. Nothing was taken from stock.", "info");
            if (typeof loadStaffInventory === "function") loadStaffInventory();
        })
        .catch(err => {
            console.error("Could not withdraw the request:", err);
            showToast(err && err.code === "stock-request" ? err.message : "Could not withdraw that request.", "error");
            if (typeof loadStaffInventory === "function") loadStaffInventory();
        });
}

/** Fill the "Which visit?" select in the Adjust dialog. */
function fillStockVisitPicker() {
    const select = document.getElementById("adjust-visit");
    if (!select) return Promise.resolve();
    select.innerHTML = '<option value="">Not for a particular visit</option>';
    return fetchRecentVisitsForStock()
        .then(rows => {
            rows.forEach(a => {
                const opt = document.createElement("option");
                opt.value = a.id;
                opt.dataset.patientName = a.patientName || "";
                opt.textContent = (a.patientName || "Patient") + " · " +
                    (typeof formatAppointmentWhen === "function" ? formatAppointmentWhen(a) : a.appointmentDate);
                select.appendChild(opt);
            });
        })
        .catch(err => console.warn("Recent visits unavailable for the stock form:", err));
}


// ─────────────────────────────────────────────────────────────
// Dr. Gapit: the Stock Approvals tab
// ─────────────────────────────────────────────────────────────

function loadStockApprovals() {
    const host = document.getElementById("stock-approvals-list");
    const recentHost = document.getElementById("stock-approvals-recent");
    if (!host) return;
    host.innerHTML = '<p class="field-hint">Loading&hellip;</p>';

    // Live since 2026-10-02 (R20): a take-out filed at the desk appears here
    // without a refresh.
    watchStockLists("tab-dentist-stock", (itemsSnap, pending, decided) => {
        const items = {};
        itemsSnap.forEach(doc => { items[doc.id] = doc.data(); });
        drawStockApprovals(host, recentHost, pending, items, decided);
    }, err => {
        console.error("Could not load stock approvals:", err);
        host.innerHTML = '<p class="queue-empty">Could not load the requests. Check the connection and open this tab again.</p>';
    });
}

/** Stock Approvals, from the three lists. */
function drawStockApprovals(host, recentHost, pending, items, decided) {
    stockApprovalItems = items;
    stockApprovalsById = {};
    pending.forEach(r => { stockApprovalsById[r.id] = r; });
    selectedStockRequestIds.forEach(id => { if (!stockApprovalsById[id]) selectedStockRequestIds.delete(id); });
    paintStockApprovalCount(pending.length);

    if (!pending.length) {
        host.innerHTML = '<p class="queue-empty">Nothing is waiting for your approval.</p>';
    } else {
        host.innerHTML = '<ul class="stock-req-list">' + pending.map(r => {
            const item = items[r.itemId] || {};
            const now = Number(item.quantity);
            const known = items[r.itemId] && isFinite(now);
            const after = known ? now - (Number(r.qty) || 0) : null;
            const unit = r.unit || item.unit || "";
            return '<li class="stock-req stock-req--approval">' +
                '<label class="stock-select"><input type="checkbox" data-stock-request="' + escapeHtml(r.id) + '" ' +
                    'aria-label="Select ' + escapeHtml(r.itemName || "item") + ', ' + escapeHtml(stockRequestQtyText(r)) + '" ' +
                    (selectedStockRequestIds.has(r.id) ? 'checked ' : '') +
                    (known && !stockBulkBusy ? '' : 'disabled ') +
                    'onchange="selectStockRequest(\'' + escapeJsAttr(r.id) + '\', this.checked)"></label>' +
                '<span class="stock-req__main"><strong>' + escapeHtml(r.itemName || item.itemName || "Item") +
                    "</strong> · " + escapeHtml(stockRequestQtyText(r)) + " · " +
                    escapeHtml(stockRequestReasonLabel(r.reason)) +
                    (r.patientName ? '<span class="stock-req__note">For ' + escapeHtml(r.patientName) + "</span>" : "") +
                    (r.note ? '<span class="stock-req__note">' + escapeHtml(r.note) + "</span>" : "") +
                    '<span class="stock-req__note">Asked by ' + escapeHtml(r.requestedByName || "the front desk") +
                        ", " + escapeHtml(stockRequestWhen(r.requestedAt)) + "</span>" +
                    '<span class="stock-req__stock' + (after !== null && after < 0 ? " is-short" : "") + '">' +
                        (known
                            ? "On the shelf: " + now + " " + escapeHtml(unit) + ". After: " + after + " " + escapeHtml(unit) + "."
                            : "This item is no longer on the inventory list.") +
                    "</span>" +
                "</span>" +
                '<span class="stock-req__actions">' +
                    '<button type="button" class="btn-sm" onclick="onApproveStockRequest(\'' + escapeJsAttr(r.id) + '\')"' +
                        (known ? "" : " disabled") + ">Approve</button>" +
                    '<button type="button" class="btn-secondary btn-sm" onclick="onRejectStockRequest(\'' +
                        escapeJsAttr(r.id) + '\')">Reject</button>' +
                "</span>" +
            "</li>";
        }).join("") + "</ul>";
    }
    paintStockSelection();

    if (recentHost) {
        const recent = decided.filter(r => r.status === "Approved" || r.status === "Rejected");
        recentHost.innerHTML = recent.length
            ? '<ul class="stock-req-list">' + recent.map(r =>
                '<li class="stock-req stock-req--decided">' +
                    '<span class="stock-req__main"><strong>' + escapeHtml(r.itemName || "Item") + "</strong> · " +
                        escapeHtml(stockRequestQtyText(r)) + " · " + escapeHtml(stockRequestReasonLabel(r.reason)) +
                        '<span class="stock-req__note">Asked by ' + escapeHtml(r.requestedByName || "the front desk") +
                            (r.decisionNote ? ". Note: " + escapeHtml(r.decisionNote) : "") + "</span>" +
                    "</span>" +
                    '<span class="badge ' + (r.status === "Approved" ? "badge-completed" : "badge-rejected") + '">' +
                        escapeHtml(r.status) + "</span>" +
                "</li>").join("") + "</ul>"
            : '<p class="field-hint">No decisions yet.</p>';
    }
}

function onApproveStockRequest(id) {
    if (stockBulkBusy) return;
    approveStockRequest(id)
        .then(result => {
            const unit = result.unit ? " " + result.unit : "";
            if (result.after < 0) {
                showToast("Approved. " + result.itemName + " is now " + result.after + unit +
                          ". The shelf count needs checking.", "warning");
            } else {
                showToast("Approved. " + result.itemName + " is now " + result.after + unit + ".", "success");
            }
            loadStockApprovals();
        })
        .catch(err => {
            console.error("Could not approve the request:", err);
            showToast(err && err.code === "stock-request" ? err.message : "Could not approve that request. Nothing was taken from stock.", "error");
            loadStockApprovals();
        });
}

function onRejectStockRequest(id) {
    if (stockBulkBusy) return;
    const r = stockApprovalsById[id] || {};
    const ask = typeof promptDialog === "function"
        ? promptDialog("Reject this take-out of " + stockRequestQtyText(r) + " " + (r.itemName || "") +
                       "? Nothing will be taken from stock. You can add a note for the front desk.",
                       "", { title: "Reject request?", confirmLabel: "Reject", tone: "danger",
                             label: "Note for the front desk (optional)", field: { maxLength: 500 } })
        : Promise.resolve("");
    Promise.resolve(ask).then(note => {
        if (note === null || note === undefined || note === false) return;
        return rejectStockRequest(id, typeof note === "string" ? note : "")
            .then(() => {
                showToast("Request rejected. Nothing was taken from stock.", "info");
                loadStockApprovals();
            });
    }).catch(err => {
        console.error("Could not reject the request:", err);
        showToast(err && err.code === "stock-request" ? err.message : "Could not reject that request.", "error");
        loadStockApprovals();
    });
}

/** The count beside Stock Approvals in Doc's sidebar. */
function paintStockApprovalCount(n) {
    if (typeof paintNavCount === "function") {
        paintNavCount("nav-dentist-stock", n, n === 1 ? "1 stock request waiting" : n + " stock requests waiting");
    }
}


// Grouped review uses the existing per-request transaction and audit trail.
const selectedStockRequestIds = new Set();
let stockApprovalItems = {};
let stockBulkBusy = false;
function stockSelectionRows() {
    return Array.from(selectedStockRequestIds).map(id => stockApprovalsById[id]).filter(r => r && stockApprovalItems[r.itemId] && Number.isFinite(Number(stockApprovalItems[r.itemId].quantity)));
}
function selectStockRequest(id, checked) {
    if (stockBulkBusy) return;
    if (checked) selectedStockRequestIds.add(id); else selectedStockRequestIds.delete(id);
    paintStockSelection();
}
function selectAllStockRequests(checked) {
    if (stockBulkBusy) return;
    selectedStockRequestIds.clear();
    if (checked) Object.values(stockApprovalsById).forEach(r => {
        if (stockApprovalItems[r.itemId] && Number.isFinite(Number(stockApprovalItems[r.itemId].quantity))) selectedStockRequestIds.add(r.id);
    });
    paintStockSelection();
}
function stockSelectionSummary(rows) {
    const totals = pendingQtyByItem(rows);
    return Object.keys(totals).map(id => {
        const item = stockApprovalItems[id] || {};
        const before = Number(item.quantity) || 0;
        const after = before - totals[id];
        return (item.itemName || id) + ': ' + before + ' − ' + totals[id] + ' = ' + after + ' ' + (item.unit || '') +
            (after < 0 ? ' — shelf count needs checking' : '');
    }).join('\n');
}
function paintStockSelection() {
    const rows = stockSelectionRows();
    const button = document.getElementById('stock-approve-selected');
    if (button) { button.disabled = stockBulkBusy || !rows.length; button.textContent = stockBulkBusy ? 'Approving…' : 'Review selected (' + rows.length + ')'; }
    const summary = document.getElementById('stock-selected-summary');
    if (summary) summary.textContent = rows.length ? stockSelectionSummary(rows) : 'Select entries to see the combined stock deduction.';
    document.querySelectorAll('[data-stock-request]').forEach(box => {
        box.checked = selectedStockRequestIds.has(box.dataset.stockRequest);
        const r = stockApprovalsById[box.dataset.stockRequest];
        box.disabled = stockBulkBusy || !r || !stockApprovalItems[r.itemId] || !Number.isFinite(Number(stockApprovalItems[r.itemId].quantity));
    });
    const all = document.getElementById('stock-select-all');
    if (all) {
        const available = Object.values(stockApprovalsById).filter(r => stockApprovalItems[r.itemId] && Number.isFinite(Number(stockApprovalItems[r.itemId].quantity))).length;
        all.checked = available > 0 && rows.length === available;
        all.indeterminate = rows.length > 0 && rows.length < available;
        all.disabled = stockBulkBusy || !available;
    }
    document.querySelectorAll('#stock-approvals-list .stock-req__actions button').forEach(button => {
        if (stockBulkBusy) { if (!button.disabled) button.dataset.bulkDisabled = 'true'; button.disabled = true; }
        else if (button.dataset.bulkDisabled) { button.disabled = false; delete button.dataset.bulkDisabled; }
    });
}
async function approveSelectedStockRequests() {
    if (!stockRequestIsDentist() || stockBulkBusy) return;
    const rows = stockSelectionRows().map(r => Object.assign({}, r));
    if (!rows.length) return;
    stockBulkBusy = true;
    paintStockSelection();
    const resultEl = document.getElementById('stock-bulk-result');
    try {
        const details = rows.map(r => (r.itemName || 'Item') + ' · ' + stockRequestQtyText(r) + ' · ' + stockRequestReasonLabel(r.reason) +
            (r.patientName ? ' · ' + r.patientName : '')).join('\n');
        const confirmed = await confirmDialog(details + '\n\nCombined stock deduction:\n' + stockSelectionSummary(rows) +
            '\n\nEach entry is saved separately. Any entry that cannot be approved will be listed for retry.',
            { title: 'Approve ' + rows.length + ' selected entries?', confirmLabel: 'Approve Selected' });
        if (!confirmed) return;
        let approved = 0;
        const failed = [], shortages = [];
        for (const r of rows) {
            try {
                const result = await approveStockRequest(r.id);
                approved++;
                selectedStockRequestIds.delete(r.id);
                if (result.after < 0) shortages.push(result.itemName);
            } catch (err) { failed.push((r.itemName || 'Item') + ': ' + (err.code === 'stock-request' ? err.message : 'Could not approve. Check the connection and retry.')); }
            if (resultEl) resultEl.textContent = 'Processed ' + (approved + failed.length) + ' of ' + rows.length + ' entries…';
        }
        const message = approved + ' approved.' + (failed.length ? ' ' + failed.length + ' not approved.\n' + failed.join('\n') : '') +
            (shortages.length ? '\nCheck shelf counts: ' + Array.from(new Set(shortages)).join(', ') + '.' : '');
        if (resultEl) resultEl.textContent = message;
        showToast(approved + ' stock entries approved.' + (failed.length ? ' Review the entries that failed.' : ''), failed.length || shortages.length ? 'warning' : 'success');
        loadStockApprovals();
    } finally { stockBulkBusy = false; paintStockSelection(); }
}
