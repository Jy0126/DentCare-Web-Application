// ─────────────────────────────────────────────────────────────
// DentCare – js/appointments.js (Schedules & Bookings Manager)
// ─────────────────────────────────────────────────────────────

let globalTreatmentsList = [];
// The front desk's list opens on Today (2026-09-30): who is coming in is what
// the screen is opened for. The status filters still cover every loaded date.
let staffAppointmentsFilter = "Today";
let allStaffAppointments = [];

// Appointment documents from the last clinician list load, keyed by id.
// The completion dialog needs fields that were never passed through its
// argument list (the Others request), and widening that signature further —
// it already takes five positional strings — would be worse than a lookup.
let lastLoadedAppointments = {};

// ═════════════════════════════════════════════════════════════
// Slot locks — how the booking form knows what is already taken
// ═════════════════════════════════════════════════════════════
//
// ── THE PROBLEM THIS SOLVES ──────────────────────────────────────────────
//
// This form used to find booked slots by reading the day's appointments:
//
//     .where("dentistId", "==", ...).where("appointmentDate", "==", ...)
//
// A clinician may run that query. A patient may not, and firestore.rules is
// right to refuse it: rules are evaluated against the QUERY, not against the
// rows it returns, so a query that could match documents the caller cannot
// read is rejected whole rather than quietly filtered. The patient's own
// appointments rule is `patientId == request.auth.uid`; this query is not
// narrowed that way; so it fails and the dropdown reads "Error loading slots".
//
// Widening the appointments rule to let it through would have handed every
// patient every other patient's name, notes and treatments for any date they
// asked about. The query was wrong, not the rule.
//
// So the single fact the form needs — is this slot free? — lives in its own
// collection holding nothing worth protecting: the dentist, the date, the
// time, and the opaque uid of whoever holds it. No name, no treatment, no
// note, no appointment id. Patients may read all of them, and learn nothing
// they could not learn from the dropdown itself.
//
// ── STALE LOCKS ARE SAFE, MISSING LOCKS ARE NOT ──────────────────────────
//
// The two failure modes are not equally bad, and everything below is arranged
// around that:
//
//   • A lock left behind after a cancellation costs one bookable slot until
//     somebody clears it. Visible, irritating, harmless.
//   • A lock that never got created lets two patients take the same time, and
//     nobody finds out until they are both in the waiting room.
//
// So taking a lock is transactional and exact; releasing one is best effort
// and never blocks the thing it accompanies; and repairSlotLocks() rebuilds a
// day from the appointments themselves when the two drift apart.

/** The dentist every booking in this single-dentist clinic is made with. */
const CLINIC_DENTIST_ID = "gapit_dentist_uid";

/**
 * Statuses that still hold the patient's slot.
 *
 * Deliberately NOT the same list as APPOINTMENT_OPEN_STATUSES, which answers a
 * different question — whether a patient may still move or cancel a booking.
 * A Completed visit is closed, so it is not "open", but its hour is spent and
 * re-offering it would book somebody into a time that has already happened.
 * A Cancelled one gives its hour straight back.
 */
const APPOINTMENT_SLOT_HOLDING_STATUSES = [
    "Pending", "Approved", "Confirmed",
    // The two queue statuses. A booked patient who has arrived and been checked
    // in is the most obviously present holder of their own hour there is —
    // leaving these out would have had repairSlotLocks() release the slot of
    // somebody sitting in the waiting room for it, and offer it to the next
    // person who opened the booking form.
    "Awaiting Consultation", "In Consultation",
    "Completed"
];

/** True when this status no longer reserves the patient's slot. */
function statusReleasesSlot(status) {
    return APPOINTMENT_SLOT_HOLDING_STATUSES.indexOf(status) === -1;
}

/**
 * The document id for one slot: {dentistId}__{date}__{timeKey}.
 *
 * The time is stripped to letters and digits, so "09:00 AM" becomes "0900AM".
 * A Firestore id may not contain "/", and a colon and a space in an id are
 * legal but a nuisance to read in the console and to paste into a URL.
 *
 * Note the id never begins with "__", so it cannot collide with Firestore's
 * reserved __.*__ pattern.
 */
function slotLockId(dentistId, date, time) {
    const timeKey = String(time || "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
    return String(dentistId || "") + "__" + String(date || "") + "__" + timeKey;
}

/**
 * Which times are already taken on a date.
 *
 * Two equality filters, which Firestore serves from its automatic single-field
 * indexes — no composite index to build in the console before the booking form
 * works, which is the kind of setup step that gets forgotten and then looks
 * like a bug.
 */
function fetchTakenSlots(dentistId, date) {
    return db.collection("slot_locks")
        .where("dentistId", "==", dentistId)
        .where("date", "==", date)
        .get()
        .then(snap => {
            const taken = [];
            snap.forEach(doc => {
                const t = doc.data().time;
                if (t) taken.push(t);
            });
            return taken;
        });
}

/**
 * Claim a slot inside a transaction, or fail because somebody else has it.
 *
 * Must be called with the transaction's reads already done — Firestore
 * requires every read in a transaction to precede every write, so the caller
 * does tx.get() on the lock and hands the snapshot in.
 *
 * The exclusivity is not enforced here. It is enforced by `allow update: if
 * false` in firestore.rules: Firestore classifies a write as create or update
 * by whether the document exists, so a second patient's write arrives as an
 * update and is refused by the database. This check exists so the loser gets a
 * sentence instead of a permissions error.
 */
function claimSlotInTransaction(tx, lockSnap, lockRef, dentistId, date, time, heldBy) {
    if (lockSnap.exists) {
        throw new Error("SLOT_TAKEN");
    }
    tx.set(lockRef, {
        dentistId: dentistId,
        date: date,
        time: time,
        // The PATIENT who holds the hour (2026-09-13). When the clinic moved a
        // booking, stamping the clinician here left a lock the patient could
        // never release — cancelling kept the hour blocked. lockIsWellFormed()
        // in firestore.rules lets a clinician write a heldBy that is not theirs.
        heldBy: heldBy || currentUserId,
        createdAt: new Date().toISOString()
    });
}

/**
 * Give a slot back. Best effort, and deliberately never rejects.
 *
 * Every caller is finishing something that has already succeeded — an
 * appointment is cancelled, expired, or moved — and the slot lock is
 * bookkeeping attached to it. Letting a failed delete reject would turn "your
 * appointment is cancelled" into an error message about a collection the
 * patient has never heard of, for a cancellation that did in fact happen.
 *
 * What it costs when it fails is one slot nobody can book until
 * repairSlotLocks() runs. That is the right way round.
 */
function releaseSlotLock(dentistId, date, time) {
    if (!dentistId || !date || !time) return Promise.resolve();
    return db.collection("slot_locks")
        .doc(slotLockId(dentistId, date, time))
        .delete()
        .catch(err => {
            // Not a toast. The patient's action worked; this is for whoever
            // reads the console when a slot looks wrongly unavailable.
            console.warn("Could not release slot lock (harmless — the slot stays " +
                         "blocked until repairSlotLocks runs):", err);
        });
}

/**
 * Move an appointment to a new slot, moving its lock with it.
 *
 * Used by both reschedule paths — the patient's own and the clinic's — so the
 * ordering below is written once rather than twice.
 *
 * @param applyUpdate  Function returning a promise that writes the appointment.
 *                     Called only after the new slot has actually been secured.
 *
 * Three steps, in this order, and the order is the whole point:
 *
 *   1. CLAIM the new slot. Before anything else, because the alternative —
 *      releasing the old one first — leaves a window where the patient holds
 *      neither, and somebody booking in that window takes the very slot they
 *      were standing in.
 *   2. UPDATE the appointment. If this fails, the new lock is handed back
 *      before the error is re-thrown, so a failed reschedule does not quietly
 *      block a slot nobody is in.
 *   3. RELEASE the old slot. Last, because by now the move has definitely
 *      happened. If this one fails the patient keeps a slot they have left —
 *      wasteful, not wrong, and repairSlotLocks() clears it.
 */
function rebookSlot(dentistId, oldDate, oldTime, newDate, newTime, applyUpdate, heldBy) {
    const sameSlot = (oldDate === newDate && oldTime === newTime);
    const newRef = db.collection("slot_locks").doc(slotLockId(dentistId, newDate, newTime));

    const claim = sameSlot
        ? Promise.resolve()
        : db.runTransaction(tx =>
              tx.get(newRef).then(snap => {
                  claimSlotInTransaction(tx, snap, newRef, dentistId, newDate, newTime, heldBy);
              })
          );

    return claim
        .then(() => applyUpdate().catch(err => {
            // Step 2 failed. Give back what step 1 took, then let the caller
            // see the original error rather than a cleanup one.
            if (sameSlot) throw err;
            return releaseSlotLock(dentistId, newDate, newTime).then(() => { throw err; });
        }))
        .then(() => {
            if (sameSlot) return;
            return releaseSlotLock(dentistId, oldDate, oldTime);
        });
}

/**
 * Rebuild a day's locks from the appointments themselves.
 *
 * Clinicians only — it reads every appointment for the date, which is a query
 * the rules allow them and refuse a patient.
 *
 * Two jobs:
 *
 *   1. MIGRATION. Every appointment booked before slot locks existed has no
 *      lock, so without this its slot would be offered to somebody else. This
 *      has to be run once for each upcoming date that already has bookings.
 *   2. REPAIR. Releasing a lock is best effort, so the two can drift. This is
 *      how they are put back in step without anybody editing the database by
 *      hand.
 *
 * Walk-ins are skipped, exactly as the booking filter always skipped them: a
 * walk-in is stamped with its arrival time so the queue has something to show,
 * but it never reserved a slot, and counting it would delete a real bookable
 * hour from the form.
 */
function repairSlotLocks(date) {
    if (currentRole !== "dentist" && currentRole !== "staff" && currentRole !== "admin") {
        showToast("Only clinic staff can rebuild the booking slots.", "error");
        return Promise.resolve();
    }
    if (!date) return Promise.resolve();

    return Promise.all([
        db.collection("appointments")
            .where("dentistId", "==", CLINIC_DENTIST_ID)
            .where("appointmentDate", "==", date)
            .get(),
        fetchTakenSlots(CLINIC_DENTIST_ID, date)
    ])
    .then(([apptSnap, lockedTimes]) => {
        // The times that genuinely hold a slot right now.
        // Time -> the patient whose appointment holds it. Not just the set of
        // times: the rebuilt lock has to name the PATIENT, not the clinician
        // pressing the button. A lock stamped with the operator would be one
        // its actual owner could not delete, so cancelling that booking would
        // leave the hour blocked until somebody ran this again.
        const holderByTime = {};
        apptSnap.forEach(doc => {
            const a = doc.data();
            if (APPOINTMENT_SLOT_HOLDING_STATUSES.indexOf(a.status) === -1) return;
            if (a.isWalkIn) return;
            if (!a.appointmentTime) return;
            if (!a.patientId) return;
            holderByTime[a.appointmentTime] = a.patientId;
        });

        const shouldBeLocked = new Set(Object.keys(holderByTime));
        const locked = new Set(lockedTimes);
        const toAdd = [...shouldBeLocked].filter(t => !locked.has(t));
        const toDrop = [...locked].filter(t => !shouldBeLocked.has(t));

        const writes = [];
        toAdd.forEach(time => {
            writes.push(
                db.collection("slot_locks").doc(slotLockId(CLINIC_DENTIST_ID, date, time)).set({
                    dentistId: CLINIC_DENTIST_ID,
                    date: date,
                    time: time,
                    // The PATIENT whose appointment holds this hour — not the
                    // clinician running the repair. lockIsWellFormed() in
                    // firestore.rules lets the clinic write a heldBy that is
                    // not its own for exactly this reason: a lock stamped with
                    // the operator is one the patient could not delete, so
                    // their cancellation would leave the slot blocked.
                    heldBy: holderByTime[time],
                    createdAt: new Date().toISOString()
                }).catch(err => {
                    // set() on a lock that appeared between the read and this
                    // write is an update, which the rules refuse. That means
                    // somebody just booked it — the lock exists, which is what
                    // we wanted.
                    console.warn("Slot " + time + " was claimed during the repair:", err);
                })
            );
        });
        toDrop.forEach(time => writes.push(releaseSlotLock(CLINIC_DENTIST_ID, date, time)));

        return Promise.all(writes).then(() => ({ added: toAdd.length, removed: toDrop.length }));
    });
}

// Populate Dentists Dropdown for booking (stubbed as Dr. Reina is only dentist, loads available dates instead)
function loadDentistDropdown() {
    loadBookingDatesDropdown();
}

/**
 * The live-list key for a booking form's select: the patient's own form, or
 * the staff "Book for a patient" dialog (2026-10-02, R20).
 */
function bookingLiveKey(selectId, what) {
    const tab = (selectId || "").indexOf("clinic-book") === 0 ? "tab-staff-intake" : "tab-patient-appointments";
    return tab + ":" + what + ":" + (selectId || "book");
}

// Load available schedule dates for the patient booking form. Also fills the
// staff "Book for a patient" dialog (2026-10-01), which passes its own select.
// Live since 2026-10-02: a day the clinic opens or closes appears or goes
// while the form is open. The chosen date is kept across a redraw.
function loadBookingDatesDropdown(selectId) {
    const select = document.getElementById(selectId || "book-date");
    if (!select) return;

    select.innerHTML = '<option value="" disabled selected>Loading available dates...</option>';

    watchLive(bookingLiveKey(selectId || "book-date", "dates"),
        db.collection("availability")
            .where("dentistId", "==", "gapit_dentist_uid")
            .where("available", "==", true),
        snapshot => {
        const chosen = select.value;
        const dates = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            const todayStr = localDateKey();
            if (data.timeSlots && data.timeSlots.length > 0 && data.date >= todayStr) {
                dates.push(data.date);
            }
        });

        // Sort chronologically
        dates.sort();

        if (dates.length === 0) {
            select.innerHTML = '<option value="" disabled selected>No available dates</option>';
            return;
        }

        // Escaped: availability.date is typed by a clinician and never
        // format-checked by the rules, and this lands on the PATIENT's form.
        select.innerHTML = '<option value="" disabled selected>Select Date</option>' +
            dates.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join("");
        if (chosen && dates.indexOf(chosen) !== -1) select.value = chosen;
    }, err => {
        console.error("Error loading booking dates:", err);
        select.innerHTML = '<option value="" disabled selected>Failed to load dates</option>';
    });
}

/**
 * Listen to one date's schedule and its slot locks together, and call
 * onChange(availability, takenTimes) whenever either changes, once both have
 * arrived (2026-10-02, R20). availability is the document's data, or null
 * when the clinic has no schedule for that date.
 *
 * Opening it again under the same keyBase (another date) closes the old one.
 */
function watchDateSlots(keyBase, dentistId, dateKey, onChange, onError) {
    const state = { availability: undefined, taken: undefined };
    const fire = () => {
        if (state.availability !== undefined && state.taken !== undefined) onChange(state.availability, state.taken);
    };
    watchLive(keyBase + ":avail", db.collection("availability").doc(dentistId + "_" + dateKey), snap => {
        state.availability = snap.exists ? snap.data() : null;
        fire();
    }, onError);
    // From slot_locks, NOT from appointments: a patient cannot read the day's
    // appointments. Two equality filters, as fetchTakenSlots() has.
    watchLive(keyBase + ":locks", db.collection("slot_locks")
        .where("dentistId", "==", dentistId)
        .where("date", "==", dateKey), snap => {
        const taken = [];
        snap.forEach(doc => {
            const t = doc.data().time;
            if (t) taken.push(t);
        });
        state.taken = taken;
        fire();
    }, onError);
}

/** Stop listening to a date's slots (the dialog closed, or no date is chosen). */
function unwatchDateSlots(keyBase) {
    unwatchLive(keyBase + ":avail");
    unwatchLive(keyBase + ":locks");
}

/** Said under a time box when the time it held was just taken by somebody else. */
const SLOT_JUST_TAKEN = "That time was just taken. Please choose another.";

