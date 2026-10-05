<?php
/**
 * Staff Tab: Billing & Payments
 * ---------------------------------------------------------------------------
 * The front desk's side of the money. Bills arrive here on their own — one is
 * raised the moment the dentist records a treatment — so there is nothing to
 * create, only payments to take.
 *
 * Not reachable by a dentist — but the DATA is. Changed 2026-09-03: the rules
 * let any clinician READ billing and payments, because Dr. Gapit keeps the
 * clinic's record book and holds the money. What stays with the front desk is
 * WRITING it: recording a payment and settling a bill.
 *
 * So this tab, which exists to take payments, is still staff-only. The doctor
 * sees the same figures through Patient History and through the year-end export
 * on her own Backup & Recovery tab.
 */
?>
<div id="tab-staff-billing" class="tab-content hidden">
    <div class="card-header">
        <h2>Billing &amp; Payments</h2>
    </div>

    <!--
        ── ONE FIGURE, THEN TWO (clinic request, 2026-09-16) ─────────────────
        Three identical cards, each with its own coloured icon, said that the
        three numbers matter equally. They do not. The front desk's question is
        "how much have we actually collected?" — the other two are context for
        it. So Collected is the headline, Billed and Still owed sit under it in
        a smaller line, and the icons and tinted tiles are gone: this is
        information, not decoration.

        "Close out a year" moved to the dentist's Backup & Recovery tab only.
        It is the owner's yearly book, not a front-desk task.
    -->
    <section class="money-summary card" aria-label="Money summary">
        <p class="money-summary__label">Collected</p>
        <p class="money-summary__figure" id="stats-total-earnings">₱0.00</p>
        <dl class="money-summary__rest">
            <div>
                <dt>Amount due on loaded bills</dt>
                <dd id="stats-cash-earnings">₱0.00</dd>
            </div>
            <div>
                <dt>Still owed</dt>
                <dd id="stats-online-earnings">₱0.00</dd>
            </div>
        </dl>
    </section>

    <div class="card">
        <div class="picker-tools">
            <h3 style="margin: 0;">Bills</h3>
            <!-- Today is first and is where the table opens (2026-09-30). It
                 narrows the bills already loaded; it reads nothing new. -->
            <label class="picker-sort" for="billing-period-filter">
                <span>Period</span>
                <select id="billing-period-filter" onchange="filterBillingTable()">
                    <option value="today">Today</option>
                    <option value="week">Last 7 days</option>
                    <option value="month">This month</option>
                    <option value="all">All loaded</option>
                </select>
            </label>
            <label class="picker-sort" for="billing-status-filter">
                <span>Show</span>
                <select id="billing-status-filter" onchange="filterBillingTable()">
                    <option value="all">All</option>
                    <option value="Unpaid">Unpaid</option>
                    <option value="Partially Paid">Partly paid</option>
                    <option value="Paid">Paid</option>
                    <option value="HMO">Charged to HMO</option>
                </select>
            </label>
            <input type="text" id="billing-search" placeholder="Search patient name"
                   oninput="filterBillingTable()"
                   style="max-width: 240px; margin: 0; padding: 7px 10px; font-size: 13px;">
            <!-- Row height. Filled by initRowDensity() in js/app.js, and set on
                 <body>, so choosing it here changes every table in the app and
                 is remembered next time. -->
            <span data-density-control></span>

            <!-- Coloured for the file each one makes: Excel green, PDF red. -->
            <span class="billing-exports" style="display: flex; gap: 8px; margin-left: auto;">
                <button class="btn-sm btn-file btn-file--pdf" onclick="exportFinancialPDF()">
                    <?= icon('file') ?> Export PDF
                </button>
                <button class="btn-sm btn-file btn-file--excel" onclick="exportFinancialExcel()">
                    <?= icon('file') ?> Export Excel
                </button>
            </span>
        </div>

        <p class="card-hint">
            A bill appears here as soon as the dentist records a treatment. Open one
            to see what was done and to record the payment once the patient has
            handed it over.
        </p>

        <!--
            Says what is loaded, and offers the rest.

            Without this line a settled bill from last year is simply absent,
            which is indistinguishable from it having been lost. Nothing is
            deleted — every bill is kept for the year-end export and for BIR —
            the tab just does not download all of them to show you the four
            people who still owe money. Filled by renderBillingScope().
        -->
        <p class="card-hint" id="billing-scope"></p>

        <!-- What was billed today, and a way to the earlier bills that still
             carry a balance. Filled by renderBillingToday(). -->
        <p class="billing-today" id="billing-today" aria-live="polite"></p>

        <div class="table-container" data-freeze data-pin-actions>
            <table>
                <thead>
                    <tr>
                        <th>Bill</th>
                        <th data-card="title">Patient</th>
                        <th>Treatment / Operation</th>
                        <th>Date</th>
                        <th class="num">Amount due</th>
                        <th class="num">Paid</th>
                        <th data-card="badge">Status / Balance</th>
                        <th data-card="actions">Actions</th>
                    </tr>
                </thead>
                <tbody id="staff-billing-table">
                    <tr><td colspan="8" style="text-align: center;">Loading bills&hellip;</td></tr>
                </tbody>
            </table>
        </div>
    </div>
</div>
