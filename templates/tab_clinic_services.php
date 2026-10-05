<?php
/**
 * DentCare — Clinic tab: Manage Services
 * ---------------------------------------------------------------------------
 * The list patients choose from when they book, maintained by whoever is at
 * the front desk rather than by a developer.
 *
 * Included by BOTH the staff and the dentist dashboard, so element ids are not
 * used for anything live here — portal.php renders every role layout into one
 * document and an id would appear twice. Classes are resolved against the
 * visible layout by servicesEl(), the same fix the queue and messaging tabs
 * needed.
 *
 * Set before including:
 *   $role_prefix  string  'dentist' or 'staff'
 */

if (!isset($role_prefix)) { $role_prefix = 'staff'; }
?>
<!-- Clinic Tab: Manage Services -->
<div id="tab-<?= e($role_prefix) ?>-services" class="tab-content hidden">
    <div class="card-header">
        <h2>Manage Services</h2>
    </div>

    <div class="dashboard-flex-row">

        <!-- The list -->
        <div class="card flex-2" style="min-width: 420px;">
            <h3><?= icon('clipboard') ?> Services patients can choose</h3>
            <p class="field-hint">
                This is exactly what appears in the booking dropdown, in this order.
                Each line shows the English name with the Tagalog description underneath, so
                patients read both without having to translate anything themselves.
            </p>

            <div class="svc-admin-actions">
                <button type="button" class="btn-secondary btn-sm" onclick="seedDefaultServices()">
                    <?= icon('box') ?> Load the standard list
                </button>
                <span class="field-hint" style="margin: 0;">
                    Adds the nine Dr.&nbsp;Gapit usually offers. Safe to press twice, because
                    anything already on the list is skipped.
                </span>
            </div>

            <div class="services-admin-list">
                <p class="svc-empty">Loading services&hellip;</p>
            </div>

            <p class="field-hint" style="margin-top: 14px;">
                Rename to correct a service. Hide to pause bookings, or Delete to remove it permanently.
                Existing appointments and treatment records keep their saved details.
            </p>
        </div>

        <!-- Add one -->
        <div class="card flex-1" style="min-width: 300px;">
            <h3><?= icon('notes') ?> Add a service</h3>
            <p class="field-hint">
                For anything not on the standard list. It appears at the bottom of the
                dropdown straight away.
            </p>

            <form class="svc-add-form" onsubmit="addService(event)">
                <label>Service name
                    <input maxlength="150" type="text" class="svc-new-name" required autocomplete="off"
                           placeholder="e.g. Retainer Repair">
                </label>
                <label>Tagalog description
                    <input maxlength="500" type="text" class="svc-new-desc" autocomplete="off"
                           placeholder="e.g. Pag-aayos ng retainer">
                </label>
                <button type="submit" class="btn-secondary btn-sm">Add to the list</button>
            </form>

            <div class="notice" style="margin-top: 18px;">
                <?= icon('info') ?>
                <p>
                    <strong>No prices here, on purpose.</strong> Dr.&nbsp;Gapit sets the fee
                    after she has examined the patient, on the completion form. A price shown
                    at booking would commit her to a number before she has seen the mouth.
                </p>
            </div>
        </div>

    </div>
</div>
