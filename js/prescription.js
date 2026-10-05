// ─────────────────────────────────────────────────────────────
// DentCare – js/prescription.js (what the patient takes home)
// ─────────────────────────────────────────────────────────────
//
// Added 2026-09-30, from Dr. Gapit's own account. The page the system used to
// print for a patient was a "Patient Visit Record": the charting, the
// operation, the findings and the diagnosis. She said that was wrong. Those
// are the clinic's records. What a patient is handed is the prescription, laid
// out like her pad, and nothing else.
//
// So this file is three things:
//
//   1. Her usual medicines, as presets that fill a row from a few typed
//      letters. A preset never prescribes by itself: it fills ONE row, which
//      she reads and can overtype, and it leaves the quantity and the "___ ml"
//      for her to write, exactly as her pad does.
//   2. The prescription rows on the Record Visit form, and the two forms they
//      are saved in: the rows themselves (prescriptionItems) and one line of
//      text per row (prescription), which is what Treatment Logs, Patient
//      History, the record card and the correction dialog already show.
//   3. The printout, on the clinic's half sheet, through js/print.js.
//
// ── TO CONFIRM WITH DR. GAPIT BEFORE GO-LIVE ──────────────────────────────
// Every line of RX_PRESETS was read from her handwriting, and the header and
// licence block from her printed pad. All of it lives in the two constants
// below, so a correction is one edit here and nowhere else.

const RX_PRESETS = [
    { drug: "Amoxicillin",    strength: "500mg",     qty: "21", sig: "Take 1 cap every 8 hrs, 3x a day x 7 days" },
    { drug: "Mefenamic Acid", strength: "500mg",     qty: "",   sig: "Take 1 cap every 8 hrs for pain" },
    { drug: "Ibuprofen",      strength: "400mg",     qty: "",   sig: "Take 1 cap every 6 hrs for pain" },
    { drug: "Ibuprofen",      strength: "200mg",     qty: "",   sig: "Take 1 cap every 6 hrs for pain" },
    { drug: "Clindamycin",    strength: "300mg",     qty: "",   sig: "Take 1 tab every 8 hrs, 3x a day x 7 days" },
    { drug: "Clindamycin",    strength: "150mg",     qty: "",   sig: "Take 1 tab every 8 hrs, 3x a day x 7 days" },
    { drug: "Amoxicillin",    strength: "250mg/5ml", qty: "",   sig: "Take ___ ml every 8 hrs, 3x a day for 7 days" },
    { drug: "Ibuprofen",      strength: "200mg/5ml", qty: "",   sig: "Take ___ ml every 6 hrs for pain" },
    { drug: "Paracetamol",    strength: "250mg/5ml", qty: "",   sig: "Take ___ ml every 6 hrs for pain" }
];

// The header and the licence block, as printed on the pad. `tin` is empty
// because the pad shows none; filled in, it prints at the lower left.
const RX_PRESCRIBER = {
    clinicName:   "DR. REINA G. GAPIT DENTAL CLINIC",
    addressLines: ["Room 104B G/F Ramaida Centrum", "Elias Angeles St., Naga City"],
    hoursLine:    "Clinic Hours: Mon-Sat: 9AM-5PM, Sun & Holiday: By appointment",
    phone:        "0923-618-3285",
    name:         "Reina G. Gapit, D.M.D",
    licNo:        "047174",
    ptrNo:        "0514698",
    tin:          ""
};

/** The most a saved prescription may hold: characters per field, and rows. */
const RX_LIMITS = { drug: 100, strength: 40, qty: 20, sig: 300, rows: 12 };

// ─────────────────────────────────────────────────────────────
// What is saved
// ─────────────────────────────────────────────────────────────

/**
 * The rows as they are stored: trimmed, capped, and with empty rows dropped.
 *
 * @param  {Array} items  rows of { drug, strength, qty, sig }
 * @return {Array}        at most twelve rows, each with exactly those four
 */