// When patient selects a date, dynamically fetch and filter time slots. The
// staff "Book for a patient" dialog passes its own two selects (2026-10-01).
// Live since 2026-10-02 (R20): a freed hour comes back and a taken one goes,
// without a refresh. Changing the date closes the old date's listener.
function onBookingDateChanged(dateId, timeId) {
    const dateSelect = document.getElementById(dateId || "book-date");
    const timeSelect = document.getElementById(timeId || "book-time");
    if (!dateSelect || !timeSelect) return;

    const keyBase = bookingLiveKey(timeId || "book-time", "times");
    const dateVal = dateSelect.value;
    if (!dateVal) { unwatchDateSlots(keyBase); return; }

    timeSelect.innerHTML = '<option value="" disabled selected>Loading slots...</option>';
    if (typeof clearFieldFlag === "function") clearFieldFlag(timeSelect);
    timeSelect.onchange = () => { if (typeof clearFieldFlag === "function") clearFieldFlag(timeSelect); };

    watchDateSlots(keyBase, "gapit_dentist_uid", dateVal, (availability, bookedSlots) => {
        // Only while this date is still the one chosen.
        if (dateSelect.value !== dateVal) return;
        const chosen = timeSelect.value;

        if (!availability) {
            timeSelect.innerHTML = '<option value="" disabled selected>No slots available</option>';
            return;
        }
        const availableSlots = availability.timeSlots || [];

        // 3. Filter out booked slots.
        //
        // Cancelled and Rejected bookings do not appear because their lock was
        // released when the status changed; walk-ins do not appear because they
        // never take a lock at all. That second one matters and was a real bug
        // once: enqueuePatient() stamps a walk-in with its arrival time so the
        // queue has something to display, and counting that as a booking meant
        // somebody walking in at 2:00 PM silently deleted the real 2:00 PM slot
        // from the booking form. js/queue.js takes no lock, deliberately.
        const freeSlots = availableSlots.filter(slot => !bookedSlots.includes(slot));

        // ── Slots that have already gone by today ─────────────────────
        //
        // Booking dates are already limited to today onward (see
        // loadBookingDatesDropdown), but that says nothing about the time: at
        // 2pm the 8am slot was still selectable, and a patient could book an
        // appointment for five hours ago. Only today is filtered. A slot at 8am
        // is perfectly bookable tomorrow.
        const isToday = (dateVal === localDateKey());
        const nowMins = (new Date().getHours() * 60) + new Date().getMinutes();

        // A little runway, so a patient cannot take a slot that starts in
        // four minutes and that nobody could physically arrive for.
        const LEAD_TIME_MINUTES = 30;

        const elapsed = [];
        const remainingSlots = freeSlots.filter(slot => {
            if (!isToday) return true;
            const slotMins = parseSlotMinutes(slot);
            // An unreadable slot is left selectable rather than hidden. Hiding
            // it would silently shrink the day on a typo in the schedule, and
            // nobody would know why the clinic looked closed.
            if (slotMins === null) return true;
            if (slotMins <= nowMins + LEAD_TIME_MINUTES) {
                elapsed.push(slot);
                return false;
            }
            return true;
        });

        if (remainingSlots.length === 0) {
            // Says WHICH kind of empty it is. "Fully Booked" when the real
            // reason is that the day is over sends the patient looking for a
            // slot that was never going to appear.
            timeSelect.innerHTML = elapsed.length
                ? '<option value="" disabled selected>No slots left today — try another date</option>'
                : '<option value="" disabled selected>Fully Booked</option>';
        } else {
            timeSelect.innerHTML = '<option value="" disabled selected>Select Time</option>' +
                remainingSlots.map(slot => `<option value="${escapeHtml(slot)}">${escapeHtml(slot)}</option>`).join("") +
                // Shown greyed out rather than removed, so a patient can see
                // the clinic does run at 9am — they have just missed it today.
                (elapsed.length
                    ? '<optgroup label="Already passed today">' +
                      elapsed.map(s => '<option value="" disabled>' + escapeHtml(s) + '</option>').join("") +
                      '</optgroup>'
                    : '');
        }

        // Keep what was chosen. If somebody else has just taken it, say so.
        if (chosen) {
            if (remainingSlots.indexOf(chosen) !== -1) {
                timeSelect.value = chosen;
            } else if (typeof showFieldError === "function") {
                showFieldError(timeSelect, SLOT_JUST_TAKEN, false);
            }
        }
    }, err => {
        console.error("Error loading timeslots:", err);
        timeSelect.innerHTML = '<option value="" disabled selected>Error loading slots</option>';
    });
}

// Populate the patient booking service picker from the staff-managed list.
/**
 * Load the service list and draw it as checkboxes.
 *
 * Multi-select as of 2026-08-29 (client request). A patient booking a cleaning
 * and a filling in the same visit could not say so through the old single
 * dropdown — they either booked twice or wrote the second service into the
 * notes, where nothing could count it and it never reached the schedule.
 *
 * The options come from the staff-managed `treatments` collection, NOT from a
 * list hardcoded here. That matters: a second copy of the service list would
 * drift from the price list the moment staff added a procedure, and this
 * project has been bitten by exactly that shape of bug before (the clinic
 * hours living in both $opening_hours and OPENING_HOURS).
 *
 * globalTreatmentsList keeps the same shape it always had — js/records.js
 * reads it to name a treatment when a dentist logs one directly.
 */
function loadTreatmentOptions() {
    // Cached whole and filtered here: the price list is a couple of dozen
    // rows, so one cached read beats a query every time the form opens.
    getReference("treatments")
    .then(byId => {
        globalTreatmentsList = [];
        const host = document.getElementById("book-service-list");

        Object.keys(byId).forEach(id => {
            const t = byId[id];
            if (t.isActive !== true) return;
            globalTreatmentsList.push({
                treatment_id: id,
                treatment_name: t.treatmentName,
                description: t.description,
                duration_minutes: t.durationMinutes,
                sort_order: t.sortOrder,
                price: t.price
            });
        });

        // The order staff set in Manage Services, with anything lacking a
        // sortOrder falling to the bottom alphabetically. Firestore returns
        // documents unordered, and plain alphabetical would open the list with
        // "Braces Adjustment" — not what most people walk in for.
        globalTreatmentsList.sort((a, b) => {
            const ao = Number.isFinite(a.sort_order) ? a.sort_order : 9999;
            const bo = Number.isFinite(b.sort_order) ? b.sort_order : 9999;
            if (ao !== bo) return ao - bo;
            return String(a.treatment_name || "").localeCompare(String(b.treatment_name || ""));
        });

        if (!host) return;

        if (!globalTreatmentsList.length) {
            // Says what to do rather than leaving an empty control. An empty
            // service list means nobody can book at all, so it must not look
            // like the page is still loading.
            host.innerHTML = '<p class="svc-empty">No services set up yet — ask the front desk</p>';
            document.getElementById("book-service").textContent = "Choose services";
            return;
        }

        // No price is rendered. The fee is set by the dentist after treatment
        // — see the note in submitBooking().
        //
        host.innerHTML = globalTreatmentsList.map(t =>
            '<label class="svc-item"><input type="checkbox" class="book-service-choice" ' +
                'value="' + escapeHtml(t.treatment_id) + '" data-name="' + escapeHtml(t.treatment_name) + '" ' +
                'onchange="onBookingServiceChanged(this)">' +
                '<span class="svc-item__body"><span class="svc-item__name">' + escapeHtml(t.treatment_name) + '</span>' +
                (t.description ? '<span class="svc-item__desc">' + escapeHtml(t.description) + '</span>' : '') +
                '</span></label>'
        ).join("");
        updateBookingSummary();
    })
    .catch(err => {
        console.error("Error loading services:", err);
        const host = document.getElementById("book-service-list");
        if (host) {
            host.innerHTML = '<p class="svc-empty">Could not load services — please refresh</p>';
        }
        const trigger = document.getElementById("book-service");
        if (trigger) trigger.textContent = "Services unavailable";
    });
}

/**
 * The service picked right now, as [{id, name}].
 *
 * Others has no treatment document; it is carried separately in otherRequested.
 */
function selectedBookingServices() {
    return Array.from(document.querySelectorAll("#book-service-list .book-service-choice:checked"))
        .map(input => ({ id: input.value, name: input.dataset.name || "" }));
}

function toggleBookingServicePicker(open) {
    const panel = document.getElementById("book-service-options");
    const trigger = document.getElementById("book-service");
    if (!panel || !trigger) return;
    const shouldOpen = typeof open === "boolean" ? open : panel.classList.contains("hidden");
    panel.classList.toggle("hidden", !shouldOpen);
    trigger.setAttribute("aria-expanded", String(shouldOpen));
    if (shouldOpen) panel.scrollIntoView({ block: "nearest" });
    else trigger.focus();
}

function onBookingServiceChanged(changed) {
    const other = document.getElementById("book-service-other");
    if (!other) return;
    const count = selectedBookingServices().length + Number(other.checked);
    if (count > 3 && changed) {
        changed.checked = false;
        showToast("Choose up to three services, including Others.", "warning");
    }
    onBookingOtherToggled(other.checked);
}

/**
 * Show or hide the free-text box behind the "Others" tick.
 *
 * "Others" is independent of the standard services: a patient may tick it on
 * its own, or alongside a cleaning. It is not a fallback for an empty list.
 */
function onBookingOtherToggled(checked) {
    const wrap = document.getElementById("book-other-wrap");
    if (wrap) wrap.classList.toggle("hidden", !checked);
    if (!checked) {
        const note = document.getElementById("book-other-note");
        if (note) note.value = "";
    }
    updateBookingSummary();
}

/**
 * Echo back what has been picked.
 *
 * Deliberately a count and a list of names, never a total. Showing a running
 * fee here is the exact thing the clinic asked to remove.
 */
function updateBookingSummary() {
    const box = document.getElementById("book-services-summary");
    if (!box) return;

    const picked = selectedBookingServices().map(s => s.name);
    const otherEl = document.getElementById("book-service-other");
    if (otherEl && otherEl.checked) picked.push("Others");

    if (!picked.length) {
        box.classList.add("hidden");
        box.innerHTML = "";
    } else {
        box.classList.remove("hidden");
        box.innerHTML =
            '<strong>' + picked.length + ' selected:</strong> ' +
            escapeHtml(picked.join(", ")) +
            '<span class="svc-summary__note">Dr. Gapit confirms the final cost after your visit.</span>';
    }
    const count = document.getElementById("book-service-count");
    if (count) count.textContent = picked.length + " of 3 selected";
    const trigger = document.getElementById("book-service");
    if (trigger) trigger.textContent = picked.length ? picked.length + " service" + (picked.length === 1 ? "" : "s") + " selected" : "Choose services";
    if (picked.length) clearFieldFlag("book-service");
}

// Book appointment (Patient)
/**
 * Put the booking form back to empty.
 *
 * form.reset() unticks the checkboxes but knows nothing about the two things
 * JavaScript put on screen — the revealed "Others" box and the selection
 * summary. Leaving those behind made a submitted booking look like it was
 * still sitting in the form.
 */
function resetBookingForm() {
    const form = document.getElementById("form-patient-book");
    if (form) form.reset();

    const wrap = document.getElementById("book-other-wrap");
    if (wrap) wrap.classList.add("hidden");

    const note = document.getElementById("book-other-note");
    if (note) note.value = "";

    toggleBookingServicePicker(false);

    updateBookingSummary();
}

function submitBooking(e) {
    e.preventDefault();
    const dentist_id = document.getElementById("book-dentist").value;
    const appointment_date = document.getElementById("book-date").value;
    const appointment_time = document.getElementById("book-time").value;
    const notes = document.getElementById("book-notes").value.trim();

    const services = selectedBookingServices();
    const otherEl = document.getElementById("book-service-other");
    const wantsOther = !!(otherEl && otherEl.checked);
    const otherNote = wantsOther
        ? document.getElementById("book-other-note").value.trim()
        : "";

    // At least one of the two kinds of request has to be present. Without this
    // a patient can submit a booking that asks for nothing at all, and it
    // reaches the schedule with a blank service column that nobody can act on.
    if (!services.length && !wantsOther) {
        flagField("book-service", "Choose what you need, or choose Others and tell us.");
        return;
    }
    if (services.length + Number(wantsOther) > 3) {
        flagField("book-service", "Choose no more than three services.");
        return;
    }

    // "Others" with no description is the same problem wearing a different
    // hat: it tells the clinic a patient wants something unspecified.
    if (wantsOther && !otherNote) {
        flagField("book-other-note", "Tell us what you need.");
        return;
    }

    const apptData = {
        patientId: currentUserId,
        patientName: currentUser,
        dentistId: dentist_id,

        // ── The multi-service fields ──────────────────────────────────────
        treatmentIds: services.map(s => s.id),
        treatmentNames: services.map(s => s.name),
        otherRequested: wantsOther,
        otherNote: otherNote,

        // ── The singular fields, kept deliberately ────────────────────────
        // Every existing reader — the completion dialog, the staff and dentist
        // appointment tables, js/records.js — reads treatmentId/treatmentName.
        // Dropping them to "clean up" would break each of those and orphan
        // every appointment already in the database, which still only has the
        // singular pair. So the first selected service is mirrored here and
        // the new arrays sit alongside.
        //
        // An Others-only booking has no treatment id at all: it is a request
        // for something not on the price list, so "" is the honest value.
        treatmentId: services.length ? services[0].id : "",
        treatmentName: services.length
            ? services.map(s => s.name).join(", ")
            : "Others (see request)",

        appointmentDate: appointment_date,
        appointmentTime: appointment_time,
        status: "Pending",
        notes: notes,

        // ── Reschedule budget ─────────────────────────────────────────────
        // Counted from booking so an appointment created before this feature
        // existed reads as 0 used rather than undefined. See requestReschedule().
        rescheduleCount: 0,
        createdAt: new Date().toISOString()
    };

    let apptId = "";

    // No invoice is raised here, and NO FEE IS QUOTED. An appointment is a
    // booking, not a purchase: the services named on it are what the patient
    // has *asked* for, and nothing has been done yet.
    //
    // The clinic removed the booking-stage fee on 2026-08-29. Quoting a total
    // up front was wrong twice over: it committed Dr. Gapit to a price before
    // she had seen the tooth, and with multi-select it would add up a list of
    // procedures the patient may well not all need once examined.
    //
    // The charge is set by the dentist at completion — see
    // submitCompleteAppointment().
    // The appointment and its slot lock are written in ONE transaction, so the
    // database can never end up holding one without the other.
    //
    // Doing it as two calls would leave two ways to be wrong: an appointment
    // with no lock, whose slot is then handed to somebody else, or a lock with
    // no appointment, which blocks a slot nobody booked. A transaction has
    // neither.
    //
    // It also settles the race. Two patients tapping Book on the same slot at
    // the same moment both read the lock as missing, but the transaction holds
    // a read-lock on that document: the second commit sees it changed and
    // retries, and on the retry the document exists. The loser is told the slot
    // has gone rather than being silently double-booked. firestore.rules backs
    // this up with `allow update: if false` on slot_locks, so even a client
    // that skipped this check could not overwrite somebody's lock.
    const lockRef = db.collection("slot_locks")
                      .doc(slotLockId(dentist_id, appointment_date, appointment_time));
    const apptRef = db.collection("appointments").doc();

    // Locked while it saves (2026-09-13). A double-tap ran two transactions: the
    // first booked the slot, the second found its own lock and told the patient
    // "that time was just booked by someone else" — about their own booking.
    const bookBtn = document.querySelector("#form-patient-book button[type='submit']");
    if (bookBtn && bookBtn.disabled) return;
    if (bookBtn) bookBtn.disabled = true;

    db.runTransaction(tx =>
        tx.get(lockRef).then(lockSnap => {
            claimSlotInTransaction(tx, lockSnap, lockRef,
                                   dentist_id, appointment_date, appointment_time);
            tx.set(apptRef, apptData);
        })
    )
    .then(() => {
        apptId = apptRef.id;
        showToast("Appointment requested successfully! Pending clinic approval.", "success");
        resetBookingForm();
        loadPatientAppointments();
    })
    .catch(err => {
        if (err && err.message === "SLOT_TAKEN") {
            // Somebody got there first. Reload the times so the taken slot
            // disappears from the dropdown instead of sitting there inviting
            // another attempt that will fail the same way.
            showToast("Sorry — that time was just booked by someone else. " +
                      "Please pick another.", "warning");
            onBookingDateChanged();
            return;
        }
        console.error("Booking failed:", err);
        showToast("Booking failed.", "error");
    })
    .finally(() => {
        if (bookBtn) bookBtn.disabled = false;
    });
}

// Load patient appointment history table
// ─────────────────────────────────────────────────────────────
// Appointment lifecycle: expiry, no-show and rescheduling
// ─────────────────────────────────────────────────────────────
//
// Added 2026-08-29 at the clinic's request. Two problems it solves:
//
//   1. A patient who never turned up left an appointment sitting on
//      "Approved" forever. The slot looked booked, the schedule looked full,
//      and nobody could tell a future booking from an abandoned one.
//
//   2. Nothing stopped a patient rescheduling the same appointment endlessly,
//      which moved a slot out of reach of everybody else each time.
//
// ── WHY THE LIMIT IS ENFORCED IN THE RULES, NOT JUST HERE ─────────────────
// Hiding the Reschedule button after the second move is a courtesy. It stops
// nobody who opens a console. The real limit lives in firestore.rules, which
// refuses an update that pushes rescheduleCount past the maximum — the same
// reasoning the billing rules already follow.

/**
 * How many times a PATIENT may move one appointment.
 *
 * The clinic asked for "1 to 2". Two is the friendlier end and is what the
 * rules enforce; changing it here alone will not change the real limit —
 * MAX_PATIENT_RESCHEDULES in firestore.rules has to move with it.
 */
const MAX_PATIENT_RESCHEDULES = 2;

/**
 * How long after a missed slot a patient may still move it themselves.
 *
 * The emergency the reschedule feature exists for tends to happen ON the day,
 * and somebody dealing with one is not at a computer. Two days lets them sort
 * it out the next morning; past that the clinic should be the one reviving a
 * dead booking, so it does not sit in the schedule indefinitely.
 */
const LATE_RESCHEDULE_GRACE_DAYS = 2;

/**
 * The most a single visit may be charged.
 *
 * MUST MATCH the ceiling in chargeIsSane() in firestore.rules. It is not a
 * price — it cannot tell a right amount from a wrong one — it is a guard
 * against a slipped keystroke turning ₱3,500 into ₱3,500,000.
 */
const MAX_VISIT_CHARGE = 1000000;

/** Statuses that mean the visit has not happened yet and could still move. */
const APPOINTMENT_OPEN_STATUSES = ["Pending", "Approved", "Confirmed"];

/**
 * When an appointment was due, as a Date.
 *
 * Built from the parts rather than parsed from a string, so it is read in the
 * clinic's own local time. new Date("2026-08-29T10:00") is treated as local by
 * most browsers but not all, and an hour's drift either way decides whether a
 * patient is marked a no-show.
 */
function appointmentDueAt(appt) {
    const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(appt.appointmentDate || ""));
    if (!d) return null;

    const mins = parseSlotMinutes(appt.appointmentTime);

    // No parseable time means we do NOT know when this was due, so we must not
    // guess. Returning midnight — which an earlier version of this did by
    // falling through with 0, 0 — made every appointment on today's date look
    // hours overdue, and the expiry sweep marked live bookings as no-shows
    // from 02:00 onwards. A null here makes appointmentIsExpired() decline to
    // judge, which is the only safe answer.
    if (mins === null) return null;

    return new Date(
        Number(d[1]), Number(d[2]) - 1, Number(d[3]),
        Math.floor(mins / 60), mins % 60, 0, 0
    );
}

