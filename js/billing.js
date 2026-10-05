// ─────────────────────────────────────────────────────────────
// DentCare – js/billing.js (Charges, Payments & the Clinic Ledger)
// ─────────────────────────────────────────────────────────────
//
// This is a management information system. It RECORDS money taken at the front
// desk. It does not process transactions and it is not connected to InstaPay,
// BDO, any bank API or any payment gateway. Every amount in here got there
// because a member of staff typed it in after the money was in hand.
//
// "InstaPay" on a payment record means a staff member watched the transfer
// land in the clinic's own account and typed the reference number in.
//
// How money moves:
//
//     dentist logs the work  →  bill raised automatically  →  staff take payment
//
// The dentist picks the operation and the materials used. The system prices the
// operation from the staff-managed list; the dentist is never shown, and never
// sets, an amount. Materials carry no price at all — the procedure's price
// already covers them, so charging for them again would bill the patient twice.
//
// Booking an appointment raises nothing. A booking is a request, not work done.
//
// ─────────────────────────────────────────────────────────────

let allStaffInvoices = [];

/**
 * Methods the front desk can actually be handed money by.
 *
 * CONFIRMED by Dr. Gapit 2026-08-29: cash, InstaPay and BDO only. GCash, card
 * and generic "Bank Transfer" were placeholders and are gone.
 *
 * HMO is NOT a payment method since 2026-10-05 (Task 25). The front desk
 * receives nothing from an HMO: staff note which HMO covers a visit and how
 * much ("Charge to HMO" on the bill), and Dr. Gapit collects it herself. See
 * the HMO section further down.
 *
 * ── THESE THREE LISTS MUST MATCH ──────────────────────────────────────────
 *   - PAYMENT_METHODS here
 *   - the <select> in templates/partials/modals-billing.php
 *   - $payment_methods in templates/partials/clinic-data.php (public site)
 * The dropdown's value is written verbatim onto the payments document, so a
 * method offered in one place and missing from another produces a receipt
 * naming a rail the clinic does not have. tools/check-billing.js compares them.
 */
const PAYMENT_METHODS = ["Cash", "InstaPay", "BDO"];

/**
 * The HMOs offered in the "Charge to HMO" box, plus "Other" with a typed name.
 *
 * Mirrors $hmo_providers in templates/partials/clinic-data.php. The owner,
 * 2026-10-05: MediCard, and one more whose name is not known yet, which staff
 * type under Other until Dr. Gapit confirms it (PLAN Task 25, item 30).
 */
const HMO_PROVIDERS = ["MediCard"];


// ─────────────────────────────────────────────────────────────
// Money arithmetic
// ─────────────────────────────────────────────────────────────

/**
 * Round to centavos.
 *
 * A balance is added to and subtracted from every time a payment comes in, and
 * plain floating point drifts as it goes. Without rounding at each step a bill
 * settles at ₱0.0000000001 and never reads as Paid.
 */
function money(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
}

