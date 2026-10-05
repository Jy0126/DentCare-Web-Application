<?php
// Shared Schedule Management Template
// Requires $role_prefix variable (either 'dentist' or 'staff')
$prefix = $role_prefix ?? 'dentist';
?>
<div id="tab-<?php echo $prefix; ?>-schedule" class="tab-content hidden">
    <div class="card-header">
        <h2>Manage Clinic Availability Schedule</h2>
    </div>

    <div class="dashboard-flex-row">
        <!-- Availability schedule listing -->
        <div class="card flex-2" style="min-width: 480px;">
            <h3>Configured Available Days</h3>

            <!--
                Rebuild booking slots.
                ------------------------------------------------------------
                The patient booking form works out which times are free from
                the slot_locks collection, because a patient is not allowed to
                read the day's appointments to find out (see the note at the
                top of js/appointments.js).

                That means every appointment booked BEFORE slot locks existed
                has no lock, and its time would be offered to somebody else.
                This button reads the real appointments and writes the missing
                locks, and is what makes the changeover safe.

                It is also the repair for ordinary drift: releasing a lock is
                deliberately best-effort so that a failure can never turn a
                successful cancellation into an error, which means a cancelled
                booking can occasionally leave its hour blocked. This clears
                those too.

                Safe to press at any time. It reads the appointments and makes
                the locks match them — it never changes an appointment.
            -->
            <div class="slot-repair">
                <div class="slot-repair__copy">
                    <strong>Booking slot maintenance</strong>
                    <p id="<?php echo $prefix; ?>-slot-repair-status">
                        If a time looks wrongly unavailable, sync slots with the upcoming appointments.
                    </p>
                </div>
                <button type="button" class="btn-secondary slot-repair__button"
                        onclick="rebuildUpcomingSlotLocks('<?php echo $prefix; ?>')">
                    <?= icon('calendar') ?> Rebuild booking slots
                </button>
            </div>

            <!-- Days already past are hidden from the table but counted here, so a
                 row disappearing never looks like a schedule that was deleted. -->
            <div class="schedule-past" id="<?php echo $prefix; ?>-schedule-past"></div>

            <div class="table-container schedule-table-container" data-freeze data-pin-actions>
                <table class="schedule-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Available Time Slots</th>
                            <th data-card="actions">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="<?php echo $prefix; ?>-schedule-table">
                        <tr>
                            <td colspan="3" style="text-align: center;">Loading availability schedule...</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Set availability form -->
        <div class="card flex-1" style="min-width: 320px;">
            <h3>Configure Available Day</h3>
            <form id="form-<?php echo $prefix; ?>-schedule" onsubmit="submitAvailability(event, '<?php echo $prefix; ?>')">
                <label for="<?php echo $prefix; ?>-sched-date">Select Date</label>
                <input type="date" id="<?php echo $prefix; ?>-sched-date" onchange="checkExistingSchedule('<?php echo $prefix; ?>')" required>

                <label style="margin-top: 12px; display: block;">Select Time Slots</label>
                <div class="slots-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: var(--space-s); margin-top: 5px;">
                    <div><label style="font-weight:normal; display:flex; align-items:center; gap:8px;"><input type="checkbox" name="<?php echo $prefix; ?>-slots" value="09:00 AM"> 09:00 AM</label></div>
                    <div><label style="font-weight:normal; display:flex; align-items:center; gap:8px;"><input type="checkbox" name="<?php echo $prefix; ?>-slots" value="10:00 AM"> 10:00 AM</label></div>
                    <div><label style="font-weight:normal; display:flex; align-items:center; gap:8px;"><input type="checkbox" name="<?php echo $prefix; ?>-slots" value="11:00 AM"> 11:00 AM</label></div>
                    <div><label style="font-weight:normal; display:flex; align-items:center; gap:8px;"><input type="checkbox" name="<?php echo $prefix; ?>-slots" value="12:00 PM"> 12:00 PM</label></div>
                    <div><label style="font-weight:normal; display:flex; align-items:center; gap:8px;"><input type="checkbox" name="<?php echo $prefix; ?>-slots" value="01:00 PM"> 01:00 PM</label></div>
                    <div><label style="font-weight:normal; display:flex; align-items:center; gap:8px;"><input type="checkbox" name="<?php echo $prefix; ?>-slots" value="02:00 PM"> 02:00 PM</label></div>
                    <div><label style="font-weight:normal; display:flex; align-items:center; gap:8px;"><input type="checkbox" name="<?php echo $prefix; ?>-slots" value="03:00 PM"> 03:00 PM</label></div>
                    <div><label style="font-weight:normal; display:flex; align-items:center; gap:8px;"><input type="checkbox" name="<?php echo $prefix; ?>-slots" value="04:00 PM"> 04:00 PM</label></div>
                </div>

                <button type="submit" style="width: 100%; margin-top: var(--space-s);">Save Availability</button>
            </form>
        </div>
    </div>
</div>
