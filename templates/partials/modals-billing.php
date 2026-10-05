<?php
/**
 * DentCare — Billing modals
 * ---------------------------------------------------------------------------
 * Staff only. Driven by js/billing.js.
 */
?>

<!-- One bill: what was done, and what has been paid against it -->
<div id="modal-bill-detail" class="modal-overlay">
    <div class="modal-card" style="max-width: 900px;">
        <div class="modal-header">
            <h3 id="bill-detail-title">Bill</h3>
            <button class="modal-close-btn" aria-label="Close"
                    onclick="closeModal('modal-bill-detail')">&times;</button>
        </div>
        <div class="modal-body" id="bill-detail-body"></div>
        <div class="modal-footer">
            <button class="btn-secondary" onclick="closeModal('modal-bill-detail')">Close</button>
            <!-- Task 25: set or correct the part an HMO covers, until Dr. Gapit collects it -->
            <button class="btn-secondary hidden" id="btn-open-hmo" onclick="openHmoCharge()">Charge to HMO</button>
            <!-- Hidden by openBill() once the balance reaches zero -->
            <button class="hidden" id="btn-open-payment" onclick="openPaymentForm()">Confirm payment</button>
        </div>
    </div>
</div>

<!--
    Settling a bill at the counter.

    Everything here is typed in by whoever took the money, after the money is in
    hand. Nothing contacts InstaPay, BDO or any payment provider — the system
    records a collection, it does not process one.

    Methods are Cash, InstaPay and BDO, confirmed by Dr. Gapit 2026-08-29. Keep
    in step with PAYMENT_METHODS in js/billing.js. HMO is not a method since
    2026-10-05: it is "Charge to HMO" on the bill (Task 25, below).
-->
<div id="modal-record-payment" class="modal-overlay">
    <div class="modal-card" style="max-width: 620px;">
        <div class="modal-header">
            <h3>Confirm payment</h3>
            <button class="modal-close-btn" aria-label="Close"
                    onclick="closeModal('modal-record-payment')">&times;</button>
        </div>
        <div class="modal-body">
            <form id="form-record-payment" onsubmit="submitPayment(event)">
                <input type="hidden" id="payment-bill-id">

                <div class="summary-strip" id="payment-summary">--</div>

                <!-- A problem with the bill or the save, in red at the top of
                     the form where it is seen first (setPaymentFormAlert in
                     js/billing.js). -->
                <p id="payment-form-alert" class="form-alert hidden" role="alert"></p>

                <div class="form-row">
                    <div class="flex-1">
                        <label for="payment-discount">Discount</label>
                        <!--
                            Senior citizen, PWD, or a discretion of the clinic's.
                            Applied to the bill, not to a single payment, so it
                            still holds if the patient pays in instalments.
                        -->
                        <input type="number" id="payment-discount" min="0" step="0.01" value="0"
                               oninput="updatePaymentMaths()">
                    </div>
                    <div class="flex-1">
                        <label for="payment-extra">Additional fee</label>
                        <!-- Anything not on the price list: an extra x-ray, a
                             material the visit needed beyond the usual. -->
                        <input type="number" id="payment-extra" min="0" step="0.01" value="0"
                               oninput="updatePaymentMaths()">
                    </div>
                </div>

                <label for="payment-method">Paid by</label>
                <select id="payment-method" onchange="onPaymentMethodChanged()" required>
                    <option>Cash</option>
                    <option>InstaPay</option>
                    <option>BDO</option>
                </select>

                <label for="payment-tendered" id="payment-tendered-label">Cash received</label>
                <input type="number" id="payment-tendered" min="0.01" step="0.01"
                       oninput="updatePaymentMaths()" required>

                <!-- Amount due, what will be recorded, and the change to hand
                     back — worked out live so nobody does it in their head at
                     the counter. Filled by updatePaymentMaths(). -->
                <div class="payment-maths" id="payment-maths"></div>

                <!-- Required for InstaPay and BDO (owner, 2026-09-25): a
                     transfer without its reference cannot be traced later.
                     updatePaymentMaths() sets the label; submitPayment() checks it. -->
                <label for="payment-reference" id="payment-reference-label">Reference (not needed for cash)</label>
                <input maxlength="100" type="text" id="payment-reference" placeholder="From the app or the card slip">
                <p class="field-hint" id="payment-reference-hint"></p>

                <label for="payment-date">Date received</label>
                <input type="date" id="payment-date" required>

                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="closeModal('modal-record-payment')">Cancel</button>
                    <button type="submit">Confirm payment</button>
                </div>
            </form>
        </div>
    </div>
</div>

<!--
    Supplies used on a bill (2026-10-05). Filled from what this treatment used
    last time; saving takes them off the stock. js/billing.js, submitBillSupplies.
