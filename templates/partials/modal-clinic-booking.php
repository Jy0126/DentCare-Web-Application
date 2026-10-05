<!--
    Book for a patient (2026-10-01, client revision 16). The front desk books an
    appointment for a patient who called, with or without an online account:
    the patient, up to three services or Others, a date and an open time (the
    same slot list the patient's own form shows), and notes. It is saved
    Approved, because the clinic made it, with its slot lock in one transaction.
    js/clinic-booking.js: openClinicBooking() and submitClinicBooking().
-->
<div id="modal-clinic-book" class="modal-overlay">
    <div class="modal-card" style="max-width: 640px;">
        <div class="modal-header">
            <h3>Book Appointment</h3>
            <button class="modal-close-btn" aria-label="Close"
                    onclick="closeModal('modal-clinic-book')">&times;</button>
        </div>
        <form id="form-clinic-book" onsubmit="submitClinicBooking(event)" novalidate>
            <div class="modal-body">
                <!-- 1. The patient: found by surname, the way the walk-in search works. -->
                <div id="clinic-book-find">
                    <?php $picker_id = 'clinic-book'; include __DIR__ . '/inline-patient-search.php'; ?>
                </div>
                <div id="clinic-book-picked" class="clinic-book__picked hidden">
                    <span><strong id="clinic-book-picked-name"></strong>
                        <span class="field-hint" id="clinic-book-picked-meta"></span></span>
                    <button type="button" class="btn-secondary btn-sm" onclick="changeClinicBookingPatient()">Change</button>
                </div>

                <!-- 2. What for: up to three services, or Others. -->
                <fieldset class="clinic-book__services">
                    <legend>Services <span class="field-req">*</span> <span class="field-hint">(up to three, including Others)</span></legend>
                    <div id="clinic-book-service-list" class="clinic-book__service-list" role="group" aria-label="Services">
                        <p class="field-hint">Loading services&hellip;</p>
                    </div>
                    <label class="clinic-book__service" for="clinic-book-other">
                        <input type="checkbox" id="clinic-book-other" onchange="onClinicBookingServiceChanged(this)">
                        <span>Others</span>
                    </label>
                    <div id="clinic-book-other-wrap" class="hidden">
                        <label for="clinic-book-other-note">What the patient needs <span class="field-req">*</span></label>
                        <textarea maxlength="2000" id="clinic-book-other-note" rows="2"></textarea>
                    </div>
                </fieldset>

                <!-- 3. When: the dates the clinic opened, and the times still free. -->
                <div class="form-row">
                    <div class="flex-1">
                        <label for="clinic-book-date">Date <span class="field-req">*</span></label>
                        <select id="clinic-book-date" onchange="onBookingDateChanged('clinic-book-date', 'clinic-book-time')">
                            <option value="" disabled selected>Select Date</option>
                        </select>
                    </div>
                    <div class="flex-1">
                        <label for="clinic-book-time">Time <span class="field-req">*</span></label>
                        <select id="clinic-book-time">
                            <option value="" disabled selected>Select Date First</option>
                        </select>
                    </div>
                </div>

                <label for="clinic-book-notes">Notes</label>
                <textarea maxlength="2000" id="clinic-book-notes" rows="2"
                          placeholder="E.g., called on the phone; prefers the morning"></textarea>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn-secondary"
                        onclick="closeModal('modal-clinic-book')">Cancel</button>
                <button type="submit" id="clinic-book-save">Book appointment</button>
            </div>
        </form>
    </div>
</div>
