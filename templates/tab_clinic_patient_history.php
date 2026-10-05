<?php
/**
 * DentCare — Patient History (the whole record card, on one screen)
 * ---------------------------------------------------------------------------
 * Shared by the dentist and staff dashboards. Requires $role_prefix.
 *
 * ── WHAT THIS TAB IS FOR ───────────────────────────────────────────────────
 *
 * Everything the clinic knows about one person, laid out in the order the
 * paper Dental Record Card lays it out, and exportable as a file Dr. Gapit can
 * keep on the clinic's own drive.
 *
 * The other clinical tabs each hold one slice: Interactive Charting is the
 * mouth, Treatment Logs is what was done, Billing is what was owed. That is
 * right for working — you are doing one of those things at a time — and wrong
 * for the two moments this tab exists for:
 *
 *   1. A patient walks in and the doctor needs the whole picture before
 *      touching anything. Allergies, what was done last time, which teeth are
 *      already crowned.
 *   2. The clinic wants a copy off the cloud. This is the flood answer: a file
 *      per patient, on a drive somebody can hold.
 *
 * ── WHY IT IS NOT FILED BY YEAR ────────────────────────────────────────────
 *
 * A patient history is ONE living record that keeps being added to, from the
 * day they register until they stop coming. Splitting it into a 2026 folder
 * and a 2027 folder would scatter one person across directories and make the
 * current picture — the thing anyone actually needs — the hardest thing to
 * assemble. Finance is the opposite: a year there is a closed book, and that
 * export is filed by year on purpose.
 *
 * ── WHO SEES THE MONEY ─────────────────────────────────────────────────────
 *
 * CORRECTED 2026-09-05. This comment used to say the rules let staff read
 * billing and payments and refused a dentist. That stopped being true on
 * 2026-09-03, and the stale note outlived the rule by two days.
 *
 * Every clinician reads them now — firestore.rules, and canSeeAccount() in
 * js/patient-history.js. Dr. Gapit keeps the blue record book: she logs the
 * bills and holds the money, and hiding the ledger from her was hiding the
 * clinic's books from their owner rather than separating any duty.
 *
 * The separation that IS real, because it is two different people, stays:
 * only STAFF may create a payment or settle a bill. Seeing the money and
 * moving it are different permissions, and this screen is the seeing half.
 *
 * A patient never reaches this screen, and since 2026-09-30 a patient account
 * has no clinical or billing view of its own either: the rules refuse it.
 */

require_once __DIR__ . '/partials/dentition.php';
require_once __DIR__ . '/partials/tooth-glyph.php';