/**
 * A time slot as minutes since midnight, or null if it cannot be read.
 *
 * ── THE APP STORES 12-HOUR TIMES ──────────────────────────────────────────
 * appointmentTime comes from availability.timeSlots, which js/schedule.js
 * writes verbatim from the checkbox values in tab_manage_schedule.php:
 * "09:00 AM", "01:00 PM". It is NOT 24-hour, however much it looks it.
 *
 * Both shapes are accepted anyway. Anything written by hand or by a future
 * screen in "14:00" form still parses, so the two cannot silently disagree
 * the way they did when this only understood one of them.
 */
function parseSlotMinutes(value) {
    const raw = String(value == null ? "" : value).trim();
    const m = /^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?$/.exec(raw);
    if (!m) return null;

    let h = Number(m[1]);
    const min = Number(m[2]);
    const suffix = m[3] ? m[3].toUpperCase() : "";

    if (min < 0 || min > 59) return null;

    if (suffix) {
        if (h < 1 || h > 12) return null;
        if (suffix === "AM") h = (h === 12) ? 0 : h;         // 12:30 AM = 00:30
        else                 h = (h === 12) ? 12 : h + 12;   // 12:30 PM = 12:30
    } else if (h < 0 || h > 23) {
        return null;
    }

    return (h * 60) + min;
}

/**
 * A time in the clinic's ONE spelling: zero-padded 12-hour, "09:00 AM".
 *
 * ── WHY THIS EXISTS: A DOUBLE BOOKING THROUGH THE NORMAL SCREEN ───────────
 *
 * Found by the 2026-09-13 launch audit. The reschedule prompts accepted
 * anything parseSlotMinutes() could read, and it reads "9:00 AM", "9:00am"
 * and "09:00 AM" as the same minute — correctly. But slotLockId() is built
 * from the TEXT, so "9:00 AM" made lock 900AM while the patient already booked
 * at "09:00 AM" held 0900AM. Two different locks, both granted, one chair.
 *
 * Every typed time goes through here before it touches a lock or a booking,
 * so the same minute always produces the same lock id. Returns null for
 * anything that is not a time.
 */
function canonicalSlot(value) {
    const mins = parseSlotMinutes(value);
    if (mins === null) return null;
    const h24 = Math.floor(mins / 60);
    const h12 = (h24 % 12) === 0 ? 12 : (h24 % 12);
    return String(h12).padStart(2, "0") + ":" +
           String(mins % 60).padStart(2, "0") + " " +
           (h24 < 12 ? "AM" : "PM");
}

/**
 * The clinic's own stored spelling of a typed time on a date, or null when
 * that time is not offered (a closed day, 3 AM, a date with no schedule).
 *
 * Returns the STORED string rather than the canonical one on purpose. The
 * booking form books with the stored string, so a reschedule that uses it too
 * produces exactly the lock id a fresh booking of that slot would — whatever
 * spelling the schedule happens to hold. firestore.rules refuses a patient's
 * lock for a time that is not in timeSlots (lockIsOnTheSchedule); this is the
 * half that can say so in words.
 */
function findOfferedSlot(date, typedTime) {
    const wanted = canonicalSlot(typedTime);
    if (!wanted) return Promise.resolve(null);
    return db.collection("availability").doc(CLINIC_DENTIST_ID + "_" + date).get()
        .then(doc => {
            if (!doc.exists) return null;
            const d = doc.data();
            if (d.available === false || !Array.isArray(d.timeSlots)) return null;
            return d.timeSlots.find(s => canonicalSlot(s) === wanted) || null;
        });
}

/**
 * An appointment's date and time as a real Date, for display.
 *
 * `new Date("2026-08-30T09:00 AM")` is Invalid Date, which is why the
 * appointment tables have been printing "Invalid Date" — they concatenate the
 * two stored fields and hand the result to the Date constructor.
 */
function formatAppointmentWhen(appt) {
    const due = appointmentDueAt(appt);
    if (!due) {
        // Show what is actually stored rather than "Invalid Date", which tells
        // the reader nothing about which field is wrong.
        return escapeHtml((appt.appointmentDate || "?") + " " + (appt.appointmentTime || "?"));
    }
    return escapeHtml(due.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }));
}

/**
 * Grace period before an unattended appointment counts as a no-show.
 *
 * Patients run late, and a clinic that flags somebody a no-show at 10:01 for a
 * 10:00 slot would be wrong most mornings. Two hours is long enough to cover
 * ordinary lateness and short enough that the slot frees up the same day.
 */
const NO_SHOW_GRACE_MS = 2 * 60 * 60 * 1000;

/** True when an open appointment is far enough past due to count as expired. */
function appointmentIsExpired(appt) {
    if (APPOINTMENT_OPEN_STATUSES.indexOf(appt.status) === -1) return false;

    // ── A booking approved for today does not lapse during the day (2026-09-30)
    //
    // Today's approved bookings are listed in the queue by themselves, with no
    // check-in step (js/queue.js). Without one, the system cannot know that a
    // patient is sitting in the waiting room, so the two-hour rule would take
    // a booked patient out of the queue while the clinic is still open, and
    // free their hour for somebody else. An Approved or Confirmed booking dated
    // today therefore stays live until the date has passed, or until somebody
    // marks it a no-show. A Pending request nobody approved keeps the rule.
    if (appt.status !== "Pending" && appt.appointmentDate === localDateKey()) return false;

    const due = appointmentDueAt(appt);
    if (!due) return false;

    return (Date.now() - due.getTime()) > NO_SHOW_GRACE_MS;
}

/** How many moves this patient has left on this appointment. */
function reschedulesLeft(appt) {
    const used = Number(appt.rescheduleCount) || 0;
    return Math.max(0, MAX_PATIENT_RESCHEDULES - used);
}

/**
 * Flag appointments the patient never attended.
 *
 * Runs when a CLINICIAN loads their list, because there is no server in this
 * project to run it on a schedule — no Cloud Functions, so no cron. A patient
 * loading their own list does not write anything: the rules do not let them
 * change a status, and a patient's browser should not be what decides they
 * were a no-show.
 *
 * Writes are batched and the count is reported, so this never happens silently.
 * A status changing itself with no explanation is worse than a stale one.
 */
// ─────────────────────────────────────────────────────────────
// Keeping the schedule from piling up
// ─────────────────────────────────────────────────────────────
//
// Reported 2026-09-11: a patient opened their module and an appointment whose
// day had already gone by was still sitting there as live. Three separate
// causes, which look like one problem from the outside:
//
//   1. The expiry sweep only ran when the DENTIST loaded their dashboard. A
//      patient cannot write to an appointment at all (firestore.rules), so
//      nothing ever corrected the view the patient was actually looking at.
//      If Dr. Gapit did not open the portal that week, every patient kept
//      seeing "Approved" for a slot that had passed.
//
//   2. Nothing ran on a clock. A dashboard left open all morning kept showing
//      whatever was true at page load.
//
//   3. Both clinician lists read `appointments` with NO filter — every
//      appointment the clinic had ever taken, on every single page load. That
//      is the pile-up: it grows forever, it is slow on the clinic's
//      connection, and on Firestore's free tier it spends the daily read
//      quota on records nobody is looking at.
//
// ── WHAT "CLEANING" MEANS HERE, AND WHAT IT MUST NOT MEAN ────────────────
//
// NOTHING BELOW DELETES AN APPOINTMENT, and nothing here should.
//
// An appointment is the clinic's record that a visit was arranged — who, when,
// what for, and whether it happened. It is also the spine the treatment log
// and the bill hang off: `dental_records.appointmentId` and
// `billing.appointmentId` both point at it. Deleting old appointments to make
// a list load faster would orphan treatment history and bills, and this is the
// clinic that already lost its entire paper record to a flood.
//
// So "cleaning" is two things, neither of which is deletion:
//
//   FLAGGING     a lapsed appointment stops reading as live
//   NOT LOADING  the distant past is left in the database, out of the query
//
// The second is what actually fixes the speed. The first is what fixes what
// the patient sees.

/**
 * How far either side of today the clinician lists load.
 *
 * The working screens need the days people are actually acting on: recent
 * past (a visit logged a few days late, a bill still unpaid) and the booked
 * future. Everything older stays in the database and is reachable through
 * Patient History, which looks a patient up by id rather than scanning the
 * whole collection.
 *
 * These bound the QUERY, so the cost stops growing with the clinic's age.
 * Without them the dentist's dashboard was downloading every appointment
 * since the system was installed, every time it opened.
 */
const APPOINTMENT_WINDOW_PAST_DAYS = 60;
const APPOINTMENT_WINDOW_FUTURE_DAYS = 180;

/** Set true by "Show all history" so one session can opt out of the window. */
let appointmentWindowDisabled = false;

/** The loaded date range as { from, to } in YYYY-MM-DD, or null when disabled. */
function appointmentWindow() {
    if (appointmentWindowDisabled) return null;

    const from = new Date();
    from.setDate(from.getDate() - APPOINTMENT_WINDOW_PAST_DAYS);

    const to = new Date();
    to.setDate(to.getDate() + APPOINTMENT_WINDOW_FUTURE_DAYS);

    return { from: localDateKey(from), to: localDateKey(to) };
}

/**
 * The appointments query for a clinician list, bounded unless disabled.
 *
 * A range filter on one field needs no composite index, which is why the
 * sorting stays in JavaScript — an orderBy on a different field here would
 * make the screen fail until somebody built an index in the console.
 *
 * appointmentDate is a YYYY-MM-DD string, and that format sorts
 * lexicographically in the same order it sorts chronologically, so a string
 * range is a date range. This only holds because the format is zero-padded;
 * it would break the day anybody wrote "2026-9-1".
 */
function appointmentsInWindow() {
    const w = appointmentWindow();
    if (!w) return db.collection("appointments");

    return db.collection("appointments")
        .where("appointmentDate", ">=", w.from)
        .where("appointmentDate", "<=", w.to);
}

/** Let a clinician load the full history when they genuinely need it. */
function showAllAppointmentHistory() {
    appointmentWindowDisabled = true;
    showToast("Loading the full appointment history — this may take a moment.", "info");

    if (currentRole === "dentist") loadDentistAppointments();
    else loadStaffAppointments();
}

/**
 * What an appointment's status ACTUALLY is right now, for display.
 *
 * The stored status can be out of date: it only changes when somebody with
 * write access loads a screen that sweeps. This computes the truth at render
 * time instead, from the clock, so a lapsed appointment reads as lapsed the
 * instant it is drawn — on the patient's own screen too, where no write is
 * possible and none should be.
 *
 * Use this for EVERY status a person reads. The stored value is still what
 * gets written and what the rules check; this is the honest presentation of
 * it. Where the two disagree, the sweep below closes the gap when a clinician
 * next has the list open.
 */
function effectiveAppointmentStatus(appt) {
    if (!appt) return "Unknown";
    return appointmentIsExpired(appt) ? "Expired" : appt.status;
}

// ─────────────────────────────────────────────────────────────
// The timer
// ─────────────────────────────────────────────────────────────

/**
 * How often an open dashboard re-checks the clock.
 *
 * Five minutes, against a two-hour no-show grace period — far finer than the
 * thing it is measuring, and coarse enough that an idle tab is not making
 * requests all day. Nobody needs an appointment to flip to Expired the second
 * the grace period ends.
 */
const APPOINTMENT_SWEEP_TICK_MS = 5 * 60 * 1000;

let appointmentSweepTimer = null;

/**
 * Re-check lapsed appointments periodically while a dashboard is open.
 *
 * Reloads the caller's own list, which both re-runs the sweep (for a
 * clinician, who can write) and redraws the rows (for everybody, including
 * the patient, whose view is corrected by effectiveAppointmentStatus alone).
 *
 * Clearing first is what makes this safe to call on every tab switch — without
 * it, moving between tabs would stack a second timer and then a third, and the
 * list would reload several times a tick.
 */
function startAppointmentSweepTimer() {
    stopAppointmentSweepTimer();

    appointmentSweepTimer = setInterval(() => {
        // A hidden tab is not being read, so refreshing it spends Firestore
        // reads — and on a clinician's account, writes — for nobody. The next
        // tick after it becomes visible again picks everything up, and the
        // page-load sweep covers a tab that was hidden for hours.
        if (document.hidden) return;

        if (currentRole === "patient") {
            if (typeof loadPatientAppointments === "function") loadPatientAppointments();
        } else if (currentRole === "dentist") {
            if (typeof loadDentistAppointments === "function") loadDentistAppointments();
        } else if (currentRole === "staff" || currentRole === "admin") {
            if (typeof loadStaffAppointments === "function") loadStaffAppointments();
        }
    }, APPOINTMENT_SWEEP_TICK_MS);
}

function stopAppointmentSweepTimer() {
    if (appointmentSweepTimer) {
        clearInterval(appointmentSweepTimer);
        appointmentSweepTimer = null;
    }
}

function sweepExpiredAppointments(appts) {
    if (!Array.isArray(appts)) return Promise.resolve(0);
    if (currentRole !== "dentist" && currentRole !== "staff" && currentRole !== "admin") {
        return Promise.resolve(0);
    }

    // The two clinician lists carry the document id under different names —
    // the dentist list uses `id`, the staff list `appointment_id`. Reading
    // both means this works from either without reshaping their data, which
    // is what a "tidy-up" here would otherwise force.
    const idOf = (appt) => appt.id || appt.appointment_id;

    const stale = appts.filter(a => idOf(a) && appointmentIsExpired(a));
    if (!stale.length) return Promise.resolve(0);

    const stamp = new Date().toISOString();

    // ── Chunked, because a WriteBatch caps at 500 ────────────────────────
    // This runs over every appointment the clinic has ever taken, so the first
    // time a dentist opens the list after this feature ships it can easily see
    // more than 500 stale bookings. A batch over the cap is rejected whole,
    // and nothing would ever get flagged.
    const CHUNK = 400;
    const chunks = [];
    for (let i = 0; i < stale.length; i += CHUNK) chunks.push(stale.slice(i, i + CHUNK));

    // Committed one chunk at a time, and the in-memory status is only updated
    // for a chunk that actually landed. The earlier version set
    // appt.status = "Expired" before committing and never put it back on
    // failure, so the table showed "Expired" for rows Firestore still called
    // "Approved" — and the next reload swept them all over again.
    let flagged = 0;

    const commitChunk = (i) => {
        if (i >= chunks.length) return Promise.resolve();

        // ── Re-checked on the live records (2026-09-17) ───────────────────
        // This list was loaded before the sweep runs, and it used to be
        // written straight from. So a patient checked in at the desk a moment
        // after their slot passed could still be expired from this screen's
        // older copy: taken out of the waiting room, their hour released.
        // Now each chunk is a transaction that reads every appointment again
        // and expires only the ones that are STILL open and past due. A row
        // deleted since is simply skipped rather than failing the chunk.
        const refs = chunks[i].map(appt => db.collection("appointments").doc(idOf(appt)));

        return db.runTransaction(tx => Promise.all(refs.map(r => tx.get(r))).then(snaps => {
            const expired = [];
            snaps.forEach((snap, k) => {
                if (!snap.exists) return;
                const live = snap.data();
                if (!appointmentIsExpired(live)) return;
                tx.update(refs[k], {
                    status: "Expired",
                    expiredAt: stamp,
                    // Says what it was before, so a status set by this sweep can
                    // be told apart from one a person chose.
                    expiredFromStatus: live.status
                });
                expired.push({ appt: chunks[i][k], live: live });
            });
            return expired;
        }))
            .then(expired => {
                expired.forEach(e => { e.appt.status = "Expired"; });
                flagged += expired.length;

                // Hand back the hours the expired bookings were holding.
                //
                // Not part of the transaction and not awaited: these are past
                // dates, so nobody is waiting on the slot, and a failure here
                // must not cost the expiry flag that did commit. Walk-ins are
                // skipped because they never took a lock in the first place.
                // The LIVE date and time, in case the booking had been moved.
                expired.forEach(e => {
                    if (e.live.isWalkIn) return;
                    releaseSlotLock(e.live.dentistId || CLINIC_DENTIST_ID,
                                    e.live.appointmentDate, e.live.appointmentTime);
                });
            })
            .catch(err => {
                // Log and carry on to the next chunk rather than losing every
                // other flag to one failure.
                console.error("A batch of expiry flags failed:", err);
            })
            .then(() => commitChunk(i + 1));
    };

    return commitChunk(0).then(() => {
        if (flagged) {
            showToast(flagged + " appointment" + (flagged === 1 ? " was" : "s were") +
                      " past due and marked Expired.", "info");
        }
        // Re-render, because the statuses only changed after the table was
        // already drawn. Without this the sweep's work is invisible until the
        // next reload — and the rows would still offer Mark Done.
        if (flagged && typeof loadDentistAppointments === "function" && currentRole === "dentist") {
            loadDentistAppointments();
        }
        return flagged;
    });
}

/**
 * Patient moves their own appointment.
 *
 * Sends it back to Pending on purpose: the clinic has to confirm the new slot
 * the same way it confirmed the first one. Leaving it Approved would let a
 * patient approve their own booking into a time nobody had agreed to.
 */
function requestReschedule(apptId) {
    return loadRescheduleAppointment(apptId, false);
}

function clinicianReschedule(apptId) {
    return loadRescheduleAppointment(apptId, true);
}

let rescheduleAppointment = null;
let rescheduleInFlight = false;
let rescheduleLoadVersion = 0;
let rescheduleTrigger = null;

function canMoveAppointment(appt, clinic) {
    if (clinic) return ["staff", "admin", "dentist"].includes(currentRole) && REBOOK_FROM.includes(appt.status);
    if (currentRole !== "patient" || appt.patientId !== currentUserId ||
        !APPOINTMENT_OPEN_STATUSES.includes(appt.status) || reschedulesLeft(appt) <= 0) return false;
    const due = appointmentDueAt(appt);
    return !appointmentIsExpired(appt) || (due && Math.floor((Date.now() - due.getTime()) / 86400000) <= LATE_RESCHEDULE_GRACE_DAYS);
}

