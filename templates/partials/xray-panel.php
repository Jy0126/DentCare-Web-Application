<?php
/**
 * DentCare — X-ray / scanned file panel
 * ---------------------------------------------------------------------------
 * Dropped into the dentist's patient record card. Uploads go to Firebase
 * Storage under xrays/{patientUid}/, and one metadata row per file goes to
 * the `patient_files` collection so this list can be drawn without asking
 * Storage to enumerate a folder.
 *
 * Reads the same `selectedPatientId` global the rest of the record card uses,
 * so it follows whichever patient is open without needing its own selector.
 *
 * Driven by js/clinic.js. Needs BOTH firestore.rules and storage.rules
 * deployed — see the header of that file.
 */
?>
<div class="card" id="xray-panel">
    <h3><?= icon('layers') ?> 3. X-rays &amp; Scanned Files</h3>
    <p class="card-hint">
        Attach the patient&rsquo;s x-rays and scans here. They stay on this
        patient&rsquo;s record and also appear on their Patient History.
    </p>

    <div id="xray-drop" class="xray-drop"
         ondragover="onXrayDragOver(event)"
         ondragleave="onXrayDragLeave()"
         ondrop="onXrayDrop(event)">

        <input type="file" id="xray-input" multiple
               accept=".png,.jpg,.jpeg,.webp,.pdf,.dcm,application/dicom"
               style="display: none;"
               onchange="uploadXrayFiles(selectedPatientId, this.files); this.value = '';">

        <button type="button" class="btn-secondary"
                onclick="document.getElementById('xray-input').click()">
            Choose files to attach
        </button>

        <p class="xray-drop__hint">
            or drag them here &middot; PNG, JPG, WEBP, PDF or DICOM &middot; up to 20&nbsp;MB each
        </p>

        <!--
            Filled in by js/clinic.js when an upload is refused because the
            Firebase project has no Storage bucket. That is a billing setting,
            not a bug in this page, and it is the one failure the clinic cannot
            fix by trying again — so it gets a sentence rather than a toast that
            disappears.
        -->
        <p class="xray-drop__blocked hidden" id="xray-storage-note"></p>

        <div class="xray-progress">
            <span class="xray-progress__fill" id="xray-progress-fill"></span>
        </div>
    </div>

    <div class="xray-grid" id="xray-grid">
        <p class="xray-empty">Select a patient to see their files.</p>
    </div>
</div>
