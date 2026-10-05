<?php
/**
 * DentCare — Booking & Registration Screen
 * ---------------------------------------------------------------------------
 * Shown when a visitor clicks "Book a Visit" / "Patient Login" on the landing
 * page. Screen switching lives in js/booking.js; the multi-step registration
 * logic and validation live in js/auth.js.
 *
 * Steps: 1) Account details  2) Health screening  3) Consent & signature
 */

require_once __DIR__ . '/partials/helpers.php';
?>

<div id="screen-booking" class="booking-page hidden">
    
    <!-- Navigation Header Bar -->
    <div class="booking-header">
        <button type="button" class="btn btn--outline" onclick="closeBookingPage()">
            <?= icon('arrow-left') ?> Back to Clinic Home
        </button>

        <a href="#" class="brand" onclick="closeBookingPage(); return false;">
            <div class="brand__badge">
                <img src="images/logo-64.png" alt="" class="brand__logo" width="32" height="32">
            </div>
            <div class="brand__text">
                <div class="brand__name">Dent<span>Care</span></div>
                <div class="brand__tagline">Dr. Reina G. Gapit Dental Clinic</div>
            </div>
        </a>

        <div class="auth-tabs" style="margin: 0; border: none;">
            <button id="tab-btn-login" class="auth-tab-btn" onclick="toggleAuthForm('login')">LOGIN</button>
            <button id="tab-btn-register" class="auth-tab-btn active" onclick="toggleAuthForm('register')">PATIENT REGISTRATION</button>
        </div>
    </div>

    <!-- Spacious Main Container (980px wide) -->
    <div class="booking-card">
        <div class="login-aside">
            <div class="login-aside__brand">
                <span class="login-aside__mark"><img src="images/logo-160.png" alt="" width="54" height="54"></span>
                <span><strong>DentCare</strong><small>Dr. Reina G. Gapit Dental Clinic</small></span>
            </div>
            <div class="login-aside__message">
                <p>Welcome to a simpler way to care for your smile.</p>
                <span>Appointments and your care journey in one place.</span>
            </div>
        </div>
        
        <!-- LOGIN FORM (Full page view mode) -->
        <form id="form-login" class="auth-form hidden" onsubmit="submitLogin(event)">
            <div class="login-form-heading">
                <div class="form-step__title">Welcome back</div>
                <div class="form-step__subtitle">Sign in to book and manage your appointments.</div>
            </div>

            <!-- Email, or the mobile number an account without an email signs in
                 with (2026-10-01; signInAddressFor() in js/app.js). The example
                 shows an email only (owner, 2026-10-04): the clinic tells
                 patients in person that their mobile number also works. -->
            <label for="login-email">Email or mobile number</label>
            <input maxlength="320" type="text" inputmode="email" autocomplete="username" id="login-email"
                   placeholder="name@example.com" required>

            <label for="login-password">Password</label>
            <div class="password-input-container">
                <input maxlength="4096" type="password" id="login-password" placeholder="••••••••" autocomplete="current-password" required>
                <button type="button" class="password-toggle-btn" onclick="togglePasswordVisibility('login-password', this)" aria-label="Toggle Password Visibility">
                    <svg class="eye-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                </button>
            </div>
            <div class="forgot-links-container">
                <a href="#" class="forgot-link" onclick="openForgotModal('password'); return false;">Forgot Password?</a>
            </div>

            <?php if (privacy_feature_on()): ?>
            <!-- "I agree to the Privacy Policy", every sign-in, for every role
                 (2026-10-03, R22, as on MyMedsPH). The button waits for it. -->
            <?= privacy_agree_box('login-privacy', 'updateLoginPrivacy()') ?>
            <p class="field-hint privacy-agree__hint" id="login-privacy-hint">Tick the box to sign in.</p>
            <?php endif; ?>

            <button type="submit" class="login-submit" id="login-submit"<?= privacy_feature_on() ? ' disabled' : '' ?>>Access Dashboard</button>
            
            <div class="auth-form-footer">
                Don't have an account? <a href="#" onclick="toggleAuthForm('register'); return false;">Register as a New Patient</a>
            </div>
        </form>

        <!--
            Shown only when the visitor arrived through the Walk-In button on
            the landing page. Revealed by startWalkInRegistration().

            It exists so the person filling this in at the front desk can tell
            that they are on the walk-in path — the form itself is identical,
            which is the point, and without a marker there would be nothing on
            screen to distinguish the two routes.
        -->
        <div id="walkin-banner" class="walkin-banner hidden">
            <?= icon('clock') ?>
            <span>
                <strong>Walk-in registration.</strong>
                Finish this form and you will be added to today&rsquo;s queue
                automatically. There is no date to pick.
            </span>
        </div>

        <?php include __DIR__ . '/partials/patient-registration-form.php'; ?>

    </div>

</div>
