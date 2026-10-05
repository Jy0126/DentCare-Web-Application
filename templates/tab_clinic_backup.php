<?php
/**
 * DentCare — Clinic tab: Records Backup & Recovery
 * ---------------------------------------------------------------------------
 * Dr. Reina's (and an admin's) disaster-recovery panel.
 *
 * This clinic lost every paper record it had to a flood. That is the reason
 * the system exists, so this screen is written for the worst day rather than
 * the ordinary one: plain language, no jargon, and every destructive action
 * says what it will do before it does it.
 *
 * ── LAID OUT AS TWO STEPS AND AN EMERGENCY (clinic request, 2026-09-14) ───
 *
 * The screen had grown into two dense columns: a yearly report on top, a long
 * explanation of JSON files, spreadsheet buttons, and the restore controls
 * always open beside them. The doctor is not technical, and the clinic asked
 * for it to be basic and clear. So:
 *   1. Patient record cards   (one ZIP: a PDF each, and the backup inside it)
 *   2. Year income            (Excel)
 *   and, folded away at the bottom, Emergency: restore from a backup.
 * The spreadsheet copies of single collections were removed from this screen:
 * the doctor could not use them, and the year export and the PDFs cover what
 * a person reads. exportCollectionCsv() in js/backup.js still exists.
 *
 * ── "DOWNLOAD FULL BACKUP" WAS REMOVED (clinic request, 2026-09-16) ────────
 *
 * It used to be step 1, and the clinic spotted that step 2 already contained
 * the identical file. Two buttons, one of them a strict subset of the other,
 * is a decision the doctor has to make every week for no gain — so there is
 * now one button, and it is the one that also prints.
 *
 * exportDatabaseBackup() in js/backup.js is deliberately KEPT and still works;
 * it is simply not on the screen. The consequence is that the clinic's backup
 * now rides on an export whose other job is building PDFs, so
 * exportAllPatientRecordsFromBackup() was changed to still write the ZIP when
 * no card can be built, and to say plainly when the backup is the part that
 * failed. That reasoning is written out where the code is.
 *
 * Every class js/backup.js looks up (backup-status, restore-choice,
 * restore-status, restore-mode, restore-replace, restore-confirm-btn) is kept.
 *
 * Driven by js/backup.js.
 *
 * Set before including:
 *   $role_prefix  string  'dentist' or 'staff'
 */

