<!-- Patient Sidebar Template -->
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
        <p class="sidebar-subtitle">Patient Hub</p>
    </div>
    <?php $notif_role = 'patient'; include __DIR__ . '/partials/notification-bell.php'; ?>
</div>

<div class="sidebar-user">
    Welcome, <span id="patient-name-display" class="sidebar-user-name">Patient</span>
    <span class="sidebar-user-role">Patient Access</span>
</div>

<!--
    ── TWO GROUPS, NOT FOUR ────────────────────────────────────────────────

    A patient has four things to do here, and inventing a heading for each one
    would be structure for its own sake: four labels above four buttons tells
    you nothing the buttons did not already say.

    Two is the real division — what is yours (your bookings) and what the
    clinic offers you (advice, a way to ask a question, and your account).
    Same rails and colours as the clinical side, so a patient who later sees a
    staff screen recognises the shape of it.

    There is no medical history item. Since 2026-09-30, at the owner's
    instruction, a patient account shows nothing clinical: no operations, no
    diagnosis, no bill. The clinic keeps those records and a patient asks the
    clinic for them; firestore.rules refuses the reads as well.
-->
<div class="sidebar-menu">

    <div class="nav-group nav-group--day">
        <span class="nav-group__label">My care</span>
        <div class="nav-group__items">
            <button id="nav-patient-appointments" class="nav-item active" onclick="switchPatientTab('tab-patient-appointments', this)">
                <?= icon('calendar') ?> Book &amp; Appointments
            </button>
        </div>
    </div>

    <div class="nav-group nav-group--clinical">
        <span class="nav-group__label">From the clinic</span>
        <div class="nav-group__items">
            <button id="nav-patient-guides" class="nav-item" onclick="switchPatientTab('tab-patient-guides', this)">
                <?= icon('bulb') ?> Oral Care Guides
            </button>
            <button id="nav-patient-messages" class="nav-item" onclick="switchPatientTab('tab-patient-messages', this)">
                <?= icon('mail') ?> Message the Clinic
            </button>
            <button id="nav-patient-account" class="nav-item" onclick="switchPatientTab('tab-patient-account', this)">
                <?= icon('user-gear') ?> Account Settings
            </button>
        </div>
    </div>

    <button class="nav-item logout-button" onclick="performLogout()">
        <?= icon('logout') ?> Log Out
    </button>
</div>
