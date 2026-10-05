/**
 * DentCare — Services
 * ---------------------------------------------------------------------------
 * The list a patient picks from when booking, and the screen where staff
 * maintain it.
 *
 * WHERE THE LIST LIVES
 * In Firestore, collection `treatments` — not in this file. The nine entries
 * below are only a starting set: staff press "Load the standard list" once on
 * a fresh clinic and then own the list from the Manage Services screen.
 * Hard-coding the list in the page would have been simpler to ship and wrong
 * to live with, because renaming a service would then need a developer.
 *
 * WHY EACH LABEL CARRIES TAGALOG
 * The patient reading this is standing at the front desk in Naga City on a
 * tablet. "Prophylaxis" means nothing to most of them; "pagpapalinis ng
 * ngipin" does. Both go in the same line so there is no second column to
 * scan and nothing to translate in their head.
 *
 * NO PRICES ANYWHERE
 * Deliberate, and it must stay that way. Dr. Gapit sets the fee after she has
 * looked in the mouth — see the note in submitBooking() and the "Final charge"
 * field on the completion form. A price quoted at booking would commit her to
 * a number before she has seen the patient.
 */

// ── The standard list ───────────────────────────────────────────────────────
//
// sortOrder exists because Firestore returns documents unordered and this list
// has a deliberate shape: everyday care first, surgery in the middle, cosmetic
// last. Alphabetical would open with "Braces Adjustment", which is not what
// most people walk in for.
const DEFAULT_SERVICES = [
    { sortOrder: 10, treatmentName: "Dental Check-up / Consultation",     description: "Pagsusuri sa ngipin at bibig" },
    { sortOrder: 20, treatmentName: "Tooth Cleaning / Oral Prophylaxis",  description: "Pagpapalinis ng ngipin" },
    { sortOrder: 30, treatmentName: "Tooth Filling / Pasta",              description: "Pagtatagpi at pag-aayos ng sira" },
    { sortOrder: 40, treatmentName: "Tooth Extraction / Bunot",           description: "Pagpapabunot" },
    { sortOrder: 50, treatmentName: "Wisdom Tooth / Minor Oral Surgery",  description: "Operasyon sa wisdom tooth" },
    { sortOrder: 60, treatmentName: "Braces Consultation / Installation", description: "Pagpapakabit ng braces" },
    { sortOrder: 70, treatmentName: "Braces Adjustment / Maintenance",    description: "Pagpapa-adjust ng braces" },
    { sortOrder: 80, treatmentName: "Teeth Whitening",                    description: "Pagpapaputi ng ngipin" },
    { sortOrder: 90, treatmentName: "Dentures / Pustiso",                 description: "Paggawa o pag-adjust ng pustiso" }
];

// "Others" is NOT in that list and must never be added to it. It is the last
// option in the booking dropdown, it has no treatment document, and it carries
// a typed note instead — which is how a patient asks for a combination
// ("linis at pasta") that no single row can express.

let servicesCache = [];


/** Resolve an element inside whichever role layout is on screen. */
function servicesEl(cls) {
    return document.querySelector(".app-layout:not(.hidden) ." + cls);
}


// ─────────────────────────────────────────────────────────────
// Staff screen — Manage Services
// ─────────────────────────────────────────────────────────────

/**
 * Read the list and draw it. Inactive services are shown too, greyed, because
 * "where did Teeth Whitening go?" is a worse question than a dim row.
 */
function loadServicesAdmin() {
    const host = servicesEl("services-admin-list");
    if (!host) return;

    host.innerHTML = '<p class="svc-empty">Loading services…</p>';

    db.collection("treatments").get()
        .then(snap => {
            // This runs after every save on this screen, so it is where the
            // cached price list the booking form reads is dropped. Without it,
            // a service added here would be missing from the booking form for
            // up to a minute, which reads as "it did not save".
            if (typeof refreshReference === "function") refreshReference("treatments");
            servicesCache = [];
            snap.forEach(doc => servicesCache.push({ id: doc.id, ...doc.data() }));
            sortServices(servicesCache);
            renderServicesAdmin();
        })
        .catch(err => {
            console.error("Could not load services:", err);
            host.innerHTML = '<p class="svc-empty">Could not load the service list. Please refresh.</p>';
        });
}