function peso(n) {
    return "₱" + money(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Delegates to localDateKey() in js/app.js so there is ONE implementation of
// "what day is it here" rather than two that can drift. This one was already
// correct (local, not UTC); the rest of the app was not, and now shares this.
function todayISO() {
    return localDateKey();
}

// Kept as a name because the billing screens read better with it, but the
// escaping itself lives in js/app.js so there is only one copy to get right.
function escapeBill(str) {
    return escapeHtml(str);
}

/** Only staff and admin go near the money screens. */
/**
 * May this account SEE the clinic's money?
 *
 * Deliberately wider than canHandleBilling(), which is about who may MOVE it.
 * The doctor keeps the books and holds the cash; the front desk receives it and
 * records the receipt. Two different permissions, and only the second is
 * narrow.
 */
function canReadClinicFinances() {
    return currentRole === "staff" || currentRole === "admin" ||
           currentRole === "dentist";
}

function canHandleBilling() {
    return currentRole === "staff" || currentRole === "admin";
}


// ─────────────────────────────────────────────────────────────
// Raising a bill
// ─────────────────────────────────────────────────────────────

/**
 * Raise the bill for a treatment the dentist has just recorded.
 *
 * Called from both places a treatment can be logged — the treatment log form
 * and the complete-appointment dialog. Having one function for both is the
 * point: the direct-log path used to create no bill at all, so work recorded
 * that way was never charged for and staff never saw it.
 *
 * The amount is copied from the price list at this moment rather than looked up
 * later, so changing a price next month does not silently rewrite what this
 * patient was charged today.
 *
 * Materials are written onto the bill as ₱0 lines. They appear on the itemised
 * bill so staff can see what was used, and they add nothing to the total.
 *
 * Failure here is logged and swallowed. The clinical record is already saved by
 * the time this runs, and losing a diagnosis because a price lookup failed
 * would be far worse than a bill staff have to raise by hand.
 *
 * @returns {Promise<string|null>} the new bill id, or null if none was raised
 */
function createBillForTreatment(t) {
    if (!t || !t.patientId) return Promise.resolve(null);

    const lookup = t.treatmentId
        ? db.collection("treatments").doc(t.treatmentId).get().catch(() => null)
        : Promise.resolve(null);

    return lookup.then(doc => {
        // A treatment that is not on the price list cannot be billed. Creating
        // a ₱0 bill and saying nothing would hide the problem: the work would
        // look charged for, the patient would owe nothing, and nobody would
        // find out until the books were reconciled. Better to refuse and say so
        // — staff can add the treatment to the list and raise it by hand.
        //
        // firestore.rules refuses this too, by checking the total against the
        // price list. This is the readable half of the same rule.
        if (!doc || !doc.exists || typeof doc.data().price !== "number") {
            const name = t.treatmentName || "this treatment";
            console.error("No price on the list for " + name + " — no bill raised.");
            if (typeof showToast === "function") {
                showToast('"' + name + '" has no price on the list, so no bill was raised. ' +
                          "Ask the front desk to add it.", "warning");
            }
            return null;
        }

        const treatment = doc.data();
        const operationName = treatment.treatmentName || t.treatmentName || "Treatment";
        const operationPrice = money(treatment.price);

        const lineItems = [{
            kind: "operation",
            name: operationName,
            toothNumber: t.toothNumber || "",
            amount: operationPrice
        }];

        // Recorded, not charged — see the note at the top of this file.
        (t.materialsUsed || []).forEach(name => {
            lineItems.push({ kind: "material", name: name, toothNumber: "", amount: 0 });
        });

        const totalAmount = money(lineItems.reduce((sum, li) => sum + money(li.amount), 0));

        return db.collection("billing").add({
            recordId: t.recordId || null,
            // Named so firestore.rules can check totalAmount against the list.
            treatmentId: t.treatmentId,
            appointmentId: t.appointmentId || null,
            patientId: t.patientId,
            patientName: t.patientName || "",
            treatmentName: operationName,
            lineItems: lineItems,
            totalAmount: totalAmount,
            amountPaid: 0,
            balance: totalAmount,
            paymentStatus: "Unpaid",
            billingDate: t.recordDate || todayISO(),
            createdAt: new Date().toISOString(),
            // Required by chargeIsSane() in firestore.rules — every bill must
            // name the account that set its amount. This path still prices
            // from the treatment list rather than a typed figure, so
            // chargeIsManual is false, but it is recorded either way so the
            // two creation paths produce the same shape.
            chargeSetBy: currentUserId,
            chargeIsManual: false
        });
    })
    .then(ref => ref ? ref.id : null)
    .catch(err => {
        console.error("Could not raise a bill for this treatment:", err);
        return null;
    });
}


// ─────────────────────────────────────────────────────────────
// The staff ledger
// ─────────────────────────────────────────────────────────────

// ── How much of the ledger to load ──────────────────────────────────────────
//
// This tab used to read the ENTIRE billing collection on every open. One
// document is written per completed visit and none are ever deleted, so the
// cost of opening Billing grew every month the clinic stayed in business. At
// roughly fifteen patients a day that is about 375 new bills a month; three
// years in, the front desk was downloading thirteen thousand documents to look
// at the four people who had not paid yet.
//
// Deleting old bills would fix the symptom and cause a worse problem. The
// year-end export reads this collection and `payments` directly, so a monthly
// purge would delete the clinic's own books, and BIR requires books of account
// to be kept for ten years. Firestore does not slow down because a collection
// is large; it slows down because you asked for all of it. So the fix is in
// the reading.
const BILLING_WINDOW_DAYS = 60;

/** Set by showAllBillingHistory() when somebody genuinely needs the lot. */
let billingWindowDisabled = false;

/**
 * The bills the front desk actually needs, as an array of documents.
 *
 * Two queries rather than one, because what matters is the union of:
 *
 *   everything still owed, at ANY age    the whole point of the tab is
 *                                        chasing these, and a bill from
 *                                        eight months ago is exactly the one
 *                                        most likely to be forgotten
 *   everything recent, at any status     so a payment taken this morning can
 *                                        be found and reprinted
 *
 * Each is a single-field query, which Firestore's automatic indexes already
 * cover. A combined query would need a composite index created by hand in the
 * console, and a missing index fails at runtime with an error nobody at the
 * front desk can act on.
 */
function billingInWindow() {
    if (billingWindowDisabled) {
        return db.collection("billing").get().then(snap => snap.docs);
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - BILLING_WINDOW_DAYS);

    return Promise.all([
        // "Partial" is included because it is the OLD spelling of "Partially
        // Paid", still mapped in the badge code below. Leaving it out would
        // have quietly hidden any part-paid bill written before the rename —
        // and a bill that vanishes from the chase list is money the clinic
        // never collects, with nothing on screen to suggest anything is wrong.
        db.collection("billing")
          .where("paymentStatus", "in", ["Unpaid", "Partially Paid", "Partial"]).get(),
        db.collection("billing")
          .where("billingDate", ">=", localDateKey(cutoff)).get(),
        // An HMO part not yet collected is still money owed to the clinic,
        // even when the patient owes nothing (Task 25).
        db.collection("billing").where("hmoStatus", "==", "Charged").get()
    ]).then(snaps => {
        // Keyed by document id, so a bill that is both recent AND unpaid
        // appears once rather than twice in the ledger.
        const byId = {};
        snaps.forEach(snap => snap.docs.forEach(d => { byId[d.id] = d; }));
        return Object.keys(byId).map(k => byId[k]);
    });
}

/**
 * The same window as billingInWindow(), live (2026-10-02, R20): onDocs(docs)
 * whenever either query changes, once both have arrived. A bill Dr. Gapit
 * raises, or a payment taken on another screen, shows without a refresh.
 */
function watchBillingInWindow(onDocs, onError) {
    if (billingWindowDisabled) {
        unwatchLive("tab-staff-billing:owed");
        unwatchLive("tab-staff-billing:recent");
        unwatchLive("tab-staff-billing:hmo");
        watchLive("tab-staff-billing:all", db.collection("billing"), snap => onDocs(snap.docs), onError);
        return;
    }
    unwatchLive("tab-staff-billing:all");

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - BILLING_WINDOW_DAYS);
    const state = { owed: null, recent: null, hmo: null };
    const fire = () => {
        if (!state.owed || !state.recent || !state.hmo) return;
        // Keyed by document id, so a bill that is both recent AND unpaid
        // appears once rather than twice in the ledger.
        const byId = {};
        state.owed.forEach(d => { byId[d.id] = d; });
        state.recent.forEach(d => { byId[d.id] = d; });
        state.hmo.forEach(d => { byId[d.id] = d; });
        onDocs(Object.keys(byId).map(k => byId[k]));
    };
    // "Partial" is the OLD spelling of "Partially Paid"; see billingInWindow().
    watchLive("tab-staff-billing:owed", db.collection("billing")
        .where("paymentStatus", "in", ["Unpaid", "Partially Paid", "Partial"]),
        snap => { state.owed = snap.docs; fire(); }, onError);
    watchLive("tab-staff-billing:recent", db.collection("billing")
        .where("billingDate", ">=", localDateKey(cutoff)),
        snap => { state.recent = snap.docs; fire(); }, onError);
    // HMO parts not yet collected, whatever their age (Task 25).
    watchLive("tab-staff-billing:hmo", db.collection("billing").where("hmoStatus", "==", "Charged"),
        snap => { state.hmo = snap.docs; fire(); }, onError);
}

/** Load the whole ledger, for a reconciliation that needs every row. */
function showAllBillingHistory() {
    billingWindowDisabled = true;
    showToast("Loading every bill on record. This may take a moment.", "info");
    loadStaffBilling();
}

/**
 * Say what is on screen, and offer the rest.
 *
 * A settled bill from last year being absent is indistinguishable from it
 * having been lost, and somebody who thinks the clinic's records are
 * disappearing will not keep using the system. So the tab states its own scope
 * rather than leaving the gap to be discovered.
 */
function renderBillingScope(shown) {
    const el = document.getElementById("billing-scope");
    if (!el) return;

    if (billingWindowDisabled) {
        el.innerText = "Showing every bill on record (" + shown + ").";
        return;
    }

    el.innerHTML =
        "Showing <strong>" + shown + "</strong> bills: everything still owed, " +
        "plus anything from the last " + BILLING_WINDOW_DAYS + " days. Older " +
        "settled bills are kept and appear in the year-end export. " +
        '<button type="button" class="btn-link" onclick="showAllBillingHistory()">' +
        "Load every bill</button>";
}

function loadStaffBilling() {
    if (!canHandleBilling()) return;

    // Live since 2026-10-02 (R20). Never leave the ledger looking empty: an
    // unread ledger is not a ledger with nothing owed.
    const failed = err => {
        console.error("Error loading the billing ledger:", err);
        renderTableLoadError("staff-billing-table", 8, "the bills", "loadStaffBilling");
    };
    watchBillingInWindow(billSnap => {
        // An open bill or payment form is not redrawn; it is told if its bill
        // changed on another screen (checkDialogRecords in js/app.js).
        if (typeof checkDialogRecords === "function") checkDialogRecords("billing", billSnap);
        // Only the patients these bills name — see getPatientsByIds() in
        // js/app.js. A bill already carries patientName, so this is only the
        // fallback for one that does not.
        const ids = [];
        billSnap.forEach(doc => ids.push(doc.data().patientId));
        getPatientsByIds(ids)
            .then(patients => drawStaffBilling(billSnap, patients))
            .catch(failed);
    }, failed);
}

/** The ledger, from the bills in the window. */
function drawStaffBilling(billSnap, patients) {

    allStaffInvoices = [];
    billSnap.forEach(doc => {
        const b = doc.data();
        const p = patients[b.patientId] || {};
        const f = billFigures(b);

        allStaffInvoices.push({
            invoice_id: doc.id,
            patientName: b.patientName || ((p.firstName || "") + " " + (p.lastName || "")).trim(),
            treatment_name: b.treatmentName,
            lineItems: b.lineItems || [],
            billingDate: b.billingDate || (b.createdAt || "").slice(0, 10),
            createdAt: b.createdAt || "",
            total_amount: f.charged,
            discount: f.discount,
            additional_fees: f.fees,
            due_amount: f.due,
            amount_paid: f.paid,
            hmo_amount: f.hmo,
            hmo_provider: b.hmoProvider || "",
            hmo_status: f.hmo > 0 ? (b.hmoStatus || "Charged") : "",
            balance: f.balance,
            balance_mismatch: f.balanceMismatch,
            amounts_invalid: f.amountsInvalid,
            payment_status: f.balanceMismatch ? "Needs review" : (b.paymentStatus || "Unpaid")
        });
    });

    renderBillingScope(allStaffInvoices.length);
    renderStaffBillingTable();
    loadFinancialSummary();
}

function filterBillingTable() { renderStaffBillingTable(); }

// ── Today first (client revision 8, 2026-09-30) ─────────────────────────────
//
// The clinic wants to see at once who was billed today. The Period select
// narrows the bills already loaded by loadStaffBilling(); it reads nothing
// new, so a period can never show more than the ledger's own scope line says
// is on screen.

/** The earliest billing date a period covers, as YYYY-MM-DD ("" for all). */
function billingPeriodStart(period, today) {
    if (period === "today") return today;
    if (period === "month") return today.slice(0, 7) + "-01";
    if (period === "week") {
        const from = new Date(today + "T00:00:00");
        from.setDate(from.getDate() - 6);
        return localDateKey(from);
    }
    return "";
}

/** A bill somebody still owes money on, by any spelling of the status. */
function billStillOwed(inv) {
    return inv.balance > 0;
}

/**
 * The line above the table: what was billed today and, while the table shows
 * only today, how many earlier bills still carry a balance. Those are the
 * bills most likely to be forgotten behind a Today filter.
 */
function renderBillingToday(period) {
    const el = document.getElementById("billing-today");
    if (!el) return;

    const today = localDateKey();
    const todays = allStaffInvoices.filter(inv => inv.billingDate === today);
    const needsReview = todays.some(inv => inv.amounts_invalid);
    const billed = todays.reduce((sum, inv) => sum + money(inv.due_amount), 0);

    let html = "Today: " + todays.length + (todays.length === 1 ? " bill" : " bills") +
               ", " + (needsReview ? "amount needs review" : peso(billed) + " due after adjustments");

    const earlier = allStaffInvoices.filter(inv => (inv.billingDate || "") < today && billStillOwed(inv)).length;
    if (period === "today" && earlier > 0) {
        html += ' <span class="billing-today__earlier">' + earlier +
                (earlier === 1 ? " earlier bill still has a balance." : " earlier bills still have a balance.") +
                ' <button type="button" class="btn-link" onclick="showEarlierUnpaidBills()">Show them</button></span>';
    }
    el.innerHTML = html;
}

/** "Show them": every loaded bill, narrowed to the unpaid ones. */
function showEarlierUnpaidBills() {
    const period = document.getElementById("billing-period-filter");
    const status = document.getElementById("billing-status-filter");
    if (period) period.value = "all";
    if (status) status.value = "Unpaid";
    renderStaffBillingTable();
}

function renderStaffBillingTable() {
    const tbody = document.getElementById("staff-billing-table");
    if (!tbody) return;

    const period = (document.getElementById("billing-period-filter") || {}).value || "today";
    const status = (document.getElementById("billing-status-filter") || {}).value || "all";
    const query = ((document.getElementById("billing-search") || {}).value || "").trim().toLowerCase();

    renderBillingToday(period);

    const today = localDateKey();
    const from = billingPeriodStart(period, today);

    let rows = allStaffInvoices;
    if (period === "today") rows = rows.filter(r => r.billingDate === today);
    else if (from) rows = rows.filter(r => (r.billingDate || "") >= from);
    if (status === "Unpaid") rows = rows.filter(r => r.balance > 0);
    else if (status === "HMO") rows = rows.filter(r => r.hmo_status === "Charged");
    else if (status !== "all") rows = rows.filter(r => r.payment_status === status);
    if (query) rows = rows.filter(r => (r.patientName || "").toLowerCase().includes(query));

    // Newest first: by the day billed, then by when the bill was raised.
    rows = rows.slice().sort((a, b) =>
        (b.billingDate || "").localeCompare(a.billingDate || "") ||
        String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

    if (rows.length === 0) {
        const nothingToday = period === "today" && status === "all" && !query;
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">' +
            (nothingToday ? "No bills for today." : "No bills match.") + "</td></tr>";
        return;
    }

        // "Partial" was the old wording; both are mapped so bills written before
    // the rename still show a badge instead of falling through to grey.
    const badge = {
        "Paid": "badge-completed",
        "Partially Paid": "badge-pending",
        "Partial": "badge-pending",
        "Unpaid": "badge-rejected",
        "Needs review": "badge-rejected"
    };

    tbody.innerHTML = "";
    rows.forEach(inv => {
        const tr = document.createElement("tr");
        tr.innerHTML =
            "<td>#" + escapeBill(inv.invoice_id.substring(0, 6).toUpperCase()) + "</td>" +
            "<td><strong>" + escapeBill(inv.patientName) + "</strong></td>" +
            "<td>" + escapeBill(inv.treatment_name) + "</td>" +
            "<td>" + escapeBill(inv.billingDate) + "</td>" +
            "<td class='num'>" + (inv.amounts_invalid ? "—" : peso(inv.due_amount)) + "</td>" +
            "<td class='num'>" + (inv.amounts_invalid ? "—" : peso(inv.amount_paid)) + "</td>" +
            '<td class="billing-state">' +
                '<span class="badge ' + (badge[inv.payment_status] || "badge-cancelled") + '">' +
                    escapeBill(inv.payment_status) + "</span>" +
                (inv.balance > 0 ? '<span class="billing-balance">' + peso(inv.balance) + ' left</span>' : '') +
                (inv.hmo_status ? '<span class="billing-balance">' + peso(inv.hmo_amount) +
                    (inv.hmo_status === "Collected" ? " HMO collected" : " charged to HMO") + '</span>' : '') +
            "</td>" +
            '<td class="billing-actions">' +
                '<button type="button" class="record-action record-action--accent" onclick="openBill(\'' + escapeJsAttr(inv.invoice_id) + '\')"><svg class="icon" aria-hidden="true"><use href="#ic-arrow-right"></use></svg><span>Open</span></button>' +
            "</td>";
        tbody.appendChild(tr);
    });
}


// ─────────────────────────────────────────────────────────────
// One bill: what was done, and what has been paid against it
// ─────────────────────────────────────────────────────────────

let openBillId = null;

/** The receipts listed on the open bill, by id, so a void can find its row. */
let openBillPayments = {};

/** What the open bill's receipts add up to, voids left out (openBill). */
let openBillReceiptsPaid = 0;

/** What has been paid on the bill in the payment form (openPaymentForm). */
let paymentFormAlreadyPaid = 0;

/** The HMO part on the bill in the payment form: not the patient's to pay. */
let paymentFormHmo = 0;

/**
 * What has been paid on a bill.
 *
 * Bills raised before 2026-08-21 carry no amountPaid, only a total and a
 * status (found live on 2026-09-25, bill #PMYCDO). For those it is what the
 * receipts on record add up to, or the whole amount if the old system already
 * marked the bill Paid, so an old settled bill cannot be paid twice.
 * firestore.rules (isPaymentSettlement) makes the same allowance, and the
 * first payment writes amountPaid, which repairs the bill.
 */
function storedAmountPaid(b, receiptsTotal) {
    if (typeof b.amountPaid === "number" && isFinite(b.amountPaid)) return money(b.amountPaid);
    if (b.paymentStatus === "Paid") return billDue(b);
    return money(receiptsTotal || 0);
}

function openBill(invoiceId) {
    if (!canHandleBilling()) return;

    openBillId = invoiceId;
    const body = document.getElementById("bill-detail-body");
    body.innerHTML = '<p class="picker-empty">Loading…</p>';
    openModal("modal-bill-detail");

    Promise.all([
        db.collection("billing").doc(invoiceId).get(),
        db.collection("payments").where("billingId", "==", invoiceId).get(),
        // ── Voids are read separately, and a refusal does not sink the bill ──
        // Found 2026-09-15: staff could not open ANY bill. The live Firebase
        // rules predate payment_voids, so this one query was refused, and inside
        // a single Promise.all that refusal failed the bill, its receipts and
        // the payment button with it. A missing void list now costs only the
        // Void buttons, with a note saying why; the bill still opens and can
        // still take a payment.
        db.collection("payment_voids").where("billingId", "==", invoiceId).get()
            .catch(err => {
                console.warn("Voids could not be read for this bill:", err);
                return null;
            })
    ])
    .then(([billDoc, paySnap, voidSnap]) => {
        if (!billDoc.exists) { body.innerHTML = '<p class="picker-empty">That bill no longer exists.</p>'; return; }
        const b = billDoc.data();
        if (typeof watchDialogRecord === "function") watchDialogRecord("modal-bill-detail", "billing/" + invoiceId, b);

        const voidsReadable = voidSnap !== null;
        const voids = {};
        if (voidSnap) voidSnap.forEach(d => { voids[d.id] = d.data(); });

        const payments = [];
        paySnap.forEach(d => payments.push({ payment_id: d.id, voided: voids[d.id] || null, ...d.data() }));
        payments.sort((x, y) => (y.paymentDate || "").localeCompare(x.paymentDate || ""));
        openBillPayments = {};
        payments.forEach(p => { openBillPayments[p.payment_id] = p; });

        const f = billFigures(b,
            voidsReadable ? payments : null,
            Object.keys(voids).map(id => ({ id })));
        if (f.amountsInvalid) {
            body.innerHTML = '<p class="bill-voids-off">Account needs review: this bill has a missing ' +
                'or invalid charge, adjustment or paid amount. No totals are shown. ' +
                'Check the stored bill and receipts before taking another payment.</p>';
            const payBtn = document.getElementById("btn-open-payment");
            if (payBtn) payBtn.classList.add("hidden");
            return;
        }
        const total = f.charged;
        const extra = f.fees;
        const discount = f.discount;
        const due = f.due;
        // If voids cannot be read, the receipt list cannot safely be summed.
        // The bill was corrected in the same transaction as each void.
        const paid = f.paid;
        const hmo = f.hmo;
        const balance  = money(due - paid - hmo);
        openBillReceiptsPaid = paid;
        const receiptsMismatch = f.receiptsMismatch;

        document.getElementById("bill-detail-title").innerText =
            "Bill #" + invoiceId.substring(0, 6).toUpperCase();

        const lines = (b.lineItems && b.lineItems.length)
            ? b.lineItems
            : [{ kind: "operation", name: b.treatmentName, toothNumber: "", amount: total }];

        body.innerHTML =
            '<div class="summary-strip"><strong>' + escapeBill(b.patientName) + "</strong><br>" +
                escapeBill(b.billingDate) + "</div>" +

            '<h4 class="bill-section">What was done</h4>' +
            '<table class="bill-table"><thead><tr>' +
                "<th>Tooth</th><th>Treatment / Operation</th><th class=\"num\">Charge</th>" +
            "</tr></thead><tbody>" +
            lines.map(li =>
                "<tr>" +
                    "<td>" + escapeBill(li.toothNumber || "—") + "</td>" +
                    "<td>" + escapeBill(li.name) +
                        (li.kind === "material"
                            ? ' <span class="line-note">used in the chair — included in the procedure price</span>'
                            : li.kind === "supply"
                            ? ' <span class="line-note">taken from stock — included in the procedure price</span>'
                            : "") +
                    "</td>" +
                    '<td class="num">' + (li.kind === "material" ? "—" : peso(li.amount)) + "</td>" +
                "</tr>").join("") +
            "</tbody></table>" +

            '<dl class="bill-totals">' +
                "<div><dt>Treatment</dt><dd>" + peso(total) + "</dd></div>" +
                (extra > 0 ? "<div><dt>Additional fee</dt><dd>+ " + peso(extra) + "</dd></div>" : "") +
                (discount > 0 ? "<div><dt>Discount</dt><dd>&minus; " + peso(discount) + "</dd></div>" : "") +
                '<div class="bill-totals__grand"><dt>Amount due</dt><dd>' + peso(due) + "</dd></div>" +
                "<div><dt>Paid</dt><dd>" + peso(paid) + "</dd></div>" +
                (hmo > 0 ? "<div><dt>HMO (" + escapeBill(b.hmoProvider) + ")</dt><dd>&minus;&nbsp;" + peso(hmo) + "</dd></div>" : "") +
                '<div class="bill-totals__grand"><dt>Balance</dt><dd>' + peso(balance) + "</dd></div>" +
            "</dl>" +
            (hmo > 0
                ? '<p class="line-note">' + (b.hmoStatus === "Collected"
                    ? "HMO part collected by " + escapeBill(b.hmoCollectedByName || "Dr. Gapit") +
                      " on " + escapeBill(b.hmoCollectedDate || "") + "."
                    : "Charged to HMO: Dr. Gapit collects it from the HMO.") +
                  (b.hmoNote ? " Note: " + escapeBill(b.hmoNote) : "") + "</p>"
                : "") +
            ((f.balanceMismatch || receiptsMismatch)
                ? '<p class="bill-voids-off">Account needs review: the saved balance or paid amount ' +
                  'disagrees with the calculated bill or its receipts. Check this bill before recording more money.</p>'
                : "") +

            '<h4 class="bill-section">Payments received</h4>' +
            (payments.length === 0
                ? '<p class="picker-empty">Nothing received against this bill yet.</p>'
                : '<table class="bill-table bill-payments"><thead><tr>' +
                    "<th>Date</th><th>Method</th><th>Reference</th><th>Received by</th><th class=\"num\">Amount</th><th></th>" +
                  "</tr></thead><tbody>" +
                  payments.map(p =>
                    '<tr' + (p.voided ? ' class="is-voided"' : '') + '>' +
                        "<td>" + escapeBill(p.paymentDate) + "</td>" +
                        "<td>" + escapeBill(p.paymentMethod) + "</td>" +
                        "<td>" + escapeBill(p.referenceNumber || "—") + "</td>" +
                        "<td>" + escapeBill(p.receivedByName || "—") + "</td>" +
                        '<td class="num">' + (p.voided ? "<s>" + peso(p.amountPaid) + "</s>" : peso(p.amountPaid)) +
                            (!p.voided && money(p.changeGiven) > 0
                                ? '<div class="line-note">' + peso(p.amountTendered) +
                                  " given, " + peso(p.changeGiven) + " change</div>"
                                : "") +
                        "</td>" +
                        '<td class="bill-pay-actions"><div class="bill-pay-actions__controls">' +
                            // Reprint any receipt, any time (owner, 2026-09-25):
                            // it used to open only once, straight after payment.
                            // A voided one prints with its VOID line.
                            '<button type="button" class="btn-secondary btn-sm" ' +
                                'onclick="reprintReceipt(\'' + escapeJsAttr(p.payment_id) + '\')">' +
                                '<svg class="icon" aria-hidden="true"><use href="#ic-file"></use></svg> Print receipt</button>' +
                            (p.voided
                                ? '<span class="badge badge-cancelled">Void</span></div>' +
                                  '<div class="line-note">' + escapeBill(p.voided.reason) +
                                      (p.voided.reasonNote ? ": " + escapeBill(p.voided.reasonNote) : "") +
                                      " · " + escapeBill(p.voided.voidedByName || "—") + "</div>"
                                : voidsReadable
                                ? '<button type="button" class="btn-danger btn-sm" ' +
                                      'onclick="openVoidPayment(\'' + escapeJsAttr(p.payment_id) + '\')">Void</button></div>'
                                : '</div>') +
                        "</td>" +
                    "</tr>").join("") +
                  "</tbody></table>") +

            // Said once, under the receipts, rather than a disabled button on
            // every row that explains nothing.
            (!voidsReadable && payments.length
                ? '<p class="bill-voids-off">Voiding a receipt is not available yet. It turns on ' +
                  'once the clinic&rsquo;s updated security rules are published. Until then, a ' +
                  'receipt that was already voided may still show here as paid.</p>'
                : "") +

            // What the visit used, learned per treatment (2026-10-05).
            '<h4 class="bill-section">Supplies used</h4><div id="bill-supplies"><p class="picker-empty">Loading…</p></div>';
        loadBillSupplies(invoiceId, b);

        const payBtn = document.getElementById("btn-open-payment");
        if (payBtn) payBtn.classList.toggle("hidden", balance <= 0 || receiptsMismatch);
        // Charge to HMO, or correct the HMO part, until Dr. Gapit collects it.
        const hmoBtn = document.getElementById("btn-open-hmo");
        if (hmoBtn) hmoBtn.classList.toggle("hidden",
            receiptsMismatch || b.hmoStatus === "Collected" || (balance <= 0 && hmo <= 0));
    })
    .catch(err => {
        console.error("Error loading the bill:", err);
        body.innerHTML = '<p class="picker-empty">Could not load this bill.</p>';
    });
}


// ─────────────────────────────────────────────────────────────
// Settling a bill at the counter
// ─────────────────────────────────────────────────────────────
//
// The money owed is worked out here, not stored as a single number:
//
//     due     = totalAmount + additionalFees − discount
//     balance = due − everything already paid
//
// Discount and additional fee sit on the bill rather than on one payment, so
// they still hold when a patient pays in instalments — an HMO settling its
// share and the patient paying the rest is two payments against one discount.

/**
 * The receipt id for the payment form currently open.
 *
 * ── WHY IT IS CHOSEN WHEN THE FORM OPENS, NOT WHEN IT IS SUBMITTED ─────────
 *
 * Found by the 2026-09-13 launch audit. submitPayment() used to generate a
 * fresh receipt id on every press. A double-click, or a second press because
 * the clinic's connection was slow, ran two transactions: the second one
 * retried against the updated bill, still found a balance on a part-payment,
 * and recorded the same cash a second time. Receipts are append-only by
 * design — nothing can edit or delete one — so the ledger stayed wrong forever.
 *
 * One id per opened form makes the payment idempotent. The transaction checks
 * that receipt first and refuses if it already exists, and firestore.rules
 * backs that up: a create against an existing document is an UPDATE, which
 * the payments rule refuses outright.
 */
let pendingPaymentId = null;

function openPaymentForm() {
    if (!canHandleBilling() || !openBillId) return;

    db.collection("billing").doc(openBillId).get().then(doc => {
        if (!doc.exists) return;
        const b = doc.data();
        const billProblem = billPaymentProblem(b);
        if (billProblem) {
            showToast("This bill cannot take a payment: " + billProblem + ".", "error");
            return;
        }

        pendingPaymentId = db.collection("payments").doc().id;
        if (typeof watchDialogRecord === "function") watchDialogRecord("modal-record-payment", "billing/" + openBillId, b);

        document.getElementById("form-record-payment").reset();
        document.getElementById("payment-bill-id").value = openBillId;
        document.getElementById("payment-discount").value = money(b.discount || 0);
        document.getElementById("payment-extra").value = money(b.additionalFees || 0);
        document.getElementById("payment-date").value = todayISO();

        const due = billDue(b);
        paymentFormAlreadyPaid = storedAmountPaid(b, openBillReceiptsPaid);
        paymentFormHmo = billHmo(b);
        const outstanding = money(due - paymentFormAlreadyPaid - paymentFormHmo);
        document.getElementById("payment-summary").innerText =
            (b.patientName || "") + " — " + peso(outstanding) + " outstanding";
        document.getElementById("payment-tendered").value = outstanding;

        // A bill the database cannot take a payment on says so in the form,
        // before anybody fills it in (owner, 2026-09-25).
        const problem = billPaymentProblem(b);
        setPaymentFormAlert(problem
            ? "This bill cannot take a payment: " + problem + ". Note bill #" +
              openBillId.substring(0, 6).toUpperCase() + " and report it so it can be repaired."
            : "");

        updatePaymentMaths();

        closeModal("modal-bill-detail");
        openModal("modal-record-payment");
    });
}

/**
 * Would firestore.rules accept a payment against this bill? (2026-09-25)
 *
 * The owner hit "Missing or insufficient permissions" paying ₱8,000 cash on
 * an ₱8,000 bill. The same payment, run against the same rules in the
 * emulator, is allowed, so the refusal came from THIS bill's stored data. The
 * rules read the bill's existing fields (isPaymentSettlement: amountPaid,
 * totalAmount, patientId), and a field that is missing or of the wrong type
 * makes the rule error, which Firebase reports only as that one sentence.
 *
 * These are the same conditions, checked before anything is sent, so the
 * front desk is told what is wrong with the bill instead. Nothing is written
 * when one fails.
 *
 * @returns {string|null} what is wrong with the bill, or null
 */
function billPaymentProblem(b) {
    const isNum = v => typeof v === "number" && isFinite(v);
    if (!isNum(b.totalAmount)) {
        return "its total is stored as " + (b.totalAmount === undefined ? "nothing" : JSON.stringify(b.totalAmount)) +
               " instead of a number";
    }
    // Missing is fine (an older bill, see storedAmountPaid); the wrong type is not.
    if (b.amountPaid !== undefined && !isNum(b.amountPaid)) {
        return "its amount-paid figure is stored as " + JSON.stringify(b.amountPaid) + " instead of a number";
    }
    if (b.totalAmount < 0 || (typeof b.amountPaid === "number" && b.amountPaid < 0)) {
        return "its charge or paid amount is negative";
    }
    if (typeof b.patientId !== "string" || !b.patientId) return "it is not linked to a patient";
    if (b.additionalFees !== undefined && !isNum(b.additionalFees)) return "its additional fee is not a number";
    if (b.discount !== undefined && !isNum(b.discount)) return "its discount is not a number";
    if (b.hmoAmount !== undefined && (!isNum(b.hmoAmount) || b.hmoAmount < 0)) return "its HMO amount is not a valid number";
    return null;
}

/**
 * The database refused a payment that passed every check above. Find out
 * whether it is the account: firestore.rules lets only a staff role record
 * money (isStaff), and an account's role is read from its users document.
 */
function explainPaymentRefusal(billingId) {
    const fallback = "The payment was not saved: the clinic database refused it. Nothing was recorded. " +
                     "Reload the page and try again. If it happens again, note bill #" +
                     String(billingId || "").substring(0, 6).toUpperCase() + " and report it.";
    const uid = (typeof currentUserId !== "undefined") ? currentUserId : "";
    if (!uid) return Promise.resolve("You are signed out. Sign in again, then record the payment. Nothing was recorded.");
    return db.collection("users").doc(uid).get()
        .then(doc => {
            const role = String((doc.exists && doc.data().role) || "").trim().toLowerCase();
            const staff = ["staff", "admin", "receptionist", "administrator", "front desk", "secretary", "owner"];
            if (staff.indexOf(role) === -1) {
                return "The payment was not saved: this account's role is \"" + (role || "none") +
                       "\", and only a staff account may record money. Nothing was recorded.";
            }
            return fallback;
        })
        .catch(() => fallback);
}

/**
 * The red box inside the payment form, for a problem that belongs to the bill
 * or the save rather than to one field. Empty text hides it. Text only.
 */
function setPaymentFormAlert(message) {
    const box = document.getElementById("payment-form-alert");
    if (!box) {
        if (message && typeof showToast === "function") showToast(message, "error");
        return;
    }
    box.textContent = message || "";
    box.classList.toggle("hidden", !message);
    if (message && box.scrollIntoView) box.scrollIntoView({ block: "nearest", behavior: "auto" });
}

/** What the bill comes to once staff adjustments are applied. */
function billDue(b) {
    return money(money(b.totalAmount) + money(b.additionalFees || 0) - money(b.discount || 0));
}

/** The part charged to an HMO (Task 25). A bill from before has none. */
function billHmo(b) {
    return money(b.hmoAmount || 0);
}

/**
 * What the patient's side of a bill is called. "Paid" means the patient owes
 * nothing, whether they paid it or an HMO covers it.
 */
function billStatusFor(balance, paid) {
    return balance <= 0 ? "Paid" : (paid > 0 ? "Partially Paid" : "Unpaid");
}

/** One bill's full equation, used by the ledger and the patient record card. */
function billFigures(b, receipts, voids) {
    const charged = money(b.totalAmount);
    const fees = money(b.additionalFees || 0);
    const discount = money(b.discount || 0);
    const due = money(charged + fees - discount);
    const storedPaid = storedAmountPaid(b, 0);
    const voided = new Set((voids || []).map(v => String(v.id || v.paymentId || "")));
    const receiptPaid = receipts == null ? null : money(receipts.reduce((sum, p) =>
        sum + (voided.has(String(p.id || p.payment_id || "")) ? 0 : money(p.amountPaid)), 0));
    const paid = receiptPaid == null ? storedPaid : receiptPaid;
    const hmo = billHmo(b);
    const balance = money(due - paid - hmo);
    const validReceipts = receipts == null || receipts.every(p =>
        typeof p.amountPaid === "number" && isFinite(p.amountPaid) && p.amountPaid >= 0);
    const hasStoredPaid = typeof b.amountPaid === "number" && isFinite(b.amountPaid);
    const paidKnown = hasStoredPaid || (b.amountPaid === undefined && receiptPaid != null);
    const valid = validReceipts && typeof b.totalAmount === "number" && isFinite(b.totalAmount) &&
        paidKnown &&
        [b.additionalFees, b.discount, b.hmoAmount]
        .every(v => v === undefined || (typeof v === "number" && isFinite(v))) &&
        charged >= 0 && fees >= 0 && discount >= 0 && due >= 0 && paid >= 0 && hmo >= 0 &&
        money(paid + hmo) <= due &&
        (!hasStoredPaid || (storedPaid >= 0 && storedPaid <= due));
    const receiptsMismatch = receiptPaid != null && hasStoredPaid &&
        Math.abs(receiptPaid - storedPaid) > 0.009;
    return {
        charged, fees, discount, due, paid, hmo, balance,
        amountsInvalid: !valid,
        receiptsMismatch,
        balanceMismatch: !valid || receiptsMismatch ||
            typeof b.balance !== "number" || !isFinite(b.balance) ||
            Math.abs(money(b.balance) - balance) > 0.009
    };
}

/**
 * Work out the arithmetic live, so nobody has to do it at the counter.
 *
 * Change only exists for cash. Handing back change on a card or an HMO
 * settlement would be nonsense, so for those the amount tendered is taken as
 * exactly the amount paid.
 */
function updatePaymentMaths() {
    const box = document.getElementById("payment-maths");
    if (!box) return;

    const bill = allStaffInvoices.find(i => i.invoice_id === openBillId);
    if (!bill) { box.innerHTML = ""; return; }

    const discount = money(document.getElementById("payment-discount").value);
    const extra    = money(document.getElementById("payment-extra").value);
    const tendered = money(document.getElementById("payment-tendered").value);
    const method   = document.getElementById("payment-method").value;
    const isCash   = method === "Cash";

    const due         = money(money(bill.total_amount) + extra - discount);
    const outstanding = money(due - paymentFormAlreadyPaid - paymentFormHmo);

    // Anything handed over beyond what is owed is change, not payment. Only
    // what actually settles the bill is recorded against it.
    const applied = money(Math.min(tendered, Math.max(outstanding, 0)));
    const change  = isCash ? money(Math.max(tendered - outstanding, 0)) : 0;
    const left    = money(Math.max(outstanding - applied, 0));

    // Labels shift with the method: you are not "tendered" a bank transfer.
    const label = document.getElementById("payment-tendered-label");
    if (label) label.innerText = isCash ? "Cash received" : "Amount received";

    const refLabel = document.getElementById("payment-reference-label");
    if (refLabel) {
        refLabel.innerText = method === "Cash" ? "Reference (not needed for cash)" : "Reference number";
    }
    const hint = document.getElementById("payment-reference-hint");
    if (hint) {
        hint.innerText = method === "Cash"
            ? "Cash has no reference number."
            : "Copy the " + method + " reference number from the transfer, so this payment can be traced later.";
    }

    const row = (k, v, cls) =>
        '<div class="' + (cls || "") + '"><span>' + k + '</span><strong>' + v + '</strong></div>';

    box.innerHTML =
        row("Treatment", peso(bill.total_amount)) +
        (extra > 0 ? row("Additional fee", "+ " + peso(extra)) : "") +
        (discount > 0 ? row("Discount", "− " + peso(discount)) : "") +
        row("Amount due", peso(due), "payment-maths__due") +
        (paymentFormAlreadyPaid > 0 ? row("Already paid", "− " + peso(paymentFormAlreadyPaid)) : "") +
        (paymentFormHmo > 0 ? row("Charged to HMO", "− " + peso(paymentFormHmo)) : "") +
        row("To pay now", peso(outstanding), "payment-maths__due") +
        row("Recording", peso(applied)) +
        (change > 0 ? row("Change to give back", peso(change), "payment-maths__change") : "") +
        (left > 0 ? row("Still owed after this", peso(left), "payment-maths__left") : "");

    // The button stays pressable. A missing amount or reference is pointed at
    // on the field itself when it is pressed (submitPayment), instead of a
    // greyed-out button that says nothing about why (2026-09-25).
}

/**
 * Paid by changed. Whether the reference is required depends on the method,
 * so a "reference required" mark from the last method no longer applies:
 * Cash needs none, and another method is re-checked on Confirm (owner report
 * 2026-09-25: switching back to Cash left the box red and the form stuck).
 */
function onPaymentMethodChanged() {
    if (typeof clearFieldFlag === "function") clearFieldFlag("payment-reference");
    setPaymentFormAlert("");
    updatePaymentMaths();
}

/**
 * What must be filled in before a payment can be confirmed. Each problem is
 * shown on its own field, in red with the reason under it (flagField in
 * js/app.js), not only in a toast.
 */
function paymentFormProblem(method, tendered, discount, extra, reference) {
    if (!(tendered > 0)) return ["payment-tendered", "Enter how much was received."];
    if (discount < 0) return ["payment-discount", "A discount cannot be negative."];
    if (extra < 0) return ["payment-extra", "An additional fee cannot be negative."];
    if (method !== "Cash" && !reference) {
        return ["payment-reference", "Enter the " + method + " reference number from the transfer."];
    }
    return null;
}

/**
 * Record the collection.
 *
 * The payment row and the bill's new balance are written in one transaction, so
 * a bill can never show a balance its payments do not add up to. The bill is
 * re-read inside it because two people can be at the counter at once.
 */
function submitPayment(e) {
    e.preventDefault();
    if (!canHandleBilling()) return;

    const billingId = document.getElementById("payment-bill-id").value;
    const discount  = money(document.getElementById("payment-discount").value);
    const extra     = money(document.getElementById("payment-extra").value);
    const tendered  = money(document.getElementById("payment-tendered").value);
    const method    = document.getElementById("payment-method").value;
    const reference = document.getElementById("payment-reference").value.trim();
    const date      = document.getElementById("payment-date").value || todayISO();

    if (!billingId) return;
    if (!pendingPaymentId) {
        showToast("This payment form is stale. Close it and open the bill again.", "warning");
        return;
    }
    const problem = paymentFormProblem(method, tendered, discount, extra, reference);
    if (problem) { flagField(problem[0], problem[1]); return; }
    setPaymentFormAlert("");

    const billRef = db.collection("billing").doc(billingId);
    const payRef  = db.collection("payments").doc(pendingPaymentId);

    // Locked for the life of the transaction. The idempotent receipt id is
    // what actually prevents a double charge; this just stops the second press.
    const submitBtn = document.querySelector("#form-record-payment button[type='submit']");
    if (submitBtn) submitBtn.disabled = true;
    // Our own change to the bill: an open dialog is not told it changed elsewhere.
    if (typeof noteOwnWrite === "function") noteOwnWrite("billing/" + billingId);

    db.runTransaction(tx => {
        return Promise.all([tx.get(billRef), tx.get(payRef)]).then(([snap, paySnap]) => {
            if (paySnap.exists) throw new Error("This payment was already recorded. Open the bill to see its receipt.");
            if (!snap.exists) throw new Error("That bill no longer exists.");
            const b = snap.data();

            const problem = billPaymentProblem(b);
            if (problem) {
                console.warn("Bill " + billingId + " cannot take a payment:", problem, b);
                throw new Error("This bill cannot take a payment: " + problem + ". Nothing was recorded. " +
                                "Note bill #" + billingId.substring(0, 6).toUpperCase() + " and report it so it can be repaired.");
            }

            const due = money(money(b.totalAmount) + extra - discount);
            if (due < 0) throw new Error("The discount is more than the bill comes to.");

            const already     = storedAmountPaid(b, openBillReceiptsPaid);
            const hmo         = billHmo(b);
            const outstanding = money(due - already - hmo);
            if (outstanding <= 0) throw new Error("This bill is already settled.");

            const isCash  = method === "Cash";
            const applied = money(Math.min(tendered, outstanding));
            const change  = isCash ? money(Math.max(tendered - outstanding, 0)) : 0;

            if (!isCash && tendered > outstanding) {
                throw new Error("That is more than is owed, and only cash gives change. " +
                                "Outstanding is " + peso(outstanding) + ".");
            }

            const paid    = money(already + applied);
            const balance = money(due - paid - hmo);

            // firestore.rules (receiptIsAttributable) caps one receipt at ₱1,000,000.
            if (applied > 1000000) {
                throw new Error("One receipt can be at most ₱1,000,000. Record it as two payments.");
            }

            tx.set(payRef, {
                billingId: billingId,
                patientId: b.patientId,
                patientName: b.patientName || "",
                amountPaid: applied,
                amountTendered: tendered,
                changeGiven: change,
                paymentMethod: method,
                referenceNumber: reference || null,
                paymentDate: date,
                receivedBy: (typeof currentUserId !== "undefined") ? currentUserId : "",
                receivedByName: (typeof currentUser !== "undefined") ? currentUser : "",
                createdAt: new Date().toISOString()
            });

            tx.update(billRef, {
                discount: discount,
                additionalFees: extra,
                amountPaid: paid,
                balance: balance,
                paymentStatus: balance === 0 ? "Paid" : "Partially Paid",
                settledBy: balance === 0 ? ((typeof currentUserId !== "undefined") ? currentUserId : "") : null,
                settledAt: balance === 0 ? new Date().toISOString() : null
            });

            return { balance: balance, change: change, paymentId: payRef.id };
        });
    })
    .then(result => {
        // Spent. A second payment against this bill needs the form reopened,
        // which issues a new receipt id.
        pendingPaymentId = null;
        closeModal("modal-record-payment");
        let msg = result.balance === 0
            ? "Payment confirmed. This bill is fully paid."
            : "Payment confirmed. " + peso(result.balance) + " still outstanding.";
        if (result.change > 0) msg += " Change to give back: " + peso(result.change) + ".";
        showToast(msg, "success");

        loadStaffBilling();
        viewReceipt(result.paymentId);
    })
    .catch(err => {
        console.error("Could not confirm the payment:", err);
        // "Missing or insufficient permissions" is Firebase's wording, and it
        // tells the front desk nothing. The bill itself was checked above, so
        // a refusal here is the account or a stale sign-in; say which.
        // Shown in the form itself, in red, where the person is looking.
        if (err && err.code === "permission-denied") {
            explainPaymentRefusal(billingId).then(setPaymentFormAlert);
        } else {
            setPaymentFormAlert(err.message || "Could not confirm the payment.");
        }
    })
    .finally(() => {
        if (submitBtn) submitBtn.disabled = false;
        // updatePaymentMaths() owns the button's normal enabled state
        // (disabled when nothing would be applied), so hand it back.
        if (typeof updatePaymentMaths === "function") updatePaymentMaths();
    });
}


// ─────────────────────────────────────────────────────────────
// The part an HMO pays (Task 25, 2026-10-05)
// ─────────────────────────────────────────────────────────────
//
// Staff only note which HMO covers a visit and how much. Dr. Gapit collects
// that money from the HMO herself, later, and marks it collected on her side
// (Backup & Recovery, "HMO to collect"). So the HMO part is not a receipt and
// not income until she does: the bill shows it as charged to the HMO, and the
// patient pays only the rest, at the counter, as usual. One bill can be part
// HMO, part cash. firestore.rules: isHmoCharge() and isHmoCollection().

/** Fills the HMO list: the known names, then Other with a typed name. */
function fillHmoProviderSelect(current) {
    const sel = document.getElementById("hmo-provider");
    const otherName = document.getElementById("hmo-other-name");
    if (!sel || !otherName) return;
    const known = HMO_PROVIDERS.indexOf(current) !== -1;
    sel.innerHTML = HMO_PROVIDERS.concat(["Other"]).map(n =>
        '<option value="' + escapeBill(n) + '">' +
            escapeBill(n === "Other" ? "Other (type the name)" : n) + "</option>").join("");
    sel.value = !current ? HMO_PROVIDERS[0] : (known ? current : "Other");
    otherName.value = current && !known ? current : "";
    onHmoProviderChanged();
}

function onHmoProviderChanged() {
    const other = (document.getElementById("hmo-provider") || {}).value === "Other";
    const wrap = document.getElementById("hmo-other-wrap");
    if (wrap) wrap.classList.toggle("hidden", !other);
    if (typeof clearFieldFlag === "function") clearFieldFlag("hmo-other-name");
}

/** The HMO named in the form: a listed one, or the name typed under Other. */
function hmoProviderFromForm() {
    const choice = document.getElementById("hmo-provider").value;
    return choice === "Other" ? document.getElementById("hmo-other-name").value.trim() : choice;
}

function setHmoFormAlert(message) {
    const box = document.getElementById("hmo-form-alert");
    if (!box) {
        if (message) showToast(message, "error");
        return;
    }
    box.textContent = message || "";
    box.classList.toggle("hidden", !message);
}

/** "Charge to HMO" on the open bill: set the HMO part, or correct it. */
function openHmoCharge() {
    if (!canHandleBilling() || !openBillId) return;
    db.collection("billing").doc(openBillId).get().then(doc => {
        if (!doc.exists) return;
        const b = doc.data();
        const problem = billPaymentProblem(b);
        if (problem) {
            showToast("This bill cannot be charged to an HMO: " + problem + ".", "error");
            return;
        }
        // The patient's HMO, remembered from their last HMO visit, is offered first.
        const remembered = b.hmoProvider ? Promise.resolve(b.hmoProvider)
            : db.collection("patients").doc(b.patientId).get()
                .then(p => (p.exists && p.data().hmoProvider) || "")
                .catch(() => "");
        return remembered.then(provider => {
            const room = money(billDue(b) - money(b.amountPaid || 0));
            document.getElementById("form-hmo-charge").reset();
            document.getElementById("hmo-summary").innerText =
                (b.patientName || "") + " — " + peso(room) + " not yet paid by the patient";
            fillHmoProviderSelect(provider);
            document.getElementById("hmo-amount").value = billHmo(b) > 0 ? billHmo(b) : room;
            document.getElementById("hmo-note").value = b.hmoNote || "";
            setHmoFormAlert("");
            closeModal("modal-bill-detail");
            openModal("modal-hmo-charge");
        });
    }).catch(err => {
        console.error("Could not open the HMO form:", err);
        showToast("Could not open this bill.", "error");
    });
}

function submitHmoCharge(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!canHandleBilling() || !openBillId) return;

    const provider = hmoProviderFromForm();
    const amountText = String(document.getElementById("hmo-amount").value || "").trim();
    const amount = money(amountText);
    const note = String(document.getElementById("hmo-note").value || "").trim();

    if (!provider) { flagField("hmo-other-name", "Type the HMO's name."); return; }
    if (provider.length > 100) { flagField("hmo-other-name", "An HMO name is at most 100 characters."); return; }
    if (amountText === "" || !(Number(amountText) >= 0)) {
        flagField("hmo-amount", "Enter how much the HMO covers.");
        return;
    }
    if (note.length > 300) { flagField("hmo-note", "The note is at most 300 characters."); return; }
    setHmoFormAlert("");

    const billId = openBillId;
    const billRef = db.collection("billing").doc(billId);
    const submitBtn = document.querySelector("#form-hmo-charge button[type='submit']");
    if (submitBtn) submitBtn.disabled = true;
    if (typeof noteOwnWrite === "function") noteOwnWrite("billing/" + billId);

    db.runTransaction(tx => tx.get(billRef).then(snap => {
        if (!snap.exists) throw new Error("That bill no longer exists.");
        const b = snap.data();
        const problem = billPaymentProblem(b);
        if (problem) throw new Error("This bill cannot be charged to an HMO: " + problem + ".");
        if (b.hmoStatus === "Collected") {
            throw new Error("Dr. Gapit has already collected the HMO part of this bill, so it can no longer be changed.");
        }
        if (b.amountPaid === undefined && b.paymentStatus === "Paid") throw new Error("This bill is already settled.");
        if (amount <= 0 && billHmo(b) <= 0) {
            throw new Error("Enter how much the HMO covers.");
        }

        const paid = money(b.amountPaid || 0);
        const room = money(billDue(b) - paid);
        if (amount > room) {
            throw new Error("The HMO can cover at most " + peso(room) + ", what the patient has not paid yet.");
        }
        const balance = money(room - amount);
        const status = billStatusFor(balance, paid);
        const now = new Date().toISOString();

        tx.update(billRef, {
            hmoProvider: provider,
            hmoAmount: amount,
            hmoNote: note,
            hmoStatus: "Charged",
            hmoChargedBy: currentUserId,
            hmoChargedAt: now,
            balance: balance,
            paymentStatus: status,
            settledBy: status === "Paid" ? currentUserId : null,
            settledAt: status === "Paid" ? now : null
        });
        return { patientId: b.patientId, balance: balance };
    }))
    .then(result => {
        // Remembered on the patient for next time. Staff may write a
        // patient's profile; a refusal here costs only the reminder.
        if (amount > 0) {
            db.collection("patients").doc(result.patientId).update({ hmoProvider: provider })
                .catch(err => console.warn("Could not remember the patient's HMO:", err));
        }
        closeModal("modal-hmo-charge");
        showToast(amount > 0
            ? peso(amount) + " charged to " + provider + ". " + (result.balance > 0
                ? "The patient pays " + peso(result.balance) + "."
                : "The patient owes nothing more.")
            : "The HMO part was taken off this bill.", "success");
        loadStaffBilling();
        openBill(billId);
    })
    .catch(err => {
        console.error("Could not charge the HMO:", err);
        setHmoFormAlert(err && err.code === "permission-denied"
            ? "The clinic database refused this, so nothing was saved. Reload the page and try again."
            : (err.message || "Could not save the HMO part."));
    })
    .finally(() => {
        if (submitBtn) submitBtn.disabled = false;
    });
}

/** Dr. Gapit's list: HMO parts she has not collected yet, oldest first. */
function loadHmoToCollect() {
    const box = document.getElementById("hmo-collect-list");
    if (!box) return;
    watchLive("tab-dentist-backup:hmo", db.collection("billing").where("hmoStatus", "==", "Charged"), snap => {
        const rows = [];
        snap.forEach(d => {
            const b = d.data();
            if (billHmo(b) > 0) rows.push(Object.assign({ id: d.id }, b));
        });
        rows.sort((x, y) => String(x.billingDate || "").localeCompare(String(y.billingDate || "")));
        const total = money(rows.reduce((s, b) => s + billHmo(b), 0));
        box.innerHTML = rows.length
            ? '<p class="hmo-collect__total">' + rows.length + (rows.length === 1 ? " bill, " : " bills, ") +
                  peso(total) + " to collect</p>" +
              '<ul class="hmo-collect__rows">' + rows.map(b =>
                '<li class="hmo-collect__row">' +
                    '<div><strong>' + escapeBill(b.patientName || "—") + "</strong> · " +
                        escapeBill(b.billingDate || "") + " · " + escapeBill(b.treatmentName || "") +
                        '<div class="line-note">' + escapeBill(b.hmoProvider || "") +
                            (b.hmoNote ? ": " + escapeBill(b.hmoNote) : "") + "</div></div>" +
                    '<div class="hmo-collect__act"><strong>' + peso(billHmo(b)) + "</strong>" +
                        '<button type="button" class="btn-secondary btn-sm" onclick="markHmoCollected(\'' +
                            escapeJsAttr(b.id) + '\')">Collected</button></div>' +
                "</li>").join("") + "</ul>"
            : '<p class="picker-empty">Nothing to collect from an HMO.</p>';
    }, () => {
        box.innerHTML = '<p class="picker-empty">The HMO list could not be read. Reload the page.</p>';
    });
}

/** She has the HMO's money: mark it collected, today, in her name. */
async function markHmoCollected(billId) {
    if (!(currentRole === "dentist" || currentRole === "admin")) return;
    const billRef = db.collection("billing").doc(billId);
    const snap = await billRef.get().catch(() => null);
    if (!snap || !snap.exists) { showToast("That bill no longer exists.", "error"); return; }
    const b = snap.data();
    if (!(await confirmDialog("Mark " + peso(billHmo(b)) + " from " + (b.hmoProvider || "the HMO") +
            " for " + (b.patientName || "this patient") + " as collected today? It then counts as income.",
            { title: "HMO collected?", confirmLabel: "Collected" }))) return;

    db.runTransaction(tx => tx.get(billRef).then(s => {
        if (!s.exists) throw new Error("That bill no longer exists.");
        const now = s.data();
        if (now.hmoStatus !== "Charged" || billHmo(now) <= 0) throw new Error("This HMO part was already marked collected.");
        tx.update(billRef, {
            hmoStatus: "Collected",
            hmoCollectedBy: currentUserId,
            hmoCollectedByName: currentUser || "",
            hmoCollectedAt: new Date().toISOString(),
            hmoCollectedDate: todayISO()
        });
    }))
    .then(() => showToast("Marked collected. It counts as income today.", "success"))
    .catch(err => {
        console.error("Could not mark the HMO part collected:", err);
        showToast(err && err.code === "permission-denied"
            ? "The clinic database refused this. Nothing was saved."
            : (err.message || "Could not save."), "error");
    });
}


// ─────────────────────────────────────────────────────────────
// Supplies used on a bill (2026-10-05)
// ─────────────────────────────────────────────────────────────
//
// Dr. Gapit gives no fixed supply list per treatment, so the system learns
// one. The front desk records what a visit used when they open its bill, and
// the next bill for the same treatment starts with that list: usually they
// only press Save. Saving lowers each item and writes one signed movement per
// item (reason "use", with the bill's id), in one transaction, through the
// rules as they already stand: staff may write inventory and a movement signed
// with their own uid.
//
// A bill's supplies are recorded once. Each movement's id is
// <billId>_<itemId>, the transaction refuses when one exists, and a second
// write to the same id would be an update, which the rules refuse.
//
// Reusable instruments are never offered: a treatment does not use them up.

/** The open bill whose supplies are being recorded. */
let billSuppliesBill = null;
/** Consumable items to choose from: [{ id, itemName, unit, quantity }]. */
let billSupplyItems = [];
/** The rows in the form: [{ itemId, qty }]. */
let billSupplyRows = [];

/** Under the receipts on a bill: what it used, or the button to record it. */
function loadBillSupplies(billId, b) {
    const box = document.getElementById("bill-supplies");
    if (!box) return;
    billSuppliesBill = { id: billId, treatmentId: b.treatmentId || "", treatmentName: b.treatmentName || "",
                         patientName: b.patientName || "" };
    db.collection("inventory_movements").where("billingId", "==", billId).get().then(snap => {
        const used = [];
        snap.forEach(d => used.push(d.data()));
        box.innerHTML = used.length
            ? '<ul class="bill-supplies__list">' + used.map(m =>
                "<li>" + escapeBill(m.itemName || "Item") + " &times; " + escapeBill(String(-Number(m.changeQty) || 0)) +
                '<span class="line-note"> by ' + escapeBill(m.performedByName || "—") + "</span></li>").join("") + "</ul>"
            : '<p class="picker-empty">Not recorded yet.</p>' +
              '<button type="button" class="btn-secondary btn-sm" onclick="openBillSupplies()">' +
              "Record supplies used</button>";
    }).catch(err => {
        console.error("Could not read the supplies for this bill:", err);
        box.innerHTML = '<p class="picker-empty">The supplies for this bill could not be read.</p>';
    });
}

function openBillSupplies() {
    if (!canHandleBilling() || !billSuppliesBill) return;
    const bill = billSuppliesBill;
    Promise.all([
        db.collection("inventory").get(),
        bill.treatmentId ? db.collection("treatments").doc(bill.treatmentId).get().catch(() => null) : null
    ]).then(([items, treatment]) => {
        billSupplyItems = [];
        items.forEach(d => {
            const it = d.data();
            if (it.itemType !== "reusable") {
                billSupplyItems.push({ id: d.id, itemName: it.itemName || "Item", unit: it.unit || "",
                                       quantity: Number(it.quantity) || 0 });
            }
        });
        billSupplyItems.sort((x, y) => x.itemName.localeCompare(y.itemName));
        // What this treatment used last time, for the items still on the list.
        const usual = (treatment && treatment.exists && treatment.data().usualSupplies) || [];
        billSupplyRows = usual
            .filter(u => billSupplyItems.some(it => it.id === u.itemId))
            .map(u => ({ itemId: u.itemId, qty: Number(u.qty) || 1 }));
        if (!billSupplyRows.length) billSupplyRows = [{ itemId: "", qty: 1 }];

        document.getElementById("bill-supplies-summary").innerText =
            bill.patientName + " — " + (bill.treatmentName || "visit") +
            (usual.length ? " (filled in from the last time)" : "");
        document.getElementById("bill-supplies-alert").classList.add("hidden");
        renderBillSupplyRows();
        closeModal("modal-bill-detail");
        openModal("modal-bill-supplies");
    }).catch(err => {
        console.error("Could not open the supplies form:", err);
        showToast("Could not read the supplies list.", "error");
    });
}

function renderBillSupplyRows() {
    const box = document.getElementById("bill-supplies-rows");
    if (!box) return;
    const options = sel => '<option value="">Choose an item…</option>' + billSupplyItems.map(it =>
        '<option value="' + escapeBill(it.id) + '"' + (it.id === sel ? " selected" : "") + ">" +
            escapeBill(it.itemName) + " (" + it.quantity + (it.unit ? " " + escapeBill(it.unit) : "") + " left)</option>").join("");
    box.innerHTML = billSupplyRows.map((r, i) =>
        '<div class="bill-supply-row">' +
            '<select aria-label="Item" onchange="billSupplyRows[' + i + '].itemId = this.value">' + options(r.itemId) + "</select>" +
            '<input type="number" aria-label="How many" min="1" max="999" step="1" value="' + r.qty + '" ' +
                'oninput="billSupplyRows[' + i + '].qty = this.value">' +
            '<button type="button" class="btn-secondary btn-sm" aria-label="Remove this item" ' +
                'onclick="billSupplyRows.splice(' + i + ', 1); renderBillSupplyRows()">&times;</button>' +
        "</div>").join("") ||
        '<p class="picker-empty">No items. Press Add item, or Save if nothing was used.</p>';
}

function addBillSupplyRow() {
    billSupplyRows.push({ itemId: "", qty: 1 });
    renderBillSupplyRows();
}

function setBillSuppliesAlert(message) {
    const box = document.getElementById("bill-supplies-alert");
    if (!box) { if (message) showToast(message, "error"); return; }
    box.textContent = message || "";
    box.classList.toggle("hidden", !message);
}

function submitBillSupplies(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!canHandleBilling() || !billSuppliesBill) return;
    const bill = billSuppliesBill;

    // One line per item: the same item twice is added together.
    const byItem = {};
    for (const r of billSupplyRows) {
        const qty = Number(r.qty);
        if (!r.itemId && billSupplyRows.length === 1 && qty === 1) continue;   // the empty starting row
        if (!r.itemId) return setBillSuppliesAlert("Choose an item on every line, or remove the line.");
        if (!Number.isInteger(qty) || qty < 1 || qty > 999) {
            return setBillSuppliesAlert("Each amount must be a whole number from 1 to 999.");
        }
        byItem[r.itemId] = (byItem[r.itemId] || 0) + qty;
    }
    const ids = Object.keys(byItem);
    if (!ids.length) {
        closeModal("modal-bill-supplies");
        showToast("Nothing was recorded: no item was chosen.", "info");
        return;
    }
    setBillSuppliesAlert("");

    const itemRefs = ids.map(id => db.collection("inventory").doc(id));
    const moveRefs = ids.map(id => db.collection("inventory_movements").doc(bill.id + "_" + id));
    const treatmentRef = bill.treatmentId ? db.collection("treatments").doc(bill.treatmentId) : null;
    const submitBtn = document.querySelector("#form-bill-supplies button[type='submit']");
    if (submitBtn) submitBtn.disabled = true;

    db.runTransaction(tx => Promise.all(
        moveRefs.map(r => tx.get(r)).concat(itemRefs.map(r => tx.get(r)), treatmentRef ? [tx.get(treatmentRef)] : [])
    ).then(snaps => {
        const moves = snaps.slice(0, ids.length);
        const items = snaps.slice(ids.length, ids.length * 2);
        const treatment = treatmentRef ? snaps[ids.length * 2] : null;
        if (moves.some(s => s.exists)) throw new Error("The supplies for this bill were already recorded.");
        const now = new Date().toISOString();
        const note = "Used on " + (bill.patientName || "a patient") +
                     (bill.treatmentName ? " (" + bill.treatmentName + ")" : "") +
                     ", bill #" + bill.id.substring(0, 6).toUpperCase();
        ids.forEach((id, i) => {
            if (!items[i].exists) throw new Error("A chosen item is no longer on the inventory list.");
            const item = items[i].data();
            const after = (Number(item.quantity) || 0) - byItem[id];
            tx.update(itemRefs[i], { quantity: after });
            tx.set(moveRefs[i], {
                itemId: id, itemName: item.itemName || "", changeQty: -byItem[id], balanceAfter: after,
                reason: "use", note: note, billingId: bill.id,
                performedBy: currentUserId || "", performedByName: currentUser || "",
                createdAt: now, movementDate: todayISO()
            });
        });
        // Learned for next time: this treatment's usual supplies.
        if (treatment && treatment.exists) {
            tx.update(treatmentRef, { usualSupplies: ids.map(id => ({ itemId: id, qty: byItem[id] })) });
        }
    }))
    .then(() => {
        closeModal("modal-bill-supplies");
        showToast("Supplies recorded and taken off the stock.", "success");
        openBill(bill.id);
    })
    .catch(err => {
        console.error("Could not record the supplies:", err);
        setBillSuppliesAlert(err && err.code === "permission-denied"
            ? "The clinic database refused this, so nothing was saved. Reload the page and try again."
            : (err.message || "Could not record the supplies."));
    })
    .finally(() => { if (submitBtn) submitBtn.disabled = false; });
}


