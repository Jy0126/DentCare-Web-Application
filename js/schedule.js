// ─────────────────────────────────────────────────────────────
// DentCare – js/schedule.js (Clinic Schedule & Availability Controller)
// ─────────────────────────────────────────────────────────────

// Global cache of schedules
let cachedSchedules = [];

/** A day's hours as one comparable value: the slots as a set, and open or not. */
function sameStoredValueKeyOfHours(timeSlots, available) {
    return storedValueKey((timeSlots || []).slice().sort()) + "|" + (available !== false);
}

/**
 * Rebuild the booking slot locks for every upcoming configured day.
 *
 * Two jobs, both explained at length on repairSlotLocks() in
 * js/appointments.js:
 *
 *   1. Migration. Appointments booked before slot_locks existed hold no lock,
 *      so their times would be offered to a second patient. This writes the
 *      missing locks from the appointments themselves.
 *   2. Repair. Releasing a lock is deliberately best-effort — a failure there
 *      must never turn a successful cancellation into an error the patient
 *      sees — so a cancelled booking can leave its hour blocked. This clears
 *      those.
 *
 * Only upcoming dates. A past day's locks are never queried by the booking
 * form, so rewriting them would be work with no effect, and on a free-tier
 * quota the writes are not free.
 *
 * Days are done one at a time rather than in parallel. Fourteen dates at once
 * is faster and, on the clinic's connection, likelier to have one time out —
 * and a repair that silently skipped a day is worse than a slow one.
 */
function rebuildUpcomingSlotLocks(role) {
    const status = document.getElementById(`${role}-slot-repair-status`);
    const say = (msg) => { if (status) status.textContent = msg; };

    if (typeof repairSlotLocks !== "function") {
        say("Cannot rebuild — js/appointments.js is not loaded on this page.");
        return;
    }

    const today = (typeof localDateKey === "function")
        ? localDateKey()
        : new Date().toISOString().slice(0, 10);

    const dates = cachedSchedules
        .map(s => s.date)
        .filter(d => d && d >= today)
        .sort();

    if (!dates.length) {
        say("No upcoming days are configured, so there is nothing to rebuild.");
        return;
    }

    say("Rebuilding " + dates.length + " day" + (dates.length === 1 ? "" : "s") + "…");

    let added = 0;
    let removed = 0;
    const failed = [];

    const next = (i) => {
        if (i >= dates.length) return Promise.resolve();
        return repairSlotLocks(dates[i])
            .then(result => {
                if (result) {
                    added += result.added;
                    removed += result.removed;
                }
            })
            .catch(err => {
                // Named, not swallowed. A day that could not be rebuilt is a
                // day whose booking form may still be wrong, and the person
                // who pressed this needs to know which one.
                console.error("Could not rebuild slots for " + dates[i] + ":", err);
                failed.push(dates[i]);
            })
            .then(() => next(i + 1));
    };

    next(0).then(() => {
        let msg = "Done. " + added + " slot" + (added === 1 ? "" : "s") + " re-blocked, " +
                  removed + " freed, across " + dates.length + " day" +
                  (dates.length === 1 ? "" : "s") + ".";
        if (failed.length) msg += " Could not rebuild: " + failed.join(", ") + ".";
        say(msg);
        showToast(failed.length ? "Rebuilt with " + failed.length + " day(s) failing — see the schedule tab."
                                : "Booking slots rebuilt.",
                  failed.length ? "warning" : "success");
    });
}

// Load availability list into the dashboard table
function loadAvailabilitySchedule(role) {
    const tbody = document.getElementById(`${role}-schedule-table`);
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="3" style="text-align: center;">Loading availability schedule...</td></tr>`;

    // Live since 2026-10-02 (R20): the other role's edits show without a refresh.
    watchLive("tab-" + role + "-schedule:days",
        db.collection("availability").where("dentistId", "==", "gapit_dentist_uid"),
        snapshot => drawAvailabilitySchedule(role, tbody, snapshot),
        err => {
            console.error("Error loading availability:", err);
            tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: red;">Failed to load schedule.</td></tr>`;
        });
}

