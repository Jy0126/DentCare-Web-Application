// Staff use the same intake form as public registration. Since 2026-10-01 it
// saves a patient RECORD with no online account: submitStaffPatientRecord() below.
let staffPatientIntake = false;
let staffSavedPatient = null;
let staffQueueInFlight = false;
let staffQueueNeedsRetry = false;

function openStaffPatientRegistration() {
    if (currentRole !== "staff" && currentRole !== "admin") return;
    switchStaffTab("tab-staff-patient-registration", document.getElementById("nav-staff-register-patient"));
}

function activateStaffPatientRegistration() {
    if (staffPatientIntake) return; // preserve an unfinished form or saved-profile retry when revisiting
    staffPatientIntake = true;
    resetStaffPatientForm();
}

function resetStaffPatientForm() {
    const form = document.getElementById("form-register");
    form.hidden = false;
    document.getElementById("staff-saved-patient").hidden = true;
    staffSavedPatient = null;
    staffQueueNeedsRetry = false;
    staffDuplicateCleared = "";
    hideStaffDuplicateNotice();
    document.getElementById("staff-queue-retry").hidden = true;
    document.getElementById("staff-saved-done").disabled = false;
    document.getElementById("staff-queue-state").textContent = "";
    form.reset();
    form.querySelectorAll(".input-error, .checked").forEach(el => el.classList.remove("input-error", "checked"));
    if (typeof markRegisterDob === "function") markRegisterDob([], "");
    form.querySelectorAll(".radio-pill").forEach(el => setRadioPill(el.id, el.id === "med-good-health" ? 1 : 0));
    ["med-treatment", "med-illness", "med-hospitalized", "med-prescribed"].forEach(id => hideDetails(id + "-details-wrap"));
    toggleMinorFields(false);
    hidePasswordAgain("reg-password");
    evaluatePasswordStrength("");
    clearSignatureCanvas();
    goBackToRegisterStep1();
}

function registerAnotherStaffPatient() {
    if (!isStaffPatientIntake() || registrationInFlight || staffQueueInFlight || staffQueueNeedsRetry) return;
    resetStaffPatientForm();
    document.getElementById("reg-first-name").focus();
}

// Once the record is saved, no button may save it again. Keep its id in the
// section so a failed queue operation retries only queue.js.
function completeStaffPatientIntake(patient, addToQueue) {
    staffSavedPatient = patient;
    document.getElementById("form-register").hidden = true;
    const saved = document.getElementById("staff-saved-patient");
    saved.hidden = false;
    document.getElementById("staff-saved-name").textContent = patient.name;
    saved.focus();
    if (!addToQueue) {
        document.getElementById("staff-queue-state").textContent = "The record is saved. This patient was not added to today's queue.";
        showToast("Patient record saved.", "success");
        return Promise.resolve();
    }
    staffQueueNeedsRetry = true;
    document.getElementById("staff-queue-retry").hidden = false;
    document.getElementById("staff-saved-done").disabled = true;
    document.getElementById("staff-queue-state").textContent = "Adding this patient to today's queue…";
    return retryStaffPatientQueue();
}

function retryStaffPatientQueue() {
    if (!staffSavedPatient || !staffQueueNeedsRetry || staffQueueInFlight || !isStaffPatientIntake()) return Promise.resolve();
    staffQueueInFlight = true;
    const retry = document.getElementById("staff-queue-retry");
    const done = document.getElementById("staff-saved-done");
    retry.disabled = true;
    done.disabled = true;
    const patient = staffSavedPatient;
    return Promise.resolve().then(() => enqueuePatient({
        patientId: patient.uid, patientName: patient.name, isWalkIn: true
    })).then(() => {
        staffQueueNeedsRetry = false;
        document.getElementById("staff-queue-state").textContent = "The record is saved and the patient is in today's queue.";
        showToast("Patient record saved and added to today's queue.", "success");
        return true;
    }).catch(err => {
        if (err && err.code === "already-queued") {
            staffQueueNeedsRetry = false;
            document.getElementById("staff-queue-state").textContent = "This patient is already in today's queue. No duplicate was added.";
            showToast("Patient is already in today's queue; no duplicate was added.", "success");
            return true;
        }
        console.error("Staff queue add failed after saving the record:", err);
        document.getElementById("staff-queue-state").textContent = "The record is saved, but queue addition failed. Retry the queue only; do not save this patient again.";
        showToast("Record saved, but queue addition failed. Use Retry queue only; do not save the patient again.", "warning");
        return false;
    }).then(queued => {
        staffQueueInFlight = false;
        return queued;
    }).finally(() => {
        staffQueueInFlight = false;
        retry.hidden = !staffQueueNeedsRetry;
        retry.disabled = !staffQueueNeedsRetry;
        done.disabled = staffQueueNeedsRetry;
    });
}

