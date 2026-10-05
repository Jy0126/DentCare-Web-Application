// ─────────────────────────────────────────────────────────────
// DentCare – js/records.js (Dental History & Charting Controller)
// ─────────────────────────────────────────────────────────────

let selectedPatientId = null;
let activePatientTeethStatuses = [];

/**
 * The patient's health answers as the form loaded them (2026-09-17).
 *
 * A save merges into the LIVE record and keeps anything this form did not
 * change, so an answer changed meanwhile on another device — the patient's
 * phone app, or a second tab — is not put back to what this screen showed.
 * If the same answer was changed there, the save stops and says so.
 */
let medicalHistoryOnOpen = null;

/**
 * The patient the health answers dialog is open for (2026-09-30).
 *
 * The questionnaire used to be the patient's own tab and always meant "the
 * signed-in account". It is a clinic dialog now, opened from Patient History,
 * so the patient is whoever it was opened for and never currentUserId.
 */
let medicalFormPatientId = null;

/** How the health form names each answer, for a "changed elsewhere" message. */
const HEALTH_ANSWER_LABELS = {
    goodHealth: "Good health", underMedicalTreatment: "Under medical treatment",
    medicalTreatmentDetails: "Treatment details",
    seriousIllnessOrOperation: "Serious illness or operation",
    illness_or_operation_details: "Illness or operation details",
    hospitalized: "Hospitalized", hospitalization_details: "Hospitalization details",
    prescribedMedicine: "Prescribed medicine", prescribed_medicine_details: "Medicine details",
    allergies: "Allergies", conditionsChecklist: "Conditions",
    bleedingTime: "Bleeding time", bloodType: "Blood type"
};

// Everyone registered, fetched once when the tab opens. The list is one
// clinic's worth, and scrolling or filtering it has to feel instant.
let chartPatientCache = [];

// The conditions the tooth editor offers. These values are written into
// Firestore, so they must keep matching the <option value="..."> list in
// templates/partials/modals-clinical.php — changing one without the other
// orphans every tooth already charted under the old wording.
//
// The completion dialog builds its own dropdown from this same array
// (populateCompletionConditionSelect in js/appointments.js), so a dentist
// charting from either screen picks from one list.
//
// The last two were added on 2026-09-30, at Dr. Gapit's request: EXO and RCT
// are codes she writes on the paper chart every day. They are ADDITIONS. The
// six values before them are stored on patients already charted and must not
// change. "Extracted" is a tooth taken out at the clinic; "Missing" stays for
// a tooth that was already gone, or never came through.
const TOOTH_CONDITIONS = [
    { value: "Healthy", label: "Healthy (Unmarked)" },
    { value: "Decayed", label: "Decayed (Caries)" },
    { value: "Filled",  label: "Filled (Restored)" },
    { value: "Missing", label: "Missing (Extracted/Unerupted)" },
    { value: "Crowned", label: "Crowned (Caps)" },
    { value: "Bridge",  label: "Bridge Support" },
    { value: "Extracted", label: "EXO (Extraction)" },
    { value: "RCT",       label: "RCT (Root canal treatment)" }
];

// What a filling is made of (2026-09-30). Doc's chart abbreviations; the
// meanings are the clinic's to confirm. The code is what is stored, on a
// Filled tooth only, as `material`. A tooth charted before this existed has no
// material and reads as plain "Filled".
// Each type has its own colour (2026-10-01, Dr. Gapit: every filling was the
// same green, so she could not tell an amalgam from a temporary at a glance).
// This is the one list of them: css/dashboard.css (.is-fill-*), the legend in
// templates/partials/record-card-chart.php and PDF_FILL_MATERIAL_FILL in
// js/patient-history.js carry the same values, and tools/check-dentition.js
// fails if any of them drifts.
//
// Chosen to stay clearly apart from each other and from every other colour a
// tooth can be drawn in. Amalgam is the dark grey of the metal; a temporary is
// orange, as a thing to come back to. Nothing here is pink or red, because a
// filling that reads as decay is the one mistake this chart must not invite.
// A filling with no type recorded keeps the green it always had.
const FILL_MATERIALS = [
    { code: "LC",  name: "Light-cure composite", colour: "#0d9488" },
    { code: "AM",  name: "Amalgam",              colour: "#374151" },
    { code: "TF",  name: "Temporary filling",    colour: "#f97316" },
    { code: "GIC", name: "Glass ionomer cement", colour: "#2563eb" }
];

/** The material code to store: one of the four on a Filled tooth, otherwise "". */
function toothMaterialFor(conditionStatus, material) {
    if (conditionStatus !== "Filled") return "";
    return FILL_MATERIALS.some(m => m.code === material) ? material : "";
}

/**
 * A condition as the doctor writes it, wherever one is shown as text: the
 * visit summary, the visit viewer, the chart-changes line and the record card.
 *
 *   ("Filled", "LC") → "Filled (LC)"     ("Extracted") → "EXO"
 *   ("Filled", "")   → "Filled"          ("RCT")       → "RCT"
 *   anything else    → the status as stored
 */
function toothConditionLabel(status, material) {
    if (status === "Extracted") return "EXO";
    if (status === "Filled") {
        const code = toothMaterialFor(status, material);
        return code ? "Filled (" + code + ")" : "Filled";
    }
    return status;
}

/**
 * One tooth's entry in a patient's teethStatus map.
 *
 * Both screens that chart a tooth go through here — the tooth editor on the
 * charting tab, and the completion dialog when a dentist finishes a visit — so
 * the two can never drift into writing different shapes for the same thing.
 *
 * teethStatus holds only the CURRENT state of a mouth. The history of what
 * changed at which visit lives on dental_records, in the teethUpdated snapshot
 * the completion transaction writes alongside this.
 *
 * @param {string} [material]  a FILL_MATERIALS code; kept on a Filled tooth only
 */
function buildToothStatusEntry(conditionStatus, surfaces, notes, material) {
    return {
        status: conditionStatus,
        surfaces: surfaces || [],
        notes: notes || "",
        material: toothMaterialFor(conditionStatus, material),
        updatedAt: new Date().toISOString()
    };
}

// The five surfaces on the paper card. Keys are stored in Firestore, so they
// must not change; the letters are what the card prints.
const TOOTH_SURFACES = [
    { key: "mesial",   code: "M",  name: "Mesial" },
    { key: "distal",   code: "D",  name: "Distal" },
    { key: "occlusal", code: "O",  name: "Occlusal" },
    { key: "facial",   code: "Bu", name: "Buccal" },   // shown as La on front teeth
    { key: "lingual",  code: "Li", name: "Lingual" }
];


// ─────────────────────────────────────────────────────────────
// Patient picker — one scrollable list, filtered by the search box
// ─────────────────────────────────────────────────────────────

/**
 * Fill chartPatientCache from a {id: data} map. One place, because the
 * charting, treatment-log and patient-history pickers all share this cache
 * and three tabs must never show three different patient lists.
 */
function setChartPatients(byId) {
    // A record that moved onto an online account (mergedInto, R17) is left
    // out: the account's record holds it and its history now.
    chartPatientCache = Object.keys(byId)
        .filter(id => !(byId[id] && byId[id].mergedInto))
        .map(id => Object.assign({ patient_id: id }, byId[id]));

    // Surname first, the way the paper cards are filed.
    chartPatientCache.sort((a, b) =>
        (a.lastName || "").localeCompare(b.lastName || "") ||
        (a.firstName || "").localeCompare(b.firstName || "")
    );
    return chartPatientCache;
}

/**
 * Keep the patient pickers live while one of their tabs is open (2026-09-27).
 *
 * A patient registered anywhere — this machine, the walk-in tablet, the public
 * form — appears in the open list without anybody refreshing the page. The
 * listener is opened here and closed by switchDentistTab / switchStaffTab when
 * the user moves to a tab that has no patient picker. See watchReference() in
 * js/app.js for what it costs (nothing more than the read it replaces).
 */
function watchPatientPickers() {
    if (typeof watchReference !== "function") return;
    watchReference("patients", byId => {
        setChartPatients(byId);
        redrawOpenPatientPicker();
    });
}

/**
 * Redraw the picker on screen after the list changed underneath it.
 *
 * Only a picker that is actually showing: with a patient's chart or record
 * card open, the list is hidden and is drawn from the fresh cache when the
 * user goes back to it. The search box and sort order are read again by
 * renderPatientPicker, so what the user typed still applies, and the list
 * keeps its scroll position instead of jumping back to the top.
 */
function redrawOpenPatientPicker() {
    if (!lastPickerOpts) return;
    const list = document.getElementById(lastPickerOpts.listId);
    if (!list || list.offsetParent === null) return;
    const scrolled = list.scrollTop;
    renderPatientPicker(lastPickerOpts);
    list.scrollTop = scrolled;
}

function loadChartPatients() {
    const list = document.getElementById("chart-patient-list");
    if (!list) return;

    list.innerHTML = '<p class="picker-empty">Loading patients…</p>';

    watchPatientPickers();
    getReference("patients")
    .then(byId => {
        setChartPatients(byId);
        renderChartPatientList();
    })
    .catch(err => {
        console.error("Error loading patients:", err);
        list.innerHTML = '<p class="picker-empty">Could not load the patient list. Check your connection and reopen this tab.</p>';
    });
}

function renderChartPatientList() {
    renderPatientPicker({
        listId: "chart-patient-list",
        searchId: "chart-patient-search",
        sortId: "chart-patient-sort",
        countId: "chart-patient-count",
        onPick: selectPatientForChart
    });
}

/**
 * Orders the list the way the "Sort by" dropdown asks.
 *
 * Patients with no date of birth sort to the end of the age orders rather than
 * counting as age zero, which would put every incomplete record above the
 * actual children.
 */
function sortPatients(list, order) {
    const byName = (a, b) =>
        (a.lastName || "").localeCompare(b.lastName || "") ||
        (a.firstName || "").localeCompare(b.firstName || "");

    const byAge = (a, b) => {
        const ageA = getPatientAge(a);
        const ageB = getPatientAge(b);
        if (ageA === null && ageB === null) return byName(a, b);
        if (ageA === null) return 1;
        if (ageB === null) return -1;
        return ageA - ageB || byName(a, b);
    };

    // Newest visit first. A patient with no visit on record goes after
    // everyone who has one, in surname order.
    const byVisit = (a, b) => {
        const seenA = lastVisitOf(a);
        const seenB = lastVisitOf(b);
        if (!seenA && !seenB) return byName(a, b);
        if (!seenA) return 1;
        if (!seenB) return -1;
        return seenB.localeCompare(seenA) || byName(a, b);
    };

    const sorted = [...list];
    switch (order) {
        case "name-desc":  sorted.sort((a, b) => byName(b, a)); break;
        case "age-asc":    sorted.sort(byAge); break;
        case "age-desc":   sorted.sort((a, b) => byAge(b, a)); break;
        case "visit-desc": sorted.sort(byVisit); break;
        default:           sorted.sort(byName);
    }
    return sorted;
}

