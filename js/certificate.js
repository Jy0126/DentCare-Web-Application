// ─────────────────────────────────────────────────────────────
// DentCare – js/certificate.js (the clinic's certificate)
// ─────────────────────────────────────────────────────────────
//
// Added 2026-09-30. Dr. Gapit issues a certificate on her own printed form:
// that a named patient, of a given age and address, was examined and treated
// on a date, with what, and how many days of rest they need. It is asked for
// at the desk, for an employer or a school. This fills that form in from the
// patient open on Patient History and prints it on the clinic's half sheet
// (js/print.js), one certificate on the left half.
//
// The wording below is her form's, word for word, including "needs to rest of
// at least" and "for whatever purpose will serve". One thing was changed: the
// form reads "This it to certify", which is printed here as "This is to
// certify". That is for Dr. Gapit to confirm.
//
// Staff or the doctor may prepare one. It is not valid until she signs it by
// hand on the line, so nothing here signs for her, and nothing is saved: the
// dialog reads the record already on screen and writes nothing to the
// database.

// The issuer block, as printed on her form. One place, so a correction is one
// edit.
const CERT_ISSUER = {
    clinicName:  "Reina G. Gapit - Perez Dental Clinic",
    addressLine: "Stall 104B G/F Ramaida Centrum, Elias Angeles St. Naga City",
    phoneLine:   "CP No. 09236183285",
    name:        "Reina G. Gapit-Perez, D.M.D",
    licNo:       "47174"
};

/** The most that may be written under "with the following". */
const CERT_FINDINGS_MAX = 600;

/**
 * The certificate's own rules, added to the page set-up in js/print.js.
 *
 * A script face for the clinic name, the title and the body, as on her form,
 * from fonts already on a Windows computer. No web font is loaded. A thin
 * border runs round the sheet; the last two sentences sit near the bottom and
 * the signature block at the bottom right.
 */
const CERT_PRINT_CSS =
    ".sheet { padding: 0.3in; }\n" +
    // A column: the header and title, then the body, which takes whatever is
    // left above the closing sentences. "With the following" is the part that
    // grows, so it is the part given the spare room, and it can never push the
    // closing sentences or the signature off the sheet.
    ".cert-frame { display: flex; flex-direction: column; width: 100%; height: 100%; border: 1px solid #000000; padding: 0.28in 0.3in; " +
        "font-family: \"Lucida Handwriting\", \"Segoe Script\", \"Brush Script MT\", cursive; font-size: 10pt; line-height: 1.5; }\n" +
    ".cert-head { text-align: center; }\n" +
    ".cert-head__clinic { font-size: 15pt; font-weight: 700; line-height: 1.3; }\n" +
    ".cert-head__line { font-family: \"Times New Roman\", Times, serif; font-size: 9.5pt; line-height: 1.3; }\n" +
    ".cert-title { margin-top: 0.22in; text-align: center; font-size: 17pt; font-weight: 700; }\n" +
    ".cert-body { margin-top: 0.22in; flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }\n" +
    ".cert-line { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0 6px; margin-top: 12px; }\n" +
    ".cert-blank { display: inline-block; min-height: 15pt; border-bottom: 1px solid #000000; padding: 0 5px; " +
        "font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; line-height: 1.35; overflow-wrap: anywhere; }\n" +
    ".cert-blank--grow { flex: 1 1 120px; }\n" +
    ".cert-blank--age { min-width: 0.7in; text-align: center; }\n" +
    ".cert-blank--date { min-width: 1.4in; text-align: center; }\n" +
    ".cert-blank--days { min-width: 0.45in; text-align: center; }\n" +
    ".cert-findings { margin-top: 14px; flex: 1 1 auto; min-height: 0; overflow: hidden; white-space: pre-wrap; overflow-wrap: anywhere; " +
        "font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; line-height: 1.4; }\n" +
    ".cert-findings--small { font-size: 9pt; line-height: 1.3; }\n" +
    ".cert-foot { flex: 0 0 auto; margin-top: 12px; }\n" +
    ".cert-foot__line { margin-top: 4px; }\n" +
    ".cert-sign { margin-top: 0.6in; margin-left: auto; width: 2.5in; text-align: center; }\n" +
    ".cert-sign__rule { border-top: 1px solid #000000; padding-top: 4px; }\n";

