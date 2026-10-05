// ─────────────────────────────────────────────────────────────
// DentCare – js/queue.js (Today's clinic queue & walk-in intake)
// ─────────────────────────────────────────────────────────────
//
// The clinic's daily flow, as the clinic asked for it on 2026-09-30 (fewer
// clicks than the first version, which had a check-in and a "Call in" step):
//
//   booked for today, approved  ->  already in the queue, in time order
//   walk-in                     ->  added at the desk, placed in the free time
//   the doctor presses Record Visit on the row  ->  "With the doctor"
//   she saves the visit  ->  the row moves to Seen today, the next is announced
//   the patient pays at the desk
//
// Two ways in. A booking approved for today is listed by itself; nobody has to
// check the patient in (the desk may tap Arrived, which only records the time).
// A walk-in registers at the desk, or is found by surname, and joins the same
// queue with no appointment at all.
//
// ── WHY THE QUEUE IS NOT ITS OWN COLLECTION ──────────────────────────────
//
// A `queue` collection was the obvious shape and is the wrong one here. A
// queue entry becomes a treated visit: it needs a dental chart, a treatment
// log, supplies deducted and a bill. All of that already exists and all of it
// hangs off an appointment document — submitCompleteAppointment() reads an
// appointment, and the billing rules are written against one.
//
// A parallel collection would have meant either duplicating that whole
// transaction for walk-ins, or converting a queue row into an appointment
// half way through the visit. Both are worse than what the queue actually is:
//
//     the queue is a VIEW of today's appointments, in the states that mean
//     "this person is to be seen today" (QUEUE_LISTED_STATUSES)
//
// So a walk-in is an appointment created on the spot, flagged isWalkIn, and
// everything downstream — charting, the bill, the prescription — works with
// no changes at all.
//
// ── DEVELOPMENT NOTE ─────────────────────────────────────────────────────
// The queue statuses below are new, so firestore.rules has to know about them
// before this works against locked-down rules. Nothing here is deployed; see
// progress.md for the deployment-stage checklist.
// ─────────────────────────────────────────────────────────────

/**
 * The states that mean "in the clinic today".
 *
 * Deliberately NOT added to APPOINTMENT_OPEN_STATUSES in js/appointments.js.
 * That list drives two things a queued patient must be kept out of:
 *
 *   - the no-show sweep, which would expire somebody sitting in the waiting
 *     room because their slot time had passed
 *   - patient self-rescheduling, which makes no sense once they have arrived
 */
const QUEUE_STATUSES = ["Awaiting Consultation", "In Consultation"];

/**
 * Everybody the queue lists (2026-09-30): the two in-clinic states above, plus
 * a booking approved for today, which no longer waits to be checked in.
 *
 * QUEUE_STATUSES keeps its own meaning, "physically in the clinic", and its own
 * users: only those two may be moved between each other or removed, and only
 * those two are protected from the no-show sweep by their status alone. An
 * approved booking dated today is protected by appointmentIsExpired() instead.
 */
const QUEUE_LISTED_STATUSES = ["Approved", "Confirmed", "Awaiting Consultation", "In Consultation"];

/** Live listener for the queue, so both dashboards update as staff work. */
let queueUnsubscribe = null;

/** Last rendered queue, so an action can find its row without a re-read. */
let currentQueue = [];

/** The latest snapshot of today's appointments, kept so the clock can re-sort it. */
let queueSnapshot = null;

/** The date the listener is watching, so a screen left open overnight moves on. */
let queueWatchedDate = "";

/** Re-sorts the queue once a minute: a booking becomes due as the clock moves. */
let queueTickTimer = null;

/** Who was next the last time the queue was drawn; undefined until it has loaded. */
let queueNextId;

/**
 * Put a patient into today's queue.
 *
 * Creates an appointment dated today with a queue status. `appointmentTime`
 * is filled with the current time in the clinic's own slot format ("02:00 PM")
 * rather than left blank, because every reader in the app — the tables, the
 * date formatter, the expiry logic — expects that field to be a readable time.
 *
 * @param {object} opts  patientId, patientName, isWalkIn, treatmentIds/Names,
 *                       otherRequested, otherNote
 */
function enqueuePatient(opts) {
    const now = new Date();

    const entry = {
        patientId: opts.patientId,
        patientName: opts.patientName || "",
        dentistId: "gapit_dentist_uid",

        appointmentDate: localDateKey(),
        appointmentTime: formatClockAsSlot(now),

        status: "Awaiting Consultation",

        // What the queue needs that an appointment does not
        isWalkIn: !!opts.isWalkIn,
        queuedAt: now.toISOString(),
        checkedInBy: currentUserId || "",

        // Services. A walk-in has usually not chosen any yet — Dr. Reina
        // decides after examining — so empty arrays are the normal case, and
        // the completion form is where the real answer gets recorded.
        treatmentIds: opts.treatmentIds || [],
        treatmentNames: opts.treatmentNames || [],
        treatmentId: (opts.treatmentIds && opts.treatmentIds[0]) || "",
        treatmentName: (opts.treatmentNames && opts.treatmentNames.length)
            ? opts.treatmentNames.join(", ")
            : (opts.isWalkIn ? "Walk-in — to be assessed" : "Consultation"),

        otherRequested: !!opts.otherRequested,
        otherNote: opts.otherNote || "",

        notes: opts.notes || "",
        rescheduleCount: 0,
        createdAt: now.toISOString()
    };

    // A patient queuing THEMSELVES (the walk-in registration on the tablet)
    // gets the one id firestore.rules allows for it: walkin_{uid}_{YYYYMMDD}.
    // That makes it once per patient per day — a second attempt that day is an
    // update, and refused. Staff queuing somebody use an ordinary auto id, so a
    // patient who leaves and comes back can still be added again by the desk.
    //
    // auth.currentUser, not currentUserId: during registration the new account
    // is signed in before app.js has finished reading its role and filling the
    // globals, and a stale "" there would send this down the staff path — an
    // auto id the rules refuse for a patient's own walk-in.
    const signedInUid = (typeof auth !== "undefined" && auth.currentUser) ? auth.currentUser.uid : "";
    const selfQueuing = opts.patientId && opts.patientId === signedInUid && currentRole !== "dentist" &&
        currentRole !== "staff" && currentRole !== "admin";

    // ── Once in the queue, however many people press Add (2026-09-17) ───────
    //
    // The desk checks the live queue before calling this, but two members of
    // staff pressing "Add to queue" for the same patient in the same second
    // both passed that check and made two queue rows.
    //
    // No rules change was needed to close it. The patient's own record is the
    // gate: every add reads it inside a transaction, and the desk's add writes
    // queuedOn / queuedAppointmentId onto it. Firestore lets only one of two
    // transactions that touch the same document commit as read; the other is
    // re-run, sees the patient already queued today, and stops. The desk also
    // reads the patient's own walk-in document, so the tablet and the desk
    // cannot queue the same person twice either. A patient who was seen and
    // then comes back later the same day can still be added again, because
    // only an entry still in the queue counts.
    const today = entry.appointmentDate;
    const patientRef = db.collection("patients").doc(opts.patientId);
    const selfRef = db.collection("appointments").doc("walkin_" + opts.patientId + "_" + today.replace(/-/g, ""));
    const stillQueued = snap => !!(snap && snap.exists && QUEUE_STATUSES.indexOf(snap.data().status) !== -1);
    const alreadyQueued = () => {
        const err = new Error((opts.patientName || "This patient") + " is already in today's queue.");
        err.code = "already-queued";
        return err;
    };

    if (selfQueuing) {
        // A patient's own walk-in keeps the one id the rules allow for it,
        // walkin_{uid}_{YYYYMMDD}: once per patient per day. Reading their own
        // record in the same transaction is what makes a desk add running at
        // the same moment see this one, and vice versa.
        const selfQueue = checkDeskEntry => db.runTransaction(tx => tx.get(patientRef).then(pSnap => {
            const p = pSnap.exists ? pSnap.data() : {};
            const deskId = checkDeskEntry && p.queuedOn === today ? p.queuedAppointmentId : "";
            const deskRead = deskId
                ? tx.get(db.collection("appointments").doc(deskId))
                : Promise.resolve(null);
            return deskRead.then(deskSnap => {
                if (stillQueued(deskSnap)) throw alreadyQueued();
                tx.set(selfRef, entry);
                return { id: selfRef.id };
            });
        }));
        // A patient may read only appointments that exist and are theirs. If
        // the desk's entry was deleted since, that read is refused — so try
        // once more without it. Their own once-a-day id still holds.
        return selfQueue(true).catch(err =>
            err && err.code === "permission-denied" ? selfQueue(false) : Promise.reject(err));
    }

    const newRef = db.collection("appointments").doc();
    return db.runTransaction(tx =>
        Promise.all([tx.get(patientRef), tx.get(selfRef)]).then(([pSnap, selfSnap]) => {
            if (stillQueued(selfSnap)) throw alreadyQueued();
            const p = pSnap.exists ? pSnap.data() : {};
            const deskId = p.queuedOn === today ? p.queuedAppointmentId : "";
            const deskRead = deskId
                ? tx.get(db.collection("appointments").doc(deskId))
                : Promise.resolve(null);
            return deskRead.then(deskSnap => {
                if (stillQueued(deskSnap)) throw alreadyQueued();
                tx.set(newRef, entry);
                tx.update(patientRef, { queuedOn: today, queuedAppointmentId: newRef.id });
                return { id: newRef.id };
            });
        })
    );
}