// ── Finding patients by when they last came (client revision 8, 2026-09-30) ──
//
// patients/{id}.lastVisitDate is the day of the patient's newest visit, as
// YYYY-MM-DD. The visit form writes it (submitCompleteAppointment), opening a
// patient in Patient History corrects it (healLastVisitDate), and Patient
// History fills it in by itself for patients who have none
// (syncMissingLastVisits, 2026-10-04). With it, "who was seen today" is a filter over the
// patient list already loaded, not a read of every visit the clinic ever had.

/** A patient's last visit as YYYY-MM-DD, or "" when none is on record. */
function lastVisitOf(p) {
    const date = String((p && p.lastVisitDate) || "");
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

/** "Sep 30, 2026", for the patient list. "" when there is no visit. */
function lastVisitLabel(p) {
    const date = lastVisitOf(p);
    if (!date) return "";
    const day = new Date(date + "T00:00:00");
    return isNaN(day.getTime()) ? "" : day.toLocaleDateString("en-PH", { dateStyle: "medium" });
}

/** The years patients were last seen in, newest first. */
function lastVisitYears(list) {
    const years = {};
    (list || []).forEach(p => { const d = lastVisitOf(p); if (d) years[d.slice(0, 4)] = true; });
    return Object.keys(years).sort().reverse();
}

/**
 * The patients the "Show" select asks for.
 *
 *   "today"   last seen today
 *   "last10"  the ten seen most recently, newest first
 *   "year"    last seen in the given year
 *   anything else: everyone
 *
 * A patient with no lastVisitDate is in none of the first three.
 */
function patientsByLastVisit(list, show, year) {
    const everyone = list || [];
    const seen = everyone.filter(p => lastVisitOf(p));

    if (show === "today") {
        const today = localDateKey();
        return seen.filter(p => lastVisitOf(p) === today);
    }
    if (show === "last10") return sortPatients(seen, "visit-desc").slice(0, 10);
    if (show === "year") return seen.filter(p => lastVisitOf(p).slice(0, 4) === String(year));
    return everyone.slice();
}

/**
 * Write one patient's lastVisitDate, and keep the loaded list in step.
 *
 * One field, and a derived one: it says what the visits already say, so it is
 * written directly rather than through the edit-conflict check the typed
 * fields go through.
 */
function saveLastVisitDate(patientId, date) {
    if (typeof noteOwnWrite === "function") noteOwnWrite("patients/" + patientId);
    const ref = db.collection("patients").doc(patientId);
    return db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists) return "";
        const current = String(snap.data().lastVisitDate || "");
        const newest = /^\d{4}-\d{2}-\d{2}$/.test(current) && current > date ? current : date;
        if (current !== newest) tx.update(ref, { lastVisitDate: newest });
        return newest;
    }).then(saved => {
        const cached = (chartPatientCache || []).find(c => c.patient_id === patientId);
        if (cached && saved) cached.lastVisitDate = saved;
        return saved;
    });
}

/**
 * Draws the scrollable patient list into one of the two tabs.
 *
 * Both the charting tab and the treatment logs tab show the same list and
 * filter it the same way, so they share this rather than keeping two copies
 * that slowly stop matching.
 */
// ── Patient status: active, inactive, deceased (2026-09-16) ───────────────
//
// A dentist cannot simply delete a patient who has died. The record is still
// the clinic's proof of what was done, it may be asked for by the family, and
// dental records are what identify remains. The Data Privacy Act's rule is to
// keep personal data only as long as the purpose requires and then dispose of
// it properly — which is a retention decision, not a delete button.
//
// So a patient is MARKED instead. Everything about them stays: the chart, the
// treatment logs, the bills, the record card. They simply stop appearing in
// the lists used to start new work, and every screen that shows them says
// plainly what they are marked as.
const PATIENT_STATUS_LABEL = { deceased: "Deceased", inactive: "Inactive" };

/** "active" (the default), "inactive" or "deceased". */
function patientStatusOf(p) {
    const s = String((p && p.status) || "active").toLowerCase();
    return (s === "deceased" || s === "inactive") ? s : "active";
}

/** True when a patient should be kept out of the lists that start new work. */
function patientIsArchived(p) {
    return patientStatusOf(p) !== "active";
}

/** Only the clinic's owner marks a patient. */
function canSetPatientStatus() {
    return currentRole === "dentist" || currentRole === "admin";
}

/** Open the dialog on the patient currently on screen. */
function openPatientStatus() {
    if (!historyRecord || !canSetPatientStatus()) return;
    const p = historyRecord.patient;

    const who = document.getElementById("patient-status-who");
    if (who) {
        who.textContent = ((p.firstName || "") + " " + (p.lastName || "")).trim() || "This patient";
    }

    const status = patientStatusOf(p);
    document.querySelectorAll('#form-patient-status input[name="patient-status"]').forEach(r => {
        r.checked = (r.value === status);
    });
    const dateEl = document.getElementById("patient-status-date");
    if (dateEl) dateEl.value = p.statusAt ? String(p.statusAt).slice(0, 10) : "";
    const noteEl = document.getElementById("patient-status-note");
    if (noteEl) noteEl.value = p.statusNote || "";

    const save = document.getElementById("patient-status-save");
    if (save) save.disabled = false;

    openModal("modal-patient-status");
}

/**
 * Save the mark. Only these five fields are written, so nothing clinical can be
 * touched from this dialog and the rest of the patient document is untouched.
 */
function submitPatientStatus(e) {
    e.preventDefault();
    if (!historyRecord || !canSetPatientStatus()) return;

    const picked = document.querySelector('#form-patient-status input[name="patient-status"]:checked');
    const status = picked ? picked.value : "active";
    const dateEl = document.getElementById("patient-status-date");
    const noteEl = document.getElementById("patient-status-note");

    const save = document.getElementById("patient-status-save");
    if (save && save.disabled) return;
    if (save) save.disabled = true;

    const update = {
        status: status,
        statusAt: status === "active" ? "" : ((dateEl && dateEl.value) || localDateKey()),
        statusNote: status === "active" ? "" : ((noteEl && noteEl.value.trim()) || ""),
        statusBy: currentUserId || "",
        statusByName: currentUser || ""
    };

    // Only what this dialog changed, and never over a status set on another
    // screen meanwhile (2026-09-17).
    const shownPatient = historyRecord.patient || {};
    saveChangedFields(
        db.collection("patients").doc(historyRecord.patientId),
        { status: shownPatient.status, statusAt: shownPatient.statusAt, statusNote: shownPatient.statusNote },
        { status: update.status, statusAt: update.statusAt, statusNote: update.statusNote },
        { statusBy: update.statusBy, statusByName: update.statusByName }
    )
    .then(() => {
        Object.assign(historyRecord.patient, update);
        // The pickers read this cache, so the patient drops out of the lists
        // without a reload.
        (chartPatientCache || []).forEach(c => {
            if (c.patient_id === historyRecord.patientId) Object.assign(c, update);
        });
        refreshReference("patients");
        renderPatientStatusBar(historyRecord.patient);
        closeModal("modal-patient-status");
        showToast(status === "active"
            ? "Patient marked active again."
            : "Patient marked " + PATIENT_STATUS_LABEL[status].toLowerCase() +
              ". The record is kept in full.", "success");
    })
    .catch(err => {
        if (err && err.code === RECORD_CHANGED) {
            closeModal("modal-patient-status");
            showToast(recordChangedMessage(err, {
                status: "this patient's status", statusAt: "the status date", statusNote: "the status note"
            }), "warning");
            if (typeof selectPatientForHistory === "function") selectPatientForHistory({ patient_id: historyRecord.patientId });
            return;
        }
        console.error("Could not set the patient status:", err);
        showToast(err && err.code === "permission-denied"
            ? "Only Dr. Gapit's account can change a patient's status."
            : "Could not save. Check your connection and try again.", "error");
    })
    .finally(() => { if (save) save.disabled = false; });
}

// ── Collect consent signature (2026-10-01, client revision 16) ────────────
//
// The front desk can save a patient record before the patient has signed the
// consent; the record then carries consentPending: true, and Patient History,
// the record card and Record Visit say "Consent not signed yet". When the
// patient comes in, staff press Collect consent signature and hand over the
// tablet. The pad is the registration form's own (js/booking.js), on its own
// canvas, and saves the same 600 by 160 image.

/** The consent dialog's canvas: its own strokes, apart from the registration pad's. */
const CONSENT_CANVAS_ID = "consent-canvas";

/** Staff and the doctor; firestore.rules let either write these fields. */
function canCollectConsent() {
    return currentRole === "staff" || currentRole === "admin" || currentRole === "dentist";
}

function openCollectConsent() {
    if (!historyRecord || !canCollectConsent()) return;
    const p = historyRecord.patient || {};

    const who = document.getElementById("collect-consent-who");
    if (who) {
        who.textContent = "For " + (((p.firstName || "") + " " + (p.lastName || "")).trim() || "this patient") +
            ". Hand the tablet to the patient, or to their parent or guardian.";
    }
    const statement = document.getElementById("collect-consent-statement");
    if (statement && typeof CLINIC_CONSENT_STATEMENT === "string") {
        statement.textContent = "“" + CLINIC_CONSENT_STATEMENT + "”";
    }
    const agree = document.getElementById("collect-consent-agree");
    if (agree) agree.checked = false;
    const name = document.getElementById("collect-consent-name");
    if (name) name.value = "";
    const date = document.getElementById("collect-consent-date");
    if (date) date.value = localDateKey();
    ["collect-consent-name", "collect-consent-date"].forEach(id => {
        const el = document.getElementById(id);
        if (el && typeof markFieldStatus === "function") markFieldStatus(el, true);
    });
    const card = agree ? agree.closest(".consent") : null;
    if (card && typeof markFieldStatus === "function") markFieldStatus(card, true);
    if (typeof resetPrivacyBox === "function") resetPrivacyBox("collect-consent-privacy");
    const save = document.getElementById("collect-consent-save");
    if (save) save.disabled = false;

    clearSignatureCanvas(CONSENT_CANVAS_ID);
    openModal("modal-collect-consent");
    // The pad has no size until the dialog is showing.
    setTimeout(() => initSignatureCanvas(CONSENT_CANVAS_ID), 150);
}

/**
 * Save the signature. The same checks as the registration form's step 3: the
 * box ticked and the full name typed; the drawn mark is kept when there is one.
 * Written only over a consent that is still unsigned, so a signature taken on
 * another screen meanwhile is never overwritten.
 */