function cleanRxItems(items) {
    if (!Array.isArray(items)) return [];
    const tidy = (value, max) => String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);

    const out = [];
    items.forEach(item => {
        if (!item || typeof item !== "object") return;
        const row = {
            drug:     tidy(item.drug, RX_LIMITS.drug),
            strength: tidy(item.strength, RX_LIMITS.strength),
            qty:      tidy(item.qty, RX_LIMITS.qty),
            sig:      tidy(item.sig, RX_LIMITS.sig)
        };
        if (row.drug || row.strength || row.qty || row.sig) out.push(row);
    });
    return out.slice(0, RX_LIMITS.rows);
}

/**
 * The prescription as text, one line per medicine:
 *
 *   Amoxicillin 500mg, #21. Sig: Take 1 cap every 8 hrs, 3x a day x 7 days
 *
 * The ", #qty" part is left out when there is no quantity, and the ". Sig: …"
 * part when there is no sig. This text is the `prescription` field the older
 * screens read, so they did not have to change.
 */
function composePrescriptionText(items) {
    return cleanRxItems(items).map(item => {
        let line = [item.drug, item.strength].filter(Boolean).join(" ");
        if (item.qty) line += (line ? ", " : "") + "#" + item.qty;
        if (item.sig) line += (line ? ". " : "") + "Sig: " + item.sig;
        return line;
    }).join("\n");
}

/**
 * Which version of a saved visit's prescription to print.
 *
 * The rows, while they still say what the text says. If the record was
 * corrected afterwards (the Edit dialog changes the text, not the rows), or
 * was saved before rows existed, the text is the truth and is printed line by
 * line. Returns null when the visit has no prescription at all.
 *
 * @param  {Object} record  a dental_records document (or the visit just saved)
 * @return {{items: Array, text: string}|null}
 */
function prescriptionPrintable(record) {
    if (!record) return null;
    const text = String(record.prescription == null ? "" : record.prescription).trim();
    const items = cleanRxItems(record.prescriptionItems);
    if (items.length && composePrescriptionText(items) === text) return { items: items, text: "" };
    if (text) return { items: [], text: text };
    return null;
}

// ─────────────────────────────────────────────────────────────
// The printout
// ─────────────────────────────────────────────────────────────

/** Whole years between a date of birth and the visit date; "" when unknown. */
function rxAgeOn(dateOfBirth, onDate) {
    if (!dateOfBirth) return "";
    const born = new Date(String(dateOfBirth).slice(0, 10) + "T00:00:00");
    const on = onDate ? new Date(String(onDate).slice(0, 10) + "T00:00:00") : new Date();
    if (isNaN(born.getTime()) || isNaN(on.getTime())) return "";
    let age = on.getFullYear() - born.getFullYear();
    const months = on.getMonth() - born.getMonth();
    if (months < 0 || (months === 0 && on.getDate() < born.getDate())) age--;
    return (age >= 0 && age < 130) ? String(age) : "";
}

/** "September 30, 2026" from a stored YYYY-MM-DD; the text as stored if it will not parse. */
function rxDateLabel(date) {
    if (!date) return "";
    const d = new Date(String(date).slice(0, 10) + "T00:00:00");
    if (isNaN(d.getTime())) return String(date);
    return d.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
}

