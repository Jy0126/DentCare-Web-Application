<!-- Staff Tab: Medical Inventory -->
<div id="tab-staff-inventory" class="tab-content hidden">
    <div class="card-header">
        <h2>Medical Supplies &amp; Inventory</h2>
    </div>

    <!-- Low stock and negative-count warnings, filled by loadStaffInventory() -->
    <div id="inventory-alert-container"></div>

    <!-- Take-outs waiting for Dr. Gapit, and her recent decisions (2026-10-01).
         Filled by renderStaffStockRequests() in js/stock-requests.js; hidden
         while there is nothing to show. -->
    <section id="inventory-requests" class="card inventory-requests" aria-live="polite" hidden></section>

    <div class="dashboard-flex-row inventory-layout">
        <!-- Stock items listing -->
        <div class="card flex-2">
            <h3>Current supplies</h3>
            <p class="card-hint">
                To record supplies used during treatment, choose Adjust on the item, then Used on a patient.
                Enter the quantity, optionally choose the visit, then send it to Dr. Gapit. Stock is deducted only after her approval.
            </p>
            <div class="table-container inventory-table-container" data-freeze>
                <table class="inventory-table">
                    <thead>
                        <tr>
                            <th>Item name</th>
                            <th data-card="badge">Type</th>
                            <th class="num">In stock</th>
                            <th class="num">Min level</th>
                            <th>Status</th>
                            <th data-card="actions">Stock</th>
                            <th data-card="actions">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="staff-inventory-table">
                        <tr>
                            <td colspan="7" style="text-align: center;">Loading supplies inventory...</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Add new item form -->
        <div class="card flex-1">
            <h3>Add supply item</h3>
            <form id="form-add-inventory" onsubmit="submitNewInventory(event)">
                <label for="inv-name">Item name</label>
                <input maxlength="150" type="text" id="inv-name" placeholder="E.g. Disposable gloves" required>

                <label for="inv-type">Item type</label>
                <select id="inv-type" required onchange="applyInventoryExpiryMode()">
                    <option value="consumable">Consumable: used up during treatment</option>
                    <option value="reusable">Reusable: sterilised and used again</option>
                </select>

                <label for="inv-qty">Starting quantity</label>
                <input type="number" id="inv-qty" min="0" value="10" required>

                <label for="inv-unit">Unit of measure</label>
                <select id="inv-unit" required>
                    <option value="pcs">pieces (pcs)</option>
                    <option value="boxes">boxes</option>
                    <option value="packs">packs</option>
                    <option value="vials">vials</option>
                    <option value="carpules">carpules</option>
                    <option value="compules">compules</option>
                    <option value="tubs">tubs</option>
                    <option value="pairs">pairs</option>
                </select>

                <label for="inv-min">Low stock alert level</label>
                <input type="number" id="inv-min" min="0" value="5" required>

                <!-- Expiry is asked only where it means something (owner,
                     2026-09-25): a consumable that expires, like medicine or
                     anesthesia. Reusable instruments never see it, and the date
                     box appears, required, only after Yes.
                     applyInventoryExpiryMode() in js/inventory.js. -->
                <fieldset id="inv-expires-wrap" class="inv-expires">
                    <legend>Does this item expire? <span class="inv-expires__eg">(medicine, anesthesia)</span></legend>
                    <label class="inv-expires__opt">
                        <input type="radio" name="inv-expires" value="no" checked onchange="applyInventoryExpiryMode()"> No
                    </label>
                    <label class="inv-expires__opt">
                        <input type="radio" name="inv-expires" value="yes" onchange="applyInventoryExpiryMode()"> Yes
                    </label>
                </fieldset>

                <div id="inv-expiry-wrap" class="hidden">
                    <label for="inv-expiry">Expiry date <span class="field-req">*</span></label>
                    <input type="date" id="inv-expiry">
                    <p class="field-hint">The earliest date printed on the packs you have.
                        The notification bell warns 30 days before it.</p>
                </div>

                <button type="submit" style="width: 100%; margin-top: var(--space-s);">Add supply item</button>
            </form>

            <p class="card-hint" style="margin-top: var(--space-s);">
                Count in the smallest unit you actually handle: carpules rather than vials,
                pairs rather than boxes. It keeps the numbers whole and matches what you
                count on the shelf.
            </p>
        </div>
    </div>
</div>