// ─────────────────────────────────────────────────────────────
// Voiding a receipt
// ─────────────────────────────────────────────────────────────
//
// Clinic decision, 2026-09-13. A receipt entered wrongly — the wrong amount,
// the wrong bill, entered twice — used to be permanent: receipts are append-
// only, and nothing could bring a bill's paid amount back down. The front desk
// may now void one, and has to say why.
//
// Nothing is deleted. The receipt stays on record; a payment_voids document is
// written beside it (same id as the receipt, so a receipt can be voided at most
// once), and the bill's amountPaid comes down by exactly that receipt's amount
// in the same transaction. firestore.rules requires the two together
// (isPaymentVoidReversal and the payment_voids block).

/** Must match voidReasons() in firestore.rules exactly. */
const VOID_REASONS = [
    "Wrong amount entered",
    "Recorded on the wrong bill or patient",
    "Recorded twice",
    "Wrong payment method",
    "Others"
];

/** Opens a payment's receipt again from the bill, ready to print. */
function reprintReceipt(paymentId) {
    if (!canReadClinicFinances()) return;
    closeModal("modal-bill-detail");
    viewReceipt(paymentId);
}

function openVoidPayment(paymentId) {
    if (!canHandleBilling()) return;
    const p = openBillPayments[paymentId];
    if (!p || p.voided) return;

    document.getElementById("form-void-payment").reset();
    document.getElementById("void-payment-id").value = paymentId;
    document.getElementById("void-summary").innerText =
        peso(p.amountPaid) + " by " + (p.paymentMethod || "—") + " on " + (p.paymentDate || "—") +
        (p.receivedByName ? ", received by " + p.receivedByName : "");
    onVoidReasonChanged();

    closeModal("modal-bill-detail");
    openModal("modal-void-payment");
}