/** The prescription's own rules, added to the page set-up in js/print.js. */
const RX_PRINT_CSS =
    ".rx-head { text-align: center; line-height: 1.3; }\n" +
    ".rx-head__clinic { font-size: 14pt; font-weight: 700; letter-spacing: 0.02em; }\n" +
    ".rx-head__line { font-size: 10pt; }\n" +
    ".rx-patient { margin-top: 0.3in; font-size: 10.5pt; }\n" +
    ".rx-field { display: flex; align-items: flex-end; gap: 6px; margin-top: 7px; }\n" +
    ".rx-field__label { white-space: nowrap; }\n" +
    ".rx-field__value { flex: 1; min-height: 15pt; border-bottom: 1px solid #000000; padding: 0 4px 1px; }\n" +
    ".rx-field--pair .rx-field__value { flex: 1 1 0; }\n" +
    ".rx-body { margin-top: 0.25in; }\n" +
    ".rx-mark { font-size: 22pt; font-weight: 700; line-height: 1; }\n" +
    ".rx-item { padding: 9px 0 10px 0.55in; border-bottom: 1px solid #000000; font-size: 11.5pt; }\n" +
    ".rx-item:last-child { border-bottom: 0; }\n" +
    ".rx-item__drug, .rx-item__sig, .rx-line { overflow-wrap: anywhere; }\n" +
    ".rx-item__drug { font-weight: 700; }\n" +
    ".rx-item__qty { padding-left: 1.6in; }\n" +
    ".rx-item__sig { margin-top: 2px; }\n" +
    ".rx-line { padding-left: 0.55in; font-size: 11.5pt; margin-top: 4px; white-space: pre-wrap; }\n" +
    ".rx-foot { position: absolute; left: 0.4in; right: 0.4in; bottom: 0.4in; display: flex; " +
        "justify-content: space-between; align-items: flex-end; font-size: 10.5pt; }\n" +
    ".rx-foot__left { align-self: flex-end; line-height: 1.35; }\n" +
    ".rx-foot__signer { margin-left: auto; text-align: right; line-height: 1.35; }\n" +
    ".rx-foot__signature { height: 0.55in; }\n";

/**
 * How much room the medicines may take on one half sheet, and how much each
 * one needs, in printed pixels (96 to the inch).
 *
 * Under the header, the patient block and "RX" there is room for about three
 * medicines before the space kept clear for the signature, which is what Dr.
 * Gapit's own pad holds. A longer prescription continues on another sheet,
 * with the header, the patient and the licence block repeated, so that no
 * medicine is ever cut off at the bottom of the paper. The estimate is
 * deliberately generous: a sheet with room to spare is fine, a clipped sig is
 * not.
 */
const RX_PAGE_ROOM = 300;
const RX_LINE = 21;

function rxItemHeight(item) {
    const wraps = (text, perLine) => Math.max(1, Math.ceil(String(text || "").length / perLine));
    const drug = [item.drug, item.strength].filter(Boolean).join(" ");
    return 22 + RX_LINE * (wraps(drug, 46) + 1 + (item.sig ? wraps("Sig: " + item.sig, 54) : 0));
}

/** Split into sheets, each holding as many blocks as fit. Every sheet gets at least one. */
function rxPaginate(blocks) {
    const pages = [];
    let page = [];
    let used = 0;
    blocks.forEach(block => {
        if (page.length && used + block.height > RX_PAGE_ROOM) {
            pages.push(page);
            page = [];
            used = 0;
        }
        page.push(block.html);
        used += block.height;
    });
    if (page.length) pages.push(page);
    return pages.length ? pages : [[]];
}

/**
 * The prescription, as the bodies of one or more half sheets. Top to bottom,
 * as on the pad: the clinic header; the patient block on ruled lines; RX; each
 * item; and the licence block pinned to the bottom right, with room above it
 * to sign.
 *
 * Nothing else is on it: no procedure, no tooth numbers, no findings, no
 * diagnosis and no charge. Every value is escaped.
 *
 * @param  {{patient: Object, date: string, items: Array, text: string}} data
 * @return {string[]} one string of HTML per sheet
 */