/**
 * The current time as one of the clinic's slot labels ("02:05 PM").
 *
 * Matches what tab_manage_schedule.php writes, so parseSlotMinutes() and the
 * appointment tables read a queue entry exactly like a booked one.
 */
function formatClockAsSlot(d) {
    const date = d || new Date();
    const h24 = date.getHours();
    const mm = String(date.getMinutes()).padStart(2, "0");
    const suffix = h24 < 12 ? "AM" : "PM";
    const h12 = (h24 % 12) === 0 ? 12 : (h24 % 12);
    return String(h12).padStart(2, "0") + ":" + mm + " " + suffix;
}

/**
 * Watch today's queue and redraw as it changes.
 *
 * Live, unlike most lists in this app, and it has to be: the doctor and the
 * front desk are looking at the same queue on two machines at once. A stale
 * queue means calling a patient who has already been seen, or two people
 * being called at the same time.
 *
 * Filtered by date in the query and by status in the browser. A composite
 * index would be needed for date + status + order, and needing somebody to
 * build an index in the console before the waiting room works is a bad trade
 * for a list that is a few rows long.
 */
function watchClinicQueue() {
    unwatchClinicQueue();

    const host = queueEl("queue-list");
    if (!host) return;

    host.innerHTML = '<p class="queue-empty">Loading today\'s queue…</p>';

    queueWatchedDate = localDateKey();
    queueNextId = undefined;       // nobody is announced on the first load

    queueUnsubscribe = db.collection("appointments")
        .where("appointmentDate", "==", queueWatchedDate)
        .onSnapshot(applyQueueSnapshot, err => {
            console.error("Queue listener failed:", err);
            host.innerHTML = '<p class="queue-empty">Could not load the queue. ' +
                             'If this is a fresh environment, the Firestore rules may not ' +
                             'know the queue statuses yet.</p>';
        });

    // The order depends on the clock as well as on the data: at 10:00 the
    // 10:00 booking moves ahead of a waiting walk-in, with no write anywhere.
    queueTickTimer = setInterval(queueTick, 60 * 1000);
}

/**
 * Draw everything from a snapshot of today's appointments.
 *
 * Listed: every appointment dated today that is still to be seen. The status
 * read is the effective one, so a request that lapsed unapproved is left out
 * even before a sweep has written "Expired" onto it.
 */
function applyQueueSnapshot(snap) {
    queueSnapshot = snap;

    currentQueue = [];
    snap.forEach(doc => {
        const a = { id: doc.id, ...doc.data() };
        const shown = typeof effectiveAppointmentStatus === "function"
            ? effectiveAppointmentStatus(a)
            : a.status;
        if (QUEUE_LISTED_STATUSES.indexOf(shown) !== -1) currentQueue.push(a);
    });

    // Appointments first, walk-ins into the gaps. See sortQueueForCalling().
    sortQueueForCalling(currentQueue);

    renderClinicQueue();
    renderQueuePendingNotice(snap);
    renderQueueSeenToday(snap);
    announceNextInQueue();
}

/** Once a minute while the queue is on screen. */
function queueTick() {
    // Left open past midnight: watch the new day instead of yesterday's.
    if (localDateKey() !== queueWatchedDate) {
        watchClinicQueue();
        return;
    }
    if (queueSnapshot) applyQueueSnapshot(queueSnapshot);
}

/**
 * Say who is next, when that changes.
 *
 * The first patient not already in the chair is the one to call. Both screens
 * run this off the same live data, so the desk hears the same name the doctor
 * does. Silent on the first load: a name announced the moment the tab opens
 * is noise, not news.
 */
function announceNextInQueue() {
    const next = currentQueue.find(q => q.status !== "In Consultation") || null;
    const nextId = next ? next.id : null;
    const loadedBefore = queueNextId !== undefined;
    const changed = nextId !== queueNextId;
    queueNextId = nextId;

    if (!loadedBefore || !changed || !next || typeof showToast !== "function") return;
    showToast("Next: " + (next.patientName || "Patient") +
              " (" + (next.isWalkIn ? "walk-in" : (next.appointmentTime || "booked")) + ")", "info");
}