/** Manage Schedule, from one snapshot. */
function drawAvailabilitySchedule(role, tbody, snapshot) {
    cachedSchedules = [];
    snapshot.forEach(doc => {
        cachedSchedules.push(doc.data());
    });

    // Sort chronologically by date
    cachedSchedules.sort((a, b) => a.date.localeCompare(b.date));

    tbody.innerHTML = "";
    if (cachedSchedules.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align: center;">No clinic schedules configured yet.</td></tr>`;
        return;
    }

    // ── Days that have been and gone are not shown ────────────────────
    //
    // A passed day is already unbookable — loadBookingDatesDropdown()
    // filters on `date >= today`, so no patient is ever offered one. The
    // problem was this table, which listed every day the clinic had ever
    // configured, oldest first. After a few months of use the days you
    // actually need to edit were somewhere below a screenful of history,
    // and every new day pushed them further down.
    //
    // They are counted rather than silently dropped, with a way to clear
    // them out, because a row vanishing without explanation is how somebody
    // concludes their schedule was deleted.
    const today = (typeof localDateKey === "function")
        ? localDateKey()
        : new Date().toISOString().slice(0, 10);

    const upcoming = cachedSchedules.filter(s2 => (s2.date || "") >= today);
    const past = cachedSchedules.filter(s2 => (s2.date || "") < today);

    const pastNote = document.getElementById(`${role}-schedule-past`);
    if (pastNote) {
        pastNote.innerHTML = past.length
            ? '<span><strong>' + past.length + ' past day' + (past.length === 1 ? '' : 's') +
              ' hidden</strong><small>These days cannot be booked.</small></span>' +
              '<button type="button" class="btn-secondary btn-sm schedule-past__clear" ' +
              'onclick="clearPastAvailability(\'' + role + '\')">Clear them out</button>'
            : "";
    }

    if (upcoming.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align: center;">No upcoming days configured. Add one below so patients can book.</td></tr>`;
        return;
    }

    // Rows are collected and written once. Appending with innerHTML += made the
    // browser re-read the whole table for every row: 300 appointments froze a
    // phone for about 8 seconds and flickered as it redrew (2026-09-24).
    const tableRows = [];
    upcoming.forEach(item => {
        // Render slots as badges
        // This file was doing no escaping at all. The values are written by
        // the clinic rather than by a patient, so it is not the sharpest
        // version of the hole — but `date` and `timeSlots` are plain string
        // fields on an availability document, not validated shapes, and
        // both land in an onclick JS string literal below. escapeJsAttr for
        // those, escapeHtml for text, per js/app.js:214.
        const slotsBadges = item.timeSlots.map(slot =>
            `<span class="badge" style="background-color: var(--color-teal-light); color: var(--color-teal); margin-right: 5px; font-size:12px; font-weight:600;">${escapeHtml(slot)}</span>`
        ).join(" ");

        const jsDate = escapeJsAttr(item.date);
        const actions = `<span class="schedule-action-set">
            <button type="button" class="schedule-action schedule-action--edit" aria-label="Edit available day ${escapeHtml(item.date)}" title="Edit available day" onclick="editAvailability('${role}', '${jsDate}')"><svg class="icon" aria-hidden="true"><use href="#ic-edit"></use></svg></button>
            <button type="button" class="schedule-action schedule-action--delete" aria-label="Delete available day ${escapeHtml(item.date)}" title="Delete available day" onclick="deleteAvailability('${role}', '${jsDate}')"><svg class="icon" aria-hidden="true"><use href="#ic-trash"></use></svg></button>
        </span>`;

        tableRows.push(`
            <tr>
                <td style="font-weight: 700; color: var(--color-text-dark);">${escapeHtml(item.date)}</td>
                <td>${slotsBadges}</td>
                <td>${actions}</td>
            </tr>
        `);
    });
    tbody.innerHTML = tableRows.join("");
}