$prefix = $role_prefix ?? 'dentist';
?>
<div id="tab-<?php echo $prefix; ?>-history" class="tab-content hidden">
    <div class="card-header">
        <h2><?= $prefix === 'dentist' ? 'Patient Records' : 'Patient History' ?></h2>
    </div>

    <!-- ── 1. Find the patient ─────────────────────────────────────────── -->
    <div class="card card--picker" id="<?php echo $prefix; ?>-history-patient-panel">
        <h3>Find a patient</h3>
        <div class="search-container">
            <span class="search-icon"><?= icon('search') ?></span>
            <input type="text" class="search-input" id="<?php echo $prefix; ?>-history-patient-search"
                   placeholder="Search by name, or scroll the list below"
                   oninput="renderHistoryPatientList()">
        </div>
        <div class="picker-tools">
            <label class="picker-sort" for="<?php echo $prefix; ?>-history-patient-sort">
                <span>Sort by</span>
                <select id="<?php echo $prefix; ?>-history-patient-sort" onchange="renderHistoryPatientList()">
                    <option value="name-asc">Last name (A to Z)</option>
                    <option value="name-desc">Last name (Z to A)</option>
                    <option value="age-asc">Youngest first</option>
                    <option value="age-desc">Oldest first</option>
                    <option value="visit-desc">Latest visit first</option>
                </select>
            </label>
            <!-- Find patients by when they last came (2026-09-30). It narrows
                 the list already loaded, using each patient's lastVisitDate. -->
            <label class="picker-sort" for="<?php echo $prefix; ?>-history-patient-show">
                <span>Show</span>
                <select id="<?php echo $prefix; ?>-history-patient-show" onchange="onHistoryShowChange()">
                    <option value="all">All patients</option>
                    <option value="today">Seen today</option>
                    <option value="last10">Last 10 seen</option>
                    <option value="year">Last visit in&hellip;</option>
                </select>
            </label>
            <label class="picker-sort hidden" id="<?php echo $prefix; ?>-history-patient-year-wrap"
                   for="<?php echo $prefix; ?>-history-patient-year">
                <span>Year</span>
                <select id="<?php echo $prefix; ?>-history-patient-year" onchange="renderHistoryPatientList()"></select>
            </label>
            <span class="picker-count" id="<?php echo $prefix; ?>-history-patient-count"></span>
        </div>

        <div class="patient-picker" id="<?php echo $prefix; ?>-history-patient-list">
            <p class="picker-empty">Loading patients&hellip;</p>
        </div>

        <!--
            Every patient, as a folder of readable files.
            ------------------------------------------------------------
            js/backup.js already exports the whole database, and that file is
            the right one for putting the system back. It is also .json, which
            is of no use to Dr. Gapit: she cannot open it, cannot read it, and
            cannot check that it holds what she thinks it holds.

            A backup nobody can read is a backup nobody trusts, and this clinic
            has already lost its records once. So this is the other half — the
            record cards themselves, in the layout of the paper card. Take both:
            the JSON restores the system, these survive it.

            This first shipped as ONE combined PDF and the clinic rejected it on
            sight: "how can the doctor use it if it's in one bulk PDF?" They were
            right. A record card belongs to one person — you print it, you file
            it, you hand it over. So the export is a folder now, one PDF per
            patient, named surname-first the way the paper cards are filed.
        -->
        <div class="ph-bulk">
            <button type="button" id="<?php echo $prefix; ?>-history-export-all-btn"
                    class="btn-secondary" onclick="exportAllPatientRecords()">
                <?= icon("file") ?> Export ALL patient records (one file each)
            </button>
            <p class="ph-note">
                For the clinic&rsquo;s external drive. You get a ZIP. Open it and
                there is a folder holding one PDF per patient, each readable and
                printable on any computer, with or without DentCare. Unlike the
                database backup, which is a .json file meant for restoring the system.
            </p>
        </div>
    </div>

    <!-- ── 2. The record card ──────────────────────────────────────────── -->
    <div id="<?php echo $prefix; ?>-history-record" class="hidden">
        <?php if ($prefix === 'dentist'): ?>
        <nav class="patient-workspace-actions" aria-label="Patient actions">
            <button type="button" class="btn-secondary" onclick="switchDentistTab('tab-dentist-queue', document.getElementById('nav-dentist-queue'))">Today's Queue</button>
            <button type="button" class="btn-secondary" onclick="openHistoryDentalChart()">Dental Chart</button>
            <button type="button" id="<?php echo $prefix; ?>-history-record-visit" onclick="recordHistoryVisit()" hidden>Record Visit</button>
        </nav>
        <?php endif; ?>

        <!-- Shown when this record changes on another screen while it is open
         (2026-10-02, R20, watchOpenRecord in js/app.js). It is not redrawn
         under the reader; "Show the latest" reloads it. -->
    <div class="record-updated-bar hidden" id="<?php echo $prefix; ?>-history-updated-bar" role="status">
        <span>This record was updated on another screen.</span>
        <button type="button" class="btn-secondary btn-sm">Show the latest</button>
    </div>

        <div class="card ph-toolbar">
            <div class="ph-toolbar__who">
                <h3 id="<?php echo $prefix; ?>-history-patient-name">Patient Name</h3>
                <p class="ph-toolbar__meta" id="<?php echo $prefix; ?>-history-patient-meta">Age -- &middot; Gender -- &middot; Contact --</p>
                <!-- "Deceased" / "Inactive", when the patient is marked. See
                     patientStatusOf() in js/records.js. -->
                <p class="patient-status-badge hidden" id="<?php echo $prefix; ?>-history-status-badge"></p>
                <!-- An online registration whose email is not confirmed yet
                     (2026-10-01). js/patient-history.js shows it. -->
                <p class="patient-status-badge patient-status-badge--email hidden"
                   id="<?php echo $prefix; ?>-history-email-badge">Email not confirmed yet</p>
                <!-- A record the front desk made, with no online account, and a
                     consent not signed yet (2026-10-01). js/patient-history.js
                     shows them. -->
                <p class="patient-status-badge patient-status-badge--record hidden"
                   id="<?php echo $prefix; ?>-history-record-badge">Record only, no online account</p>
                <p class="patient-status-badge patient-status-badge--consent hidden"
                   id="<?php echo $prefix; ?>-history-consent-badge">Consent not signed yet</p>
                <?php if (privacy_feature_on()): /* R22: "Privacy Policy agreed on ..." or "not yet", js/patient-history.js */ ?>
                <p class="ph-toolbar__meta ph-toolbar__privacy" id="<?php echo $prefix; ?>-history-privacy"></p>
                <?php endif; ?>
            </div>
            <div class="ph-toolbar__actions">
                <button type="button" class="ph-change-patient" onclick="showAllHistoryPatients()">
                    <?= icon('arrow-left') ?> <span>Change patient</span>
                </button>
