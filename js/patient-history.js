// ─────────────────────────────────────────────────────────────
// DentCare – js/patient-history.js (One patient, the whole record card)
// ─────────────────────────────────────────────────────────────
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────
//
// Everything the clinic knows about one person, in the order the paper Dental
// Record Card puts it, and exportable as a file that can leave Firebase.
//
// The other clinical tabs each hold one slice — Interactive Charting is the
// mouth, Treatment Logs is what was done, Billing is what was owed. That suits
// working, because you do one of those at a time. It does not suit the two
// moments this tab is for: a patient sitting down and the doctor needing the
// whole picture first, and the clinic wanting a copy off the cloud.
//
// The second one is the point of the project. This clinic already lost every
// paper record it had to a flood. "It is in the cloud" is not an answer on its
// own — an account can be locked, a free tier can be exceeded, a project can be
// deleted by mistake — so the export has to produce something Dr. Gapit can
// hold.
//
// ── ONE FILE PER PATIENT, NOT ONE PER YEAR ───────────────────────────────
//
// A patient history is a single living record that keeps being added to from
// registration onwards. Filing it by year would split one person across folders
// and make the current picture the hardest thing to assemble — which is the
// only picture anyone ever wants. Money is the opposite: a financial year is a
// closed book, and that export is filed by year on purpose.
//
// ── WHAT IT READS, AND WHAT IT DELIBERATELY DOES NOT ─────────────────────
//
//     patients/{id}        the profile, the medical history, the tooth chart
//     dental_records       what was done, every visit
//     appointments         when they came, and when they did not
//     patient_files        the x-ray index — including archived scans
//     billing + payments   every clinician — the doctor keeps the books.
//                          Writing them is still staff-only. See canSeeAccount().
//
// Nothing here writes. This tab is a reading and exporting surface, and the
// chart it draws is rendered read-only for that reason (see
// templates/partials/tooth-glyph.php).

/** Everything loaded for the patient currently open, so the export can reuse it. */
let historyRecord = null;

/**
 * Which load is the current one.
 *
 * Opening a patient fires five or six parallel Firestore reads. Open patient A,
 * change your mind, open patient B — and if A's reads happen to land after B's,
 * A's .then() would overwrite historyRecord and repaint the card while the
 * header says B. On this screen that means one patient's allergies, chart and
 * treatment history displayed under another patient's name, which is the single
 * worst thing this tab could do.
 *
 * Every load takes a ticket on the way in and checks it is still the newest on
 * the way out. A stale response is dropped rather than rendered.
 */
let historyLoadToken = 0;

/**
 * May this account see what the patient owes and has paid?
 *
 * Every clinician, as of 2026-09-03. Dr. Gapit keeps the blue record book —
 * she logs the bills and the income, and she holds the money; the front desk
 * receives it from the patient and hands it over. A rule that hid the ledger
 * from her was not a separation of duties, it was hiding the clinic's books
 * from their owner, and it would have kept her on paper.
 *
 * SEEING the money and MOVING it are still different permissions.
 * firestore.rules lets any clinician read billing and payments, and still lets
 * only staff create a payment or settle a bill. This function is the read side.
 *
 * A patient never reaches this screen at all — their own account is on their
 * own dashboard, and the rules pin every row there to their own uid.
 */
function canSeeAccount() {
    return currentRole === "staff" || currentRole === "admin" || currentRole === "dentist";
}


/**
 * Which copy of this tab is on screen.
 *
 * The template is included once in the dentist layout and once in the staff
 * layout — both are in the page at the same time, one of them hidden. So every
 * id in it carries the role prefix, exactly as tab_manage_schedule.php does,
 * and everything here has to ask for the right one.
 *
 * Without this, getElementById would return whichever copy comes first in the
 * document — the dentist's — and a staff member's Patient History tab would
 * quietly render into a hidden layout while their own screen stayed empty.
 * Nothing would error; the tab would just look broken.
 */
function historyPrefix() {
    return currentRole === "dentist" ? "dentist" : "staff";
}

/** An element in the copy of the tab this role is actually looking at. */
function phEl(name) {
    return document.getElementById(historyPrefix() + "-history-" + name);
}

/** The chart scope for this layout — see render_card_tooth(). */
function historyChartScope() {
    return historyPrefix() + "-history";
}

/**
 * Could this section be read at all?
 *
 * Distinct from "is it empty". An empty treatment list means the patient has
 * never been treated; an unreadable one means nobody knows. Printing the first
 * when the second is true is how a record card ends up lying.
 */
function phMissing(record, section) {
    const missing = (record && record.unavailable) || [];
    return missing.some(col => PH_SECTION_OF[col] === section);
}

/** The row a table shows when its source could not be read. */
function phMissingRow(cols) {
    return '<tr><td colspan="' + cols + '" class="ph-unreadable">' +
           'This section could not be read — it is not empty, it did not load. ' +
           'Reload the page; if it keeps happening the security rules are ' +
           'refusing it for this account.</td></tr>';
}

/** Escapes for innerHTML. Every value below came from a person. */
function ph(v) {
    return escapeHtml(v == null || v === "" ? "—" : String(v));
}

/**
 * What the patient actually agreed to, word for word.
 *
 * Copied from Dr. Gapit's own card and repeated on the registration form
 * (templates/booking.php, step 3). A signature printed with no statement over
 * it records that somebody signed something; this records WHAT. The two copies
 * are pinned together by tools/check-record-card.js, which fails if the wording
 * on the form and the wording on the card ever drift apart.
 */
const CLINIC_CONSENT_CLINIC = "Dr. Reina G. Gapit Dental Clinic";

const CLINIC_CONSENT_HEADING = "Declaration & Clinical Consent";

const CLINIC_CONSENT_STATEMENT =
    "I do hereby consent to the performance of all dental procedures, operations, " +
    "and/or treatment that may be considered necessary to restore my oral and dental " +
    "health. This consent is given voluntary and whatever result of any intervention " +
    "or treatment may be, I absolve my dentist from all liability. Be it known " +
    "further that I am willing to pay for all services rendered me and my family.";

/**
 * A PNG data URL and nothing else. Anything else is not a signature.
 *
 * Registration writes what the pad exported; nothing has ever read it back.
 * Now that the card draws it, the value arrives from a document the patient's
 * own account can write, so it is never handed to an <img src> or to jsPDF on
 * the strength of merely being there. A link to somewhere else, a
 * `data:text/html`, a stray quote closing the attribute: all dropped, and the
 * card falls back to the printed name.
 */
const SIGNATURE_PNG = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;

/**
 * The patient's drawn signature, or "" when there is not one worth drawing.
 *
 * Bounds as well as shape. An untouched pad is never saved in the first place
 * (getSignatureDataUrl in js/booking.js returns ""), so anything this short is
 * not a mark; and a card must not try to lay a third of a megabyte of
 * hand-edited image into a PDF that has 499 other patients to get through.
 *
 * @param   {Object} m  the patient's medicalHistory
 * @returns {string}    the data URL, or ""
 */
function signatureInk(m) {
    const raw = (m && m.consentSignatureImage) || "";
    if (typeof raw !== "string" || raw.length < 120 || raw.length > 400000) return "";
    return SIGNATURE_PNG.test(raw) ? raw : "";
}

/** A yes/no answer from the medical questionnaire, printed the way the card prints it. */
function phYesNo(v) {
    if (v === true) return "Yes";
    if (v === false) return "No";
    return "—";
}


// ─────────────────────────────────────────────────────────────
// Finding the patient
// ─────────────────────────────────────────────────────────────

/**
 * Opened by the sidebar. Always starts at the picker, never on whoever was
 * open last — a record card left on screen from a previous patient is the
 * kind of thing that gets read as the current one.
 */
function resetHistoryTab() {
    unwatchOpenHistory();
    historyLoadToken++;
    historyRecord = null;
    const box = phEl("patient-search");
    if (box) box.value = "";
    phEl("record").classList.add("hidden");
    phEl("patient-panel").classList.remove("hidden");
    loadHistoryPatients();
}

/**
 * Make sure the patient list is in memory, and hand back a promise for it.
 *
 * Split out of loadHistoryPatients() because "export every record" is now
 * reachable from Backup & Recovery as well as from Patient History, and from
 * the backup tab the picker has never been drawn — so the cache the export
 * reads is empty and it would report "no patients to export" on a clinic with
 * two dozen of them.
 *
 * ── ALWAYS THROUGH getReference (2026-09-27) ──────────────────────────────
 * This used to hand back chartPatientCache whenever it had anything in it, and
 * nothing ever emptied it — so once the list had loaded, a patient registered
 * afterwards did not appear here until the page was refreshed. Found in client
 * testing on dentcare.site. getReference is its own cache (live while a picker
 * is open, otherwise a minute), so going through it every time costs nothing
 * and can no longer be stale for the rest of the session.
 */
function ensureHistoryPatients() {
    // Fills the SAME cache the charting and treatment-log pickers use, so
    // three tabs cannot end up showing three different patient lists.
    return getReference("patients").then(byId => setChartPatients(byId));
}

function loadHistoryPatients() {
    const list = phEl("patient-list");
    if (!list) return;

    list.innerHTML = '<p class="picker-empty">Loading patients…</p>';

    if (typeof watchPatientPickers === "function") watchPatientPickers();
    ensureHistoryPatients()
    .then(() => {
        renderHistoryPatientList();
        syncMissingLastVisits();
    })
    .catch(err => {
        console.error("Error loading patients:", err);
        list.innerHTML = '<p class="picker-empty">Could not load the patient list. ' +
                         'Check your connection and reopen this tab.</p>';
    });
}

/** The shared picker, pointed at this tab's elements. */
function renderHistoryPatientList() {
    renderPatientPicker({
        listId:   historyPrefix() + "-history-patient-list",
        searchId: historyPrefix() + "-history-patient-search",
        sortId:   historyPrefix() + "-history-patient-sort",
        countId:  historyPrefix() + "-history-patient-count",
        showId:   historyPrefix() + "-history-patient-show",
        yearId:   historyPrefix() + "-history-patient-year",
        yearWrapId: historyPrefix() + "-history-patient-year-wrap",
        onPick:   selectPatientForHistory
    });


}

/** The Show select changed. The last ten seen are listed newest first. */
function onHistoryShowChange() {
    const show = phEl("patient-show");
    const sort = phEl("patient-sort");
    if (show && sort && show.value === "last10") sort.value = "visit-desc";
    renderHistoryPatientList();
}

/**
 * Correct one patient's lastVisitDate from the visits just loaded.
 *
 * Opening a patient reads their visits anyway, so this costs no read. It only
 * writes when the visits were actually read and the newest one says something
 * different: a refused or failed read proves nothing about when they came.
 * The write itself is saveLastVisitDate() in js/records.js, beside the other
 * patient writes.
 */
function healLastVisitDate(record) {
    if (!record || !record.patientId) return;
    if ((record.unavailable || []).indexOf("dental_records") !== -1) return;

    const newest = (record.treatments || [])
        .map(t => String(t.recordDate || ""))
        .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
        .sort().pop();
    if (!newest || newest === (record.patient || {}).lastVisitDate) return;

    // Housekeeping, never the reason a record fails to open: whatever goes
    // wrong here is logged and the card the user asked for stays on screen.
    try {
        saveLastVisitDate(record.patientId, newest)
            .then(saved => { if (record.patient && saved) record.patient.lastVisitDate = saved; })
            .catch(err => console.warn("The last-visit date was not updated:", err));
    } catch (err) {
        console.warn("The last-visit date was not updated:", err);
    }
}

/**
 * The open record, listened to without being redrawn (R20): its patient
 * document and its visits, under every id it has had. A change on another
 * screen shows the bar; "Show the latest" reloads it.
 */
function watchOpenHistory(record) {
    if (typeof watchOpenRecord !== "function") return;
    const tab = "tab-" + historyPrefix() + "-history";
    const bar = historyPrefix() + "-history-updated-bar";
    const id = record.patientId;
    const reload = () => {
        if (historyRecord && historyRecord.patientId === id) selectPatientForHistory({ patient_id: id });
    };
    hideUpdatedBar(bar);
    watchOpenRecord(tab + ":patient", db.collection("patients").doc(id), bar, reload, "patients/" + id);
    watchOpenRecord(tab + ":visits", wherePatientIs(db.collection("dental_records"), record.recordIds || [id]),
        bar, reload, "dental_records/");
}

/** Stop listening to the open record (the picker is shown again). */
function unwatchOpenHistory() {
    if (typeof unwatchLive !== "function") return;
    const tab = "tab-" + historyPrefix() + "-history";
    unwatchLive(tab + ":patient");
    unwatchLive(tab + ":visits");
    hideUpdatedBar(historyPrefix() + "-history-updated-bar");
}