function submitCollectConsent(e) {
    if (e) e.preventDefault();
    if (!historyRecord || !canCollectConsent()) return Promise.resolve();
    const patientId = historyRecord.patientId;
    const p = historyRecord.patient || {};
    const m = p.medicalHistory || {};

    const agree = document.getElementById("collect-consent-agree");
    const nameEl = document.getElementById("collect-consent-name");
    const dateEl = document.getElementById("collect-consent-date");
    const typed = nameEl ? nameEl.value.trim() : "";

    let firstBad = null;
    const card = agree ? agree.closest(".consent") : null;
    if (!agree || !agree.checked) {
        if (card) markFieldStatus(card, false, "Tick the box to agree.");
        firstBad = firstBad || agree;
    } else if (card) {
        markFieldStatus(card, true);
    }
    const verdict = !typed
        ? { ok: false, reason: "Type the full name as the signature." }
        : (typeof checkPersonNameAt === "function"
            ? checkPersonNameAt("collect-consent-name", typed, "Signature")
            : { ok: true, reason: "" });
    if (nameEl) markFieldStatus(nameEl, verdict.ok, verdict.reason);
    if (!verdict.ok) firstBad = firstBad || nameEl;
    // "I agree to the Privacy Policy", ticked with the signature (R22).
    if (typeof requirePrivacyBox === "function" && !requirePrivacyBox("collect-consent-privacy")) {
        firstBad = firstBad || document.getElementById("collect-consent-privacy");
    }
    if (firstBad) {
        showToast("Please complete the boxes marked in red.", "warning");
        if (typeof firstBad.focus === "function") firstBad.focus();
        return Promise.resolve();
    }

    const save = document.getElementById("collect-consent-save");
    if (save && save.disabled) return Promise.resolve();
    if (save) save.disabled = true;

    const signed = {
        "medicalHistory.consentSignature": typed,
        "medicalHistory.consentSignatureImage": getSignatureDataUrl(CONSENT_CANVAS_ID),
        "medicalHistory.consentDate": (dateEl && dateEl.value) || localDateKey(),
        consentPending: false
    };
    const stamp = {
        consentCollectedAt: new Date().toISOString(),
        consentCollectedBy: currentUserId || ""
    };
    const privacyAccepted = typeof privacyBoxState === "function" && privacyBoxState("collect-consent-privacy") === "ticked"
        ? privacyAgreementFor("in person", currentUserId || "") : null;
    if (privacyAccepted) stamp.privacyAccepted = privacyAccepted;

    return saveChangedFields(
        db.collection("patients").doc(patientId),
        {
            "medicalHistory.consentSignature": m.consentSignature || "",
            "medicalHistory.consentSignatureImage": m.consentSignatureImage || "",
            "medicalHistory.consentDate": m.consentDate || "",
            consentPending: true
        },
        signed,
        stamp
    )
    .then(() => {
        if (historyRecord && historyRecord.patientId === patientId) {
            historyRecord.patient = Object.assign({}, historyRecord.patient, {
                consentPending: false,
                consentCollectedAt: stamp.consentCollectedAt,
                consentCollectedBy: stamp.consentCollectedBy,
                ...(privacyAccepted ? { privacyAccepted: privacyAccepted } : {}),
                medicalHistory: Object.assign({}, m, {
                    consentSignature: signed["medicalHistory.consentSignature"],
                    consentSignatureImage: signed["medicalHistory.consentSignatureImage"],
                    consentDate: signed["medicalHistory.consentDate"]
                })
            });
            if (typeof renderPatientHistory === "function") renderPatientHistory();
        }
        refreshReference("patients");
        clearSignatureCanvas(CONSENT_CANVAS_ID);
        closeModal("modal-collect-consent");
        showToast("Consent signature saved.", "success");
    })
    .catch(err => {
        if (err && err.code === RECORD_CHANGED) {
            closeModal("modal-collect-consent");
            showToast(recordChangedMessage(err, {
                "medicalHistory.consentSignature": "the consent signature",
                "medicalHistory.consentSignatureImage": "the drawn signature",
                "medicalHistory.consentDate": "the consent date",
                consentPending: "the consent"
            }), "warning");
            if (typeof selectPatientForHistory === "function") selectPatientForHistory({ patient_id: patientId });
            return;
        }
        console.error("Could not save the consent signature:", err);
        showToast(err && err.code === "permission-denied"
            ? "This account is not allowed to save a consent signature."
            : "Could not save. Check your connection and try again.", "error");
    })
    .finally(() => { if (save) save.disabled = false; });
}

// ── The clinic corrects a patient's name (2026-09-27) ──────────────────────
//
// A patient may rename themselves only once every 180 days (js/account.js).
// So a misspelling made in that time, or a legal name change the patient has
// shown ID for, is fixed here by the front desk or the doctor. It is not
// limited, does not restart the patient's 180 days, and is stamped with who
// did it — a name on a clinical record changing is never anonymous.
//
// The signed consent keeps the name it was signed under; the record card notes
// the difference instead (consentSignedByText in js/app.js).

/** "Correct name" on Patient History. Any clinic account; firestore.rules already allow it. */
function openCorrectPatientName() {
    if (!historyRecord || typeof appDialog !== "function") return;
    const patientId = historyRecord.patientId;
    const p = historyRecord.patient || {};
    const tidy = v => (typeof tidyPersonName === "function" ? tidyPersonName(v) : String(v || "").trim());

    appDialog({
        title: "Correct the patient's name",
        message: "Use this for a misspelling, or a legal name change the patient has shown ID for. " +
                 "The patient's own once-every-180-days limit does not apply to the clinic and is not restarted. " +
                 "The signed consent keeps the name it was signed under.",
        confirmLabel: "Save name",
        fields: [
            { name: "first", label: "First name", value: p.firstName || "", required: true, maxLength: 100 },
            { name: "middle", label: "Middle name (optional)", value: p.middleName || "", maxLength: 100 },
            { name: "last", label: "Last name", value: p.lastName || "", required: true, maxLength: 100 }
        ],
        validate: v => {
            const checks = [["first", "First name"], ["middle", "Middle name"], ["last", "Last name"]];
            for (const [key, label] of checks) {
                const val = tidy(v[key]);
                if (key === "middle" && !val) continue;
                const verdict = checkPersonNameAt("correct-" + key, val, label);
                if (!verdict.ok) return { message: verdict.reason, field: key };
            }
            if (tidy(v.first) === (p.firstName || "") && tidy(v.middle) === (p.middleName || "") &&
                tidy(v.last) === (p.lastName || "")) {
                return { message: "That is already the name on file.", field: "first" };
            }
            return null;
        }
    }).then(result => {
        if (!result.confirmed || !historyRecord || historyRecord.patientId !== patientId) return;
        const names = {
            firstName: tidy(result.values.first),
            middleName: tidy(result.values.middle),
            lastName: tidy(result.values.last)
        };
        const stamp = {
            nameCorrectedAt: new Date().toISOString(),
            nameCorrectedBy: currentUserId || "",
            nameCorrectedByName: currentUser || ""
        };
        return saveChangedFields(
            db.collection("patients").doc(patientId),
            { firstName: p.firstName, middleName: p.middleName, lastName: p.lastName },
            names,
            stamp
        ).then(() => {
            if (historyRecord && historyRecord.patientId === patientId) {
                Object.assign(historyRecord.patient, names, stamp);
            }
            (chartPatientCache || []).forEach(c => {
                if (c.patient_id === patientId) Object.assign(c, names, stamp);
            });
            refreshReference("patients");
            syncConversationName(patientId, names.firstName + " " + names.lastName);
            if (typeof renderPatientHistory === "function") renderPatientHistory();
            showToast("Name corrected to " + patientFullName(names) + ".", "success");
        });
    }).catch(err => {
        if (err && err.code === RECORD_CHANGED) {
            showToast(recordChangedMessage(err, {
                firstName: "the first name", middleName: "the middle name", lastName: "the last name"
            }), "warning");
            if (typeof selectPatientForHistory === "function") selectPatientForHistory({ patient_id: patientId });
            return;
        }
        console.error("Could not correct the name:", err);
        showToast(err && err.code === "permission-denied"
            ? "This account is not allowed to change a patient's name."
            : "Could not save. Check your connection and try again.", "error");
    });
}

// ── Deleting a patient who should never have existed (2026-09-16) ─────────
//
// The clinic asked for this for one reason: a duplicate, or a patient typed in
// twice, or the test entries from before launch. It is NOT how a deceased or a
// former patient is handled — that is the mark above, because a dental record
// outlives its patient.
//
// So the delete refuses the moment the patient has any history at all. If there
// is an appointment, a treatment log, a bill, a receipt, a message or an x-ray
// row against them, they are not a mistake — they are a patient — and the
// dialog says so and offers the mark instead. A receipt cannot be deleted by
// anybody (firestore.rules), so a patient with one would leave money on the
// books pointing at nobody.
const PATIENT_HISTORY_COLLECTIONS = [
    ["appointments", "appointment"],
    ["dental_records", "treatment log"],
    ["billing", "bill"],
    ["payments", "receipt"],
    ["patient_files", "x-ray record"]
];

/**
 * What the patient already has on file, as ["2 appointments", "1 bill"].
 * Under every id the record has had (R17), so a patient whose history sits
 * under an older record is never taken for an empty one.
 */
function patientHistoryCounts(patientId, patient) {
    const ids = patientRecordIds(patientId, patient);
    return Promise.all(PATIENT_HISTORY_COLLECTIONS.map(([name, label]) =>
        wherePatientIs(db.collection(name), ids).get()
            .then(snap => (snap.size
                ? snap.size + " " + label + (snap.size === 1 ? "" : "s")
                : null))
            // A collection that cannot be read is NOT taken as empty: refusing
            // to delete is the safe answer to "I do not know".
            .catch(() => label + "s could not be checked")
    )).then(found => found.filter(Boolean));
}

function openDeletePatient() {
    if (!historyRecord || !canSetPatientStatus()) return;
    const p = historyRecord.patient;
    const name = ((p.firstName || "") + " " + (p.lastName || "")).trim() || "This patient";

    const who = document.getElementById("delete-patient-who");
    const found = document.getElementById("delete-patient-found");
    const confirmRow = document.getElementById("delete-patient-confirm-row");
    const btn = document.getElementById("delete-patient-btn");
    const typed = document.getElementById("delete-patient-typed");

    if (who) who.textContent = name;
    if (typed) typed.value = "";
    if (found) found.innerHTML = '<p class="field-hint">Checking what this patient already has on file…</p>';
    if (confirmRow) confirmRow.classList.add("hidden");
    if (btn) { btn.disabled = true; btn.classList.add("hidden"); }

    openModal("modal-delete-patient");

    patientHistoryCounts(historyRecord.patientId, historyRecord.patient).then(found_items => {
        if (!found) return;
        if (found_items.length) {
            found.innerHTML =
                '<p class="delete-patient__blocked"><strong>This patient cannot be deleted.</strong> ' +
                'They already have ' + escapeChartHtml(found_items.join(", ")) + ' on file, so this is ' +
                'a real record rather than a mistake. Close this and use <strong>Patient status</strong> ' +
                'to mark them Inactive or Deceased instead — nothing is lost that way.</p>';
            return;
        }
        found.innerHTML =
            '<p class="field-hint">Nothing is on file for this patient: no appointments, ' +
            'treatment logs, bills, receipts or x-ray records. Deleting removes the profile ' +
            'and the sign-in role. It cannot be undone.</p>';
        if (confirmRow) confirmRow.classList.remove("hidden");
        if (btn) { btn.classList.remove("hidden"); btn.disabled = false; }
    });
}