function isStaffPatientIntake() {
    return staffPatientIntake && (currentRole === "staff" || currentRole === "admin");
}

// ── A patient record without an account (2026-10-01, client revision 16) ──
//
// Dr. Gapit's patients told the clinic that many of them do not want an
// account, some have no email, and the form had too many red boxes. So the
// front desk makes the patient RECORD, on the same form, through its own
// session: one patients/{autoId} document, no Firebase login, no users
// document, no password. firestore.rules already lets staff create a patient
// document under any id, provided it arrives with an empty chart.
//
// Only the first name, last name and date of birth are required
// (validateStep1). A consent left blank is collected later on Patient History
// (consentPending). Save record works from any step, so a paper card can be
// entered with the rest left blank.

/** The record's key for spotting a duplicate: names without capitals or accents, and the birth date. */
function patientRecordKey(first, last, dob) {
    const key = value => String(value == null ? "" : value).toLowerCase()
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/\s+/g, " ").trim();
    return key(first) + "|" + key(last) + "|" + String(dob || "").trim();
}

/**
 * A record already on file for the same person: the same first and last name,
 * capitals and accents ignored, and the same date of birth. Null if none.
 * It is a warning, never a block: two real people can share all three.
 */
function findDuplicatePatient(patientsById, first, last, dob) {
    const want = patientRecordKey(first, last, dob);
    const ids = Object.keys(patientsById || {});
    for (let i = 0; i < ids.length; i++) {
        const p = patientsById[ids[i]] || {};
        if (p.mergedInto) continue;   // its account's record is the one to match (R17)
        if (patientRecordKey(p.firstName, p.lastName, p.dateOfBirth) === want) {
            return Object.assign({ id: ids[i] }, p);
        }
    }
    return null;
}

/** "March 7, 1995" from "1995-03-07"; the text as stored if it is not that shape. */
function formatRecordDob(dob) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dob || ""));
    if (!m || typeof DOB_MONTH_NAMES === "undefined") return String(dob || "");
    return DOB_MONTH_NAMES[Number(m[2]) - 1] + " " + Number(m[3]) + ", " + m[1];
}

/**
 * True once anything of the consent has been given: the box, the typed name,
 * a mark on the pad, or "I agree to the Privacy Policy" (2026-10-03, R22),
 * which the patient ticks with the consent, never the staff for them.
 */
function staffConsentStarted() {
    const agree = document.getElementById("reg-consent-agree");
    const name = document.getElementById("reg-signature");
    const privacy = document.getElementById("reg-privacy-agree");
    return !!((agree && agree.checked) || (privacy && privacy.checked) ||
              (name && name.value.trim()) ||
              (typeof signatureHasBeenDrawn === "function" && signatureHasBeenDrawn()));
}

/** The record the duplicate notice is about, and how the save was asked for. */
let staffDuplicate = null;
/** The key the staff member chose to save anyway, so the notice is not shown twice for it. */
let staffDuplicateCleared = "";

function showStaffDuplicateNotice(dup, intent, key) {
    staffDuplicate = { id: dup.id, intent: intent, key: key };
    const box = document.getElementById("staff-duplicate-notice");
    const text = document.getElementById("staff-duplicate-text");
    const name = ((dup.firstName || "") + " " + (dup.lastName || "")).trim() || "this patient";
    if (text) text.textContent = "A record for " + name + ", born " + formatRecordDob(dup.dateOfBirth) + ", already exists.";
    if (!box) return;
    box.hidden = false;
    if (typeof box.scrollIntoView === "function") box.scrollIntoView({ behavior: "smooth", block: "center" });
    if (typeof box.focus === "function") box.focus();
}

function hideStaffDuplicateNotice() {
    staffDuplicate = null;
    const box = document.getElementById("staff-duplicate-notice");
    if (box) box.hidden = true;
}

/** "Open it": the record already on file, on Patient History. The draft here is kept. */
function openStaffDuplicate() {
    if (!staffDuplicate) return;
    const id = staffDuplicate.id;
    switchStaffTab("tab-staff-history", document.getElementById("nav-staff-history"));
    if (typeof selectPatientForHistory === "function") selectPatientForHistory({ patient_id: id });
}

/** "Save anyway": a different person who shares the name and birthday. */
function saveStaffRecordAnyway() {
    if (!staffDuplicate) return Promise.resolve();
    const pending = staffDuplicate;
    staffDuplicateCleared = pending.key;
    hideStaffDuplicateNotice();
    return submitStaffPatientRecord({ submitter: { dataset: { registrationIntent: pending.intent } } });
}

/** Scroll to and focus the first red box on a step. */
function focusFirstRegisterError(step) {
    const firstError = document.querySelector("#register-step-" + step + " .input-error");
    if (!firstError) return;
    if (typeof firstError.scrollIntoView === "function") firstError.scrollIntoView({ behavior: "smooth", block: "center" });
    if (typeof firstError.focus === "function") firstError.focus();
}