function showAllHistoryPatients() {
    unwatchOpenHistory();
    // Invalidates any load still in flight, so it cannot paint over the picker.
    historyLoadToken++;
    historyRecord = null;
    const box = phEl("patient-search");
    if (box) box.value = "";
    phEl("record").classList.add("hidden");
    phEl("patient-panel").classList.remove("hidden");
    renderHistoryPatientList();
}


// ─────────────────────────────────────────────────────────────
// Loading one patient
// ─────────────────────────────────────────────────────────────

/**
 * Everything the clinic knows about one patient, as one object.
 *
 * Read fresh rather than from the reference cache. This feeds the screen a
 * doctor reads before treating somebody, and a minute-old copy of an allergy
 * list is not good enough.
 *
 * Resolves to null when the patient no longer exists, rather than rejecting —
 * a deleted patient is an answer, not a failure, and the bulk export has to be
 * able to skip one without abandoning the other twenty-three.
 */
/**
 * Which sections a refusal costs you.
 *
 * The collection is what Firestore refuses; the section is what the person is
 * looking at. Keeping the mapping here means one place to change when a
 * section gains a second source.
 */
const PH_SECTION_OF = {
    dental_records: "treatments",
    appointments:   "visits",
    patient_files:  "files",
    billing:        "account",
    payments:       "account",
    payment_voids:  "account"
};

/**
 * Read one collection for this patient, and survive being refused.
 *
 * ── WHY THIS IS NOT Promise.all ──────────────────────────────────────────
 *
 * It was, until 2026-09-05. Six reads went out together and one rejection
 * rejected all of them, so the doctor opening any patient got "Could not load
 * this record" and nothing else — no name, no allergies, no tooth chart, no
 * treatment history. The bulk export, which runs the same loader once per
 * patient, produced an empty folder for the same reason.
 *
 * The trigger was a rules drift: the rules live on the project still read
 * billing and payments as isStaff(), which does not include a dentist, so
 * those two queries were refused for her and only her. That part is a
 * redeploy. This part is why a refusal on the MONEY panel was costing her the
 * clinical record, and it would have happened again on the next rules change.
 *
 * A permission boundary should cost you the section behind it. Nothing else.
 */
function phRead(query, collection, missing) {
    return query.get().catch(err => {
        // A refusal is expected and survivable; anything else still is not
        // something to hide, so both are recorded and both are reported.
        console.error("Patient history: could not read " + collection + ":", err);
        missing.push(collection);
        return null;
    });
}

function fetchPatientRecord(id, hops) {
    // Which collections came back refused or broken. Carried on the record so
    // that every screen and the exported file can tell "nothing here" apart
    // from "nobody could look" — those are different statements, and only one
    // of them is safe to print on a patient's record card.
    const missing = [];

    // The patient document is the one hard requirement. There is no record
    // card to draw without a name, an age and a chart, so this one is allowed
    // to reject and take the load down with it. It is read FIRST since
    // 2026-10-02 (R17): it says which ids the history is filed under.
    return db.collection("patients").doc(id).get().then(patientSnap => {
        if (!patientSnap.exists) return null;
        const patient = patientSnap.data();

        // An old record that moved onto an online account opens the account's
        // record, which holds this one's history too. Followed a few hops at
        // most; a missing target falls back to this record as it is.
        const depth = hops || 0;
        if (patient.mergedInto && depth < MAX_RECORD_IDS) {
            return fetchPatientRecord(String(patient.mergedInto), depth + 1).then(record => {
                if (!record) return readPatientHistory(id, patient, missing);
                if (!record.movedFrom) record.movedFrom = { id: id, at: String(patient.mergedAt || "") };
                return record;
            });
        }
        return readPatientHistory(id, patient, missing);
    });
}

/** Everything filed under this patient: every id the record has had (patientRecordIds in js/app.js). */
function readPatientHistory(id, patient, missing) {
    const ids = patientRecordIds(id, patient);

    const reads = [
        phRead(wherePatientIs(db.collection("dental_records"), ids), "dental_records", missing),
        phRead(wherePatientIs(db.collection("appointments"), ids), "appointments", missing),
        phRead(wherePatientIs(db.collection("patient_files"), ids), "patient_files", missing)
    ];

    // Only asked for when the account may have them — see canSeeAccount().
    if (canSeeAccount()) {
        reads.push(phRead(wherePatientIs(db.collection("billing"), ids), "billing", missing));
        reads.push(phRead(wherePatientIs(db.collection("payments"), ids), "payments", missing));
        reads.push(phRead(wherePatientIs(db.collection("payment_voids"), ids), "payment_voids", missing));
    }

    return Promise.all(reads).then(snaps => {
        const [recordsSnap, apptsSnap, filesSnap, billsSnap, paymentsSnap, voidsSnap] = snaps;
        const patientSnap = { data: () => patient };

        const docs = (snap) => {
            const out = [];
            if (snap) snap.forEach(d => out.push(Object.assign({ id: d.id }, d.data())));
            return out;
        };

        return {
            patientId:  id,
            patient:    patientSnap.data(),
            recordIds:  ids,
            treatments: docs(recordsSnap).sort((a, b) =>
                            String(b.recordDate || "").localeCompare(String(a.recordDate || ""))),
            visits:     docs(apptsSnap).sort((a, b) =>
                            String(b.appointmentDate || "").localeCompare(String(a.appointmentDate || ""))),
            files:      docs(filesSnap).sort((a, b) =>
                            String(b.createdAt || "").localeCompare(String(a.createdAt || ""))),
            bills:      docs(billsSnap),
            payments:   docs(paymentsSnap),
            voids:      docs(voidsSnap),
            accountVisible: canSeeAccount(),

            // The names of the collections that could not be read. Empty on a
            // healthy load, which is the only state that prints a record card
            // with no caveat on it.
            unavailable: missing,
            loadedAt:   new Date()
        };
    });
}

/** Match each bill to its active receipts; a void reverses its receipt. */
function historyBillFigures(record, bill) {
    const receipts = (record.payments || []).filter(p => p.billingId === bill.id);
    return billFigures(bill, receipts, record.voids || []);
}

/**
 * The charted teeth, derived from the patient document.
 *
 * The on-screen render happens to leave these on historyRecord as a side
 * effect, which was fine while the export only ever ran on the patient
 * currently displayed. The bulk export never draws a screen, so it has to
 * derive them — otherwise every record card in the file would report "no
 * findings recorded" for a mouth full of them.
 *
 * Only teeth with something recorded, which is what the paper card does too:
 * it marks what is wrong, and a healthy tooth is the absence of a mark.
 */
// The clinic's tooth numbering, in the same left-to-right order the paper card
// prints it. FDI two-digit notation: first digit the quadrant, second the
// position counting outward from the midline.
//
// TRANSCRIBED FROM templates/partials/dentition.php, which is the single source
// of truth and itself transcribed from the paper card. These are duplicated
// here because the export runs in the browser with no access to the PHP, and
// tools/check-history.js asserts the two lists still match — a chart that
// numbered a tooth differently from the screen would put a filling on the wrong
// tooth in the printed record.
const PDF_PERMANENT_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const PDF_PERMANENT_LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
const PDF_PRIMARY_UPPER   = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65];
const PDF_PRIMARY_LOWER   = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75];

// ── The page the card is drawn on (client revision 9, 2026-09-30) ───────────
//
// The clinic prints a patient's history on the half sheet: long bond paper cut
// down the middle, 6.5 by 8.5 inches, which is 165.1 by 215.9 mm. The card was
// drawn for A4 and ran off that page. Every x position, column width, table
// width and page-break test below is derived from this one constant, so the
// card cannot be half-converted: change the paper here and all of it follows.
const CARD_PAGE = { w: 165.1, h: 215.9, margin: 10 };

const CARD_LEFT   = CARD_PAGE.margin;
const CARD_RIGHT  = CARD_PAGE.w - CARD_PAGE.margin;
/** The usable width between the margins: 145.1 mm. */
const CARD_WIDTH  = CARD_RIGHT - CARD_LEFT;
/** Where a continued page starts. */
const CARD_TOP    = CARD_PAGE.margin + 6;
/** The page-number line, on the bottom margin. */
const CARD_FOOT   = CARD_PAGE.h - CARD_PAGE.margin;
/** The last line content may reach, clear of the page number. */
const CARD_BOTTOM = CARD_FOOT - 8;

/** The margins every table on the card keeps, on every page it runs to. */
function cardTableMargin() {
    return { left: CARD_LEFT, right: CARD_PAGE.margin, top: CARD_TOP, bottom: CARD_PAGE.h - CARD_BOTTOM };
}

// ── The card's own colours ──────────────────────────────────────────────────
//
// The same values css/dashboard.css paints the on-screen chart with, so the
// printed card and the screen cannot say different things about the same
// tooth. Changing one without the other is how a doctor ends up reading a
// green tooth on screen and a red one on paper.
const PDF_CONDITION_FILL = {
    "Decayed": [252, 165, 165],
    "Filled":  [110, 231, 183],
    "Crowned": [253, 224,  71],
    "Bridge":  [192, 132, 252],
    "Missing": [226, 232, 240],
    // Added 2026-09-30 with the chart codes. An extraction is drawn exactly as
    // a missing tooth is; a root canal has its own blue (#93c5fd on screen).
    "Extracted": [226, 232, 240],
    "RCT":     [147, 197, 253]
};

// A filling's type picks its colour (2026-10-01): the same values as
// FILL_MATERIALS in js/records.js and the .is-fill-* rules in
// css/dashboard.css. A filling with no type keeps the Filled green above.
// On a black-and-white printer these become greys, which is why the card
// also prints the code in words ("Filled (AM)").
const PDF_FILL_MATERIAL_FILL = {
    "LC":  [13, 148, 136],
    "AM":  [55, 65, 81],
    "TF":  [249, 115, 22],
    "GIC": [37, 99, 235]
};

/**
 * A condition as the doctor writes it: "Filled (LC)", "EXO", "RCT".
 *
 * toothConditionLabel() lives in js/records.js beside the list it names.
 * Guarded so this module still reads a record where that file is not loaded.
 */
function phCondition(status, material) {
    return typeof toothConditionLabel === "function"
        ? toothConditionLabel(status, material)
        : status;
}

/** Quadrants 1, 4, 5 and 8 are the patient's right — mesial points right. */
function pdfMesialOnRight(tooth) {
    return [1, 4, 5, 8].indexOf(Math.floor(Number(tooth) / 10)) !== -1;
}

/** Positions 1-3 face the lip, not the cheek. The card marks them La. */
function pdfFacialCode(tooth) {
    return (Number(tooth) % 10) <= 3 ? "La" : "Bu";
}

/**
 * One filled ring segment, between two radii and two angles.
 *
 * jsPDF has no arc-fill primitive, so the wedge is a polygon: points stepped
 * along the outer arc, then back along the inner one. Eight steps is already
 * smooth at this size — the whole tooth is under 7 mm across, and the printer
 * cannot resolve the difference.
 */
function pdfWedge(doc, cx, cy, rIn, rOut, a0, a1) {
    const STEPS = 8;
    const pts = [];
    for (let i = 0; i <= STEPS; i++) {
        const a = a0 + (a1 - a0) * (i / STEPS);
        pts.push([cx + rOut * Math.cos(a), cy + rOut * Math.sin(a)]);
    }
    for (let i = STEPS; i >= 0; i--) {
        const a = a0 + (a1 - a0) * (i / STEPS);
        pts.push([cx + rIn * Math.cos(a), cy + rIn * Math.sin(a)]);
    }

    const deltas = [];
    for (let i = 1; i < pts.length; i++) {
        deltas.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
    }
    doc.lines(deltas, pts[0][0], pts[0][1], [1, 1], "F", true);
}

// Where each surface sits on the dial, in radians. PDF y grows downward, so
// these read clockwise from the top exactly as the card is printed.
const PDF_SURFACE_ARC = {
    facial:  [-3 * Math.PI / 4,     -Math.PI / 4],
    right:   [    -Math.PI / 4,      Math.PI / 4],
    lingual: [     Math.PI / 4,  3 * Math.PI / 4],
    left:    [ 3 * Math.PI / 4,  5 * Math.PI / 4]
};

/**
 * One tooth, drawn the way the paper card draws it.
 *
 *              Bu / La          outward face (cheek or lip side)
 *          D  (  O  )  M        distal · occlusal · mesial
 *              Li               tongue side
 *
 * The export used to print a courier grid with a letter under each number —
 * accurate, and not a dental chart. The clinic said so: "there is no design
 * like the dental charting… I want it to look like that", holding up the card
 * they have used for years. A dentist reads a mouth as a picture, and the
 * whole point of this file is that it is the record card, not a report about
 * one.
 *
 * Only the surfaces actually recorded are shaded, which is what the paper card
 * records and what teethStatus already stores. A finding with no surfaces on it
 * shades the whole tooth, so records made before surfaces existed still show.
 */
