<?php
/**
 * DentCare — Clinic tab: Today's Queue
 * ---------------------------------------------------------------------------
 * The waiting room, as a screen. Included by BOTH the dentist and the staff
 * dashboard — they are looking at the same queue from two machines, which is
 * why js/queue.js keeps it on a live listener rather than a one-off read.
 *
 * Rebuilt 2026-09-30, at the clinic's request, to take fewer clicks: there is
 * no check-in list and no "Call in" step any more.
 *
 * Left:  today's queue. Every booking approved for today is listed by itself,
 *        with the walk-ins, in the order they are seen — see
 *        sortQueueForCalling() in js/queue.js: a booked patient at their slot,
 *        a walk-in in the free time between. The doctor presses Open Patient
 *        on a row and records the visit from the patient's record; the desk
 *        can tap Arrived, No-show or Remove. A saved visit leaves the queue by
 *        itself. Under it, Seen today: the visits already completed.
 * Walk-in intake and clinic booking are on the staff Walk-in & Booking page.
 *
 * Set before including:
 *   $role_prefix  string  'dentist' or 'staff' — drives the tab id, matching
 *                         the convention tab_manage_schedule.php uses.
 *
 * Element ids are NOT used for the live regions here. portal.php renders all
 * three role layouts into one document, so an id would appear twice and
 * getElementById would return the dentist's copy while staff clicked the
 * other. They carry classes, resolved against the visible layout by
 * queueEl() — the same fix the messaging module needed.
 */

if (!isset($role_prefix)) { $role_prefix = 'staff'; }
?>
<!-- Clinic Tab: Today's Queue -->
<div id="tab-<?= e($role_prefix) ?>-queue" class="tab-content hidden">
    <div class="card-header">
        <h2>Today&rsquo;s Queue</h2>
    </div>

    <div class="queue-layout">
        <!-- Today's queue, and who has been seen -->
        <div class="card queue-main">
            <!-- Today's bookings still waiting for approval, with a Review link
                 (renderQueuePendingNotice in js/queue.js). Kept when the
                 side column moved to Walk-in & Booking (2026-10-05). -->
            <div class="queue-pending"></div>

            <h3><?= icon('clock') ?> Today&rsquo;s queue</h3>
            <p class="field-hint">
                Today&rsquo;s approved bookings are listed here automatically, in time order.
                Walk-ins are placed in the free time between them.
            </p>
            <div class="queue-list">
                <p class="queue-empty">Loading today&rsquo;s queue&hellip;</p>
            </div>

            <hr class="queue-divider">

            <h3><?= icon('check') ?> Seen today</h3>
            <div class="queue-seen">
                <p class="queue-empty">Loading&hellip;</p>
            </div>
        </div>

    </div>
</div>