/**
 * Save the patient record. Called by submitRegister() for the staff tab, from
 * Save record on any step or from Register & Add to Today's Queue on step 3.
 */
function submitStaffPatientRecord(e) {
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    if (!isStaffPatientIntake() || registrationInFlight || staffSavedPatient) return Promise.resolve();
    const intent = (e && e.submitter && e.submitter.dataset && e.submitter.dataset.registrationIntent) || "register-only";
    const addToQueue = intent === "register-queue";

    const step1 = validateStep1();
    if (!step1.isValid) {
        goBackToRegisterStep1();
        showToast("Please fix the boxes marked in red: " + step1.missing.join(", "), "warning");
        focusFirstRegisterError(1);
        return Promise.resolve();
    }
    const step2 = validateStep2();
    if (!step2.isValid) {
        goBackToRegisterStep2();
        showToast("Please fix the boxes marked in red: " + step2.missing.join(", "), "warning");
        focusFirstRegisterError(2);
        return Promise.resolve();
    }
    const step3 = validateStep3();
    if (!step3.isValid) {
        goToRegisterStep3();
        showToast("Finish the consent, or clear it to collect it later: " + step3.missing.join(", "), "warning");
        focusFirstRegisterError(3);
        return Promise.resolve();
    }

    const profile = readPatientProfileForm();
    const name = ((profile.firstName || "") + " " + (profile.lastName || "")).trim();
    if (staffConsentStarted()) {
        // Signed here and now; a blank date means today.
        if (!profile.medicalHistory.consentDate) profile.medicalHistory.consentDate = localDateKey();
        // Agreed on the clinic's tablet, recorded by whoever is signed in.
        if (typeof privacyBoxState === "function" && privacyBoxState("reg-privacy-agree") === "ticked") {
            const agreed = privacyAgreementFor("in person", currentUserId || "");
            if (agreed) profile.privacyAccepted = agreed;
        }
    } else {
        // Collected later on Patient History (openCollectConsent in js/records.js).
        profile.medicalHistory.consentSignature = "";
        profile.medicalHistory.consentSignatureImage = "";
        profile.medicalHistory.consentDate = "";
        profile.consentPending = true;
    }
    profile.recordOnly = true;
    profile.createdBy = currentUserId || "";

    // Taken before anything waits, so a double press saves one record.
    registrationInFlight = true;
    const buttons = document.querySelectorAll("#form-register button[type='submit']");
    buttons.forEach(button => { button.disabled = true; });

    const key = patientRecordKey(profile.firstName, profile.lastName, profile.dateOfBirth);
    // The check is a courtesy: if the list cannot be read, the record is still saved.
    const lookForDuplicate = staffDuplicateCleared === key
        ? Promise.resolve(null)
        : Promise.resolve()
            .then(() => getReference("patients"))
            .then(byId => findDuplicatePatient(byId, profile.firstName, profile.lastName, profile.dateOfBirth))
            .catch(err => { console.warn("Could not check for a duplicate record:", err); return null; });

    return lookForDuplicate
        .then(dup => {
            if (dup) {
                showStaffDuplicateNotice(dup, intent, key);
                return null;
            }
            hideStaffDuplicateNotice();
            const ref = db.collection("patients").doc();
            return ref.set(profile).then(() => {
                // The number is now on a record (2026-10-05); never waited on.
                if (typeof notePhoneOnFile === "function") notePhoneOnFile(profile.phoneNumber);
                return ref.id;
            });
        })
        .then(id => {
            if (!id) return;
            staffDuplicateCleared = "";
            refreshReference("patients");
            // Nothing of this patient is left in the hidden form.
            document.getElementById("form-register").reset();
            document.querySelectorAll("#reg-allergies-grid .checkbox-card, #reg-conditions-grid .checkbox-card")
                .forEach(card => card.classList.remove("checked"));
            if (typeof clearSignatureCanvas === "function") clearSignatureCanvas();
            goBackToRegisterStep1();
            return completeStaffPatientIntake({ uid: id, name: name }, addToQueue);
        })
        .catch(err => {
            console.error("Could not save the patient record:", err);
            showToast(err && err.code === "permission-denied"
                ? "The record was not saved: this account is not allowed to add patients."
                : "The record was not saved. Check the connection and press Save record again.", "error");
        })
        .finally(() => {
            registrationInFlight = false;
            buttons.forEach(button => { button.disabled = false; });
        });
}

