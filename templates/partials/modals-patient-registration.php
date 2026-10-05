<!-- Patient and clinic rescheduling stays in the authenticated portal. -->
<div id="modal-approval-review" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="approval-review-title" hidden>
    <div class="modal-card approval-review-card">
        <div class="modal-header">
            <h3 id="approval-review-title">Appointment details</h3>
            <button type="button" class="modal-close-btn" aria-label="Close appointment details" onclick="closeAppointmentApprovalReview()">&times;</button>
        </div>
        <form onsubmit="confirmReviewedAppointment(event)">
            <div class="modal-body">
                <p id="approval-review-hint" class="field-hint" style="margin-top:0;">Appointment details</p>
                <dl class="approval-review-details">
                    <div><dt>Patient</dt><dd id="approval-review-patient"></dd></div>
                    <div><dt id="approval-review-date-label">Requested date</dt><dd id="approval-review-date"></dd></div>
                    <div><dt id="approval-review-time-label">Requested time</dt><dd id="approval-review-time"></dd></div>
                    <div><dt>Services</dt><dd id="approval-review-services"></dd></div>
                    <div><dt>Status</dt><dd id="approval-review-status"></dd></div>
                    <div id="approval-review-reason-wrap" hidden><dt>Patient's reschedule reason</dt><dd id="approval-review-reason"></dd></div>
                    <div id="approval-review-clinic-reason-wrap" hidden><dt>Clinic's reschedule reason</dt><dd id="approval-review-clinic-reason"></dd></div>
                    <div id="approval-review-notes-wrap" hidden><dt>Patient notes</dt><dd id="approval-review-notes"></dd></div>
                    <div id="approval-review-other-wrap" hidden><dt>Other requested service</dt><dd id="approval-review-other"></dd></div>
                </dl>
            </div>
            <div class="modal-footer">
                <button id="approval-review-reject" type="button" class="btn-secondary" hidden onclick="rejectReviewedAppointment()">Reject request</button>
                <button id="approval-review-approve" type="submit" hidden>Approve appointment</button>
            </div>
        </form>
    </div>
</div>

<div id="modal-reschedule" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="reschedule-title" hidden>
    <div class="modal-card" style="max-width: 540px;">
        <div class="modal-header">
            <h3 id="reschedule-title">Reschedule appointment</h3>
            <button type="button" class="modal-close-btn" aria-label="Close"
                    onclick="closeRescheduleForm()">&times;</button>
        </div>
        <form id="form-reschedule" onsubmit="submitRescheduleForm(event)">
            <div class="modal-body">
                <p id="reschedule-remaining" class="field-hint" style="margin-top:0;"></p>
                <div class="form-row">
                    <div class="flex-1">
                        <label for="reschedule-date">New date <span class="field-req">*</span></label>
                        <input type="date" id="reschedule-date" required onchange="loadRescheduleTimes()">
                    </div>
                    <div class="flex-1">
                        <label for="reschedule-time">Available time <span class="field-req">*</span></label>
                        <select id="reschedule-time" required>
                            <option value="">Select a date first</option>
                        </select>
                    </div>
                </div>
                <div id="reschedule-clinic-options" class="hidden">
                    <label><input type="checkbox" id="reschedule-override" onchange="toggleRescheduleOverride()" style="width:auto;">
                        Arrange a time outside the published schedule
                    </label>
                    <div id="reschedule-custom-wrap" class="hidden">
                        <label for="reschedule-custom-time">Time agreed with the patient</label>
                        <input type="time" id="reschedule-custom-time">
                        <p class="field-hint">Use only for a clinic-approved exception. Occupied slots still cannot be booked.</p>
                    </div>
                </div>
                <label for="reschedule-reason">Why do you need to reschedule? <span class="field-req">*</span></label>
                <textarea id="reschedule-reason" maxlength="1000" rows="4" required
                          placeholder="Tell the clinic briefly so they can help with your new schedule."></textarea>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn-secondary" onclick="closeRescheduleForm()">Cancel</button>
                <button type="submit" id="reschedule-submit">Request new schedule</button>
            </div>
        </form>
    </div>
</div>
