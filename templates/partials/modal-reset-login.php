<!--
    Reset login (2026-10-02, client revision 18). A patient who forgot their
    password, and cannot get a reset link (no email, or the email is gone),
    asks the clinic. Free: no SMS, no server. Only the Firebase console can
    remove a login, so:
      1. the clinic deletes the old login in the console (the steps are here);
      2. a NEW login is made for the same record, with a temporary password,
         and the record is copied onto it (copyRecordToAccount, Task 17), with
         mustChangePassword so the patient chooses their own at the next
         sign-in (js/first-signin.js).
    The temporary password is shown once and printed if wanted. It is never
    stored anywhere, and nobody can ever see a patient's own password.
    js/staff-patient-registration.js: openResetLogin(), submitResetLogin().
-->
<div id="modal-reset-login" class="modal-overlay">
    <div class="modal-card" style="max-width: 560px;">
        <div class="modal-header">
            <h3>Reset login</h3>
            <button class="modal-close-btn" aria-label="Close" onclick="closeResetLogin()">&times;</button>
        </div>
        <div class="modal-body">
            <p class="field-hint" id="reset-login-who"></p>

            <div id="reset-login-step1">
                <h4 class="reset-login__title">1. Delete the old login in the Firebase console</h4>
                <ol class="reset-login__steps">
                    <li>Open the <a href="https://console.firebase.google.com/project/dentcare-nijims/authentication/users"
                        target="_blank" rel="noopener noreferrer">Firebase console, Authentication &gt; Users</a>.</li>
                    <li>Search for <strong id="reset-login-address"></strong>.</li>
                    <li>Open the menu on its row, and choose <strong>Delete account</strong>.
                        The patient's records are not affected.</li>
                </ol>
                <label class="reset-login__confirm" for="reset-login-deleted">
                    <input type="checkbox" id="reset-login-deleted" onchange="onResetDeletedToggle()">
                    <span>I have deleted the old login.</span>
                </label>

                <h4 class="reset-login__title">2. Make the new login</h4>
                <p class="field-hint">The same sign-in, with a temporary password. The patient chooses their own the next time they sign in.</p>
                <p id="reset-login-status" class="field-hint" role="status" aria-live="polite"></p>
            </div>

            <div id="reset-login-done" class="hidden">
                <h4 class="reset-login__title">New login ready</h4>
                <p>Sign in with: <strong id="reset-login-signin"></strong></p>
                <p>Temporary password:</p>
                <p class="reset-login__temp"><code id="reset-login-temp"></code></p>
                <p class="field-hint">Give this to the patient now, or print the slip. It is shown only here and is not kept anywhere.</p>
            </div>
        </div>
        <div class="modal-footer">
            <button type="button" class="btn-secondary" id="reset-login-cancel" onclick="closeResetLogin()">Cancel</button>
            <button type="button" id="reset-login-create" onclick="submitResetLogin()" disabled>Create new login</button>
            <button type="button" id="reset-login-print" class="btn-secondary hidden" onclick="printResetSlip()">Print slip</button>
            <button type="button" id="reset-login-close" class="hidden" onclick="closeResetLogin()">Done</button>
        </div>
    </div>
</div>