// ── An online account for a patient record (2026-10-02, R17) ──────────────
//
// A record the front desk made has no login. When the patient wants one, the
// clinic makes it here, and the record is COPIED onto it: the account's record
// is patients/{uid}, because every patient screen, the rules (isSelf) and the
// mobile app find a patient by their login's uid. The old visits, bills and
// receipts stay under the old id, since a receipt can never be rewritten; the
// copy lists every id it has had in mergedFrom, and the clinic's history
// screens read them all (patientRecordIds in js/app.js).
//
// The order is chosen so that any failure leaves nothing usable behind:
//   1. the second app instance makes the login, then its users document as
//      itself, which is the only way that document may be written;
//   2. the clinic's own session writes, in ONE transaction, the copy (chart
//      included: firestore.rules isRecordCopy), mergedInto on the old record,
//      and the upcoming bookings moved to the new id;
//   3. if 2 fails, the new login is deleted. Its users document is left
//      behind with nothing to sign in to it (users may only be deleted by the
//      owner), which is harmless.
// Reused by Task 18's Reset login, from an account's record to a new login.

/** Fields that belong to the record's old life, never to its new account. */
const RECORD_COPY_DROP = ["recordOnly", "mergedInto", "mergedAt", "mergedBy", "mergedFromId", "mergedFrom",
                          "emailConfirmPending", "signInPhone", "mustChangePassword"];

/** Bookings that move to the new account: still to come and still open. */
const MOVED_BOOKING_STATUSES = ["Pending", "Approved", "Confirmed"];

/** Staff and the doctor make online accounts for records. */
function canCreateOnlineAccount() {
    return currentRole === "staff" || currentRole === "admin" || currentRole === "dentist";
}

/**
 * The second Firebase app: it signs in as the NEW patient, so the clinic's
 * own session is never replaced. Persistence NONE: the new login is held in
 * memory only, and signed out again at the end.
 */
function secondAccountServices() {
    if (!canCreateOnlineAccount()) throw new Error("A clinic sign-in is required.");
    let app = firebase.apps.find(item => item.name === "staffPatientRegistration");
    if (!app) {
        app = firebase.initializeApp(firebaseConfig, "staffPatientRegistration");
        if (APP_CHECK_SITE_KEY && typeof app.appCheck === "function") {
            app.appCheck().activate(new firebase.appCheck.ReCaptchaEnterpriseProvider(APP_CHECK_SITE_KEY), true);
        }
    }
    return { auth: app.auth(), db: app.firestore() };
}

/** An error with a code the dialog turns into a sentence. */
function accountError(code, message) {
    const err = new Error(message || code);
    err.code = code;
    return err;
}

/**
 * Copy a record onto a new online account, and link its history.
 *
 * @param {object} opts
 *   recordId           the record being moved (patients/{recordId})
 *   loginAddress       the email, or the address built from the mobile number
 *   password           the patient's own, or a temporary one (Task 18)
 *   email              the email to keep on the record ("" if none)
 *   phone              the mobile number as typed
 *   signInPhone        639XXXXXXXXX when the account signs in with its number
 *   mustChangePassword true for a temporary password (Task 18)
 *   privacyAccepted    the patient's Privacy Policy agreement, ticked in the
 *                      dialog (R22); without it the record's own is kept
 * @return {Promise<{uid: string, moved: number}>}
 */
