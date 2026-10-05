// ─────────────────────────────────────────────────────────────
// DentCare – js/inventory.js (Supplies & Inventory Manager)
// ─────────────────────────────────────────────────────────────
//
// Stock levels are never written directly. Every change goes through
// recordStockMovement(), which writes two things in one transaction: the item's
// new quantity, and a row in the "inventory_movements" collection saying what
// changed, by how much, why, and who did it.
//
// This is the point of the design. Overwriting a number tells you what the
// count is now; a ledger tells you how it got there. When a count looks wrong —
// and it will — the question "where did twelve carpules go?" becomes something
// you can look up instead of argue about.
//
// Firestore collections used here:
//   inventory            one doc per supply item
//   inventory_movements  one doc per change to any item
//
// ─────────────────────────────────────────────────────────────


// What a movement can be. The sign is fixed per reason so the person entering
// it only has to say what happened, never whether that means plus or minus.
//
// needsApproval (2026-10-01, Dr. Gapit): a take-out does not move the stock
// from this screen any more. It becomes a request she approves on her Stock
// Approvals tab (js/stock-requests.js), and the shelf count drops then. A
// delivery, the opening balance and a shelf count stay immediate.
const STOCK_REASONS = {
    restock:       { sign:  1, label: "Received new supplies" },
    use:           { sign: -1, label: "Used on a patient", needsApproval: true },
    wastage:       { sign: -1, label: "Damaged, spilled or contaminated", needsApproval: true },
    expired:       { sign: -1, label: "Past expiry date", needsApproval: true },
    correction_up: { sign:  1, label: "Count correction — found more", store: "correction" },
    correction_dn: { sign: -1, label: "Count correction — found fewer", store: "correction" },
    initial:       { sign:  1, label: "Opening balance" }
};

// Reusable instruments are sterilised and used again, so they are never
// consumed by a treatment: "Used on a patient" is refused for them here and
// again when a take-out request is approved.
const ITEM_TYPES = {
    consumable: "Consumable",
    reusable:   "Reusable"
};

function stockReasonLabel(reason) {
    if (STOCK_REASONS[reason]) return STOCK_REASONS[reason].label;
    // Movements are stored with the collapsed reason ("correction"), so map back.
    if (reason === "correction") return "Count correction";
    return reason || "Adjustment";
}


// ─────────────────────────────────────────────────────────────
// The ledger
// ─────────────────────────────────────────────────────────────

/**
 * Apply a stock change and record why, atomically.
 *
 * Runs in a Firestore transaction so two people adjusting the same item at the
 * same moment cannot overwrite each other — the second one re-reads and
 * recalculates rather than clobbering.
 *
 * @param {string} itemId     Firestore id of the inventory item
 * @param {number} changeQty  signed: negative takes stock out, positive puts it in
 * @param {string} reason     one of the keys stored in inventory_movements
 * @param {string} [note]     optional free text from the person making the change
 * @param {object} [extra]    extra fields merged onto the movement — used by a
 *                            restock to record what the delivery cost
 * @returns {Promise<number>} the item's new quantity
 */
function recordStockMovement(itemId, changeQty, reason, note, extra) {
    const itemRef = db.collection("inventory").doc(itemId);
    const movementRef = db.collection("inventory_movements").doc();

    return db.runTransaction(tx => {
        return tx.get(itemRef).then(snap => {
            if (!snap.exists) {
                throw new Error("That supply item no longer exists.");
            }

            const item = snap.data();
            const before = Number(item.quantity) || 0;
            const after = before + changeQty;

            // Stock is allowed to go negative on purpose. If the shelf count has
            // drifted, refusing the entry would only mean the real usage never
            // gets recorded. The table flags a negative so it gets checked.
            tx.update(itemRef, { quantity: after });

            tx.set(movementRef, Object.assign({
                itemId: itemId,
                itemName: item.itemName || "",
                changeQty: changeQty,
                balanceAfter: after,
                reason: reason,
                note: (note || "").trim(),
                performedBy: currentUserId || "",
                performedByName: currentUser || "",
                createdAt: new Date().toISOString(),
                // The date the money went out, as a plain YYYY-MM-DD string —
                // the same shape every other date in this system uses, so the
                // year-end export can range over it without parsing timestamps.
                // Local date (see localDateKey in js/app.js), not UTC: before 8 a.m. the
                // UTC date is yesterday, which moved early deliveries into the
                // wrong day, and on the 1st into the wrong month's books.
                movementDate: (typeof localDateKey === "function" ? localDateKey() : new Date().toISOString().slice(0, 10))
            }, extra || {}));

            return after;
        });
    });
}


// ─────────────────────────────────────────────────────────────
// Expiry (2026-09-24)
// ─────────────────────────────────────────────────────────────
//
// One optional `expiryDate` per item (YYYY-MM-DD): the soonest date on the
// shelf, not a batch ledger. Staff may already write any inventory field
// under the deployed Rules; no Rules change was needed. js/notifications.js
// reads it to warn 30 days ahead and once it has passed.
const EXPIRY_WARN_DAYS = 30;

