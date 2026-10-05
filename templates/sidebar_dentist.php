<!-- Dentist Sidebar Template -->
<div class="sidebar-brand-row">
    <!-- Phones and tablets only (css/layout.css): opens the module panel. -->
    <button type="button" class="sidebar-toggle-btn" onclick="toggleMobileSidebar()"
            aria-label="Open menu" aria-expanded="false">
        <span class="sidebar-toggle-icon" aria-hidden="true">
            <span class="bar"></span>
            <span class="bar"></span>
            <span class="bar"></span>
        </span>
        <span class="sidebar-toggle-label">Menu</span>
    </button>
    <div class="sidebar-brand-text">
        <h2 class="sidebar-title"><img src="images/logo-64.png" alt="DentCare Logo" width="32" height="32" style="height: 32px; width: 32px; object-fit: contain; vertical-align: middle; margin-right: 8px;">DentCare</h2>
        <p class="sidebar-subtitle">Clinical Console</p>
    </div>
    <?php $notif_role = 'dentist'; include __DIR__ . '/partials/notification-bell.php'; ?>
</div>

<div class="sidebar-user">
    Welcome, <span id="dentist-name-display" class="sidebar-user-name">Dr. Reina G. Gapit</span>
    <span class="sidebar-user-role">Dentist</span>
</div>

<!--
    ── HOW THIS IS GROUPED, AND WHY ────────────────────────────────────────

    It used to be nine buttons in one flat column, in roughly the order they
    were built. Nothing in it said that Treatment Logs and Patient History are
    two ways of reading what Charting records — so three similarly-named
    clinical tabs sat side by side, and the difference between them had to be
    worked out from the names alone, every time.

    The two readings are indented under the tab that writes the findings now.
    The groups are what a clinic day is actually made of: who is coming, what
    you do to them, what the patient asks, and the setup behind it.

    Colour is on the rail rather than the words — see css/marble.css.
-->
<div class="sidebar-menu">

    <div class="nav-group nav-group--day">
        <span class="nav-group__label">Today</span>
        <div class="nav-group__items">
            <button id="nav-dentist-queue" class="nav-item active" onclick="switchDentistTab('tab-dentist-queue', this)">
                <?= icon('clock') ?> Today's Queue
            </button>
            <button id="nav-dentist-appointments" class="nav-item" onclick="switchDentistTab('tab-dentist-appointments', this)">
                <?= icon('calendar') ?> Appointments
            </button>
        </div>
    </div>

    <div class="nav-group nav-group--clinical">
        <span class="nav-group__label">Clinical</span>
        <div class="nav-group__items">
            <button id="nav-dentist-chart" class="nav-item" onclick="switchDentistTab('tab-dentist-chart', this)">
                <?= icon('tooth') ?> Charting &amp; X-rays
            </button>
            <!-- Both of these read back what the chart above records. -->
            <button id="nav-dentist-records" class="nav-item nav-item--sub" onclick="switchDentistTab('tab-dentist-records', this)">
                <?= icon('notes') ?> Treatment Logs
            </button>
            <button id="nav-dentist-history" class="nav-item nav-item--sub" onclick="switchDentistTab('tab-dentist-history', this)">
                <?= icon('file') ?> Patient Records
            </button>
            <!-- Take-outs the front desk filed, for Dr. Gapit to approve
                 (2026-10-01). The count is painted by js/stock-requests.js and
                 js/notifications.js. -->
            <button id="nav-dentist-stock" class="nav-item" onclick="switchDentistTab('tab-dentist-stock', this)">
                <?= icon('box') ?> Stock Approvals
            </button>
        </div>
    </div>

    <div class="nav-group nav-group--records">
        <span class="nav-group__label">Patients</span>
        <div class="nav-group__items">
            <button id="nav-dentist-messages" class="nav-item" onclick="switchDentistTab('tab-dentist-messages', this)">
                <?= icon('mail') ?> Patient Messages
            </button>
        </div>
    </div>

    <div class="nav-group nav-group--system">
        <span class="nav-group__label">Clinic setup</span>
        <div class="nav-group__items">
            <button id="nav-dentist-schedule" class="nav-item" onclick="switchDentistTab('tab-dentist-schedule', this)">
                <?= icon('gear') ?> Manage Schedule
            </button>
            <button id="nav-dentist-backup" class="nav-item" onclick="switchDentistTab('tab-dentist-backup', this)">
                <?= icon('shield') ?> Backup &amp; Recovery
            </button>
            <button id="nav-dentist-account" class="nav-item" onclick="switchDentistTab('tab-dentist-account', this)">
                <?= icon('user-gear') ?> Account Settings
            </button>
        </div>
    </div>

    <button class="nav-item logout-button" onclick="performLogout()">
        <?= icon('logout') ?> Log Out
    </button>
</div>