function copyRecordToAccount(opts) {
    const recordRef = db.collection("patients").doc(opts.recordId);
    let services;
    try { services = secondAccountServices(); } catch (err) { return Promise.reject(err); }

    let user = null;
    let record = null;
    const now = new Date().toISOString();

    return recordRef.get()
        .then(snap => {
            if (!snap.exists) throw accountError("record-missing", "That record no longer exists.");
            record = snap.data();
            if (record.mergedInto) throw accountError("already-moved", "This record already has an online account.");
            // The account's own id plus every id it came from: at most ten,
            // the most a Firestore "in" query takes.
            if (patientRecordIds(opts.recordId, record).length + 1 > MAX_RECORD_IDS) {
                throw accountError("too-many-ids", "This record has been moved too many times to link again.");
            }
            return services.auth.setPersistence(firebase.auth.Auth.Persistence.NONE);
        })
        .then(() => services.auth.createUserWithEmailAndPassword(opts.loginAddress, opts.password))
        .then(cred => {
            user = cred.user;
            return services.db.collection("users").doc(user.uid).set({
                email: opts.loginAddress,
                role: "patient",
                name: ((record.firstName || "") + " " + (record.lastName || "")).trim()
            });
        })
        // The bookings for this record. Read here; each is read again inside
        // the transaction, so one cancelled meanwhile is not moved.
        .then(() => db.collection("appointments").where("patientId", "==", opts.recordId).get())
        .then(apptSnap => {
            const today = localDateKey();
            const candidates = [];
            apptSnap.forEach(d => {
                const a = d.data() || {};
                if (MOVED_BOOKING_STATUSES.indexOf(a.status) !== -1 && String(a.appointmentDate || "") >= today) {
                    candidates.push(d.id);
                }
            });
            const uid = user.uid;
            const accountRef = db.collection("patients").doc(uid);
            const apptRefs = candidates.map(id => db.collection("appointments").doc(id));

            return db.runTransaction(tx => {
                const reads = [tx.get(recordRef)].concat(apptRefs.map(ref => tx.get(ref)));
                return Promise.all(reads).then(([liveSnap, ...apptSnaps]) => {
                    if (!liveSnap.exists) throw accountError("record-missing", "That record no longer exists.");
                    const live = liveSnap.data();
                    if (live.mergedInto) throw accountError("already-moved", "This record already has an online account.");

                    const copy = {};
                    Object.keys(live).forEach(k => { if (RECORD_COPY_DROP.indexOf(k) === -1) copy[k] = live[k]; });
                    Object.assign(copy, {
                        email: opts.email || "",
                        phoneNumber: opts.phone || live.phoneNumber || "",
                        teethStatus: live.teethStatus || {},
                        mergedFromId: opts.recordId,
                        mergedFrom: patientRecordIds(opts.recordId, live),
                        accountCreatedAt: now,
                        accountCreatedBy: currentUserId || ""
                    });
                    if (opts.signInPhone) copy.signInPhone = opts.signInPhone;
                    if (opts.mustChangePassword) copy.mustChangePassword = true;
                    if (opts.privacyAccepted) copy.privacyAccepted = opts.privacyAccepted;

                    tx.set(accountRef, copy);
                    tx.update(recordRef, { mergedInto: uid, mergedAt: now, mergedBy: currentUserId || "" });
                    let moved = 0;
                    apptSnaps.forEach((s, i) => {
                        const a = s.exists ? s.data() : null;
                        if (!a || a.patientId !== opts.recordId) return;
                        if (MOVED_BOOKING_STATUSES.indexOf(a.status) === -1 || String(a.appointmentDate || "") < today) return;
                        tx.update(apptRefs[i], { patientId: uid });
                        moved++;
                    });
                    return moved;
                });
            });
        })
        .then(moved => {
            const uid = user.uid;
            // The number the account was made with is on a record now (2026-10-05).
            if (typeof notePhoneOnFile === "function") notePhoneOnFile(opts.phone);
            // An email login is sent Firebase's confirmation link, as at the
            // desk before: seen in person, so never held back by it.
            const sending = opts.signInPhone || typeof user.sendEmailVerification !== "function"
                ? Promise.resolve()
                : user.sendEmailVerification().catch(err => console.warn("Could not send the confirmation email:", err));
            return sending
                .then(() => services.auth.signOut().catch(err => console.warn("Second sign-out failed:", err)))
                .then(() => ({ uid: uid, moved: moved }));
        })
        .catch(err => {
            if (!user) throw err;
            // The login exists but its record does not: remove the login, so
            // the patient is not left with a sign-in to nothing.
            return user.delete()
                .catch(delErr => console.error("Could not remove the half-made login:", delErr))
                .then(() => services.auth.signOut().catch(() => {}))
                .then(() => { throw err; });
        });
}

/** The sentence for a failed account creation. Nothing was changed in every case. */
function describeAccountFailure(err, byMobile) {
    const code = (err && err.code) || "";
    if (code === "auth/email-already-in-use") {
        return byMobile
            ? "That mobile number already has a DentCare account. Nothing was changed."
            : "That email already has a DentCare account. Use another, or leave the email blank to sign in with the mobile number. Nothing was changed.";
    }
    if (code === "auth/invalid-email") return "That email address is not valid. Nothing was changed.";
    if (code === "auth/weak-password") return "That password is too weak. Nothing was changed.";
    if (code === "already-moved") return "This record already has an online account.";
    if (code === "too-many-ids") return "This record has been linked too many times to link again. Nothing was changed.";
    if (code === "record-missing") return "That record no longer exists.";
    if (code === "permission-denied") return "This account is not allowed to create online accounts. Nothing was changed.";
    return "The account was not created, and nothing was changed. Check the connection and try again.";
}

/** "Create online account" on Patient History, for a record the front desk made. */
function openCreateAccount() {
    if (!historyRecord || !canCreateOnlineAccount()) return;
    const p = historyRecord.patient || {};
    if (p.recordOnly !== true || p.mergedInto) return;

    const name = ((p.firstName || "") + " " + (p.lastName || "")).trim() || "this patient";
    const who = document.getElementById("create-account-who");
    if (who) who.textContent = "For " + name + ". Their record, visits and bills stay as they are.";
    const phone = document.getElementById("create-account-phone");
    if (phone) phone.value = (typeof normaliseMobile === "function" && normaliseMobile(p.phoneNumber || "")) ? p.phoneNumber : "";
    const email = document.getElementById("create-account-email");
    if (email) email.value = p.email || "";
    ["create-account-password", "create-account-password2"].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.value = ""; if (typeof hidePasswordAgain === "function") hidePasswordAgain(id); }
    });
    ["create-account-phone", "create-account-email", "create-account-password", "create-account-password2"].forEach(id => {
        const el = document.getElementById(id);
        if (el && typeof markFieldStatus === "function") markFieldStatus(el, true);
    });
    const consent = document.getElementById("create-account-consent");
    if (consent) consent.classList.toggle("hidden", p.consentPending !== true);
    if (typeof resetPrivacyBox === "function") resetPrivacyBox("create-account-privacy");
    const status = document.getElementById("create-account-status");
    if (status) status.textContent = "";
    const save = document.getElementById("create-account-save");
    if (save) save.disabled = false;
    openModal("modal-create-account");
}

