<?php
/**
 * DentCare — The Dental Record Card chart, as a reusable block
 * ---------------------------------------------------------------------------
 * Both dentitions laid out the way the clinic's paper card lays them out, plus
 * the colour legend.
 *
 * Drawn in two places, and it must be the SAME drawing in both:
 *
 *   scope 'chart'  the Dental Record Card tab — the reference view, where the
 *                  doctor browses and adjusts a patient's history
 *   scope 'visit'  inside the completion form, for marking what was treated
 *                  today
 *
 * If these two ever drifted apart, a tooth would sit in a different place
 * depending on which screen you were looking at, which is exactly the kind of
 * thing that puts a filling on the wrong tooth. One file, both callers.
 *
 * Every id is prefixed with the scope. See templates/partials/tooth-glyph.php
 * for why that is not optional.
 *
 * Expects from the including page:
 *   $scope                         'chart' or 'visit'
 *   $PERMANENT_UPPER / _LOWER      FDI numbers, from partials/dentition.php
 *   $PRIMARY_UPPER   / _LOWER
 */

if (!isset($scope)) { $scope = 'chart'; }
// The history card is the printed card on screen: read it, export it, do not
// edit it. Findings are entered on the charting tab, which is still interactive.
//
// Matched on a substring because the history scope carries the role prefix —
// 'dentist-history' and 'staff-history'. The tab is rendered once per layout
// and both are in the page at the same time, so a bare 'history' scope would
// have produced two teeth with the same id and painted only the first.
//
// Derived from $scope every time, and deliberately NOT `if (!isset(...))`.
// An include shares the including file's variable scope, so a caller that set
// $interactive once left it set for every later include in the same request:
// the history tab renders before the completion dialog, and a leaked `false`
// silently made the VISIT chart read-only — the doctor could no longer mark
// which teeth were treated, on the one screen where that is the whole job.
// Nothing errored. The teeth just stopped responding.
$interactive = (strpos($scope, 'history') === false);
?>

<div class="record-card" id="<?= $scope ?>-record-card">
    <!-- Permanent teeth: 16 columns, upper tooth above lower tooth -->
    <div class="record-card__label">Permanent teeth</div>
    <div class="record-card__scroll">
        <div class="tooth-row" id="<?= $scope ?>-permanent-upper">
            <?php foreach ($PERMANENT_UPPER as $num) { render_card_tooth($num, 'upper', $scope, $interactive); } ?>
        </div>
        <div class="tooth-row" id="<?= $scope ?>-permanent-lower">
            <?php foreach ($PERMANENT_LOWER as $num) { render_card_tooth($num, 'lower', $scope, $interactive); } ?>
        </div>
    </div>

    <!-- Primary teeth: 10 columns, centred under the permanent ones as on the
         card. Shown for every patient, the same way the paper card prints both
         dentitions on one side whoever is in the chair. An adult can still have
         a retained baby tooth, and a child's permanent molars are already
         through. -->
    <div class="record-card__primary" id="<?= $scope ?>-primary-dentition">
        <div class="record-card__label">Primary (baby) teeth</div>
        <div class="record-card__scroll">
            <div class="tooth-row tooth-row--primary" id="<?= $scope ?>-primary-upper">
                <?php foreach ($PRIMARY_UPPER as $num) { render_card_tooth($num, 'upper', $scope, $interactive); } ?>
            </div>
            <div class="tooth-row tooth-row--primary" id="<?= $scope ?>-primary-lower">
                <?php foreach ($PRIMARY_LOWER as $num) { render_card_tooth($num, 'lower', $scope, $interactive); } ?>
            </div>
        </div>
    </div>
</div>

<!-- Condition colours. One item per value in TOOTH_CONDITIONS (js/records.js),
     in the same order; data-condition is that stored value, and
     tools/check-dentition.js compares the two. EXO and RCT were added on
     2026-09-30. An extraction is drawn the way a missing tooth is. The four
     filling types (data-material) were added on 2026-10-01, each in the
     colour FILL_MATERIALS gives it. -->
<div class="tooth-legend">
    <div class="legend-item" data-condition="Healthy"><span class="legend-dot" style="background-color: #f8fafc;"></span> Healthy</div>
    <div class="legend-item" data-condition="Decayed"><span class="legend-dot" style="background-color: #fca5a5;"></span> Decayed (Caries)</div>
    <div class="legend-item" data-condition="Filled"><span class="legend-dot" style="background-color: #6ee7b7;"></span> Filled (type not recorded)</div>
    <div class="legend-item legend-item--material" data-material="LC"><span class="legend-dot" style="background-color: #0d9488;"></span> Filled LC (Light-cure composite)</div>
    <div class="legend-item legend-item--material" data-material="AM"><span class="legend-dot" style="background-color: #374151;"></span> Filled AM (Amalgam)</div>
    <div class="legend-item legend-item--material" data-material="TF"><span class="legend-dot" style="background-color: #f97316;"></span> Filled TF (Temporary filling)</div>
    <div class="legend-item legend-item--material" data-material="GIC"><span class="legend-dot" style="background-color: #2563eb;"></span> Filled GIC (Glass ionomer cement)</div>
    <div class="legend-item" data-condition="Missing"><span class="legend-dot" style="background-color: #cbd5e1; border-style: dashed;"></span> Missing</div>
    <div class="legend-item" data-condition="Crowned"><span class="legend-dot" style="background-color: #fde047;"></span> Crowned (Caps)</div>
    <div class="legend-item" data-condition="Bridge"><span class="legend-dot" style="background-color: #c084fc;"></span> Bridge Support</div>
    <div class="legend-item" data-condition="Extracted"><span class="legend-dot" style="background-color: #cbd5e1; border-style: dashed;"></span> EXO (Extraction)</div>
    <div class="legend-item" data-condition="RCT"><span class="legend-dot" style="background-color: #93c5fd;"></span> RCT (Root canal)</div>
</div>