function submitDeletePatient(e) {
    e.preventDefault();
    if (!historyRecord || !canSetPatientStatus()) return;

    const typed = document.getElementById("delete-patient-typed");
    if (!typed || typed.value.trim().toUpperCase() !== "DELETE") {
        flagField(typed, "Type DELETE to confirm.");
        return;
    }

    const btn = document.getElementById("delete-patient-btn");
    if (btn && btn.disabled) return;
    if (btn) btn.disabled = true;

    const patientId = historyRecord.patientId;

    // Checked again here, not just when the dialog opened: a bill could have
    // been raised in the seconds between.
    patientHistoryCounts(patientId, historyRecord.patient).then(found => {
        if (found.length) {
            showToast("Not deleted: this patient now has " + found.join(", ") + " on file.", "error");
            if (btn) btn.disabled = false;
            return;
        }

        return db.collection("patients").doc(patientId).delete()
            // The role document goes too, or the login survives as an account
            // with a role and no profile. A failure here is reported, not
            // hidden: the patient profile is already gone by then.
            .then(() => db.collection("users").doc(patientId).delete()
                .catch(err => { console.warn("The role document was not removed:", err); }))
            .then(() => {
                chartPatientCache = (chartPatientCache || []).filter(c => c.patient_id !== patientId);
                refreshReference("patients");
                closeModal("modal-delete-patient");
                if (typeof showAllHistoryPatients === "function") showAllHistoryPatients();
                showToast("Patient deleted. Their login, if they made one, is removed in the " +
                          "Firebase console under Authentication.", "success");
            });
    })
    .catch(err => {
        console.error("Could not delete the patient:", err);
        showToast(err && err.code === "permission-denied"
            ? "Only Dr. Gapit's account can delete a patient."
            : "Could not delete. Check your connection and try again.", "error");
        if (btn) btn.disabled = false;
    });
}

/** Whether the pickers are currently showing the marked patients too. */
let showArchivedPatients = false;

/** The last picker drawn, so the Show/Hide toggle can redraw it. */
let lastPickerOpts = null;

function toggleArchivedPatients() {
    showArchivedPatients = !showArchivedPatients;
    if (lastPickerOpts) renderPatientPicker(lastPickerOpts);
}

/**
 * Fill the year select from the patients in view, and say which year is chosen.
 *
 * Redrawn with the list, so a year appears the first time somebody is seen in
 * it. The chosen year is kept across redraws, even if nobody is in it any more.
 */
function syncLastVisitYears(opts, pool) {
    const box = opts.yearId ? document.getElementById(opts.yearId) : null;
    if (!box) return "";

    const years = lastVisitYears(pool);
    const chosen = String(box.value || years[0] || "");
    if (chosen && years.indexOf(chosen) === -1) years.push(chosen);
    years.sort().reverse();

    box.innerHTML = years.map(y =>
        '<option value="' + escapeChartHtml(y) + '">' + escapeChartHtml(y) + "</option>").join("");
    box.value = chosen;
    return chosen;
}

function renderPatientPicker(opts) {
    const list = document.getElementById(opts.listId);
    if (!list) return;
    lastPickerOpts = opts;

    const box = document.getElementById(opts.searchId);
    const query = box ? box.value.trim().toLowerCase() : "";

    const sortBox = document.getElementById(opts.sortId);
    const order = sortBox ? sortBox.value : "name-asc";

    const countEl = document.getElementById(opts.countId);

    if (chartPatientCache.length === 0) {
        list.innerHTML = '<p class="picker-empty">No patients registered yet.</p>';
        if (countEl) countEl.textContent = "";
        return;
    }

    // Deceased and inactive patients are left out of the list by default, and
    // counted underneath it so nobody thinks a record has gone missing.
    const archived = chartPatientCache.filter(patientIsArchived);
    const pool = showArchivedPatients
        ? chartPatientCache
        : chartPatientCache.filter(p => !patientIsArchived(p));

    // Patient History can narrow the list by last visit (2026-09-30). The
    // other pickers pass no showId and keep everyone.
    const showBox = opts.showId ? document.getElementById(opts.showId) : null;
    const show = showBox ? (showBox.value || "all") : "all";
    const year = show === "year" ? syncLastVisitYears(opts, pool) : "";
    const yearWrap = opts.yearWrapId ? document.getElementById(opts.yearWrapId) : null;
    if (yearWrap) yearWrap.classList.toggle("hidden", show !== "year");
    const shown = patientsByLastVisit(pool, show, year);

    // Matches either name part, so "santos" and "maria" both find Maria Santos.
    const matches = query
        ? shown.filter(p => {
            const first = (p.firstName || "").toLowerCase();
            const last = (p.lastName || "").toLowerCase();
            return (first + " " + last).includes(query) || (last + " " + first).includes(query);
        })
        : shown;

    /** The "2 marked patients are hidden — Show" line under the list. */
    const archivedFooter = () => {
        if (!archived.length) return "";
        return '<button type="button" class="picker-archived" onclick="toggleArchivedPatients()">' +
            (showArchivedPatients
                ? "Hide the " + archived.length + " deceased or inactive patient" +
                  (archived.length === 1 ? "" : "s")
                : archived.length + " deceased or inactive patient" +
                  (archived.length === 1 ? " is" : "s are") + " hidden — show " +
                  (archived.length === 1 ? "it" : "them")) +
            "</button>";
    };

    if (shown.length === 0 && show !== "all") {
        const when = show === "today" ? "No patient was seen today."
                   : (show === "year" && year) ? "No patient was seen in " + year + "."
                   : "No patient has a visit on record yet.";
        list.innerHTML = '<p class="picker-empty">' + escapeChartHtml(when) + "</p>" + archivedFooter();
        if (countEl) countEl.textContent = "0 of " + pool.length + (pool.length === 1 ? " patient" : " patients");
        return;
    }

    if (matches.length === 0) {
        list.innerHTML = '<p class="picker-empty">No patient matches that name. Try fewer letters, or clear the box to see everyone.</p>' +
                         archivedFooter();
        if (countEl) countEl.textContent = "0 of " + pool.length;
        return;
    }

    // Says how many are in view, so a filtered list never looks like the whole
    // list with people missing from it.
    if (countEl) {
        countEl.textContent = (query || show !== "all")
            ? matches.length + " of " + pool.length + " patients"
            : pool.length + (pool.length === 1 ? " patient" : " patients");
    }

    list.innerHTML = "";
    sortPatients(matches, order).forEach(p => {
        const age = getPatientAge(p);
        const isChild = dentitionStageForAge(age) !== "permanent";

        const row = document.createElement("button");
        row.type = "button";
        row.className = "picker-row";
        row.innerHTML =
            '<span class="picker-row__name">' +
                escapeChartHtml(p.lastName || "") + ", " + escapeChartHtml(p.firstName || "") +
            '</span>' +
            '<span class="picker-row__meta">' +
                (age === null ? "Age --" : "Age " + age) +
                (p.phoneNumber ? " · " + escapeChartHtml(p.phoneNumber) : "") +
                (opts.showId && lastVisitLabel(p) ? " · Last visit " + escapeChartHtml(lastVisitLabel(p)) : "") +
                (isChild ? '<span class="picker-row__badge">Baby teeth</span>' : "") +
                (patientIsArchived(p)
                    ? '<span class="picker-row__badge picker-row__badge--archived">' +
                      escapeChartHtml(PATIENT_STATUS_LABEL[patientStatusOf(p)]) + '</span>'
                    : "") +
            '</span>';
        row.onclick = () => opts.onPick(p);
        list.appendChild(row);
    });

    list.insertAdjacentHTML("beforeend", archivedFooter());
}

/** Bring the picker back after a patient has been open. */
function showAllChartPatients() {
    selectedPatientId = null;
    activePatientTeethStatuses = [];
    if (typeof unwatchLive === "function") {
        unwatchLive("tab-dentist-chart:patient");
        hideUpdatedBar("chart-updated-bar");
    }

    const box = document.getElementById("chart-patient-search");
    if (box) box.value = "";

    document.getElementById("chart-active-patient-card").classList.add("hidden");
    document.getElementById("chart-interactive-section").classList.add("hidden");
    document.getElementById("chart-patient-panel").classList.remove("hidden");

    renderChartPatientList();
}

/** Patient names go through innerHTML, so they have to be escaped. */
// See escapeHtml in js/app.js — this is the same thing under a local name.
function escapeChartHtml(str) {
    return escapeHtml(str);
}

/** Whole years, allowing for whether this year's birthday has happened. */
function getPatientAge(p) {
    if (!p.dateOfBirth) return null;
    const dob = new Date(p.dateOfBirth);
    if (isNaN(dob.getTime())) return null;

    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;

    return (age >= 0 && age < 130) ? age : null;
}

/**
 * Which teeth this patient has. Boundaries are published by the template from
 * templates/partials/dentition.php.
 *
 * Not "is the patient a minor": a 16-year-old is a minor with a full permanent
 * set, and a 7-year-old has permanent molars and baby teeth at the same time.
 */
function dentitionStageForAge(age) {
    const d = window.DENTITION || { lastPrimaryAge: 5, lastMixedAge: 12 };
    if (age === null || age === undefined) return "mixed";
    if (age <= d.lastPrimaryAge) return "primary";
    if (age <= d.lastMixedAge) return "mixed";
    return "permanent";
}

// ─────────────────────────────────────────────────────────────
// Opening a patient
// ─────────────────────────────────────────────────────────────

