<!-- Staff Tab: Approve Bookings -->
<div id="tab-staff-appointments" class="tab-content">
    <div class="card-header">
        <h2>Appointments</h2>
    </div>

    <!--
        The three counts, in the same shape the Billing tab's money summary
        already uses. It was three identical cards, each with a 44px pastel
        tile behind its icon — accent, teal, accent — which made the row read
        as decoration and gave equal weight to a number that needs acting on
        and two that are just history.

        PENDING LEADS, and that is a deliberate departure from "make Approved
        the hero". Approved is a count of work already dealt with; pending is
        the queue, and clearing it is what this screen is for — the tab is
        literally called Approve Patient Bookings. The big number should be the
        one that asks something of the person reading it.
    -->
    <section class="metrics card" aria-label="Booking summary">
        <p class="metrics__label">Waiting for approval</p>
        <p class="metrics__figure" id="stats-pending-count">0</p>

        <!-- Real data, not decoration: one bar per day, built from the
             appointment dates already loaded. See renderBookingSparkline(). -->
        <div class="metrics__spark" id="stats-spark" aria-hidden="true"></div>
        <p class="metrics__scope" id="stats-spark-scope"></p>

        <dl class="metrics__rest">
            <div>
                <dt>Approved</dt>
                <dd id="stats-approved-count">0</dd>
            </div>
            <div>
                <dt>Completed</dt>
                <dd id="stats-completed-count">0</dd>
            </div>
        </dl>
    </section>

    <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-s); flex-wrap: wrap; gap: var(--space-xs);">
            <h3>Appointments</h3>
            <!-- Filter Pills -->
            <!-- Each pill carries its live count (paintStaffFilterCounts() in
                 js/appointments.js) and says which one is selected. -->
            <!-- Today is first and is where the screen opens (2026-09-30): every
                 appointment dated today, whatever its status, in time order.
                 The status filters cover every loaded date, newest first. -->
            <div class="appt-filter-pills" role="group" aria-label="Show appointments">
                <button type="button" class="appt-filter" data-appt-filter="Today" aria-pressed="true" onclick="filterStaffAppointments('Today')">Today <span class="filter-count">0</span></button>
                <button type="button" class="appt-filter" data-appt-filter="Cancelled" aria-pressed="false" onclick="filterStaffAppointments('Cancelled')">Cancelled <span class="filter-count">0</span></button>
                <button type="button" class="appt-filter appt-filter--warning" data-appt-filter="Pending" aria-pressed="false" onclick="filterStaffAppointments('Pending')">Pending <span class="filter-count">0</span></button>
                <button type="button" class="appt-filter appt-filter--accent" data-appt-filter="Approved" aria-pressed="false" onclick="filterStaffAppointments('Approved')">Approved <span class="filter-count">0</span></button>
                <button type="button" class="appt-filter appt-filter--success" data-appt-filter="Completed" aria-pressed="false" onclick="filterStaffAppointments('Completed')">Completed <span class="filter-count">0</span></button>
            </div>

            <!-- Row height, applied to every table in the app and remembered.
                 Built by initRowDensity() in js/app.js. -->
            <span data-density-control></span>
        </div>

            <div class="table-container appt-table-container" data-freeze data-pin-actions>
            <table>
                <thead>
                    <tr>
                        <th>Patient Name</th>
                        <th>Phone Number</th>
                        <th>Assigned Dentist</th>
                        <th>Treatment</th>
                        <th>Date & Time</th>
                        <th data-card="badge">Status</th>
                        <th data-card="actions">Actions</th>
                    </tr>
                </thead>
                <tbody id="staff-appointments-table">
                    <tr>
                        <td colspan="7" style="text-align: center;">Loading appointments...</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</div>