/** "30 September 2026" from a stored YYYY-MM-DD; whatever was typed if it will not parse; "" if empty. */
function certDateLabel(date) {
    const raw = String(date == null ? "" : date).trim();
    if (!raw) return "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const d = new Date(raw + "T00:00:00");
    if (isNaN(d.getTime())) return raw;
    const months = ["January", "February", "March", "April", "May", "June", "July",
                    "August", "September", "October", "November", "December"];
    return d.getDate() + " " + months[d.getMonth()] + " " + d.getFullYear();
}

/**
 * The certificate, as the body of one half sheet. Every value is escaped and
 * printed on a ruled blank; a value that is missing leaves its blank empty, to
 * be written in by hand, as on the paper form.
 *
 * @param {{name: string, age: string, address: string, date: string,
 *          findings: string, restDays: string}} data
 */
function certificateHtml(data) {
    const d = data || {};
    const esc = value => escapeHtml(value == null ? "" : String(value).trim());
    const blank = (kind, value) => '<span class="cert-blank cert-blank--' + kind + '">' + esc(value) + '</span>';
    const who = CERT_ISSUER;
    const findings = String(d.findings == null ? "" : d.findings).trim().slice(0, CERT_FINDINGS_MAX);

    return '<div class="cert-frame">' +
        '<div class="cert-head">' +
            '<div class="cert-head__clinic">' + esc(who.clinicName) + '</div>' +
            '<div class="cert-head__line">' + esc(who.addressLine) + '</div>' +
            '<div class="cert-head__line">' + esc(who.phoneLine) + '</div>' +
        '</div>' +
        '<div class="cert-title">Certificate</div>' +

        '<div class="cert-body">' +
            '<div class="cert-line">To whom it may concern,</div>' +
            '<div class="cert-line"><span>This is to certify that</span> ' + blank("grow", d.name) + '</div>' +
            '<div class="cert-line">' + blank("age", d.age) + ' <span>years of age and resident of</span> ' + blank("grow", d.address) + '</div>' +
            '<div class="cert-line"><span>was examined and treated in this clinic on</span> ' + blank("date", certDateLabel(d.date)) +
                ' <span>with the following;</span></div>' +
            '<div class="cert-findings">' + escapeHtml(findings) + '</div>' +
        '</div>' +

        '<div class="cert-foot">' +
            '<div class="cert-foot__line">The patient needs to rest of at least ' + blank("days", d.restDays) + ' days.</div>' +
            '<div class="cert-foot__line">This Certificate is issued upon request of patient for whatever purpose will serve.</div>' +
            '<div class="cert-sign">' +
                '<div class="cert-sign__rule">' + esc(who.name) + '</div>' +
                '<div>Lic. No. ' + esc(who.licNo) + '</div>' +
            '</div>' +
        '</div>' +
    '</div>';
}

// ─────────────────────────────────────────────────────────────
// The dialog
// ─────────────────────────────────────────────────────────────

/** True once somebody has typed in "With the following", so a change of date does not replace it. */
let certFindingsEdited = false;

/** The visits of the open patient the dialog offers, newest first: [{ date, text }]. */
let certVisits = [];

/** What a visit suggests for "with the following": the procedure, and what was done if recorded. */
function certVisitText(visit) {
    return [visit.treatmentName, visit.treatmentDone]
        .map(part => String(part == null ? "" : part).trim())
        .filter(Boolean).join("\n").slice(0, CERT_FINDINGS_MAX);
}

