<?php
/**
 * DentCare — Account settings
 * ---------------------------------------------------------------------------
 * Shared by all three dashboards. Requires $role_prefix ('patient', 'staff' or
 * 'dentist').
 *
 * ── WHY THIS EXISTS (clinic request, 2026-09-16) ───────────────────────────
 *
 * Three real problems, all of which used to end in "delete the account and
 * start again":
 *
 *   1. The clinic is launching with test logins: dentist@dentcare.com and the
 *      like. Deleting them would orphan everything that uid has signed, which
 *      for the dentist is every treatment log, amendment and restore. So the
 *      account is KEPT and its email is changed here.
 *   2. The names were fixed too, so a test account called "Jane Doe" could not
 *      become the real member of staff. It can now.
 *   3. A patient whose email has been closed cannot use "Forgot password",
 *      because the reset goes to an address nobody reads. While they can still
 *      sign in, they change the address here themselves.
 *
 * ── WHAT THIS SCREEN CANNOT DO, AND WHY ────────────────────────────────────
 *
 * A signed-in browser can only change ITS OWN login. Firebase does not let one
 * account change another's email or password; that needs the Firebase console.
 * So there is no "manage everybody" panel here, and the recovery contact is a
 * contact for the clinic to ring rather than a second address Firebase can send
 * a reset to.
 *
 * ── ONE CARD (clinic request, 2026-09-16) ──────────────────────────────────
 *
 * It was four stacked cards, which read as four separate screens for what is
 * one job: looking after your own login. One card, four short sections, and a
 * plain closing paragraph.
 */

$prefix = $role_prefix ?? 'patient';
$isPatient = ($prefix === 'patient');
?>
<div id="tab-<?php echo $prefix; ?>-account" class="tab-content hidden">
    <div class="card-header">
        <h2>Account Settings</h2>
    </div>

    <div class="card acct-card">

        <!-- ── Who is signed in ─────────────────────────────────────────── -->
        <dl class="acct-facts">
            <div>
                <dt>Name</dt>
                <dd id="<?php echo $prefix; ?>-acct-name">&mdash;</dd>
            </div>
            <div>
                <dt>Role</dt>
                <dd id="<?php echo $prefix; ?>-acct-role">&mdash;</dd>
            </div>
            <div>
                <dt id="<?php echo $prefix; ?>-acct-email-label">Sign-in email</dt>
                <dd id="<?php echo $prefix; ?>-acct-email">&mdash;</dd>
            </div>
        </dl>

        <!-- ── The name shown around the clinic ─────────────────────────── -->
        <section class="acct-section">
            <h3 class="acct-section__title">Your name</h3>
            <p class="acct-section__hint">
                <?php if ($isPatient): ?>
                    This is the name on your record and on anything the clinic prints for you.
                    Use your real name, as it appears on your ID. The clinic is told when a
                    patient changes it.
                <?php else: ?>
                    Shown on the dashboard and beside anything you record, such as a receipt
                    or a treatment log. To change an existing name, enter each part below;
                    an older full name cannot be split reliably for you.
                <?php endif; ?>
            </p>
            <form id="<?php echo $prefix; ?>-form-acct-profile"
                  onsubmit="submitAccountName(event, '<?php echo $prefix; ?>')">
                <?php if ($isPatient): ?>
                    <div class="form-row">
                        <div class="flex-1">
                            <label for="patient-acct-first">First name</label>
                            <input maxlength="100" type="text" id="patient-acct-first" required>
                        </div>
                        <div class="flex-1">
                            <label for="patient-acct-middle">Middle name</label>
                            <input maxlength="100" type="text" id="patient-acct-middle"
                                   placeholder="Optional">
                        </div>
                        <div class="flex-1">
                            <label for="patient-acct-last">Last name</label>
                            <input maxlength="100" type="text" id="patient-acct-last" required>
                        </div>
                    </div>
                <?php else: ?>
                    <div class="form-row">
                        <div class="flex-1">
                            <label for="<?php echo $prefix; ?>-acct-first">First name</label>
                            <input maxlength="100" type="text" id="<?php echo $prefix; ?>-acct-first"
                                   autocomplete="given-name" required>
                        </div>
                        <div class="flex-1">
                            <label for="<?php echo $prefix; ?>-acct-middle">Middle name</label>
                            <input maxlength="100" type="text" id="<?php echo $prefix; ?>-acct-middle"
                                   autocomplete="additional-name" placeholder="Optional">
                        </div>
                        <div class="flex-1">
                            <label for="<?php echo $prefix; ?>-acct-last">Last name</label>
                            <input maxlength="100" type="text" id="<?php echo $prefix; ?>-acct-last"
                                   autocomplete="family-name" required>
                        </div>
                    </div>
                <?php endif; ?>
                <?php if ($isPatient): ?>
                    <!-- The 180-day countdown; js/account.js renderNameLock(). -->
                    <p class="acct-name-lock" id="patient-acct-name-lock" role="status" hidden></p>
                <?php endif; ?>
                <button type="submit" id="<?php echo $prefix; ?>-acct-profile-btn">Save name</button>
                <p class="acct-status" id="<?php echo $prefix; ?>-acct-profile-status"></p>
            </form>
        </section>

        <!-- ── Change the password ──────────────────────────────────────── -->
        <section class="acct-section">
            <h3 class="acct-section__title">Change the password</h3>
            <form id="<?php echo $prefix; ?>-form-acct-pass"
                  onsubmit="submitAccountPassword(event, '<?php echo $prefix; ?>')">
                <label for="<?php echo $prefix; ?>-acct-old-pass">Current password</label>
                <div class="password-input-container">
                    <input maxlength="4096" type="password" id="<?php echo $prefix; ?>-acct-old-pass"
                           autocomplete="current-password" required>
                    <?= password_toggle($prefix . '-acct-old-pass') ?>
                </div>

                <div class="form-row">
                    <div class="flex-1">
                        <label for="<?php echo $prefix; ?>-acct-new-pass">New password</label>
                        <div class="password-input-container">
                            <input maxlength="200" type="password" id="<?php echo $prefix; ?>-acct-new-pass"
                                   autocomplete="new-password" required
                                   placeholder="8 characters, a capital and a number">
                            <?= password_toggle($prefix . '-acct-new-pass') ?>
                        </div>
                    </div>
                    <div class="flex-1">
                        <label for="<?php echo $prefix; ?>-acct-new-pass2">New password again</label>
                        <div class="password-input-container">
                            <input maxlength="200" type="password" id="<?php echo $prefix; ?>-acct-new-pass2"
                                   autocomplete="new-password" required>
                            <?= password_toggle($prefix . '-acct-new-pass2') ?>
                        </div>
                    </div>
                </div>

                <button type="submit" id="<?php echo $prefix; ?>-acct-pass-btn">Change password</button>
                <p class="acct-status" id="<?php echo $prefix; ?>-acct-pass-status"></p>
            </form>
        </section>

        <!-- ── Change the sign-in email ─────────────────────────────────── -->
        <!-- Hidden for an account that signs in with its mobile number
             (2026-10-01): it has no email to change. js/account.js. -->
        <section class="acct-section" id="<?php echo $prefix; ?>-acct-email-section">
            <h3 class="acct-section__title">Change the sign-in email</h3>
            <p class="acct-section__hint">
                This is the address used to sign in, and the only one a password reset
                can be sent to. We send a confirmation link to the new address first, so
                a mistyped address changes nothing and cannot lock you out.
            </p>
            <form id="<?php echo $prefix; ?>-form-acct-email"
                  onsubmit="submitAccountEmail(event, '<?php echo $prefix; ?>')">
                <label for="<?php echo $prefix; ?>-acct-new-email">New email</label>
                <input maxlength="320" type="email" id="<?php echo $prefix; ?>-acct-new-email"
                       autocomplete="email" required placeholder="name@example.com">

                <label for="<?php echo $prefix; ?>-acct-email-pass">Your current password</label>
                <div class="password-input-container">
                    <input maxlength="4096" type="password" id="<?php echo $prefix; ?>-acct-email-pass"
                           autocomplete="current-password" required
                           placeholder="Needed to prove it is really you">
                    <?= password_toggle($prefix . '-acct-email-pass') ?>
                </div>

                <button type="submit" id="<?php echo $prefix; ?>-acct-email-btn">Send the confirmation link</button>
                <p class="acct-status" id="<?php echo $prefix; ?>-acct-email-status"></p>
            </form>
        </section>

