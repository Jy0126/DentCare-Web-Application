/*
 * DentCare - phone record cards (2026-09-25, owner-approved layout rules)
 *
 * On phones every data table in the portal is drawn as a stack of cards
 * (css/components.css, "PHONES: every data table is a stack of record
 * cards"): no sideways scrolling, one record per card. The CSS cannot see
 * column names, so each cell is given its column's name here (data-label),
 * and the header says which column is the card's title, its status badge and
 * its buttons (data-card on the <th>). With no title marked, the first column
 * is the title. Only attributes are written, so the observer below never
 * triggers itself, and the row renderers in the other modules stay untouched.
 *
 * Its own file, not part of js/app.js, so the offline browser checks can load
 * exactly this with the real templates (tools/preview-client-revision.php).
 */
const CARD_QUERY = "(max-width: 600px)";

function stampTableCards(container) {
    const table = container.querySelector("table");
    const headRow = table && table.tHead && table.tHead.rows[0];
    if (!headRow) return;
    const heads = Array.from(headRow.cells);
    const marked = heads.findIndex(th => th.dataset.card === "title");
    const titleIndex = marked === -1 ? 0 : marked;
    Array.from(table.tBodies).forEach(body => Array.from(body.rows).forEach(row => {
        // "No bills match." and the like: one cell across the whole table.
        if (row.cells.length === 1 && row.cells[0].colSpan > 1) {
            if (!row.hasAttribute("data-card-empty")) row.setAttribute("data-card-empty", "");
            return;
        }
        Array.from(row.cells).forEach((cell, i) => {
            const th = heads[i];
            const label = th ? th.textContent.trim().replace(/\s+/g, " ") : "";
            const role = i === titleIndex ? "title" : (th && th.dataset.card) || "";
            if (cell.getAttribute("data-label") !== label) cell.setAttribute("data-label", label);
            if ((cell.getAttribute("data-card") || "") !== role) {
                if (role) cell.setAttribute("data-card", role);
                else cell.removeAttribute("data-card");
            }
        });
    }));
}

function initTableCards() {
    if (typeof window.matchMedia !== "function") return;
    const phone = window.matchMedia(CARD_QUERY);
    document.querySelectorAll(".main-content").forEach(main => {
        let frame = 0;
        const pending = new Set();
        const queueAll = () => {
            main.querySelectorAll(".table-container").forEach(table => pending.add(table));
            schedule();
        };
        const run = () => {
            frame = 0;
            if (phone.matches) pending.forEach(stampTableCards);
            pending.clear();
        };
        const schedule = () => { if (!frame) frame = requestAnimationFrame(run); };
        if (phone.matches) main.querySelectorAll(".table-container").forEach(stampTableCards);
        // Rows arrive and are redrawn long after load, some tables are built
        // whole by a module (patient history). Only restamp tables whose rows
        // actually changed; notification/sidebar DOM updates used to scan every
        // card in every table on the next animation frame.
        new MutationObserver(records => {
            if (!phone.matches) return;
            records.forEach(record => {
                const table = record.target.closest && record.target.closest(".table-container");
                if (table) pending.add(table);
                record.addedNodes.forEach(node => {
                    if (node.nodeType !== 1) return;
                    if (node.matches && node.matches(".table-container")) pending.add(node);
                    if (node.querySelectorAll) node.querySelectorAll(".table-container").forEach(t => pending.add(t));
                });
            });
            if (pending.size) schedule();
        }).observe(main, { childList: true, subtree: true });
        if (typeof phone.addEventListener === "function") phone.addEventListener("change", queueAll);
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTableCards);
} else {
    initTableCards();
}
