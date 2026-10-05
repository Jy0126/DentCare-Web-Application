<?php
/**
 * DentCare — Inventory modals
 * ---------------------------------------------------------------------------
 * Included by portal.php. Both are driven by js/inventory.js.
 *
 * The adjust-stock form deliberately asks what happened rather than offering a
 * bare plus and minus: the reason is what makes the movement history worth
 * reading later. The direction is derived from the reason, so nobody has to
 * work out whether an entry should be positive or negative.
 */
?>

<!-- Adjust the stock level of one supply item -->
<div id="modal-adjust-stock" class="modal-overlay">
    <div class="modal-card" style="max-width: 480px;">
        <div class="modal-header">
            <h3>Adjust stock</h3>
            <button type="button" class="modal-close-btn" aria-label="Close"
                    onclick="closeModal('modal-adjust-stock')">&times;</button>
        </div>
        <div class="modal-body">
            <form id="form-adjust-stock" onsubmit="submitStockAdjust(event)">
                <input type="hidden" id="adjust-item-id">
                <input type="hidden" id="adjust-item-current">
                <input type="hidden" id="adjust-item-unit">

                <div class="summary-strip">
                    <strong id="adjust-item-name">--</strong><br>
                    Currently in stock: <span id="adjust-item-stock">--</span>
                </div>

                <!-- Set by openStockAdjust(). "Used on a patient" is removed
                     from the list below for a reusable, because sterilising a
                     mirror and using it again does not consume it. -->
                <input type="hidden" id="adjust-item-type">

                <label for="adjust-reason">What happened?</label>
                <select id="adjust-reason" onchange="applyStockCountMode()" required>
                    <option value="restock">Received new supplies</option>
                    <option value="use">Used on a patient</option>
                    <option value="wastage">Damaged, spilled or contaminated</option>
                    <option value="expired">Past expiry date</option>
                    <option value="correction_up">Count correction: found more</option>
                    <option value="correction_dn">Count correction: found fewer</option>
                    <!-- Asks how many are THERE, not how many changed. See
                         the note on submitStockCount() in js/inventory.js. -->
                    <option value="counted">I counted the shelf</option>
                </select>
                <p class="field-hint" id="adjust-reason-hint"></p>

                <!-- A take-out (used, damaged, expired) goes to Dr. Gapit for
                     approval since 2026-10-01; nothing moves until she
                     approves it. Shown by applyStockCountMode(). -->
                <p class="adjust-approval-note" id="adjust-approval-note" hidden>
                    Sent to Dr. Gapit for approval. The stock does not change until she approves it.
                </p>

                <!-- Which visit it was used for, when it was used on a
                     patient: today's and yesterday's completed visits.
                     Filled by fillStockVisitPicker() in js/stock-requests.js. -->
                <div id="adjust-visit-wrap" hidden>
                    <label for="adjust-visit">For which visit? (optional)</label>
                    <select id="adjust-visit">
                        <option value="">Not for a particular visit</option>
                    </select>
                </div>

                <label for="adjust-qty" id="adjust-qty-label">How many units?</label>
                <input type="number" id="adjust-qty" min="1" step="1" value="1"
                       oninput="updateAdjustPreview()" required>

                <p id="adjust-preview" class="adjust-preview"></p>

                <!--
                    What the delivery cost. Shown only for a restock, because
                    that is the only movement where money leaves the clinic —
                    using stock costs nothing at the moment it is used, it was
                    paid for when it arrived. Optional: a blank cost records the
                    delivery exactly as before, so nobody is blocked from
                    logging stock because the receipt is not to hand.
                -->
                <div id="adjust-cost-wrap" hidden>
                    <label for="adjust-cost">What did this delivery cost? (optional)</label>
                    <input type="number" id="adjust-cost" min="0" step="0.01"
                           placeholder="Total for the whole delivery, in pesos">
                    <p class="field-hint">
                        Leave blank if you do not know it. Filling it in is what lets the
                        year-end export show expenses beside income.
                    </p>
                </div>

                <label for="adjust-note">Note (optional)</label>
                <input maxlength="300" type="text" id="adjust-note" placeholder="E.g. delivery receipt no., or which patient">

                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="closeModal('modal-adjust-stock')">Cancel</button>
                    <button type="submit" id="adjust-submit">Save adjustment</button>
                </div>
            </form>
        </div>
    </div>
</div>

<!-- Every recorded movement for one supply item -->
<div id="modal-stock-history" class="modal-overlay">
    <div class="modal-card" style="max-width: 560px;">
        <div class="modal-header">
            <h3>Stock history: <span id="stock-history-item">--</span></h3>
            <button type="button" class="modal-close-btn" aria-label="Close"
                    onclick="closeModal('modal-stock-history')">&times;</button>
        </div>
        <div class="modal-body" id="stock-history-body"></div>
        <div class="modal-footer">
            <button class="btn-secondary" onclick="closeModal('modal-stock-history')">Close</button>
        </div>
    </div>
</div>

<!-- Earliest expiry date of one supply item (js/inventory.js: openExpiryEditor).
     One date per item: the nearest one on the shelf. The notification bell
     warns 30 days ahead and again once it has passed. -->
<div id="modal-item-expiry" class="modal-overlay">
    <div class="modal-card" style="max-width: 420px;">
        <div class="modal-header">
            <h3>Expiry date</h3>
            <button type="button" class="modal-close-btn" aria-label="Close"
                    onclick="closeModal('modal-item-expiry')">&times;</button>
        </div>
        <div class="modal-body">
            <form id="form-item-expiry" onsubmit="submitItemExpiry(event)">
                <input type="hidden" id="expiry-item-id">
                <div class="summary-strip"><strong id="expiry-item-name">--</strong></div>
                <label for="expiry-date">Earliest expiry date on the shelf</label>
                <input type="date" id="expiry-date">
                <p class="field-hint">If boxes expire on different dates, enter the soonest.
                    After using up or discarding that batch, change it to the next date.
                    Leave it empty to stop tracking expiry for this item.</p>
                <div class="modal-footer" style="padding: var(--space-s) 0 0; border-top: none;">
                    <button type="button" class="btn-secondary" onclick="closeModal('modal-item-expiry')">Cancel</button>
                    <button type="submit" id="expiry-save-btn">Save</button>
                </div>
            </form>
        </div>
    </div>
</div>