function inventoryExpiryState(expiryDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate || "")) return "none";
    const today = localDateKey();
    const soon = new Date();
    soon.setDate(soon.getDate() + EXPIRY_WARN_DAYS);
    if (expiryDate < today) return "expired";
    return expiryDate <= localDateKey(soon) ? "soon" : "ok";
}

function inventoryExpiryHtml(item, jsId, jsName) {
    const exp = typeof item.expiryDate === "string" ? item.expiryDate : "";
    // Only items that can expire offer it (owner, 2026-09-25): an item added
    // as "does not expire", or a reusable instrument, shows nothing here.
    // Items added before the question existed (no tracksExpiry) keep the
    // control, so an expiry can still be set on them once.
    if (!exp && (item.itemType === "reusable" || item.tracksExpiry === false)) return "";
    const state = inventoryExpiryState(exp);
    const shown = state === "none" ? "Set expiry date"
        : (state === "expired" ? "Expired " : "Expires ") + new Date(exp + "T00:00:00")
            .toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
    return `<button type="button" class="inventory-expiry inventory-expiry--${state}" onclick="openExpiryEditor('${jsId}', '${jsName}', '${escapeJsAttr(exp)}')"><svg class="icon" aria-hidden="true"><use href="#ic-hourglass"></use></svg><span>${escapeHtml(shown)}</span></button>`;
}

function openExpiryEditor(itemId, itemName, expiryDate) {
    document.getElementById("expiry-item-id").value = itemId;
    document.getElementById("expiry-item-name").innerText = itemName;
    document.getElementById("expiry-date").value = /^\d{4}-\d{2}-\d{2}$/.test(expiryDate || "") ? expiryDate : "";
    openModal("modal-item-expiry");
    // Told if this supply changes on another screen while open (R20).
    if (liveInventoryById[itemId] && typeof watchDialogRecord === "function") watchDialogRecord("modal-item-expiry", "inventory/" + itemId, liveInventoryById[itemId]);
}

let expirySaveInFlight = false;

function submitItemExpiry(e) {
    e.preventDefault();
    if (expirySaveInFlight) return;
    const itemId = document.getElementById("expiry-item-id").value;
    const value = document.getElementById("expiry-date").value;
    if (!itemId) return;
    if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        flagField("expiry-date", "Enter a valid date, or leave it empty.");
        return;
    }
    expirySaveInFlight = true;
    if (typeof noteOwnWrite === "function") noteOwnWrite("inventory/" + itemId);
    const button = document.getElementById("expiry-save-btn");
    if (button) button.disabled = true;
    db.collection("inventory").doc(itemId).update({
        expiryDate: value ? value : firebase.firestore.FieldValue.delete()
    })
    .then(() => {
        closeModal("modal-item-expiry");
        showToast(value ? "Expiry date saved." : "Expiry tracking removed for this item.", "success");
        loadStaffInventory();
    })
    .catch(err => {
        console.error("Could not save the expiry date:", err);
        showToast("Could not save the expiry date. Check the internet connection and try again.", "error");
    })
    .finally(() => {
        expirySaveInFlight = false;
        if (button) button.disabled = false;
    });
}


// ─────────────────────────────────────────────────────────────
// Supplies table
// ─────────────────────────────────────────────────────────────

/** Each supply as the live list last saw it, for the dialogs that open on one (R20). */
let liveInventoryById = {};

function loadStaffInventory() {
    // The take-outs waiting for Dr. Gapit (2026-10-01), read beside the list
    // so each row can say how much is waiting. A failure there must not cost
    // the supplies list itself, so it falls back to "nothing waiting".
    // Live since 2026-10-02 (R20): her approval, or another desk's change,
    // shows without a refresh (watchStockLists in js/stock-requests.js).
    const draw = (snapshot, pendingRequests, decidedRequests) => {
        liveInventoryById = {};
        snapshot.forEach(doc => { liveInventoryById[doc.id] = doc.data(); });
        drawStaffInventory(snapshot, pendingRequests, decidedRequests);
    };
    const failed = err => {
        console.error("Error loading inventory:", err);
        showToast("Could not load the supplies list.", "error");
        renderTableLoadError("staff-inventory-table", 7, "the supplies list", "loadStaffInventory");
    };
    if (typeof watchStockLists !== "function") {
        // Without js/stock-requests.js there is nothing waiting to show.
        watchLive("tab-staff-inventory:items", db.collection("inventory"), snapshot => {
            if (typeof checkDialogRecords === "function") checkDialogRecords("inventory", snapshot.docs);
            draw(snapshot, [], []);
        }, failed);
        return;
    }
    watchStockLists("tab-staff-inventory", draw, failed, true);
}