function selectPatientForChart(p) {
    selectedPatientId = p.patient_id;

    // Show whatever scans are already on this patient's record.
    // Guarded: js/clinic.js is portal-only, and this file also runs elsewhere.
    if (typeof loadXrayFiles === "function") loadXrayFiles(selectedPatientId);

    const age = getPatientAge(p);
    document.getElementById("chart-patient-name").innerText =
        `${p.firstName || ""} ${p.lastName || ""}`.trim();

    let meta = `Age: ${age === null ? "--" : age} | Gender: ${p.gender || "--"}`;
    if (p.phoneNumber) meta += ` | Contact: ${p.phoneNumber}`;
    if (p.minorInfo && p.minorInfo.isMinor && p.minorInfo.parentName) {
        meta += ` | Parent/Guardian: ${p.minorInfo.parentName}`;
        if (p.minorInfo.parentPhone) meta += ` (${p.minorInfo.parentPhone})`;
    }
    document.getElementById("chart-patient-meta").innerText = meta;

    const med = p.medicalHistory || {};
    const allergies = (med.allergies && med.allergies.length) ? med.allergies.join(", ") : "None";
    const conditions = (med.conditionsChecklist && med.conditionsChecklist.length) ? med.conditionsChecklist.join(", ") : "None";
    document.getElementById("chart-patient-allergies").innerText = `Allergies: ${allergies}`;
    document.getElementById("chart-patient-conditions").innerText = `Conditions: ${conditions}`;

    renderSafetyBanner(med);

    // The picker steps aside so only one thing is on screen at a time.
    document.getElementById("chart-patient-panel").classList.add("hidden");
    document.getElementById("chart-active-patient-card").classList.remove("hidden");
    document.getElementById("chart-interactive-section").classList.remove("hidden");

    loadPatientTeethMap();

    // A chart charted on another screen while this one is open says so, and
    // is reloaded only when asked (R20). This screen's own saves are its own.
    if (typeof watchOpenRecord === "function") {
        hideUpdatedBar("chart-updated-bar");
        const id = selectedPatientId;
        watchOpenRecord("tab-dentist-chart:patient", db.collection("patients").doc(id), "chart-updated-bar",
            () => { if (selectedPatientId === id) loadPatientTeethMap(); }, "patients/" + id);
    }
}

function renderSafetyBanner(med) {
    const banner = document.getElementById("chart-safety-warning-banner");
    const text = document.getElementById("chart-safety-warning-text");
    if (!banner || !text) return;

    // The critical conditions are ONE list, in both the web form's and the
    // mobile app's spelling: CRITICAL_CONDITIONS in js/app.js (2026-10-02).
    // This used to hold only the app's names, so a web patient with "Asthma /
    // Respiratory" or "Heart Disease / Surgery" raised no banner.
    const criticalAllergies = ["local anesthetics (ex. lidocaine)", "penicillin, antibiotics", "sulfa drugs", "latex"];

    const hits = [
        ...(med.conditionsChecklist || []).filter(isCriticalCondition),
        ...(med.allergies || []).filter(a => criticalAllergies.includes(String(a).toLowerCase())).map(a => a + " allergy")
    ];

    // A recent change the patient made themselves. Shown for 30 days, so an
    // answer edited at home is seen at the chair (2026-09-13). Since 2026-09-30
    // only the mobile app can make one; the web form is the clinic's.
    const editedAt = med.lastEditedByPatientAt ? new Date(med.lastEditedByPatientAt) : null;
    const recentEdit = editedAt && !isNaN(editedAt.getTime()) &&
                       (Date.now() - editedAt.getTime()) < 30 * 86400000;
    const editNote = recentEdit
        ? "The patient updated their own health answers on " +
          editedAt.toLocaleDateString("en-PH", { dateStyle: "medium" }) + " — review them."
        : "";

    if (hits.length > 0 || editNote) {
        text.innerText = [
            hits.length ? "Check before treating — " + hits.join(", ") + "." : "",
            editNote
        ].filter(Boolean).join(" ");
        banner.classList.remove("hidden");
    } else {
        banner.classList.add("hidden");
    }
}


// ─────────────────────────────────────────────────────────────
// Drawing the chart
// ─────────────────────────────────────────────────────────────

function loadPatientTeethMap() {
    if (!selectedPatientId) return;

    db.collection("patients").doc(selectedPatientId).get()
    .then(doc => {
        if (!doc.exists) return;
        const teethStatus = doc.data().teethStatus || {};
        activePatientTeethStatuses = [];

        // Clear this chart first, so switching patients never leaves marks
        // behind — and only this one, or opening a patient here would wipe the
        // teeth the doctor has just marked on an open visit form.
        clearChart("chart");

        Object.keys(teethStatus).forEach(num => {
            const t = teethStatus[num];
            if (!t || !t.status) return;

            activePatientTeethStatuses.push({
                tooth_number: num,
                condition_status: t.status,
                surfaces: Array.isArray(t.surfaces) ? t.surfaces : [],
                notes: t.notes,
                // A filling's type, when one was recorded (LC, AM, TF, GIC).
                material: t.material || "",
                // The tooth's own version: saveToothStatus() refuses to write
                // over a charting of this tooth made on another screen.
                updatedAt: t.updatedAt || ""
            });

            paintTooth("chart", num, t.status, Array.isArray(t.surfaces) ? t.surfaces : [], false, t.material);
        });
    })
    .catch(err => {
        console.error("Error loading teeth status map:", err);
        // Said out loud: a chart that failed to load draws every tooth as
        // healthy, which is the one thing a dentist must never read as true.
        showToast("Could not load this patient's tooth chart. The teeth shown are NOT " +
                  "their record. Check the connection and open the patient again.", "error");
    });
}

/**
 * Colour one tooth.
 *
 * If particular surfaces were recorded, only those are filled — which is what
 * the paper card records. If none were, the whole tooth is filled, so records
 * created before surfaces existed still show up.
 */
/**
 * Shade one tooth in one chart.
 *
 * The scope matters: the Dental Record Card tab and the completion form are
 * both in the page at the same time, each with a full set of teeth. Without it
 * this would find whichever chart happens to come first in the document and
 * paint that one — so the doctor's clicks on the visit form would appear on a
 * chart they cannot see.
 *
 * @param {string} scope     'chart' or 'visit'
 * @param {number} num       FDI tooth number
 * @param {string} status    a value from TOOTH_CONDITIONS
 * @param {string[]} surfaces  surface keys, or empty for the whole tooth
 * @param {boolean} [thisVisit]  mark it as changed today rather than on record
 * @param {string} [material]  a filling's type (LC, AM, TF, GIC), which picks
 *                             its colour; anything else draws a plain filling
 */
function paintTooth(scope, num, status, surfaces, thisVisit, material) {
    const tooth = document.getElementById(scope + "-tooth-" + num);
    if (!tooth) return;

    const fillType = toothMaterialFor(status, material);
    tooth.className = "ct is-" + String(status).toLowerCase() +
                      (fillType ? " is-fill-" + fillType.toLowerCase() : "") +
                      (thisVisit ? " is-this-visit" : "");

    const zones = tooth.querySelectorAll(".ct__zone");
    const markAll = !surfaces || surfaces.length === 0 || status === "Healthy";

    zones.forEach(z => {
        const on = markAll ? status !== "Healthy" : surfaces.includes(z.dataset.surface);
        z.classList.toggle("is-marked", on);
    });
}

/** Wipe every tooth in ONE chart, leaving the other alone. */
function clearChart(scope) {
    document.querySelectorAll('[data-scope="' + scope + '"]').forEach(el => {
        el.className = "ct";
        el.querySelectorAll(".ct__zone").forEach(z => z.classList.remove("is-marked"));
    });
}


// ─────────────────────────────────────────────────────────────
// The tooth dialog
// ─────────────────────────────────────────────────────────────

/**
 * A tooth was clicked. What that means depends on which chart it was in.
 *
 * On the reference chart it opens the editor and the change is saved on its
 * own. Inside the completion form it marks the tooth for this visit and saves
 * nothing — the form is written in one transaction when the doctor submits it.
 */
function clickTooth(scope, num) {
    if (scope === "visit") {
        // Defined in js/appointments.js, alongside the rest of the visit form.
        if (typeof markVisitTooth === "function") markVisitTooth(num);
        return;
    }

    if (!selectedPatientId) {
        showToast("Select a patient first.", "warning");
        return;
    }

    const isBaby = ((window.DENTITION || {}).primary || []).includes(num);
    const isFront = (num % 10) <= 3;

    document.getElementById("tooth-modal-number").innerText = num;
    document.getElementById("tooth-modal-num-hidden").value = num;

    const kind = document.getElementById("tooth-modal-kind");
    if (kind) kind.innerText = isBaby ? "Primary (baby) tooth" : "Permanent tooth";

    const current = activePatientTeethStatuses.find(t => parseInt(t.tooth_number, 10) === num);
    const chosen = current ? (current.surfaces || []) : [];

    // Surface checkboxes, using the letter this particular tooth carries on the
    // card — front teeth are labelled La, back teeth Bu.
    const pick = document.getElementById("tooth-modal-surfaces");
    if (pick) {
        pick.innerHTML = TOOTH_SURFACES.map(s => {
            const code = s.key === "facial" ? (isFront ? "La" : "Bu") : s.code;
            const name = s.key === "facial" ? (isFront ? "Labial" : "Buccal")
                       : s.key === "occlusal" ? (isFront ? "Incisal" : "Occlusal")
                       : s.name;
            const on = chosen.includes(s.key);
            return '<label class="surface-pick__item' + (on ? " is-on" : "") + '">' +
                   '<input type="checkbox" value="' + s.key + '"' + (on ? " checked" : "") +
                   ' onchange="this.parentElement.classList.toggle(\'is-on\', this.checked)">' +
                   '<span class="surface-pick__code">' + code + '</span>' + name +
                   '</label>';
        }).join("");
    }

    document.getElementById("tooth-condition").value = current ? current.condition_status : "Healthy";
    document.getElementById("tooth-notes").value = current ? (current.notes || "") : "";

    // The filling type, shown only while the condition is Filled.
    const materialEl = document.getElementById("tooth-material");
    if (materialEl) materialEl.value = current ? (current.material || "") : "";
    onToothConditionChange();

    openModal("modal-tooth-editor");
}

/**
 * The tooth editor's condition changed: a filling type is asked for only when
 * the tooth is Filled, and a choice made for a filling is dropped when the
 * condition becomes anything else.
 */
function onToothConditionChange() {
    const condition = document.getElementById("tooth-condition");
    const wrap = document.getElementById("tooth-material-wrap");
    const material = document.getElementById("tooth-material");
    if (!condition || !wrap) return;
    const filled = condition.value === "Filled";
    wrap.classList.toggle("hidden", !filled);
    if (!filled && material) material.value = "";
}