function loadRescheduleAppointment(apptId, clinic) {
    if (rescheduleInFlight) return Promise.resolve();
    const version = ++rescheduleLoadVersion;
    rescheduleTrigger = document.activeElement;
    return db.collection("appointments").doc(apptId).get().then(snap => {
        if (version !== rescheduleLoadVersion) return;
        if (!snap.exists || !canMoveAppointment(snap.data(), clinic)) {
            showToast("This appointment can no longer be moved here. Please contact the clinic if you need help.", "warning");
            return;
        }
        openRescheduleForm(apptId, snap.data(), clinic);
    }).catch(err => {
        console.error("Could not open reschedule:", err);
        showToast("Could not load the appointment. Please try again.", "error");
    });
}

function closeRescheduleForm() {
    if (rescheduleInFlight) return;
    ++rescheduleLoadVersion;
    unwatchDateSlots(RESCHEDULE_LIVE_KEY);
    document.getElementById("modal-reschedule").classList.remove("active");
    document.getElementById("modal-reschedule").hidden = true;
    rescheduleAppointment = null;
    if (rescheduleTrigger && rescheduleTrigger.isConnected) rescheduleTrigger.focus();
}

function openRescheduleForm(apptId, appt, clinic) {
    rescheduleAppointment = { id: apptId, appt, clinic };
    document.getElementById("form-reschedule").reset();
    const date = document.getElementById("reschedule-date");
    date.min = localDateKey();
    date.value = appt.appointmentDate >= date.min ? appt.appointmentDate : "";
    document.getElementById("reschedule-title").textContent = clinic ? "Rebook appointment" : "Reschedule appointment";
    document.getElementById("reschedule-submit").textContent = clinic ? "Save new schedule" : "Request new schedule";
    document.getElementById("reschedule-remaining").textContent = clinic
        ? "Choose a new slot and explain the change. Please tell the patient once it is saved."
        : "You have " + reschedulesLeft(appt) + " reschedules left. The clinic will confirm your new slot.";
    document.getElementById("reschedule-clinic-options").classList.toggle("hidden", !clinic);
    toggleRescheduleOverride();
    document.getElementById("modal-reschedule").hidden = false;
    document.getElementById("modal-reschedule").classList.add("active");
    date.focus();
    return loadRescheduleTimes();
}

function toggleRescheduleOverride() {
    const override = !!(rescheduleAppointment && rescheduleAppointment.clinic &&
        document.getElementById("reschedule-override").checked);
    document.getElementById("reschedule-custom-wrap").classList.toggle("hidden", !override);
    document.getElementById("reschedule-custom-time").required = override;
    document.getElementById("reschedule-time").required = !override;
    document.getElementById("reschedule-time").disabled = override;
}

/** The reschedule dialog's live times (R20): open while the dialog is. */
const RESCHEDULE_LIVE_KEY = "modal-reschedule:times";

function loadRescheduleTimes() {
    const version = ++rescheduleLoadVersion;
    const held = rescheduleAppointment;
    const dateKey = document.getElementById("reschedule-date").value;
    const time = document.getElementById("reschedule-time");
    time.innerHTML = '<option value="">Select a date first</option>';
    if (!held || !dateKey) { unwatchDateSlots(RESCHEDULE_LIVE_KEY); return Promise.resolve(); }
    time.innerHTML = '<option value="">Loading available times…</option>';
    if (typeof clearFieldFlag === "function") clearFieldFlag(time);
    const dentist = held.appt.dentistId || CLINIC_DENTIST_ID;
    // Live since 2026-10-02: an hour freed or taken while the dialog is open
    // shows at once. Resolves on the first drawing, as the one read did.
    return new Promise(resolve => {
        watchDateSlots(RESCHEDULE_LIVE_KEY, dentist, dateKey, (data, taken) => {
            if (version !== rescheduleLoadVersion || held !== rescheduleAppointment) return resolve();
            const availability = data || {};
            const slots = availability.available === true && Array.isArray(availability.timeSlots) ? availability.timeSlots : [];
            const offered = slots.filter(slot => {
                const due = appointmentDueAt({ appointmentDate: dateKey, appointmentTime: slot });
                return due && due.getTime() > Date.now() &&
                    !taken.some(t => canonicalSlot(t) === canonicalSlot(slot));
            });
            const chosen = time.value;
            time.innerHTML = '<option value="">' + (offered.length ? "Select a time" : "No available times on this date") + '</option>' +
                offered.map(slot => '<option value="' + escapeHtml(slot) + '">' + escapeHtml(slot) + '</option>').join("");
            if (chosen) {
                if (offered.indexOf(chosen) !== -1) time.value = chosen;
                else if (typeof showFieldError === "function") showFieldError(time, SLOT_JUST_TAKEN, false);
            }
            resolve();
        }, err => {
            if (version === rescheduleLoadVersion) {
                console.error("Could not load available times:", err);
                time.innerHTML = '<option value="">Could not load times. Select the date again to retry.</option>';
            }
            resolve();
        });
    });
}

// Read the appointment, schedule and both locks in ONE transaction. A stale
// form cannot release somebody else's slot or revive a completed appointment.
function saveRescheduledAppointment(held, dateKey, typedTime, reason, override) {
    const text = String(reason || "").trim();
    const due = appointmentDueAt({ appointmentDate: dateKey, appointmentTime: typedTime });
    if (!text || text.length > 1000 || !due || due.getTime() <= Date.now() ||
        localDateKey(due) !== dateKey) return Promise.reject(new Error("Choose a future date/time and enter a reason (up to 1,000 characters)."));
    const ref = db.collection("appointments").doc(held.id);
    const dentist = held.appt.dentistId || CLINIC_DENTIST_ID;
    return db.runTransaction(async tx => {
        const liveSnap = await tx.get(ref);
        if (!liveSnap.exists) throw new Error("This appointment no longer exists.");
        const live = liveSnap.data();
        if (!canMoveAppointment(live, held.clinic) ||
            live.status !== held.appt.status ||
            live.appointmentDate !== held.appt.appointmentDate ||
            live.appointmentTime !== held.appt.appointmentTime ||
            live.patientId !== held.appt.patientId ||
            (live.dentistId || CLINIC_DENTIST_ID) !== dentist ||
            Number(live.rescheduleCount || 0) !== Number(held.appt.rescheduleCount || 0)) {
            throw recordChangedError("This appointment changed while the form was open. Close it and reopen the updated appointment.");
        }
        const schedule = await tx.get(db.collection("availability").doc(dentist + "_" + dateKey));
        const availability = schedule.exists ? schedule.data() : {};
        const slots = availability.available === true && Array.isArray(availability.timeSlots) ? availability.timeSlots : [];
        const offered = slots.find(slot => canonicalSlot(slot) === canonicalSlot(typedTime));
        const newTime = offered || (held.clinic && override ? canonicalSlot(typedTime) : null);
        if (!newTime) throw new Error("The clinic is not taking bookings at this time. Choose another available slot.");
        if (dateKey === live.appointmentDate && canonicalSlot(newTime) === canonicalSlot(live.appointmentTime)) {
            throw new Error("Choose a different date or time.");
        }
        const target = db.collection("slot_locks").doc(slotLockId(dentist, dateKey, newTime));
        const source = db.collection("slot_locks").doc(slotLockId(dentist, live.appointmentDate, live.appointmentTime));
        const targetSnap = await tx.get(target);
        const sourceSnap = await tx.get(source);
        if (targetSnap.exists) throw new Error("That time has just been taken. Choose another slot.");
        const update = { appointmentDate: dateKey, appointmentTime: newTime };
        if (held.clinic) {
            // A walk-in moved to a reserved hour now follows normal scheduled
            // cancellation/expiry rules, including releasing its new lock.
            if (live.isWalkIn) update.isWalkIn = false;
            Object.assign(update, {
                status: "Approved", clinicRescheduledAt: new Date().toISOString(),
                clinicRescheduledBy: currentUserId, clinicRescheduleReason: text
            });
        } else {
            Object.assign(update, {
                status: "Pending", rescheduledAt: new Date().toISOString(),
                rescheduleCount: Number(live.rescheduleCount || 0) + 1, rescheduleReason: text
            });
        }
        claimSlotInTransaction(tx, targetSnap, target, dentist, dateKey, newTime, live.patientId);
        tx.update(ref, update);
        if (!live.isWalkIn && !statusReleasesSlot(live.status) && sourceSnap.exists &&
            sourceSnap.data().heldBy === live.patientId) tx.delete(source);
    });
}

function submitRescheduleForm(event) {
    event.preventDefault();
    if (!rescheduleAppointment || rescheduleInFlight) return;
    const held = rescheduleAppointment;
    const dateKey = document.getElementById("reschedule-date").value;
    const override = held.clinic && document.getElementById("reschedule-override").checked;
    const time = document.getElementById(override ? "reschedule-custom-time" : "reschedule-time").value;
    const reason = document.getElementById("reschedule-reason").value;
    const submit = document.getElementById("reschedule-submit");
    rescheduleInFlight = true;
    submit.disabled = true;
    return saveRescheduledAppointment(held, dateKey, time, reason, override).then(() => {
        rescheduleInFlight = false;
        closeRescheduleForm();
        showToast(held.clinic ? "Appointment moved. Please tell the patient about the new schedule."
            : "Appointment moved. The clinic will confirm your new slot.", "success");
        if (held.clinic) {
            if (currentRole === "dentist") loadDentistAppointments();
            else loadStaffAppointments();
        } else loadPatientAppointments();
    }).catch(err => {
        console.error("Reschedule failed:", err);
        const message = err && err.code === "permission-denied"
            ? "The change was not saved. The clinic must publish the updated appointment rules, or check your access."
            : err.message || "Could not save the new schedule. Please try again.";
        showToast(message, "error");
        loadRescheduleTimes();
    }).finally(() => {
        rescheduleInFlight = false;
        submit.disabled = false;
    });
}

/**
 * Mark a patient as not having turned up.
 *
 * Separate from the automatic sweep because a person choosing this knows
 * something the clock does not — that the patient definitely is not coming.
 */
async function markNoShow(apptId) {
    if (currentRole !== "dentist" && currentRole !== "staff" && currentRole !== "admin") return;
    if (!(await confirmDialog("This frees the time slot, and the patient will see that they were marked as not attending.",
        { title: "Mark as no-show?", confirmLabel: "Mark no-show", tone: "danger" }))) return;

    // Checked against the live record: a visit completed on another screen
    // must not be turned into a no-show, and its hour must not be released.
    changeAppointmentStatus(apptId, {
        status: "No-Show",
        expiredAt: new Date().toISOString(),
        markedNoShowBy: currentUserId
    }, NO_SHOW_FROM)
    .then(appt => {
        // The confirm dialog promises this "frees the slot", so it has to
        // actually free it. Before slot locks that sentence was true only
        // because the booking filter skipped the status; now there is a lock
        // holding the hour and it has to be released for the promise to hold.
        if (appt && !appt.isWalkIn) {
            releaseSlotLock(appt.dentistId || CLINIC_DENTIST_ID,
                            appt.appointmentDate, appt.appointmentTime);
        }
        showToast("Marked as a no-show.", "success");
        if (typeof loadStaffAppointments === "function" && currentRole !== "dentist") loadStaffAppointments();
        if (typeof loadDentistAppointments === "function" && currentRole === "dentist") loadDentistAppointments();
    })
    .catch(err => {
        if (err && err.code === RECORD_CHANGED) {
            showToast(err.message, "warning");
            if (typeof loadStaffAppointments === "function" && currentRole !== "dentist") loadStaffAppointments();
            if (typeof loadDentistAppointments === "function" && currentRole === "dentist") loadDentistAppointments();
            return;
        }
        console.error("Could not mark no-show:", err);
        showToast("Could not update that appointment.", "error");
    });
}

/**
 * The services a booking asked for, as escaped HTML.
 *
 * Reads the new treatmentNames array and falls back to the old singular
 * treatmentName, so an appointment booked before multi-select still renders.
 * The "Others" note is patient-typed free text and is escaped here — the
 * surrounding tables build rows by string concatenation.
 */
function appointmentServicesHtml(appt) {
    const names = Array.isArray(appt.treatmentNames) && appt.treatmentNames.length
        ? appt.treatmentNames
        : (appt.treatmentName ? [appt.treatmentName] : []);

    let html = names.length
        ? escapeHtml(names.join(", "))
        : '<span style="color: var(--text-muted);">&mdash;</span>';

    if (appt.otherRequested) {
        html += '<span class="svc-other-flag">Others</span>';
        if (appt.otherNote) {
            html += '<span class="svc-other-note">' + escapeHtml(appt.otherNote) + '</span>';
        }
    }

    return html;
}

/**
 * A status string as a CSS class suffix.
 *
 * "Awaiting Consultation".toLowerCase() is "awaiting consultation" — with a
 * SPACE, which in a class attribute is two class names, neither of which
 * exists. The badge then renders unstyled. Spaces become hyphens so the
 * multi-word queue statuses match .badge-awaiting-consultation.
 *
 * Also guards a document with no status at all, which used to throw on
 * .toLowerCase() and take the whole table down with it.
 */
function statusBadgeClass(status) {
    // Only letters, digits and hyphens reach the class attribute, so a stray
    // quote in a stored status can never close the attribute (2026-09-24).
    return String(status == null ? "unknown" : status)
        .toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || "unknown";
}

function loadPatientAppointments() {
    const tbody = document.getElementById("patient-appointments-table");
    if (!tbody) return;

    // The patient's own bookings and nothing else. This used to read the
    // billing collection too, to show Paid or Unpaid beside each visit. Since
    // 2026-09-30 a bill is the clinic's record (it lists the operation and the
    // tooth numbers) and firestore.rules refuses a patient account the read,
    // so asking for it here would fail the whole list.
    // Live since 2026-10-02 (R20): an approval, a move or a cancellation by
    // the clinic shows without a refresh.
    const failed = err => {
        console.error("Error loading patient appointments:", err);
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: red;">Failed to load appointments.</td></tr>`;
    };
    getReference("dentists").then(dentistDocs => {
        watchLive("tab-patient-appointments:list",
            db.collection("appointments").where("patientId", "==", currentUserId),
            apptSnapshot => drawPatientAppointments(tbody, apptSnapshot, dentistDocs), failed);
    }).catch(failed);
}

/** The patient's appointment table, from one snapshot. */
function drawPatientAppointments(tbody, apptSnapshot, dentistDocs) {
    const dentistMap = {};
    Object.keys(dentistDocs).forEach(id => {
        const d = dentistDocs[id];
        dentistMap[id] = `Dr. ${d.first_name} ${d.last_name}`;
    });

    tbody.innerHTML = "";
    if (apptSnapshot.empty) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center;">No appointments found.</td></tr>`;
        return;
    }

    const appts = [];
    apptSnapshot.forEach(doc => {
        appts.push({ id: doc.id, ...doc.data() });
    });
    const today = localDateKey();
    const appointmentKey = appt => {
        const minutes = parseSlotMinutes(appt.appointmentTime);
        return String(appt.appointmentDate || "") + " " +
            String(minutes === null ? 0 : minutes).padStart(4, "0");
    };
    // Today's visits first in time order, then future visits from soonest
    // to latest, then past visits from newest to oldest.
    const group = appt => appt.appointmentDate === today ? 0
        : appt.appointmentDate > today ? 1 : 2;
    appts.sort((a, b) => group(a) - group(b) ||
        (group(a) === 2
            ? appointmentKey(b).localeCompare(appointmentKey(a))
            : appointmentKey(a).localeCompare(appointmentKey(b))));

    // Rows are collected and written once. Appending with innerHTML += made the
    // browser re-read the whole table for every row: 300 appointments froze a
    // phone for about 8 seconds and flickered as it redrew (2026-09-24).
    const tableRows = [];
    appts.forEach(appt => {
        // Not new Date(date + "T" + time): the stored time is 12-hour
        // ("09:00 AM"), so that concatenation yields Invalid Date and
        // every row in this table printed exactly that.
        const dateStr = formatAppointmentWhen(appt);
        const dentistName = dentistMap[appt.dentistId] || "Dr. Reina Gapit";

        // The clock decides, not the stored value — a lapsed appointment reads
        // as lapsed even where nothing can write. See effectiveAppointmentStatus().
        const shownStatus = effectiveAppointmentStatus(appt);
        const badgeClass = statusBadgeClass(shownStatus);
        let statusBadge = `<span class="badge badge-${badgeClass}">${escapeHtml(shownStatus)}</span>`;

        let actionBtn = "";

        // shownStatus, not appt.status: an appointment that lapsed days ago
        // must stop offering actions as though it were still live, even when
        // no clinician has loaded a screen to flag it yet.
        if (APPOINTMENT_OPEN_STATUSES.indexOf(shownStatus) !== -1) {
            // The button disappears once the budget is spent. The rules
            // refuse the write too — hiding it only saves the patient a
            // click that was always going to be denied.
            const left = reschedulesLeft(appt);
            if (left > 0) {
                actionBtn += appointmentActionButton({ tone: "accent", icon: "calendar", label: "Reschedule",
                    name: "Reschedule appointment", className: "appt-rebook-action",
                    title: `Reschedule (${left} reschedule${left === 1 ? "" : "s"} left)`,
                    onclick: `requestReschedule('${escapeJsAttr(appt.id)}')` });
            }
            actionBtn += appointmentCancelAction(`cancelAppointment('${escapeJsAttr(appt.id)}')`);
            actionBtn = appointmentActionSetHtml(actionBtn);
            if (left <= 0) {
                actionBtn = '<span class="appt-action-note">No reschedules left</span>' + actionBtn;
            }
        }

        // Says the clinic moved it, so a patient who finds a different time
        // than the one they booked is not left wondering whether they
        // misremembered it. Shown under the status badge.
        if (appt.clinicRescheduledAt) {
            statusBadge += '<div style="font-size: 11px; color: var(--color-warning); margin-top: 4px;">' +
                'Moved by the clinic' +
                (appt.clinicRescheduleReason ? ': ' + escapeHtml(appt.clinicRescheduleReason) : '') +
                '</div>';
        }

        tableRows.push(`
            <tr class="appt-detail-row" data-appointment-id="${escapeHtml(appt.id)}" tabindex="0" aria-label="View appointment details">
                <td>${dateStr}</td>
                <td>${escapeHtml(dentistName)}</td>
                <td>${appointmentServicesHtml(appt)}</td>
                <td>${statusBadge}</td>
                <td>${actionBtn || '--'}</td>
            </tr>
        `);
    });
    tbody.innerHTML = tableRows.join("");
}