/** Medical Inventory, from the three lists. */
function drawStaffInventory(snapshot, pendingRequests, decidedRequests) {
    const waiting = typeof pendingQtyByItem === "function" ? pendingQtyByItem(pendingRequests) : {};
    if (typeof renderStaffStockRequests === "function") {
        renderStaffStockRequests(pendingRequests, decidedRequests);
    }
    // Runs after every add, edit, restock and delete on this screen, so
    // the cached stock list the visit-completion dialog reads is dropped
    // here too — a supply added a moment ago is offered straight away.
    if (typeof refreshReference === "function") refreshReference("inventory");
    const tbody = document.getElementById("staff-inventory-table");
    const alertContainer = document.getElementById("inventory-alert-container");

    if (!tbody) return;
    tbody.innerHTML = "";
    if (alertContainer) alertContainer.innerHTML = "";

    if (snapshot.empty) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center;">No items found.</td></tr>`;
        return;
    }

    const items = [];
    snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
    items.sort((a, b) => (a.itemName || "").localeCompare(b.itemName || ""));

    const lowStockItems = [];
    const negativeItems = [];

    // Rows are collected and written once. Appending with innerHTML += made the
    // browser re-read the whole table for every row: 300 appointments froze a
    // phone for about 8 seconds and flickered as it redrew (2026-09-24).
    const tableRows = [];
    items.forEach(item => {
        const qty = Number(item.quantity) || 0;
        const min = Number(item.minStockLevel) || 0;
        // Items saved before item types existed are treated as consumables.
        const type = item.itemType === "reusable" ? "reusable" : "consumable";

        let statusBadge;
        if (qty < 0) {
            statusBadge = `<span class="badge badge-rejected">Check count</span>`;
            negativeItems.push(item.itemName);
        } else if (qty <= min) {
            statusBadge = `<span class="badge badge-rejected">Low stock</span>`;
            lowStockItems.push(item.itemName);
        } else {
            statusBadge = `<span class="badge badge-completed">In stock</span>`;
        }

        const typeBadge = type === "reusable"
            ? `<span class="badge badge-approved">Reusable</span>`
            : `<span class="badge badge-cancelled">Consumable</span>`;

        // TWO escapes, because there are two contexts and one function
        // does not cover both.
        //
        // safeName is for cell text. jsName is for the onclick attributes
        // below, where the value lands inside a JavaScript string literal
        // — and escapeHtml is NOT enough there, for the reason set out at
        // js/app.js:214: the browser HTML-decodes an attribute's value
        // BEFORE parsing the JavaScript in it, so an apostrophe turned
        // into &#39; is turned straight back into an apostrophe and closes
        // the string early. This block used one value for both and the
        // comment said so, which is how it stayed wrong.
        //
        // Escaping only apostrophes, as an earlier version did, left an
        // item called 3" gauze with three broken buttons.
        const safeName = escapeHtml(item.itemName);
        const jsName   = escapeJsAttr(item.itemName);
        const jsId     = escapeJsAttr(item.id);
        const jsUnit   = escapeJsAttr(item.unit);

        tableRows.push(`
            <tr>
                <td><strong>${safeName}</strong></td>
                <td>${typeBadge}</td>
                <td class="num"><strong>${qty}</strong> ${escapeHtml(item.unit)}${waiting[item.id]
                    ? `<span class="inventory-waiting">${Number(waiting[item.id])} waiting for approval</span>` : ""}</td>
                <td class="num">${min}</td>
                <td>${statusBadge}${inventoryExpiryHtml(item, jsId, jsName)}</td>
                <td class="inventory-stock-actions"><span class="inventory-action-group">
                    <button type="button" class="record-action record-action--accent" onclick="openStockAdjust('${jsId}', '${jsName}', ${qty}, '${jsUnit}', '${type}')"><svg class="icon" aria-hidden="true"><use href="#ic-gear"></use></svg><span>Adjust stock</span></button>
                    <button type="button" class="record-action record-action--neutral" onclick="openStockHistory('${jsId}', '${jsName}')"><svg class="icon" aria-hidden="true"><use href="#ic-clock"></use></svg><span>History</span></button>
                </span></td>
                <td class="inventory-actions">
                    <button type="button" class="record-action record-action--danger" onclick="deleteInventory('${jsId}', '${jsName}')"><svg class="icon" aria-hidden="true"><use href="#ic-trash"></use></svg><span>Delete</span></button>
                </td>
            </tr>
        `);
    });
    tbody.innerHTML = tableRows.join("");

    if (!alertContainer) return;

    let alerts = "";
    if (negativeItems.length > 0) {
        alerts += `
            <div class="alert-bar">
                <svg class="icon" aria-hidden="true"><use href="#ic-alert"></use></svg>
                <span><strong>Count needs checking.</strong> These went below zero, which means
                the shelf count has drifted: ${negativeItems.map(escapeHtml).join(", ")}.</span>
            </div>
        `;
    }
    if (lowStockItems.length > 0) {
        alerts += `
            <div class="alert-bar">
                <svg class="icon" aria-hidden="true"><use href="#ic-alert"></use></svg>
                <span><strong>Low stock.</strong> These supplies need restocking: ${lowStockItems.map(escapeHtml).join(", ")}.</span>
            </div>
        `;
    }
    alertContainer.innerHTML = alerts;
}