function saveToothStatus(e) {
    e.preventDefault();

    const tooth_number = parseInt(document.getElementById("tooth-modal-num-hidden").value, 10);
    const condition_status = document.getElementById("tooth-condition").value;
    const notes = document.getElementById("tooth-notes").value;

    const surfaces = Array.from(
        document.querySelectorAll("#tooth-modal-surfaces input:checked")
    ).map(cb => cb.value);

    const materialEl = document.getElementById("tooth-material");
    const material = materialEl ? materialEl.value : "";

    const updateData = {};
    updateData[`teethStatus.${tooth_number}`] = buildToothStatusEntry(condition_status, surfaces, notes, material);

    // ── Not over a charting made on another screen (2026-09-17) ─────────
    // Each tooth entry carries updatedAt. The chart this screen drew knows
    // which version of the tooth it showed; if the record now holds a
    // different one, somebody charted this tooth since, and this save stops
    // instead of replacing their finding with an older view of the mouth.
    const shown = activePatientTeethStatuses.find(t => parseInt(t.tooth_number, 10) === tooth_number);
    const shownVersion = shown ? (shown.updatedAt || "") : null;
    const ref = db.collection("patients").doc(selectedPatientId);
    if (typeof noteOwnWrite === "function") noteOwnWrite("patients/" + selectedPatientId);

    db.runTransaction(tx => tx.get(ref).then(snap => {
        if (!snap.exists) throw recordChangedError("This patient's record no longer exists.");
        const onRecord = (snap.data().teethStatus || {})[tooth_number];
        const liveVersion = (onRecord && onRecord.status) ? (onRecord.updatedAt || "") : null;
        if (liveVersion !== shownVersion) {
            throw recordChangedError("Not saved: tooth " + tooth_number + " was charted on another " +
                                     "screen while this one was open. The chart now shows the latest; " +
                                     "chart it again if it is still needed.");
        }
        tx.update(ref, updateData);
    }))
    .then(() => {
        // The chart list is built from patient documents, so the cached copy
        // is now one edit behind. Drop it rather than show a stale chart.
        refreshReference("patients");
        showToast(`Tooth ${tooth_number} updated.`, "success");
        closeModal("modal-tooth-editor");
        loadPatientTeethMap();
    })
    .catch(err => {
        if (err && err.code === RECORD_CHANGED) {
            showToast(err.message, "warning");
            closeModal("modal-tooth-editor");
            loadPatientTeethMap();
            return;
        }
        console.error("Failed to save tooth status:", err);
        showToast("Could not save this tooth. Try again.", "error");
    });
}


// ==========================================
// Records Tab Functions
// ==========================================

// ─────────────────────────────────────────────────────────────
// Treatment Logs — the same scrollable patient list as the charting tab
// ─────────────────────────────────────────────────────────────

function loadRecordsPatients() {
    const list = document.getElementById("records-patient-list");
    if (!list) return;

    list.innerHTML = '<p class="picker-empty">Loading patients…</p>';

    watchPatientPickers();
    getReference("patients")
    .then(byId => {
        setChartPatients(byId);
        renderRecordsPatientList();
    })
    .catch(err => {
        console.error("Error loading patients:", err);
        list.innerHTML = '<p class="picker-empty">Could not load the patient list. Check your connection and reopen this tab.</p>';
    });
}

function renderRecordsPatientList() {
    renderPatientPicker({
        listId: "records-patient-list",
        searchId: "records-patient-search",
        sortId: "records-patient-sort",
        countId: "records-patient-count",
        onPick: selectPatientForRecords
    });
}

function showAllRecordsPatients() {
    selectedPatientId = null;
    if (typeof unwatchLive === "function") {
        unwatchLive("tab-dentist-records:logs");
        hideUpdatedBar("records-updated-bar");
    }

    const box = document.getElementById("records-patient-search");
    if (box) box.value = "";

    document.getElementById("records-patient-panel").classList.remove("hidden");
    document.getElementById("records-active-patient-card").classList.add("hidden");
    document.getElementById("records-clinical-section").classList.add("hidden");

    renderRecordsPatientList();
}

function selectPatientForRecords(p) {
    selectedPatientId = p.patient_id;
    document.getElementById("records-patient-name").innerText = `${p.firstName || ""} ${p.lastName || ""}`.trim();

    const age = getPatientAge(p);
    document.getElementById("records-patient-meta").innerText =
        `Age: ${age === null ? "--" : age} | Gender: ${p.gender || "--"} | Contact: ${p.phoneNumber || "N/A"}`;

    // The whole picker steps aside so only the chosen patient is on screen.
    //
    // Emptying the list alone was not enough: the panel around it — heading,
    // search box, sort dropdown, count — stayed at full height, so the log the
    // doctor came here to read started below the fold.
    document.getElementById("records-patient-panel").classList.add("hidden");

    document.getElementById("records-active-patient-card").classList.remove("hidden");
    document.getElementById("records-clinical-section").classList.remove("hidden");

    loadPatientHistoryTable();

    // A visit recorded or a log corrected on another screen says so (R20),
    // under every id the patient's history is filed under.
    if (typeof watchOpenRecord === "function") {
        hideUpdatedBar("records-updated-bar");
        const id = selectedPatientId;
        watchOpenRecord("tab-dentist-records:logs",
            wherePatientIs(db.collection("dental_records"), patientRecordIds(id, p)), "records-updated-bar",
            () => { if (selectedPatientId === id) loadPatientHistoryTable(); }, "dental_records/");
    }
}

/** The open patient's treatment logs, by record id, for Edit. */
let recordsLogCache = {};

function loadPatientHistoryTable() {
    if (!selectedPatientId) return;

    // No Dentist column any more (2026-09-15): the clinic has one dentist, so
    // it repeated the same name on every row and pushed Edit off the screen.
    // Every id the record has had (R17): the patient's own entry in the
    // picker cache carries mergedFrom.
    const picked = (chartPatientCache || []).find(c => c.patient_id === selectedPatientId) || null;
    wherePatientIs(db.collection("dental_records"), patientRecordIds(selectedPatientId, picked)).get()
    .then(recordsSnapshot => {
        const tbody = document.getElementById("dentist-patient-treatment-table");
        if (!tbody) return;
        tbody.innerHTML = "";
        recordsLogCache = {};

        if (recordsSnapshot.empty) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center;">No treatments yet. ` +
                `They appear here once a visit is completed in Daily Appointments.</td></tr>`;
            return;
        }

        const records = [];
        recordsSnapshot.forEach(doc => {
            // The id is kept so Edit changes THIS record rather than adding one.
            const rec = Object.assign({ id: doc.id }, doc.data());
            records.push(rec);
            recordsLogCache[doc.id] = rec;
        });
        records.sort((a, b) => String(b.recordDate || "").localeCompare(String(a.recordDate || "")));

        // Rows are collected and written once. Appending with innerHTML += made the
        // browser re-read the whole table for every row: 300 appointments froze a
        // phone for about 8 seconds and flickered as it redrew (2026-09-24).
        const tableRows = [];
        records.forEach(rec => {
            const dateStr = new Date(rec.recordDate).toLocaleDateString('en-US', { dateStyle: 'medium' });
            const E = escapeChartHtml;

            // What this visit did to the chart, if anything. teethStatus holds
            // only the current state of a mouth, so this snapshot on the record
            // is the only thing that can answer "when did 36 become a filling?"
            const changes = Array.isArray(rec.teethUpdated) ? rec.teethUpdated : [];
            const chartLine = changes.length
                ? '<div class="log-changes">' +
                    changes.map(c => {
                        const from = c.previousStatus || "Healthy";
                        // In the doctor's own codes: "Filled (LC)", "EXO", "RCT".
                        const now = toothConditionLabel(c.conditionStatus, c.material);
                        const arrow = from === c.conditionStatus
                            ? E(now)
                            : E(toothConditionLabel(from)) + " &rarr; " + E(now);
                        return '<span class="log-change">#' + E(c.toothNumber) + " " + arrow + "</span>";
                    }).join("") +
                  "</div>"
                : "";

            // Findings and diagnosis are separate fields on the paper card and
            // are shown separately here. Older records were written before the
            // split and have no findings, so the line is simply omitted rather
            // than printed empty.
            const findingsLine = rec.findings
                ? "<strong>Findings:</strong> " + E(rec.findings) + "<br>"
                : "";

            // The clinical boxes are optional since 2026-09-30, so either of
            // these can be empty. Say so, rather than leave a label with
            // nothing after it.
            const notBlank = value => (value && String(value).trim()) ? E(value) : "Not recorded";

            tableRows.push(`
                <tr>
                    <td>${dateStr}</td>
                    <td><strong>${E(rec.treatmentName)}</strong></td>
                    <td>${rec.toothNumber ? "Tooth " + E(rec.toothNumber) : "&mdash;"}${chartLine}</td>
                    <td>
                        ${findingsLine}
                        <strong>Diagnosis:</strong> ${notBlank(rec.diagnosis)}<br>
                        <strong>Treatment:</strong> ${notBlank(rec.treatmentDone)}
                        ${rec.amendedAt
                            ? '<div class="log-corrected">Corrected ' + E(String(rec.amendedAt).slice(0, 10)) +
                              (rec.amendReason ? ": " + E(rec.amendReason) : "") + '</div>'
                            : ""}
                    </td>
                    <td>${rec.prescription ? E(rec.prescription) : 'None'}</td>
                    <td class="log-actions">
                        <button type="button" class="btn-secondary btn-sm"
                                onclick="openRecordCorrection('${escapeJsAttr(rec.id)}')">Edit</button>
                    </td>
                </tr>
            `);
        });
        tbody.innerHTML = tableRows.join("");
    })
    .catch(err => {
        console.error("Error loading patient history table:", err);
        renderTableLoadError("dentist-patient-treatment-table", 6, "this patient's treatment history", "loadPatientHistoryTable");
    });
}

// ── Correcting a treatment log (2026-09-15) ────────────────────────────────
//
// Replaces "Log New Procedure". That form wrote a SECOND kind of treatment log:
// no appointment, a fixed materials menu that moved no stock, and a bill raised
// on the side. Every real treatment is recorded by completing a visit (Daily
// Appointments, walk-ins included), so the only thing this tab still needs to
// do to a log is fix a mistake in one.
//
// A correction changes the existing record, in place. It keeps what the fields
// said before, with who changed them, when and why, in `amendments`, so a
// corrected clinical record still shows its history. firestore.rules
// (dental_records) lets only the owner do this, and requires amendedBy to be
// the signed-in account and amendedAt to be new.

/** The fields a correction may change. Everything else stays as the visit saved it. */
const RECORD_CORRECTABLE = [
    ["findings",      "edit-rec-findings"],
    ["diagnosis",     "edit-rec-diagnosis"],
    ["treatmentDone", "edit-rec-treatment-done"],
    ["prescription",  "edit-rec-prescription"],
    ["notes",         "edit-rec-notes"],
    ["nextVisitDate", "edit-rec-next-visit"]
];

/** How many past corrections a record keeps, so the document stays small. */
const RECORD_AMENDMENTS_KEPT = 20;

