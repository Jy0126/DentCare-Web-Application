<?php
/**
 * The notification bell for one role, beside the DentCare name in the sidebar
 * brand row (the top bar on phones). Owner decision 2026-09-24: just the bell,
 * with a red count when something is unread. Set $notif_role ('patient',
 * 'staff' or 'dentist') before including. Driven by js/notifications.js.
 */
$notif_role = $notif_role ?? 'patient';
?>
<div class="notif">
    <button type="button" class="notif-bell" id="notif-bell-<?= e($notif_role) ?>"
            data-notif-trigger="<?= e($notif_role) ?>"
            aria-label="Notifications" aria-haspopup="true" aria-expanded="false"
            aria-controls="notif-panel-<?= e($notif_role) ?>" onclick="toggleNotificationPanel(this)">
        <?= icon('bell') ?>
        <span class="notif-count" aria-hidden="true" hidden>0</span>
    </button>
    <div class="notif-panel" id="notif-panel-<?= e($notif_role) ?>" role="region"
         aria-label="Notifications" hidden>
        <div class="notif-panel__head">
            <h2 class="notif-panel__title">Notifications</h2>
            <button type="button" class="notif-mark" id="notif-mark-<?= e($notif_role) ?>"
                    onclick="markAllNotificationsSeen()" disabled>Mark all as read</button>
        </div>
        <ul class="notif-list" id="notif-list-<?= e($notif_role) ?>">
            <li class="notif-empty">You're all caught up.</li>
        </ul>
        <div class="notif-panel__foot">
            <button type="button" class="notif-clear" id="notif-clear-<?= e($notif_role) ?>"
                    onclick="clearReadNotifications()" disabled>Clear read notifications</button>
        </div>
    </div>
</div>
