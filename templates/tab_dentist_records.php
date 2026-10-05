<!-- Dentist Tab: Clinical Logs & Dental Records -->
<div id="tab-dentist-records" class="tab-content hidden">
    <div class="card-header">
        <h2>Treatment Logs</h2>
    </div>

    <!-- Active Patient Selection Banner -->
    <div class="card card--picker" id="records-patient-panel">
        <h3>Select Patient</h3>
        <div class="search-container">
            <span class="search-icon"><?= icon('search') ?></span>
            <input type="text" class="search-input" id="records-patient-search" placeholder="Search by name, or scroll the list below" oninput="renderRecordsPatientList()">
        </div>
        <div class="picker-tools">
            <label class="picker-sort" for="records-patient-sort">
                <span>Sort by</span>
                <select id="records-patient-sort" onchange="renderRecordsPatientList()">
                    <option value="name-asc">Last name (A to Z)</option>
                    <option value="name-desc">Last name (Z to A)</option>
                    <option value="age-asc">Youngest first</option>
                    <option value="age-desc">Oldest first</option>
                </select>
            </label>
            <span class="picker-count" id="records-patient-count"></span>
        </div>

        <!-- Same scrollable list as the charting tab: everyone registered,
             filtered by the search box above. -->
        <div class="patient-picker" id="records-patient-list">
            <p class="picker-empty">Loading patients&hellip;</p>
        </div>
    </div>

    <!--
        Replaces the picker once a patient is open — the same strip, and the
        same class names, that the charting tab uses.

        This used to sit INSIDE the picker card above, so choosing somebody
        emptied the list but left the whole panel standing: heading, search
        box, sort dropdown and a tall empty gap, with the patient name below
        it and the treatment log pushed off the bottom of the screen. The
        clinic reported it as the list "still being big".
    -->
    <!-- Shown when this record changes on another screen while it is open
         (2026-10-02, R20, watchOpenRecord in js/app.js). It is not redrawn
         under the reader; "Show the latest" reloads it. -->
    <div class="record-updated-bar hidden" id="records-updated-bar" role="status">
        <span>This record was updated on another screen.</span>
        <button type="button" class="btn-secondary btn-sm">Show the latest</button>
    </div>
    <div class="card hidden" id="records-active-patient-card">
        <div class="active-pt">
            <div>
                <h3 class="active-pt__name" id="records-patient-name">Patient Name</h3>
                <p class="active-pt__meta" id="records-patient-meta">Age: -- | Gender: -- | Contact: --</p>
            </div>
            <button type="button" class="btn-secondary btn-sm" onclick="showAllRecordsPatients()">
                Change patient
            </button>
        </div>
    </div>

    <!--
        ── READ AND CORRECT, NOT A SECOND WAY TO RECORD (clinic request, 2026-09-15) ──

        This tab used to open with "Log New Procedure": a form that wrote a
        treatment log with no appointment, a fixed menu of materials that moved
        no stock, and a bill raised on the side. The clinic asked what it was for,
        and the honest answer was nothing a visit does not already do better.
        Daily Appointments -> Complete visit writes the log, the chart, the
        supplies taken from stock and the charge in one transaction.

        So the form is gone. Every treatment is recorded by completing a visit
        (walk-ins included, through the queue). This tab is where those logs are
        read, and where a mistake in one is corrected with Edit, which changes
        that same record and says who corrected it, when and why. It never
        creates a second, orphaned one.
    -->
    <div id="records-clinical-section" class="hidden">
        <div class="card records-log">
            <div class="records-log__head">
                <div>
                    <h3 class="records-log__title">Treatment history</h3>
                    <p class="records-log__hint">
                        Treatments are saved when you complete a visit in
                        <strong>Daily Appointments</strong>. Press <strong>Edit</strong>
                        on a row to correct a mistake.
                    </p>
                </div>
                <button type="button" class="btn-secondary btn-sm"
                        onclick="switchDentistTab('tab-dentist-appointments', document.getElementById('nav-dentist-appointments'))">
                    <?= icon('calendar') ?> Daily Appointments
                </button>
            </div>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Procedure</th>
                            <th>Tooth No.</th>
                            <th>Diagnosis &amp; Treatment</th>
                            <th>Prescription</th>
                            <th data-card="actions"><span class="visually-hidden">Edit</span></th>
                        </tr>
                    </thead>
                    <tbody id="dentist-patient-treatment-table">
                        <tr>
                            <td colspan="6" style="text-align: center;">No history loaded.</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</div>