function prescriptionPages(data) {
    const d = data || {};
    const p = d.patient || {};
    const esc = value => escapeHtml(value == null ? "" : value);
    const who = RX_PRESCRIBER;

    const name = [p.firstName, p.middleName, p.lastName]
        .map(part => String(part == null ? "" : part).trim()).filter(Boolean).join(" ");

    const field = (label, value) =>
        '<span class="rx-field__label">' + esc(label) + '</span>' +
        '<span class="rx-field__value">' + esc(value) + '</span>';

    const items = cleanRxItems(d.items);
    let blocks;
    if (items.length) {
        blocks = items.map(item => ({
            height: rxItemHeight(item),
            html: '<div class="rx-item">' +
                '<div class="rx-item__drug">' + esc([item.drug, item.strength].filter(Boolean).join(" ")) + '</div>' +
                // The pad prints "#" even when the quantity is still to be written in.
                '<div class="rx-item__qty"># ' + esc(item.qty) + '</div>' +
                (item.sig ? '<div class="rx-item__sig">Sig: ' + esc(item.sig) + '</div>' : '') +
            '</div>'
        }));
    } else {
        // A prescription kept only as text (an older visit, or one corrected
        // later): one printed line per line. A very long line is broken at a
        // space, so that it too can run on to the next sheet.
        blocks = [];
        String(d.text == null ? "" : d.text).split(/\r?\n/).forEach(line => {
            let rest = line.trim();
            while (rest) {
                let cut = rest.length > 480 ? rest.lastIndexOf(" ", 480) : rest.length;
                if (cut <= 0) cut = Math.min(rest.length, 480);
                const piece = rest.slice(0, cut).trim();
                rest = rest.slice(cut).trim();
                if (!piece) continue;
                blocks.push({
                    height: 4 + RX_LINE * Math.max(1, Math.ceil(piece.length / 58)),
                    html: '<div class="rx-line">' + esc(piece) + '</div>'
                });
            }
        });
    }

    const pages = rxPaginate(blocks);
    return pages.map((body, index) => rxSheetHtml({
        who: who, esc: esc, field: field, name: name, patient: p, date: d.date,
        body: body.join(""),
        pageNote: pages.length > 1 ? "Page " + (index + 1) + " of " + pages.length : ""
    }));
}

/** The whole prescription as one string: every sheet, one after the other. */
function prescriptionHtml(data) {
    return prescriptionPages(data).join("");
}

/** One half sheet of the prescription. */
function rxSheetHtml(part) {
    const who = part.who;
    const esc = part.esc;
    const field = part.field;
    const p = part.patient;
    const d = { date: part.date };
    const name = part.name;
    const body = part.body;

    return '<div class="rx-head">' +
            '<div class="rx-head__clinic">' + esc(who.clinicName) + '</div>' +
            who.addressLines.map(line => '<div class="rx-head__line">' + esc(line) + '</div>').join("") +
            '<div class="rx-head__line">' + esc(who.hoursLine) + '</div>' +
            '<div class="rx-head__line">' + esc(who.phone) + '</div>' +
        '</div>' +

        '<div class="rx-patient">' +
            '<div class="rx-field">' + field("Patient's Name:", name) + '</div>' +
            '<div class="rx-field">' + field("Address:", p.address) + '</div>' +
            '<div class="rx-field rx-field--pair">' +
                field("Age:", rxAgeOn(p.dateOfBirth, d.date)) + field("Sex:", p.gender) +
            '</div>' +
            '<div class="rx-field">' + field("Date:", rxDateLabel(d.date)) + '</div>' +
        '</div>' +

        '<div class="rx-body"><div class="rx-mark">RX</div>' + body + '</div>' +

        '<div class="rx-foot">' +
            ((who.tin || part.pageNote)
                ? '<div class="rx-foot__left">' +
                      (part.pageNote ? '<div>' + esc(part.pageNote) + '</div>' : '') +
                      (who.tin ? '<div>TIN: ' + esc(who.tin) + '</div>' : '') +
                  '</div>'
                : '') +
            '<div class="rx-foot__signer">' +
                '<div class="rx-foot__signature"></div>' +
                '<div>' + esc(who.name) + '</div>' +
                '<div>Lic. No. ' + esc(who.licNo) + '</div>' +
                '<div>PTR No. ' + esc(who.ptrNo) + '</div>' +
            '</div>' +
        '</div>';
}

/**
 * Print a prescription on the chosen paper.
 *
 * @param  {{patient: Object, date: string, items: Array, text: string}} data
 * @return {boolean} false when there was nothing to print
 */
function printPrescription(data) {
    const d = data || {};
    const hasItems = cleanRxItems(d.items).length > 0;
    const hasText = String(d.text == null ? "" : d.text).trim() !== "";
    if (!hasItems && !hasText) {
        showToast("No prescription was written for this visit.", "info");
        return false;
    }
    printClinicSheet({ title: "Prescription", pages: prescriptionPages(d), css: RX_PRINT_CSS });
    return true;
}

// ─────────────────────────────────────────────────────────────
// The rows on the Record Visit form
// ─────────────────────────────────────────────────────────────

