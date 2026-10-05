// ============================================================================
// DentCare — Book for a patient (the front desk)
// ----------------------------------------------------------------------------
// Added 2026-10-01, client revision 16. Many of Dr. Gapit's patients have no
// online account, by choice: the clinic keeps their record, and they call to
// book. So Staff Appointments can book for any patient, with or without an
// account.
//
// It is the patient's own booking form, worked by the desk:
//   - the patient is found by surname, the same search as the walk-in queue
//     (matchReturningPatients in js/queue.js);
//   - up to three services, or Others with a note (the same limit);
//   - a date the clinic opened and a time still free: the same lists the
//     patient's form shows (loadBookingDatesDropdown / onBookingDateChanged in
//     js/appointments.js, given this dialog's own selects);
//   - the appointment and its slot lock are written in ONE transaction, the way
//     submitBooking() does, so the hour can never be booked twice.
//
// It is saved Approved, because the clinic made it (PLAN section 4, item 13),
// with bookedByClinic and bookedBy. firestore.rules already let a clinician
// create an appointment, and a lock held in the patient's name, for anyone.
// ============================================================================

/** The patient picked in the dialog: { id, name, label }. */
let clinicBookingPatient = null;
/** The patient list the search runs over: { id: patient }. */
let clinicBookingPatients = null;
/** True while a booking is being saved, so a double press books once. */
let clinicBookingInFlight = false;

/** The front desk books; the dentist approves and treats. */
function canBookForPatient() {
    return currentRole === "staff" || currentRole === "admin";
}

/** "DELA CRUZ, Juan S." — surname first, the way the paper cards are filed. */
function clinicBookingLabel(p) {
    const last = String(p.lastName || "").trim().toUpperCase();
    const first = String(p.firstName || "").trim();
    const middle = String(p.middleName || "").trim();
    return (last + (first ? ", " + first : "") + (middle ? " " + middle.charAt(0).toUpperCase() + "." : "")) || "Patient";
}

function openClinicBooking(patientId) {
    if (!canBookForPatient()) return;
    const form = document.getElementById("form-clinic-book");
    if (form) form.reset();
    clinicBookingPatient = null;
    paintClinicBookingPatient();
    initInlinePatient("clinic-book", {}, p => { if (p) pickClinicBookingPatient(p.id); });
    const results = document.getElementById("clinic-book-results");
    if (results) results.innerHTML = "";
    onClinicBookingServiceChanged(null);
    const time = document.getElementById("clinic-book-time");
    if (time) time.innerHTML = '<option value="" disabled selected>Select Date First</option>';
    const save = document.getElementById("clinic-book-save");
    if (save) save.disabled = false;

    loadClinicBookingServices();
    loadBookingDatesDropdown("clinic-book-date");
    openModal("modal-clinic-book");

    getReference("patients")
        .then(byId => {
            clinicBookingPatients = byId || {};
            inlinePatientStates["clinic-book"].patients = clinicBookingPatients;
            if (patientId) pickClinicBookingPatient(patientId);
            else inputInlinePatient("clinic-book");
        })
        .catch(err => {
            console.error("Could not load the patient list for booking:", err);
            inlineEl("clinic-book", "suggestion").textContent = "Could not load patients. Close and reopen to retry.";
        });

    setTimeout(() => {
        const box = document.getElementById("clinic-book-search");
        if (box) box.focus();
    }, 50);
}

/** Same inline suggestion as Walk-in & Booking. */
function renderClinicBookingMatches() { inputInlinePatient("clinic-book"); }

function pickClinicBookingPatient(id) {
    const p = clinicBookingPatients && clinicBookingPatients[id];
    if (!p || p.mergedInto || patientIsArchived(p)) return;
    clinicBookingPatient = {
        id: id,
        name: ((p.firstName || "") + " " + (p.lastName || "")).trim() || "Patient",
        label: clinicBookingLabel(p),
        meta: [p.dateOfBirth ? "Born " + p.dateOfBirth : "", p.phoneNumber || "",
               p.recordOnly === true ? "Record only, no online account" : ""].filter(Boolean).join(" · ")
    };
    paintClinicBookingPatient();
}

function changeClinicBookingPatient() {
    clearInlinePatient("clinic-book");
    clinicBookingPatient = null;
    paintClinicBookingPatient();
    const box = document.getElementById("clinic-book-search");
    if (box) { box.value = ""; box.focus(); }
    const out = document.getElementById("clinic-book-results");
    if (out) out.innerHTML = "";
}

/** Show the search, or the patient picked. */
function paintClinicBookingPatient() {
    const find = document.getElementById("clinic-book-find");
    const picked = document.getElementById("clinic-book-picked");
    if (find) find.classList.toggle("hidden", !!clinicBookingPatient);
    if (picked) picked.classList.toggle("hidden", !clinicBookingPatient);
    const name = document.getElementById("clinic-book-picked-name");
    if (name) name.textContent = clinicBookingPatient ? clinicBookingPatient.label : "";
    const meta = document.getElementById("clinic-book-picked-meta");
    if (meta) meta.textContent = clinicBookingPatient ? clinicBookingPatient.meta : "";
}