function drawCardTooth(doc, cx, cy, tooth, hit, r, upper) {
    const rIn = r * 0.41;
    const mesialRight = pdfMesialOnRight(tooth);

    // ── THE LOWER ARCH IS MIRRORED, AND THIS IS NOT COSMETIC ────────────
    //
    // On the card the two rows meet at their LINGUAL edges — every Li faces
    // the middle of the chart, Bu and La face out. That is what the drawing
    // means: you look at the upper arch from below and the lower arch from
    // above, so the tongue side of both is the side nearest the centre.
    //
    // Drawn unmirrored, a lower tooth's surfaces are upside down: decay
    // recorded on the tongue side of 41 prints on the lip side. Caught by
    // holding the rendered page next to the clinic's own card, not by any
    // test — the letters were right and the picture was wrong.
    const top    = upper ? "facial"  : "lingual";
    const bottom = upper ? "lingual" : "facial";

    const status = hit && hit.status;
    const surfaces = (hit && hit.surfaces) || [];
    const fill = status && ((status === "Filled" && PDF_FILL_MATERIAL_FILL[hit.material]) ||
                            PDF_CONDITION_FILL[status]);
    // A finding with no surfaces named covers the tooth. "Healthy" is a
    // finding of nothing, and shades nothing.
    const gone = status === "Missing" || status === "Extracted";
    const whole = !!status && status !== "Healthy" && (!surfaces.length || gone);

    if (fill && status !== "Healthy") {
        doc.setFillColor(fill[0], fill[1], fill[2]);
        Object.keys(PDF_SURFACE_ARC).forEach(zone => {
            // left/right are sides of the CHART; mesial/distal are sides of the
            // MOUTH, and they swap at the midline. Getting this backwards
            // prints a filling on the wrong side of the tooth.
            const key = zone === "left"    ? (mesialRight ? "distal" : "mesial")
                      : zone === "right"   ? (mesialRight ? "mesial" : "distal")
                      : zone === "facial"  ? top
                      : bottom;
            if (whole || surfaces.indexOf(key) !== -1) {
                const arc = PDF_SURFACE_ARC[zone];
                pdfWedge(doc, cx, cy, rIn, r, arc[0], arc[1]);
            }
        });
        if (whole || surfaces.indexOf("occlusal") !== -1) {
            doc.circle(cx, cy, rIn, "F");
        }
    }

    // ── The outline, over the shading ───────────────────────────────────
    doc.setDrawColor(60);
    doc.setLineWidth(0.22);
    doc.circle(cx, cy, r, "S");
    doc.circle(cx, cy, rIn, "S");

    // The four diagonals that split the ring, exactly as printed.
    doc.setLineWidth(0.15);
    doc.setDrawColor(120);
    [-3, -1, 1, 3].forEach(k => {
        const a = k * Math.PI / 4;
        doc.line(cx + rIn * Math.cos(a), cy + rIn * Math.sin(a),
                 cx + r   * Math.cos(a), cy + r   * Math.sin(a));
    });

    // A missing tooth is struck through, the way it is struck through on paper.
    // So is one extracted here: either way the tooth is no longer in the mouth.
    if (status === "Missing" || status === "Extracted") {
        doc.setDrawColor(90);
        doc.setLineWidth(0.4);
        doc.line(cx - r, cy - r, cx + r, cy + r);
        doc.line(cx + r, cy - r, cx - r, cy + r);
    }

    // ── The card's letters, in the card's positions ─────────────────────
    // Slightly smaller, and the M and D a little closer in, than on the A4
    // card: a column on the half sheet is 9 mm wide, not 11.
    doc.setFontSize(3.2);
    doc.setTextColor(90);
    doc.text(upper ? pdfFacialCode(tooth) : "Li", cx, cy - r - 0.7, { align: "center" });
    // The upper tooth's Li is kept clear of the rule between the two arches.
    doc.text(upper ? "Li" : pdfFacialCode(tooth), cx, cy + r + (upper ? 1.5 : 2.1), { align: "center" });
    doc.text(mesialRight ? "D" : "M", cx - r - 1.2, cy + 0.55, { align: "center" });
    doc.text(mesialRight ? "M" : "D", cx + r + 1.2, cy + 0.55, { align: "center" });

    doc.setFontSize(3.2);
    doc.setTextColor(40);
    doc.text("O", cx, cy + 0.45, { align: "center" });
    doc.setTextColor(0);
}

/**
 * The chart, as the back of the Dental Record Card lays it out.
 *
 * Two blocks: the 16 permanent columns, then the 10 primary columns centred
 * beneath them. Each column holds the upper tooth above the lower one and
 * prints both numbers on the outside, which is what makes the page read as a
 * mouth rather than as two lists.
 */
function drawToothChart(doc, teethRows, y) {
    const byTooth = {};
    teethRows.forEach(t => { byTooth[String(t.tooth)] = t; });

    // Sixteen columns across the usable width of the page. The tooth is sized
    // from its column, so the ring and the M and D beside it always fit in it.
    const LEFT = CARD_LEFT, RIGHT = CARD_RIGHT;
    const COL = (RIGHT - LEFT) / 16;
    const R = COL * 0.27;

    // number · facial · circle · lingual, then the same mirrored for the lower
    const ROW_H = R * 2 + 8;

    const block = (numbersUpper, numbersLower, startY) => {
        const cols = numbersUpper.length;
        const x0 = LEFT + ((16 - cols) * COL) / 2;   // centred, as on the card
        const midY = startY + ROW_H;

        // The cell grid. The card is a ruled table and reads as one.
        doc.setDrawColor(150);
        doc.setLineWidth(0.15);
        for (let i = 0; i <= cols; i++) {
            doc.line(x0 + i * COL, startY, x0 + i * COL, startY + ROW_H * 2);
        }
        doc.line(x0, startY, x0 + cols * COL, startY);
        doc.line(x0, midY,   x0 + cols * COL, midY);
        doc.line(x0, startY + ROW_H * 2, x0 + cols * COL, startY + ROW_H * 2);

        numbersUpper.forEach((tooth, i) => {
            const cx = x0 + i * COL + COL / 2;
            doc.setFontSize(5.4);
            doc.setTextColor(0);
            doc.text(String(tooth), cx, startY + 3.1, { align: "center" });
            drawCardTooth(doc, cx, startY + 3.1 + 1.6 + R + 1.4,
                          tooth, byTooth[String(tooth)], R, true);
        });

        numbersLower.forEach((tooth, i) => {
            const cx = x0 + i * COL + COL / 2;
            drawCardTooth(doc, cx, midY + 2.6 + R,
                          tooth, byTooth[String(tooth)], R, false);
            doc.setFontSize(5.4);
            doc.setTextColor(0);
            doc.text(String(tooth), cx, startY + ROW_H * 2 - 1.1, { align: "center" });
        });

        return startY + ROW_H * 2;
    };

    // The page's own "Dental chart" title sits above this (2026-09-16), so the
    // chart no longer prints a second heading of its own.
    doc.setFontSize(6.5);
    doc.setTextColor(120);
    doc.text("PERMANENT", LEFT, y);
    doc.setTextColor(0);
    y += 1.5;

    y = block(PDF_PERMANENT_UPPER, PDF_PERMANENT_LOWER, y) + 6;

    doc.setFontSize(6.5);
    doc.setTextColor(120);
    doc.text("PRIMARY", LEFT, y);
    doc.setTextColor(0);
    y += 1.5;

    y = block(PDF_PRIMARY_UPPER, PDF_PRIMARY_LOWER, y) + 7;

    // ── The key ─────────────────────────────────────────────────────────
    //
    // A colour nobody can decode is not a record. The swatches are the same
    // fills used above, so the key cannot drift from the chart.
    doc.setFontSize(6.5);
    doc.setTextColor(0);
    doc.text("Key", LEFT, y);
    y += 4.4;

    let kx = LEFT;
    [["Decayed", "Decayed"], ["Filled", "Filled"],
     ["LC", "Filled LC"], ["AM", "Filled AM"], ["TF", "Filled TF"], ["GIC", "Filled GIC"],
     ["Crowned", "Crowned"], ["Bridge", "Bridge support"], ["Missing", "Missing"],
     ["Extracted", "EXO (extraction)"], ["RCT", "RCT"]].forEach(([key, label]) => {
        const c = PDF_CONDITION_FILL[key] || PDF_FILL_MATERIAL_FILL[key];
        doc.setFontSize(6);
        // An entry that would cross the right margin starts a second line.
        const width = 4.4 + doc.getTextWidth(label);
        if (kx > LEFT && kx + width > RIGHT) { kx = LEFT; y += 4.6; }
        doc.setFillColor(c[0], c[1], c[2]);
        doc.setDrawColor(60);
        doc.setLineWidth(0.2);
        doc.rect(kx, y - 2.4, 3.2, 3.2, "FD");
        doc.setTextColor(40);
        doc.text(label, kx + 4.4, y);
        kx += width + 4;
    });
    y += 5;

    // Wrapped to the page: on the half sheet it runs to two lines.
    doc.setFontSize(5.8);
    doc.setTextColor(110);
    const note = doc.splitTextToSize(
        "Only the surfaces recorded are shaded. An unshaded tooth has no finding on record. " +
        "Bu buccal (cheek) · La labial (lip) · Li lingual (tongue) · M mesial · D distal · O occlusal.",
        RIGHT - LEFT);
    doc.text(note, LEFT, y);
    doc.setTextColor(0);

    return y + (note.length - 1) * 2.6 + 6;
}

function recordTeeth(record) {
    const teeth = (record && record.patient && record.patient.teethStatus) || {};
    const rows = [];
    Object.keys(teeth).forEach(num => {
        const t = teeth[num];
        if (!t || !t.status) return;
        rows.push({
            tooth: num,
            status: t.status,
            // A filling's type, when one was recorded (LC, AM, TF, GIC).
            material: t.material || "",
            surfaces: Array.isArray(t.surfaces) ? t.surfaces : [],
            notes: t.notes || ""
        });
    });
    rows.sort((a, b) => Number(a.tooth) - Number(b.tooth));
    return rows;
}

function selectPatientForHistory(patient) {
    const id = patient.patient_id;
    if (!id) return;
    historyRecord = null;
    const pendingVisitButton = document.getElementById("dentist-history-record-visit");
    if (pendingVisitButton) pendingVisitButton.hidden = true;

    phEl("patient-panel").classList.add("hidden");
    phEl("record").classList.remove("hidden");
    setHistoryStatus("Loading the full record…");

    // Claimed before the reads start, checked after they finish.
    const myLoad = ++historyLoadToken;

    fetchPatientRecord(id)
    .then(record => {
        // A newer patient was opened while these were in flight. Dropping the
        // result is the whole point — rendering it would put this patient's
        // record under the other one's name.
        if (myLoad !== historyLoadToken) return;

        if (!record) {
            setHistoryStatus("That patient record no longer exists.", "error");
            return;
        }

        historyRecord = record;
        const visitButton = document.getElementById("dentist-history-record-visit");
        if (visitButton) visitButton.hidden = !(currentRole === "dentist" && typeof clinicPatientVisit !== "undefined" && clinicPatientVisit && clinicPatientVisit.patientId === record.patientId && clinicPatientVisit.appointmentDate === localDateKey());
        renderPatientHistory();
        // Opened from an old record that has since moved onto an online
        // account (R17): the account's record is shown, and says why.
        setHistoryStatus(record.movedFrom
            ? "This record moved to an online account on " +
              (String(record.movedFrom.at).slice(0, 10) || "an earlier date") + ". Its history is shown here."
            : "");
        healLastVisitDate(record);
        watchOpenHistory(record);
    })
    .catch(err => {
        // Same test on the failure path: a stale error must not replace the
        // record the user is now looking at with a message about a different
        // patient's failed load.
        if (myLoad !== historyLoadToken) return;
        console.error("Could not load the patient history:", err);
        setHistoryStatus("Could not load this record. " +
                         (err && err.code === "permission-denied"
                            ? "The security rules refused part of it — check your role."
                            : "Check your connection and try again."), "error");
    });
}

/**
 * Where progress messages go, when they must not go to the Patient History tab.
 *
 * The export can now be started from Backup & Recovery. Both copies of the
 * history tab are in the page at all times — one of them hidden — so without
 * this the "Building… 7 of 24" line would render correctly into a tab the
 * doctor is not looking at, and the backup screen would sit silent for a
 * minute and a half looking frozen.
 */
let phStatusSink = null;