<details class="patient-more"><summary>More actions</summary><div class="patient-more__items">
                <!-- Staff and the doctor. Fixes a misspelling without the
                     patient's 180-day limit; see openCorrectPatientName() in
                     js/records.js. -->
                <button type="button" class="btn-secondary btn-sm"
                        id="<?php echo $prefix; ?>-history-name-btn"
                        onclick="openCorrectPatientName()">
                    Correct name
                </button>
                <!-- Staff and the doctor, only while the email is not
                     confirmed: for a patient at the desk whose confirmation
                     email never arrived (js/email-confirm.js). -->
                <button type="button" class="btn-secondary btn-sm hidden"
                        id="<?php echo $prefix; ?>-history-email-btn"
                        onclick="onConfirmEmailInPerson()">
                    Confirmed in person
                </button>
                <!-- Staff and the doctor, only while the consent is not signed:
                     the patient signs on the tablet (openCollectConsent in
                     js/records.js, 2026-10-01). -->
                <button type="button" class="btn-secondary btn-sm hidden"
                        id="<?php echo $prefix; ?>-history-consent-btn"
                        onclick="openCollectConsent()">
                    Collect consent signature
                </button>
                <!-- Staff and the doctor, on a record with no online account:
                     makes one and copies the record onto it (2026-10-02, R17,
                     copyRecordToAccount in js/staff-patient-registration.js). -->
                <button type="button" class="btn-secondary btn-sm hidden"
                        id="<?php echo $prefix; ?>-history-account-btn"
                        onclick="openCreateAccount()">
                    Create online account
                </button>
                <!-- Staff and the doctor, on a patient with an online account:
                     a forgotten password, reset for free (2026-10-02, R18,
                     openResetLogin in js/staff-patient-registration.js). -->
                <button type="button" class="btn-secondary btn-sm hidden"
                        id="<?php echo $prefix; ?>-history-reset-btn"
                        onclick="openResetLogin()">
                    Reset login
                </button>
                <!-- Owner only; js/patient-history.js shows it. A record is
                     never deleted, it is marked. -->
                <button type="button" class="btn-secondary btn-sm hidden"
                        id="<?php echo $prefix; ?>-history-status-btn"
                        onclick="openPatientStatus()">
                    Patient status
                </button>
                <!-- For duplicates and test entries only. It refuses the moment
                     the patient has any history; see openDeletePatient(). -->
                <button type="button" class="btn-secondary btn-sm hidden"
                        id="<?php echo $prefix; ?>-history-delete-btn"
                        onclick="openDeletePatient()">
                    Delete patient
                </button>
                <!-- Staff and the doctor. Fills in Dr. Gapit's certificate form
                     for this patient and prints it on the half sheet; she
                     signs it by hand. See js/certificate.js (2026-09-30). -->
                <button type="button" class="btn-secondary btn-sm"
                        id="<?php echo $prefix; ?>-history-cert-btn"
                        onclick="openCertificate()">
                    Certificate
                </button>
                <button type="button" id="<?php echo $prefix; ?>-history-export-btn" onclick="exportPatientRecordCard()">
                    <?= icon('file') ?> Export record card (PDF)
                </button>
