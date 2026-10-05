<!-- Patient Tab: Bookings & Appointments -->
<div id="tab-patient-appointments" class="tab-content">
    <div class="card-header">
        <h2>Book a Dental Appointment</h2>
    </div>
    
    <div class="dashboard-flex-row">
        <!-- Booking form -->
        <div class="card flex-1" style="min-width: 320px;">
            <h3>Schedule Treatment</h3>
            <form id="form-patient-book" onsubmit="submitBooking(event)">
                <!-- Hidden dentist selector (defaults to Dr. Reina G. Gapit) -->
                <select id="book-dentist" style="display: none;" required>
                    <option value="gapit_dentist_uid" selected>Dr. Reina G. Gapit</option>
                </select>

                <!--
                    Services are multi-select as of 2026-08-29 (client request):
                    a patient books a cleaning AND a filling in one visit, which
                    the old single dropdown could not express — they had to book
                    twice, or book one and describe the other in the notes where
                    nothing could count it.

                    NO PRICE IS SHOWN HERE, on purpose. The fee is decided by
                    Dr. Gapit after the treatment, not quoted at booking. See
                    the note in js/appointments.js:submitBooking().
                -->
                <label for="book-service">What do you need? / Ano ang kailangan ninyo? <span class="field-req">*</span></label>
                <p class="field-hint">
                    Choose up to three services. Use Others for a request that is not listed;
                    describe symptoms or special requests in Notes below.
                </p>
                <div class="svc-picker">
                    <button type="button" id="book-service" class="svc-picker__trigger"
                            aria-expanded="false" aria-controls="book-service-options"
                            onclick="toggleBookingServicePicker()">Loading services…</button>
                    <div id="book-service-options" class="svc-picker__panel hidden">
                        <div id="book-service-list" class="svc-picker__list" role="group" aria-label="Available services"></div>
                        <label class="svc-item svc-item--other" for="book-service-other">
                            <input type="checkbox" id="book-service-other" onchange="onBookingServiceChanged(this)">
                            <span class="svc-item__body"><span class="svc-item__name">Others</span>
                            <span class="svc-item__desc">A concern or treatment not on this list</span></span>
                        </label>
                        <div class="svc-picker__footer"><span id="book-service-count" aria-live="polite">0 of 3 selected</span>
                            <button type="button" class="btn-secondary btn-sm" onclick="toggleBookingServicePicker(false)">Done</button>
                        </div>
                    </div>
                </div>

                <div id="book-other-wrap" class="hidden">
                    <label for="book-other-note">Tell us what you need <span class="field-req">*</span></label>
                    <textarea maxlength="2000" id="book-other-note" rows="3"
                              placeholder="e.g. a chipped front tooth, bleeding gums, a second opinion on braces…"></textarea>
                </div>

                <div id="book-services-summary" class="svc-summary hidden"></div>

                <div class="form-row">
                    <div class="flex-1">
                        <label for="book-date">Preferred Date</label>
                        <select id="book-date" onchange="onBookingDateChanged()" required>
                            <option value="" disabled selected>Select Date</option>
                        </select>
                    </div>
                    <div class="flex-1">
                        <label for="book-time">Preferred Time</label>
                        <select id="book-time" required>
                            <option value="" disabled selected>Select Date First</option>
                        </select>
                    </div>
                </div>

                <label for="book-notes">Special Concerns / Notes</label>
                <textarea maxlength="2000" id="book-notes" placeholder="Describe any dental pain, requests, or symptoms..."></textarea>

                <button type="submit" style="width: 100%; margin-top: var(--space-s);">Submit Booking Request</button>
            </form>
        </div>

        <!-- Appointment list -->
        <div class="card flex-2" style="min-width: 480px;">
            <h3>My Appointments</h3>
            <div class="table-container appt-table-container" data-freeze data-pin-actions>
                <table>
                    <thead>
                        <tr>
                            <th>Date & Time</th>
                            <th>Dentist</th>
                            <th>Treatment</th>
                            <th data-card="badge">Status</th>
                            <th data-card="actions">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="patient-appointments-table">
                        <tr>
                            <td colspan="5" style="text-align: center;">No appointments found.</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</div>