function setHistoryStatus(msg, kind) {
    const cls = "ph-status" + (kind ? " ph-status--" + kind : "");

    const sink = phStatusSink && document.getElementById(phStatusSink);
    if (sink) {
        sink.textContent = msg || "";
        sink.className = cls;
    }

    const el = phEl("export-status");
    if (!el) return;
    el.textContent = msg || "";
    el.className = cls;
}

/**
 * The "Deceased" / "Inactive" line on the open patient, and the owner's button.
 *
 * Drawing only. This module reads the record and never writes it (see the rule
 * in tools/check-history.js), so the dialog and the save itself live beside the
 * other patient writes in js/records.js — openPatientStatus() and
 * submitPatientStatus(). patientStatusOf() there explains why a patient is
 * marked rather than deleted.
 */
/** "Privacy Policy agreed on October 3, 2026 (version 0.1-draft), in person", or "not yet". */
function describePrivacyAgreement(agreed) {
    if (!agreed || typeof agreed !== "object" || !agreed.acceptedAt) return "Privacy Policy: not agreed yet";
    const when = new Date(agreed.acceptedAt);
    const date = isNaN(when.getTime())
        ? String(agreed.acceptedAt).slice(0, 10)
        : when.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    return "Privacy Policy agreed on " + date + " (version " + (agreed.version || "?") + ")" +
        (agreed.method === "in person" ? ", in person" : ", online");
}

function renderPatientStatusBar(p) {
    const badge = phEl("status-badge");
    if (badge) {
        const status = patientStatusOf(p);
        if (status === "active") {
            badge.className = "patient-status-badge hidden";
            badge.textContent = "";
        } else {
            badge.className = "patient-status-badge patient-status-badge--" + status;
            badge.textContent = PATIENT_STATUS_LABEL[status] +
                (p.statusAt ? " \u00b7 " + String(p.statusAt).slice(0, 10) : "") +
                (p.statusNote ? " \u00b7 " + p.statusNote : "");
        }
    }

    // Asked to confirm their email at an online registration and not done yet
    // (2026-10-01). Staff and the doctor may vouch for it in person.
    const unconfirmed = !!p && p.emailConfirmPending === true;
    const emailBadge = phEl("email-badge");
    if (emailBadge) emailBadge.classList.toggle("hidden", !unconfirmed);
    const emailBtn = phEl("email-btn");
    if (emailBtn) emailBtn.classList.toggle("hidden", !unconfirmed);

    // A record the front desk made, with no online account, and a consent not
    // signed yet (2026-10-01, client revision 16). The signature is collected
    // by openCollectConsent() in js/records.js; this module only draws.
    const recordOnly = !!p && p.recordOnly === true;
    const recordBadge = phEl("record-badge");
    if (recordBadge) recordBadge.classList.toggle("hidden", !recordOnly);
    const consentPending = !!p && p.consentPending === true;
    const consentBadge = phEl("consent-badge");
    if (consentBadge) consentBadge.classList.toggle("hidden", !consentPending);
    const consentBtn = phEl("consent-btn");
    if (consentBtn) consentBtn.classList.toggle("hidden", !consentPending);
    // The Privacy Policy agreement (2026-10-03, R22). The line exists only
    // where the policy is shown, so nothing changes elsewhere.
    const privacyLine = phEl("privacy");
    if (privacyLine) privacyLine.textContent = describePrivacyAgreement(p && p.privacyAccepted);
    // Create online account (R17): a record with no login, not yet moved.
    // Reset login (R18): a patient who has one.
    const clinician = currentRole === "staff" || currentRole === "admin" || currentRole === "dentist";
    const accountBtn = phEl("account-btn");
    if (accountBtn) accountBtn.classList.toggle("hidden", !(recordOnly && !p.mergedInto && clinician));
    const resetBtn = phEl("reset-btn");
    if (resetBtn) resetBtn.classList.toggle("hidden", !(!recordOnly && !!p && !p.mergedInto && clinician));

    const btn = phEl("status-btn");
    if (btn) btn.classList.toggle("hidden", !canSetPatientStatus());
    const del = phEl("delete-btn");
    if (del) del.classList.toggle("hidden", !canSetPatientStatus());
}

/** "Confirmed in person" on the open patient (js/email-confirm.js). */
function onConfirmEmailInPerson() {
    if (!historyRecord || !historyRecord.patientId || typeof confirmPatientEmailInPerson !== "function") return;
    const id = historyRecord.patientId;
    confirmPatientEmailInPerson(id).then(done => {
        if (!done || !historyRecord || historyRecord.patientId !== id) return;
        historyRecord.patient = Object.assign({}, historyRecord.patient, { emailConfirmPending: false });
        renderPatientStatusBar(historyRecord.patient);
    });
}

/**
 * "Export every patient record", started from Backup & Recovery.
 *
 * Same export, different room. The backup tab is where the doctor goes when
 * she is thinking about keeping a copy of things, and having to remember that
 * the patient records live behind a different tab is exactly the kind of
 * friction that ends with the copy never being taken.
 */
function exportAllPatientRecordsFromBackup() {
    phStatusSink = "backup-records-status";
    setHistoryStatus("Loading the patient list…");

    ensureHistoryPatients()
        .then(() => exportAllPatientRecords())
        .catch(err => {
            console.error("Could not load the patient list for the export:", err);
            setHistoryStatus("Could not load the patient list. Check your " +
                             "connection and try again.", "error");
        });
}


// ─────────────────────────────────────────────────────────────
// Drawing the card
// ─────────────────────────────────────────────────────────────

function renderPatientHistory() {
    if (!historyRecord) return;
    const p = historyRecord.patient;

    const age = getPatientAge(p);
    phEl("patient-name").textContent =
        (p.lastName || "") + ", " + (p.firstName || "");
    phEl("patient-meta").textContent =
        (age === null ? "Age —" : "Age " + age) +
        " · " + (p.gender || "—") +
        " · " + (p.phoneNumber || "no contact number");

    renderPatientStatusBar(p);
    renderHistoryInfo(p, age);
    renderHistoryMedical(p);
    renderHistoryChart(p);
    renderHistoryTreatments();
    renderHistoryVisits();
    renderHistoryAccount();
    renderHistoryFiles();
}

/** Label/value pairs, as one repeated object. */
function phRows(pairs) {
    return pairs.map(([label, value]) =>
        '<div class="ph-row"><dt>' + escapeHtml(label) + '</dt><dd>' + ph(value) + '</dd></div>'
    ).join("");
}

function renderHistoryInfo(p, age) {
    const minor = p.minorInfo || {};
    phEl("info").innerHTML = phRows([
        ["Full name",         patientFullName(p)],
        ["Middle name",       p.middleName],
        ["Date of birth",     p.dateOfBirth],
        ["Age",               age === null ? "" : age],
        ["Gender",            p.gender],
        ["Civil status",      p.civilStatus],
        ["Nationality",       p.nationality],
        ["Address",           p.address],
        ["Contact number",    p.phoneNumber],
        ["Email",             p.email],
        ["Occupation",        p.occupation],
        ["Company",           p.company],
        ["Company address",   p.companyAddress],
        ["Office number",     p.officeNo],
        ["Emergency contact", p.emergencyContact],
        // Remembered from the last visit charged to an HMO (Task 25).
        ["HMO",               p.hmoProvider],
        ["Referred by",       p.referredBy],
        ["Previous dentist",  p.formerDentist],
        ["Registered",        p.createdAt ? String(p.createdAt).slice(0, 10) : ""]
    ].concat(p.nameEditedByPatientAt ? [
        // The patient can correct their own name in Account Settings, so a typo
        // at registration no longer means deleting the account. The clinic is
        // told when it happens, because a name changing on a clinical record is
        // the clinic's business — not something to discover later.
        ["Name changed by the patient", String(p.nameEditedByPatientAt).slice(0, 10)]
    ] : []).concat(p.nameCorrectedAt ? [
        // Corrected here by the clinic (openCorrectPatientName in js/records.js).
        ["Name corrected by the clinic", String(p.nameCorrectedAt).slice(0, 10) +
            (p.nameCorrectedByName ? " by " + p.nameCorrectedByName : "")]
    ] : []).concat(minor.isMinor ? [
        ["Parent / guardian",  minor.parentName],
        ["Guardian's contact", minor.parentPhone]
    ] : []));
}

function renderHistoryMedical(p) {
    const m = p.medicalHistory || {};

    // The same red flags the charting tab raises, repeated here because this is
    // the page somebody reads before picking up an instrument.
    const alerts = [];
    if (Array.isArray(m.allergies) && m.allergies.length) {
        alerts.push("Allergies: " + m.allergies.join(", "));
    }
    // The conditions were missing from this box until 2026-10-02 (R19): a
    // patient with heart disease or asthma showed nothing in red here. Every
    // condition, the critical ones first (CRITICAL_CONDITIONS in js/app.js).
    const conditions = typeof conditionsCriticalFirst === "function"
        ? conditionsCriticalFirst(m.conditionsChecklist)
        : (m.conditionsChecklist || []);
    if (conditions.length) alerts.push("Conditions: " + conditions.join(", "));
    if (m.womenPregnant) alerts.push("Pregnant");
    if (m.underMedicalTreatment) alerts.push("Currently under medical treatment");
    if (m.prescribedMedicine) alerts.push("On prescribed medication");
    if (m.bloodType) alerts.push("Blood type " + m.bloodType);

    phEl("alerts").innerHTML = alerts.length
        ? '<p class="ph-alert">' + escapeHtml(alerts.join(" · ")) + '</p>'
        : "";

    phEl("medical").innerHTML = phRows([
        ["In good health",             phYesNo(m.goodHealth)],
        ["Under medical treatment",    phYesNo(m.underMedicalTreatment)],
        ["  — details",                m.medicalTreatmentDetails],
        ["Serious illness / operation", phYesNo(m.seriousIllnessOrOperation)],
        ["  — details",                m.illness_or_operation_details],
        ["Hospitalised",               phYesNo(m.hospitalized)],
        ["  — details",                m.hospitalization_details],
        ["Taking prescribed medicine", phYesNo(m.prescribedMedicine)],
        ["  — details",                m.prescribed_medicine_details],
        ["Uses tobacco",               phYesNo(m.tobaccoUse)],
        ["Uses alcohol / drugs",       phYesNo(m.drugsAlcoholUse)],
        ["Allergies",                  (m.allergies || []).join(", ")],
        ["Bleeding time",              m.bleedingTime],
        ["Blood type",                 m.bloodType],
        ["Pregnant",                   phYesNo(m.womenPregnant)],
        ["Nursing",                    phYesNo(m.womenNursing)],
        ["On birth control",           phYesNo(m.womenBirthControl)],
        ["Other conditions",           (m.conditionsChecklist || []).join(", ")],
        // As signed, never rewritten; a later name is noted beside it.
        ["Consent signed by",          consentSignedByText(p)],
        ["Consent date",               m.consentDate]
    ].concat(p.medicalHistoryEditedAt ? [
        // Staff and the doctor keep these answers up to date from here
        // (openHealthAnswers in js/records.js); the row says when they last did.
        ["Last updated by the clinic on", phClinicEditDate(p.medicalHistoryEditedAt)]
    ] : [])) + signatureBlockHtml(m, p);
}

/** "30 Sep 2026" from the stamp a clinic save leaves; the raw date if it will not parse. */
function phClinicEditDate(iso) {
    const when = new Date(iso);
    return isNaN(when.getTime())
        ? String(iso).slice(0, 10)
        : when.toLocaleDateString("en-PH", { dateStyle: "medium" });
}

/**
 * The consent signature, the way the paper card sets it out: the mark, a rule
 * under it, and the printed name under that.
 *
 * Patients who typed their name instead of drawing get the same block with the
 * line left empty and a note saying so, rather than nothing at all — "signed,
 * no mark on file" and "we never asked" are different facts about a consent
 * form, and only one of them is true here.
 */
function signatureBlockHtml(m, p) {
    const ink = signatureInk(m);
    const name = (m && m.consentSignature) || "";
    const when = (m && m.consentDate) ? String(m.consentDate).slice(0, 10) : "";
    if (!ink && !name) return "";
    // The printed name stays what was signed. A later name goes under it.
    const renamed = p && consentSignedUnderOldName(p)
        ? '<br>Signed under a previous name. Current name: ' + escapeHtml(patientFullName(p))
        : '';

    return '<figure class="ph-sign">' +
        '<figcaption class="ph-sign__label">' +
            '<span class="ph-sign__clinic">' +
                escapeHtml(CLINIC_CONSENT_CLINIC) + '</span>' +
            escapeHtml(CLINIC_CONSENT_HEADING) + '</figcaption>' +
        '<blockquote class="ph-sign__statement">' +
            escapeHtml(CLINIC_CONSENT_STATEMENT) + '</blockquote>' +
        '<div class="ph-sign__mark">' +
            (ink
                ? '<img class="ph-sign__ink" src="' + escapeHtml(ink) +
                  '" alt="' + escapeHtml("Signature drawn by " + (name || "the patient") +
                                         " at registration") + '">'
                : '<p class="ph-sign__typed">Typed at registration. ' +
                  'No drawn mark on file.</p>') +
            '<p class="ph-sign__name">' + ph(name) + '</p>' +
            '<p class="ph-sign__date">Signature over printed name' +
                (when ? '<br>Signed ' + escapeHtml(when) : '') + renamed + '</p>' +
        '</div>' +
        '</figure>';
}

