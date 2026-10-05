<?php
/**
 * Dentist Tab: Interactive Dental Charting
 * ---------------------------------------------------------------------------
 * Laid out the way the clinic's paper Dental Record Card is laid out: one
 * column per tooth position, the upper tooth above the lower one, numbers on
 * the outside, and every tooth drawn as the card's five-surface circle.
 *
 * The primary (baby) rows are only rendered for a patient young enough to have
 * them, so an adult's chart is the 32 permanent teeth and nothing else.
 */
require_once __DIR__ . '/partials/dentition.php';
require_once __DIR__ . '/partials/tooth-glyph.php';
?>
<script>
    window.DENTITION = <?= json_encode([
        'primary'        => array_merge($PRIMARY_UPPER, $PRIMARY_LOWER),
        'lastPrimaryAge' => DENTITION_LAST_PRIMARY_AGE,
        'lastMixedAge'   => DENTITION_LAST_MIXED_AGE,
    ]) ?>;
</script>

<div id="tab-dentist-chart" class="tab-content hidden">
    <div class="card-header">
        <h2>Interactive Patient Dental Charting</h2>
    </div>

    <!-- ── 1. Patient ───────────────────────────────────────────────────── -->
    <div class="card card--picker" id="chart-patient-panel">
        <h3>1. Select Patient</h3>

        <div class="search-container">
            <span class="search-icon"><?= icon('search') ?></span>
            <input type="text" class="search-input" id="chart-patient-search"
                   placeholder="Search by name, or scroll the list below"
                   oninput="renderChartPatientList()">
        </div>

        <!-- One plainly-labelled dropdown. Anything more and it stops being
             something you can use without being shown how. -->
        <div class="picker-tools">
            <label class="picker-sort" for="chart-patient-sort">
                <span>Sort by</span>
                <select id="chart-patient-sort" onchange="renderChartPatientList()">
                    <option value="name-asc">Last name (A to Z)</option>
                    <option value="name-desc">Last name (Z to A)</option>
                    <option value="age-asc">Youngest first</option>
                    <option value="age-desc">Oldest first</option>
                </select>
            </label>
            <span class="picker-count" id="chart-patient-count"></span>
        </div>

        <!-- One scrollable list of everyone registered. The search box filters
             this list rather than producing a second set of results. -->
        <div class="patient-picker" id="chart-patient-list">
            <p class="picker-empty">Loading patients&hellip;</p>
        </div>
    </div>

    <!-- Shown when this record changes on another screen while it is open
         (2026-10-02, R20, watchOpenRecord in js/app.js). It is not redrawn
         under the reader; "Show the latest" reloads it. -->
    <div class="record-updated-bar hidden" id="chart-updated-bar" role="status">
        <span>This record was updated on another screen.</span>
        <button type="button" class="btn-secondary btn-sm">Show the latest</button>
    </div>

    <!-- Replaces the picker once a patient is open -->
    <div class="card hidden" id="chart-active-patient-card">
        <div class="active-pt">
            <div>
                <h3 class="active-pt__name" id="chart-patient-name">Patient Name</h3>
                <p class="active-pt__meta" id="chart-patient-meta">Age: -- | Gender: --</p>
            </div>
            <div class="active-pt__flags">
                <div class="active-pt__allergy" id="chart-patient-allergies">Allergies: None</div>
                <div id="chart-patient-conditions">Conditions: None</div>
            </div>
            <div class="active-pt__buttons">
                <button type="button" class="btn-secondary btn-sm" onclick="openChartPatientHistory()">Patient Record</button>
                <!--
                    The x-ray panel sits below the whole tooth chart, which is
                    the right place for it — charting is what this tab is for —
                    but it means the doctor has to scroll past thirty-two teeth
                    to reach it, and she reported it as missing entirely. This
                    is the shortcut, on the card she is already looking at.
                -->
                <!-- Shown whether or not uploads are on (2026-09-17): while they
                     are off it lands on the locked panel, which says why. -->
                <button type="button" class="btn-secondary btn-sm" onclick="jumpToXrays()">
                    <?= icon('layers') ?> X-rays
                </button>
                <button type="button" class="btn-secondary btn-sm" onclick="showAllChartPatients()">
                    Change patient
                </button>
            </div>
        </div>
    </div>

    <!-- ── 2. The chart ─────────────────────────────────────────────────── -->
    <div id="chart-interactive-section" class="card hidden">
        <div id="chart-safety-warning-banner" class="clinical-alert-banner hidden" style="margin-bottom: var(--space-m);">
            <?= icon('alert') ?>
            <span id="chart-safety-warning-text">Patient has high-risk conditions.</span>
        </div>

        <h3>2. Dental Record Card</h3>
        <p class="card-hint">
            Click a tooth to record its condition and which surfaces are affected.
        </p>

        <?php
        // The same block the completion form embeds, so the reference view and
        // the visit form can never draw a tooth in two different places.
        $scope = 'chart';
        include __DIR__ . '/partials/record-card-chart.php';
        ?>
    </div>

    <?php
    // Off on the Spark plan — see DENTCARE_XRAY_UPLOADS in partials/helpers.php.
    // While off, the panel is shown LOCKED with the upgrade and cost warning
    // (clinic request, 2026-09-17) rather than hidden. The locked panel has no
    // upload control and loads nothing from Storage.
    if (DENTCARE_XRAY_UPLOADS) {
        include __DIR__ . '/partials/xray-panel.php';
    } else {
        include __DIR__ . '/partials/xray-panel-locked.php';
    }
    ?>
</div>
