<?php
/**
 * DentCare — "Confirm your email" (2026-10-01)
 * ---------------------------------------------------------------------------
 * Shown instead of the patient portal to a patient who registered online and
 * has not opened the link Firebase emailed them. Driven by
 * js/email-confirm.js; the database refuses their bookings and messages until
 * then as well (firestore.rules, emailConfirmedOrNotAsked).
 *
 * It only ever speaks about the account signed in on it.
 */
?>
<div id="email-confirm-layout" class="app-layout email-confirm hidden">
    <section class="email-confirm__card card" aria-labelledby="email-confirm-title">
        <img src="images/logo-64.png" alt="" width="48" height="48" class="email-confirm__logo">
        <h2 id="email-confirm-title">Confirm your email</h2>
        <p>
            We sent a link to <strong id="email-confirm-address">your email address</strong>.
            Open it to finish setting up your account. Until then you cannot book
            or send messages.
        </p>
        <p class="field-hint">Check your spam folder if it is not in your inbox.</p>

        <div class="email-confirm__actions">
            <button type="button" id="email-confirm-done" onclick="confirmEmailOpened()">I have opened the link</button>
            <button type="button" id="email-confirm-resend" class="btn-secondary" onclick="resendConfirmEmail()">Send the link again</button>
            <button type="button" class="btn-secondary" onclick="performLogout()">Sign out</button>
        </div>

        <p id="email-confirm-status" class="email-confirm__status" role="status" aria-live="polite"></p>
        <p class="field-hint">
            Never got the email? Ask our staff at the clinic. They can confirm it for you.
        </p>
    </section>
</div>
