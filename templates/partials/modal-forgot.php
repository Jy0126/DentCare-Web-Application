<?php
/**
 * DentCare — Forgot password modal
 * ---------------------------------------------------------------------------
 * Belongs to the public page: it is opened from the login form in
 * templates/booking.php, which a signed-out visitor uses.
 */
?>

<div id="modal-forgot" class="modal-overlay">
    <div class="modal-card" style="max-width: 450px;">
        <div class="modal-header">
            <h3 id="forgot-modal-title">Forgot Password</h3>
            <button type="button" class="modal-close-btn" aria-label="Close"
                    onclick="closeForgotModal()">&times;</button>
        </div>
        <div class="modal-body" style="padding: var(--space-m);">
            <form id="form-forgot-password" class="auth-form" onsubmit="submitForgotPassword(event)">
                <!-- "the email address associated with your account" was too
                     abstract for the patients this clinic serves. It has to say
                     WHICH address, because the reset only works for the one the
                     account was made with and nothing afterwards can tell her
                     she used the wrong one. -->
                <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: var(--space-s);">
                    Type the email address you used when you registered. We will send
                    a link to that address so you can choose a new password. If you
                    sign in with your mobile number, type the number.
                </p>
                <label for="forgot-pwd-email">Email address or mobile number</label>
                <!-- Checked on blur, because after sending we can only ever say
                     "if that address is registered..." — see the note above
                     submitForgotPassword() in js/auth.js. A typo caught here is
                     a typo caught; a typo caught later is a patient waiting for
                     an email that was never sent. -->
                <input maxlength="320" type="text" inputmode="email" autocomplete="username" id="forgot-pwd-email"
                       placeholder="name@example.com or 0917 555 0101" required
                       onblur="if (this.value.indexOf('@') !== -1) checkEmailFieldLive('forgot-pwd-email')">
                <!-- A mobile-number account has no reset link (2026-10-01). Filled
                     by submitForgotPassword() in js/auth.js. -->
                <p id="forgot-mobile-note" class="forgot-mobile-note" role="status" hidden></p>
                <button type="submit" style="margin-top: var(--space-xs); width: 100%;">Send Reset Link</button>
            </form>

            <!-- Shown INSTEAD of the form once the request has gone out.
                 It replaces the form rather than closing the modal on purpose:
                 this panel is the only place a patient is told what the email
                 will look like, and a toast that vanishes in four seconds is no
                 use to somebody who is about to go hunting through a spam
                 folder. It stays on screen while she looks. -->
            <div id="forgot-sent" class="forgot-sent hidden">
                <p class="forgot-sent__lead">
                    If that address is registered, a reset link is on its way.
                </p>

                <!-- The sender is filled in from firebaseConfig at runtime, so
                     it cannot drift from the project the app actually talks to.
                     Naming it matters: the address looks nothing like the
                     clinic, and a patient who has been taught not to trust
                     strange senders is right to hesitate — unless we told her
                     to expect it. -->
                <p class="forgot-sent__row">
                    Look for an email from<br>
                    <strong id="forgot-sender-address">the DentCare sign-in service</strong><br>
                    <span class="forgot-sent__muted">That address looks odd, but it is us.</span>
                </p>

                <p class="forgot-sent__row">
                    It can take a few minutes, and it often lands in
                    <strong>spam</strong> or <strong>junk</strong>. Please look there too.
                </p>

                <p class="forgot-sent__row">
                    If nothing arrives, call the clinic on
                    <strong>0923-618-3285</strong> and we will sort it out with you.
                </p>

                <button type="button" style="margin-top: var(--space-xs); width: 100%;"
                        onclick="closeForgotModal()">Done</button>
            </div>

        </div>
    </div>
</div>