/**
 * Delete the availability rows for days that have already been and gone.
 *
 * Housekeeping, not a feature — but worth having, because the alternative is a
 * table that grows forever and a clinic that stops reading it.
 *
 * Safe to run. An availability document only ever said "the clinic is open
 * these hours on this day". Appointments carry their own date and time and do
 * not point at it, so removing a past one changes no booking, no record and no
 * bill. Nothing in the app reads a past availability row for any purpose.
 */
async function clearPastAvailability(role) {
    const today = (typeof localDateKey === "function")
        ? localDateKey()
        : new Date().toISOString().slice(0, 10);

    const past = cachedSchedules.filter(s => (s.date || "") < today);
    if (!past.length) return;

    if (!(await confirmDialog("Remove " + past.length + " past day" + (past.length === 1 ? "" : "s") +
                 " from the schedule list?\n\n" +
                 "These days have already happened and cannot be booked. Appointments, " +
                 "records and bills are not touched — only the list of opening hours.",
                 { title: "Clear past days?", confirmLabel: "Clear past days" }))) {
        return;
    }

    const note = document.getElementById(`${role}-schedule-past`);
    if (note) note.textContent = "Clearing…";

    // One at a time, and a failure on one does not abandon the rest. This is
    // tidying; it should never be able to leave the screen in a worse state
    // than it found it.
    let removed = 0;
    past.reduce(
        (chain, s) => chain.then(() =>
            db.collection("availability")
              .doc("gapit_dentist_uid_" + s.date)
              .delete()
              .then(() => { removed++; })
              .catch(err => console.warn("Could not remove " + s.date + ":", err))
        ),
        Promise.resolve()
    ).then(() => {
        if (typeof showToast === "function") {
            showToast(removed + " past day" + (removed === 1 ? "" : "s") + " cleared.", "success");
        }
        loadAvailabilitySchedule(role);
    });
}

// On Date selection, prefill checkboxes if schedule already exists for that date
function checkExistingSchedule(role) {
    const dateInput = document.getElementById(`${role}-sched-date`);
    if (!dateInput) return;
    
    const dateVal = dateInput.value;
    if (!dateVal) return;

    // Uncheck all first
    const checkboxes = document.querySelectorAll(`input[name="${role}-slots"]`);
    checkboxes.forEach(cb => cb.checked = false);

    // Look for existing schedule in cache
    const existing = cachedSchedules.find(s => s.date === dateVal);
    if (existing) {
        checkboxes.forEach(cb => {
            if (existing.timeSlots.includes(cb.value)) {
                cb.checked = true;
            }
        });
    }
}

// Edit schedule: copies date to form and runs checkbox checks
function editAvailability(role, date) {
    const dateInput = document.getElementById(`${role}-sched-date`);
    if (dateInput) {
        dateInput.value = date;
        checkExistingSchedule(role);
        
        // Scroll to form on small screens
        dateInput.scrollIntoView({ behavior: 'smooth' });
    }
}