// ─────────────────────────────────────────────────────────────
// Adjust stock
// ─────────────────────────────────────────────────────────────

function openStockAdjust(itemId, itemName, currentQty, unit, itemType) {
    // reset() first — setting the fields before it would wipe them.
    document.getElementById("form-adjust-stock").reset();

    document.getElementById("adjust-item-id").value = itemId;
    document.getElementById("adjust-item-current").value = currentQty;
    document.getElementById("adjust-item-type").value = itemType || "consumable";
    document.getElementById("adjust-item-name").innerText = itemName;
    document.getElementById("adjust-item-stock").innerText = `${currentQty} ${unit || ""}`.trim();
    document.getElementById("adjust-qty").value = 1;
    // What a take-out request carries with it (js/stock-requests.js).
    const unitEl = document.getElementById("adjust-item-unit");
    if (unitEl) unitEl.value = unit || "";
    if (typeof fillStockVisitPicker === "function") fillStockVisitPicker();

    applyReusableReasonRules(itemType === "reusable");

    applyStockCountMode();
    openModal("modal-adjust-stock");
    // Told if this supply changes on another screen while open (R20): an
    // approval by Dr. Gapit, another desk's count.
    if (liveInventoryById[itemId] && typeof watchDialogRecord === "function") watchDialogRecord("modal-adjust-stock", "inventory/" + itemId, liveInventoryById[itemId]);
}

/**
 * A reusable instrument is not used up by a treatment.
 *
 * The automatic deduction already knows this — completing a visit skips
 * reusables entirely. This makes the manual form agree with it, because the
 * two disagreeing is worse than either rule on its own: staff would adjust a
 * mirror down one every visit while the automatic path left it alone, and the
 * count would drift toward zero with nothing to explain why.
 *
 * Wastage and expiry stay available. An instrument really can be dropped and
 * broken; what it cannot be is consumed.
 */
function applyReusableReasonRules(isReusable) {
    const select = document.getElementById("adjust-reason");
    const hint = document.getElementById("adjust-reason-hint");
    if (!select) return;

    const useOption = Array.from(select.options).find(o => o.value === "use");
    if (useOption) {
        useOption.hidden = isReusable;
        useOption.disabled = isReusable;
        if (isReusable && select.value === "use") select.value = "restock";
    }

    if (hint) {
        hint.innerText = isReusable
            ? "This is a reusable instrument, so \"used on a patient\" does not apply — " +
              "it is sterilised and goes back in the drawer. Record breakages under " +
              "\"damaged\"."
            : "";
    }
}

/** Shows "50 → 47" under the form so the direction is never a guess. */
function updateAdjustPreview() {
    const preview = document.getElementById("adjust-preview");
    if (!preview) return;

    const current = Number(document.getElementById("adjust-item-current").value) || 0;
    // parseInt, matching submitStockAdjust exactly. When these differed, a
    // value like 1e3 previewed as 1000 and was recorded as 1.
    const amount = Math.abs(parseInt(document.getElementById("adjust-qty").value, 10) || 0);
    const reasonKey = document.getElementById("adjust-reason").value;

    // Counting is an absolute, not a movement, so it gets its own wording —
    // and zero is a valid answer, which the movement path below rejects.
    if (reasonKey === "counted") {
        const raw = document.getElementById("adjust-qty").value;
        if (raw === "" || raw === null) {
            preview.innerHTML = '<span class="muted">Enter what you counted.</span>';
            return;
        }
        preview.innerHTML = stockCountPreview(current, Math.max(0, parseInt(raw, 10) || 0));
        return;
    }

    const reason = STOCK_REASONS[reasonKey];

    if (!reason || !amount) {
        preview.innerHTML = `<span class="muted">Enter a quantity to see the new stock level.</span>`;
        return;
    }

    const after = current + (reason.sign * amount);
    const warn = after < 0
        ? ` <span class="adjust-preview__warn">— this leaves stock below zero, so the shelf count will need checking</span>`
        : "";

    if (reason.needsApproval) {
        preview.innerHTML = `Stock stays at <strong>${current}</strong> until Dr. Gapit approves. ` +
                            `Then it goes to <strong>${after}</strong>.${warn}`;
        return;
    }
    preview.innerHTML = `Stock goes from <strong>${current}</strong> to <strong>${after}</strong>.${warn}`;
}