function onVoidReasonChanged() {
    const reason = (document.getElementById("void-reason") || {}).value;
    const wrap = document.getElementById("void-note-wrap");
    const note = document.getElementById("void-note");
    const isOther = reason === "Others";
    if (wrap) wrap.classList.toggle("hidden", !isOther);
    if (note) note.required = isOther;
}

function submitVoidPayment(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!canHandleBilling()) return;

    const paymentId = document.getElementById("void-payment-id").value;
    const reason = document.getElementById("void-reason").value;
    const note = (document.getElementById("void-note").value || "").trim();

    if (!paymentId || !openBillId) return;
    if (VOID_REASONS.indexOf(reason) === -1) {
        flagField("void-reason", "Choose why this receipt is being voided.");
        return;
    }
    if (reason === "Others" && note.length < 5) {
        flagField("void-note", "Say exactly what was wrong with this receipt (at least 5 characters).");
        return;
    }

    const payRef  = db.collection("payments").doc(paymentId);
    const voidRef = db.collection("payment_voids").doc(paymentId);
    const billRef = db.collection("billing").doc(openBillId);

    const submitBtn = document.querySelector("#form-void-payment button[type='submit']");
    if (submitBtn) submitBtn.disabled = true;
    // Our own change to the bill: an open dialog is not told it changed elsewhere.
    if (typeof noteOwnWrite === "function") noteOwnWrite("billing/" + openBillId);

    db.runTransaction(tx =>
        Promise.all([tx.get(payRef), tx.get(voidRef), tx.get(billRef)]).then(([paySnap, voidSnap, billSnap]) => {
            if (!paySnap.exists) throw new Error("That receipt is no longer on record.");
            if (voidSnap.exists) throw new Error("That receipt has already been voided.");
            if (!billSnap.exists) throw new Error("The bill for this receipt no longer exists.");

            const p = paySnap.data();
            const b = billSnap.data();
            if (p.billingId !== billRef.id) throw new Error("That receipt belongs to a different bill.");

            const now = new Date().toISOString();
            const due = billDue(b);
            const paid = money(Math.max(storedAmountPaid(b, openBillReceiptsPaid) - money(p.amountPaid), 0));
            const balance = money(due - paid - billHmo(b));
            const status = billStatusFor(balance, paid);

            tx.set(voidRef, {
                paymentId: paymentId,
                billingId: p.billingId,
                patientId: p.patientId,
                amountVoided: p.amountPaid,
                paymentDate: p.paymentDate || "",
                reason: reason,
                reasonNote: note,
                voidedBy: currentUserId,
                voidedByName: currentUser || "",
                voidedAt: now
            });

            tx.update(billRef, {
                amountPaid: paid,
                balance: balance,
                paymentStatus: status,
                settledBy: status === "Paid" ? currentUserId : null,
                settledAt: status === "Paid" ? now : null,
                lastVoidedPaymentId: paymentId,
                lastVoidedAt: now
            });

            return { amount: p.amountPaid, balance: balance };
        })
    )
    .then(result => {
        closeModal("modal-void-payment");
        showToast("Receipt voided. " + peso(result.amount) + " is owed on the bill again" +
                  " (balance " + peso(result.balance) + ").", "success");
        loadStaffBilling();
        openBill(openBillId);
    })
    .catch(err => {
        console.error("Could not void the receipt:", err);
        showToast(err.message || "Could not void the receipt.", "error");
    })
    .finally(() => {
        if (submitBtn) submitBtn.disabled = false;
    });
}