// Submit availability to Firestore
function submitAvailability(e, role) {
    e.preventDefault();

    const dateVal = document.getElementById(`${role}-sched-date`).value;
    if (!dateVal) {
        flagField(`${role}-sched-date`, "Please select a date.");
        return;
    }

    // Collect selected slots
    const selectedSlots = [];
    const checkboxes = document.querySelectorAll(`input[name="${role}-slots"]:checked`);
    checkboxes.forEach(cb => {
        selectedSlots.push(cb.value);
    });

    if (selectedSlots.length === 0) {
        const first = document.querySelector(`input[name="${role}-slots"]`);
        flagGroup(first && first.closest(".slots-grid"), "Please select at least one time slot.");
        return;
    }

    const docId = `gapit_dentist_uid_${dateVal}`;
    const next = {
        dentistId: "gapit_dentist_uid",
        date: dateVal,
        timeSlots: selectedSlots,
        available: true
    };

    // ── Not over hours set on another screen meanwhile (2026-09-17) ────────
    // This form was filled from the list this screen loaded. If the day's
    // hours on record are now different from that — and different from what
    // is being saved — somebody else changed them since, and saving would
    // quietly put back hours they removed or remove hours they added.
    const shown = cachedSchedules.find(s => s.date === dateVal) || null;
    const hoursKey = d => d
        ? sameStoredValueKeyOfHours(d.timeSlots, d.available)
        : "no schedule";
    const ref = db.collection("availability").doc(docId);

    db.runTransaction(tx => tx.get(ref).then(snap => {
        const live = snap.exists ? snap.data() : null;
        if (hoursKey(live) !== hoursKey(shown) && hoursKey(live) !== hoursKey(next)) {
            throw recordChangedError("Not saved: the hours for " + dateVal + " were changed on " +
                                     "another screen while this one was open. The schedule now " +
                                     "shows the latest; make your change again if it is still needed.");
        }
        tx.set(ref, next);
    }))
    .then(() => {
        showToast(`Availability configured for ${dateVal}!`, "success");
        // Reset form and reload
        document.getElementById(`form-${role}-schedule`).reset();
        loadAvailabilitySchedule(role);
    })
    .catch(err => {
        if (err && err.code === RECORD_CHANGED) {
            showToast(err.message, "warning");
            loadAvailabilitySchedule(role);
            return;
        }
        console.error("Failed to save availability:", err);
        showToast("Failed to save schedule.", "error");
    });
}

// Delete schedule from Firestore
function deleteAvailability(role, date) {
    const docId = `gapit_dentist_uid_${date}`;

    // ── Say who is already booked before closing the day (2026-09-13) ────
    //
    // Clearing a date only removes it from the booking form. Patients already
    // booked on it keep their appointments, and nobody was told they existed —
    // so they would turn up to a closed clinic. The count is read first and put
    // in the confirmation; the bookings are deliberately NOT cancelled here,
    // because each patient has to be told and moved, which only a person can do.
    const ACTIVE = ["Pending", "Approved", "Confirmed"];
    db.collection("appointments").where("appointmentDate", "==", date).get()
    .then(snap => {
        const booked = [];
        snap.forEach(doc => {
            const a = doc.data();
            if (ACTIVE.indexOf(a.status) !== -1 && !a.isWalkIn) {
                booked.push((a.appointmentTime || "?") + " " + (a.patientName || "a patient"));
            }
        });
        return booked;
    })
    .catch(err => {
        console.warn("Could not check bookings before clearing " + date + ":", err);
        return null;
    })
    .then(booked => {
        let question = `Are you sure you want to clear clinic availability for ${date}?`;
        if (booked === null) {
            question += "\n\nThe bookings for this day could not be checked. Look at the " +
                        "appointments list before clearing it.";
        } else if (booked.length) {
            question += "\n\n" + booked.length + " patient" + (booked.length === 1 ? " is" : "s are") +
                        " already booked on this day:\n  " + booked.slice(0, 10).join("\n  ") +
                        (booked.length > 10 ? "\n  …and " + (booked.length - 10) + " more" : "") +
                        "\n\nTheir appointments are NOT cancelled. Please contact them and " +
                        "reschedule each one.";
        }
        return confirmDialog(question, { title: "Clear this day?", confirmLabel: "Clear day", tone: "danger" })
            .then(yes => {
                if (!yes) return;
                return db.collection("availability").doc(docId).delete()
    .then(() => {
        showToast(`Schedule cleared for ${date}`, "success");
        loadAvailabilitySchedule(role);
        
        // If the cleared date is currently filled in the form, reset the form
        const dateInput = document.getElementById(`${role}-sched-date`);
        if (dateInput && dateInput.value === date) {
            document.getElementById(`form-${role}-schedule`).reset();
        }
    })
    .catch(err => {
        console.error("Failed to delete availability:", err);
        showToast("Failed to delete schedule.", "error");
    });
            });
    });
}