// Cancel appointment (Patient)
async function cancelAppointment(apptId) {
    if (!(await confirmDialog("The time will be released for other patients. You can book again anytime.",
        { title: "Cancel this appointment?", confirmLabel: "Cancel appointment", cancelLabel: "Keep it", tone: "danger" }))) return;

    const ref = db.collection("appointments").doc(apptId);

    // Read first, because once the status is Cancelled the row still has its
    // date and time but nothing says which lock belonged to it — and the lock
    // id is built from exactly those two fields.
    ref.get()
    .then(snap => {
        const appt = snap.exists ? snap.data() : null;
        return ref.update({ status: "Cancelled" }).then(() => appt);
    })
    .then(appt => {
        showToast("Appointment cancelled successfully.", "success");
        // You cancelled it, so the bell has nothing to tell you about it.
        if (appt && typeof markNotificationSeen === "function") {
            markNotificationSeen("status:" + apptId + ":" + (appt.appointmentDate || "") + ":" + (appt.appointmentTime || "") + ":Cancelled");
        }
        loadPatientAppointments();

        // After the toast, and not awaited. The cancellation has already
        // happened and the patient has been told; giving the slot back is
        // bookkeeping, and a failure here must not turn a successful
        // cancellation into an error message. Worst case the slot stays
        // blocked until repairSlotLocks() runs.
        if (appt && !appt.isWalkIn) {
            releaseSlotLock(appt.dentistId || CLINIC_DENTIST_ID,
                            appt.appointmentDate, appt.appointmentTime);
        }
    })
    .catch(err => {
        console.error("Failed to cancel appointment:", err);
        showToast("Failed to cancel appointment.", "error");
    });
}

// Load dentist schedule appointments
// Which section of the dentist's appointments is visible. Today remains the
// first view; the other sections group bookings by their displayed status.
let dentistWindow = "today";

function setDentistWindow(which) {
    dentistWindow = which;
    loadDentistAppointments();
}

/** Keep the tabs and the heading honest about what is on screen. */
function paintDentistWindowTabs(counts) {
    const label = { today: "Today", pending: "Pending", approved: "Approved",
        completed: "Completed", cancelled: "Cancelled" };
    Object.keys(label).forEach(k => {
        const btn = document.getElementById("seg-" + k);
        if (!btn) return;
        btn.classList.toggle("is-on", dentistWindow === k);
        btn.setAttribute("aria-pressed", dentistWindow === k ? "true" : "false");
        btn.innerHTML = label[k] +
            (counts && counts[k] ? ' <span class="seg__n">' + counts[k] + "</span>" : "");
    });

    const title = document.getElementById("dentist-sched-title");
    if (title) {
        title.innerText = dentistWindow === "today" ? "Today's Appointments"
            : label[dentistWindow] + " Appointments";
    }
}

function loadDentistAppointments() {
    const tbody = document.getElementById("dentist-appointments-table");
    if (!tbody) return;

    // Windowed, not the whole collection — see appointmentsInWindow(). Then
    // only the patients those appointments name — see getPatientsByIds().
    // Live since 2026-10-02 (R20). The lapsed-appointment sweep runs on the
    // FIRST snapshot only, and then on its own timer: its writes cause
    // snapshots, and sweeping on each would chase its own tail.
    const failed = err => {
        console.error("Error loading dentist appointments:", err);
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: red;">Failed to load appointments.</td></tr>`;
    };
    let swept = false;
    watchLive("tab-dentist-appointments:list", appointmentsInWindow(), apptSnapshot => {
        const ids = [];
        apptSnapshot.forEach(doc => ids.push(doc.data().patientId));
        const sweep = !swept;
        swept = true;
        getPatientsByIds(ids)
            .then(patientMap => drawDentistAppointments(tbody, apptSnapshot, patientMap, sweep))
            .catch(failed);
    }, failed);
}

/** Daily Appointments, from one snapshot. `sweep` on the first one only. */
function drawDentistAppointments(tbody, apptSnapshot, patientMap, sweep) {

    tbody.innerHTML = "";
    if (apptSnapshot.empty) {
        // Still repaint the tabs, or they keep yesterday's counts beside an
        // empty table and read as though the filter is hiding something.
        paintDentistWindowTabs({ today: 0, pending: 0, approved: 0, completed: 0, cancelled: 0 });
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center;">No scheduled appointments.</td></tr>`;
        return;
    }

    const appts = [];
    apptSnapshot.forEach(doc => {
        appts.push({ id: doc.id, ...doc.data() });
    });
    appts.sort((a, b) => `${b.appointmentDate}T${b.appointmentTime}`.localeCompare(`${a.appointmentDate}T${a.appointmentTime}`));

    // Flag anything the patient never turned up for. Mutates status on the
    // items in `appts` before they render, so the sweep and the screen
    // agree on the first paint rather than after a refresh. Later
    // snapshots are drawn as they are: effectiveAppointmentStatus() shows a
    // lapsed booking as lapsed whether or not it has been written.
    if (sweep) sweepExpiredAppointments(appts);

    lastLoadedAppointments = {};
    appts.forEach(a => { lastLoadedAppointments[a.id] = a; });

    // The sweep above runs on everything fetched; only the display is
    // narrowed. Active queue states belong under Approved so Record Visit
    // stays reachable after check-in.
    const today = localDateKey();
    const sectionOf = appt => {
        const status = effectiveAppointmentStatus(appt);
        if (status === "Confirmed" || status === "Awaiting Consultation" ||
            status === "In Consultation") return "approved";
        return String(status || "").toLowerCase();
    };
    const counts = { today: 0, pending: 0, approved: 0, completed: 0, cancelled: 0 };
    appts.forEach(appt => {
        if (appt.appointmentDate === today) counts.today++;
        const section = sectionOf(appt);
        if (section !== "today" && counts[section] !== undefined) counts[section]++;
    });
    paintDentistWindowTabs(counts);

    const shown = appts.filter(appt => dentistWindow === "today"
        ? appt.appointmentDate === today : sectionOf(appt) === dentistWindow);

    const when = appt => {
        const minutes = parseSlotMinutes(appt.appointmentTime);
        return String(appt.appointmentDate || "") + " " +
            String(minutes === null ? 0 : minutes).padStart(4, "0");
    };
    shown.sort((a, b) => dentistWindow === "completed" || dentistWindow === "cancelled"
        ? when(b).localeCompare(when(a)) : when(a).localeCompare(when(b)));

    if (shown.length === 0) {
        const empty = dentistWindow === "today"
            ? "No patients booked for today."
            : "No " + dentistWindow + " appointments in the loaded dates.";
        tbody.innerHTML =
            `<tr><td colspan="7" style="text-align: center;">${empty}</td></tr>`;
        return;
    }

    // Rows are collected and written once. Appending with innerHTML += made the
    // browser re-read the whole table for every row: 300 appointments froze a
    // phone for about 8 seconds and flickered as it redrew (2026-09-24).
    const tableRows = [];
    shown.forEach(appt => {
        // Not new Date(date + "T" + time): the stored time is 12-hour
        // ("09:00 AM"), so that concatenation yields Invalid Date and
        // every row in this table printed exactly that.
        const dateStr = formatAppointmentWhen(appt);
        const patient = patientMap[appt.patientId] || {};
        // The name the patient has NOW on a booking still to come; the one
        // it was made under on anything already past. See js/app.js.
        // appointmentPatientName lives in js/app.js; guarded so a page without it
        // still shows the stored name instead of failing the whole list.
        const patientName = typeof appointmentPatientName === "function"
            ? appointmentPatientName(appt, patient, effectiveAppointmentStatus(appt))
            : (appt.patientName || "Unknown");

        const age = patient.dateOfBirth ? (new Date().getFullYear() - new Date(patient.dateOfBirth).getFullYear()) : "--";
        const gender = patient.gender || "--";
        const patientMeta = `${age} yrs / ${gender}`;
        const phone = patient.phoneNumber || "N/A";

        // The clock decides, not the stored value — a lapsed appointment reads
        // as lapsed even where nothing can write. See effectiveAppointmentStatus().
        const shownStatus = effectiveAppointmentStatus(appt);
        const badgeClass = statusBadgeClass(shownStatus);
        const statusBadge = `<span class="badge badge-${badgeClass}">${escapeHtml(shownStatus)}</span>`;
        
        let actions = "";
        // All of these branch on shownStatus. Offering "Approve" on a slot
        // that passed last week is how a dead booking gets waved back to
        // life and sits in the list for another month.
        if (shownStatus === "Pending") {
            // escapeJsAttr on the id is not optional. A document id is chosen
            // by whoever creates the document, and a patient creates their own
            // bookings — so an id like  x"><img src=x onerror=...>  used to
            // run in the dentist's session the moment this list drew.
            // firestore.rules now also refuses non-auto ids (isAutoId).
            actions += appointmentApprovalActions(appt.id, "dentist");
        } else if (shownStatus === "Approved" ||
                   shownStatus === "Confirmed" ||
                   shownStatus === "Awaiting Consultation" ||
                   shownStatus === "In Consultation") {
            // Queued patients are treatable too — a walk-in never has an
            // "Approved" status at all, so leaving them out would make the
            // whole walk-in route un-completable. Confirmed is an approved
            // booking the clinic has also confirmed (added 2026-09-30; it
            // had no actions at all).
            actions += appointmentActionButton({ tone: "success", icon: "notes", label: "Record Visit",
                onclick: `openCompletionModal('${escapeJsAttr(appt.id)}', '${escapeJsAttr(appt.patientId)}', '${escapeJsAttr(patientName)}', '${escapeJsAttr(appt.treatmentId)}', '${escapeJsAttr(appt.treatmentName)}')` });
            actions += appointmentScheduleAction(appt.id, "Reschedule");
            actions += appointmentActionButton({ tone: "neutral", icon: "hourglass", label: "No-show",
                name: "Mark as no-show", onclick: `markNoShow('${escapeJsAttr(appt.id)}')` });
            actions += appointmentCancelAction(`updateApptStatus('${escapeJsAttr(appt.id)}', 'Cancelled', 'dentist')`);
        } else if (shownStatus === "Expired" || shownStatus === "No-Show") {
            // Without this an appointment the sweep flagged is stuck for
            // good: it is no longer "open", so nothing offers a way back.
            // A patient who was wrongly marked absent has to be able to be
            // put back on the schedule.
            actions += appointmentRebookAction(appt.id);
        } else if (shownStatus === "Completed") {
            // A written-up visit was a dead end: the row offered nothing at
            // all. The printout is shown once, right after saving, so a
            // dentist who closed it — or a patient who asked for her copy
            // after standing up — had no way back to it.
            actions += appointmentActionButton({ tone: "neutral", icon: "file", label: "View & print",
                name: "View and print visit record", onclick: `viewVisitRecord('${escapeJsAttr(appt.id)}')` });
        } else {
            actions = "--";
        }

        const actionsHtml = appointmentActionSetHtml(actions);
        tableRows.push(`
            <tr class="appt-detail-row" data-appointment-id="${escapeHtml(appt.id)}" tabindex="0" aria-label="View appointment details">
                <td><strong>${escapeHtml(patientName)}</strong></td>
                <td class="cell-nowrap">${escapeHtml(patientMeta)}</td>
                <td class="cell-nowrap">${escapeHtml(phone)}</td>
                <td>${dateStr}</td>
                <td>${appointmentServicesHtml(appt)}</td>
                <td>${statusBadge}${rescheduleReasonHtml(appt)}</td>
                <td>${actionsHtml}</td>
            </tr>
        `);
    });
    tbody.innerHTML = tableRows.join("");
}

// ─────────────────────────────────────────────────────────────
// Completing an appointment: chart, clinical log, bill
// ─────────────────────────────────────────────────────────────
//
// These used to be separate systems that never met. The per-tooth chart lived
// on its own tab, which a dentist might never open. The completion dialog's
// only tooth field was free text — "21", "All", "Upper Arch" — with no link to
// the chart at all. Finishing a visit touched neither the chart nor the stock
// cupboard, and produced a bill that was a bare total.
//
// Now one transaction does all of it, so a visit cannot be half-recorded: no
// chart update without the clinical record that explains it, and no bill
// without both. (Stock used to come off the shelf here too. Since 2026-10-01 it
// does not: the front desk files what was taken out and Dr. Gapit approves it,
// in js/stock-requests.js.)
//
// visitToothEntries holds the teeth marked while the dialog is open. They are
// not written until the form is submitted, so closing a half-filled form
// leaves nothing behind.

// ── This visit's chart marks ────────────────────────────────────────────────
//
// visitToothEntries is what the doctor has marked TODAY. Nothing here touches
// Firestore — the whole form is written by one transaction on submit, so a
// half-filled dialog that gets closed leaves no trace.
//
// visitExistingTeeth is the patient's chart as it already stands. It is drawn
// underneath today's marks, faded, because a doctor needs to see the mouth they
// are working on, not just the two teeth they have touched so far.

let visitToothEntries = [];
let visitExistingTeeth = {};

/** The condition the next tooth click will apply. */
let visitPaletteCondition = "Decayed";

/** Surfaces the next tooth click will mark. Empty means the whole tooth. */
let visitPaletteSurfaces = [];

/**
 * The filling type the next tooth click will carry: a FILL_MATERIALS code
 * (LC, AM, TF, GIC) or "" for not specified. Only offered, and only kept,
 * while the condition being marked is Filled (2026-09-30).
 */
let visitPaletteMaterial = "";

/**
 * The patient the open visit form belongs to, as loaded for the form's chart
 * and allergy banner. Kept so the prescription printed straight after saving
 * can carry their name, address, age and sex without another read.
 */
let visitPatientProfile = null;

function openCompletionModal(apptId, patientId, patientName, treatmentId, treatmentName) {
    const form = document.getElementById("form-complete-appt");
    if (form) form.reset();

    // Re-filled after the reset, which clears hidden inputs too.
    document.getElementById("complete-appt-id").value = apptId;
    document.getElementById("complete-patient-id").value = patientId;
    document.getElementById("complete-treatment-id").value = treatmentId;
    document.getElementById("complete-patient-name").innerText = patientName;
    document.getElementById("complete-treatment-name").innerText = treatmentName;
    document.getElementById("complete-next-visit").value = "";

    // Show what the patient actually asked for when they ticked "Others".
    // Without this the dentist opens the visit for a booking whose service
    // column reads "Others (see request)" — and there is nowhere in the app
    // to see the request. The free-text box exists to be read here.
    const requestBox = document.getElementById("complete-other-request");
    if (requestBox) {
        const appt = (typeof lastLoadedAppointments === "object" && lastLoadedAppointments)
            ? lastLoadedAppointments[apptId]
            : null;

        if (appt && appt.otherRequested && appt.otherNote) {
            requestBox.innerHTML =
                '<strong>Patient’s own request:</strong> ' + escapeHtml(appt.otherNote);
            requestBox.classList.remove("hidden");
        } else {
            requestBox.innerHTML = "";
            requestBox.classList.add("hidden");
        }
    }

    visitToothEntries = [];
    visitExistingTeeth = {};
    visitPaletteCondition = "Decayed";
    visitPaletteSurfaces = [];
    visitPaletteMaterial = "";
    visitPatientProfile = null;
    const consentNote = document.getElementById("complete-consent-notice");
    if (consentNote) consentNote.classList.add("hidden");

    // One empty medicine row (js/prescription.js). After the form.reset()
    // above, which would otherwise leave the last visit's rows on screen.
    if (typeof resetVisitRx === "function") resetVisitRx();

    renderVisitPalette();
    clearChart("visit");
    renderVisitSummary();

    openModal("modal-complete-appt");

    // The patient's existing chart and safety flags. Fetched after the dialog
    // is open so it appears immediately rather than waiting on the network.
    loadVisitPatientContext(patientId);
}

/**
 * Pull in what is already known about this patient: their chart so far, and
 * anything the doctor should not have to go looking for before prescribing.
 */
function loadVisitPatientContext(patientId) {
    db.collection("patients").doc(patientId).get()
    .then(doc => {
        if (!doc.exists) return;
        const p = doc.data();

        // Only while this patient's form is still the one open: a slow read
        // must not hand the next patient's prescription this one's name.
        const openFor = document.getElementById("complete-patient-id");
        if (!openFor || openFor.value === patientId) visitPatientProfile = p;

        visitExistingTeeth = p.teethStatus || {};
        renderVisitChart();

        // A record made without the patient's signature (2026-10-01). Only a
        // notice: the dentist is never stopped from recording the visit.
        const consentNote = document.getElementById("complete-consent-notice");
        if (consentNote && (!openFor || openFor.value === patientId)) {
            consentNote.classList.toggle("hidden", p.consentPending !== true);
        }

        // Age and dentition stage, so the doctor can see at a glance whether
        // the primary teeth below are the relevant half of the chart.
        const meta = document.getElementById("complete-patient-meta");
        if (meta && typeof getPatientAge === "function") {
            const age = getPatientAge(p);
            meta.innerText = age === null ? "" : "Age " + age;
        }

        // Allergies and conditions. A doctor filling in a prescription field
        // should not have to leave the form to find out about a penicillin
        // allergy.
        const banner = document.getElementById("complete-safety-banner");
        const text = document.getElementById("complete-safety-text");
        if (!banner || !text) return;

        const mh = p.medicalHistory || {};
        const flags = [];
        if (Array.isArray(mh.allergies) && mh.allergies.length) {
            flags.push("Allergies: " + mh.allergies.join(", "));
        }
        // Every condition, the critical ones first (CRITICAL_CONDITIONS in
        // js/app.js, the same list the Charting banner and Patient History use).
        const conditions = conditionsCriticalFirst(mh.conditionsChecklist);
        if (conditions.length) {
            flags.push("Conditions: " + conditions.join(", "));
        }
        if (mh.underMedicalTreatment) flags.push("Currently under medical treatment");

        if (flags.length) {
            text.innerText = flags.join(" · ");
            banner.classList.remove("hidden");
        } else {
            banner.classList.add("hidden");
        }
    })
    .catch(err => {
        console.error("Could not load the patient's chart:", err);
        showToast("Could not load this patient's existing chart. " +
                  "You can still record the visit, but check the chart tab afterwards.", "warning");
    });
}