-->
<div id="modal-bill-supplies" class="modal-overlay">
    <div class="modal-card" style="max-width: 560px;">
        <div class="modal-header">
            <h3>Supplies used</h3>
            <button class="modal-close-btn" aria-label="Close"
                    onclick="closeModal('modal-bill-supplies')">&times;</button>
        </div>
        <div class="modal-body">
            <form id="form-bill-supplies" onsubmit="submitBillSupplies(event)" novalidate>
                <div class="summary-strip" id="bill-supplies-summary">--</div>
                <p id="bill-supplies-alert" class="form-alert hidden" role="alert"></p>
                <div id="bill-supplies-rows" class="bill-supply-rows"></div>
                <button type="button" class="btn-secondary btn-sm" onclick="addBillSupplyRow()">+ Add item</button>
                <p class="field-hint">Check the list and change anything that is different this time. Saving
                    takes these off the stock, and the list is offered again for the next bill of this treatment.</p>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="closeModal('modal-bill-supplies')">Cancel</button>
                    <button type="submit">Save</button>
                </div>
            </form>
        </div>
    </div>
</div>

<!--
    Charge to HMO (Task 25, 2026-10-05). Staff note which HMO covers the visit
    and how much; Dr. Gapit collects it from the HMO herself. No receipt is
    written: the patient pays only the rest. The list is filled from
    HMO_PROVIDERS in js/billing.js, with Other for a name typed in.
-->
<div id="modal-hmo-charge" class="modal-overlay">
    <div class="modal-card" style="max-width: 520px;">
        <div class="modal-header">
            <h3>Charge to HMO</h3>
            <button class="modal-close-btn" aria-label="Close"
                    onclick="closeModal('modal-hmo-charge')">&times;</button>
        </div>
        <div class="modal-body">
            <form id="form-hmo-charge" onsubmit="submitHmoCharge(event)" novalidate>
                <div class="summary-strip" id="hmo-summary">--</div>
                <p id="hmo-form-alert" class="form-alert hidden" role="alert"></p>

                <label for="hmo-provider">HMO</label>
                <select id="hmo-provider" onchange="onHmoProviderChanged()"></select>

                <div id="hmo-other-wrap" class="hidden">
                    <label for="hmo-other-name">HMO name</label>
                    <input type="text" id="hmo-other-name" maxlength="100" autocomplete="off"
                           placeholder="Type the HMO's name">
                </div>

                <label for="hmo-amount">Amount the HMO covers</label>
                <input type="number" id="hmo-amount" min="0" step="0.01" inputmode="decimal">
                <p class="field-hint">The patient pays the rest at the counter. To take the HMO
                    off this bill, enter 0.</p>

                <label for="hmo-note">Note (optional)</label>
                <textarea id="hmo-note" rows="2" maxlength="300"
                          placeholder="For example the LOA or approval number"></textarea>

                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="closeModal('modal-hmo-charge')">Cancel</button>
                    <button type="submit">Save</button>
                </div>
            </form>
        </div>
    </div>
</div>

<!--
    Voiding a receipt that was entered wrongly. Clinic decision, 2026-09-13:
    the front desk may void, and must say why.

    The receipt is never edited or deleted. A void is recorded beside it, and the
    bill's paid amount comes down by exactly that receipt in the same save. The
    reason list must stay in step with voidReasons() in firestore.rules — a
    reason the rules do not know is refused.
-->
<div id="modal-void-payment" class="modal-overlay">
    <div class="modal-card" style="max-width: 480px;">
        <div class="modal-header">
            <h3>Void this receipt</h3>
            <button class="modal-close-btn" aria-label="Close"
                    onclick="closeModal('modal-void-payment')">&times;</button>
        </div>
        <div class="modal-body">
            <form id="form-void-payment" onsubmit="submitVoidPayment(event)">
                <input type="hidden" id="void-payment-id">

                <div class="summary-strip" id="void-summary">--</div>

                <label for="void-reason">Why is it being voided?</label>
                <select id="void-reason" required onchange="onVoidReasonChanged()">
                    <option value="" disabled selected>Choose a reason…</option>
                    <option value="Wrong amount entered">Wrong amount entered</option>
                    <option value="Recorded on the wrong bill or patient">Recorded on the wrong bill or patient</option>
                    <option value="Recorded twice">Recorded twice</option>
                    <option value="Wrong payment method">Wrong payment method</option>
                    <option value="Others">Others (please specify)</option>
                </select>

                <div id="void-note-wrap" class="hidden">
                    <label for="void-note">Please say exactly what was wrong</label>
                    <textarea id="void-note" rows="3" maxlength="500"
                              placeholder="e.g. Patient paid at the other branch; entered here by mistake"></textarea>
                </div>

                <p class="field-hint">
                    The receipt stays on record marked VOID, with your name, the time and
                    this reason. The bill goes back to owing that amount. This cannot be undone.
                </p>

                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="closeModal('modal-void-payment')">Cancel</button>
                    <button type="submit" class="btn-danger">Void receipt</button>
                </div>
            </form>
        </div>
    </div>
</div>