/**
 * Paint the read-only chart, and list the findings underneath it.
 *
 * Only teeth with something recorded are listed — which is what the paper card
 * does too. It marks what is wrong; a healthy tooth is the absence of a mark,
 * not a row saying "healthy".
 */
function renderHistoryChart(p) {
    const teeth = p.teethStatus || {};

    if (typeof clearChart === "function") clearChart(historyChartScope());

    const rows = [];
    Object.keys(teeth).forEach(num => {
        const t = teeth[num];
        if (!t || !t.status) return;
        const surfaces = Array.isArray(t.surfaces) ? t.surfaces : [];
        if (typeof paintTooth === "function") paintTooth(historyChartScope(), num, t.status, surfaces, false, t.material);
        rows.push({ tooth: num, status: t.status, material: t.material || "", surfaces: surfaces, notes: t.notes || "" });
    });

    rows.sort((a, b) => Number(a.tooth) - Number(b.tooth));
    historyRecord.teeth = rows;

    const tbody = phEl("teeth-table");
    if (!tbody) return;
    tbody.innerHTML = rows.length
        ? rows.map(r =>
            '<tr><td><strong>' + ph(r.tooth) + '</strong></td>' +
            '<td>' + ph(phCondition(r.status, r.material)) + '</td>' +
            '<td>' + ph(r.surfaces.length ? r.surfaces.join(", ") : "whole tooth") + '</td>' +
            '<td>' + ph(r.notes) + '</td></tr>').join("")
        : '<tr><td colspan="4" style="text-align:center;">No findings recorded.</td></tr>';
}

/**
 * What a visit did to the chart, in words.
 *
 * Section C shows the mouth as it is NOW — teethStatus only ever holds the
 * current state, so a tooth that was decayed in March and filled in August
 * reads simply as "Filled" there, with nothing saying when that happened.
 *
 * submitCompleteAppointment() writes a teethUpdated snapshot onto the visit
 * for exactly that reason. Printing it here is what lets the exported card
 * answer "when did 36 become a filling?" — which is the question a dentist
 * actually asks of a history, and the one the paper card answers by having
 * older entries still legible above the newer ones.
 */
function phChartChanges(rec) {
    const changes = Array.isArray(rec.teethUpdated) ? rec.teethUpdated : [];
    if (!changes.length) return "";
    return changes.map(t => {
        const from = phCondition(t.previousStatus || "Healthy");
        const to = t.conditionStatus ? phCondition(t.conditionStatus, t.material) : "—";
        const surf = (Array.isArray(t.surfaces) && t.surfaces.length)
            ? " (" + t.surfaces.join(", ") + ")" : "";
        return "Tooth " + t.toothNumber + ": " + from + " → " + to + surf;
    }).join("; ");
}

function renderHistoryTreatments() {
    const tbody = phEl("treatments-table");
    if (!tbody) return;
    const list = historyRecord.treatments;

    tbody.innerHTML = list.length
        ? list.map(r => {
            const changed = phChartChanges(r);
            return '<tr><td>' + ph(r.recordDate) + '</td>' +
            '<td><strong>' + ph(r.treatmentName) + '</strong></td>' +
            '<td>' + ph(r.toothNumber) + '</td>' +
            '<td>' + (r.findings ? '<strong>Findings:</strong> ' + ph(r.findings) + '<br>' : "") +
                     '<strong>Diagnosis:</strong> ' + ph(r.diagnosis) + '<br>' +
                     '<strong>Treatment:</strong> ' + ph(r.treatmentDone) +
                     (changed ? '<br><span class="ph-chart-change"><strong>Chart:</strong> ' +
                                ph(changed) + '</span>' : "") + '</td>' +
            '<td>' + ph(r.prescription) + '</td></tr>';
        }).join("")
        : phMissing(historyRecord, "treatments")
            ? phMissingRow(5)
            : '<tr><td colspan="5" style="text-align:center;">No treatments logged.</td></tr>';
}

function renderHistoryVisits() {
    const tbody = phEl("visits-table");
    if (!tbody) return;
    const list = historyRecord.visits;

    tbody.innerHTML = list.length
        ? list.map(a =>
            '<tr><td>' + ph(a.appointmentDate) + '</td>' +
            '<td>' + ph(a.appointmentTime) + '</td>' +
            '<td>' + ph(a.treatmentName) + (a.isWalkIn ? " (walk-in)" : "") + '</td>' +
            '<td>' + ph(a.status) + '</td></tr>').join("")
        : phMissing(historyRecord, "visits")
            ? phMissingRow(4)
            : '<tr><td colspan="4" style="text-align:center;">No visits recorded.</td></tr>';
}

function renderHistoryAccount() {
    const body = phEl("account-body");
    if (!body) return;

    // Checked BEFORE the totals are computed. A refused billing query leaves
    // bills as an empty array, and an empty array sums to zero — so the panel
    // would print "Outstanding ₱0" for a ledger nobody was able to open. That
    // is not a missing section, it is a false statement about what a patient
    // owes, and it is the one failure here that could cost the clinic money.
    if (phMissing(historyRecord, "account")) {
        body.innerHTML = '<p class="ph-note ph-unreadable">' +
            'The bills, payments or voids could not be read, so no figures are shown. ' +
            'This is <strong>not</strong> a zero balance &mdash; it is an unknown one. ' +
            'Reload the page; if it keeps happening the security rules are refusing ' +
            'billing for this account and need to be redeployed.' +
            '</p>';
        return;
    }

    if (!historyRecord.accountVisible) {
        // Not an error, and not hidden either. A dentist should be able to see
        // that a section exists and why it is not theirs.
        body.innerHTML = '<p class="ph-note">' +
            'This account cannot see billing. The clinic\'s bills and payments are ' +
            'readable by the dentist and the front desk; this section, and the exported ' +
            'file, carry no money figures for you.' +
            '</p>';
        return;
    }

    const bills = historyRecord.bills;
    // The bill keeps adjustments and the paid amount. A voided receipt stays
    // in payments, while the bill is corrected in the void transaction.
    const figures = bills.map(b => historyBillFigures(historyRecord, b));
    if (figures.some(f => f.amountsInvalid)) {
        body.innerHTML = '<p class="ph-note ph-unreadable">Account needs review: a bill has a missing ' +
            'or invalid charge, adjustment or paid amount. Totals are withheld until its record is checked.</p>';
        return;
    }
    const sum = key => money(figures.reduce((s, f) => s + f[key], 0));
    const review = figures.some(f => f.balanceMismatch);

    body.innerHTML =
        '<dl class="ph-grid">' + phRows([
            ["Total charged",     peso(sum("charged"))],
            ["Additional fees",   peso(sum("fees"))],
            ["Discounts",         peso(sum("discount"))],
            ["Amount due",        peso(sum("due"))],
            ["Total collected",   peso(sum("paid"))]
        ].concat(sum("hmo") > 0 ? [["Charged to HMO", peso(sum("hmo"))]] : [], [
            ["Outstanding",       peso(sum("balance"))],
            ["Invoices",          bills.length]
        ])) + '</dl>' +
        (review ? '<p class="ph-note ph-unreadable">Account needs review: a saved paid amount or balance ' +
            'disagrees with active receipts or the bill calculation. The figures shown here are recalculated.</p>' : '') +
        (bills.length
            ? '<div class="table-container"><table><thead><tr>' +
              '<th>Date</th><th>For</th><th>Charged</th><th>Fees</th><th>Discount</th><th>Amount due</th><th>Paid</th><th>HMO</th><th>Balance</th><th data-card="badge">Status</th>' +
              '</tr></thead><tbody>' +
              bills.slice().sort((a, b) =>
                  String(b.billingDate || "").localeCompare(String(a.billingDate || "")))
                  .map(b => {
                      const f = historyBillFigures(historyRecord, b);
                      return (
                      '<tr><td>' + ph(b.billingDate) + '</td>' +
                      '<td>' + ph(b.treatmentName) + '</td>' +
                      '<td>' + escapeHtml(peso(f.charged)) + '</td>' +
                      '<td>' + escapeHtml(peso(f.fees)) + '</td>' +
                      '<td>' + escapeHtml(peso(f.discount)) + '</td>' +
                      '<td>' + escapeHtml(peso(f.due)) + '</td>' +
                      '<td>' + escapeHtml(peso(f.paid)) + '</td>' +
                      '<td>' + (f.hmo > 0 ? escapeHtml(peso(f.hmo) + " " + (b.hmoProvider || "")) +
                          (b.hmoStatus === "Collected" ? "" : " (to collect)") : "—") + '</td>' +
                      '<td>' + escapeHtml(peso(f.balance)) + '</td>' +
                      '<td>' + (f.balanceMismatch ? 'Needs review' : ph(b.paymentStatus)) + '</td></tr>');
                  }).join("") +
              '</tbody></table></div>'
            : '<p class="ph-note">No invoices raised.</p>');
}

function renderHistoryFiles() {
    const tbody = phEl("files-table");
    if (!tbody) return;
    const list = historyRecord.files;

    tbody.innerHTML = list.length
        ? list.map(f =>
            '<tr><td>' + ph(f.fileName) + '</td>' +
            '<td>' + ph(phSize(f.sizeBytes)) + '</td>' +
            '<td>' + ph(f.createdAt ? String(f.createdAt).slice(0, 10) : "") + '</td>' +
            '<td>' + (f.archived
                        ? "Archived — " + ph(f.archiveLocation || "clinic drive")
                        : "In cloud storage") + '</td></tr>').join("")
        : phMissing(historyRecord, "files")
            ? phMissingRow(4)
            : '<tr><td colspan="4" style="text-align:center;">No files uploaded.</td></tr>';
}

/** Bytes, in the units a person reads. */
function phSize(bytes) {
    const n = Number(bytes);
    if (!n || n < 0) return "";
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(0) + " KB";
    return (n / (1024 * 1024)).toFixed(1) + " MB";
}


// ─────────────────────────────────────────────────────────────
// The export
// ─────────────────────────────────────────────────────────────
//
// A PDF, because the point of this button is a file that outlives the system
// that made it. JSON would be better for re-importing and worse for every other
// purpose — and the whole-database JSON export in js/backup.js already covers
// re-importing. This one is for a person: printable, readable on any machine,
// and still readable in ten years with no DentCare to open it in.
//
// jsPDF and jspdf-autotable are already loaded on the portal for the billing
// reports (see templates/partials/page-head.php), so this costs no new
// download.

/** One section heading plus a table, with the page breaks handled. */
// ─────────────────────────────────────────────────────────────
// Text the PDF font can actually print — added 2026-09-14
// ─────────────────────────────────────────────────────────────
//
// jsPDF's built-in Helvetica covers only the Windows-1252 character set. The
// moment one string contains anything outside it — the peso sign ₱, an arrow →
// — jsPDF re-encodes the WHOLE string as two-byte text that this font cannot
// show: "₱1,500.00" printed as "±1,500.00", and every other letter in the line
// came out spaced apart. That is what made the chart column look scrambled.
//
// So every string goes through here first: the arrow becomes a word, and
// anything else the font cannot draw becomes "?" instead of breaking the line.
const PDF_EXTRA_GLYPHS = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";

function pdfText(value) {
    return String(value == null ? "" : value)
        .replace(/→/g, " to ")
        .replace(/₱\s*/g, "")
        .replace(/[^\n\r\t\x20-\x7E\xA0-\xFF]/g, ch => (PDF_EXTRA_GLYPHS.indexOf(ch) !== -1 ? ch : "?"));
}

/**
 * An amount for the PDF: the number alone, e.g. 1,500.00.
 *
 * No currency sign, by the clinic's choice (2026-09-14): the peso sign cannot
 * be printed by the PDF font, and the amounts sit under "Charged / Paid /
 * Balance" headings where the currency is not in question.
 */
