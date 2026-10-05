<!-- Staff Sidebar Template -->
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
        <p class="sidebar-subtitle">Operations Panel</p>
    </div>
    <?php $notif_role = 'staff'; include __DIR__ . '/partials/notification-bell.php'; ?>
</div>

<div class="sidebar-user">
    Welcome, <span id="staff-name-display" class="sidebar-user-name">Jane Doe</span>
    <span class="sidebar-user-role">Clinic Staff</span>
</div>

<div class="sidebar-menu">

    <div class="nav-group nav-group--day">
        <span class="nav-group__label">Today</span>
        <div class="nav-group__items">
            <button id="nav-staff-queue" class="nav-item" onclick="switchStaffTab('tab-staff-queue', this)">
                <?= icon('clock') ?> Today's Queue
            </button>
            <button id="nav-staff-intake" class="nav-item" onclick="switchStaffTab('tab-staff-intake', this)">
                <?= icon('calendar') ?> Walk-in &amp; Booking
            </button>
            <button id="nav-staff-appointments" class="nav-item active" onclick="switchStaffTab('tab-staff-appointments', this)">
                <?= icon('calendar') ?> Appointments
            </button>
        </div>
    </div>

    <div class="nav-group nav-group--records">
        <span class="nav-group__label">Money</span>
        <div class="nav-group__items">
            <button id="nav-staff-billing" class="nav-item" onclick="switchStaffTab('tab-staff-billing', this)">
                <?= icon('peso') ?> Billing &amp; Invoices
            </button>
        </div>
    </div>

    <div class="nav-group nav-group--clinical">
        <span class="nav-group__label">Patients</span>
        <div class="nav-group__items">
            <button id="nav-staff-register-patient" class="nav-item" onclick="switchStaffTab('tab-staff-patient-registration', this)">
                <?= icon('clipboard') ?> Register Patient
            </button>
            <button id="nav-staff-history" class="nav-item" onclick="switchStaffTab('tab-staff-history', this)">
                <?= icon('file') ?> Patient History
            </button>
            <button id="nav-staff-messages" class="nav-item" onclick="switchStaffTab('tab-staff-messages', this)">
                <?= icon('mail') ?> Patient Messages
            </button>
        </div>
    </div>

    <div class="nav-group nav-group--supplies">
        <span class="nav-group__label">Supplies</span>
        <div class="nav-group__items">
            <button id="nav-staff-inventory" class="nav-item" onclick="switchStaffTab('tab-staff-inventory', this)">
                <?= icon('box') ?> Medical Inventory
            </button>
        </div>
    </div>

    <div class="nav-group nav-group--system">
        <span class="nav-group__label">Clinic setup</span>
        <div class="nav-group__items">
            <button id="nav-staff-services" class="nav-item" onclick="switchStaffTab('tab-staff-services', this)">
                <?= icon('clipboard') ?> Manage Services
            </button>
            <button id="nav-staff-schedule" class="nav-item" onclick="switchStaffTab('tab-staff-schedule', this)">
                <?= icon('gear') ?> Manage Schedule
            </button>
            <button id="nav-staff-account" class="nav-item" onclick="switchStaffTab('tab-staff-account', this)">
                <?= icon('user-gear') ?> Account Settings
            </button>
        </div>
    </div>

    <button class="nav-item logout-button" onclick="performLogout()">
        <?= icon('logout') ?> Log Out
    </button>
</div>