// ─────────────────────────────────────────────────────────────
// Who is next — appointments first, walk-ins fill the gaps
// ─────────────────────────────────────────────────────────────
//
// A booked patient reserved a slot; a walk-in did not. So a walk-in must never
// push a booking back, and must never be left behind either — it takes every
// gap, early finish and no-show. That is the clinic's own rule, written down.
//
// Four tiers, in the order the doctor calls them:
//
//   0  IN CHAIR    whoever is being treated right now, so the list matches
//                  the room
//   1  DUE         a booked patient whose slot time has arrived
//   2  STANDBY     a walk-in, longest wait first
//   3  EARLY       a booked patient who arrived before their slot — they wait
//                  for their own time, and a walk-in who has been sitting
//                  there longer goes ahead of them
//
// Tier 3 is the part that makes this fair. Without it, a 10:00 patient who
// turns up at 09:15 would jump ahead of a walk-in who arrived at 09:00 and is
// still waiting, which is neither what the room sees nor what was promised.

const QUEUE_TIER_IN_CHAIR = 0;
const QUEUE_TIER_DUE      = 1;
const QUEUE_TIER_STANDBY  = 2;
const QUEUE_TIER_EARLY    = 3;

/** Minutes since midnight, right now. */
function queueNowMinutes() {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
}

/**
 * Read a slot such as "10:00 AM" as minutes since midnight.
 *
 * Delegates to parseSlotMinutes() in js/appointments.js, which already knows
 * that the app stores 12-hour times. Guarded because queue.js also loads on
 * the public page, where appointments.js does not.
 */
function queueSlotMinutes(value) {
    if (typeof parseSlotMinutes === "function") return parseSlotMinutes(value);
    return null;
}

/**
 * Which tier a queue entry belongs to. See the table above.
 *
 * A booking whose time cannot be read counts as DUE rather than EARLY: the
 * safe failure is to offer the patient to the doctor, not to hide them at the
 * bottom of the list.
 */
function queueTierOf(entry, nowMins) {
    if (entry.status === "In Consultation") return QUEUE_TIER_IN_CHAIR;
    if (entry.isWalkIn) return QUEUE_TIER_STANDBY;

    const slot = queueSlotMinutes(entry.appointmentTime);
    if (slot === null) return QUEUE_TIER_DUE;
    return slot <= nowMins ? QUEUE_TIER_DUE : QUEUE_TIER_EARLY;
}

/**
 * Sort the queue into calling order.
 *
 * Within a tier: booked patients by their slot, walk-ins by how long they have
 * been waiting. queuedAt breaks every remaining tie so the order is stable and
 * never jitters between snapshots.
 */
function sortQueueForCalling(list) {
    const nowMins = queueNowMinutes();

    return list.sort((a, b) => {
        const ta = queueTierOf(a, nowMins);
        const tb = queueTierOf(b, nowMins);
        if (ta !== tb) return ta - tb;

        if (ta === QUEUE_TIER_DUE || ta === QUEUE_TIER_EARLY) {
            const sa = queueSlotMinutes(a.appointmentTime);
            const sb = queueSlotMinutes(b.appointmentTime);
            if (sa !== null && sb !== null && sa !== sb) return sa - sb;
        }

        return String(a.queuedAt || "").localeCompare(String(b.queuedAt || ""));
    });
}

/**
 * The badge on a queue row: what kind of patient this is, and where they stand.
 *
 * @param {object} entry
 * @param {boolean} isNextUp  true for the first patient not already in the chair
 */
function queueTagHtml(entry, isNextUp) {
    if (entry.isWalkIn) {
        return isNextUp
            ? '<span class="queue-tag queue-tag--next">Walk-in · Next</span>'
            : '<span class="queue-tag queue-tag--walkin">Walk-in · Standby</span>';
    }

    const slot = entry.appointmentTime
        ? " · " + escapeHtml(entry.appointmentTime)
        : "";
    // Next applies to bookings and walk-ins alike (2026-09-30).
    return isNextUp
        ? '<span class="queue-tag queue-tag--next">Appointment' + slot + ' · Next</span>'
        : '<span class="queue-tag queue-tag--appointment">Appointment' + slot + '</span>';
}

/**
 * The clock time a patient actually arrived.
 *
 * This used to print appointmentTime, which for a booked patient is the time
 * they were DUE, not the time they walked in — so a patient who arrived an
 * hour early read as though they had been waiting since their slot. queuedAt
 * is stamped at check-in and is the honest answer.
 */
function queueArrivalLabel(entry) {
    if (!entry.queuedAt) return "--";
    const d = new Date(entry.queuedAt);
    if (isNaN(d.getTime())) return "--";
    return formatClockAsSlot(d);
}

/** Stop watching. Called when leaving the tab, so listeners do not stack. */
function unwatchClinicQueue() {
    if (queueUnsubscribe) {
        queueUnsubscribe();
        queueUnsubscribe = null;
    }
    if (queueTickTimer) {
        clearInterval(queueTickTimer);
        queueTickTimer = null;
    }
    queueSnapshot = null;
}

/** Find a queue element inside whichever role layout is on screen. */
function queueEl(cls) {
    return document.querySelector(".app-layout:not(.hidden) ." + cls);
}

// ─────────────────────────────────────────────────────────────
// Returning walk-in — find an existing patient, queue them
// ─────────────────────────────────────────────────────────────

/**
 * Find a returning patient by surname, as it is typed, so a returning walk-in
 * is added to today's queue instead of registering a second time.
 *
 * ── WHY SURNAME ONLY, AND WHY THAT IS ACCEPTABLE HERE (2026-09-30) ─────────
 *
 * This used to ask for the exact last name AND the date of birth, and the
 * comment here argued for it: a surname alone lists every Santos in the book
 * for whoever is holding the screen. The clinic found it slow at the desk (the
 * name had to match letter for letter, capitals included) and asked for the
 * surname alone, with matches appearing as they type.
 *
 * That is acceptable because of WHERE this runs. It is the queue tab of a
 * signed-in staff or dentist account, which firestore.rules already lets read
 * every patient, and which shows the same names on Patient History one click
 * away. Nothing new is exposed. What must not happen is this search on the
 * public tablet, and it still cannot: a patient who has been here before is
 * told to hand the tablet back (partials/modal-walkin.php), and the rules
 * refuse a patient account the read.
 *
 * No query per keystroke: the patient list is read once through
 * getReference("patients") (live while this tab is open, so somebody
 * registered a moment ago is found) and matched in the browser.
 */

/** Lower case, accents removed, single spaces: "Peña" and "pena" are the same. */
function searchKey(value) {
    return String(value == null ? "" : value).toLowerCase()
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/\s+/g, " ").trim();
}

/**
 * The patients a typed surname could mean, best match first.
 *
 *   rank 1  the last name starts with what was typed
 *   rank 2  "first last" or "last first" starts with it
 *   rank 3  any part of the name contains it
 *
 * Within a rank: by last name, then first name. A patient marked deceased or
 * inactive is left out and counted, so the desk is told why a name they expect
 * is missing.
 *
 * @param  {Object} patientsById  { id: patient }
 * @param  {string} query         what was typed; under two characters finds nothing
 * @param  {number} [limit]       most rows to return (8)
 * @return {{hits: Object[], more: number, archived: number}}
 */