<?php if ($isPatient): ?>
        <!-- ── Recovery contact: a person to ring, not a second inbox ───── -->
        <section class="acct-section">
            <h3 class="acct-section__title">If you lose access to your email</h3>
            <p class="acct-section__hint">
                Leave another way to reach you. The clinic uses it to check who you are
                and then changes your sign-in email for you. Nothing is sent to it
                automatically.
            </p>
            <form id="patient-form-acct-recovery" onsubmit="submitRecoveryContact(event)">
                <div class="form-row">
                    <div class="flex-1">
                        <label for="patient-acct-recovery-email">Another email (optional)</label>
                        <input maxlength="320" type="email" id="patient-acct-recovery-email"
                               placeholder="A family member's address is fine">
                    </div>
                    <div class="flex-1">
                        <label for="patient-acct-recovery-phone">Mobile number (optional)</label>
                        <input maxlength="30" type="text" id="patient-acct-recovery-phone"
                               placeholder="09XX XXX XXXX">
                    </div>
                </div>
                <button type="submit" id="patient-acct-recovery-btn">Save recovery contact</button>
                <p class="acct-status" id="patient-acct-recovery-status"></p>
            </form>
        </section>

        <p class="acct-closing">
            Already locked out of your email? Ring the clinic on
            <?= e($clinic['phone'] ?? '0923-618-3285') ?>. Bring a valid ID, or be ready to
            confirm your birth date and your last visit. The clinic changes the email on
            your account, then you set a new password from the link it sends.
        </p>
<?php else: ?>
        <p class="acct-closing">
            Nobody can change another person's password or email from this website, so
            everyone looks after their own account here. If a patient is locked out of
            their email, check who they are first, using a valid ID or their birth date
            and last visit. Dr. Gapit then changes the email on their account in the
            Firebase console, under Authentication and then Users, and sends them a
            password reset. If the patient left a recovery contact, it is on their record.
        </p>
<?php endif; ?>
    </div>
</div>
