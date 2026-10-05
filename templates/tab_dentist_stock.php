<!--
    Dentist Tab: Stock Approvals (2026-10-01)
    ---------------------------------------------------------------------------
    Dr. Gapit no longer picks supplies when she records a visit. The front desk
    files what was used, damaged or expired in Medical Inventory, and it comes
    off the shelf only when she approves it here. Approving lowers the item and
    writes the Stock History row, in one transaction (js/stock-requests.js).
-->
<div id="tab-dentist-stock" class="tab-content hidden">
    <div class="card-header">
        <h2>Stock Approvals</h2>
    </div>

    <div class="card">
        <h3>Waiting for your approval</h3>
        <p class="card-hint">
            Review the entries from the front desk. Select several and approve them together.
            Stock changes only after your approval.
        </p>
        <div class="stock-bulk">
            <div class="stock-bulk__actions">
                <label><input type="checkbox" id="stock-select-all" onchange="selectAllStockRequests(this.checked)"> Select all available entries</label>
                <button type="button" id="stock-approve-selected" onclick="approveSelectedStockRequests()" disabled>Review selected (0)</button>
            </div>
            <p id="stock-selected-summary" class="stock-bulk__summary">Select entries to see the combined stock deduction.</p>
            <p id="stock-bulk-result" class="stock-bulk__result" role="status"></p>
        </div>
        <div id="stock-approvals-list" aria-live="polite">
            <p class="field-hint">Loading&hellip;</p>
        </div>
    </div>

    <div class="card">
        <h3>Recently decided</h3>
        <div id="stock-approvals-recent">
            <p class="field-hint">Loading&hellip;</p>
        </div>
    </div>
</div>