/** From the dialog's consent note: collect it now, then come back. */
function collectConsentBeforeAccount() {
    closeModal("modal-create-account");
    if (typeof openCollectConsent === "function") openCollectConsent();
}

let createAccountInFlight = false;

function submitCreateAccount(e) {
    if (e) e.preventDefault();
    if (!historyRecord || !canCreateOnlineAccount() || createAccountInFlight) return Promise.resolve();
    const recordId = historyRecord.patientId;
    const p = historyRecord.patient || {};

    const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
    const el = id => document.getElementById(id);
    const phone = val("create-account-phone");
    const email = val("create-account-email");
    const password = el("create-account-password") ? el("create-account-password").value : "";
    const again = el("create-account-password2") ? el("create-account-password2").value : "";

    let firstBad = null;
    const bad = (id, message) => { markFieldStatus(el(id), false, message); firstBad = firstBad || el(id); };
    const mobile = normaliseMobile(phone);
    if (!mobile) bad("create-account-phone", "A mobile number, 11 digits, like 0917 555 0101.");
    else markFieldStatus(el("create-account-phone"), true);
    if (email) {
        const verdict = checkEmailAddress(email);
        if (!verdict.ok) bad("create-account-email", verdict.reason);
        else markFieldStatus(el("create-account-email"), true);
    } else {
        markFieldStatus(el("create-account-email"), true);
    }
    if (!evaluatePasswordStrength(password).isStrong) {
        bad("create-account-password", "Use upper and lower case letters, a number and a symbol.");
    } else {
        markFieldStatus(el("create-account-password"), true);
    }
    if (!again || again !== password) bad("create-account-password2", "The two passwords are not the same.");
    else markFieldStatus(el("create-account-password2"), true);
    // Ticked by the patient on the tablet (2026-10-03, R22).
    if (typeof requirePrivacyBox === "function" && !requirePrivacyBox("create-account-privacy")) {
        firstBad = firstBad || el("create-account-privacy");
    }
    if (firstBad) {
        showToast("Please fix the boxes marked in red.", "warning");
        if (typeof firstBad.focus === "function") firstBad.focus();
        return Promise.resolve();
    }

    // Task 15's rule: the email is the login when given, otherwise the number.
    const signInPhone = email ? "" : mobile;
    const loginAddress = email || (mobile + "@" + PHONE_SIGN_IN_DOMAIN);
    const status = el("create-account-status");
    const save = el("create-account-save");
    createAccountInFlight = true;
    if (save) save.disabled = true;
    if (status) status.textContent = "Creating the account…";

    const privacyAccepted = typeof privacyBoxState === "function" && privacyBoxState("create-account-privacy") === "ticked"
        ? privacyAgreementFor("in person", currentUserId || "") : null;
    return copyRecordToAccount({ recordId: recordId, loginAddress: loginAddress, password: password,
                                  email: email, phone: phone, signInPhone: signInPhone,
                                  privacyAccepted: privacyAccepted })
        .then(result => {
            if (el("create-account-password")) el("create-account-password").value = "";
            if (el("create-account-password2")) el("create-account-password2").value = "";
            closeModal("modal-create-account");
            refreshReference("patients");
            const name = ((p.firstName || "") + " " + (p.lastName || "")).trim() || "The patient";
            showToast("Online account created. " + name + " signs in with " +
                      (email ? "their email, " + email : "their mobile number, " + phone) + "." +
                      (result.moved ? " " + result.moved + " upcoming booking" + (result.moved === 1 ? " was" : "s were") + " moved to it." : ""),
                      "success");
            if (typeof selectPatientForHistory === "function") selectPatientForHistory({ patient_id: result.uid });
        })
        .catch(err => {
            console.error("Could not create the online account:", err);
            const message = describeAccountFailure(err, !email);
            if (status) status.textContent = message;
            showToast(message, "error");
        })
        .finally(() => {
            createAccountInFlight = false;
            if (save) save.disabled = false;
        });
}