function matchReturningPatients(patientsById, query, limit) {
    const out = { hits: [], more: 0, archived: 0 };
    const q = searchKey(query);
    if (q.length < 2) return out;

    const ranked = [];
    Object.keys(patientsById || {}).forEach(id => {
        const p = patientsById[id] || {};
        // A record that moved onto an online account is found as the account (R17).
        if (p.mergedInto) return;
        const last = searchKey(p.lastName);
        const first = searchKey(p.firstName);
        const middle = searchKey(p.middleName);

        let rank = 0;
        if (last.indexOf(q) === 0) rank = 1;
        else if ((first + " " + last).indexOf(q) === 0 || (last + " " + first).indexOf(q) === 0) rank = 2;
        else if (last.indexOf(q) !== -1 || first.indexOf(q) !== -1 || middle.indexOf(q) !== -1) rank = 3;
        if (!rank) return;

        if (typeof patientIsArchived === "function" && patientIsArchived(p)) {
            out.archived++;
            return;
        }
        ranked.push({ rank: rank, last: last, first: first, hit: Object.assign({ id: id }, p) });
    });

    ranked.sort((a, b) => a.rank - b.rank || a.last.localeCompare(b.last) || a.first.localeCompare(b.first));

    const max = limit || 8;
    out.hits = ranked.slice(0, max).map(r => r.hit);
    out.more = Math.max(0, ranked.length - out.hits.length);
    return out;
}

/** Which result row the arrow keys are on. */
let walkinLookupActive = 0;

/** The patient list the results were drawn from, so a redraw needs no read. */
let walkinLookupPatients = null;

/** "CASANADA, Teresita F." — surname first, the way the paper cards are filed. */
function walkinHitName(p) {
    const last = String(p.lastName || "").trim().toUpperCase();
    const first = String(p.firstName || "").trim();
    const middle = String(p.middleName || "").trim();
    return (last + (first ? ", " + first : "") + (middle ? " " + middle.charAt(0).toUpperCase() + "." : "")) || "Patient";
}

/** "First Last", the name a queue entry is stored under. */
function walkinQueueName(p) {
    return ((p.firstName || "") + " " + (p.lastName || "")).trim() || "Patient";
}

/** The surname box changed: load the list if it is not here yet, then match. */
function onWalkinLookupInput() {
    const box = queueEl("walkin-lookup__last");
    const out = queueEl("walkin-lookup__results");
    if (!box || !out) return;

    walkinLookupActive = 0;

    if (searchKey(box.value).length < 2) {
        out.innerHTML = "";
        box.setAttribute("aria-expanded", "false");
        box.removeAttribute("aria-activedescendant");
        return;
    }

    if (walkinLookupPatients) renderWalkinLookup();
    else out.innerHTML = '<p class="queue-empty">Searching&hellip;</p>';

    // Live while this tab is open, so a patient registered a moment ago, on
    // this machine or another, is in the list. The pickers' own redraw is kept.
    if (typeof watchReference === "function") {
        watchReference("patients", byId => {
            if (typeof setChartPatients === "function") setChartPatients(byId);
            if (typeof redrawOpenPatientPicker === "function") redrawOpenPatientPicker();
            walkinLookupPatients = byId;
            renderWalkinLookup();
        });
    }

    getReference("patients")
        .then(byId => {
            walkinLookupPatients = byId;
            renderWalkinLookup();
        })
        .catch(err => {
            console.error("Patient lookup failed:", err);
            out.innerHTML = '<p class="queue-empty">Could not load the patient list just now. ' +
                            'Check the connection and type the name again.</p>';
        });
}

/** Draw the matches for whatever is in the box now. */
function renderWalkinLookup() {
    const box = queueEl("walkin-lookup__last");
    const out = queueEl("walkin-lookup__results");
    if (!box || !out || !walkinLookupPatients) return;

    const typed = box.value.trim();
    if (searchKey(typed).length < 2) {
        out.innerHTML = "";
        box.setAttribute("aria-expanded", "false");
        box.removeAttribute("aria-activedescendant");
        return;
    }

    const found = matchReturningPatients(walkinLookupPatients, typed, 8);
    box.setAttribute("aria-expanded", found.hits.length ? "true" : "false");

    if (!found.hits.length && found.archived) {
        box.removeAttribute("aria-activedescendant");
        out.innerHTML =
            '<p class="queue-empty">That patient is marked as deceased or inactive, ' +
            'so they cannot be added to the queue. Dr. Gapit can change that on ' +
            'Patient History if it was a mistake.</p>';
        return;
    }

    if (!found.hits.length) {
        // Says what to do next. "No results" on its own leaves staff guessing
        // whether to register the patient or try again.
        box.removeAttribute("aria-activedescendant");
        out.innerHTML =
            '<p class="queue-empty">No patient matches &ldquo;' + escapeHtml(typed) + '&rdquo;. ' +
            'Check the spelling, or register them as a new patient.</p>' +
            (currentRole !== "dentist" && typeof openStaffPatientRegistration === "function"
                ? '<button type="button" class="btn-secondary btn-sm walkin-lookup__register" ' +
                      'onclick="openStaffPatientRegistration()">Register a new patient</button>'
                : '');
        return;
    }

    if (walkinLookupActive >= found.hits.length) walkinLookupActive = found.hits.length - 1;
    const idBase = (out.id || "walkin-results") + "-hit-";

    out.innerHTML = found.hits.map((p, i) => {
        const already = currentQueue.some(q => q.patientId === p.id);
        const age = typeof getPatientAge === "function" ? getPatientAge(p) : null;
        const seen = p.lastVisitDate ? new Date(p.lastVisitDate + "T00:00:00") : null;
        const meta = [
            age === null ? "" : "Age " + age,
            seen && !isNaN(seen.getTime())
                ? "Last visit " + seen.toLocaleDateString("en-PH", { dateStyle: "medium" })
                : "",
            p.phoneNumber || ""
        ].filter(Boolean).join(" · ");

        return '<div class="walkin-hit' + (i === walkinLookupActive ? ' is-active' : '') + '" role="option" ' +
                    'id="' + escapeHtml(idBase + i) + '" aria-selected="' + (i === walkinLookupActive) + '" ' +
                    'data-patient-id="' + escapeHtml(p.id) + '" data-patient-name="' + escapeHtml(walkinQueueName(p)) + '">' +
            '<span class="walkin-hit__name">' + escapeHtml(walkinHitName(p)) + '</span>' +
            (meta ? '<span class="walkin-hit__meta">' + escapeHtml(meta) + '</span>' : '') +
            (already
                ? '<span class="badge badge-in-consultation">Already in the queue</span>'
                : '<button type="button" class="btn-secondary btn-sm" tabindex="-1" ' +
                      'onclick="queueReturningPatient(\'' + escapeJsAttr(p.id) + '\', \'' +
                      escapeJsAttr(walkinQueueName(p)) + '\')">Add to queue</button>') +
        '</div>';
    }).join("") +
    (found.more
        ? '<p class="walkin-lookup__more">' + found.more + ' more. Keep typing to narrow it down.</p>'
        : '');

    box.setAttribute("aria-activedescendant", idBase + walkinLookupActive);
}

