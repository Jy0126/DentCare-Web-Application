<?php
/**
 * DentCare — "X-ray uploads need a plan upgrade" notice
 * ---------------------------------------------------------------------------
 * Shown wherever x-rays appear while DENTCARE_XRAY_UPLOADS is off: the upload
 * panel on Charting & X-rays, and section G of Patient History. One file, so
 * the two places can never tell the clinic two different things about money.
 *
 * ── WHY THE FEATURE IS SHOWN AT ALL (clinic request, 2026-09-17) ───────────
 *
 * Until today the panel was hidden completely while uploads were off. The
 * clinic asked for it to be visible instead: the upload is built, and the
 * people reviewing the system should see that it exists, while the clinic
 * decides whether it is worth paying for. So it is shown, locked, with the
 * reason in plain words.
 *
 * ── WHAT IS TRUE, AND WHAT THIS DELIBERATELY DOES NOT SAY ──────────────────
 *
 * From Firebase's own pricing documentation: the Blaze plan requires linking a
 * Cloud Billing account, includes no-cost usage quotas for Cloud Storage, and
 * charges pay-as-you-go for usage beyond them. The Spark plan requires no
 * payment information at all.
 *
 * It does NOT quote the size of the free allowance or a price per gigabyte.
 * Those numbers depend on the bucket's region and Google changes them; a
 * figure printed here would be wrong one day with nothing to say so. The
 * clinic checks the current numbers on Firebase's pricing page before
 * upgrading — docs/DEPLOY-WEB-APP.md says where.
 *
 * Contains no form control that does anything. There is no file input, and
 * the button is disabled, so nothing here can reach Storage by accident.
 */
?>
<div class="xray-upgrade" role="note">
    <p class="xray-upgrade__title">
        <?= icon('alert') ?>
        <strong>Needs a plan upgrade to use</strong>
    </p>
    <p>
        Uploading x-rays and scans is built but switched off. The files are kept in
        Firebase Cloud Storage, which this project can only use after upgrading from the
        free <strong>Spark</strong> plan to the <strong>Blaze</strong> plan (pay as you go).
    </p>
    <ul class="xray-upgrade__list">
        <li>Blaze needs a billing card linked to the project.</li>
        <li>It includes a free allowance, but storage and downloads beyond it are
            <strong>charged to the clinic</strong>.</li>
        <li>Nothing is charged while the clinic stays on the free plan.</li>
    </ul>
    <p class="xray-upgrade__foot">
        Until the clinic decides to upgrade, keep x-ray films and scans in the clinic&rsquo;s
        usual files.
    </p>
</div>