function submitStockAdjust(e) {
    e.preventDefault();

    const itemId = document.getElementById("adjust-item-id").value;
    const amount = Math.abs(parseInt(document.getElementById("adjust-qty").value, 10));
    const reasonKey = document.getElementById("adjust-reason").value;
    const note = document.getElementById("adjust-note").value;
    const reason = STOCK_REASONS[reasonKey];

    if (!itemId) {
        flagField("adjust-reason", "Please choose what happened to this item.");
        return;
    }
    // Our own change to the supply: the open dialog is not told it changed elsewhere (R20).
    if (typeof noteOwnWrite === "function") noteOwnWrite("inventory/" + itemId);

    // Counting the shelf is not a movement — it is a statement about what is
    // there, and the variance is worked out from it. Handled before the
    // STOCK_REASONS lookup because "counted" deliberately is not one.
    if (reasonKey === "counted") {
        const raw = document.getElementById("adjust-qty").value;
        const counted = parseInt(raw, 10);
        if (raw === "" || isNaN(counted) || counted < 0) {
            flagField("adjust-qty", "Enter how many are actually on the shelf. Zero is a valid answer.");
            return;
        }
        submitStockCount(itemId, counted, note)
        .then(newQty => {
            closeModal("modal-adjust-stock");
            showToast("Count recorded. Stock is now " + newQty + ".", "success");
            loadStaffInventory();
        })
        .catch(err => {
            console.error("Error recording the count:", err);
            showToast(err.message || "Could not record that count.", "error");
        });
        return;
    }

    if (!reason) {
        flagField("adjust-reason", "Please choose what happened to this item.");
        return;
    }
    if (!amount || amount < 1) {
        flagField("adjust-qty", "Enter how many units to add or remove.");
        return;
    }

    // The dropdown hides this option for a reusable, but hiding an option in
    // the browser is a courtesy, not a rule. This is the rule.
    const itemType = document.getElementById("adjust-item-type").value;
    if (itemType === "reusable" && reasonKey === "use") {
        showToast("A reusable instrument is not used up by a treatment. " +
                  "Record a breakage under \"damaged\" instead.", "warning");
        return;
    }

    // A take-out goes to Dr. Gapit (2026-10-01). Nothing moves until she
    // approves it on her Stock Approvals tab; see js/stock-requests.js.
    if (reason.needsApproval) {
        const visitSel = document.getElementById("adjust-visit");
        const visitOpt = visitSel && reasonKey === "use" && visitSel.value
            ? visitSel.options[visitSel.selectedIndex] : null;
        const unitEl = document.getElementById("adjust-item-unit");
        const nameEl = document.getElementById("adjust-item-name");
        submitStockRequest({
            itemId: itemId,
            itemName: nameEl ? (nameEl.innerText || "") : "",
            unit: unitEl ? unitEl.value : "",
            itemType: itemType,
            qty: amount,
            reason: reasonKey,
            note: note,
            appointmentId: visitOpt ? visitOpt.value : "",
            patientName: visitOpt ? (visitOpt.dataset.patientName || "") : ""
        })
        .then(() => {
            closeModal("modal-adjust-stock");
            showToast(STOCK_REQUEST_SENT, "success");
            loadStaffInventory();
        })
        .catch(err => {
            console.error("Error filing the take-out request:", err);
            showToast(err && err.code === "stock-request" ? err.message : "Could not send that request. Nothing was changed.", "error");
        });
        return;
    }

    const changeQty = reason.sign * amount;
    const storedReason = reason.store || reasonKey;

    // ── What the delivery cost ────────────────────────────────────────────
    //
    // Only on a restock, because that is the only movement where money leaves
    // the clinic. Using stock does not cost anything at the moment it is used —
    // it was paid for when it arrived — and counting it twice is the classic
    // way to make a set of books disagree with a bank statement.
    //
    // Optional. A blank cost records the stock movement exactly as before, so
    // nobody is ever blocked from recording a delivery because they cannot find
    // the receipt.
    const extra = {};
    if (reasonKey === "restock") {
        const costEl = document.getElementById("adjust-cost");
        const raw = costEl ? String(costEl.value).trim() : "";
        if (raw !== "") {
            const total = Number(raw);
            if (!isFinite(total) || total < 0) {
                flagField("adjust-cost", "Enter what the delivery cost, or leave it blank.");
                return;
            }
            extra.totalCost = Math.round(total * 100) / 100;
            // Per unit as well, so a later delivery of a different size can be
            // compared with this one without re-deriving it every time.
            extra.unitCost = amount > 0 ? Math.round((total / amount) * 100) / 100 : 0;
        }
    }

    recordStockMovement(itemId, changeQty, storedReason, note, extra)
    .then(newQty => {
        closeModal("modal-adjust-stock");
        showToast(`Stock updated. New level: ${newQty}.`, "success");
        loadStaffInventory();
    })
    .catch(err => {
        console.error("Error recording stock movement:", err);
        showToast(err.message || "Could not update the stock level.", "error");
    });
}