/** Up and Down move the highlight; Escape clears the results. */
function onWalkinLookupKey(event) {
    const out = queueEl("walkin-lookup__results");
    if (!out) return;
    const rows = out.querySelectorAll(".walkin-hit");

    if (event.key === "Escape") {
        out.innerHTML = "";
        return;
    }
    if (!rows.length || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;

    event.preventDefault();
    walkinLookupActive = (walkinLookupActive + (event.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length;
    renderWalkinLookup();
}

/** Enter in the surname box: add the highlighted patient. */
function submitWalkinLookup(event) {
    if (event) event.preventDefault();
    const out = queueEl("walkin-lookup__results");
    if (!out) return;
    const row = out.querySelectorAll(".walkin-hit")[walkinLookupActive];
    if (!row) return;
    queueReturningPatient(row.getAttribute("data-patient-id"), row.getAttribute("data-patient-name"));
}

/**
 * Put a found patient into today's queue as a walk-in.
 *
 * Goes in as a walk-in on purpose: they reserved nothing, so they wait on
 * standby and take the gaps, exactly like any other walk-in.
 */
function queueReturningPatient(patientId, patientName) {
    if (!patientId) return;

    if (currentQueue.some(q => q.patientId === patientId)) {
        if (typeof showToast === "function") {
            showToast(patientName + " is already in today's queue.", "info");
        }
        return;
    }

    enqueuePatient({ patientId: patientId, patientName: patientName, isWalkIn: true })
        .then(() => {
            // Clear the box and the matches, ready for the next person.
            const out = queueEl("walkin-lookup__results");
            const box = queueEl("walkin-lookup__last");
            if (out) out.innerHTML = "";
            if (box) {
                box.value = "";
                box.setAttribute("aria-expanded", "false");
                box.removeAttribute("aria-activedescendant");
            }
            walkinLookupActive = 0;

            if (typeof showToast === "function") {
                showToast(patientName + " added to today's queue.", "success");
            }
        })
        .catch(err => {
            if (err && err.code === "already-queued") {
                // Somebody else added them a moment ago. Not a failure.
                if (typeof showToast === "function") showToast(err.message, "info");
                return;
            }
            console.error("Could not queue returning patient:", err);
            if (typeof showToast === "function") {
                showToast("Could not add them to the queue. Please try again.", "error");
            }
        });
}

/**
 * Today's requests that nobody has approved yet.
 *
 * They are not in the queue: an unapproved request is not a booking. The
 * panel says how many there are and takes the reader to where they are
 * approved, so a patient who turns up for one is not a surprise.
 */
function renderQueuePendingNotice(snap) {
    const host = queueEl("queue-pending");
    if (!host) return;

    let pending = 0;
    snap.forEach(doc => {
        const a = doc.data();
        const shown = typeof effectiveAppointmentStatus === "function"
            ? effectiveAppointmentStatus(a)
            : a.status;
        if (shown === "Pending") pending++;
    });

    if (!pending) {
        host.innerHTML = '<p class="queue-empty">No booking for today is waiting for approval.</p>';
        return;
    }

    host.innerHTML =
        '<div class="queue-pending__notice">' +
            '<p class="queue-pending__text">' + pending +
                (pending === 1
                    ? ' booking for today is waiting for approval.'
                    : ' bookings for today are waiting for approval.') +
                ' It joins the queue once it is approved.</p>' +
            '<button type="button" class="btn-secondary btn-sm" ' +
                'onclick="openPendingFromQueue()">Go to appointments</button>' +
        '</div>';
}

/** The Appointments tab, on the requests still waiting. */
function openPendingFromQueue() {
    if (currentRole === "dentist") {
        if (typeof switchDentistTab === "function") {
            switchDentistTab("tab-dentist-appointments", document.getElementById("nav-dentist-appointments"));
        }
        return;
    }
    if (typeof switchStaffTab === "function") {
        switchStaffTab("tab-staff-appointments", document.getElementById("nav-staff-appointments"));
    }
    if (typeof filterStaffAppointments === "function") filterStaffAppointments("Pending");
}

/**
 * Seen today: the visits already completed, newest first.
 *
 * The doctor can reopen what she wrote (the existing visit viewer). The front
 * desk sees who and when, which is what it needs to take the payment.
 */
function renderQueueSeenToday(snap) {
    const host = queueEl("queue-seen");
    if (!host) return;

    const seen = [];
    snap.forEach(doc => {
        const a = { id: doc.id, ...doc.data() };
        if (a.status === "Completed") seen.push(a);
    });

    if (!seen.length) {
        host.innerHTML = '<p class="queue-empty">Nobody has been seen yet today.</p>';
        return;
    }

    seen.sort((a, b) => String(b.completedAt || "").localeCompare(String(a.completedAt || "")));
    const isDentist = currentRole === "dentist";

    host.innerHTML = seen.map(a => {
        const at = a.completedAt ? new Date(a.completedAt) : null;
        const when = at && !isNaN(at.getTime()) ? formatClockAsSlot(at) : "--";
        return '<div class="queue-seen__row">' +
            '<span class="queue-seen__time">' + escapeHtml(when) + '</span>' +
            '<span class="queue-seen__name">' + escapeHtml(a.patientName || "Patient") + '</span>' +
            '<span class="queue-seen__svc">' + appointmentServicesHtml(a) + '</span>' +
            (isDentist
                ? '<button type="button" class="btn-secondary btn-sm" ' +
                      'onclick="viewVisitRecord(\'' + escapeJsAttr(a.id) + '\')">View</button>'
                : '') +
        '</div>';
    }).join("");
}

/**
 * Draw the queue itself.
 *
 * What each role can do on a row (2026-09-30):
 *   dentist  Open Patient on every row (Record Visit is on the patient's record,
 *            js/clinic-intake.js); No-show on a booking; Remove on a walk-in
 *   staff    Arrived on a booking not yet marked; No-show on a booking; Remove
 *            on a walk-in. Staff never record a visit.
 * A row in the chair shows "With the doctor" and Back to waiting.
 */
function renderClinicQueue() {
    const host = queueEl("queue-list");
    if (!host) return;

    if (!currentQueue.length) {
        host.innerHTML = '<p class="queue-empty">The queue is empty. ' +
                         'Nobody is booked or waiting to be seen.</p>';
        return;
    }

    // The first row that is not already in the chair is the one the doctor
    // sees next. Tagged so the desk and the waiting room can tell whose turn
    // it is, whether that is a booking or a walk-in.
    const nextUpIndex = currentQueue.findIndex(q => q.status !== "In Consultation");
    const isDentist = currentRole === "dentist";
    const button = (label, onclick) =>
        '<button type="button" class="btn-secondary btn-sm" onclick="' + onclick + '">' + label + '</button>';

    host.innerHTML = currentQueue.map((a, i) => {
        const id = escapeJsAttr(a.id);
        const inChair = (a.status === "In Consultation");
        const booked = !a.isWalkIn;
        // A booking is "arrived" once it is in one of the two in-clinic states.
        const arrived = QUEUE_STATUSES.indexOf(a.status) !== -1;
        const waiting = minutesWaiting(a);

        const meta = (booked && !arrived)
            ? 'Booked for ' + escapeHtml(a.appointmentTime || "--")
            : 'Arrived ' + escapeHtml(queueArrivalLabel(a)) +
              (waiting !== null && !inChair ? ' · waiting ' + waiting + ' min' : '');

        let actions = "";
        if (inChair) actions += '<span class="badge badge-in-consultation">With the doctor</span>';
        if (isDentist) {
            actions += '<button type="button" class="btn-sm queue-card__record" ' +
                       'onclick="openPatientFromQueue(\'' + id + '\')">Open Patient</button>';
        }
        if (inChair) {
            actions += button("Back to waiting", "setQueueStatus('" + id + "', 'Awaiting Consultation')");
        } else {
            if (!isDentist && booked && !arrived) actions += button("Arrived", "checkInPatient('" + id + "')");
            actions += booked
                ? button("No-show", "markNoShow('" + id + "')")
                : button("Remove", "removeFromQueue('" + id + "')");
        }

        return '<div class="queue-card' + (inChair ? " queue-card--active" : "") + '">' +
            '<span class="queue-card__pos">' + (i + 1) + '</span>' +

            '<span class="queue-card__body">' +
                '<span class="queue-card__name">' +
                    escapeHtml(a.patientName || "Patient") +
                    queueTagHtml(a, i === nextUpIndex) +
                '</span>' +
                '<span class="queue-card__svc">' + appointmentServicesHtml(a) + '</span>' +
                '<span class="queue-card__meta">' + meta + '</span>' +
            '</span>' +

            '<span class="queue-card__actions">' + actions + '</span>' +
        '</div>';
    }).join("");
}

/**
 * Record Visit, pressed on a queue row. Dentist only.
 *
 * Puts the patient in the chair ("With the doctor" on both screens) and opens
 * the same visit form Daily Appointments uses. Saving that form completes the
 * visit, and the row leaves the queue by itself.
 *
 * The status is changed on the live record, from one of the four listed states
 * only: a row this screen still shows after the desk marked a no-show, or after
 * the patient cancelled from home, is refused and says why, and no form opens.
 */
function recordVisitFromQueue(apptId) {
    if (currentRole !== "dentist") return;
    const row = currentQueue.find(a => a.id === apptId);
    if (!row) return;

    const now = new Date().toISOString();
    changeAppointmentStatus(apptId, {
        status: "In Consultation",
        consultationStartedAt: row.consultationStartedAt || now,
        queuedAt: row.queuedAt || now
    }, QUEUE_LISTED_STATUSES)
    .then(() => {
        // The visit form reads the appointment it was opened for from here.
        if (typeof lastLoadedAppointments === "object" && lastLoadedAppointments) {
            lastLoadedAppointments[apptId] = row;
        }
        openCompletionModal(row.id, row.patientId, row.patientName || "Patient",
                            row.treatmentId || "", row.treatmentName || "");
    })
    .catch(err => {
        if (err && err.code === RECORD_CHANGED) {
            showToast(err.message, "warning");
            return;
        }
        console.error("Could not start the visit:", err);
        showToast("Could not open the visit. Check your connection and try again.", "error");
    });
}

/** How long this patient has been waiting, in whole minutes. */
function minutesWaiting(a) {
    if (!a.queuedAt) return null;
    const since = new Date(a.queuedAt).getTime();
    if (isNaN(since)) return null;
    return Math.max(0, Math.round((Date.now() - since) / 60000));
}

/**
 * A booked patient has arrived ("Arrived" on a queue row).
 *
 * Optional since 2026-09-30: the booking is already in the queue. One tap
 * records when the patient actually turned up, so the row reads "Arrived …
 * waiting … min" instead of "Booked for …". It does not touch the booking's
 * date or time, so the schedule still records when they were due.
 */
function checkInPatient(apptId) {
    // Only a booking still waiting to be seen. A patient who cancelled from home
    // a minute ago must not reappear in the waiting room (2026-09-17).
    changeAppointmentStatus(apptId, {
        status: "Awaiting Consultation",
        queuedAt: new Date().toISOString(),
        checkedInBy: currentUserId || ""
    }, ["Approved", "Confirmed"])
    .then(() => showToast("Marked as arrived.", "success"))
    .catch(err => {
        if (err && err.code === RECORD_CHANGED) {
            showToast(err.message, "warning");
            return;
        }
        console.error("Check-in failed:", err);
        showToast("Could not mark that patient as arrived. Try again.", "error");
    });
}

/** Move a queue entry between the two in-clinic states. */
function setQueueStatus(apptId, status) {
    if (QUEUE_STATUSES.indexOf(status) === -1) return;

    // Only between the two in-clinic states. The dangerous case is a visit the
    // doctor has just completed: moved back to the queue from a stale screen,
    // it would no longer read as Completed, and could be completed — billed,
    // and taken out of stock — a second time.
    changeAppointmentStatus(apptId, { status: status }, QUEUE_STATUSES)
        .catch(err => {
            if (err && err.code === RECORD_CHANGED) {
                showToast(err.message, "warning");
                return;
            }
            console.error("Could not update the queue:", err);
            showToast("Could not update the queue.", "error");
        });
}

/**
 * Take somebody out of the queue without treating them.
 *
 * They left, or were added by mistake. Recorded as Cancelled rather than
 * deleted: a patient who waited and then gave up is something the clinic
 * should be able to see later, and deleting the row hides it.
 */
async function removeFromQueue(apptId) {
    let entry = currentQueue.find(a => a.id === apptId);
    const who = entry ? (entry.patientName || "this patient") : "this patient";

    if (!(await confirmDialog("Remove " + who + " from today's queue? Use this if they left or were " +
                 "added by mistake. It does not record a treatment.",
                 { title: "Remove from queue?", confirmLabel: "Remove", tone: "danger" }))) return;
    // The queue may have changed while the dialog was open.
    entry = currentQueue.find(a => a.id === apptId) || entry;

    // Only somebody still in the queue: never a visit completed meanwhile,
    // which would otherwise be recorded as Cancelled and lose its hour.
    changeAppointmentStatus(apptId, {
        status: "Cancelled",
        removedFromQueueAt: new Date().toISOString(),
        removedFromQueueBy: currentUserId || ""
    }, QUEUE_STATUSES)
    .then(live => {
        showToast("Removed from the queue.", "info");
        // The live record, not the queue row this screen remembered.
        entry = live || entry;

        // Give the hour back, but only for a BOOKED patient who was checked in
        // and then left. A walk-in never held a slot to return — see
        // enqueuePatient(), which deliberately takes no lock, because counting
        // an arrival time as a booking used to delete a real bookable hour from
        // the patient-facing form.
        //
        // Guarded by typeof because this file also loads on index.php, where
        // js/appointments.js does not. Nothing on the public page can reach
        // this function, but a ReferenceError here would be a silent break.
        if (entry && !entry.isWalkIn && typeof releaseSlotLock === "function") {
            releaseSlotLock(entry.dentistId || "gapit_dentist_uid",
                            entry.appointmentDate, entry.appointmentTime);
        }
    })
    .catch(err => {
        if (err && err.code === RECORD_CHANGED) {
            showToast(err.message, "warning");
            return;
        }
        console.error("Could not remove from the queue:", err);
        showToast("Could not update that entry.", "error");
    });
}

// ─────────────────────────────────────────────────────────────
// Walk-in intake
// ─────────────────────────────────────────────────────────────

/**
 * Remember that this registration came in through the Walk-In door.
 *
 * Kept in sessionStorage rather than a variable because registration navigates
 * — the form is a three-step flow and finishes by replacing the page — and a
 * variable would not survive that. Session-scoped so it cannot leak into the
 * next person who uses the same browser at the front desk.
 */
function markWalkInIntake() {
    try {
        window.sessionStorage.setItem("dentcare.walkin", "1");
    } catch (err) {
        /* Storage blocked. The flag below simply reads false and the patient
           registers normally — they can still be queued by hand. */
    }
}

/** True when the registration in progress started from the Walk-In button. */
function isWalkInIntake() {
    try {
        return window.sessionStorage.getItem("dentcare.walkin") === "1";
    } catch (err) {
        return false;
    }
}

function clearWalkInIntake() {
    try {
        window.sessionStorage.removeItem("dentcare.walkin");
    } catch (err) { /* nothing to clear */ }
}

/**
 * Metres between two points on the earth (the haversine formula).
 *
 * No library and no service: this is the whole of it. 6,371,000 m is the
 * earth's mean radius, and over the few hundred metres that matter here the
 * result is accurate to well under a metre.
 */
function metresBetween(lat1, lng1, lat2, lng2) {
    const toRad = deg => (Number(deg) * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/**
 * Where this device is, compared with the clinic.
 *
 * See CLINIC_GEOFENCE in js/app.js for what this is worth and what it is not.
 * Four answers:
 *
 *   "off"      no coordinates configured, so the check is not in use
 *   "inside"   within the radius
 *   "outside"  clearly beyond it, from a reading accurate enough to act on
 *   "unknown"  refused, unavailable, timed out, or too vague to judge
 *
 * ── ONLY "inside" (or "off") OPENS THE WALK-IN FORM (owner, 2026-09-25) ────
 *
 * "unknown" used to carry on, so that a patient in a mall with a poor reading
 * was never stopped at the door. The owner found the other side of that: a
 * browser with its location switched off, or a location simply refused, walked
 * straight past the check from anywhere. Their decision: no location, no
 * self check-in. The patient is told why and how to fix it, and offered the
 * booking form, or the front desk, who can add anybody standing there to the
 * queue by hand. So nobody who is really at the clinic is turned away, only
 * sent to the desk.
 *
 * `reason` says which kind of "unknown" it was, so the patient is told the fix
 * that applies to them: "denied", "unavailable", "unsupported", "timeout" or
 * "vague".
 *
 * @return {Promise<{verdict: string, distanceM: number|null, accuracyM: number|null, reason: string|null}>}
 */
function checkAtClinic() {
    const fence = (typeof CLINIC_GEOFENCE !== "undefined" && CLINIC_GEOFENCE) || {};
    const answer = (verdict, distanceM, accuracyM, reason) => ({
        verdict: verdict,
        distanceM: (distanceM === undefined ? null : distanceM),
        accuracyM: (accuracyM === undefined ? null : accuracyM),
        reason: reason || null
    });

    if (typeof fence.lat !== "number" || typeof fence.lng !== "number") {
        return Promise.resolve(answer("off"));
    }
    // Browsers only give a location to a secure page. Firebase Hosting is
    // HTTPS and so is localhost, so this is about an odd setup, not the norm.
    const ok = typeof navigator !== "undefined" && navigator.geolocation &&
               (typeof window === "undefined" || window.isSecureContext !== false);
    if (!ok) return Promise.resolve(answer("unknown", null, null, "unsupported"));

    return new Promise(resolve => {
        let settled = false;
        const done = (verdict, d, acc, reason) => {
            if (settled) return;
            settled = true;
            resolve(answer(verdict, d, acc, reason));
        };

        // Some browsers never call either callback if the permission prompt is
        // dismissed rather than answered, which would leave the patient
        // looking at "Checking…" for ever.
        setTimeout(() => done("unknown", null, null, "timeout"), 10000);

        navigator.geolocation.getCurrentPosition(
            pos => {
                const coords = (pos && pos.coords) || {};
                const distance = metresBetween(fence.lat, fence.lng,
                                               coords.latitude, coords.longitude);
                const accuracy = Math.round(Number(coords.accuracy) || 0);
                const radius = Number(fence.radiusM) || 300;
                const maxAccuracy = Number(fence.maxAccuracyM) || 200;

                if (!isFinite(distance)) return done("unknown", null, accuracy, "unavailable");
                if (accuracy > maxAccuracy) return done("unknown", distance, accuracy, "vague");

                // The reading's own margin of error counts in the patient's
                // favour: 320 m away give or take 100 m is not "clearly away".
                done((distance - accuracy) <= radius ? "inside" : "outside", distance, accuracy);
            },
            // PositionError codes: 1 refused, 2 no fix (location off), 3 too slow.
            err => done("unknown", null, null,
                err && err.code === 1 ? "denied" : err && err.code === 3 ? "timeout" : "unavailable"),
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
        );
    });
}

/** "about 4 km" / "about 600 m", for a sentence a patient reads. */
function roughDistance(metres) {
    if (typeof metres !== "number" || !isFinite(metres)) return "";
    return metres >= 1000
        ? "about " + (Math.round(metres / 100) / 10) + " km"
        : "about " + (Math.round(metres / 50) * 50) + " m";
}

/**
 * Open registration in walk-in mode from the landing page.
 *
 * Deliberately the SAME registration form, not a second one. A separate
 * walk-in form would be a second place for the clinic's intake questions to
 * live, and the two would drift the first time one was edited — which for a
 * medical history form means a walk-in patient silently not being asked about
 * an allergy.
 */
function startWalkInRegistration() {
    const modal = document.getElementById("modal-walkin");

    // Without the chooser present — an older cached page, say — fall through
    // to the behaviour that existed before it, rather than doing nothing at
    // all while somebody stands at the desk waiting.
    if (!modal) {
        beginWalkInRegistration();
        return;
    }

    resetWalkInModal();
    modal.classList.add("active");
}

/** Close the chooser and leave the landing page as it was. */
function closeWalkInModal() {
    const modal = document.getElementById("modal-walkin");
    if (modal) modal.classList.remove("active");
    resetWalkInModal();
}

/** Back to the question, so the next patient does not see the last answer. */
function resetWalkInModal() {
    const choice = document.getElementById("walkin-choice");
    const returning = document.getElementById("walkin-returning");
    if (choice) choice.classList.remove("hidden");
    if (returning) returning.classList.add("hidden");
    // The location panels too, or the next person to open this sees the last
    // person's answer (2026-09-18).
    ["walkin-checking", "walkin-too-far", "walkin-no-location"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add("hidden");
    });
}

/**
 * "I have been here before" — tell them to hand the tablet back.
 *
 * Deliberately a dead end for the patient. Searching the patients collection
 * needs clinician rights (firestore.rules:115), and loosening that so a tablet
 * held by anyone could search by surname and birthday would leak who is a
 * patient here. Staff do the lookup from the queue tab instead.
 */
function showWalkInReturning() {
    const choice = document.getElementById("walkin-choice");
    const returning = document.getElementById("walkin-returning");
    if (choice) choice.classList.add("hidden");
    if (returning) returning.classList.remove("hidden");
}

/**
 * "This is my first visit" — the original walk-in path.
 *
 * Deliberately the SAME registration form, not a second one. A separate
 * walk-in form would be a second place for the clinic's intake questions to
 * live, and the two would drift the first time one was edited — which for a
 * medical history form means a walk-in patient silently not being asked about
 * an allergy.
 */
/**
 * "This is my first visit", pressed.
 *
 * Asks where the device is before opening the form (2026-09-18). The form
 * opens only for a device that is at the clinic (or when the check is off);
 * "somewhere else" and "no usable location" each get their own panel (see
 * checkAtClinic() for why no location is now a stop). The question is asked
 * BEFORE the form rather than after, so nobody fills in three steps of medical
 * history and is turned away at the end.
 */
function beginWalkInRegistration() {
    const choice = document.getElementById("walkin-choice");
    const checking = document.getElementById("walkin-checking");
    if (checking) checking.classList.remove("hidden");
    if (choice) choice.classList.add("hidden");

    checkAtClinic()
        .catch(() => ({ verdict: "unknown", distanceM: null, accuracyM: null }))
        .then(where => {
            if (checking) checking.classList.add("hidden");
            const verdict = where && where.verdict;
            if (verdict === "outside") {
                showWalkInTooFar(where);
                return;
            }
            if (verdict !== "inside" && verdict !== "off") {
                showWalkInNoLocation(where);
                return;
            }
            if (choice) choice.classList.remove("hidden");
            proceedWithWalkInRegistration();
        });
}

/**
 * Say, in the clinic's own words, that the queue is for people who are here.
 *
 * Never a dead end: the patient is offered the booking form instead, and told
 * that the desk can add them if they really are at the clinic (which is the
 * honest answer when the reading is wrong).
 */
function showWalkInTooFar(where) {
    const choice = document.getElementById("walkin-choice");
    const returning = document.getElementById("walkin-returning");
    const panel = document.getElementById("walkin-too-far");
    if (choice) choice.classList.add("hidden");
    if (returning) returning.classList.add("hidden");

    const how = document.getElementById("walkin-too-far__distance");
    if (how) {
        const rough = roughDistance(where && where.distanceM);
        how.textContent = rough
            ? "You look like you are " + rough + " from the clinic."
            : "You look like you are away from the clinic.";
    }
    if (panel) panel.classList.remove("hidden");

    // The flag must not be left set: the next registration in this browser
    // would otherwise join the queue on its own.
    clearWalkInIntake();
}

/** What to do about each kind of missing location, in the patient's words. */
const WALKIN_NO_LOCATION_HELP = {
    denied: "Location is blocked for this site. Tap the icon beside the web address, " +
            "allow Location, then press Try again.",
    unavailable: "Your device did not give a location. Turn on Location (GPS) in your " +
                 "phone's settings, then press Try again.",
    unsupported: "This browser cannot share a location. Open this page in Chrome or Safari, " +
                 "or ask our staff.",
    timeout: "Finding your location took too long. Press Try again.",
    vague: "Your location is not precise enough to confirm. Turn on precise location (GPS), " +
           "then press Try again."
};

/**
 * No usable location: no self check-in (owner, 2026-09-25). Says why, how to
 * fix it, and the two ways that always work: the booking form, or the desk.
 */
function showWalkInNoLocation(where) {
    const choice = document.getElementById("walkin-choice");
    const returning = document.getElementById("walkin-returning");
    const panel = document.getElementById("walkin-no-location");
    if (choice) choice.classList.add("hidden");
    if (returning) returning.classList.add("hidden");

    const why = document.getElementById("walkin-no-location__why");
    if (why) {
        why.textContent = WALKIN_NO_LOCATION_HELP[where && where.reason] ||
                          WALKIN_NO_LOCATION_HELP.unavailable;
    }
    if (panel) panel.classList.remove("hidden");

    // As on the "too far" panel: the next registration in this browser must
    // not join the queue on its own.
    clearWalkInIntake();
}

/** "Try again" on the no-location panel: ask the browser once more. */
function retryWalkInLocation() {
    const panel = document.getElementById("walkin-no-location");
    if (panel) panel.classList.add("hidden");
    beginWalkInRegistration();
}

/** The booking form instead, as an ordinary appointment. */
function bookInsteadOfWalkIn() {
    clearWalkInIntake();
    closeWalkInModal();
    if (typeof openBookingPage === "function") openBookingPage("register");
}

function proceedWithWalkInRegistration() {
    markWalkInIntake();

    const modal = document.getElementById("modal-walkin");
    if (modal) modal.classList.remove("active");

    if (typeof openBookingPage === "function") {
        // opts.walkIn tells openBookingPage this route is deliberate, so it
        // leaves the flag markWalkInIntake() just set alone.
        openBookingPage("register", { walkIn: true });
    }

    // Say what is about to happen. Without this the Walk-In button just opens
    // a registration form, and somebody at the front desk cannot tell whether
    // it worked.
    const banner = document.getElementById("walkin-banner");
    if (banner) banner.classList.remove("hidden");

    if (typeof showToast === "function") {
        showToast("Walk-in registration — you will join today's queue when you finish.", "info");
    }
}