/**
 * The palette: pick a condition and the surfaces, then click teeth.
 *
 * This replaces a form that took a tooth number, a condition and surfaces and
 * had an "Add tooth" button. Typing "36" to mark a tooth you are looking at is
 * backwards, and getting the number wrong is silent — you only find out later,
 * on the wrong tooth's record.
 */
function renderVisitPalette() {
    const chips = document.getElementById("visit-condition-chips");
    if (chips) {
        chips.innerHTML = TOOTH_CONDITIONS.map(c =>
            '<button type="button" class="visit-chip is-' + c.value.toLowerCase() +
                (c.value === visitPaletteCondition ? " is-active" : "") + '" ' +
                'onclick="setVisitCondition(\'' + c.value + '\')">' +
                escapeHtml(c.label) +
            "</button>"
        ).join("") +
        // Filling type: a second row, only while Filled is the condition being
        // marked. Pressing a chip selects it; pressing it again clears it. The
        // choice goes onto each tooth marked while it is selected.
        (visitPaletteCondition === "Filled"
            ? '<div class="visit-palette__materials" id="visit-material-chips">' +
                  '<span class="visit-palette__label">Filling type</span>' +
                  FILL_MATERIALS.map(m =>
                      '<button type="button" class="visit-chip visit-chip--material is-fill-' + m.code.toLowerCase() +
                          (m.code === visitPaletteMaterial ? " is-active" : "") + '" ' +
                          'aria-pressed="' + (m.code === visitPaletteMaterial) + '" ' +
                          'title="' + escapeHtml(m.name) + '" ' +
                          'onclick="setVisitMaterial(\'' + m.code + '\')">' + escapeHtml(m.code) + "</button>"
                  ).join("") +
              "</div>"
            : "");
    }

    const pick = document.getElementById("visit-surface-pick");
    if (pick) {
        pick.innerHTML = TOOTH_SURFACES.map(sf => {
            const on = visitPaletteSurfaces.includes(sf.key);
            return '<label class="surface-pick__item' + (on ? " is-on" : "") + '">' +
                   '<input type="checkbox" value="' + sf.key + '"' + (on ? " checked" : "") +
                   ' onchange="toggleVisitSurface(\'' + sf.key + '\', this.checked)">' +
                   '<span class="surface-pick__code">' + sf.code + "</span>" + sf.name +
                   "</label>";
        }).join("");
    }
}

function setVisitCondition(value) {
    visitPaletteCondition = value;
    // Healthy means "nothing wrong with this tooth", which is a whole-tooth
    // statement — surfaces would contradict it.
    if (value === "Healthy") visitPaletteSurfaces = [];
    // A filling type belongs to a filling. Any other condition hides that row
    // and drops the choice, so it cannot ride along onto a crown.
    if (value !== "Filled") visitPaletteMaterial = "";
    renderVisitPalette();
}

/** A Filling type chip was pressed: select it, or clear it if it was already on. */
function setVisitMaterial(code) {
    visitPaletteMaterial = (visitPaletteMaterial === code) ? "" : code;
    renderVisitPalette();
}

function toggleVisitSurface(key, on) {
    if (on) {
        if (!visitPaletteSurfaces.includes(key)) visitPaletteSurfaces.push(key);
    } else {
        visitPaletteSurfaces = visitPaletteSurfaces.filter(k => k !== key);
    }
    renderVisitPalette();
}

/**
 * A tooth was clicked on the visit chart.
 *
 * Clicking marks it with whatever the palette currently says. Clicking a tooth
 * that is already marked the same way takes it back off the list, so a misclick
 * is undone the same way it was made rather than hunting for a Remove button.
 */
function markVisitTooth(num) {
    const existing = visitToothEntries.findIndex(t => t.toothNumber === num);
    // Only a filling carries a type; see setVisitCondition().
    const material = visitPaletteCondition === "Filled" ? visitPaletteMaterial : "";

    if (existing !== -1) {
        const e = visitToothEntries[existing];
        const sameCondition = e.conditionStatus === visitPaletteCondition;
        const sameSurfaces =
            e.surfaces.length === visitPaletteSurfaces.length &&
            e.surfaces.every(k => visitPaletteSurfaces.includes(k));
        const sameMaterial = (e.material || "") === material;

        if (sameCondition && sameSurfaces && sameMaterial) {
            visitToothEntries.splice(existing, 1);   // clicked again — undo
        } else {
            e.conditionStatus = visitPaletteCondition;
            e.surfaces = visitPaletteSurfaces.slice();
            e.material = material;
        }
    } else {
        visitToothEntries.push({
            toothNumber: num,
            conditionStatus: visitPaletteCondition,
            surfaces: visitPaletteSurfaces.slice(),
            material: material,
            notes: ""
        });
    }

    renderVisitChart();
    renderVisitSummary();
}

/**
 * Draw the visit chart: what is already on record, then today's marks on top.
 *
 * Repainted whole rather than patched, because a tooth taken off this visit's
 * list has to fall back to whatever the record said before — and working that
 * out incrementally is how a chart ends up showing a condition nobody entered.
 */
function renderVisitChart() {
    clearChart("visit");

    Object.keys(visitExistingTeeth).forEach(num => {
        const t = visitExistingTeeth[num];
        if (!t || !t.status) return;
        paintTooth("visit", parseInt(num, 10), t.status,
                   Array.isArray(t.surfaces) ? t.surfaces : [], false, t.material);
    });

    visitToothEntries.forEach(t => {
        paintTooth("visit", t.toothNumber, t.conditionStatus, t.surfaces, true, t.material);
    });
}

/** A plain list of what has been marked, so it can be read back at a glance. */
function renderVisitSummary() {
    const box = document.getElementById("visit-tooth-summary");
    if (!box) return;

    if (visitToothEntries.length === 0) {
        box.innerHTML = '<p class="field-hint">' +
            "No teeth marked yet. If this visit was not tooth-specific — a cleaning, " +
            "say — leave the chart alone and fill in General area below." +
            "</p>";
        return;
    }

    const sorted = visitToothEntries.slice().sort((a, b) => a.toothNumber - b.toothNumber);

    box.innerHTML =
        '<div class="visit-summary__head">' +
            "Marked this visit: <strong>" + sorted.length + "</strong>" +
        "</div>" +
        sorted.map(t =>
            '<div class="visit-summary__row">' +
                "<strong>#" + t.toothNumber + "</strong>" +
                "<span>" + escapeHtml(toothConditionLabel(t.conditionStatus, t.material)) + "</span>" +
                '<span class="field-hint" style="margin:0;">' +
                    (t.surfaces.length
                        ? t.surfaces.map(k => {
                            const sf = TOOTH_SURFACES.find(x => x.key === k);
                            return sf ? sf.code : k;
                          }).join(", ")
                        : "whole tooth") +
                "</span>" +
                '<button type="button" class="btn-danger btn-sm" ' +
                    'onclick="removeVisitTooth(' + t.toothNumber + ')">Remove</button>' +
            "</div>"
        ).join("");
}

function removeVisitTooth(num) {
    visitToothEntries = visitToothEntries.filter(t => t.toothNumber !== num);
    renderVisitChart();
    renderVisitSummary();
}


// ─────────────────────────────────────────────────────────────
// The final charge, and the prescription the patient takes home
// ─────────────────────────────────────────────────────────────

/**
 * Echo the typed charge back in words the dentist can sanity-check.
 *
 * A mistyped charge is the failure this guards against: ₱35000 instead of
 * ₱3500 is one keystroke, and neither the form nor the rules can tell the
 * difference. Showing the figure formatted, next to the box, is the cheapest
 * way to make an extra zero visible before it becomes a bill.
 */
function updateCompleteChargeHint() {
    const input = document.getElementById("complete-charge");
    const hint  = document.getElementById("complete-charge-hint");
    if (!input || !hint) return;

    const raw = (input.value || "").trim();
    if (raw === "") {
        hint.innerHTML = "What the patient is billed for this visit. The front desk " +
                         "collects it — you are not recording a payment here.";
        hint.style.color = "";
        return;
    }

    const value = Math.round((Number(raw) || 0) * 100) / 100;
    if (!isFinite(value) || value < 0) {
        hint.innerText = "That is not a valid amount.";
        hint.style.color = "var(--color-danger)";
        return;
    }

    const pretty = "₱" + value.toLocaleString("en-PH", {
        minimumFractionDigits: 2, maximumFractionDigits: 2
    });

    hint.innerText = value === 0
        ? "No charge for this visit."
        : "The patient will be billed " + pretty + ".";
    hint.style.color = value >= 50000 ? "var(--color-warning)" : "";
}

// The last completed visit, kept only so the Print button has something to
// print after the dialog closes. Not persisted anywhere.
let lastCompletedVisit = null;

/**
 * Print the prescription of one visit, and nothing else.
 *
 * ── WHAT THIS REPLACED (2026-09-30) ───────────────────────────────────────
 * This used to build a "visit record" slip: the charting, the operation, the
 * findings, the diagnosis and the prescription. Dr. Gapit asked for it to
 * stop. Those are the clinic's records, and a patient asks the clinic for
 * them. What a patient is handed is the prescription, laid out like her pad.
 * The layout and the paper are in js/prescription.js and js/print.js.
 *
 * It is still not a receipt. Money lives on the bill the front desk hands
 * over.
 *
 * @param {Object} visit  the visit just saved, or a dental_records document
 */
function printVisitPrescription(visit) {
    if (!visit) {
        showToast("There is no visit to print yet.", "warning");
        return;
    }

    const rx = prescriptionPrintable(visit);
    if (!rx) {
        showToast("No prescription was written for this visit.", "info");
        return;
    }

    const print = patient => printPrescription({
        patient: patient || {},
        date: visit.recordDate,
        items: rx.items,
        text: rx.text
    });

    // The visit just saved carries the patient it was opened for. A visit
    // reopened from the list does not, so their record is read for the name,
    // address, age and sex on the patient block.
    if (visit.patient || !visit.patientId) {
        print(visit.patient);
        return;
    }
    db.collection("patients").doc(visit.patientId).get()
        .then(doc => print(doc.exists ? doc.data() : {}))
        .catch(err => {
            // Printed with the patient block left blank rather than not at
            // all: the lines can be written in by hand, as on the paper pad.
            console.error("Could not load the patient for the prescription:", err);
            print({});
        });
}

/** "Print prescription" on the Visit saved dialog. */
function printCompletedPrescription() {
    printVisitPrescription(lastCompletedVisit);
}

/**
 * Offer the printout straight after a visit is saved.
 *
 * Shown as its own dialog rather than printing automatically: a print dialog
 * appearing unbidden is startling, and the dentist may be mid-conversation
 * with the next patient.
 */
// ── Reopening a visit that was already written up ───────────────────────────
//
// The printout is offered once, in the moment after saving. That is the wrong
// and only moment: the dentist may close it while talking to the next patient,
// and the patient may decide she wants a copy after she has stood up. Both used
// to mean the printout was simply gone.
//
// Held separately from lastCompletedVisit so that viewing an old visit cannot
// overwrite the one just saved — printing from the "Visit saved" dialog after
// browsing an earlier record must still print the right visit.
let viewedVisit = null;

/**
 * Open a completed appointment's saved record, read-only, with Print.
 *
 * Found by appointmentId rather than a stored pointer: the record's own
 * appointmentId is written inside the completion transaction, so it exists for
 * every visit ever saved, including those from before this screen did. A
 * pointer added to the appointment today would only work going forward.
 */
function viewVisitRecord(apptId) {
    const body = document.getElementById("visit-record-body");
    const printBtn = document.getElementById("visit-record-print");
    if (!body) return;

    viewedVisit = null;
    body.innerHTML = '<p class="field-hint">Loading&hellip;</p>';
    if (printBtn) printBtn.disabled = true;
    if (typeof fillPrintSheetSlots === "function") {
        fillPrintSheetSlots(document.getElementById("modal-visit-record"));
    }
    openModal("modal-visit-record");

    db.collection("dental_records")
      .where("appointmentId", "==", apptId)
      .get()
      .then(snap => {
          if (snap.empty) {
              // A visit marked complete with no record behind it should not be
              // possible — both are written in one transaction — but saying so
              // plainly beats an empty dialog that looks like it is still loading.
              body.innerHTML =
                  '<p class="field-hint">No saved record was found for this visit. ' +
                  'If it was completed before this screen existed, the details are ' +
                  'on the patient&rsquo;s history tab.</p>';
              return;
          }

          // Newest first, in the event a visit was ever recorded twice.
          const records = snap.docs.map(d => d.data())
              .sort((a, b) => String(b.recordDate || "").localeCompare(String(a.recordDate || "")));
          const v = records[0];

          viewedVisit = v;
          // Only the prescription is printed for a patient, so there is
          // something to print only when one was written.
          const hasRx = !!prescriptionPrintable(v);
          if (printBtn) printBtn.disabled = !hasRx;
          body.innerHTML = renderVisitRecordBody(v) +
              (hasRx ? "" : '<p class="field-hint">No prescription was written for this visit.</p>');
      })
      .catch(err => {
          console.error("Could not load the visit record:", err);
          body.innerHTML =
              '<p class="field-hint">Could not load this visit. Check your connection ' +
              'and try again.</p>';
      });
}

/** The saved visit, laid out to be read back and checked at a glance. */
function renderVisitRecordBody(v) {
    const esc = x => escapeHtml(x == null ? "" : x);
    const filled = x => (x && String(x).trim()) ? esc(x) : '<span class="muted">Not recorded</span>';

    const teeth = Array.isArray(v.teethUpdated) ? v.teethUpdated : [];
    const teethBlock = teeth.length
        ? '<div class="vr-teeth">' + teeth.map(t =>
              '<span class="vr-tooth">#' + esc(t.toothNumber) + " " +
              // In the doctor's own codes: "Filled (LC)", "EXO", "RCT".
              (t.previousStatus && t.previousStatus !== t.conditionStatus
                  ? esc(toothConditionLabel(t.previousStatus)) + " &rarr; " +
                    esc(toothConditionLabel(t.conditionStatus, t.material))
                  : esc(toothConditionLabel(t.conditionStatus, t.material))) +
              "</span>").join("") + "</div>"
        : '<p class="muted" style="margin:0;">No teeth were charted for this visit.</p>';

    const row = (label, value) =>
        '<div class="vr-row"><dt>' + label + "</dt><dd>" + value + "</dd></div>";

    return (
        '<div class="vr-head">' +
            "<strong>" + esc(v.patientName || "Patient") + "</strong>" +
            '<span class="muted">' + esc(v.recordDate || "") + "</span>" +
        "</div>" +
        '<p class="vr-procedure">' + esc(v.treatmentName || "Consultation") + "</p>" +

        '<h4 class="vr-section">Teeth treated</h4>' + teethBlock +

        '<h4 class="vr-section">Clinical record</h4>' +
        '<dl class="vr-list">' +
            row("Diagnosis", filled(v.diagnosis)) +
            row("Findings", filled(v.findings)) +
            row("Treatment", filled(v.treatmentDone)) +
            row("Prescription", filled(v.prescription)) +
            (v.notes ? row("Notes", esc(v.notes)) : "") +
            (v.nextVisitDate ? row("Next visit", esc(v.nextVisitDate)) : "") +
        "</dl>" +

        (v.amendedAt
            ? '<p class="field-hint">This record was corrected on ' +
              esc(String(v.amendedAt).split("T")[0]) + ".</p>"
            : "")
    );
}

/** Print the prescription of the visit open in the viewer, not the last one saved. */
function printViewedVisit() {
    if (!viewedVisit) {
        showToast("This visit is still loading.", "warning");
        return;
    }
    printVisitPrescription(viewedVisit);
}

function offerVisitPrintout(visit) {
    lastCompletedVisit = visit;

    const body = document.getElementById("visit-done-body");
    if (!body) {
        // No dialog in the page — say it saved and leave the print to the
        // record card, rather than failing silently.
        showToast("Visit saved.", "success");
        return;
    }

    const esc = (x) => escapeHtml(x == null ? "" : x);
    const hasRx = !!prescriptionPrintable(visit);
    body.innerHTML =
        '<p class="visit-done__lead">Visit saved for <strong>' + esc(visit.patientName) + '</strong>.</p>' +
        '<ul class="visit-done__list">' +
            '<li>Chart updated: <strong>' + (visit.teethUpdated || []).length + '</strong> tooth/teeth</li>' +
            '<li>Treatment log written</li>' +
            '<li>Bill raised: <strong>₱' +
                (Number(visit.charge) || 0).toLocaleString("en-PH", {
                    minimumFractionDigits: 2, maximumFractionDigits: 2
                }) +
            '</strong> (unpaid — collected at the front desk)</li>' +
        '</ul>' +
        '<p class="visit-done__hint">' +
            (hasRx
                ? 'The prescription is the only page printed for the patient.'
                : 'No prescription was written for this visit.') +
        '</p>';

    const printBtn = document.getElementById("visit-done-print");
    if (printBtn) printBtn.disabled = !hasRx;
    if (typeof fillPrintSheetSlots === "function") {
        fillPrintSheetSlots(document.getElementById("modal-visit-done"));
    }

    openModal("modal-visit-done");
}

