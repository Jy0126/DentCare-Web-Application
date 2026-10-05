<!--
    Create online account (2026-10-02, client revision 17). For a record the
    front desk made with no login: the patient types their mobile number, their
    email if they have one, and the password they want. The record is copied
    onto the new account and its history stays linked:
    copyRecordToAccount() in js/staff-patient-registration.js.

    The password is typed by the patient and never shown or kept anywhere.
-->
<div id="modal-create-account" class="modal-overlay">
    <div class="modal-card" style="max-width: 560px;">
        <div class="modal-header">
            <h3>Create online account</h3>
            <button class="modal-close-btn" aria-label="Close"
                    onclick="closeModal('modal-create-account')">&times;</button>
        </div>
        <form id="form-create-account" onsubmit="submitCreateAccount(event)" novalidate>
            <div class="modal-body">
                <p class="field-hint" id="create-account-who"></p>

                <p id="create-account-consent" class="visit-consent-notice hidden">
                    The consent is not signed yet.
                    <button type="button" class="btn-link" onclick="collectConsentBeforeAccount()">Collect it now</button>,
                    or the patient signs it the first time they sign in.
                </p>

                <label for="create-account-phone">Mobile number <span style="color:red;">*</span></label>
                <input maxlength="30" type="tel" id="create-account-phone" placeholder="0917-XXX-XXXX" autocomplete="off">

                <label for="create-account-email">Email (optional)</label>
                <input maxlength="320" type="email" id="create-account-email" placeholder="name@example.com" autocomplete="off">
                <p class="field-hint">With an email, the patient signs in with it. Without one, they sign in with the mobile number.</p>

                <p class="field-hint"><strong>Hand the tablet to the patient</strong> to type the password they want. Nobody at the clinic sees it again.</p>
                <div class="form-row">
                    <div class="flex-1">
                        <label for="create-account-password">Password <span style="color:red;">*</span></label>
                        <div class="password-input-container">
                            <input maxlength="200" type="password" id="create-account-password" autocomplete="new-password"
                                   placeholder="At least 8 characters">
                            <?= password_toggle('create-account-password') ?>
                        </div>
                    </div>
                    <div class="flex-1">
                        <label for="create-account-password2">Type it again <span style="color:red;">*</span></label>
                        <div class="password-input-container">
                            <input maxlength="200" type="password" id="create-account-password2" autocomplete="new-password">
                            <?= password_toggle('create-account-password2') ?>
                        </div>
                    </div>
                </div>
                <p class="field-hint">Use upper and lower case letters, a number and a symbol.</p>

                <?php /* Ticked by the patient, on the tablet (2026-10-03, R22). */ ?>
                <?= privacy_agree_box('create-account-privacy') ?>

                <p id="create-account-status" class="field-hint" role="status" aria-live="polite"></p>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn-secondary"
                        onclick="closeModal('modal-create-account')">Cancel</button>
                <button type="submit" id="create-account-save">Create account</button>
            </div>
        </form>
    </div>
</div>