/** The medicines being written for the visit that is open. Not saved until the form is. */
let visitRxItems = [];

/** The suggestion list that is open, if any: which row, which presets, which one is highlighted. */
let rxSuggest = null;

function emptyRxItem() {
    return { drug: "", strength: "", qty: "", sig: "" };
}

/** A new visit starts with one empty row. */
function resetVisitRx() {
    visitRxItems = [emptyRxItem()];
    rxSuggest = null;
    renderVisitRx();
}

/**
 * Draw the rows.
 *
 * Only when a row is added, removed or filled from a preset. Typing updates
 * visitRxItems without redrawing, because a redraw on every keystroke would
 * take the cursor out of the box being typed in.
 */
function renderVisitRx() {
    const host = document.getElementById("complete-rx-rows");
    if (!host) return;

    const input = (i, key, label, extra) =>
        '<label class="rx-row__field rx-row__field--' + key + '">' +
            '<span class="rx-row__label">' + label + '</span>' +
            '<input type="text" id="rx-' + key + '-' + i + '" maxlength="' + RX_LIMITS[key] + '" autocomplete="off" ' +
                'value="' + escapeHtml(visitRxItems[i][key]) + '" ' +
                'oninput="onRxInput(' + i + ', \'' + key + '\', this.value)" ' + (extra || "") + '>' +
        '</label>';

    host.innerHTML = visitRxItems.map((item, i) =>
        '<div class="rx-row" data-rx-row="' + i + '">' +
            '<div class="rx-row__medicine">' +
                input(i, "drug", "Medicine",
                    'role="combobox" aria-autocomplete="list" aria-expanded="false" ' +
                    'aria-controls="rx-suggest-' + i + '" placeholder="Start typing, e.g. amo" ' +
                    'onkeydown="onRxDrugKey(event, ' + i + ')" onblur="closeRxSuggest(' + i + ')"') +
                '<div class="rx-suggest hidden" id="rx-suggest-' + i + '" role="listbox" aria-label="Usual medicines"></div>' +
            '</div>' +
            input(i, "strength", "Strength", 'placeholder="500mg" onkeydown="onRxPlainKey(event)"') +
            input(i, "qty", "# (quantity)", 'placeholder="21" onkeydown="onRxPlainKey(event)"') +
            input(i, "sig", "Sig (how to take it)", 'placeholder="Take 1 cap every 8 hrs" onkeydown="onRxPlainKey(event)"') +
            '<button type="button" class="btn-secondary btn-sm rx-row__remove" ' +
                'aria-label="Remove medicine ' + (i + 1) + '" onclick="removeVisitRxRow(' + i + ')">Remove</button>' +
        '</div>'
    ).join("");

    const add = document.getElementById("complete-rx-add");
    if (add) add.disabled = visitRxItems.length >= RX_LIMITS.rows;
}

/** Something was typed in a row. */
function onRxInput(i, key, value) {
    if (!visitRxItems[i]) return;
    visitRxItems[i][key] = value;
    if (key === "drug") openRxSuggest(i, value);
}

/** Enter in a prescription box must not save the whole visit. */
function onRxPlainKey(event) {
    if (event.key === "Enter") event.preventDefault();
}

function addVisitRxRow() {
    if (visitRxItems.length >= RX_LIMITS.rows) return;
    visitRxItems.push(emptyRxItem());
    rxSuggest = null;
    renderVisitRx();
    const box = document.getElementById("rx-drug-" + (visitRxItems.length - 1));
    if (box) box.focus();
}

function removeVisitRxRow(i) {
    visitRxItems.splice(i, 1);
    if (!visitRxItems.length) visitRxItems.push(emptyRxItem());
    rxSuggest = null;
    renderVisitRx();
}

/** The presets whose medicine starts with what was typed, ignoring capitals. */
function matchRxPresets(typed) {
    const q = String(typed == null ? "" : typed).trim().toLowerCase();
    if (!q) return [];
    return RX_PRESETS.filter(preset => preset.drug.toLowerCase().indexOf(q) === 0);
}

