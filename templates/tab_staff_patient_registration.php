<!-- The same three-step form as public registration, embedded in the staff dashboard.
     Since 2026-10-01 (client revision 16) it makes a patient RECORD, not an
     online account: js/staff-patient-registration.js, submitStaffPatientRecord(). -->
<section id="tab-staff-patient-registration" class="tab-content hidden" aria-labelledby="staff-register-title">
    <div class="card-header">
        <h2 id="staff-register-title">Add or Register a Patient</h2>
    </div>
    <div class="card staff-intake-card">
        <p class="field-hint staff-intake-intro">Make the patient's record on Dr. Gapit's form. Only the first name, last name and date of birth are required, and the patient gets no online account. Save record keeps what is filled in so far. Your staff account stays signed in.</p>
        <?php $staff_intake = true; include __DIR__ . '/partials/patient-registration-form.php'; unset($staff_intake); ?>
        <div id="staff-saved-patient" class="staff-saved-patient" role="status" tabindex="-1" hidden>
            <h3>Patient record saved</h3>
            <p><span id="staff-saved-name"></span> is saved. Find them in the walk-in search and on Patient History.</p>
            <p id="staff-queue-state"></p>
            <div class="staff-intake-actions">
                <button type="button" id="staff-queue-retry" onclick="retryStaffPatientQueue()" hidden>Retry queue only</button>
                <button type="button" id="staff-saved-done" class="btn-secondary" onclick="registerAnotherStaffPatient()">Add another</button>
            </div>
        </div>
    </div>
</section>
