<?php
/**
 * DentCare — X-ray panel, locked (uploads off)
 * ---------------------------------------------------------------------------
 * Stands in for partials/xray-panel.php while DENTCARE_XRAY_UPLOADS is false.
 *
 * Same id and same heading as the real panel, so the X-rays shortcut on the
 * open-patient card (jumpToXrays() in js/clinic.js) still lands here. What it
 * deliberately does NOT have are the ids js/clinic.js drives — xray-input,
 * xray-grid, xray-drop, xray-progress-fill. loadXrayFiles() returns as soon as
 * it cannot find xray-grid, so nothing on this panel reads patient_files or
 * touches Storage, whose SDK is not even loaded while uploads are off.
 */
?>
<div class="card" id="xray-panel">
    <h3><?= icon('layers') ?> 3. X-rays &amp; Scanned Files</h3>
    <p class="card-hint">
        When switched on, the patient&rsquo;s x-rays and scans are attached here. They stay
        on this patient&rsquo;s record and also appear on their Patient History.
    </p>

    <?php include __DIR__ . '/xray-upgrade-note.php'; ?>

    <div class="xray-drop xray-drop--locked" aria-disabled="true">
        <button type="button" class="btn-secondary" disabled>
            Choose files to attach
        </button>
        <p class="xray-drop__hint">
            PNG, JPG, WEBP, PDF or DICOM &middot; up to 20&nbsp;MB each &middot; available after the upgrade
        </p>
    </div>
</div>