/** "Certificate" on Patient History: open the dialog for the patient on screen. */
function openCertificate() {
    if (typeof historyRecord === "undefined" || !historyRecord || !historyRecord.patient) {
        showToast("Open a patient on Patient History first.", "warning");
        return;
    }
    const p = historyRecord.patient;
    const el = id => document.getElementById(id);

    // One entry per date on which a visit was recorded, newest first.
    const byDate = {};
    (historyRecord.treatments || []).forEach(visit => {
        const date = String(visit.recordDate || "").slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
        const text = certVisitText(visit);
        byDate[date] = byDate[date] ? (byDate[date] + (text ? "\n" + text : "")).slice(0, CERT_FINDINGS_MAX) : text;
    });
    certVisits = Object.keys(byDate).sort().reverse().map(date => ({ date: date, text: byDate[date] }));

    const who = el("cert-who");
    if (who) who.textContent = typeof patientFullName === "function" ? patientFullName(p) : "";

    const select = el("cert-date-select");
    const selectWrap = el("cert-date-select-wrap");
    const other = el("cert-date-other");
    const today = typeof localDateKey === "function" ? localDateKey() : "";

    if (select) {
        select.innerHTML = certVisits.map(v =>
            '<option value="' + escapeHtml(v.date) + '">' + escapeHtml(certDateLabel(v.date)) + '</option>').join("") +
            '<option value="other">Another date</option>';
        select.value = certVisits.length ? certVisits[0].date : "other";
    }
    // A patient with no recorded visit gets the date box only.
    if (selectWrap) selectWrap.classList.toggle("hidden", !certVisits.length);
    if (other) other.value = today;

    const age = typeof getPatientAge === "function" ? getPatientAge(p) : null;
    if (el("cert-age")) el("cert-age").value = age === null ? "" : String(age);
    if (el("cert-address")) el("cert-address").value = p.address || "";
    if (el("cert-rest-days")) el("cert-rest-days").value = "";

    certFindingsEdited = false;
    onCertDateChange();

    if (typeof fillPrintSheetSlots === "function") fillPrintSheetSlots(el("modal-certificate"));
    openModal("modal-certificate");
}

/** The date choice changed: show the date box for "Another date", and suggest that visit's text. */
function onCertDateChange() {
    const select = document.getElementById("cert-date-select");
    const otherWrap = document.getElementById("cert-date-other-wrap");
    const findings = document.getElementById("cert-findings");
    const picked = select ? select.value : "other";
    const usingOther = !certVisits.length || picked === "other";

    if (otherWrap) otherWrap.classList.toggle("hidden", !usingOther);
    if (findings && !certFindingsEdited) {
        const visit = certVisits.find(v => v.date === picked);
        findings.value = usingOther || !visit ? "" : visit.text;
    }
}

/** Print the certificate as the dialog stands now. */
function printCertificate() {
    if (typeof historyRecord === "undefined" || !historyRecord || !historyRecord.patient) return;
    const value = id => { const node = document.getElementById(id); return node ? String(node.value || "").trim() : ""; };

    const select = document.getElementById("cert-date-select");
    const usingOther = !certVisits.length || !select || select.value === "other";
    const date = usingOther ? value("cert-date-other") : select.value;
    if (!date) {
        showToast("Choose the date the patient was examined and treated.", "warning");
        const box = document.getElementById("cert-date-other");
        if (box) box.focus();
        return;
    }

    // Optional. Empty prints a blank to write in; otherwise a whole number of days.
    const rest = value("cert-rest-days");
    if (rest !== "" && (!/^\d{1,3}$/.test(rest) || Number(rest) > 365)) {
        showToast("Rest days is a whole number from 0 to 365, or leave it empty.", "warning");
        const box = document.getElementById("cert-rest-days");
        if (box) box.focus();
        return;
    }

    printClinicSheet({
        title: "Certificate",
        // "With the following" has the room left over on the sheet, which is
        // less when a long name or address wraps. It is measured on the real
        // document: a text that does not fit is tried in smaller type, and if
        // it still does not fit the print is stopped and the reader is asked to
        // shorten it. A certificate is never printed with its text cut off.
        beforePrint: doc => {
            const box = doc.querySelector(".cert-findings");
            if (!box) return true;
            const overflows = () => box.scrollHeight > box.clientHeight + 1;
            if (!overflows()) return true;
            box.classList.add("cert-findings--small");
            if (!overflows()) return true;
            showToast("\"With the following\" is too long to fit on the certificate. Shorten it, then print again.", "warning");
            const field = document.getElementById("cert-findings");
            if (field) field.focus();
            return false;
        },
        bodyHtml: certificateHtml({
            name: typeof patientFullName === "function" ? patientFullName(historyRecord.patient) : "",
            age: value("cert-age"),
            address: value("cert-address"),
            date: date,
            findings: value("cert-findings").slice(0, CERT_FINDINGS_MAX),
            restDays: rest === "" ? "" : String(Number(rest))
        }),
        css: CERT_PRINT_CSS
    });
}