// ─────────────────────────────────────────────────────────────
// Receipt
// ─────────────────────────────────────────────────────────────

/**
 * A number of pesos, written out.
 *
 * Philippine official receipts carry the amount in words as well as figures,
 * and they do it for a reason older than this system: a figure can be altered
 * with one stroke of a pen and a sentence cannot. The instructor's note that
 * this receipt did not look like a real one was, more than anything, about
 * the things a real OR has that this did not.
 *
 * Centavos are written as a fraction over 100, which is how a Philippine
 * receipt writes them.
 */
function pesosInWords(amount) {
    const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven",
                  "eight", "nine", "ten", "eleven", "twelve", "thirteen",
                  "fourteen", "fifteen", "sixteen", "seventeen", "eighteen",
                  "nineteen"];
    const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty",
                  "seventy", "eighty", "ninety"];

    function under1000(n) {
        if (n < 20) return ONES[n];
        if (n < 100) {
            return TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : "");
        }
        return ONES[Math.floor(n / 100)] + " hundred" +
               (n % 100 ? " " + under1000(n % 100) : "");
    }

    // Largest scale first, and RECURSIVE rather than a single pass.
    //
    // The single pass handed under1000() the value Math.floor(pesos / 1000000),
    // which is 2000 for two billion pesos — past the end of ONES, so the
    // hundreds branch indexed undefined and the receipt printed "undefined
    // hundred million pesos". Recursing means every call gets a number it can
    // actually render, at any magnitude.
    //
    // Unreachable in this clinic — firestore.rules caps a bill at ₱1,000,000 —
    // but a receipt is a document somebody keeps, and a document that can
    // print the word "undefined" is not one to leave standing.
    const SCALES = [[1000000000, "billion"], [1000000, "million"], [1000, "thousand"]];

    function whole(n) {
        if (n < 1000) return under1000(n);
        for (let i = 0; i < SCALES.length; i++) {
            const value = SCALES[i][0];
            if (n >= value) {
                const head = whole(Math.floor(n / value)) + " " + SCALES[i][1];
                const rest = n % value;
                return rest ? head + " " + whole(rest) : head;
            }
        }
        return under1000(n);
    }

    const total = Math.round(Number(amount) * 100);
    if (!isFinite(total) || total < 0) return "—";

    const pesos = Math.floor(total / 100);
    const centavos = total % 100;

    let words = whole(pesos);
    words = words.charAt(0).toUpperCase() + words.slice(1);
    return words + " peso" + (Math.round(Number(amount)) === 1 ? "" : "s") +
           (centavos ? " and " + centavos + "/100" : "") + " only";
}