// ── Reset login, with a temporary password (2026-10-02, R18) ──────────────
//
// Free: no SMS, no OTP, no server. Nobody can set or see a patient's password
// from a browser; only the Firebase console can DELETE a login. So the clinic
// deletes the old login there, and this makes a new one for the same record
// with a temporary password, through the copy-and-link above. The patient
// chooses their own password at the next sign-in (mustChangePassword,
// js/first-signin.js).
//
// The temporary password is shown once and printed if wanted. It is never
// written to the database, to storage or to the console log, and a fresh one
// is made for every reset: there is no shared default password.

/** No look-alikes: no 0/O/o, 1/l/I. */
const TEMP_PASSWORD_SETS = [
    "ABCDEFGHJKLMNPQRSTUVWXYZ",
    "abcdefghijkmnpqrstuvwxyz",
    "23456789",
    "#$%&*+=?@"
];
const TEMP_PASSWORD_LENGTH = 12;

/** A random index below n, from the browser's cryptographic generator. */
function randomBelow(n) {
    const buf = new Uint32Array(1);
    // Rejection sampling keeps every character equally likely.
    const limit = Math.floor(0x100000000 / n) * n;
    do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
    return buf[0] % n;
}

/** Twelve characters: at least one of each set, the rest from all of them, shuffled. */
function generateTempPassword() {
    const all = TEMP_PASSWORD_SETS.join("");
    const chars = TEMP_PASSWORD_SETS.map(set => set[randomBelow(set.length)]);
    while (chars.length < TEMP_PASSWORD_LENGTH) chars.push(all[randomBelow(all.length)]);
    for (let i = chars.length - 1; i > 0; i--) {
        const j = randomBelow(i + 1);
        const t = chars[i]; chars[i] = chars[j]; chars[j] = t;
    }
    return chars.join("");
}

/** The dialog's state: which record, its sign-in, and (only after success) the slip details. */
let resetLogin = null;
let resetLoginInFlight = false;

/** An account's sign-in, as people say it: the mobile number, or the email. */
function resetLoginShown(address, patient) {
    if (typeof isPhoneSignIn === "function" && isPhoneSignIn(address)) {
        return typeof phoneFromSignIn === "function" ? phoneFromSignIn(address) : (patient.phoneNumber || address);
    }
    return address;
}

/** "Reset login" on Patient History, for a patient with an online account. */
function openResetLogin() {
    if (!historyRecord || !canCreateOnlineAccount()) return Promise.resolve();
    const p = historyRecord.patient || {};
    if (p.recordOnly === true || p.mergedInto) return Promise.resolve();
    const recordId = historyRecord.patientId;

    resetLogin = { recordId: recordId, patient: p, address: "" };
    const el = id => document.getElementById(id);
    const name = ((p.firstName || "") + " " + (p.lastName || "")).trim() || "this patient";
    if (el("reset-login-who")) el("reset-login-who").textContent = "For " + name + ". Their record, visits and bills stay as they are.";
    if (el("reset-login-step1")) el("reset-login-step1").classList.remove("hidden");
    if (el("reset-login-done")) el("reset-login-done").classList.add("hidden");
    if (el("reset-login-temp")) el("reset-login-temp").textContent = "";
    if (el("reset-login-deleted")) el("reset-login-deleted").checked = false;
    if (el("reset-login-status")) el("reset-login-status").textContent = "";
    ["reset-login-cancel", "reset-login-create"].forEach(id => { if (el(id)) el(id).classList.remove("hidden"); });
    ["reset-login-print", "reset-login-close"].forEach(id => { if (el(id)) el(id).classList.add("hidden"); });
    if (el("reset-login-create")) el("reset-login-create").disabled = true;
    if (el("reset-login-address")) el("reset-login-address").textContent = "…";
    openModal("modal-reset-login");

    // The login's own address is on its users document (the clinic may read
    // it); the record's fields are the fallback for an older account.
    const fallback = p.signInPhone ? p.signInPhone + "@" + PHONE_SIGN_IN_DOMAIN : (p.email || "");
    return db.collection("users").doc(recordId).get()
        .then(snap => (snap.exists && snap.data().email) || fallback)
        .catch(() => fallback)
        .then(address => {
            if (!resetLogin || resetLogin.recordId !== recordId) return;
            resetLogin.address = address;
            if (el("reset-login-address")) el("reset-login-address").textContent = address || "(no sign-in found)";
            onResetDeletedToggle();
        });
}

/** The new login can be made only once the old one is said to be gone. */
function onResetDeletedToggle() {
    const box = document.getElementById("reset-login-deleted");
    const btn = document.getElementById("reset-login-create");
    if (btn) btn.disabled = !(box && box.checked) || !resetLogin || !resetLogin.address || resetLoginInFlight;
}