/** Open (or refresh, or close) the suggestion list under a Medicine box. */
function openRxSuggest(i, typed) {
    const list = document.getElementById("rx-suggest-" + i);
    const box = document.getElementById("rx-drug-" + i);
    if (!list || !box) return;

    const matches = matchRxPresets(typed);
    if (!matches.length) {
        closeRxSuggest(i, true);
        return;
    }

    rxSuggest = { row: i, matches: matches, active: 0 };
    drawRxSuggest();
}

function drawRxSuggest() {
    if (!rxSuggest) return;
    const i = rxSuggest.row;
    const list = document.getElementById("rx-suggest-" + i);
    const box = document.getElementById("rx-drug-" + i);
    if (!list || !box) return;

    // mousedown, not click: a click arrives after the box has lost focus, by
    // which time the list would already have closed.
    list.innerHTML = rxSuggest.matches.map((preset, k) =>
        '<div class="rx-suggest__option' + (k === rxSuggest.active ? ' is-active' : '') + '" role="option" ' +
            'id="rx-opt-' + i + '-' + k + '" aria-selected="' + (k === rxSuggest.active) + '" ' +
            'onmousedown="event.preventDefault(); acceptRxSuggestion(' + i + ', ' + k + ')">' +
            '<span class="rx-suggest__name">' + escapeHtml(preset.drug + " " + preset.strength) + '</span>' +
            '<span class="rx-suggest__sig">' + escapeHtml(preset.sig) + '</span>' +
        '</div>'
    ).join("");
    list.classList.remove("hidden");
    box.setAttribute("aria-expanded", "true");
    box.setAttribute("aria-activedescendant", "rx-opt-" + i + "-" + rxSuggest.active);
}

/**
 * Close the list. On blur it waits a moment, so a suggestion being clicked is
 * accepted before the list it sits in disappears.
 */
function closeRxSuggest(i, now) {
    const close = () => {
        const list = document.getElementById("rx-suggest-" + i);
        const box = document.getElementById("rx-drug-" + i);
        if (list) { list.classList.add("hidden"); list.innerHTML = ""; }
        if (box) {
            box.setAttribute("aria-expanded", "false");
            box.removeAttribute("aria-activedescendant");
        }
        if (rxSuggest && rxSuggest.row === i) rxSuggest = null;
    };
    if (now) close();
    else setTimeout(close, 120);
}

/**
 * Keys in a Medicine box.
 *
 * With the list open: Up and Down move the highlight, Tab or Enter accepts the
 * highlighted medicine, Escape closes the list. With no list open Tab does
 * what Tab always does, and Enter is swallowed so it cannot save the visit.
 */
function onRxDrugKey(event, i) {
    const open = rxSuggest && rxSuggest.row === i;

    if (!open) {
        if (event.key === "Enter") event.preventDefault();
        return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const n = rxSuggest.matches.length;
        rxSuggest.active = (rxSuggest.active + (event.key === "ArrowDown" ? 1 : n - 1)) % n;
        drawRxSuggest();
    } else if (event.key === "Enter" || (event.key === "Tab" && !event.shiftKey)) {
        event.preventDefault();
        acceptRxSuggestion(i, rxSuggest.active);
    } else if (event.key === "Escape") {
        // Only the list closes; the visit form stays open.
        event.preventDefault();
        event.stopPropagation();
        closeRxSuggest(i, true);
    }
}

/** Fill one row from a preset and move on to the quantity, which is hers to write. */
function acceptRxSuggestion(i, k) {
    if (!rxSuggest || rxSuggest.row !== i || !visitRxItems[i]) return;
    const preset = rxSuggest.matches[k];
    if (!preset) return;

    visitRxItems[i] = { drug: preset.drug, strength: preset.strength, qty: preset.qty, sig: preset.sig };
    ["drug", "strength", "qty", "sig"].forEach(key => {
        const el = document.getElementById("rx-" + key + "-" + i);
        if (el) el.value = visitRxItems[i][key];
    });

    closeRxSuggest(i, true);
    const qty = document.getElementById("rx-qty-" + i);
    if (qty) { qty.focus(); qty.select(); }
}