function openRecordCorrection(recordId) {
    const rec = recordsLogCache[recordId];
    if (!rec) {
        showToast("That treatment log is no longer on screen. Reopen the patient.", "warning");
        return;
    }

    document.getElementById("edit-rec-id").value = recordId;
    RECORD_CORRECTABLE.forEach(([field, id]) => {
        const el = document.getElementById(id);
        if (el) el.value = rec[field] == null ? "" : String(rec[field]);
    });
    document.getElementById("edit-rec-reason").value = "";

    const E = escapeChartHtml;
    const teeth = Array.isArray(rec.teethUpdated) ? rec.teethUpdated : [];
    const fixed = document.getElementById("edit-rec-fixed");
    if (fixed) {
        fixed.innerHTML =
            '<div><span>Date</span><strong>' + E(rec.recordDate || "—") + '</strong></div>' +
            '<div><span>Procedure</span><strong>' + E(rec.treatmentName || "—") + '</strong></div>' +
            '<div><span>Teeth</span><strong>' +
                (teeth.length
                    ? teeth.map(t => "#" + E(t.toothNumber) + " " + E(toothConditionLabel(t.conditionStatus, t.material))).join(", ")
                    : E(rec.toothNumber || "—")) +
            '</strong></div>';
    }

    const saveBtn = document.getElementById("edit-rec-save");
    if (saveBtn) saveBtn.disabled = false;
    openModal("modal-edit-record");
}

function saveRecordCorrection(e) {
    e.preventDefault();

    const recordId = document.getElementById("edit-rec-id").value;
    const rec = recordsLogCache[recordId];
    if (!rec) {
        showToast("That treatment log is no longer on screen. Reopen the patient.", "warning");
        return;
    }

    const next = {};
    RECORD_CORRECTABLE.forEach(([field, id]) => {
        const el = document.getElementById(id);
        const v = el ? el.value.trim() : "";
        next[field] = field === "nextVisitDate" ? (v || null) : v;
    });

    const changed = RECORD_CORRECTABLE
        .map(([field]) => field)
        .filter(field => String(rec[field] == null ? "" : rec[field]) !== String(next[field] == null ? "" : next[field]));
    if (!changed.length) {
        showToast("Nothing was changed.", "info");
        return;
    }

    const reason = document.getElementById("edit-rec-reason").value.trim();
    if (reason.length < 3) {
        flagField("edit-rec-reason", "Say briefly why you are correcting this record.");
        return;
    }

    // Locked while it saves: a double press would stack two corrections.
    const saveBtn = document.getElementById("edit-rec-save");
    if (saveBtn && saveBtn.disabled) return;
    if (saveBtn) saveBtn.disabled = true;

    const now = new Date().toISOString();

    // ── Read the record fresh, inside a transaction (2026-09-17 audit) ─────
    //
    // This used to build `previous` and the `amendments` history from
    // recordsLogCache — the copy loaded when the list was opened. That is fine
    // for one screen and wrong for two. Correct a log on the clinic computer,
    // then correct the same log from a phone or a second tab still showing the
    // old list, and the second save wrote the OLD history plus its own entry
    // over the top: the first correction vanished from the record, and
    // "previous" named what the stale screen showed rather than what the
    // record actually held.
    //
    // An amendment history that can lose entries is not an audit trail. So the
    // history and the previous values now come from the document as it is at
    // the moment of writing, and Firestore retries the whole thing if somebody
    // else writes in between. The cache is still used for what it is good at:
    // deciding, before any network call, whether anything changed at all.
    const ref = db.collection("dental_records").doc(recordId);
    if (typeof noteOwnWrite === "function") noteOwnWrite("dental_records/" + recordId);

    db.runTransaction(tx => tx.get(ref).then(snap => {
        if (!snap.exists) {
            const gone = new Error("This treatment log no longer exists.");
            gone.code = "not-found";
            throw gone;
        }
        const live = snap.data();

        // Only the fields THIS screen edited — `changed`, worked out above
        // against what this form was opened with. Comparing every field with
        // the live record instead would write this screen's stale copy of the
        // fields it never touched, quietly undoing a correction another screen
        // saved a minute ago. A field both screens edited goes to whoever
        // saves last, and the history records what it replaced.
        const stillChanged = changed.filter(field =>
            String(live[field] == null ? "" : live[field]) !==
            String(next[field] == null ? "" : next[field]));
        if (!stillChanged.length) {
            // Somebody already saved exactly this, from another screen.
            const same = new Error("Already saved.");
            same.code = "already-saved";
            throw same;
        }

        const previous = {};
        stillChanged.forEach(field => { previous[field] = live[field] == null ? "" : live[field]; });

        const amendments = (Array.isArray(live.amendments) ? live.amendments : [])
            .slice(-(RECORD_AMENDMENTS_KEPT - 1))
            .concat([{ at: now, by: currentUserId, byName: currentUser || "", reason: reason, previous: previous }]);

        const update = {
            amendedBy: currentUserId,
            amendedByName: currentUser || "",
            amendedAt: now,
            amendReason: reason,
            amendments: amendments
        };
        stillChanged.forEach(field => { update[field] = next[field]; });

        tx.update(ref, update);
    }))
    .then(() => {
        closeModal("modal-edit-record");
        showToast("Treatment log corrected.", "success");
        loadPatientHistoryTable();
    })
    .catch(err => {
        if (err && err.code === "already-saved") {
            closeModal("modal-edit-record");
            showToast("That correction was already saved from another screen.", "info");
            loadPatientHistoryTable();
            return;
        }
        console.error("Could not correct the treatment log:", err);
        showToast(err && err.code === "permission-denied"
            ? "Only Dr. Gapit's account can correct a treatment log."
            : err && err.code === "not-found"
            ? "That treatment log no longer exists. Reopen the patient."
            : "Could not save the correction. Check your connection and try again.", "error");
    })
    .finally(() => {
        if (saveBtn) saveBtn.disabled = false;
    });
}

// ==========================================
// Health answers (the medical questionnaire)
// ==========================================

// ── The clinic edits these, not the patient (2026-09-30) ───────────────
//
// After acceptance testing the owner decided a patient account shows nothing
// clinical, so "My Medical History" left the patient's dashboard. Allergies,
// medicines and conditions are kept up to date by staff and the doctor from
// Patient History, through the dialog in
// templates/partials/modal-health-answers.php.

/** Only a clinic account may open or save the health answers. */
function canEditHealthAnswers() {
    return ["dentist", "staff", "admin"].indexOf(currentRole) !== -1;
}

/** "Edit health answers" on Patient History: open the dialog for that patient. */
function openHealthAnswers(patientId) {
    if (!canEditHealthAnswers() || !patientId) return;
    medicalFormPatientId = patientId;
    const who = document.getElementById("health-answers-who");
    if (who) who.textContent = "";
    loadPatientMedicalHistory();
    openModal("modal-health-answers");
}

// ── Locked until Edit (clinic request, 2026-09-14) ─────────────────────
//
// The questionnaire used to be live the moment it opened. On a phone, a
// thumb scrolling past a YES/NO pill or a condition card could flip an answer,
// and one press of Save put it on the record the dentist reads before she
// treats. Now the answers are shown read-only, and changing them takes a
// deliberate Edit, then Save or Cancel.
//
// Edit only becomes available once the answers have actually loaded. A form
// that failed to load shows blanks, and saving blanks would erase real
// answers, so there is nothing to edit until the real ones are on screen.
function setMedicalFormEditing(editing) {
    const form    = document.getElementById("form-patient-medical");
    const fields  = document.getElementById("pat-medical-fields");
    const actions = document.getElementById("pat-medical-actions");
    const editBtn = document.getElementById("pat-medical-edit-btn");
    const note    = document.getElementById("pat-medical-lock-note");
    const saveBtn = document.getElementById("pat-medical-save-btn");
    if (!form) return;

    // Clicks on the pills and cards are inline onclick handlers. A capture
    // listener on the form stops them before they arrive while it is locked,
    // which also covers a keyboard or assistive-tech "click" that CSS
    // pointer-events cannot.
    if (!form.dataset.lockArmed) {
        form.addEventListener("click", ev => {
            if (form.classList.contains("is-locked")) {
                ev.stopPropagation();
                ev.preventDefault();
            }
        }, true);
        form.dataset.lockArmed = "1";
    }

    form.classList.toggle("is-locked", !editing);
    if (fields)  fields.disabled = !editing;
    if (actions) actions.classList.toggle("hidden", !editing);
    if (editBtn) editBtn.classList.toggle("hidden", editing);
    if (saveBtn) saveBtn.disabled = false;
    if (note) {
        note.textContent = editing
            ? "Editing. Save to keep the changes, or Cancel to leave them as they were."
            : "These are the answers on record. Press Edit to change them.";
    }
}

function startMedicalEdit() {
    const editBtn = document.getElementById("pat-medical-edit-btn");
    if (editBtn && editBtn.disabled) return;
    setMedicalFormEditing(true);
}

/** Throw away unsaved changes: re-read the record, which locks the form again. */
function cancelMedicalEdit() {
    loadPatientMedicalHistory();
}

/**
 * Tick the cards whose value is on record; return what matched no card.
 *
 * Matched on the checkbox VALUE, case-insensitively. It used to rebuild each
 * card's element id from the stored text, and several ids do not follow the
 * text ("Sulfa drugs" is card "Sulfa-Drugs", "High blood pressure" is
 * "High-Blood-Pressure"), so those answers never showed as ticked. Worse, the
 * next save wrote the unticked form back and deleted them from the record.
 * Anything that matches no card (an "Others" answer) goes back into the
 * Others box, so it survives a save too.
 */
function tickMedicalCards(gridId, values) {
    const wanted = (values || []).map(v => String(v).trim());
    const used = new Set();
    document.querySelectorAll("#" + gridId + " .checkbox-card").forEach(card => {
        const input = card.querySelector("input");
        const val = input ? String(input.value).trim().toLowerCase() : "";
        const idx = wanted.findIndex(w => w.toLowerCase() === val);
        const on = val !== "" && idx !== -1;
        if (on) used.add(idx);
        card.classList.toggle("checked", on);
        if (input) input.checked = on;
    });
    return wanted.filter((w, i) => w && !used.has(i));
}