/**
 * Deliberate order first, alphabetical for anything staff added without one.
 * A service with no sortOrder sorts after the standard list rather than
 * jumping to the top, so adding one never reshuffles what patients are used to.
 */
function sortServices(list) {
    return list.sort((a, b) => {
        const ao = Number.isFinite(a.sortOrder) ? a.sortOrder : 9999;
        const bo = Number.isFinite(b.sortOrder) ? b.sortOrder : 9999;
        if (ao !== bo) return ao - bo;
        return String(a.treatmentName || "").localeCompare(String(b.treatmentName || ""));
    });
}

function renderServicesAdmin() {
    const host = servicesEl("services-admin-list");
    if (!host) return;

    if (!servicesCache.length) {
        host.innerHTML =
            '<p class="svc-empty">No services yet. Press <strong>Load the standard list</strong> ' +
            'above to add the nine Dr. Gapit usually offers — you can rename or remove any of ' +
            'them afterwards.</p>';
        return;
    }

    host.innerHTML = servicesCache.map(s => {
        const off = s.isActive !== true;
        return '<div class="svc-row' + (off ? ' svc-row--off' : '') + '">' +
            '<span class="svc-row__body">' +
                '<span class="svc-row__name">' + escapeHtml(s.treatmentName || "Untitled") + '</span>' +
                (s.description
                    ? '<span class="svc-row__desc">' + escapeHtml(s.description) + '</span>'
                    : '') +
            '</span>' +
            (off ? '<span class="svc-row__flag">Hidden</span>' : '') +
            '<span class="svc-row__actions">' +
                '<button type="button" class="btn-secondary btn-sm" ' +
                    'onclick="editService(\'' + escapeJsAttr(s.id) + '\')">Rename</button>' +
                '<button type="button" class="btn-secondary btn-sm" ' +
                    'onclick="toggleServiceActive(\'' + escapeJsAttr(s.id) + '\')">' +
                    (off ? "Show" : "Hide") +
                '</button>' +
                '<button type="button" class="btn-secondary btn-sm svc-delete" ' +
                    'onclick="deleteService(\'' + escapeJsAttr(s.id) + '\')">Delete</button>' +
            '</span>' +
        '</div>';
    }).join("");
}

/**
 * Write the standard nine, skipping any whose name already exists.
 *
 * Skipping by name rather than refusing outright means pressing this twice is
 * harmless, and a clinic that deleted one entry by accident can get it back
 * without the other eight being duplicated.
 */
function seedDefaultServices() {
    const existing = servicesCache.map(s => String(s.treatmentName || "").toLowerCase());
    const missing = DEFAULT_SERVICES.filter(
        d => existing.indexOf(d.treatmentName.toLowerCase()) === -1
    );

    if (!missing.length) {
        if (typeof showToast === "function") {
            showToast("The standard services are already on the list.", "info");
        }
        return;
    }

    const batch = db.batch();
    missing.forEach(d => {
        batch.set(db.collection("treatments").doc(), {
            treatmentName: d.treatmentName,
            description: d.description,
            sortOrder: d.sortOrder,
            isActive: true,
            createdAt: new Date().toISOString()
        });
    });

    batch.commit()
        .then(() => {
            if (typeof showToast === "function") {
                showToast("Added " + missing.length + " service" + (missing.length === 1 ? "" : "s") + ".", "success");
            }
            loadServicesAdmin();
        })
        .catch(err => {
            console.error("Could not add the standard services:", err);
            if (typeof showToast === "function") {
                showToast("Could not add them. Please try again.", "error");
            }
        });
}

/** Add a service staff typed in. */
function addService(e) {
    if (e) e.preventDefault();

    const nameEl = servicesEl("svc-new-name");
    const descEl = servicesEl("svc-new-desc");
    if (!nameEl) return;

    const treatmentName = nameEl.value.trim();
    const description   = descEl ? descEl.value.trim() : "";

    if (!treatmentName) {
        if (typeof showToast === "function") showToast("Type a service name first.", "error");
        return;
    }

    const clash = servicesCache.some(
        s => String(s.treatmentName || "").toLowerCase() === treatmentName.toLowerCase()
    );
    if (clash) {
        if (typeof showToast === "function") {
            showToast("That service is already on the list.", "error");
        }
        return;
    }

    db.collection("treatments").add({
        treatmentName: treatmentName,
        description: description,
        isActive: true,
        createdAt: new Date().toISOString()
    })
    .then(() => {
        nameEl.value = "";
        if (descEl) descEl.value = "";
        if (typeof showToast === "function") showToast("Service added.", "success");
        loadServicesAdmin();
    })
    .catch(err => {
        console.error("Could not add the service:", err);
        if (typeof showToast === "function") showToast("Could not add it. Please try again.", "error");
    });
}