/**
 * One payment, as an official receipt.
 *
 * ── WHAT CHANGED, AND WHY ────────────────────────────────────────────────
 *
 * The first version was a plain two-column table: date, name, method, amount.
 * Everything in it was true and none of it looked like a receipt, which is
 * the note that came back from the instructor. A receipt is a document the
 * clinic hands to a person and that person keeps — it has to carry its own
 * authority on the page.
 *
 * So it now has the things a receipt actually has: a serial number, a ruled
 * particulars block saying what the money was for, the amount in words as
 * well as figures, the tender and change when there was any, what is left on
 * the bill, and a signature line over the name of whoever took the money.
 *
 * ── IT READS THE BILL TOO ────────────────────────────────────────────────
 *
 * The payment record knows an amount; only the bill knows what the amount was
 * FOR. A receipt that cannot say what was paid for is a slip of paper, so the
 * bill is fetched alongside. If that read fails the receipt still prints —
 * the particulars line falls back to "Dental services" rather than the whole
 * document failing over a missing description.
 */
function viewReceipt(paymentId) {
    const area = document.getElementById("receipt-printable-area");
    if (!area) return;

    db.collection("payments").doc(paymentId).get()
    .then(doc => {
        if (!doc.exists) throw new Error("That payment is no longer on record.");
        const p = doc.data();

        // The bill is a nicety, not a requirement — see above.
        const bill = p.billingId
            ? db.collection("billing").doc(p.billingId).get()
                .then(b => (b.exists ? b.data() : null))
                .catch(() => null)
            : Promise.resolve(null);

        // A voided receipt must never print as though the money was taken.
        const voided = db.collection("payment_voids").doc(paymentId).get()
            .then(v => (v.exists ? v.data() : null))
            .catch(() => null);

        return Promise.all([bill, voided]).then(([b, v]) => {
            renderReceipt(area, paymentId, p, b);
            if (v) {
                area.insertAdjacentHTML("afterbegin",
                    '<p class="rc-void">VOID — ' + escapeBill(v.reason) +
                    (v.reasonNote ? ": " + escapeBill(v.reasonNote) : "") +
                    " (voided by " + escapeBill(v.voidedByName || "—") + ", " +
                    escapeBill(String(v.voidedAt || "").slice(0, 10)) + ")</p>");
            }
        });
    })
    .catch(err => {
        console.error("Could not build the receipt:", err);
        showToast("Could not open the receipt. The payment was still recorded.", "error");
    });
}

/** Draws the receipt. Split out so the layout can be read on its own. */
function renderReceipt(area, paymentId, p, bill) {
    const row = (label, value, cls) =>
        '<div class="rc-row' + (cls ? " " + cls : "") + '">' +
            '<span class="rc-row__k">' + label + "</span>" +
            '<span class="rc-row__v">' + value + "</span>" +
        "</div>";

    const tendered = Number(p.amountTendered) || 0;
    const change   = Number(p.changeGiven) || 0;
    const billAmounts = bill ? billFigures(bill) : null;
    const balance = billAmounts && !billAmounts.amountsInvalid ? billAmounts.balance : null;
    const needsReview = billAmounts && billAmounts.balanceMismatch;

    const particulars = (bill && bill.treatmentName) || "Dental services";

    // A serial the clinic can quote on the phone. Grouped in fours because
    // that is how a person reads a code aloud without losing their place.
    const serial = String(paymentId).replace(/[^a-zA-Z0-9]/g, "")
                       .substring(0, 8).toUpperCase().replace(/(.{4})(.{1,4})/, "$1-$2");

    area.innerHTML =
        '<div class="rc">' +

            '<header class="rc-head">' +
                '<h2 class="rc-head__clinic">Dr. Reina G. Gapit Dental Clinic</h2>' +
                '<p class="rc-head__addr">Stall 104B, Ground Floor, Ramaida Centrum<br>' +
                    "Elias Angeles Street, Naga City</p>" +
            "</header>" +

            '<div class="rc-title">' +
                '<span class="rc-title__word">Official Receipt</span>' +
                '<span class="rc-title__no">No. ' + escapeBill(serial) + "</span>" +
            "</div>" +

            '<div class="rc-block">' +
                row("Date", escapeBill(p.paymentDate || "—")) +
                row("Received from", '<strong>' + escapeBill(p.patientName || "—") + "</strong>") +
            "</div>" +

            '<table class="rc-particulars">' +
                "<thead><tr><th>Particulars</th><th>Amount</th></tr></thead>" +
                "<tbody><tr>" +
                    '<td><span class="rc-lead">' + escapeBill(particulars) + "</span></td>" +
                    "<td>" + peso(p.amountPaid) + "</td>" +
                "</tr></tbody>" +
                "<tfoot><tr>" +
                    '<th><span class="rc-lead">Amount paid</span></th>' +
                    '<th class="rc-total">' + peso(p.amountPaid) + "</th>" +
                "</tr></tfoot>" +
            "</table>" +

            '<p class="rc-words">' + escapeBill(pesosInWords(p.amountPaid)) + "</p>" +

            '<div class="rc-block">' +
                row("Paid by", escapeBill(p.paymentMethod || "—")) +
                (p.referenceNumber
                    ? row("Reference", escapeBill(p.referenceNumber))
                    : "") +
                (tendered > 0 ? row(p.paymentMethod === "Cash" ? "Cash tendered" : "Amount received", peso(tendered)) : "") +
                (change   > 0 ? row("Change given",  peso(change))   : "") +
            "</div>" +

            (balance === null ? "" :
                '<div class="rc-balance' + (balance === 0 ? " rc-balance--settled" : "") + '">' +
                    (balance === 0
                        ? "This bill is fully paid."
                        : "Still outstanding on this bill: <strong>" + peso(balance) + "</strong>") +
                "</div>") +
            (needsReview ? '<p class="rc-foot">Account needs review: the saved balance differs from the bill calculation.</p>' : '') +

            '<div class="rc-sign">' +
                '<span class="rc-sign__label">Received by</span>' +
                '<span class="rc-sign__rule"></span>' +
                '<span class="rc-sign__name">' + escapeBill(p.receivedByName || "—") + "</span>" +
            "</div>" +

            '<p class="rc-foot">Payment collected in person at the clinic. ' +
                "Please keep this receipt for your records.</p>" +
        "</div>";

    // The Paper chooser beside the Print button (js/print.js).
    if (typeof fillPrintSheetSlots === "function") {
        fillPrintSheetSlots(document.getElementById("modal-receipt"));
    }
    openModal("modal-receipt");
}

// ── Printing the receipt (client revision 9, 2026-09-30) ────────────────────
//
// The Print button used to call window.print() on the whole page, with print
// rules in css/marble.css hiding everything but the receipt. It printed on
// whatever paper the browser assumed and came out too large. The receipt now
// goes to printClinicSheet() (js/print.js) like the prescription and the
// certificate: its own small document, on the clinic's half sheet.

/**
 * The receipt's own style rules, read from the stylesheet that draws it on
 * screen, so the printed receipt cannot drift from the one in the dialog.
 *
 * Only the ".rc" rules are taken. The dialog's frame (#receipt-printable-area)
 * is left behind: it is the screen's border, not part of the document.
 */
function receiptPrintCss() {
    const rules = [];
    const sheets = (typeof document !== "undefined" && document.styleSheets) || [];
    for (let i = 0; i < sheets.length; i++) {
        let list;
        // A stylesheet from another origin (the web font) refuses to be read.
        try { list = sheets[i].cssRules; } catch (err) { continue; }
        for (let k = 0; list && k < list.length; k++) {
            const selector = list[k].selectorText || "";
            if (/(^|[\s,])\.rc(?![\w])/.test(selector) || /(^|[\s,])\.rc-[\w-]+/.test(selector)) {
                rules.push(list[k].cssText);
            }
        }
    }
    return rules.join("\n");
}

/** Print the receipt that is open in the dialog, exactly as it is shown. */
function printReceipt() {
    const area = document.getElementById("receipt-printable-area");
    // What is on screen is what is printed, including the VOID line that
    // viewReceipt() puts above a voided receipt.
    const html = area ? String(area.innerHTML || "").trim() : "";
    if (!html) return;

    printClinicSheet({ title: "Official receipt", bodyHtml: html, css: receiptPrintCss() });
}


// ─────────────────────────────────────────────────────────────
// The figures
// ─────────────────────────────────────────────────────────────

/**
 * Collected, outstanding and billed.
 *
 * Collected is the sum of payments actually received — a bill raised is not
 * money in the drawer, and showing it as revenue would overstate what the
 * clinic has taken.
 */
function loadFinancialSummary() {
    let due = 0, collected = 0, outstanding = 0;
    if (allStaffInvoices.some(inv => inv.amounts_invalid)) {
        ["stats-total-earnings", "stats-cash-earnings", "stats-online-earnings"].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerText = "Needs review";
        });
        return;
    }

    allStaffInvoices.forEach(inv => {
        due += money(inv.due_amount);
        collected += money(inv.amount_paid);
        outstanding += money(inv.balance);
    });

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.innerText = v; };
    set("stats-total-earnings", peso(collected));
    set("stats-cash-earnings", peso(due));
    set("stats-online-earnings", peso(outstanding));
}


// ─────────────────────────────────────────────────────────────
// Exports — the ledger as a PDF or a spreadsheet
// ─────────────────────────────────────────────────────────────

// ── The Billing tab's two exports, rewritten 2026-09-16 ─────────────────────
//
// They printed a "TOTAL SYSTEM REVENUE" banner, a "Revenue by Settle Method"
// table that split nothing (every peso landed under "Collected in person"), and
// a spreadsheet of raw columns with no total. The clinic could not use either.
// Both now describe exactly the bills on the Billing screen, in plain words:
// what was charged, what came in, what is still owed, and by treatment.
//
// The PDF has no peso sign because its built-in font cannot draw one (see
// pdfText in js/patient-history.js); the amount columns say "(PHP)" instead.