// ─────────────────────────────────────────────────────────────
// Movement history
// ─────────────────────────────────────────────────────────────

function openStockHistory(itemId, itemName) {
    const body = document.getElementById("stock-history-body");
    document.getElementById("stock-history-item").innerText = itemName;
    body.innerHTML = `<p class="muted">Loading history…</p>`;
    openModal("modal-stock-history");

    // Filtered by item only, then sorted here. Adding orderBy() to the query
    // would need a composite index created in the Firebase console, and the
    // number of movements per item is small enough that sorting client-side
    // costs nothing.
    db.collection("inventory_movements").where("itemId", "==", itemId).get()
    .then(snapshot => {
        if (snapshot.empty) {
            body.innerHTML = `<p class="muted">No movements recorded for this item yet.
                Every adjustment from now on will be listed here.</p>`;
            return;
        }

        const rows = [];
        snapshot.forEach(doc => rows.push(doc.data()));
        rows.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

        body.innerHTML = `
            <ul class="movement-list">
                ${rows.map(renderMovementRow).join("")}
            </ul>
        `;
    })
    .catch(err => {
        console.error("Error loading stock history:", err);
        body.innerHTML = `<p class="muted">Could not load the history for this item.</p>`;
    });
}

function renderMovementRow(m) {
    const change = Number(m.changeQty) || 0;
    const isOut = change < 0;
    const when = m.createdAt
        ? new Date(m.createdAt).toLocaleString("en-PH", {
            year: "numeric", month: "short", day: "numeric",
            hour: "numeric", minute: "2-digit"
          })
        : "";

    return `
        <li class="movement">
            <span class="movement__change ${isOut ? "is-out" : "is-in"}">${change > 0 ? "+" : ""}${change}</span>
            <span class="movement__detail">
                <span class="movement__reason">${escapeHtml(stockReasonLabel(m.reason))}</span>
                ${m.note ? `<span class="movement__note">${escapeHtml(m.note)}</span>` : ""}
                <span class="movement__meta">${when}${m.performedByName ? " · " + escapeHtml(m.performedByName) : ""}</span>
            </span>
            <span class="movement__balance">${escapeHtml(m.balanceAfter)}</span>
        </li>
    `;
}


// ─────────────────────────────────────────────────────────────
// Add and remove items
// ─────────────────────────────────────────────────────────────

/**
 * Add supply item: the "does it expire?" question only for consumables, and
 * the date box only after Yes. Called on load, on a change of either, and
 * after the form is reset.
 */
function applyInventoryExpiryMode() {
    const type = document.getElementById("inv-type");
    const ask = document.getElementById("inv-expires-wrap");
    const dateWrap = document.getElementById("inv-expiry-wrap");
    if (!type || !ask || !dateWrap) return;
    const consumable = type.value === "consumable";
    const picked = document.querySelector('input[name="inv-expires"]:checked');
    const expires = consumable && !!picked && picked.value === "yes";
    ask.classList.toggle("hidden", !consumable);
    dateWrap.classList.toggle("hidden", !expires);
    if (!expires) {
        const date = document.getElementById("inv-expiry");
        if (date) {
            date.value = "";
            if (typeof clearFieldFlag === "function") clearFieldFlag(date);
        }
    }
}

if (typeof document !== "undefined" && document.addEventListener) {
    document.addEventListener("DOMContentLoaded", applyInventoryExpiryMode);
}