function submitCompleteAppointment(e) {
    e.preventDefault();

    const appointment_id = document.getElementById("complete-appt-id").value;
    const patient_id     = document.getElementById("complete-patient-id").value;
    const treatment_id   = document.getElementById("complete-treatment-id").value;
    const patient_name   = document.getElementById("complete-patient-name").innerText || "";
    const diagnosis      = document.getElementById("complete-diagnosis").value;
    // Findings is its own field on the paper card: what was observed, as
    // distinct from what it was judged to be. Folding the two together made
    // them impossible to read back apart.
    const findings       = document.getElementById("complete-findings").value;
    const treatment_done = document.getElementById("complete-treatment-done").value;
    // The prescription is rows now (js/prescription.js): the cleaned rows are
    // saved as they are, and as one line of text each, which is the field the
    // older screens already show.
    const rxItems        = cleanRxItems(visitRxItems);
    const prescription   = composePrescriptionText(rxItems);
    const visit_notes    = document.getElementById("complete-notes").value;
    const next_visit     = document.getElementById("complete-next-visit").value;
    const record_date    = localDateKey();

    // The "Materials / medicines used" tick-list is gone — it was a fixed menu
    // that could not hold what the dentist actually reached for, moved no
    // stock, and carried no quantity. Kept as an empty array so records written
    // before the change keep their shape and nothing downstream has to test for
    // a missing field. What comes off the shelf is filed by the front desk and
    // approved by the dentist (js/stock-requests.js), not recorded here.
    const materialsUsed = [];

    // ── The final charge, typed by the dentist ────────────────────────────
    // See the note in templates/partials/modals-clinical.php: this reverses
    // the old "a dentist never touches an amount" rule, at the clinic's
    // request. It is validated here AND in firestore.rules — a number this
    // consequential should not be guarded by a form alone.
    const chargeRaw  = (document.getElementById("complete-charge").value || "").trim();
    const chargeNote = (document.getElementById("complete-charge-note").value || "").trim();
    const finalCharge = Math.round((Number(chargeRaw) || 0) * 100) / 100;

    if (chargeRaw === "" || !isFinite(finalCharge) || finalCharge < 0) {
        showToast("Enter the final charge for this visit (0 is allowed for a free follow-up).", "warning");
        const el = document.getElementById("complete-charge");
        if (el) el.focus();
        return;
    }

    // The same ceiling firestore.rules enforces in chargeIsSane(). Checked here
    // too because the rules can only REFUSE: a charge over the cap would be
    // denied mid-transaction, and the dentist would lose the charting and the
    // clinical record to a generic "could not
    // complete" with nothing naming the field that was wrong. The ceiling
    // exists to catch a slipped keystroke, so it has to catch it before the
    // work is thrown away.
    if (finalCharge > MAX_VISIT_CHARGE) {
        showToast("₱" + finalCharge.toLocaleString("en-PH") + " looks like a typo — the most a single " +
                  "visit can be charged is ₱" + MAX_VISIT_CHARGE.toLocaleString("en-PH") + ".", "warning");
        const el = document.getElementById("complete-charge");
        if (el) { el.focus(); el.select(); }
        return;
    }

    // treatment_id is deliberately NOT required. A booking made through
    // "Others" has no treatment from the price list at all — it is a request
    // for something not on it — and refusing to complete that visit would
    // leave real work with nowhere to be recorded.
    if (!appointment_id || !patient_id) {
        showToast("Missing appointment details — close this and open it again.", "error");
        return;
    }

    const treatmentName = (globalTreatmentsList.find(t => t.treatment_id === treatment_id) || {}).treatment_name
        || document.getElementById("complete-treatment-name").innerText
        || "Consultation";

    // The teeth actually charted, or empty when the work was not tooth-specific.
    //
    // This used to fall back to a free-text "General area" box that arrived
    // pre-filled with the word "All". Nobody could say what "All" meant — every
    // tooth in the mouth, or simply "not recorded?" — and because it was the
    // default, it was what got saved whenever the dentist left it alone. A
    // cleaning and a visit she forgot to chart came out looking identical.
    //
    // Empty is honest: it says the work was not tied to particular teeth, and
    // the procedure name on the same record already says what was done. Display
    // sites render it as a dash.
    const toothSummary = visitToothEntries.length > 0
        ? visitToothEntries.slice().sort((a, b) => a.toothNumber - b.toothNumber)
              .map(t => t.toothNumber).join(", ")
        : "";

    const apptRef      = db.collection("appointments").doc(appointment_id);
    const patientRef   = db.collection("patients").doc(patient_id);
    const recordRef    = db.collection("dental_records").doc();
    const billRef      = db.collection("billing").doc();

    const submitBtn = document.querySelector("#form-complete-appt button[type='submit']");
    if (submitBtn) submitBtn.disabled = true;

    db.runTransaction(tx => {
        // ── Reads, all of them, before any write ──────────────────────────
        return Promise.all([tx.get(apptRef), tx.get(patientRef)]).then(([apptSnap, patientSnap]) => {
            if (!apptSnap.exists) throw new Error("This appointment no longer exists.");

            // Without this, a double-click or a retry on a slow connection
            // would run the whole thing twice and raise two bills for one
            // visit.
            // The status on the LIVE record, not the one the screen opened with.
            const status = apptSnap.data().status;
            if (status === "Completed") {
                throw new Error("This appointment has already been completed.");
            }
            // And only a visit still to be seen (2026-09-30). The form can be
            // open while the desk marks a no-show or the patient cancels from
            // home; saving then would bill a visit the record says never
            // happened, against an hour already given to somebody else.
            if (COMPLETABLE_FROM.indexOf(status) === -1) {
                throw new Error("This appointment is now \"" + (status || "unknown") +
                                "\". Nothing was saved.");
            }

            // ── Writes ────────────────────────────────────────────────

            // Nothing here touches the stock (2026-10-01, Dr. Gapit). She does
            // not pick supplies while she treats; the front desk files what was
            // taken out, and it comes off the shelf when she approves it (Stock
            // Approvals, js/stock-requests.js). So the treatment is not read
            // either: the bill is the charge she typed, and the treatment's
            // supply recipe drove nothing but the deduction that is gone.

            // 1. The chart. Same shape the Dental Record Card tab
            //    writes, merged onto the patient so both agree.
            //
            //    The update runs on every visit, teeth marked or not
            //    (2026-09-30): it also dates the patient, which is what
            //    lets Patient History find people by when they last came.
            const existingLastVisit = patientSnap.exists ? String(patientSnap.data().lastVisitDate || "") : "";
            const teethUpdate = { lastVisitDate: /^\d{4}-\d{2}-\d{2}$/.test(existingLastVisit) && existingLastVisit > record_date ? existingLastVisit : record_date };
            visitToothEntries.forEach(t => {
                teethUpdate["teethStatus." + t.toothNumber] =
                    buildToothStatusEntry(t.conditionStatus, t.surfaces, t.notes, t.material);
            });
            tx.update(patientRef, teethUpdate);

            // 2. The clinical log, carrying a snapshot of what was
            //    charted at THIS visit. teethStatus only ever holds the
            //    current state, so without the snapshot there would be
            //    no record of what changed when.
            tx.set(recordRef, {
                patientId: patient_id,
                dentistId: currentUserId,
                appointmentId: appointment_id,
                treatmentId: treatment_id,
                treatmentName: treatmentName,
                diagnosis: diagnosis,
                findings: findings,
                treatmentDone: treatment_done,
                prescription: prescription,
                // The same prescription as rows: { drug, strength, qty, sig }.
                prescriptionItems: rxItems,
                notes: visit_notes,
                toothNumber: toothSummary,
                // A snapshot of what changed at THIS visit, and what it
                // was before. teethStatus on the patient only ever holds
                // the current state, so without this there would be no
                // way to answer "when did 36 become a filling?" — the
                // treatment log would show that a visit happened but not
                // what it did to the chart.
                teethUpdated: visitToothEntries.map(t => {
                    const before = visitExistingTeeth[t.toothNumber] || {};
                    return {
                        toothNumber: t.toothNumber,
                        conditionStatus: t.conditionStatus,
                        surfaces: t.surfaces,
                        // The filling type, on a Filled tooth only
                        // (LC, AM, TF, GIC); "" otherwise.
                        material: toothMaterialFor(t.conditionStatus, t.material),
                        previousStatus: before.status || "Healthy",
                        previousSurfaces: Array.isArray(before.surfaces) ? before.surfaces : []
                    };
                }),
                materialsUsed: materialsUsed,
                nextVisitDate: next_visit || null,
                recordDate: record_date,
                createdAt: new Date().toISOString()
            });

            // 3. The bill. The operation line carries the whole charge.
            //    Materials are listed at zero: the clinic prices per
            //    visit, not per item. Supplies are no longer on a new
            //    bill (2026-10-01): Record Visit takes nothing from
            //    stock, and bills raised before keep their supply lines.
            const lineItems = [{
                kind: "operation",
                name: chargeNote || treatmentName,
                toothNumber: toothSummary,
                amount: finalCharge
            }];

            materialsUsed.forEach(name => {
                lineItems.push({ kind: "material", name: name, toothNumber: "", amount: 0 });
            });

            tx.set(billRef, {
                recordId: recordRef.id,
                treatmentId: treatment_id,
                appointmentId: appointment_id,
                patientId: patient_id,
                patientName: patient_name,
                treatmentName: treatmentName,
                lineItems: lineItems,
                totalAmount: finalCharge,
                amountPaid: 0,
                balance: finalCharge,
                paymentStatus: "Unpaid",
                // Records that a person set this figure rather than it
                // being derived from the price list, and who. Without
                // it, a bill that was typed is indistinguishable from
                // one the system calculated.
                chargeSetBy: currentUserId,
                chargeIsManual: true,
                billingDate: record_date,
                createdAt: new Date().toISOString()
            });

            // 4. The status last, so a transaction that fails part way
            //    can never leave an appointment marked Completed.
            tx.update(apptRef, {
                status: "Completed",
                billingId: billRef.id,
                completedAt: new Date().toISOString()
            });
        });
    })
    .then(() => {
        // The visit rewrote the patient's chart, so the cached patient list is
        // now behind. Inventory is not cached, so nothing to drop there.
        refreshReference("patients");

        showToast("Visit completed: chart, record and bill saved.", "success");

        // Snapshot what was just saved, for the printout. Taken here rather
        // than read back from Firestore: the write has only just landed, and a
        // re-read can still return the previous state.
        const printable = {
            patientName: patient_name,
            recordDate: record_date,
            treatmentName: treatmentName,
            toothNumber: toothSummary,
            diagnosis: diagnosis,
            findings: findings,
            treatmentDone: treatment_done,
            prescription: prescription,
            prescriptionItems: rxItems,
            // For the patient block on the printed prescription.
            patientId: patient_id,
            patient: visitPatientProfile,
            notes: visit_notes,
            nextVisitDate: next_visit,
            // previousStatus is added HERE, not read off visitToothEntries —
            // those entries only carry what the dentist just marked
            // ({toothNumber, conditionStatus, surfaces, notes}). The prior
            // state lives in visitExistingTeeth, and both are still in scope
            // at this point because the reset happens below.
            //
            // Without this the printed "Change" column fell back to a dash on
            // every row, so the slip never showed what the visit actually did.
            teethUpdated: visitToothEntries.map(t => {
                const before = visitExistingTeeth[t.toothNumber] || {};
                return {
                    toothNumber: t.toothNumber,
                    conditionStatus: t.conditionStatus,
                    surfaces: t.surfaces,
                    material: toothMaterialFor(t.conditionStatus, t.material),
                    previousStatus: before.status || "Healthy"
                };
            }),
            charge: finalCharge
        };

        visitToothEntries = [];
        visitExistingTeeth = {};
        visitPatientProfile = null;
        closeModal("modal-complete-appt");
        offerVisitPrintout(printable);
        if (typeof clinicPatientVisit !== "undefined" && clinicPatientVisit && clinicPatientVisit.id === appointment_id) clinicPatientVisit = null;
        const historyTab = document.getElementById("tab-dentist-history");
        if (historyTab && !historyTab.classList.contains("hidden") && typeof selectPatientForHistory === "function") {
            selectPatientForHistory({ patient_id: patient_id });
        }
        const appointmentsTab = document.getElementById("tab-dentist-appointments");
        if (appointmentsTab && !appointmentsTab.classList.contains("hidden")) loadDentistAppointments();
    })
    .catch(err => {
        console.error("Error completing the appointment:", err);
        showToast(err.message || "Could not complete the visit. Nothing was changed.", "error");
    })
    .finally(() => {
        if (submitBtn) submitBtn.disabled = false;
    });
}


// Load staff approvals database table
function loadStaffAppointments() {
    // Live since 2026-10-02 (R20): new bookings, cancellations and moves show
    // without a refresh. The same windowed query; the selected pill and the
    // table's scroll are kept by renderStaffAppointments().
    const failed = err => {
        console.error("Error loading staff appointments:", err);
        renderTableLoadError("staff-appointments-table", 7, "the appointments", "loadStaffAppointments");
    };
    getReference("dentists").then(dentistDocs => {
        // Windowed, not the whole collection — see appointmentsInWindow().
        watchLive("tab-staff-appointments:list", appointmentsInWindow(), apptSnapshot => {
            // Only the patients these appointments name — see getPatientsByIds(),
            // which fetches only the ones it does not already hold.
            const ids = [];
            apptSnapshot.forEach(doc => ids.push(doc.data().patientId));
            getPatientsByIds(ids)
                .then(patientMap => drawStaffAppointments(apptSnapshot, patientMap, dentistDocs))
                .catch(failed);
        }, failed);
    }).catch(failed);
}

/** Approve Bookings, from one snapshot. */
function drawStaffAppointments(apptSnapshot, patientMap, dentistDocs) {
    const dentistMap = {};
    Object.keys(dentistDocs).forEach(id => {
        const d = dentistDocs[id];
        dentistMap[id] = `Dr. ${d.first_name} ${d.last_name}`;
    });

    allStaffAppointments = [];
    apptSnapshot.forEach(doc => {
        const appt = doc.data();
        const patient = patientMap[appt.patientId] || {};
        allStaffAppointments.push({
            appointment_id: doc.id,
            patientId: appt.patientId,
            patientName: appt.patientName,
            patient_first: patient.firstName || "",
            patient_last: patient.lastName || "",
            phone_number: patient.phoneNumber || "",
            dentistId: appt.dentistId,
            dentist_first: dentistMap[appt.dentistId] ? "" : "Reina",
            dentist_last: dentistMap[appt.dentistId] ? "" : "Gapit",
            dentistName: dentistMap[appt.dentistId] || "Dr. Reina Gapit",
            treatmentName: appt.treatmentName,
            // Carried through so the front desk can see a multi-service
            // booking and, more importantly, the free-text "Others"
            // request. Without these three the staff list showed only the
            // literal words "Others (see request)" and the patient's
            // actual description reached nobody.
            treatmentNames: appt.treatmentNames,
            otherRequested: appt.otherRequested,
            otherNote: appt.otherNote,
            rescheduleCount: appt.rescheduleCount,
            rescheduleReason: appt.rescheduleReason,
            clinicRescheduleReason: appt.clinicRescheduleReason,
            appointment_date: appt.appointmentDate,
            appointment_time: appt.appointmentTime,
            status: appt.status
        });
    });

    renderStaffAppointments();

    // Calculate counts
    const pending = allStaffAppointments.filter(a => effectiveAppointmentStatus({
        status: a.status, appointmentDate: a.appointment_date, appointmentTime: a.appointment_time
    }) === "Pending").length;
    const approved = allStaffAppointments.filter(a => a.status === "Approved").length;
    const completed = allStaffAppointments.filter(a => a.status === "Completed").length;

    const pendingFigure = document.getElementById("stats-pending-count");
    pendingFigure.innerText = pending;
    // The phone tile turns amber while anything waits (css/marble.css §10).
    const summary = pendingFigure.closest(".metrics");
    if (summary) summary.classList.toggle("has-waiting", pending > 0);
    document.getElementById("stats-approved-count").innerText = approved;
    document.getElementById("stats-completed-count").innerText = completed;
    renderBookingSparkline(allStaffAppointments);
}

/**
 * Bookings per day for the last fortnight, as bars.
 *
 * Built from the appointment dates already in memory — no extra read, and no
 * invented numbers. That distinction is the whole point: a sparkline drawn
 * from a shape somebody liked is a lie told in a chart, and it is a lie the
 * reader has no way to check. If the data cannot support the picture, the
 * right answer is to draw nothing, which is what the empty case does.
 *
 * SVG built as a string rather than with a chart library: fourteen rectangles
 * do not justify a dependency, and this way the bars inherit the page's own
 * colours instead of arriving with a library's palette.
 */
function renderBookingSparkline(appts) {
    const box = document.getElementById("stats-spark");
    const scope = document.getElementById("stats-spark-scope");
    if (!box) return;

    const DAYS = 14;

    // Buckets keyed by local date, oldest first, so a day with no bookings is
    // a gap in the run rather than a missing bar that shortens the chart and
    // makes a quiet fortnight look busy.
    const days = [];
    for (let i = DAYS - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push({ key: localDateKey(d), n: 0 });
    }
    const index = {};
    days.forEach((d, i) => { index[d.key] = i; });

    (appts || []).forEach(a => {
        const i = index[a.appointmentDate];
        if (i !== undefined) days[i].n++;
    });

    const total = days.reduce((s, d) => s + d.n, 0);
    if (total === 0) {
        box.innerHTML = "";
        if (scope) scope.innerText = "No bookings in the last " + DAYS + " days.";
        return;
    }

    const peak = Math.max.apply(null, days.map(d => d.n));
    const W = 100, H = 34, gap = 1.6;
    const barW = (W - gap * (DAYS - 1)) / DAYS;

    const bars = days.map((d, i) => {
        // A day with bookings always draws at least a sliver, so "one booking"
        // and "none" are never the same picture.
        const h = d.n === 0 ? 0 : Math.max(2, (d.n / peak) * H);
        const x = i * (barW + gap);
        return '<rect x="' + x.toFixed(2) + '" y="' + (H - h).toFixed(2) +
               '" width="' + barW.toFixed(2) + '" height="' + h.toFixed(2) +
               '" rx="0.6"></rect>';
    }).join("");

    box.innerHTML =
        '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" ' +
        'fill="var(--color-accent)" role="img">' + bars + "</svg>";

    if (scope) {
        const first = days[0].key, last = days[DAYS - 1].key;
        scope.innerText = total + (total === 1 ? " booking" : " bookings") +
            " from " + first + " to " + last + ", busiest day " + peak + ".";
    }
}