/** 1,500.00 — for PDF cells, which cannot print the peso sign. */
function billPdfAmount(n) {
    return money(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** The loaded bills, oldest first, with the date range they cover. */
function billsForExport() {
    const bills = allStaffInvoices.slice()
        .sort((a, b) => String(a.billingDate || "").localeCompare(String(b.billingDate || "")));
    const dates = bills.map(b => b.billingDate).filter(Boolean);
    return { bills: bills, from: dates[0] || "", to: dates[dates.length - 1] || "" };
}

function exportFinancialPDF() {
    // Fetched on first use (js/app.js loadReportLibraries), then this runs again.
    if (typeof retryWithReportLibraries === "function" &&
        retryWithReportLibraries(["jspdf", "autotable"], exportFinancialPDF)) return;
    if (typeof window.jspdf === 'undefined') {
        showToast("PDF Library loading error. Please refresh.", "error");
        return;
    }
    if (allStaffInvoices.length === 0) {
        showToast("No bills to export.", "warning");
        return;
    }
    if (allStaffInvoices.some(b => b.amounts_invalid)) {
        showToast("A bill has invalid amounts. Review it before exporting the summary.", "error");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const { bills, from, to } = billsForExport();

    const charged  = bills.reduce((t, b) => t + money(b.total_amount), 0);
    const fees     = bills.reduce((t, b) => t + money(b.additional_fees), 0);
    const discount = bills.reduce((t, b) => t + money(b.discount), 0);
    const due      = money(charged + fees - discount);
    const received = bills.reduce((t, b) => t + money(b.amount_paid), 0);
    const unpaid   = bills.reduce((t, b) => t + money(b.balance), 0);

    const byTreatment = {};
    bills.forEach(b => {
        const key = b.treatment_name || "Unspecified";
        if (!byTreatment[key]) byTreatment[key] = { bills: 0, due: 0, received: 0, unpaid: 0 };
        byTreatment[key].bills += 1;
        byTreatment[key].due += money(b.due_amount);
        byTreatment[key].received += money(b.amount_paid);
        byTreatment[key].unpaid += money(b.balance);
    });

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Billing summary", 14, 20);
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(90);
    doc.text("Dr. Reina G. Gapit Dental Clinic, Naga City", 14, 26);
    doc.text(bills.length + " bill" + (bills.length === 1 ? "" : "s") +
             (from ? ", " + from + " to " + to : "") +
             ". Printed " + new Date().toLocaleString() + ".", 14, 31);
    doc.setTextColor(0);

    doc.autoTable({
        startY: 38,
        head: [["", "Amount (PHP)"]],
        body: [
            ["Total charged", billPdfAmount(charged)],
            ["Additional fees", billPdfAmount(fees)],
            ["Discounts", billPdfAmount(discount)],
            ["Amount due", billPdfAmount(due)],
            ["Received", billPdfAmount(received)],
            ["Still unpaid", billPdfAmount(unpaid)]
        ],
        theme: "grid",
        headStyles: { fillColor: [23, 96, 143] },
        styles: { fontSize: 11, cellPadding: 3 },
        columnStyles: { 1: { halign: "right", cellWidth: 50 } },
        margin: { left: 14, right: 14 }
    });

    let y = doc.lastAutoTable.finalY + 12;
    if (bills.some(b => b.balance_mismatch)) {
        doc.setTextColor(150, 30, 30);
        doc.setFontSize(9);
        doc.text("Account needs review: saved balances differ from the calculated amounts.", 14, y);
        doc.setTextColor(0);
        y += 10;
    }
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(12);
    doc.text("By treatment", 14, y);
    doc.setFont("Helvetica", "normal");

    const rows = Object.keys(byTreatment).sort().map(name => [
        name, String(byTreatment[name].bills),
        billPdfAmount(byTreatment[name].due),
        billPdfAmount(byTreatment[name].received),
        billPdfAmount(byTreatment[name].unpaid)
    ]);
    rows.push(["TOTAL", String(bills.length), billPdfAmount(due), billPdfAmount(received), billPdfAmount(unpaid)]);

    doc.autoTable({
        startY: y + 4,
        head: [["Treatment", "Bills", "Amount due (PHP)", "Received (PHP)", "Unpaid (PHP)"]],
        body: rows,
        theme: "grid",
        headStyles: { fillColor: [23, 96, 143] },
        styles: { fontSize: 10, cellPadding: 2.5 },
        columnStyles: {
            1: { halign: "right", cellWidth: 16 },
            2: { halign: "right", cellWidth: 32 },
            3: { halign: "right", cellWidth: 32 },
            4: { halign: "right", cellWidth: 32 }
        },
        didParseCell: (data) => {
            if (data.section === "body" && data.row.index === rows.length - 1) data.cell.styles.fontStyle = "bold";
        },
        margin: { left: 14, right: 14 }
    });

    doc.save("DentCare Billing Summary " + localDateKey() + ".pdf");
    showToast("Billing summary downloaded.", "success");
}

/** The bills on the Billing screen as one tidy list, with a TOTAL row. */
function exportFinancialExcel() {
    if (typeof retryWithReportLibraries === "function" &&
        retryWithReportLibraries(["xlsx"], exportFinancialExcel)) return;
    if (typeof XLSX === 'undefined') {
        showToast("Excel Library loading error. Please refresh.", "error");
        return;
    }

    if (allStaffInvoices.length === 0) {
        showToast("No bills to export.", "warning");
        return;
    }
    if (allStaffInvoices.some(b => b.amounts_invalid)) {
        showToast("A bill has invalid amounts. Review it before exporting the spreadsheet.", "error");
        return;
    }

    const { bills } = billsForExport();
    const sum = key => money(bills.reduce((t, b) => t + money(b[key]), 0));

    const rows = [["Date", "Bill no.", "Patient", "Treatment", "Charged", "Discount",
                   "Extra fees", "Amount due", "Paid", "Still unpaid", "Status"]];
    bills.forEach(b => rows.push([
        b.billingDate || "", String(b.invoice_id).substring(0, 6).toUpperCase(),
        b.patientName || "", b.treatment_name || "",
        money(b.total_amount), money(b.discount), money(b.additional_fees),
        money(b.due_amount), money(b.amount_paid), money(b.balance), b.payment_status || ""
    ]));
    rows.push(["", "TOTAL", "", "", sum("total_amount"), sum("discount"), sum("additional_fees"),
               sum("due_amount"), sum("amount_paid"), sum("balance"), ""]);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook,
        financeSheet(rows, [12, 10, 26, 26, 12, 11, 11, 13, 12, 13, 14], () => true, true),
        "Bills");
    XLSX.writeFile(workbook, "DentCare Bills " + localDateKey() + ".xlsx");
    showToast("Bills spreadsheet downloaded.", "success");
}


// ─────────────────────────────────────────────────────────────
// Closing out a year
// ─────────────────────────────────────────────────────────────
//
// ── WHY THIS IS FILED BY YEAR AND THE PATIENT RECORD IS NOT ──────────────
//
// A patient history is one living record that keeps being added to, so it is
// exported per person and always current — see js/patient-history.js. Money is
// the opposite: a financial year is a closed book, and "what did the clinic
// take in 2026" is a question with one permanent answer. Same export idea, two
// different shapes, because the two things genuinely are different shapes.
//
// ── IT COUNTS MONEY RECEIVED, NOT MONEY BILLED ───────────────────────────
//
// Dated by paymentDate, not by when the bill was raised. A treatment done in
// December and settled in January is January's income; counting it in December
// would credit the clinic for money it did not have. That also means these
// figures will not match the "Billed in total" tile above, and are not meant to.
//
// ── WHAT IT CAN AND CANNOT TELL YOU ABOUT EXPENSES ───────────────────────
//
// The clinic's real outgoings are supplies — cotton, tissue, anaesthetic. Those
// are already logged the moment a delivery arrives, so a restock movement now
// carries what it cost, and the stock ledger doubles as the expenses book. No
// second place to type anything, and the person who unpacks the box is the
// person who has the receipt in their hand.
//
// Only restocks count. Using stock costs nothing at the moment it is used — it
// was paid for when it arrived — and counting both is how a set of books stops
// agreeing with a bank statement.
//
// What is still NOT here: rent, salaries, utilities, equipment. So "income less
// recorded supplies" is exactly that and is NOT net profit, and the summary
// sheet says so in those words rather than leaving somebody to assume.

/** "A1"-style cell address for a zero-based row and column. */
function financeCellRef(r, c) {
    let col = "";
    for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) {
        col = String.fromCharCode(65 + ((n - 1) % 26)) + col;
    }
    return col + (r + 1);
}

/**
 * One worksheet from rows of plain values.
 *
 * @param {Array[]} rows        the sheet, row by row
 * @param {number[]} widths     column widths, in characters
 * @param {function} isMoney    (row, col) -> true when a number there is pesos
 * @param {boolean} [filter]    put Excel's filter buttons on the header row
 *
 * Numbers stay numbers. Only their display format changes, so a sum in Excel
 * still works. The TOTAL row is left out of the filter range, so sorting
 * never drags it into the middle of the list.
 */
function financeSheet(rows, widths, isMoney, filter) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = widths.map(w => ({ wch: w }));
    rows.forEach((row, r) => row.forEach((v, c) => {
        if (typeof v !== "number" || !isMoney(r, c)) return;
        const cell = ws[financeCellRef(r, c)];
        if (cell) cell.z = "#,##0.00";
    }));
    if (filter && rows.length > 2) {
        ws["!autofilter"] = { ref: "A1:" + financeCellRef(rows.length - 2, rows[0].length - 1) };
    }
    return ws;
}

/** Years offered in the dropdown: this year and the four before it. */
function financeYearOptions() {
    const thisYear = new Date().getFullYear();
    const years = [];
    for (let y = thisYear; y >= thisYear - 4; y--) years.push(y);
    return years;
}

/**
 * Which copy of the year-export block is on screen.
 *
 * It is rendered twice — under the front desk's Billing tab and under the
 * dentist's Backup & Recovery tab — so every id in it carries the role prefix.
 * Without this, getElementById would return the staff copy for everyone and
 * the doctor's own export button would read a year from a hidden dropdown.
 */
function financePrefix() {
    return currentRole === "dentist" ? "dentist" : "staff";
}

function finEl(name) {
    return document.getElementById(financePrefix() + "-finance-" + name);
}

/** Fills the year dropdown. Called when either tab opens. */
function loadFinanceYearPicker() {
    const sel = finEl("year");
    if (!sel || sel.options.length) return;
    sel.innerHTML = financeYearOptions()
        .map(y => '<option value="' + y + '">' + y + '</option>').join("");
}

function setFinanceYearStatus(msg, kind) {
    const el = finEl("year-status");
    if (!el) return;
    el.textContent = msg || "";
    el.className = "fin-year__status" + (kind ? " fin-year__status--" + kind : "");
}

/**
 * A row per month, seeded at zero.
 *
 * Built up front so a quiet month reports as zero rather than being missing
 * from the sheet — a gap in a financial report reads as lost data, and the
 * clinic closes for stretches of the year.
 */
function emptyFinanceMonths(year) {
    const names = ["January", "February", "March", "April", "May", "June",
                   "July", "August", "September", "October", "November", "December"];
    return names.map((name, i) => ({
        key: String(year) + "-" + String(i + 1).padStart(2, "0"),
        Month: name, Collected: 0, Spent: 0, Payments: 0, InvoicesRaised: 0, Billed: 0
    }));
}

/**
 * Export one year's income as a multi-sheet workbook.
 *
 * Staff and admin only. firestore.rules refuses a dentist every read this
 * makes, so the guard is the rule's, not a UI preference.
 */