function submitNewInventory(e) {
    e.preventDefault();

    const itemName = document.getElementById("inv-name").value.trim();
    const quantity = parseInt(document.getElementById("inv-qty").value, 10) || 0;
    const unit = document.getElementById("inv-unit").value;
    const minStockLevel = parseInt(document.getElementById("inv-min").value, 10) || 0;
    const itemType = document.getElementById("inv-type").value;
    const expiryField = document.getElementById("inv-expiry");
    const expiresPick = document.querySelector('input[name="inv-expires"]:checked');
    const tracksExpiry = itemType === "consumable" && !!expiresPick && expiresPick.value === "yes";
    const expiryDate = tracksExpiry && expiryField ? expiryField.value : "";

    if (!itemName) {
        flagField("inv-name", "Please enter an item name.");
        return;
    }
    if (tracksExpiry && !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) {
        flagField("inv-expiry", "Enter the expiry date printed on the package.");
        return;
    }

    // Adding an item is two writes: the item, then its opening balance as a
    // movement. They cannot be one transaction, because the movement needs the
    // id the first write hands back.
    //
    // So the second can fail on its own, and the item is already saved. Saying
    // "could not add" there would be a lie that costs something: staff would
    // add it again, and the clinic would have the same supply listed twice.
    // This tracks which half succeeded and says so.
    let itemCreated = false;

    db.collection("inventory").add({
        itemName: itemName,
        quantity: 0,
        unit: unit,
        minStockLevel: minStockLevel,
        itemType: itemType,
        // Whether the item was said to expire, so the list offers the expiry
        // control only on items that can expire (inventoryExpiryHtml).
        tracksExpiry: tracksExpiry,
        ...(tracksExpiry ? { expiryDate } : {})
    })
    .then(docRef => {
        itemCreated = true;
        // The starting count is written as a movement rather than set directly,
        // so even the first number in the ledger has a reason attached.
        if (quantity > 0) {
            return recordStockMovement(docRef.id, quantity, "initial", "Opening balance when the item was added");
        }
    })
    .then(() => {
        showToast(`"${itemName}" added to supplies.`, "success");
        document.getElementById("form-add-inventory").reset();
        applyInventoryExpiryMode();
        loadStaffInventory();
    })
    .catch(err => {
        console.error("Failed to add inventory item:", err);

        if (itemCreated) {
            showToast(`"${itemName}" was added, but its opening count of ${quantity} ` +
                      `did not save. It is on the list at 0 — use "Adjust stock" to ` +
                      `set the count. Do not add the item again.`, "warning");
            // Show it, so the row on screen backs up what the message says.
            document.getElementById("form-add-inventory").reset();
            applyInventoryExpiryMode();
            loadStaffInventory();
        } else {
            showToast("Could not add the supply item.", "error");
        }
    });
}

async function deleteInventory(itemId, itemName) {
    const label = itemName ? `"${itemName}"` : "this item";
    if (!(await confirmDialog(`Remove ${label} from the supplies list? Its movement history is kept, so past usage stays on record.`,
        { title: "Remove supply item?", confirmLabel: "Remove", tone: "danger" }))) {
        return;
    }

    db.collection("inventory").doc(itemId).delete()
    .then(() => {
        showToast("Supply item removed.", "success");
        loadStaffInventory();
    })
    .catch(err => {
        console.error("Failed to delete item:", err);
        showToast("Could not remove the item.", "error");
    });
}


// ─────────────────────────────────────────────────────────────
// Counting the shelf
// ─────────────────────────────────────────────────────────────
//
// ── WHY THIS IS A SEPARATE THING FROM AN ADJUSTMENT ──────────────────────
//
// STOCK_REASONS already has correction_up and correction_dn, so a wrong count
// could always be fixed. The problem was the arithmetic: the form asked "found
// more — by how many?", which means the person holding the box has to work out
// the difference between what they can see and what the screen says, in their
// head, at the cupboard. That is exactly the friction that stops anyone doing a
// stock count at all, and a count nobody does is why the number drifts.
//
// So this asks the only question the person at the cupboard can actually
// answer — HOW MANY ARE THERE — and works out the variance itself.
//
// ── WHY THE VARIANCE IS RECORDED RATHER THAN SILENTLY APPLIED ────────────
//
// The movement stores the difference, with both numbers in its note. That
// history is the feedback loop: if every count on cotton rolls comes back
// short, the per-visit quantities are being under-recorded and can be tuned. A
// count that just overwrote the figure would fix today's number and teach
// nobody anything, and the same drift would be back next month.
//
// No stock count means the low-stock warning is only ever as good as the last
// guess. One means it is periodically re-anchored to the shelf, which is the
// only thing that makes it worth walking over for.

/** True when the adjust dialog is in counting mode rather than movement mode. */
function stockAdjustIsCount() {
    const sel = document.getElementById("adjust-reason");
    return !!sel && sel.value === "counted";
}

/**
 * Swap the form between "what happened" and "what is on the shelf".
 *
 * Counting asks for an absolute, everything else asks for a change, and the
 * label has to say which — a box labelled "How many units?" that silently means
 * "how many are there in total" is how a shelf of 40 becomes a shelf of 1.
 */
function applyStockCountMode() {
    const counting = stockAdjustIsCount();

    // The cost box belongs to a restock and nowhere else — see the note in
    // submitStockAdjust(). Hidden rather than disabled so it cannot be filled
    // in for a wastage and silently ignored.
    const costWrap = document.getElementById("adjust-cost-wrap");
    if (costWrap) {
        const sel = document.getElementById("adjust-reason");
        costWrap.hidden = !(sel && sel.value === "restock");
    }

    // A take-out is a request to Dr. Gapit (2026-10-01): say so, offer the
    // visit it was for when it was used on a patient, and name the button
    // for what it does.
    const reasonSel = document.getElementById("adjust-reason");
    const reasonDef = reasonSel ? STOCK_REASONS[reasonSel.value] : null;
    const needsApproval = !!(reasonDef && reasonDef.needsApproval);
    const approvalNote = document.getElementById("adjust-approval-note");
    if (approvalNote) approvalNote.hidden = !needsApproval;
    const visitWrap = document.getElementById("adjust-visit-wrap");
    if (visitWrap) visitWrap.hidden = !(reasonSel && reasonSel.value === "use");
    const submitBtn = document.getElementById("adjust-submit");
    if (submitBtn) submitBtn.textContent = needsApproval ? "Send for approval" : "Save adjustment";

    const label = document.getElementById("adjust-qty-label");
    const qty = document.getElementById("adjust-qty");
    const note = document.getElementById("adjust-note");

    if (label) {
        label.textContent = counting
            ? "How many are actually on the shelf?"
            : "How many units?";
    }
    if (qty) {
        // A count of zero is a real answer — the box is empty. A movement of
        // zero is not, so the floor moves with the mode.
        qty.min = counting ? "0" : "1";
        if (counting) qty.value = document.getElementById("adjust-item-current").value || 0;
    }
    if (note) {
        note.placeholder = counting
            ? "E.g. who counted, or anything that explains the difference"
            : "E.g. delivery receipt no., or which patient";
    }
    updateAdjustPreview();
}

