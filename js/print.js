// ─────────────────────────────────────────────────────────────
// DentCare – js/print.js (one way to print a half sheet)
// ─────────────────────────────────────────────────────────────
//
// Added 2026-09-30. The clinic prints on long bond paper (8.5 × 13 in) fed in
// landscape and cut down the middle, so each document is a half sheet 6.5 in
// wide and 8.5 in tall. The prescription, the certificate and the receipt all
// print that way, so the page set-up lives here once and they each hand this
// file their own HTML.
//
// Two paper choices, remembered on this computer:
//
//   long-landscape  a 13 × 8.5 in page with the document on the LEFT half and
//                   a faint dashed line at 6.5 in to cut along. The right half
//                   is left blank. This is the default, because it is the
//                   paper the clinic loads.
//   half            a 6.5 × 8.5 in page, for sheets that are already cut.
//
// Whether a given printer honours a custom page size is between the browser
// and the printer driver, and cannot be tested from here. It has to be tried
// once on the clinic's own printer.

/** Where the paper choice is remembered (localStorage, this browser only). */
const PRINT_SHEET_KEY = "dentcare.printSheet";

/** The two papers, in the order the chooser lists them. */
const PRINT_SHEETS = [
    { value: "long-landscape", label: "Long bond, landscape (cut in the middle)" },
    { value: "half",           label: "Half sheet 6.5 × 8.5 in" }
];

/**
 * The paper to print on: "long-landscape" unless "half" was chosen.
 *
 * Storage can be blocked (a private window, a locked-down profile). That is
 * not a reason to stop anybody printing, so it falls back to the default.
 */
function getPrintSheet() {
    try {
        return window.localStorage.getItem(PRINT_SHEET_KEY) === "half" ? "half" : "long-landscape";
    } catch (err) {
        return "long-landscape";
    }
}

/** Remember the paper, and show it on every chooser that is on screen. */
function setPrintSheet(value) {
    const sheet = value === "half" ? "half" : "long-landscape";
    try {
        window.localStorage.setItem(PRINT_SHEET_KEY, sheet);
    } catch (err) {
        /* Not remembered. The print still goes ahead on the default paper. */
    }
    if (typeof document !== "undefined" && document.querySelectorAll) {
        document.querySelectorAll(".print-sheet-chooser select").forEach(select => { select.value = sheet; });
    }
    return sheet;
}

/** The small "Paper" select that sits beside a Print button. */
function printSheetChooserHtml() {
    const current = getPrintSheet();
    return '<label class="print-sheet-chooser">' +
        '<span>Paper</span>' +
        '<select onchange="setPrintSheet(this.value)">' +
            PRINT_SHEETS.map(sheet =>
                '<option value="' + sheet.value + '"' + (sheet.value === current ? " selected" : "") + '>' +
                    escapeHtml(sheet.label) + '</option>').join("") +
        '</select>' +
    '</label>';
}

/** Put the chooser into every ".print-sheet-slot" inside one dialog. */
function fillPrintSheetSlots(root) {
    const host = root || document;
    if (!host || !host.querySelectorAll) return;
    host.querySelectorAll(".print-sheet-slot").forEach(slot => { slot.innerHTML = printSheetChooserHtml(); });
}

/**
 * The page set-up for one paper.
 *
 * Black on white only, system fonts, no tinted panels: these are run off on a
 * mono laser printer, where a tint prints as a smudge over the text.
 */
function printSheetCss(sheet) {
    const long = sheet !== "half";
    return "@page { size: " + (long ? "13in 8.5in" : "6.5in 8.5in") + "; margin: 0; }\n" +
        "* { box-sizing: border-box; }\n" +
        "html, body { margin: 0; padding: 0; background: #ffffff; color: #000000; " +
            "font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.35; }\n" +
        "body { width: " + (long ? "13in" : "6.5in") + "; }\n" +
        // One .page per sheet of paper. A document that does not fit on one
        // half sheet is handed over as several, each printed on its own page.
        ".page { position: relative; width: " + (long ? "13in" : "6.5in") + "; height: 8.5in; overflow: hidden; " +
            "page-break-after: always; break-after: page; }\n" +
        ".page:last-child { page-break-after: auto; break-after: auto; }\n" +
        ".sheet { position: absolute; left: 0; top: 0; width: 6.5in; height: 8.5in; padding: 0.4in; overflow: hidden; }\n" +
        (long
            ? ".cut-line { position: absolute; left: 6.5in; top: 0; height: 8.5in; width: 0; " +
                  "border-left: 1px dashed #9a9a9a; }\n"
            : "");
}

/**
 * The whole document that is sent to the printer, as a string.
 *
 * @param {{title: string, bodyHtml: string, pages: string[], css: string}} page
 *        bodyHtml is one half sheet of HTML the caller has already escaped;
 *        pages is several, for a document too long for one sheet; css is that
 *        document's own rules
 * @param {string} [sheet]  the paper; the remembered one when left out
 */
function printSheetDocument(page, sheet) {
    const paper = sheet === "half" || sheet === "long-landscape" ? sheet : getPrintSheet();
    const bodies = (page && Array.isArray(page.pages) && page.pages.length)
        ? page.pages
        : [(page && page.bodyHtml) || ""];
    return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
        '<title>' + escapeHtml((page && page.title) || "DentCare") + '</title>' +
        '<style>' + printSheetCss(paper) + ((page && page.css) || "") + '</style></head><body>' +
        bodies.map(body =>
            '<div class="page"><div class="sheet">' + body + '</div>' +
            (paper === "long-landscape" ? '<div class="cut-line" aria-hidden="true"></div>' : '') +
            '</div>').join("") +
        '</body></html>';
}

/**
 * Print one half-sheet document on the chosen paper.
 *
 * Written into a hidden iframe rather than a popup window, because popup
 * blockers silently swallow window.open() and whoever pressed Print would see
 * nothing at all, with no message to explain it.
 *
 * @param {Object} page  what printSheetDocument() takes, plus an optional
 *        beforePrint(document) called once the document is laid out
 */
function printClinicSheet(page) {
    const html = printSheetDocument(page);

    // Reuse one iframe. Appending a new one per print leaks a node each time,
    // and a clinic printing after every patient would collect them all day.
    let frame = document.getElementById("clinic-print-frame");
    if (!frame) {
        frame = document.createElement("iframe");
        frame.id = "clinic-print-frame";
        frame.setAttribute("aria-hidden", "true");
        // Off screen and unseen, but a real 13 by 8.5 inch box: a caller that
        // measures the laid-out document needs it to have a size.
        frame.style.cssText = "position:fixed;left:-20000px;top:0;width:13in;height:8.5in;border:0;visibility:hidden;";
        document.body.appendChild(frame);
    }

    const doc = frame.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();

    // Give the iframe a tick to lay the document out. Calling print() on a
    // document that has not been laid out yet prints a blank page in Safari.
    setTimeout(() => {
        try {
            // A last look at the laid-out document, for a caller that has to
            // measure before it prints (the certificate checks that its text
            // fits). Returning false stops the print.
            if (page && typeof page.beforePrint === "function" &&
                page.beforePrint(frame.contentWindow.document) === false) return;
            frame.contentWindow.focus();
            frame.contentWindow.print();
        } catch (err) {
            console.error("Print failed:", err);
            showToast("Could not open the print dialog. Try again.", "error");
        }
    }, 250);
}