function filterStaffAppointments(status) {
    staffAppointmentsFilter = status;
    renderStaffAppointments();
}

/** The number beside each filter pill, and which pill is selected. */
function paintStaffFilterCounts(shownOf) {
    const today = localDateKey();
    const counts = { Today: 0, Cancelled: 0, Pending: 0, Approved: 0, Completed: 0 };
    allStaffAppointments.forEach(appt => {
        // Today counts by date, whatever the status; the rest count by status.
        if (appt.appointment_date === today) counts.Today++;
        const shown = shownOf(appt);
        if (counts[shown] !== undefined && shown !== "Today") counts[shown]++;
    });
    document.querySelectorAll("#tab-staff-appointments [data-appt-filter]").forEach(pill => {
        const key = pill.getAttribute("data-appt-filter");
        const count = pill.querySelector(".filter-count");
        if (count) count.textContent = String(counts[key] || 0);
        pill.setAttribute("aria-pressed", key === staffAppointmentsFilter ? "true" : "false");
    });
}

function rescheduleReasonHtml(appt) {
    return [["Patient reschedule", appt.rescheduleReason], ["Clinic rebook", appt.clinicRescheduleReason]]
        .filter(([, reason]) => reason)
        .map(([label, reason]) => '<p class="field-hint">' + label + ': ' + escapeHtml(reason) + '</p>')
        .join("");
}

/* One rendering contract for the clinic appointment tables. Keeping these
   controls shared prevents the staff and dentist views from drifting back to
   different sizes, colours or accessible labels. */
function appointmentApprovalActions(apptId, role) {
    const id = escapeJsAttr(apptId);
    const source = escapeJsAttr(role);
    return `<button class="appt-icon-action appt-icon-action--approve" type="button" aria-label="Review and approve appointment" title="Review and approve" onclick="reviewAppointmentApproval('${id}', '${source}')"><svg aria-hidden="true"><use href="#ic-check"></use></svg><span class="visually-hidden">Review and approve</span></button>` +
        `<button class="appt-icon-action appt-icon-action--reject" type="button" aria-label="Reject appointment" title="Reject" onclick="updateApptStatus('${id}', 'Rejected', '${source}')"><svg aria-hidden="true"><use href="#ic-close"></use></svg><span class="visually-hidden">Reject</span></button>`;
}

let approvalReview = null;
let approvalReviewVersion = 0;
let approvalReviewTrigger = null;

// The same row interaction works after any table refresh. Buttons within a row
// keep their own action and never open the details panel as a second action.
if (typeof document.addEventListener === "function") {
    document.addEventListener("click", event => {
        const row = event.target.closest("tr.appt-detail-row[data-appointment-id]");
        if (!row || event.target.closest("button, a, input, select, textarea")) return;
        const role = appointmentRowRole(row);
        if (role) openAppointmentDetails(row.dataset.appointmentId, role);
    });
    document.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        const row = event.target.closest("tr.appt-detail-row[data-appointment-id]");
        if (!row || event.target !== row) return;
        const role = appointmentRowRole(row);
        if (!role) return;
        event.preventDefault();
        openAppointmentDetails(row.dataset.appointmentId, role);
    });
}

function appointmentRowRole(row) {
    const id = row.parentElement && row.parentElement.id;
    return id === "patient-appointments-table" ? "patient"
        : id === "staff-appointments-table" ? "staff"
        : id === "dentist-appointments-table" ? "dentist" : null;
}

function closeAppointmentApprovalReview() {
    ++approvalReviewVersion;
    approvalReview = null;
    const modal = document.getElementById("modal-approval-review");
    if (modal) { modal.classList.remove("active"); modal.hidden = true; }
    if (approvalReviewTrigger && approvalReviewTrigger.isConnected) approvalReviewTrigger.focus();
}

function reviewAppointmentApproval(apptId, sourceRole) {
    if (sourceRole !== "staff" && sourceRole !== "dentist") return;
    openAppointmentDetails(apptId, sourceRole);
}

function openAppointmentDetails(apptId, sourceRole) {
    if (!["patient", "staff", "dentist"].includes(sourceRole)) return;
    const version = ++approvalReviewVersion;
    approvalReviewTrigger = document.activeElement;
    db.collection("appointments").doc(apptId).get().then(snap => {
        if (version !== approvalReviewVersion) return;
        const appt = snap.exists ? snap.data() : null;
        // Firestore rules are the primary access control. Check ownership here
        // too so a stale patient row cannot reveal another patient's details.
        if (!appt || (sourceRole === "patient" && appt.patientId !== currentUserId)) {
            showToast("This appointment is no longer available.", "warning");
            return;
        }
        const setText = (id, value) => { document.getElementById(id).textContent = String(value || "—"); };
        setText("approval-review-patient", appt.patientName);
        // A booking waiting for approval shows the name the patient has now,
        // in case they renamed themselves since booking. Clinic only: a patient
        // reviewing their own booking already knows their name.
        if (sourceRole !== "patient" && appt.patientId && typeof getPatientsByIds === "function" &&
            typeof appointmentPatientName === "function") {
            getPatientsByIds([appt.patientId]).then(map => {
                if (version !== approvalReviewVersion) return;
                setText("approval-review-patient",
                    appointmentPatientName(appt, map[appt.patientId], effectiveAppointmentStatus(appt)));
            }).catch(() => { /* the stored name is already showing */ });
        }
        setText("approval-review-date", appt.appointmentDate);
        setText("approval-review-time", appt.appointmentTime);
        setText("approval-review-services", Array.isArray(appt.treatmentNames) && appt.treatmentNames.length
            ? appt.treatmentNames.join(", ") + (appt.otherRequested ? ", Others" : "")
            : appt.treatmentName || (appt.otherRequested ? "Others" : ""));
        const moved = appt.rescheduledAt || appt.rescheduleReason || appt.clinicRescheduledAt || appt.clinicRescheduleReason;
        document.getElementById("approval-review-date-label").textContent = moved ? "Reschedule date" : "Requested date";
        document.getElementById("approval-review-time-label").textContent = moved ? "Reschedule time" : "Requested time";
        document.getElementById("approval-review-reason-wrap").hidden = !appt.rescheduleReason;
        setText("approval-review-reason", appt.rescheduleReason);
        document.getElementById("approval-review-clinic-reason-wrap").hidden = !appt.clinicRescheduleReason;
        setText("approval-review-clinic-reason", appt.clinicRescheduleReason);
        document.getElementById("approval-review-notes-wrap").hidden = !appt.notes;
        setText("approval-review-notes", appt.notes);
        document.getElementById("approval-review-other-wrap").hidden = !appt.otherNote;
        setText("approval-review-other", appt.otherNote);
        const status = effectiveAppointmentStatus(appt);
        setText("approval-review-status", status);
        const canDecide = sourceRole !== "patient" && status === "Pending";
        document.getElementById("approval-review-title").textContent = canDecide ? "Review appointment request" : "Appointment details";
        document.getElementById("approval-review-hint").textContent = canDecide
            ? "Check the requested schedule and patient note before deciding."
            : "Current appointment information.";
        document.getElementById("approval-review-approve").hidden = !canDecide;
        document.getElementById("approval-review-reject").hidden = !canDecide;
        approvalReview = canDecide ? { apptId, sourceRole } : null;
        const modal = document.getElementById("modal-approval-review");
        modal.querySelector(".modal-footer").hidden = !canDecide;
        modal.hidden = false;
        modal.classList.add("active");
        (canDecide ? document.getElementById("approval-review-approve") : modal.querySelector(".modal-close-btn")).focus();
    }).catch(err => {
        console.error("Could not review appointment:", err);
        showToast("Could not open this request. Try again.", "error");
    });
}

function rejectReviewedAppointment() {
    if (!approvalReview) return;
    const { apptId, sourceRole } = approvalReview;
    closeAppointmentApprovalReview();
    updateApptStatus(apptId, "Rejected", sourceRole);
}

function confirmReviewedAppointment(event) {
    event.preventDefault();
    if (!approvalReview) return;
    const { apptId, sourceRole } = approvalReview;
    closeAppointmentApprovalReview();
    updateApptStatus(apptId, "Approved", sourceRole);
}

/* Every other row action uses one labelled button: same 44px height, same
   rhythm, and a colour that says what it does (blue moves a booking, green
   records care, red stops it, neutral is secondary). The old mix of a soft
   Reschedule beside a small solid-red Cancel wrapped into a tower inside the
   pinned column. On phones each row is a card and the buttons share its
   width, words and all (css/components.css); aria-label and title keep
   naming each action. `onclick` is built by the
   caller with escapeJsAttr() already applied. */
function appointmentActionButton({ tone, icon, label, onclick, name, title, className }) {
    const accessibleName = name || label;
    return `<button type="button" class="appt-action appt-action--${tone}${className ? " " + className : ""}" aria-label="${escapeHtml(accessibleName)}" title="${escapeHtml(title || accessibleName)}" onclick="${onclick}"><svg class="icon" aria-hidden="true"><use href="#ic-${icon}"></use></svg><span class="appt-action__label">${escapeHtml(label)}</span></button>`;
}

function appointmentScheduleAction(apptId, label) {
    return appointmentActionButton({ tone: "accent", icon: "calendar", label,
        name: label + " appointment", className: "appt-rebook-action",
        onclick: `clinicianReschedule('${escapeJsAttr(apptId)}')` });
}

function appointmentRebookAction(apptId) {
    return appointmentScheduleAction(apptId, "Rebook");
}

function appointmentCancelAction(onclick) {
    return appointmentActionButton({ tone: "danger", icon: "close", label: "Cancel",
        name: "Cancel appointment", onclick });
}

function appointmentActionSetHtml(actions) {
    if (!actions || actions === "--") return "--";
    // More than two controls sit in a 2-by-2 block instead of one long strip.
    const count = (actions.match(/<button\b/g) || []).length;
    return `<span class="appt-action-set${count > 2 ? " appt-action-set--grid" : ""}">${actions}</span>`;
}

function renderStaffAppointments() {
    const tbody = document.getElementById("staff-appointments-table");
    if (!tbody) return;
    tbody.innerHTML = "";

    // Filter and count by what the row actually shows. A Pending request whose
    // time has passed reads "Expired" and can no longer be approved, so it is
    // not counted as waiting for approval.
    const shownOf = appt => effectiveAppointmentStatus({
        status: appt.status, appointmentDate: appt.appointment_date, appointmentTime: appt.appointment_time
    });
    paintStaffFilterCounts(shownOf);
    const today = localDateKey();
    const filtered = allStaffAppointments.filter(appt => {
        if (staffAppointmentsFilter === "Today") return appt.appointment_date === today;
        return shownOf(appt) === staffAppointmentsFilter;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = staffAppointmentsFilter === "Today"
            ? `<tr><td colspan="7" style="text-align: center;">No appointments for today.</td></tr>`
            : `<tr><td colspan="7" style="text-align: center;">No appointments found for filter '${escapeHtml(staffAppointmentsFilter)}'.</td></tr>`;
        return;
    }

    // Sorted (2026-09-30; the list used to come out in whatever order the
    // database returned it). Today reads forward through the day, earliest
    // first. Everything else is newest first. The time is compared as minutes,
    // because "01:00 PM" sorts before "09:00 AM" as text.
    const when = appt => {
        const mins = parseSlotMinutes(appt.appointment_time);
        return String(appt.appointment_date || "") + " " + String(mins === null ? 0 : mins).padStart(4, "0");
    };
    filtered.sort((a, b) => staffAppointmentsFilter === "Today"
        ? when(a).localeCompare(when(b))
        : when(b).localeCompare(when(a)));

    // Rows are collected and written once. Appending with innerHTML += made the
    // browser re-read the whole table for every row: 300 appointments froze a
    // phone for about 8 seconds and flickered as it redrew (2026-09-24).
    const tableRows = [];
    filtered.forEach(appt => {
        // Same fields, snake_case names on the staff list.
        const dateStr = formatAppointmentWhen({
            appointmentDate: appt.appointment_date,
            appointmentTime: appt.appointment_time
        });
        // Current name on a booking still to come; see appointmentPatientName().
        const patientName = typeof appointmentPatientName === "function"
            ? appointmentPatientName(appt,
                { firstName: appt.patient_first, lastName: appt.patient_last }, shownOf(appt))
            : (appt.patientName || "Unknown");

        // The clock decides, not the stored value — a lapsed appointment reads
        // as lapsed even where nothing can write. This list stores snake_case
        // fields, which effectiveAppointmentStatus() could not read, so a staff
        // row never showed Expired and still offered Approve on a past time.
        const shownStatus = shownOf(appt);
        const badgeClass = statusBadgeClass(shownStatus);
        const statusBadge = `<span class="badge badge-${badgeClass}">${escapeHtml(shownStatus)}</span>`;

        let actions = "";
        // shownStatus, not the stored value — see the dentist list above.
        if (shownStatus === "Pending") {
            actions += appointmentApprovalActions(appt.appointment_id, "staff");
        } else if (shownStatus === "Approved") {
            actions += appointmentScheduleAction(appt.appointment_id, "Reschedule");
            actions += appointmentCancelAction(`updateApptStatus('${escapeJsAttr(appt.appointment_id)}', 'Cancelled', 'staff')`);
        } else if (shownStatus === "Expired" || shownStatus === "No-Show") {
            // The front desk is usually who hears about it, so they get the
            // way back too rather than having to fetch Dr. Gapit.
            actions += appointmentRebookAction(appt.appointment_id);
        } else {
            actions = "--";
        }

        const actionsHtml = appointmentActionSetHtml(actions);
        tableRows.push(`
            <tr class="appt-detail-row" data-appointment-id="${escapeHtml(appt.appointment_id)}" tabindex="0" aria-label="View appointment details">
                <td><strong>${escapeHtml(patientName)}</strong></td>
                <td class="cell-nowrap">${escapeHtml(appt.phone_number || 'N/A')}</td>
                <td>${escapeHtml(appt.dentistName)}</td>
                <td>${appointmentServicesHtml(appt)}</td>
                <td>${dateStr}</td>
                <td>${statusBadge}${rescheduleReasonHtml(appt)}</td>
                <td>${actionsHtml}</td>
            </tr>
        `);
    });
    tbody.innerHTML = tableRows.join("");
}

/**
 * Which stored statuses each clinic-side button may change FROM (2026-09-17).
 *
 * Mirrors where the buttons are offered, and exists because a screen can be
 * out of date. Without it, Approve pressed on a list loaded before the patient
 * cancelled brought the cancelled booking back as Approved — with its hour
 * already released, so a second patient could book the same time. The check
 * runs on the live record inside a transaction (changeAppointmentStatus() in
 * js/app.js). Completed, Rejected, No-Show and Expired are deliberately in no
 * list: nothing here may overwrite them.
 */
const CLINIC_STATUS_CHANGE_FROM = {
    Approved:  ["Pending"],
    Rejected:  ["Pending"],
    Confirmed: ["Pending", "Approved"],
    Cancelled: ["Pending", "Approved", "Confirmed", "Awaiting Consultation", "In Consultation"]
};

/** A no-show can be marked on a booking still due, or on somebody queued who left. */
const NO_SHOW_FROM = ["Pending", "Approved", "Confirmed", "Awaiting Consultation", "In Consultation"];

/**
 * A visit can be recorded only while it is still to be seen (2026-09-30): an
 * approved booking, or somebody in today's queue. These are the same four
 * statuses the queue lists (QUEUE_LISTED_STATUSES in js/queue.js). Checked on
 * the live record inside the completion transaction.
 */
const COMPLETABLE_FROM = ["Approved", "Confirmed", "Awaiting Consultation", "In Consultation"];

/** Reschedule and Rebook: anything not finished, including a missed or lapsed booking. */
const REBOOK_FROM = ["Pending", "Approved", "Confirmed", "Awaiting Consultation",
                     "In Consultation", "Expired", "No-Show"];

// Global update status wrapper
function updateApptStatus(apptId, status, sourceRole) {
    const allowedFrom = CLINIC_STATUS_CHANGE_FROM[status];
    const reload = () => {
        if (sourceRole === "dentist") {
            loadDentistAppointments();
        } else {
            loadStaffAppointments();
        }
    };
    if (!allowedFrom) {
        showToast("That status change is not available.", "error");
        return;
    }

    // The one place every clinic-side status change goes through — Approve,
    // Reject, Confirm, Complete — so it is where the slot has to be given back
    // when a status stops reserving it. Rejected and Cancelled free the hour;
    // Approved and Completed do not. statusReleasesSlot() holds that list, and
    // it is deliberately not APPOINTMENT_OPEN_STATUSES: a Completed visit is
    // closed but its hour is spent, and re-offering it would book somebody into
    // a time that has already happened.
    changeAppointmentStatus(apptId, { status: status }, allowedFrom)
    .then(appt => {
        // `appt` is the LIVE record from just before the change, so the lock
        // released is the one this booking actually held.
        if (appt && !appt.isWalkIn && statusReleasesSlot(status)) {
            releaseSlotLock(appt.dentistId || CLINIC_DENTIST_ID,
                            appt.appointmentDate, appt.appointmentTime);
        }
        showToast(`Appointment status updated to ${status}.`, "success");
        // The clinic made this change itself; the bell need not report it back.
        if (status === "Cancelled" && typeof markNotificationSeen === "function") {
            markNotificationSeen("cancel:" + apptId);
        }
        reload();
    })
    .catch(err => {
        if (err && err.code === RECORD_CHANGED) {
            showToast(err.message, "warning");
            reload();
            return;
        }
        console.error("Failed to update status:", err);
        showToast("Failed to update status.", "error");
    });
}