function exportFinancialYear() {
    // Every clinician, not just the front desk.
    //
    // Dr. Gapit keeps the blue record book — this export IS that book, so
    // refusing it to her would hand the clinic's accounts to everyone except
    // the person who writes them up. firestore.rules agrees: billing and
    // payments are readable by any clinician as of 2026-09-03. Recording a
    // payment is still staff-only, and that is a different function.
    if (!canReadClinicFinances()) {
        showToast("Only the clinic can export its finances.", "error");
        return;
    }
    if (typeof retryWithReportLibraries === "function" &&
        retryWithReportLibraries(["xlsx"], exportFinancialYear)) return;
    if (typeof XLSX === "undefined") {
        showToast("The spreadsheet library did not load. Reload the page and try again.", "error");
        return;
    }

    const sel = finEl("year");
    const year = sel ? Number(sel.value) : new Date().getFullYear();
    if (!year) return;

    const btn = finEl("year-btn");
    if (btn) btn.disabled = true;
    setFinanceYearStatus("Reading " + year + "…");

    // Dates are stored as "YYYY-MM-DD" strings, so a string range IS a date
    // range: "2026-01-01" to "2026-12-31" sorts exactly as the calendar does.
    const from = year + "-01-01";
    const to   = year + "-12-31";

    Promise.all([
        db.collection("payments")
          .where("paymentDate", ">=", from).where("paymentDate", "<=", to).get(),
        db.collection("billing")
          .where("billingDate", ">=", from).where("billingDate", "<=", to).get(),
        // The expense side. Money leaves the clinic when supplies are DELIVERED,
        // so a restock movement carrying a cost is a purchase — and the stock
        // ledger the front desk already keeps becomes the expenses book with no
        // second place to type anything.
        //
        // Only restocks are read. Using stock costs nothing at the moment it is
        // used; it was paid for when it arrived, and counting both is how a set
        // of books stops agreeing with a bank statement.
        db.collection("inventory_movements")
          .where("movementDate", ">=", from).where("movementDate", "<=", to).get(),
        // Voided receipts are left out of every income figure. A void copies
        // its receipt's paymentDate, so the same date range finds them.
        // A refusal makes income unknowable: voided receipts would be counted
        // as collected. Stop the export instead of writing a misleading book.
        db.collection("payment_voids")
          .where("paymentDate", ">=", from).where("paymentDate", "<=", to).get(),
        // HMO parts Dr. Gapit collected this year (Task 25). Income on the day
        // she collected them, under "HMO", like a receipt.
        db.collection("billing")
          .where("hmoCollectedDate", ">=", from).where("hmoCollectedDate", "<=", to).get()
    ])
    .then(results => {
        const voidedIds = {};
        results[3].forEach(d => { voidedIds[d.id] = true; });

        const payments = [];
        results[0].forEach(d => {
            if (voidedIds[d.id]) return;
            payments.push(Object.assign({ id: d.id }, d.data()));
        });
        results[4].forEach(d => {
            const b = d.data();
            const day = String(b.hmoCollectedDate || "");
            if (b.hmoStatus !== "Collected" || day < from || day > to) return;
            payments.push({
                id: "hmo-" + d.id, billingId: d.id, patientId: b.patientId,
                patientName: b.patientName || "", amountPaid: b.hmoAmount,
                paymentMethod: "HMO", referenceNumber: b.hmoProvider || "",
                paymentDate: day, receivedByName: b.hmoCollectedByName || ""
            });
        });
        const bills = [];
        results[1].forEach(d => bills.push(Object.assign({ id: d.id }, d.data())));
        const purchases = [];
        results[2].forEach(d => {
            const m = d.data();
            if (m.reason === "restock" && m.totalCost !== undefined &&
                (typeof m.totalCost !== "number" || !isFinite(m.totalCost) || m.totalCost < 0)) {
                throw new Error("A supply delivery has an invalid cost.");
            }
            // A movement with no cost on it is not an expense record — it is a
            // stock movement somebody logged without the receipt. Counting it
            // as zero would understate the year rather than leave it out.
            if (m.reason === "restock" && Number(m.totalCost) > 0) {
                purchases.push(Object.assign({ id: d.id }, m));
            }
        });

        if (!payments.length && !bills.length && !purchases.length) {
            setFinanceYearStatus("Nothing was recorded in " + year + ".", "warn");
            showToast("No payments or bills in " + year + ".", "warning");
            return;
        }
        if (payments.some(p => typeof p.amountPaid !== "number" || !isFinite(p.amountPaid) || p.amountPaid < 0) ||
            bills.some(b => billFigures(b).amountsInvalid)) {
            throw new Error("A payment or bill has an invalid amount.");
        }

        const collected   = payments.reduce((s, p) => s + money(p.amountPaid), 0);
        const billed      = bills.reduce((s, b) => s + money(b.totalAmount), 0);
        const billFees    = bills.reduce((s, b) => s + billFigures(b).fees, 0);
        const billDiscounts = bills.reduce((s, b) => s + billFigures(b).discount, 0);
        const billDueTotal = bills.reduce((s, b) => s + billFigures(b).due, 0);
        const paidOnBills = bills.reduce((s, b) => s + billFigures(b).paid, 0);
        const hmoOnBills  = bills.reduce((s, b) => s + billFigures(b).hmo, 0);
        const outstanding = bills.reduce((s, b) => s + billFigures(b).balance, 0);
        const balancesNeedReview = bills.some(b => billFigures(b).balanceMismatch);
        const spent       = purchases.reduce((s, m) => s + money(m.totalCost), 0);

        // ── By month: money in and money out ──────────────────────────────
        const months = emptyFinanceMonths(year);
        const monthAt = (dateStr) => {
            const key = String(dateStr || "").slice(0, 7);
            for (let i = 0; i < months.length; i++) {
                if (months[i].key === key) return months[i];
            }
            return null;
        };
        payments.forEach(p => {
            const m = monthAt(p.paymentDate);
            if (!m) return;
            m.Collected += money(p.amountPaid);
            m.Payments += 1;
        });
        bills.forEach(b => {
            const m = monthAt(b.billingDate);
            if (!m) return;
            m.InvoicesRaised += 1;
            m.Billed += money(b.totalAmount);
        });
        purchases.forEach(pu => {
            const m = monthAt(pu.movementDate);
            if (!m) return;
            m.Spent += money(pu.totalCost);
        });

        // ── By treatment ──────────────────────────────────────────────────
        //
        // A payment is grouped by the bill it settled, so the money lands
        // against the procedure it paid for.
        const billById = {};
        bills.forEach(b => { billById[b.id] = b; });

        const byTreatment = {};
        const bump = (name, field, amount) => {
            const key = name || "Unspecified";
            if (!byTreatment[key]) {
                byTreatment[key] = { Treatment: key, InvoicesRaised: 0, Billed: 0, Collected: 0 };
            }
            byTreatment[key][field] += amount;
        };
        bills.forEach(b => {
            bump(b.treatmentName, "InvoicesRaised", 1);
            bump(b.treatmentName, "Billed", money(b.totalAmount));
        });
        payments.forEach(p => {
            const b = billById[p.billingId];
            // A payment settling a bill from an earlier year is still this
            // year's income. It has no treatment name to hand here, so it is
            // grouped under its own label rather than dropped or mislabelled.
            bump(b ? b.treatmentName : "Settling an earlier year",
                 "Collected", money(p.amountPaid));
        });

        // ── By payment method ─────────────────────────────────────────────
        const byMethod = {};
        payments.forEach(p => {
            const key = p.paymentMethod || "Unspecified";
            if (!byMethod[key]) byMethod[key] = { Method: key, Payments: 0, Collected: 0 };
            byMethod[key].Payments += 1;
            byMethod[key].Collected += money(p.amountPaid);
        });

        const patientsPaid = {};
        payments.forEach(p => { if (p.patientId) patientsPaid[p.patientId] = true; });

        const unpaidBills = bills.filter(b => billFigures(b).balance > 0.009);

        // ══ THE WORKBOOK, laid out like the clinic's books (2026-09-16) ═══════
        //
        // The clinic opened the old seven-sheet workbook and could not read it:
        // column names like "InvoicesRaised", breakdowns before the basics, and
        // no running figure anywhere. A small practice keeps a cash book: money
        // in, money out, in date order, with a running total. So the workbook
        // now is:
        //
        //   Summary            month by month: money in, money out, in minus out,
        //                      a TOTAL row, then "at a glance", by payment method,
        //                      by treatment, and the notes that stop it being
        //                      misread as profit
        //   Ledger             every payment and every supply purchase in date
        //                      order, with a running total
        //   Payments received  the receipts, with a TOTAL
        //   Supplies bought    the deliveries with a cost, with a TOTAL
        //   Unpaid bills       this year's bills that still have a balance
        //
        // Headers are plain words. Money cells are real numbers with a
        // #,##0.00 format, so Excel can still add them up. Every list ends in
        // a TOTAL row that matches the Summary.
        const wb = XLSX.utils.book_new();
        const exportedBy = (typeof currentUser !== "undefined" && currentUser) ? currentUser : "";
        const r2 = v => money(v);

        // ── Sheet 1: Summary ──────────────────────────────────────────────
        const summary = [
            ["DentCare income and supplies, " + year],
            ["Exported", new Date().toLocaleString()],
            ["Exported by", exportedBy],
            [],
            ["Month", "Money in", "Money out", "In minus out"]
        ];
        months.forEach(m => summary.push([m.Month, r2(m.Collected), r2(m.Spent), r2(m.Collected - m.Spent)]));
        summary.push(["TOTAL", r2(collected), r2(spent), r2(collected - spent)]);
        const summaryTotalRow = summary.length - 1;

        summary.push([]);
        summary.push(["At a glance", "How many", "Amount"]);
        summary.push(["Payments received", payments.length, r2(collected)]);
        summary.push(["Patients who paid", Object.keys(patientsPaid).length, ""]);
        summary.push(["Supply deliveries with a cost", purchases.length, r2(spent)]);
        summary.push(["Bills raised this year", bills.length, r2(billed)]);
        summary.push(["Additional fees on those bills", "", r2(billFees)]);
        summary.push(["Discounts on those bills", "", r2(billDiscounts)]);
        summary.push(["Amount due on those bills", "", r2(billDueTotal)]);
        summary.push(["Paid on those bills", "", r2(paidOnBills)]);
        if (hmoOnBills > 0) summary.push(["Charged to an HMO on those bills", "", r2(hmoOnBills)]);
        summary.push(["Still unpaid on those bills", unpaidBills.length, r2(outstanding)]);

        summary.push([]);
        summary.push(["By payment method", "How many", "Amount"]);
        Object.keys(byMethod).sort().forEach(k =>
            summary.push([byMethod[k].Method, byMethod[k].Payments, r2(byMethod[k].Collected)]));

        summary.push([]);
        summary.push(["By treatment", "Bills raised", "Charged", "Received"]);
        Object.keys(byTreatment).sort().forEach(k => {
            const t = byTreatment[k];
            summary.push([t.Treatment, t.InvoicesRaised, r2(t.Billed), r2(t.Collected)]);
        });

        summary.push([]);
        summary.push(["NOTES"]);
        summary.push(["Money in",
            "Payments actually received, counted on the day they were received, not the day " +
            "the bill was raised. Voided receipts are left out. An HMO's part counts on the day " +
            "Dr. Gapit marked it collected, under HMO."]);
        summary.push(["Bill equation",
            "Charged plus additional fees less discounts equals amount due. Amount due less paid " +
            "and less the part charged to an HMO equals still unpaid. A bill may be paid in a " +
            "different year, so paid on those bills can differ from this year's money in."]);
        summary.push(["Money out", purchases.length
            ? "Supply deliveries, counted when they arrived, at the cost typed in when the " +
              "delivery was logged. Using stock is not counted again."
            : "No delivery costs were recorded in " + year + ", so this workbook shows income " +
              "only. Type the cost when logging a delivery on the Inventory tab and it will " +
              "appear here."]);
        summary.push(["Not profit",
            "Rent, salaries, utilities and equipment are not in DentCare, so In minus out " +
            "is NOT net profit."]);
        if (balancesNeedReview) summary.push(["Account review",
            "One or more saved balances disagree with charge plus fees less discount and paid. " +
            "Outstanding is recalculated; review the affected bills in Patient History."]);

        // After the monthly TOTAL, column B holds counts, not pesos.
        XLSX.utils.book_append_sheet(wb,
            financeSheet(summary, [30, 16, 16, 16], (r, c) => !(r > summaryTotalRow && c === 1)),
            "Summary");

        // ── Sheet 2: Ledger ───────────────────────────────────────────────
        const entries = [];
        payments.forEach(p => {
            const t = (billById[p.billingId] || {}).treatmentName;
            entries.push({
                date: p.paymentDate || "", order: 0,
                what: "Payment from " + (p.patientName || "a patient") + (t ? " (" + t + ")" : ""),
                kind: "Patient payment",
                ref: [p.paymentMethod, p.referenceNumber].filter(Boolean).join(" · "),
                moneyIn: money(p.amountPaid), moneyOut: 0
            });
        });
        purchases.forEach(pu => {
            const qty = Number(pu.changeQty) || 0;
            entries.push({
                date: pu.movementDate || "", order: 1,
                what: "Supplies: " + (pu.itemName || "item") + (qty ? " x " + qty : ""),
                kind: "Supplies",
                ref: pu.note || "",
                moneyIn: 0, moneyOut: money(pu.totalCost)
            });
        });
        // Date order; on the same day, money in before money out.
        entries.sort((x, y) => String(x.date).localeCompare(String(y.date)) || x.order - y.order);

        const ledger = [["Date", "Description", "Type", "Method / receipt", "Money in", "Money out", "Running total"]];
        let running = 0;
        entries.forEach(e => {
            running = money(running + e.moneyIn - e.moneyOut);
            ledger.push([e.date, e.what, e.kind, e.ref,
                         e.moneyIn ? e.moneyIn : "", e.moneyOut ? e.moneyOut : "", running]);
        });
        ledger.push(["", "TOTAL", "", "", r2(collected), r2(spent), r2(collected - spent)]);
        XLSX.utils.book_append_sheet(wb,
            financeSheet(ledger, [12, 44, 16, 22, 14, 14, 15], () => true, true),
            "Ledger");

        // ── Sheet 3: Payments received ────────────────────────────────────
        const payList = [["Date", "Patient", "Treatment", "Method", "Reference", "Amount", "Received by"]];
        payments.slice()
            .sort((x, y) => String(x.paymentDate).localeCompare(String(y.paymentDate)))
            .forEach(p => payList.push([
                p.paymentDate || "", p.patientName || "",
                (billById[p.billingId] || {}).treatmentName || "Settling an earlier year",
                p.paymentMethod || "", p.referenceNumber || "",
                money(p.amountPaid), p.receivedByName || ""
            ]));
        payList.push(["", "TOTAL", "", "", "", r2(collected), ""]);
        XLSX.utils.book_append_sheet(wb,
            financeSheet(payList, [12, 26, 24, 12, 16, 14, 18], () => true, true),
            "Payments received");

        // ── Sheet 4: Supplies bought ──────────────────────────────────────
        const supList = [["Date", "Item", "Quantity", "Unit cost", "Total cost", "Receipt / note", "Logged by"]];
        purchases.slice()
            .sort((x, y) => String(x.movementDate).localeCompare(String(y.movementDate)))
            .forEach(pu => supList.push([
                pu.movementDate || "", pu.itemName || "", Number(pu.changeQty) || 0,
                money(pu.unitCost), money(pu.totalCost), pu.note || "", pu.performedByName || ""
            ]));
        supList.push(["", "TOTAL", "", "", r2(spent), "", ""]);
        if (!purchases.length) supList.splice(1, 0, ["", "No supply delivery costs were recorded in " + year + "."]);
        // Quantity (column C) is a count.
        XLSX.utils.book_append_sheet(wb,
            financeSheet(supList, [12, 28, 10, 12, 14, 30, 18], (r, c) => c !== 2, true),
            "Supplies bought");

        // ── Sheet 5: Unpaid bills ─────────────────────────────────────────
        const unpaidList = [["Bill date", "Bill no.", "Patient", "Treatment", "Charged", "Fees", "Discount", "Amount due", "Paid", "HMO", "Still unpaid"]];
        unpaidBills.slice()
            .sort((x, y) => String(x.billingDate).localeCompare(String(y.billingDate)))
            .forEach(b => {
                const f = billFigures(b);
                unpaidList.push([
                    b.billingDate || "", String(b.id).substring(0, 6).toUpperCase(),
                    b.patientName || "", b.treatmentName || "",
                    f.charged, f.fees, f.discount, f.due, f.paid, f.hmo, f.balance
                ]);
            });
        const unpaidSum = key => r2(unpaidBills.reduce((t, b) => t + billFigures(b)[key], 0));
        unpaidList.push(["", "TOTAL", "", "", unpaidSum("charged"), unpaidSum("fees"),
            unpaidSum("discount"), unpaidSum("due"), unpaidSum("paid"), unpaidSum("hmo"), r2(outstanding)]);
        if (!unpaidBills.length) unpaidList.splice(1, 0, ["", "Every bill raised in " + year + " is fully paid."]);
        XLSX.utils.book_append_sheet(wb,
            financeSheet(unpaidList, [12, 10, 26, 24, 14, 12, 12, 14, 14, 12, 14], () => true, true),
            "Unpaid bills");

        XLSX.writeFile(wb, "DentCare Finance " + year + ".xlsx");

        setFinanceYearStatus(
            year + ": " + peso(collected) + " collected across " + payments.length +
            " payment" + (payments.length === 1 ? "" : "s") +
            (purchases.length ? ", " + peso(spent) + " spent on supplies" : "") + "." +
            (balancesNeedReview ? " Some saved balances need review." : ""),
            balancesNeedReview ? "warn" : "ok");
        showToast("Exported " + year + ". Keep a copy on the clinic's drive.", "success");
    })
    .catch(err => {
        console.error("Could not export the year:", err);
        setFinanceYearStatus("Could not read all payments, voids and bills for " + year +
            ". No spreadsheet was made.", "error");
        showToast("Could not export that year.", "error");
    })
    .finally(() => {
        if (btn) btn.disabled = false;
    });
}
