<?php
/**
 * DentCare — Close out a financial year
 * ---------------------------------------------------------------------------
 * Requires $prefix ('staff' or 'dentist').
 *
 * Rendered in two places, so every id carries the prefix: the front desk finds
 * it under Billing, and Dr. Gapit finds it under Backup & Recovery, which is
 * where her other exports live. Both are in the page at once — one hidden — and
 * a bare id would appear twice, with getElementById always returning the first.
 *
 * ── WHY THE DOCTOR HAS THIS AT ALL ─────────────────────────────────────────
 *
 * She keeps the blue record book. She logs the bills and the income, and she
 * holds the money; the front desk receives it from the patient and hands it
 * over. This export is that book, so it has to be reachable from her side —
 * otherwise the system produces the clinic's accounts and hands them to
 * everyone except the person who keeps them.
 *
 * Reading the money and moving it stay separate: firestore.rules lets any
 * clinician READ billing and payments, and still lets only staff record a
 * payment or settle a bill.
 */
$prefix = $prefix ?? 'staff';

/*
 * $fin_step (optional int): render as a numbered step on the Records Backup
 * screen, with one line of text instead of three paragraphs (clinic request,
 * 2026-09-14: the doctor's backup screen must be basic and clear). The ids,
 * and so the export itself, are identical in both forms.
 */
$fin_step = isset($fin_step) ? (int) $fin_step : 0;
if ($fin_step > 0):
?>
<section class="card backup-step fin-year fin-year--step">
    <div class="backup-step__head">
        <span class="backup-step__num" aria-hidden="true"><?= $fin_step ?></span>
        <div>
            <h3 class="backup-step__title">Year income</h3>
            <p class="backup-step__hint">Money collected in one year, as an Excel file. It is not profit.</p>
        </div>
    </div>
    <div class="fin-year__row">
        <label class="picker-sort" for="<?php echo $prefix; ?>-finance-year">
            <span>Year</span>
            <select id="<?php echo $prefix; ?>-finance-year"></select>
        </label>
        <button type="button" class="backup-step-btn" id="<?php echo $prefix; ?>-finance-year-btn" onclick="exportFinancialYear()">
            <?= icon('peso') ?> Export Excel
        </button>
    </div>
    <span class="fin-year__status" id="<?php echo $prefix; ?>-finance-year-status"></span>
</section>
<?php return; endif; ?>
<div class="card fin-year">
    <h3 class="fin-year__title">Close out a year</h3>
    <p class="card-hint">
        Everything the clinic collected in one year, as a spreadsheet: month by month,
        by treatment, by payment method, and every payment listed. Keep a copy on the
        clinic's external drive with the patient records.
    </p>
    <div class="fin-year__row">
        <label class="picker-sort" for="<?php echo $prefix; ?>-finance-year">
            <span>Year</span>
            <select id="<?php echo $prefix; ?>-finance-year"></select>
        </label>
        <button type="button" id="<?php echo $prefix; ?>-finance-year-btn" onclick="exportFinancialYear()">
            <?= icon('peso') ?> Export year (Excel)
        </button>
        <span class="fin-year__status" id="<?php echo $prefix; ?>-finance-year-status"></span>
    </div>
    <p class="card-hint fin-year__caveat">
        <strong>This is not net profit.</strong> The workbook shows what was collected and,
        beside it, what was spent on supplies. That figure comes from the cost typed in
        when a delivery is logged on the Inventory tab, so it only counts deliveries where
        somebody entered one. Rent, salaries, utilities and equipment are not in DentCare
        at all. Take it to whoever keeps the clinic's books as the revenue side, with the
        supply spend as a partial cost.
    </p>
</div>
