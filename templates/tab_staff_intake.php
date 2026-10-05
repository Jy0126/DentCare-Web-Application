<div id="tab-staff-intake" class="tab-content hidden">
    <div class="card-header"><h2>Walk-in &amp; Booking</h2></div>
    <div class="card intake-card">
        <h3>Find the patient</h3>
        <p class="field-hint">Use their existing record, with or without an online account.</p>
        <?php $picker_id = 'intake'; include __DIR__ . '/partials/inline-patient-search.php'; ?>
        <div class="intake-actions">
            <button type="button" id="intake-walkin" onclick="addIntakeWalkin()" disabled>Add Walk-in Today</button>
            <button type="button" id="intake-book" class="btn-secondary" onclick="bookIntakePatient()" disabled>Book Appointment</button>
        </div>
        <p id="intake-status" class="field-hint" role="status">Choose a patient before adding a walk-in or booking.</p>
    </div>
</div>
