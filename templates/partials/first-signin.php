<?php
/**
 * DentCare — the first sign-in screen (2026-10-02, client revisions 17 and 18)
 * ---------------------------------------------------------------------------
 * Shown instead of the patient portal while the patient's record still has
 *   - consentPending: the clinic made the record before the patient signed
 *     the consent (Task 16), so they sign it here;
 *   - mustChangePassword: the clinic gave them a temporary password (Task 18),
 *     so they choose their own.
 * Driven by js/first-signin.js. Each flag is cleared only after its part has
 * worked. It only ever speaks about the account signed in on it.
 */
?>
<div id="first-signin-layout" class="app-layout email-confirm hidden">
    <section class="email-confirm__card card first-signin" aria-labelledby="first-signin-title">
        <img src="images/logo-64.png" alt="" width="48" height="48" class="email-confirm__logo">
        <h2 id="first-signin-title">Before you start</h2>
        <p id="first-signin-intro">Finish these steps once, then your account opens.</p>

        <form id="form-first-signin" onsubmit="submitFirstSignIn(event)" novalidate>
            <!-- 1. The consent, when the clinic could not collect it. -->
            <div id="first-signin-consent" class="hidden">
                <h3>Sign the consent</h3>
                <div class="consent collect-consent">
                    <div class="consent__text" id="first-signin-statement"></div>
                    <div class="consent__agree">
                        <input type="checkbox" id="first-signin-agree">
                        <label for="first-signin-agree">I have read, understood, and voluntarily agree to the Clinical Consent statement above.</label>
                    </div>
                </div>
                <div class="signature collect-consent">
                    <div class="signature__header">
                        <div class="signature__title">Your signature</div>
                        <div class="signature__subtitle">Draw your signature below, and type your full name under it.</div>
                    </div>
                    <div class="signature__wrap">
                        <canvas id="first-signin-canvas" class="signature__pad"></canvas>
                        <div class="signature__tools">
                            <button type="button" class="btn btn--clear" onclick="clearSignatureCanvas('first-signin-canvas')">Clear signature</button>
                            <span class="signature__hint">Draw using mouse or touch</span>
                        </div>
                    </div>
                    <label for="first-signin-name">Signature Over Printed Name <span style="color:red;">*</span></label>
                    <input maxlength="200" type="text" id="first-signin-name" placeholder="Type your full name">
                </div>
            </div>

            <!-- 2. A new password, when the clinic gave a temporary one. -->
            <div id="first-signin-password" class="hidden">
                <h3>Choose your own password</h3>
                <p class="field-hint">The clinic gave you a temporary password. Choose one only you know.</p>
                <div class="form-row">
                    <div class="flex-1">
                        <label for="first-signin-new">New password <span style="color:red;">*</span></label>
                        <div class="password-input-container">
                            <input maxlength="200" type="password" id="first-signin-new" autocomplete="new-password">
                            <?= password_toggle('first-signin-new') ?>
                        </div>
                    </div>
                    <div class="flex-1">
                        <label for="first-signin-new2">Type it again <span style="color:red;">*</span></label>
                        <div class="password-input-container">
                            <input maxlength="200" type="password" id="first-signin-new2" autocomplete="new-password">
                            <?= password_toggle('first-signin-new2') ?>
                        </div>
                    </div>
                </div>
                <p class="field-hint">Use upper and lower case letters, a number and a symbol.</p>
                <!-- Asked for only if Firebase wants the sign-in confirmed again. -->
                <div id="first-signin-current-wrap" class="hidden">
                    <label for="first-signin-current">The temporary password the clinic gave you</label>
                    <div class="password-input-container">
                        <input maxlength="4096" type="password" id="first-signin-current" autocomplete="current-password">
                        <?= password_toggle('first-signin-current') ?>
                    </div>
                </div>
            </div>

            <div class="email-confirm__actions">
                <button type="submit" id="first-signin-save">Save and continue</button>
                <button type="button" class="btn-secondary" onclick="performLogout()">Sign out</button>
            </div>
            <p id="first-signin-status" class="email-confirm__status" role="status" aria-live="polite"></p>
        </form>
    </section>
</div>