function submitResetLogin() {
    const box = document.getElementById("reset-login-deleted");
    if (!resetLogin || !resetLogin.address || !(box && box.checked) || resetLoginInFlight || !canCreateOnlineAccount()) {
        return Promise.resolve();
    }
    const state = resetLogin;
    const p = state.patient;
    const address = state.address;
    const byPhone = typeof isPhoneSignIn === "function" && isPhoneSignIn(address);
    const signInPhone = byPhone ? address.split("@")[0] : "";
    const temp = generateTempPassword();
    const status = document.getElementById("reset-login-status");
    const btn = document.getElementById("reset-login-create");

    resetLoginInFlight = true;
    if (btn) btn.disabled = true;
    if (status) status.textContent = "Making the new login…";

    return copyRecordToAccount({
        recordId: state.recordId, loginAddress: address, password: temp,
        email: byPhone ? "" : (p.email || address), phone: p.phoneNumber || "",
        signInPhone: signInPhone, mustChangePassword: true
    })
    .then(result => {
        if (resetLogin !== state) return;
        state.newId = result.uid;
        state.signIn = resetLoginShown(address, p);
        state.name = ((p.firstName || "") + " " + (p.lastName || "")).trim();
        const el = id => document.getElementById(id);
        el("reset-login-step1").classList.add("hidden");
        el("reset-login-done").classList.remove("hidden");
        el("reset-login-signin").textContent = state.signIn;
        // Shown here once. Not kept in `state`: Print slip reads it off the screen.
        el("reset-login-temp").textContent = temp;
        ["reset-login-cancel", "reset-login-create"].forEach(id => el(id).classList.add("hidden"));
        ["reset-login-print", "reset-login-close"].forEach(id => el(id).classList.remove("hidden"));
        refreshReference("patients");
        showToast("New login made. Give the patient the temporary password.", "success");
    })
    .catch(err => {
        console.error("Reset login failed:", err && err.code);
        const message = err && err.code === "auth/email-already-in-use"
            ? "The old login is still there. Delete it in the Firebase console first, then try again."
            : describeAccountFailure(err, byPhone);
        if (status) status.textContent = message;
        showToast(message, "error");
    })
    .finally(() => {
        resetLoginInFlight = false;
        onResetDeletedToggle();
    });
}

/** The slip for the patient: the half sheet, through printClinicSheet() (js/print.js). */
function printResetSlip() {
    const temp = (document.getElementById("reset-login-temp") || {}).textContent || "";
    if (!resetLogin || !resetLogin.newId || !temp || typeof printClinicSheet !== "function") return;
    const e = typeof escapeHtml === "function" ? escapeHtml : String;
    printClinicSheet({
        title: "Your DentCare sign-in",
        css: ".slip h1{font-size:15pt;margin:0 0 4mm}.slip p{margin:0 0 3mm;font-size:11pt}" +
             ".slip .temp{font:bold 16pt monospace;letter-spacing:1px;margin:2mm 0 5mm}",
        bodyHtml: '<div class="slip"><h1>Dr. Reina G. Gapit Dental Clinic</h1>' +
            '<p>' + e(resetLogin.name || "") + '</p>' +
            '<p>Sign in at dentcare.site with: <strong>' + e(resetLogin.signIn || "") + '</strong></p>' +
            '<p>Temporary password:</p><p class="temp">' + e(temp) + '</p>' +
            '<p>The first time you sign in, you will be asked to choose your own password.</p>' +
            '<p>Questions? Call the clinic on 0923-618-3285.</p></div>'
    });
}

/** Close the dialog and wipe the temporary password from the page, the slip included. */
function closeResetLogin() {
    const temp = document.getElementById("reset-login-temp");
    if (temp) temp.textContent = "";
    const frame = document.getElementById("clinic-print-frame");
    if (frame && frame.contentWindow) {
        // The printed slip stays in the hidden print frame until the next
        // print otherwise; empty it after the print dialog has had it.
        setTimeout(() => {
            try { const d = frame.contentWindow.document; d.open(); d.write(""); d.close(); } catch (err) { /* cross-origin never */ }
        }, 1000);
    }
    const reopen = resetLogin && resetLogin.newId;
    resetLogin = null;
    closeModal("modal-reset-login");
    if (reopen && typeof selectPatientForHistory === "function") selectPatientForHistory({ patient_id: reopen });
}

// Only the reschedule dialog traps focus. Staff registration is a regular tab.
document.addEventListener("keydown", event => {
    const modal = document.querySelector("#modal-reschedule.active");
    if (!modal) return;
    if (event.key === "Escape") {
        event.preventDefault();
        closeRescheduleForm();
    } else if (event.key === "Tab") {
        const fields = Array.from(modal.querySelectorAll('button, input, select, textarea, a[href], [tabindex="0"]'))
            .filter(el => !el.disabled && el.offsetParent !== null && el.tabIndex >= 0);
        const first = fields[0], last = fields[fields.length - 1];
        if (!first) return;
        if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
            event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) {
            event.preventDefault(); first.focus();
        }
    }
});