</div></details>
            </div>
        </div>

        <p class="ph-status" id="<?php echo $prefix; ?>-history-export-status"></p>

        <!-- A. Patient information -->
        <div class="card ph-section">
            <h3 class="ph-section__title"><span class="ph-section__letter">A</span> Patient information</h3>
            <dl class="ph-grid" id="<?php echo $prefix; ?>-history-info"></dl>
        </div>

        <!-- B. Medical history -->
        <div class="card ph-section">
            <!-- Staff and the doctor keep these answers up to date (2026-09-30):
                 the patient's own account no longer has a health form. The
                 dialog is templates/partials/modal-health-answers.php and the
                 save is openHealthAnswers() / updateMedicalHistory() in
                 js/records.js. -->
            <div class="ph-section__head">
                <h3 class="ph-section__title"><span class="ph-section__letter">B</span> Medical history</h3>
                <button type="button" class="btn-secondary btn-sm"
                        id="<?php echo $prefix; ?>-history-health-btn"
                        onclick="openHealthAnswers(historyRecord ? historyRecord.patientId : '')">
                    Edit health answers
                </button>
            </div>
            <div id="<?php echo $prefix; ?>-history-alerts"></div>
            <dl class="ph-grid" id="<?php echo $prefix; ?>-history-medical"></dl>
        </div>

        <!-- C. Dental chart — the back of the paper card -->
        <div class="card ph-section">
            <h3 class="ph-section__title"><span class="ph-section__letter">C</span> Dental chart</h3>
            <p class="ph-note">
                Read-only. Findings are recorded on the Interactive Charting tab.
                Both dentitions are always drawn, because a child between about 6 and 12
                has teeth from both in the mouth at once.
            </p>
            <?php
            // record-card-chart.php derives read-only from the scope name.
            $scope = $prefix . '-history';
            include __DIR__ . '/partials/record-card-chart.php';
            ?>

            <h4 class="ph-subhead">Recorded findings</h4>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Tooth</th>
                            <th>Condition</th>
                            <th>Surfaces</th>
                            <th>Notes</th>
                        </tr>
                    </thead>
                    <tbody id="<?php echo $prefix; ?>-history-teeth-table">
                        <tr><td colspan="4" style="text-align:center;">No findings recorded.</td></tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- D. Treatment record -->
        <div class="card ph-section">
            <h3 class="ph-section__title"><span class="ph-section__letter">D</span> Treatment record</h3>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Procedure</th>
                            <th>Tooth</th>
                            <th>Findings &amp; treatment</th>
                            <th>Prescription</th>
                        </tr>
                    </thead>
                    <tbody id="<?php echo $prefix; ?>-history-treatments-table">
                        <tr><td colspan="5" style="text-align:center;">No treatments logged.</td></tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- E. Visits -->
        <div class="card ph-section">
            <h3 class="ph-section__title"><span class="ph-section__letter">E</span> Visits</h3>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Time</th>
                            <th>Requested</th>
                            <th data-card="badge">Status</th>
                        </tr>
                    </thead>
                    <tbody id="<?php echo $prefix; ?>-history-visits-table">
                        <tr><td colspan="4" style="text-align:center;">No visits recorded.</td></tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- F. Account — staff and admin only, see the note at the top -->
        <div class="card ph-section" id="<?php echo $prefix; ?>-history-account-section">
            <h3 class="ph-section__title"><span class="ph-section__letter">F</span> Account</h3>
            <div id="<?php echo $prefix; ?>-history-account-body">
                <p class="ph-note">Loading&hellip;</p>
            </div>
        </div>

        <!-- G. Files. Always shown (2026-09-17). While x-ray uploads are off it
             carries the upgrade and cost warning in place of the archiving note,
             and the table below simply lists nothing: js/patient-history.js
             still finds and fills it either way. -->
        <div class="card ph-section">
            <h3 class="ph-section__title"><span class="ph-section__letter">G</span> X-rays &amp; scanned files</h3>
            <?php if (DENTCARE_XRAY_UPLOADS): ?>
            <p class="ph-note">
                An archived file has been copied to the clinic's own drive and removed from
                cloud storage to free space. The row stays here so the scan can still be found.
            </p>
            <?php else: ?>
            <?php include __DIR__ . '/partials/xray-upgrade-note.php'; ?>
            <?php endif; ?>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>File</th>
                            <th>Size</th>
                            <th>Taken</th>
                            <th>Where it is</th>
                        </tr>
                    </thead>
                    <tbody id="<?php echo $prefix; ?>-history-files-table">
                        <tr><td colspan="4" style="text-align:center;">No files uploaded.</td></tr>
                    </tbody>
                </table>
            </div>
        </div>

    </div>
</div>
