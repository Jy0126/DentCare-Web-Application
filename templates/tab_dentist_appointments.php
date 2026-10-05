<!-- Dentist Tab: Appointments Calendar -->
<div id="tab-dentist-appointments" class="tab-content hidden">
    <div class="card-header">
        <h2>My Clinical Schedule</h2>
    </div>

    <div class="card">
        <div class="sched-head">
            <h3 id="dentist-sched-title">Today's Appointments</h3>
            <div class="seg" role="group" aria-label="Which appointments to show">
                <button type="button" class="seg__btn is-on" id="seg-today" aria-pressed="true"
                        onclick="setDentistWindow('today')">Today</button>
                <button type="button" class="seg__btn" id="seg-pending" aria-pressed="false"
                        onclick="setDentistWindow('pending')">Pending</button>
                <button type="button" class="seg__btn" id="seg-approved" aria-pressed="false"
                        onclick="setDentistWindow('approved')">Approved</button>
                <button type="button" class="seg__btn" id="seg-completed" aria-pressed="false"
                        onclick="setDentistWindow('completed')">Completed</button>
                <button type="button" class="seg__btn" id="seg-cancelled" aria-pressed="false"
                        onclick="setDentistWindow('cancelled')">Cancelled</button>
            </div>
        </div>
            <div class="table-container appt-table-container" data-freeze data-pin-actions>
            <table>
                <thead>
                    <tr>
                        <th>Patient Name</th>
                        <th>Age / Gender</th>
                        <th>Phone Number</th>
                        <th>Appt. Date & Time</th>
                        <th>Treatment Type</th>
                        <th data-card="badge">Status</th>
                        <th data-card="actions">Actions</th>
                    </tr>
                </thead>
                <tbody id="dentist-appointments-table">
                    <tr>
                        <td colspan="7" style="text-align: center;">No scheduled appointments.</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</div>