if (!isset($role_prefix)) { $role_prefix = 'dentist'; }
?>
<!-- Clinic Tab: Backup & Recovery -->
<div id="tab-<?= e($role_prefix) ?>-backup" class="tab-content hidden">
    <div class="card-header">
        <h2>Records Backup</h2>
    </div>

    <p class="backup-lead">
        <?= icon('shield') ?>
        Do step 1 every week and step 2 once a year. Save every file to the
        clinic&rsquo;s external drive.
    </p>

    <div class="backup-steps">
        <!-- ── 1. The weekly one: record cards, with the backup inside ───── -->
        <!-- Same export as Patient History; see exportAllPatientRecordsFromBackup(). -->
        <section class="card backup-step backup-step--main">
            <div class="backup-step__head">
                <span class="backup-step__num" aria-hidden="true">1</span>
                <div>
                    <h3 class="backup-step__title">Download this week&rsquo;s records</h3>
                    <p class="backup-step__hint">
                        One ZIP with two things in it: a record card you can print for every
                        patient, and the spare copy of the whole system. You will not open the
                        spare copy. Keeping this one file safe is the backup.
                    </p>
                </div>
            </div>
            <button type="button" class="backup-big-btn" id="backup-records-btn"
                    onclick="exportAllPatientRecordsFromBackup()">
                <?= icon('shield') ?> Download this week&rsquo;s records
            </button>
            <div class="ph-status" id="backup-records-status"></div>
            <!-- Kept: exportDatabaseBackup() and exportCollectionCsv() still write
                 here if either is ever called. Both guard against it being absent,
                 but the class is part of what js/backup.js looks up. -->
            <div class="backup-status"></div>
        </section>

        <!-- Everything beside the big card, in its own column. The big card is
             then simply as tall as this box, however many cards are in it. -->
        <div class="backup-steps__side">

        <!-- ── 2. The year's income ─────────────────────────────────────── -->
        <?php
        // Dr. Gapit keeps the clinic's record book, so the income export belongs
        // on her side too, not only under the front desk's Billing tab.
        $prefix = 'dentist';
        $fin_step = 2;
        include __DIR__ . '/partials/finance-year.php';
        unset($fin_step);
        ?>

        <?php if ($role_prefix === 'dentist'): ?>
        <!-- ── HMO to collect (Task 25, 2026-10-05) ───────────────────────── -->
        <!-- The front desk charges a visit to an HMO; Dr. Gapit collects the
             money herself and marks it here. It then counts as income on
             that day. Filled by loadHmoToCollect() in js/billing.js. -->
        <section class="card backup-step hmo-collect">
            <h3 class="backup-step__title">HMO to collect</h3>
            <p class="backup-step__hint">Visits the front desk charged to an HMO. Press
                <strong>Collected</strong> once the HMO has paid you.</p>
            <div id="hmo-collect-list"><p class="picker-empty">Loading…</p></div>
        </section>
        <?php endif; ?>

    <!-- ── Emergency: restore ─────────────────────────────────────────────── -->
    <!--
        Folded away. It is used on the worst day, not every week, and leaving it
        open beside the weekly buttons made the whole screen look dangerous.
        Everything js/backup.js needs is inside, and works while folded.
    -->
    <details class="card backup-emergency">
        <summary class="backup-emergency__summary">
            <span class="backup-emergency__icon"><?= icon('alert') ?></span>
            <span class="backup-emergency__text">
                <strong>Emergency: restore from a backup</strong>
                <span>Only if records were lost. Nothing is deleted.</span>
            </span>
        </summary>

        <div class="backup-emergency__body">
            <ol class="restore-how">
                <li>Choose the <strong>ZIP</strong> from step 1. An older backup file
                    saved on its own works too.</li>
                <li>Check the list of what it contains.</li>
                <li>Press <strong>Restore these records</strong>. Only missing records are put back.</li>
            </ol>

            <!-- Read in this browser only; nothing is uploaded, so it works on Spark.
                 A .zip from step 2 is opened here and its restore file read out. -->
            <div class="restore-pickers">
                <label class="btn-secondary btn-sm restore-picker">
                    <?= icon('file') ?> Choose ZIP or backup file
                    <input type="file" class="visually-hidden"
                           accept=".zip,.json,application/zip,application/json" multiple
                           onchange="stageRestoreFile(this)">
                </label>
                <label class="btn-secondary btn-sm restore-picker">
                    <?= icon('layers') ?> Choose backup folder
                    <input type="file" class="visually-hidden" webkitdirectory directory
                           onchange="stageRestoreFile(this)">
                </label>
            </div>

            <div class="restore-choice"></div>
            <div class="restore-status"></div>

            <!-- Restore mode: see inRestoreMode() in firestore.rules. -->
            <div class="restore-mode" role="status"></div>

            <label class="restore-replace-row">
                <input type="checkbox" class="restore-replace">
                <span>
                    Also replace records that still exist
                    <span class="field-hint">Advanced. Leave this off.
                    Receipts and messages are never replaced.</span>
                </span>
            </label>

            <button type="button" class="btn-danger restore-confirm-btn hidden"
                    onclick="restoreBackup()" style="width: 100%;">
                Restore these records
            </button>
        </div>
    </details>

    <!-- ── Mobile numbers on file (2026-10-05) ─────────────────────────────
         Registration warns when a typed mobile number is already on a record.
         Patients saved before this existed are added here, once; pressing it
         again only adds what is missing. indexPatientPhones() in js/backup.js. -->
    <div class="card backup-phones">
        <h3><?= icon('phone') ?> Mobile numbers on file</h3>
        <p class="field-hint">Registration warns when a typed mobile number is already on a
            patient&rsquo;s record. Press once to include every patient saved before
            5 October 2026. Safe to press again.</p>
        <button type="button" class="btn-secondary btn-sm" id="backup-phones-btn"
                onclick="indexPatientPhones()">Update the list of numbers</button>
        <p class="ph-status" id="backup-phones-status" role="status"></p>
    </div>

        </div><!-- /.backup-steps__side -->
    </div>

    <!-- ── Storage housekeeping ────────────────────────────────────────── -->
    <!-- Only meaningful when x-ray uploads exist: see DENTCARE_XRAY_UPLOADS. -->
    <div class="card<?= DENTCARE_XRAY_UPLOADS ? '' : ' hidden' ?>">
        <h3><?= icon('layers') ?> Cloud storage &amp; x-ray archiving</h3>
        <p class="field-hint">
            The clinic&rsquo;s Firebase plan includes 5&nbsp;GB of file storage. X-rays
            are what fills it. Archiving one downloads it to this computer for the
            external drive and removes it from the cloud. The record that the
            x-ray was taken stays on the patient&rsquo;s file either way.
        </p>
        <p class="backup-note">
            Archive from a patient&rsquo;s record card, on the
            <strong>X-rays &amp; Scanned Files</strong> panel. Archive oldest first,
            and only once the file is safely on the drive.
        </p>
    </div>
</div>