/** The clinic's active services, in the order staff set in Manage Services. */
function loadClinicBookingServices() {
    const host = document.getElementById("clinic-book-service-list");
    if (!host) return Promise.resolve();
    return getReference("treatments")
        .then(byId => {
            const list = Object.keys(byId || {})
                .filter(id => byId[id] && byId[id].isActive === true)
                .map(id => ({ id: id, name: byId[id].treatmentName || "", order: byId[id].sortOrder }))
                .sort((a, b) => {
                    const ao = Number.isFinite(a.order) ? a.order : 9999;
                    const bo = Number.isFinite(b.order) ? b.order : 9999;
                    return ao - bo || a.name.localeCompare(b.name);
                });
            host.innerHTML = list.length
                ? list.map(t =>
                    '<label class="clinic-book__service"><input type="checkbox" class="clinic-book-service" ' +
                        'value="' + escapeHtml(t.id) + '" data-name="' + escapeHtml(t.name) + '" ' +
                        'onchange="onClinicBookingServiceChanged(this)"><span>' + escapeHtml(t.name) + '</span></label>'
                  ).join("")
                : '<p class="field-hint">No services are set up yet. Add them in Manage Services.</p>';
        })
        .catch(err => {
            console.error("Could not load the services:", err);
            host.innerHTML = '<p class="field-hint">Could not load the services. Close this and try again.</p>';
        });
}

/** The services ticked, as [{ id, name }]. Others is separate. */
function clinicBookingServices() {
    return Array.from(document.querySelectorAll("#clinic-book-service-list .clinic-book-service:checked"))
        .map(input => ({ id: input.value, name: input.dataset.name || "" }));
}

/** Up to three, Others included; the note box shows with Others. */
function onClinicBookingServiceChanged(changed) {
    const other = document.getElementById("clinic-book-other");
    const count = clinicBookingServices().length + Number(!!(other && other.checked));
    if (count > 3 && changed) {
        changed.checked = false;
        showToast("Choose up to three services, including Others.", "warning");
    }
    const wrap = document.getElementById("clinic-book-other-wrap");
    const wantsOther = !!(other && other.checked);
    if (wrap) wrap.classList.toggle("hidden", !wantsOther);
    if (!wantsOther) {
        const note = document.getElementById("clinic-book-other-note");
        if (note) note.value = "";
    }
}

/**
 * Book it. The appointment and its slot lock in one transaction; a time taken
 * meanwhile is refused with a sentence, and the times are loaded again.
 */
function submitClinicBooking(e) {
    if (e) e.preventDefault();
    if (!canBookForPatient() || clinicBookingInFlight) return Promise.resolve();

    const date = (document.getElementById("clinic-book-date") || {}).value || "";
    const time = (document.getElementById("clinic-book-time") || {}).value || "";
    const notes = ((document.getElementById("clinic-book-notes") || {}).value || "").trim();
    const services = clinicBookingServices();
    const other = document.getElementById("clinic-book-other");
    const wantsOther = !!(other && other.checked);
    const otherNote = wantsOther ? ((document.getElementById("clinic-book-other-note") || {}).value || "").trim() : "";

    const refuse = message => { showToast(message, "warning"); return Promise.resolve(); };
    if (!clinicBookingPatient) return refuse("Choose the patient first: type their surname and pick them.");
    if (!services.length && !wantsOther) return refuse("Choose what the appointment is for, or Others.");
    if (services.length + Number(wantsOther) > 3) return refuse("Choose no more than three services.");
    if (wantsOther && !otherNote) return refuse("Write what the patient needs under Others.");
    if (!date) return refuse("Choose the date.");
    if (!time) return refuse("Choose an open time.");

    const patient = clinicBookingPatient;
    const apptData = {
        patientId: patient.id,
        patientName: patient.name,
        dentistId: CLINIC_DENTIST_ID,
        treatmentIds: services.map(s => s.id),
        treatmentNames: services.map(s => s.name),
        otherRequested: wantsOther,
        otherNote: otherNote,
        // The singular pair every older reader uses, as submitBooking() keeps it.
        treatmentId: services.length ? services[0].id : "",
        treatmentName: services.length ? services.map(s => s.name).join(", ") : "Others (see request)",
        appointmentDate: date,
        appointmentTime: time,
        // Approved straight away: the clinic made it.
        status: "Approved",
        notes: notes,
        rescheduleCount: 0,
        createdAt: new Date().toISOString(),
        bookedByClinic: true,
        bookedBy: currentUserId || ""
    };

    const lockRef = db.collection("slot_locks").doc(slotLockId(CLINIC_DENTIST_ID, date, time));
    const apptRef = db.collection("appointments").doc();
    clinicBookingInFlight = true;
    const save = document.getElementById("clinic-book-save");
    if (save) save.disabled = true;

    return db.runTransaction(tx =>
        tx.get(lockRef).then(lockSnap => {
            // Held in the PATIENT's name, as repairSlotLocks() would rebuild it.
            claimSlotInTransaction(tx, lockSnap, lockRef, CLINIC_DENTIST_ID, date, time, patient.id);
            tx.set(apptRef, apptData);
        })
    )
    .then(() => {
        closeModal("modal-clinic-book");
        showToast("Booked " + patient.name + " for " + date + " at " + time + ".", "success");
        if (!document.getElementById("tab-staff-appointments").classList.contains("hidden") && typeof loadStaffAppointments === "function") loadStaffAppointments();
    })
    .catch(err => {
        if (err && err.message === "SLOT_TAKEN") {
            showToast("That time was just booked by someone else. Pick another time.", "warning");
            onBookingDateChanged("clinic-book-date", "clinic-book-time");
            return;
        }
        console.error("Clinic booking failed:", err);
        showToast(err && err.code === "permission-denied"
            ? "This account is not allowed to book for a patient."
            : "The booking was not saved. Check the connection and try again.", "error");
    })
    .finally(() => {
        clinicBookingInFlight = false;
        if (save) save.disabled = false;
    });
}