/**
 * The preview line, in counting mode.
 *
 * Returns null when not counting, so updateAdjustPreview() can carry on with
 * its own wording for ordinary movements.
 */
function stockCountPreview(current, counted) {
    const diff = counted - current;
    if (diff === 0) {
        return "The system already says <strong>" + current + "</strong>. " +
               "Nothing to correct — but the count is still worth recording.";
    }
    const direction = diff > 0 ? "more" : "fewer";
    return "The shelf has <strong>" + Math.abs(diff) + "</strong> " + direction +
           " than the system thought. Stock goes from <strong>" + current +
           "</strong> to <strong>" + counted + "</strong>.";
}

/**
 * Record a physical count.
 *
 * Writes the VARIANCE as an ordinary correction movement, so a count sits in
 * the item's history beside every other change rather than in a parallel log
 * nobody reads. The note carries both numbers, which is what makes the history
 * usable for tuning later.
 */
function submitStockCount(itemId, counted, noteText) {
    const itemRef = db.collection("inventory").doc(itemId);
    const movementRef = db.collection("inventory_movements").doc();

    // ── A COUNT IS AN ABSOLUTE, AND HAS TO BE WRITTEN AS ONE ──────────────
    //
    // This used to read the quantity out of a hidden field that
    // openStockAdjust() filled in when the dialog was opened, work out
    // "counted minus that", and hand the difference to recordStockMovement()
    // as a RELATIVE change. Two things were wrong with it, and the second is
    // the serious one.
    //
    // The first is the obvious race: the dialog can sit open while a visit
    // deducts stock or a delivery is logged, and the number captured at open
    // time goes stale.
    //
    // The second is that the relative write then does the wrong thing about
    // it. recordStockMovement() reads the LIVE quantity inside its transaction
    // and computes live + diff. So counting a shelf of 40 against a stale 40,
    // after 5 were used elsewhere, produced 35 + 0 = 35 — the count silently
    // did not set the shelf to what the person was holding in their hands. In
    // the one feature whose entire job is re-anchoring the number to reality.
    //
    // So the transaction is written here rather than reused: it reads the live
    // quantity, writes the counted value ITSELF, and records the variance it
    // actually found. The person at the cupboard is the authority — whatever
    // the system thought a moment ago, there are now this many on the shelf.
    return db.runTransaction(tx => {
        return tx.get(itemRef).then(snap => {
            if (!snap.exists) {
                throw new Error("That supply item no longer exists.");
            }

            const before = Number(snap.data().quantity) || 0;
            const diff = counted - before;

            const note = "Counted " + counted + ", system said " + before +
                         (diff === 0 ? " — agreed"
                                     : (diff > 0 ? " — found " + diff + " more"
                                                 : " — found " + Math.abs(diff) + " fewer")) +
                         (noteText ? ". " + noteText : "");

            // The counted figure, not before + diff. Same number, but written
            // as the statement it is.
            tx.update(itemRef, { quantity: counted });

            // A count that agrees is still written. "We checked and it was
            // right" is what tells you the per-visit quantities are working;
            // without it the history only ever shows the times something was
            // wrong, and there is no way to tell a trustworthy number from one
            // nobody has looked at.
            tx.set(movementRef, {
                itemId: itemId,
                itemName: snap.data().itemName || "",
                changeQty: diff,
                balanceAfter: counted,
                reason: "correction",
                note: note,
                performedBy: currentUserId || "",
                performedByName: currentUser || "",
                createdAt: new Date().toISOString(),
                // Local date (see localDateKey in js/app.js), not UTC: before 8 a.m. the
                // UTC date is yesterday, which moved early deliveries into the
                // wrong day, and on the 1st into the wrong month's books.
                movementDate: (typeof localDateKey === "function" ? localDateKey() : new Date().toISOString().slice(0, 10))
            });

            return counted;
        });
    });
}