/** Rename a service, and its Tagalog line with it. */
async function editService(id) {
    const svc = servicesCache.find(s => s.id === id);
    if (!svc) return;

    const answer = await appDialog({
        title: "Edit service", confirmLabel: "Save changes",
        fields: [
            { name: "name", label: "Service name", value: svc.treatmentName || "", required: true, maxLength: 150 },
            { name: "desc", label: "Tagalog description (optional)", value: svc.description || "", multiline: true, rows: 3, maxLength: 500 }
        ]
    });
    if (!answer.confirmed) return;
    const name = answer.values.name;
    const desc = answer.values.desc;

    // Only what changed, and not over a rename made on another screen while
    // these prompts were open (2026-09-17).
    saveChangedFields(
        db.collection("treatments").doc(id),
        { treatmentName: svc.treatmentName, description: svc.description },
        { treatmentName: name.trim(), description: desc.trim() }
    )
        .then(() => {
            if (typeof showToast === "function") showToast("Service updated.", "success");
            loadServicesAdmin();
        })
        .catch(err => {
            if (err && err.code === RECORD_CHANGED) {
                if (typeof showToast === "function") {
                    showToast(recordChangedMessage(err, { treatmentName: "the name", description: "the description" }), "warning");
                }
                loadServicesAdmin();
                return;
            }
            console.error("Could not rename the service:", err);
            if (typeof showToast === "function") showToast("Could not save. Please try again.", "error");
        });
}

/**
 * Hide or show a service.
 *
 * Hide is a reversible alternative to permanent catalog deletion. Historical
 * appointments, bills and clinical records carry their own service names.
 */
function toggleServiceActive(id) {
    const svc = servicesCache.find(s => s.id === id);
    if (!svc) return;

    // Writes the state the button offered, not "the opposite of whatever it
    // is now": pressed on a stale list, a flip would undo what another screen
    // just did. If it is already that way, nothing is written (2026-09-17).
    saveChangedFields(
        db.collection("treatments").doc(id),
        { isActive: svc.isActive },
        { isActive: svc.isActive !== true }
    )
        .then(loadServicesAdmin)
        .catch(err => {
            if (err && err.code === RECORD_CHANGED) {
                if (typeof showToast === "function") {
                    showToast("That service was changed on another screen. The list has been refreshed.", "warning");
                }
                loadServicesAdmin();
                return;
            }
            console.error("Could not change the service:", err);
            if (typeof showToast === "function") showToast("Could not save. Please try again.", "error");
        });
}


const serviceDeletesInFlight = new Set();
async function deleteService(id) {
    if ((currentRole !== "staff" && currentRole !== "admin") || serviceDeletesInFlight.has(id)) return;
    const svc = servicesCache.find(s => s.id === id);
    if (!svc) return;
    serviceDeletesInFlight.add(id);
    try {
        const confirmed = await confirmDialog('Permanently delete "' + svc.treatmentName + '"? It will be removed from the service list. Existing appointments, bills and treatment records keep their saved details. Adding it again creates a new service.',
            { title: "Delete service?", confirmLabel: "Delete permanently", tone: "danger" });
        if (!confirmed) return;
        const ref = db.collection("treatments").doc(id);
        await db.runTransaction(async tx => {
            const snap = await tx.get(ref);
            if (!snap.exists) return;
            if (snap.data().treatmentName !== svc.treatmentName) throw new Error("This service was renamed. Refresh the list before deleting it.");
            // Only the catalog entry is removed. Historical records have name snapshots.
            tx.delete(ref);
        });
        if (typeof refreshReference === "function") refreshReference("treatments");
        if (typeof globalTreatmentsList !== "undefined") globalTreatmentsList = globalTreatmentsList.filter(t => t.treatment_id !== id);
        showToast("Service permanently deleted.", "success");
        loadServicesAdmin();
    } catch (err) {
        showToast(err.message && err.message.includes("renamed") ? err.message : "Could not delete the service. Please refresh and try again.", "error");
    } finally { serviceDeletesInFlight.delete(id); }
}