function loadPatientMedicalHistory() {
    if (!canEditHealthAnswers() || !medicalFormPatientId) return;
    const patientId = medicalFormPatientId;
    setMedicalFormEditing(false);
    const editBtn = document.getElementById("pat-medical-edit-btn");
    if (editBtn) editBtn.disabled = true;
    const note = document.getElementById("pat-medical-lock-note");
    if (note) note.textContent = "Loading the patient's answers…";

    db.collection("patients").doc(patientId).get()
    .then(doc => {
        // The dialog was reopened for somebody else while this was in flight.
        if (patientId !== medicalFormPatientId) return;
        if (!doc.exists) return;
        const p = doc.data();
        const data = p.medicalHistory || {};
        medicalHistoryOnOpen = JSON.parse(JSON.stringify(data));

        const who = document.getElementById("health-answers-who");
        if (who) who.textContent = "for " + patientFullName(p);

        // Patient History shows these same answers behind the dialog. Redraw
        // them from this fresh read, so a save is on screen (allergy alert
        // included) the moment the dialog closes.
        if (historyRecord && historyRecord.patientId === patientId && historyRecord.patient) {
            historyRecord.patient.medicalHistory = data;
            historyRecord.patient.medicalHistoryEditedAt = p.medicalHistoryEditedAt;
            historyRecord.patient.medicalHistoryEditedBy = p.medicalHistoryEditedBy;
            if (typeof renderHistoryMedical === "function") renderHistoryMedical(historyRecord.patient);
        }

        setRadioPill("pat-good-health", data.goodHealth ? 1 : 0);
        
        setRadioPill("pat-treatment", data.underMedicalTreatment ? 1 : 0);
        if (data.underMedicalTreatment) {
            showDetails("pat-treatment-details-wrap");
            document.getElementById("pat-treatment-details").value = data.medicalTreatmentDetails || "";
        } else {
            hideDetails("pat-treatment-details-wrap");
        }

        setRadioPill("pat-illness", data.seriousIllnessOrOperation ? 1 : 0);
        if (data.seriousIllnessOrOperation) {
            showDetails("pat-illness-details-wrap");
            document.getElementById("pat-illness-details").value = data.illness_or_operation_details || "";
        } else {
            hideDetails("pat-illness-details-wrap");
        }

        setRadioPill("pat-hospitalized", data.hospitalized ? 1 : 0);
        if (data.hospitalized) {
            showDetails("pat-hospitalized-details-wrap");
            document.getElementById("pat-hospitalized-details").value = data.hospitalization_details || "";
        } else {
            hideDetails("pat-hospitalized-details-wrap");
        }

        setRadioPill("pat-prescribed", data.prescribedMedicine ? 1 : 0);
        if (data.prescribedMedicine) {
            showDetails("pat-prescribed-details-wrap");
            document.getElementById("pat-prescribed-details").value = data.prescribed_medicine_details || "";
        } else {
            hideDetails("pat-prescribed-details-wrap");
        }

        // Allergies and conditions: see tickMedicalCards().
        const otherAllergies = tickMedicalCards("pat-allergies-grid", data.allergies);
        const allergyOthersEl = document.getElementById("pat-allergy-others");
        if (allergyOthersEl) allergyOthersEl.value = otherAllergies.join(", ");

        const otherConditions = tickMedicalCards("pat-conditions-grid", data.conditionsChecklist);
        const conditionOthersEl = document.getElementById("pat-condition-others");
        if (conditionOthersEl) conditionOthersEl.value = otherConditions.join(", ");

        document.getElementById("pat-blood-type").value = data.bloodType || "";
        document.getElementById("pat-bleeding-time").value = data.bleedingTime || "";

        // Set minor info details
        const parentNameEl = document.getElementById("pat-parent-name");
        const parentPhoneEl = document.getElementById("pat-parent-phone");
        const referredByEl = document.getElementById("pat-referred-by");
        if (parentNameEl && parentPhoneEl && referredByEl) {
            parentNameEl.value = p.minorInfo?.parentName || "N/A";
            parentPhoneEl.value = p.minorInfo?.parentPhone || "N/A";
            referredByEl.value = p.referredBy || "N/A";
        }

        // Only now that the real answers are on screen can they be edited.
        setMedicalFormEditing(false);
        if (editBtn) editBtn.disabled = false;
    })
    .catch(err => {
        if (patientId !== medicalFormPatientId) return;
        console.error("Error loading patient medical history:", err);
        if (note) note.textContent = "The answers could not be loaded. Close this and open it again.";
        // The form would otherwise show blank answers, and saving it would
        // write those blanks over the real ones.
        showToast("Could not load the health answers. Close this and open it again.", "error");
    });
}

function updateMedicalHistory(e) {
    e.preventDefault();
    // A clinic account, with a patient open. Nothing else may save these.
    if (!canEditHealthAnswers() || !medicalFormPatientId) return;
    const patientId = medicalFormPatientId;
    // Only from Edit mode. Enter in a locked field must not save.
    const form = document.getElementById("form-patient-medical");
    if (form && form.classList.contains("is-locked")) return;
    const saveBtn = document.getElementById("pat-medical-save-btn");
    if (saveBtn) {
        if (saveBtn.disabled) return;
        saveBtn.disabled = true;
    }
    const good_health = getRadioPillValue("pat-good-health");
    const under_medical_treatment = getRadioPillValue("pat-treatment");
    const medical_treatment_details = document.getElementById("pat-treatment-details").value.trim();
    const serious_illness_or_operation = getRadioPillValue("pat-illness");
    const illness_or_operation_details = document.getElementById("pat-illness-details").value.trim();
    const hospitalized = getRadioPillValue("pat-hospitalized");
    const hospitalization_details = document.getElementById("pat-hospitalized-details").value.trim();
    const prescribed_medicine = getRadioPillValue("pat-prescribed");
    const prescribed_medicine_details = document.getElementById("pat-prescribed-details").value.trim();

    const allergies = [];
    document.querySelectorAll("#pat-allergies-grid .checkbox-card.checked input").forEach(cb => {
        allergies.push(cb.value);
    });
    const pat_allergy_others_el = document.getElementById("pat-allergy-others");
    if (pat_allergy_others_el && pat_allergy_others_el.value.trim()) {
        allergies.push(pat_allergy_others_el.value.trim());
    }

    const conditions = [];
    document.querySelectorAll("#pat-conditions-grid .checkbox-card.checked input").forEach(cb => {
        conditions.push(cb.value);
    });
    const pat_condition_others_el = document.getElementById("pat-condition-others");
    if (pat_condition_others_el && pat_condition_others_el.value.trim()) {
        conditions.push(pat_condition_others_el.value.trim());
    }

    const blood_type = document.getElementById("pat-blood-type").value.trim();
    const bleeding_time = document.getElementById("pat-bleeding-time").value.trim();

    const medicalHistory = {
        goodHealth: good_health === 1,
        underMedicalTreatment: under_medical_treatment === 1,
        medicalTreatmentDetails: medical_treatment_details,
        seriousIllnessOrOperation: serious_illness_or_operation === 1,
        illness_or_operation_details: illness_or_operation_details,
        hospitalized: hospitalized === 1,
        hospitalization_details: hospitalization_details,
        prescribedMedicine: prescribed_medicine === 1,
        prescribed_medicine_details: prescribed_medicine_details,
        allergies: allergies,
        conditionsChecklist: conditions,
        bleedingTime: bleeding_time,
        bloodType: blood_type
        // ── Consent is NOT rewritten here (2026-09-13 launch audit) ─────────
        // This used to write consentSignature: currentUser, replacing the name
        // the patient actually signed at registration with whatever their
        // display name is today. The consent fields are a record of what was
        // signed and when; they are left exactly as registration wrote them.
        //
        // ── Nor is lastEditedByPatientAt (2026-09-30) ──────────────────────
        // That stamp means "the patient changed their own answers", and the
        // chart shows the doctor a notice from it. This form is the clinic's
        // now, so a save is stamped on the patient record as
        // medicalHistoryEditedBy / medicalHistoryEditedAt instead (below). A
        // stamp the mobile app wrote stays on record untouched.
    };

    // ── Merged, not replaced ────────────────────────────────────────────
    //
    // This form does not ask every question the record holds. Registration
    // captures tobacco use, alcohol and drug use, and the three questions for
    // women (js/auth.js); this form has no inputs for any of them.
    //
    // It used to write `false` for all five regardless. So a patient who came
    // back to correct a detail silently answered "No" to "are you pregnant?"
    // on their own clinical record — and the doctor reads this panel before
    // she treats. Pregnancy decides whether an x-ray is taken and which
    // anaesthetic is safe, which makes it the one field on this form where
    // quiet data loss could actually hurt someone.
    //
    // Read first, then merge. What the form collects wins; everything else on
    // record is left exactly as it was, including keys added later that this
    // function has never heard of. The extra read is one document, and the
    // rules allow a clinic account to read it.
    //
    // ── And read INSIDE a transaction, answer by answer (2026-09-17) ───────
    //
    // The merge used to be a read and then a separate write, and it wrote every
    // answer the form holds. So an answer changed on the patient's phone, or
    // on the other clinic screen, after this form loaded came straight back to
    // the old value. Now:
    //   • an answer this form did not change keeps whatever is on record;
    //   • an answer it did change is written;
    //   • an answer changed here AND elsewhere to something different stops the
    //     save, and the message says which one.
    // Ticked lists are compared as sets, because the grid's order is not the
    // order they were saved in.
    const ref = db.collection("patients").doc(patientId);
    if (typeof noteOwnWrite === "function") noteOwnWrite("patients/" + patientId);
    const openedWith = (typeof medicalHistoryOnOpen !== "undefined" && medicalHistoryOnOpen) || null;
    const asSet = v => (Array.isArray(v) ? v.slice().sort() : v);
    const same = (a, b) => sameStoredValue(asSet(a), asSet(b));

    db.runTransaction(tx => tx.get(ref).then(doc => {
        const onRecord = (doc.exists && doc.data().medicalHistory) || {};
        const merged = Object.assign({}, onRecord);
        const conflicts = [];
        let changed = 0;

        Object.keys(medicalHistory).forEach(key => {
            const yours = medicalHistory[key];
            if (openedWith && same(yours, openedWith[key])) return;   // not changed here
            if (same(onRecord[key], yours)) return;                     // already so
            if (openedWith && !same(onRecord[key], openedWith[key])) {  // changed elsewhere too
                conflicts.push(key);
                return;
            }
            merged[key] = yours;
            changed++;
        });

        if (conflicts.length) {
            throw recordChangedError("Changed on another screen.", { fields: conflicts });
        }
        if (!changed) return false;

        // Who saved it and when, beside the answers rather than inside them:
        // Patient History prints "Last updated by the clinic on ...".
        tx.update(ref, {
            medicalHistory: merged,
            medicalHistoryEditedBy: currentUserId,
            medicalHistoryEditedAt: new Date().toISOString()
        });
        return true;
    }))
    .then(saved => {
        refreshReference("patients");
        showToast(saved ? "Health answers saved." : "Nothing was changed.",
                  saved ? "success" : "info");
        // Re-read, which locks the form again and redraws Patient History.
        loadPatientMedicalHistory();
        if (saved) closeModal("modal-health-answers");
    })
    .catch(err => {
        if (err && err.code === RECORD_CHANGED) {
            showToast(recordChangedMessage(err, HEALTH_ANSWER_LABELS), "warning");
            loadPatientMedicalHistory();
            return;
        }
        console.error("Failed to update the health answers:", err);
        showToast(err && err.code === "permission-denied"
            ? "Your account is not allowed to change these answers."
            : "Could not save the health answers. Check your connection and try again.", "error");
        // Still in Edit, with the changes intact, so they can retry.
        if (saveBtn) saveBtn.disabled = false;
    });
}

// Reset tabs on navigation clicks
function resetDentistChartTab() {
    showAllChartPatients();
    // Refetched each time so a patient registered a moment ago on the mobile
    // app is already in the list.
    loadChartPatients();
}

function resetDentistRecordsTab() {
    showAllRecordsPatients();
    loadRecordsPatients();
}