function pdfAmount(n) {
    const v = Math.round((Number(n) || 0) * 100) / 100;
    return v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * The teeth a visit charted, one per line: "36: Filled".
 *
 * Just the tooth and what it is now. The clinic found the longer form
 * ("Tooth 36: Decayed to Filled (occlusal)") cluttered in the exported card;
 * the row's own date already says when the tooth became what it is.
 */
function pdfTeethOfVisit(rec) {
    const changes = Array.isArray(rec.teethUpdated) ? rec.teethUpdated : [];
    if (!changes.length) return rec.toothNumber || "—";
    return changes
        .slice()
        .sort((a, b) => Number(a.toothNumber) - Number(b.toothNumber))
        .map(t => t.toothNumber + ": " + (t.conditionStatus ? phCondition(t.conditionStatus, t.material) : "—"))
        .join("\n");
}

/**
 * What was charged for one visit, or "" when no bill belongs to it.
 *
 * A bill points at the visit that raised it through recordId (and, for a
 * booked visit, appointmentId). Matched on those ids, never on the date or the
 * treatment name: two visits on one day would otherwise share a charge.
 */
function pdfBillsOfVisit(rec, bills) {
    return (bills || []).filter(b =>
        (b.recordId && b.recordId === rec.id) ||
        (!b.recordId && b.appointmentId && b.appointmentId === rec.appointmentId));
}

function pdfChargeOfVisit(rec, bills, record) {
    const own = pdfBillsOfVisit(rec, bills);
    if (!own.length) return "";
    const figures = own.map(b => record ? historyBillFigures(record, b) : billFigures(b));
    const sum = key => money(figures.reduce((s, f) => s + f[key], 0));
    const lines = [pdfAmount(sum("charged"))];
    if (sum("fees")) lines.push("Fees +" + pdfAmount(sum("fees")));
    if (sum("discount")) lines.push("Discount -" + pdfAmount(sum("discount")));
    if (sum("fees") || sum("discount")) lines.push("Due " + pdfAmount(sum("due")));
    return lines.join("\n");
}

/** What has been paid against that visit's bill, e.g. 1,000.00 (0.00 if nothing yet). */
function pdfPaidOfVisit(rec, bills, record) {
    const own = pdfBillsOfVisit(rec, bills);
    if (!own.length) return "";
    const figures = own.map(b => record ? historyBillFigures(record, b) : billFigures(b));
    const hmo = money(figures.reduce((sum, f) => sum + f.hmo, 0));
    return pdfAmount(figures.reduce((sum, f) => sum + f.paid, 0)) +
        (hmo > 0 ? "\nHMO " + pdfAmount(hmo) : "");
}

/**
 * The treatment record the way the clinic's paper card lays it out:
 * Date | Tooth No. | Treatment / Operation | Charge, with Paid and
 * Prescription added. Oldest visit first, so the rows grow downward the way
 * the card fills in.
 *
 * Charge and Paid are left out when the account could not be read or is not
 * this account's to see. A blank would read as "free" or "nothing paid".
 */
function pdfTreatmentRecord(record) {
    const withCharge = record.accountVisible && !phMissing(record, "account") &&
        !(record.bills || []).some(b => historyBillFigures(record, b).amountsInvalid);
    const head = ["Date", "Tooth No.", "Treatment / Operation"]
        .concat(withCharge ? ["Charge", "Paid"] : [], ["Prescription"]);

    const body = record.treatments.slice()
        .sort((a, b) => String(a.recordDate || "").localeCompare(String(b.recordDate || "")))
        .map(r => {
            const operation = [
                r.treatmentName || "—",
                r.findings      ? "Findings: "  + r.findings      : "",
                r.diagnosis     ? "Diagnosis: " + r.diagnosis     : "",
                r.treatmentDone ? "Done: "      + r.treatmentDone : ""
            ].filter(Boolean).join("\n");
            return [r.recordDate || "—", pdfTeethOfVisit(r), operation]
                .concat(withCharge ? [pdfChargeOfVisit(r, record.bills, record) || "—",
                                      pdfPaidOfVisit(r, record.bills, record)   || "—"] : [],
                        [r.prescription || "—"]);
        });

    // Re-proportioned for the half sheet. The fixed columns hold what cannot
    // wrap (a date, an amount); Treatment / Operation takes what is left of
    // the 145.1 mm and wraps.
    const columnStyles = { 0: { cellWidth: 20 }, 1: { cellWidth: 21 } };
    if (withCharge) {
        columnStyles[3] = { cellWidth: 18, halign: "right" };
        columnStyles[4] = { cellWidth: 18, halign: "right" };
        columnStyles[5] = { cellWidth: 28 };
    } else {
        columnStyles[3] = { cellWidth: 38 };
    }
    return { head: head, body: body, columnStyles: columnStyles };
}

// ── The record card's building blocks (redesigned 2026-09-16) ──────────────
//
// The clinic compared the export with Dr. Gapit's paper card and found it
// harder to read: seven ruled tables one after another (information, medical
// history, findings, treatments, visits, account, files), each looking as
// important as the next. The paper card is a form on the front and a chart
// with one ruled treatment table on the back. These helpers draw it that way:
// label-and-answer rows with no grid for the form, a highlighted box for what
// the dentist must see before treating, and one ruled table for treatments.

const PDF_BRAND = [23, 96, 143];

/** A section title with a thin rule under it. Returns the y to continue at. */
function pdfSectionTitle(doc, title, y) {
    // A title with no room for anything under it goes to the next page.
    if (y > CARD_BOTTOM - 18) { doc.addPage(); y = CARD_TOP; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(PDF_BRAND[0], PDF_BRAND[1], PDF_BRAND[2]);
    doc.text(pdfText(title), CARD_LEFT, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0);
    doc.setDrawColor(205);
    doc.setLineWidth(0.25);
    doc.line(CARD_LEFT, y + 1.8, CARD_RIGHT, y + 1.8);
    return y + 3.2;
}

/**
 * Label / answer rows, two pairs to a line, with no grid: the front of the card.
 * A row of two entries spans the full width (an address, a list of allergies).
 * Answers are bold and labels grey, so the eye lands on the answers.
 */
/** How wide a label column is on the form. The answer beside it takes the rest. */
const PDF_FORM_LABEL = 30;

function pdfForm(doc, title, rows, startY) {
    const y = pdfSectionTitle(doc, title, startY);
    const label = t => ({ content: pdfText(t), styles: { textColor: [115, 115, 115] } });
    const answer = (t, span) => ({
        content: pdfText(t == null || t === "" ? "—" : t),
        colSpan: span || 1,
        styles: { textColor: [20, 20, 20], fontStyle: "bold" }
    });
    const body = rows.map(r => r.length === 2
        ? [label(r[0]), answer(r[1], 3)]
        : [label(r[0]), answer(r[1]), label(r[2]), answer(r[3])]);

    doc.autoTable({
        startY: y,
        head: [[title, "", "", ""]],
        showHead: "never",
        body: body,
        theme: "plain",
        styles: { fontSize: 8.5, cellPadding: { top: 1.3, bottom: 1.3, left: 0, right: 3 }, overflow: "linebreak" },
        // Two label / answer pairs across the usable width; long answers wrap.
        columnStyles: { 0: { cellWidth: PDF_FORM_LABEL }, 1: { cellWidth: CARD_WIDTH / 2 - PDF_FORM_LABEL },
                        2: { cellWidth: PDF_FORM_LABEL }, 3: { cellWidth: CARD_WIDTH / 2 - PDF_FORM_LABEL } },
        margin: cardTableMargin()
    });
    return doc.lastAutoTable.finalY + 6;
}

/**
 * The consent, as the paper card sets it out: the drawn mark, a rule under it,
 * the printed name under that, and the date it was signed.
 *
 * Kept off the medical-history table on purpose. A signature is not an answer
 * to a question; it is the thing that makes the answers above it count, and on
 * the card it has always had a line of its own.
 *
 * @returns {number} the y to carry on from
 */
function pdfConsent(doc, m, startY) {
    const ink = signatureInk(m);
    const name = (m && m.consentSignature) || "";
    const when = (m && m.consentDate) ? String(m.consentDate).slice(0, 10) : "";
    if (!ink && !name) return startY;

    // The block is 32mm tall once the mark, the rule and the two lines under it
    // are counted. Started on a fresh page rather than split across two, which
    // would put a signature on one page and the name it stands over on another.
    // The statement is wrapped first, because how tall this block is decides
    // whether it fits on the page at all. Splitting it would put a signature on
    // one page and the words it stands under on another.
    //
    // The FONT IS SET BEFORE THE WRAP, and this is not tidiness: jsPDF measures
    // splitTextToSize in whatever font is currently active, which here is
    // whatever the medical-history table happened to leave behind. Measured at
    // one size and drawn at another, the paragraph wraps to a width that has
    // nothing to do with the page — the second card in a bulk export wrapped
    // wider than the first for exactly this reason (found 2026-09-18 by
    // rendering a real PDF; no stub can see it).
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    const lines = doc.splitTextToSize(CLINIC_CONSENT_STATEMENT, CARD_WIDTH);
    const needed = 21 + (lines.length * 4) + 34;
    if (startY + needed > CARD_BOTTOM) { doc.addPage(); startY = CARD_TOP; }

    let y = pdfSectionTitle(doc, "Consent", startY) + 2;

    // Whose consent, then what was consented to: two stacked lines at the left
    // margin, the clinic quietly above the title it belongs to.
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(125);
    doc.text(pdfText(CLINIC_CONSENT_CLINIC), CARD_LEFT, y + 2.5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(PDF_BRAND[0], PDF_BRAND[1], PDF_BRAND[2]);
    doc.text(pdfText(CLINIC_CONSENT_HEADING), CARD_LEFT, y + 7.5);

    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(60);
    doc.text(lines, CARD_LEFT, y + 13);
    y += 13 + (lines.length * 4) + 3;

    // The signature sits UNDER the declaration, at the left margin, lined up
    // with every other block on the card. 60mm wide.
    const signX = CARD_LEFT;

    let drawn = false;
    if (ink) {
        try {
            // The pad is 600 by 160, so 60mm by 16mm keeps the handwriting the
            // shape the patient drew rather than stretching it.
            doc.addImage(ink, "PNG", signX, y, 60, 16);
            drawn = true;
        } catch (err) {
            // One unreadable image must never take down a 500-patient export.
            console.error("Could not draw the stored signature:", err);
        }
    }
    if (!drawn) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(7.5);
        doc.setTextColor(140);
        doc.text(pdfText("Typed at registration."), signX, y + 13);
    }
    y += 17;

    // 60mm, the width of the mark above it. It ran to the page margin while the
    // block was briefly over on the right, and stayed there when it moved back:
    // a rule across the whole page reads as a section divider, not as the line
    // somebody signs on.
    doc.setDrawColor(150);
    doc.setLineWidth(0.3);
    doc.line(signX, y, signX + 60, y);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(20);
    doc.text(pdfText(name || "Not recorded"), signX, y + 5);

    // Two short lines rather than one long one, so nothing runs off the page.
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(120);
    doc.text(pdfText(drawn ? "Signature over printed name"
                           : "Printed name only. No drawn signature on file."),
             signX, y + 9);
    if (when) doc.text(pdfText("Signed " + when), signX, y + 12.5);
    doc.setTextColor(0);

    return y + 18;
}

/** "Yes — on maintenance meds" / "No" / "—". */
function pdfYesNoDetail(flag, details) {
    const yn = phYesNo(flag);
    return flag === true && details ? yn + " — " + details : yn;
}

/**
 * What the dentist must know before treating, in one box at the top.
 * Empty when nothing on the questionnaire calls for care.
 */
function pdfHealthAlerts(m) {
    const alerts = [];
    if ((m.allergies || []).length) alerts.push("Allergic to: " + m.allergies.join(", "));
    if ((m.conditionsChecklist || []).length) alerts.push("Conditions: " + m.conditionsChecklist.join(", "));
    if (m.womenPregnant === true) alerts.push("Pregnant");
    if (m.womenNursing === true) alerts.push("Nursing");
    if (m.underMedicalTreatment === true) {
        alerts.push("Under medical treatment" + (m.medicalTreatmentDetails ? ": " + m.medicalTreatmentDetails : ""));
    }
    if (m.prescribedMedicine === true) {
        alerts.push("Takes prescribed medicine" + (m.prescribed_medicine_details ? ": " + m.prescribed_medicine_details : ""));
    }
    return alerts;
}

function phTable(doc, title, head, body, startY, opts) {
    if (!body.length) return startY;
    doc.autoTable(Object.assign({
        startY: startY,
        head: [head.map(pdfText)],
        body: body.map(row => row.map(pdfText)),
        theme: "grid",
        headStyles: { fillColor: [23, 96, 143], fontSize: 8.5 },
        styles: { fontSize: 8, cellPadding: 1.8, overflow: "linebreak" },
        margin: cardTableMargin(),
        // A visit is kept on one page when it fits on one. On the half sheet a
        // row split across two pages left a date on one and its charge on the next.
        rowPageBreak: "avoid",
        didDrawPage: () => {}
    }, opts || {}));
    return doc.lastAutoTable.finalY + 8;
}

/**
 * One patient's record card, as its own PDF.
 *
 * @param {object} [sharedRecord] build this record instead of the open one, and
 *                                RETURN the document rather than saving it
 *
 * With no argument it behaves as it always did: the patient on screen, saved to
 * their own file. Passed a record it hands the finished document back, which is
 * how exportAllPatientRecords() produces one file per patient.
 *
 * It used to append into a shared document instead, so "export everything"
 * produced a single ninety-page book. The clinic's response to that was
 * immediate and correct: nobody can use it. A record card is a per-patient
 * thing — it goes in that patient's folder, gets printed on its own, gets
 * handed to whoever asked for it. One file per person is the only shape that
 * matches what it is.
 */
/**
 * What one patient's file is called.
 *
 * Surname first, so a folder of these sorts the way the paper cards are filed
 * in the cabinet — which is how the clinic already looks things up.
 */
function recordCardFileName(record) {
    const p = record.patient || {};
    const safe = (v) => String(v || "").replace(/[^\w\- ]+/g, "").trim();
    return (safe(p.lastName) || "Patient") + ", " + (safe(p.firstName) || "") +
           " — " + (typeof localDateKey === "function" ? localDateKey() : new Date().toISOString().slice(0, 10)) + ".pdf";
}

function exportPatientRecordCard(sharedRecord) {
    const record = sharedRecord || historyRecord;
    const bulk = !!sharedRecord;

    if (!record) {
        showToast("Open a patient first.", "warning");
        return;
    }
    // A single card from its button fetches the PDF tools on first use. The
    // bulk export loads them before its loop, so a card built there never
    // waits here and this function stays synchronous for it.
    if (!bulk && typeof retryWithReportLibraries === "function" &&
        retryWithReportLibraries(["jspdf", "autotable"], () => exportPatientRecordCard())) return;
    if (typeof window.jspdf === "undefined") {
        showToast("The PDF library did not load. Reload the page and try again.", "error");
        return;
    }

    const btn = bulk ? null : phEl("export-btn");
    if (btn) btn.disabled = true;
    if (!bulk) setHistoryStatus("Building the file…");

    try {
        const { jsPDF } = window.jspdf;
        // The half sheet, portrait. The folder export builds its files with
        // this same function, so they are half-sheet pages too.
        const doc = new jsPDF({ unit: "mm", format: [CARD_PAGE.w, CARD_PAGE.h], orientation: "portrait" });
        const p = record.patient;
        const age = getPatientAge(p);
        const fullName = patientFullName(p);

        // ── Header ────────────────────────────────────────────────────────
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.setTextColor(PDF_BRAND[0], PDF_BRAND[1], PDF_BRAND[2]);
        doc.text("DENTAL RECORD CARD", CARD_LEFT, 17);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(90);
        doc.text("Dr. Reina G. Gapit Dental Clinic, Naga City", CARD_RIGHT, 17, { align: "right" });
        doc.setDrawColor(PDF_BRAND[0], PDF_BRAND[1], PDF_BRAND[2]);
        doc.setLineWidth(0.6);
        doc.line(CARD_LEFT, 20, CARD_RIGHT, 20);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.setTextColor(0);
        // A long name wraps rather than running off the page.
        const nameLines = doc.splitTextToSize(pdfText(fullName || "Unnamed patient"), CARD_WIDTH);
        doc.text(nameLines, CARD_LEFT, 29);
        let headY = 29 + (nameLines.length - 1) * 6 + 6;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(70);
        doc.text(pdfText(
            (age === null ? "Age —" : "Age " + age) +
            "   ·   " + (p.gender || "—") +
            "   ·   " + (p.phoneNumber || "no contact number")),
            CARD_LEFT, headY);
        // Says when the copy was taken. A record card with no date on it cannot
        // be told apart from a newer one printed a year later.
        // A marked patient says so on the card itself, or a printed copy of a
        // deceased patient's record reads as a current one.
        const cardStatus = typeof patientStatusOf === "function" ? patientStatusOf(p) : "active";
        if (cardStatus !== "active") {
            doc.setFont("helvetica", "bold");
            doc.setFontSize(9.5);
            doc.setTextColor(150, 30, 30);
            // On a line of its own, wrapped: beside the age line it could
            // run into it on a page this narrow.
            const statusLines = doc.splitTextToSize(pdfText(PATIENT_STATUS_LABEL[cardStatus].toUpperCase() +
                     (p.statusAt ? "  \u00b7  " + String(p.statusAt).slice(0, 10) : "") +
                     (p.statusNote ? "  \u00b7  " + p.statusNote : "")), CARD_WIDTH);
            headY += 5;
            doc.text(statusLines, CARD_LEFT, headY);
            headY += (statusLines.length - 1) * 4.2;
            doc.setFont("helvetica", "normal");
            doc.setTextColor(0);
        }

        headY += 5;
        doc.setFontSize(8);
        doc.setTextColor(130);
        doc.text(pdfText("Exported " + record.loadedAt.toLocaleString() +
                 " by " + (currentUser || currentEmail || "unknown")), CARD_LEFT, headY);
        doc.setTextColor(0);

        let y = headY + 7;
        const m = p.medicalHistory || {};

        // ── Health alerts: the first thing the dentist reads ──────────────
        const alerts = pdfHealthAlerts(m);
        if (alerts.length) {
            doc.autoTable({
                startY: y,
                head: [["Health alerts"]],
                showHead: "never",
                body: [[pdfText("HEALTH ALERTS:  " + alerts.join("   ·   "))]],
                theme: "plain",
                styles: {
                    fontSize: 9, fontStyle: "bold", cellPadding: 2.6,
                    fillColor: [253, 236, 234], textColor: [150, 30, 30], overflow: "linebreak"
                },
                margin: cardTableMargin()
            });
            y = doc.lastAutoTable.finalY + 7;
        }

        // ── Patient information: the front of the card ────────────────────
        const minor = p.minorInfo || {};
        y = pdfForm(doc, "Patient information", [
            ["Date of birth", p.dateOfBirth, "Sex", p.gender],
            ["Civil status", p.civilStatus, "Nationality", p.nationality],
            ["Occupation", p.occupation, "Contact no.", p.phoneNumber],
            ["Address", p.address],
            ["Email", p.email, "Emergency contact", p.emergencyContact],
            ["Referred by", p.referredBy, "Previous dentist", p.formerDentist]
        ].concat(minor.isMinor ? [
            ["Parent / guardian", minor.parentName, "Guardian's contact", minor.parentPhone]
        ] : []), y);

        // ── Medical history ───────────────────────────────────────────────
        y = pdfForm(doc, "Medical history", [
            ["In good health", phYesNo(m.goodHealth),
             "Under treatment", pdfYesNoDetail(m.underMedicalTreatment, m.medicalTreatmentDetails)],
            ["Serious illness / operation", pdfYesNoDetail(m.seriousIllnessOrOperation, m.illness_or_operation_details),
             "Hospitalised", pdfYesNoDetail(m.hospitalized, m.hospitalization_details)],
            ["Prescribed medicine", pdfYesNoDetail(m.prescribedMedicine, m.prescribed_medicine_details),
             "Tobacco / alcohol", phYesNo(m.tobaccoUse) + " / " + phYesNo(m.drugsAlcoholUse)],
            ["Blood type", m.bloodType, "Bleeding time", m.bleedingTime],
            ["Pregnant / nursing", phYesNo(m.womenPregnant) + " / " + phYesNo(m.womenNursing),
             "Birth control", phYesNo(m.womenBirthControl)],
            ["Allergies", (m.allergies || []).join(", ") || "None recorded"],
            ["Other conditions", (m.conditionsChecklist || []).join(", ") || "None recorded"],
            ["Consent signed by", consentSignedByText(p)]
        ], y);

        // The mark itself, under the answers it stands over.
        y = pdfConsent(doc, m, y);

        // ── The back of the card: the chart ───────────────────────────────
        //
        // Derived from the patient's teethStatus, not from the screen render:
        // the bulk export never draws a screen. Given its own page, because it
        // is 80mm tall and is what a dentist opens the file to look at.
        const teethRows = recordTeeth(record);
        doc.addPage();
        y = pdfSectionTitle(doc, "Dental chart", CARD_TOP) + 5;
        y = drawToothChart(doc, teethRows, y);

        // The findings, as a short list under the chart rather than a ruled
        // table: tooth, condition, surfaces and the dentist's note.
        if (teethRows.length) {
            doc.autoTable({
                startY: y,
                head: [["Tooth", "Condition", "Surfaces", "Notes"]],
                body: teethRows.map(t => [
                    pdfText(t.tooth), pdfText(phCondition(t.status, t.material)),
                    pdfText(t.surfaces.length ? t.surfaces.join(", ") : "whole tooth"),
                    pdfText(t.notes || "—")
                ]),
                theme: "plain",
                headStyles: { fontStyle: "bold", textColor: PDF_BRAND, fontSize: 8 },
                styles: { fontSize: 8, cellPadding: { top: 1, bottom: 1, left: 0, right: 3 }, overflow: "linebreak" },
                // Tooth, condition and surfaces are fixed; the note takes the rest.
                columnStyles: { 0: { cellWidth: 12 }, 1: { cellWidth: 30 }, 2: { cellWidth: 36 } },
                margin: cardTableMargin()
            });
            y = doc.lastAutoTable.finalY + 8;
        } else {
            doc.setFontSize(9);
            doc.text("Dental chart: no findings recorded.", CARD_LEFT, y);
            y += 8;
        }

        // ── Treatment record: the one ruled table, as on the paper card ───
        // Date | Tooth No. | Treatment / Operation | Charge | Paid |
        // Prescription, one row per visit, oldest first. See pdfTreatmentRecord().
        if (y > CARD_BOTTOM - 30) { doc.addPage(); y = CARD_TOP; }
        y = pdfSectionTitle(doc, "Treatment record", y);
        if (record.treatments.length) {
            const tr = pdfTreatmentRecord(record);
            y = phTable(doc, "D", tr.head, tr.body, y, { columnStyles: tr.columnStyles });
        } else {
            doc.setFontSize(9);
            doc.text("No treatments recorded yet.", CARD_LEFT, y + 4);
            y += 11;
        }

        // ── Account, reconciled under the treatments ──────────────────────
        // Every bill for the patient, including any not tied to a visit above.
        if (y > CARD_BOTTOM - 30) { doc.addPage(); y = CARD_TOP; }
        doc.setFontSize(9);
        if (phMissing(record, "account")) {
            doc.setTextColor(150, 30, 30);
            doc.text("Account: could not be read — this is NOT a zero balance.", CARD_LEFT, y);
            doc.setTextColor(0);
            y += 8;
        } else if (record.accountVisible && record.bills.length) {
            const figures = record.bills.map(b => historyBillFigures(record, b));
            if (figures.some(f => f.amountsInvalid)) {
                doc.setTextColor(150, 30, 30);
                doc.text("Account needs review: a bill has missing or invalid amounts.", CARD_LEFT, y);
                doc.setTextColor(0);
                y += 8;
            } else {
                const sum = key => money(figures.reduce((t, f) => t + f[key], 0));
                const adjusted = sum("fees") || sum("discount");
                const review = figures.some(f => f.balanceMismatch);
                doc.setFont("helvetica", "bold");
                doc.text("Total charged " + pdfAmount(sum("charged")), CARD_LEFT, y);
                y += 5;
                if (adjusted) {
                    doc.text("Fees " + pdfAmount(sum("fees")) +
                             "   Discount " + pdfAmount(sum("discount")), CARD_LEFT, y);
                    y += 5;
                }
                doc.text((adjusted ? "Amount due " + pdfAmount(sum("due")) + "   " : "") +
                         "Paid " + pdfAmount(sum("paid")) +
                         (sum("hmo") > 0 ? "   HMO " + pdfAmount(sum("hmo")) : "") +
                         "   Balance " + pdfAmount(sum("balance")), CARD_LEFT, y);
                if (review) {
                    y += 5;
                    doc.setTextColor(150, 30, 30);
                    doc.text("Account needs review: saved figures differ.", CARD_LEFT, y);
                    y += 4;
                    doc.text("Check receipts and bill adjustments in Billing.", CARD_LEFT, y);
                    doc.setTextColor(0);
                }
                doc.setFont("helvetica", "normal");
                y += 8;
            }
        }

        // ── X-ray files, only when there are any ──────────────────────────
        if (record.files.length) {
            y = pdfSectionTitle(doc, "X-ray files on record", y);
            doc.autoTable({
                startY: y,
                head: [["X-ray files on record"]],
                showHead: "never",
                body: record.files.map(f => [pdfText(
                    (f.fileName || "—") + "   ·   " + (phSize(f.sizeBytes) || "—") + "   ·   " +
                    (f.createdAt ? String(f.createdAt).slice(0, 10) : "—") + "   ·   " +
                    (f.archived ? "Archived: " + (f.archiveLocation || "clinic drive") : "Cloud storage"))]),
                theme: "plain",
                styles: { fontSize: 8, cellPadding: { top: 1, bottom: 1, left: 0, right: 0 }, overflow: "linebreak" },
                margin: cardTableMargin()
            });
            y = doc.lastAutoTable.finalY + 6;
        }

        // ── Page numbers, added last ──────────────────────────────────────
        // Only now is the page count known. A record card that runs to four
        // pages and says so is one somebody can tell is complete.
        const pages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pages; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(130);
            doc.text(pdfText(fullName + "  ·  page " + i + " of " + pages), CARD_LEFT, CARD_FOOT);
            doc.setTextColor(0);
        }

        // Surname first, then the date — so a folder of these sorts by patient
        // the way the paper cards are filed in the cabinet.
        const fileName = recordCardFileName(record);

        // Handed back rather than saved, so the caller can put it in a folder
        // alongside twenty-three others.
        if (bulk) return { doc: doc, fileName: fileName };

        doc.save(fileName);
        setHistoryStatus("Saved. Keep a copy on the clinic's external drive.", "ok");
        showToast("Record card exported.", "success");
    } catch (err) {
        console.error("Could not build the record card:", err);
        if (!bulk) {
            setHistoryStatus("Could not build the file. Nothing was changed.", "error");
            showToast("Could not build the record card.", "error");
        }
        // Re-thrown in bulk so the caller can name which patient failed rather
        // than producing a file with a silent gap in it.
        if (bulk) throw err;
    } finally {
        if (btn) btn.disabled = false;
    }
}


/**
 * Every patient's record card, in one PDF.
 *
 * ── WHY THIS EXISTS ALONGSIDE THE JSON BACKUP ────────────────────────────
 *
 * js/backup.js already exports the whole database, and that file is the right
 * one for putting the system back. It is also a .json file, which is of no use
 * at all to Dr. Gapit: she cannot open it, cannot read it, and cannot check
 * whether it contains what she thinks it does.
 *
 * A backup nobody can read is a backup nobody trusts, and this clinic has
 * already lost its records once. So this is the other half: one file, every
 * patient, in the layout of the paper card she has used for years. It opens in
 * any PDF reader on any machine, it prints, and it is still readable in ten
 * years with no DentCare to open it in.
 *
 * Take both. The JSON restores the system; this one survives it.
 */
async function exportAllPatientRecords() {
    if (typeof loadReportLibraries === "function") {
        await loadReportLibraries(["jspdf", "autotable", "jszip"])
            .catch(err => console.warn("Export tools did not load:", err));
    }
    if (typeof window.jspdf === "undefined") {
        showToast("The PDF library did not load. Reload the page and try again.", "error");
        return;
    }
    if (typeof JSZip === "undefined") {
        showToast("The folder library did not load. Reload the page and try again.", "error");
        return;
    }

    // Every button that starts this export, wherever it lives. Patient History
    // has one and Backup & Recovery has another; both must lock together.
    const btns = [phEl("export-all-btn"),
                  document.getElementById("backup-records-btn")].filter(Boolean);
    const lock = (on) => btns.forEach(b => { b.disabled = on; });
    const say = (msg, kind) => setHistoryStatus(msg, kind);

    // ── The restore file rides along inside the ZIP (clinic request, 2026-09-15)
    // The doctor is not technical, and a separate .json she cannot open was one
    // more thing to lose track of. So an owner's export also puts the full backup
    // file inside the ZIP, in its own clearly named folder. To restore, she
    // chooses this same ZIP on Records Backup; js/backup.js reads the file out of
    // it. Staff exports carry the PDFs only: restoring is the owner's job, and
    // collectDatabaseBackup() reads collections a staff role does not need.
    //
    // ── THIS IS NOW THE CLINIC'S ONLY BACKUP BUTTON (2026-09-16) ────────────
    //
    // "Download full backup" was removed from Records Backup, because this
    // export already contains that exact file and two buttons that did almost
    // the same thing was the confusion. That makes the backup depend on an
    // export whose OTHER job is printing, so everything below is written so a
    // bad day for the printing half cannot cost the clinic its backup:
    //
    //   • no patients loaded  → the backup is still offered, on its own
    //   • no PDF could be built → the ZIP is still written, with the backup in it
    //   • the backup failed but PDFs worked → the ZIP is saved and says plainly
    //     that it CANNOT restore the system, rather than looking like a backup
    //
    // Only losing both counts as nothing exported.
    const withRestoreFile = typeof collectDatabaseBackup === "function" &&
                            typeof canManageBackups === "function" && canManageBackups();

    const ids = (chartPatientCache || []).map(x => x.patient_id).filter(Boolean);
    if (!ids.length && !withRestoreFile) {
        say("No patients to export yet.", "error");
        showToast("The patient list has not loaded. Reopen this tab and try again.", "warning");
        return;
    }

    if (!(await confirmDialog((ids.length
            ? "Export a separate record card for each of the " + ids.length +
              " patients?\n\n" +
              "You will get one ZIP file. Open it and you have a folder with one " +
              "PDF per patient, named surname first." +
              (withRestoreFile
                  ? " It also holds the backup file, so this same ZIP can be used " +
                    "to restore the system."
                  : "")
            : "The patient list is empty, so there are no record cards to print.\n\n" +
              "Download the backup on its own? It still holds the whole system: " +
              "appointments, bills, receipts, stock and the rest.") +
                 " Save it to the clinic's external drive.",
                 { title: "Export patient records?", confirmLabel: "Export" }))) {
        return;
    }

    lock(true);

    const zip = new JSZip();
    const folder = zip.folder("DentCare Patient Records " +
                              (typeof localDateKey === "function" ? localDateKey() : new Date().toISOString().slice(0, 10)));

    const failed = [];

    // Collections that came back unreadable for at least one patient. The file
    // itself says so on the page it affects; this is so the person who pressed
    // the button hears it too, before they file the folder and move on.
    const incomplete = [];

    const used = {};
    let done = 0;

    // One patient at a time. Two dozen patients each firing five parallel reads
    // at once is a good way to have one of them time out on the clinic's
    // connection, and a record card missing from a folder that does not mention
    // it is worse than a slow export.
    const next = (i) => {
        if (i >= ids.length) return Promise.resolve();

        say("Building… " + (i + 1) + " of " + ids.length);

        return fetchPatientRecord(ids[i])
            .then(record => {
                if (!record) { failed.push(ids[i] + " (no longer exists)"); return; }

                (record.unavailable || []).forEach(col => {
                    if (incomplete.indexOf(col) === -1) incomplete.push(col);
                });

                const built = exportPatientRecordCard(record);
                if (!built) { failed.push(ids[i]); return; }

                // Two patients really can share a name. Left alone, the second
                // would overwrite the first inside the zip and the folder would
                // be short by one with nothing saying so.
                let name = built.fileName;
                if (used[name]) {
                    used[name] += 1;
                    name = name.replace(/\.pdf$/, "") + " (" + used[name] + ").pdf";
                } else {
                    used[name] = 1;
                }

                folder.file(name, built.doc.output("blob"));
                done++;
            })
            .catch(err => {
                console.error("Could not add " + ids[i] + " to the export:", err);
                failed.push(ids[i]);
            })
            .then(() => next(i + 1));
    };

    // What happened to the restore file: null when not included.
    let restoreFile = null;

    next(0)
        .then(() => {
            // Not "if (!done) give up". A day on which no record card can be
            // built is exactly the kind of day the clinic needs the backup.
            if (!done && !withRestoreFile) {
                say("Nothing could be exported. Check your connection and try again.", "error");
                showToast("Nothing was exported.", "error");
                return null;
            }
            if (!withRestoreFile) return true;

            say("Adding the backup file…");
            return collectDatabaseBackup((name, i, total) => {
                say("Adding the backup file… (" + (i + 1) + " of " + total + ")");
            }).then(({ backup, failed }) => {
                folder.folder("Restore file (keep, do not open)")
                      .file(backupFileName(), JSON.stringify(backup, null, 2));
                restoreFile = { failed: failed };
                return true;
            }).catch(err => {
                // The record cards are still worth saving without it.
                console.error("Could not add the backup file:", err);
                restoreFile = { error: true };
                return true;
            });
        })
        .then(ok => {
            if (!ok) return null;
            // Neither half worked. Say so once, rather than handing over an
            // empty ZIP that looks like a backup.
            if (!done && (!restoreFile || restoreFile.error)) {
                say("Nothing could be exported. Check your connection and try again.", "error");
                showToast("Nothing was exported.", "error");
                return null;
            }
            say(done ? ("Packing " + done + " files…") : "Packing the backup…");
            return zip.generateAsync({ type: "blob" });
        })
        .then(blob => {
            if (!blob) return;

            // A plain anchor click. No library, no popup — this is the same
            // mechanism every other download in the app uses.
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "DentCare Patient Records " +
                         (typeof localDateKey === "function" ? localDateKey() : new Date().toISOString().slice(0, 10)) + ".zip";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            // Revoked on a delay: some browsers have not finished reading the
            // blob when click() returns, and revoking too early produces an
            // empty file with no error.
            setTimeout(() => URL.revokeObjectURL(url), 30000);

            let msg = done
                ? "Saved " + done + " of " + ids.length + " record cards, one file each."
                : "No record cards could be built, so the ZIP holds the backup on its own.";
            if (failed.length) msg += " Could not include: " + failed.join(", ") + ".";
            if (incomplete.length) {
                msg += " NOTE: " + incomplete.join(" and ") + " could not be read, so " +
                       "those sections are marked unreadable in the files rather than " +
                       "filled in. The clinical records are complete.";
            }
            if (restoreFile && restoreFile.error) {
                // Said as bluntly as it deserves. A ZIP that cannot restore is
                // a print job, and filing it as the week's backup is how a
                // clinic finds out on the worst day that it had none.
                msg += " WARNING: the backup file could NOT be added, so this ZIP can be " +
                       "printed from but CANNOT restore the system. Try the export again.";
            } else if (restoreFile) {
                msg += " The backup file is inside, so this ZIP can also be used to restore.";
                if (restoreFile.failed.length && typeof backupLabel === "function") {
                    msg += " Not in it: " + restoreFile.failed.map(backupLabel).join(", ") +
                           " (the updated Firebase rules are not published yet).";
                }
            }
            msg += " Save the ZIP to the clinic's external drive.";
            say(msg, failed.length ? "error" : "ok");
            showToast(failed.length || incomplete.length
                ? "Exported — read the note on screen before filing this."
                : done + " record cards exported.",
                failed.length || incomplete.length ? "warning" : "success");
        })
        .catch(err => {
            console.error("Could not build the export:", err);
            say("Could not build the export. Nothing was saved.", "error");
            showToast("Could not build the export.", "error");
        })
        .then(() => lock(false));
}


/**
 * The last-visit catch-up, automatic since 2026-10-04 (it replaced the
 * owner's "Update last-visit dates" button). When Patient History loads, every
 * patient with no last-visit date has their visits asked for, one patient at a
 * time and under every id the record has had (R17), and the newest date is
 * saved. saveLastVisitDate never moves a date backwards. Each patient is asked
 * once per page load; a dropped connection stops quietly and retries on the
 * next open.
 */
const lastVisitSyncChecked = new Set();
let lastVisitSyncRunning = false;
async function syncMissingLastVisits() {
    if (lastVisitSyncRunning || !canSeeAccount()) return;
    lastVisitSyncRunning = true;
    const patients = (chartPatientCache || []).filter(p => !lastVisitOf(p) && !lastVisitSyncChecked.has(p.patient_id));
    try {
        for (const p of patients) {
            const snap = await wherePatientIs(db.collection("dental_records"), patientRecordIds(p.patient_id, p)).get();
            let newest = "";
            snap.forEach(doc => {
                const date = String(doc.data().recordDate || "");
                if (/^\d{4}-\d{2}-\d{2}$/.test(date) && date > newest) newest = date;
            });
            if (newest) await saveLastVisitDate(p.patient_id, newest);
            lastVisitSyncChecked.add(p.patient_id);
        }
        renderHistoryPatientList();
    } catch (err) { console.warn("Historical last-visit dates will retry when Patient History is reopened:", err); }
    finally { lastVisitSyncRunning = false; }
}
