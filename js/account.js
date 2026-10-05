// ============================================================================
// DentCare — Account settings
// ----------------------------------------------------------------------------
// Each person changes their OWN sign-in email and password here. Nothing on
// this screen touches anybody else's account, because a browser cannot: Firebase
// only ever lets the signed-in user change their own credentials. Changing
// somebody else's is the Firebase console's job (Authentication → Users), and
// the screen says so rather than pretending otherwise.
//
// ── WHY THE EMAIL CHANGE IS A TWO-STEP ─────────────────────────────────────
//
// verifyBeforeUpdateEmail() sends a link to the NEW address and only swaps the
// email once that link is opened. A typo therefore changes nothing, instead of
// moving the login to an address nobody can reach — which, for the clinic's own
// dentist account, would mean losing the account that signs every clinical
// record. updateEmail() is the fallback for an SDK too old to have it.
//
// ── WHY THE PASSWORD IS ASKED FOR ──────────────────────────────────────────
//
// Firebase refuses a credential change on a session that has been open a while
// ("auth/requires-recent-login"). Rather than sign the clinic out mid-task and
// hope they come back, the form asks for the current password and re-signs in
// silently first. It is also the check that stops someone changing the login on
// an unattended computer.
// ============================================================================

/**
 * A patient's name and recovery contact exactly as this screen loaded them.
 *
 * What saveChangedFields() (js/app.js) compares against, so a save writes only
 * the boxes the patient changed and refuses to overwrite a change made on
 * another device in the meantime — the patient's phone app, or a second tab.
 * null until the record has loaded.
 */
let acctPatientOnOpen = null;

/** Plain-English names for the roles, for the "This account" card. */
const ACCOUNT_ROLE_LABEL = {
    dentist: "Dentist (clinic owner)",
    doctor: "Dentist (clinic owner)",
    admin: "Administrator",
    staff: "Clinic staff",
    patient: "Patient"
};

// ── How often a patient may rename themselves (2026-09-27) ─────────────────
//
// Asked for by the team after testing, on the Facebook model: a patient can
// correct their name, then has to wait before doing it again. A name is on a
// clinical record, on receipts and on the clinic's paper card, so it should
// not be something a patient can flip back and forth.
//
// Counted from nameEditedByPatientAt, the stamp the rename already writes. A
// name set at registration does not start the clock. The clinic's own
// "Correct name" on Patient History is not limited and does not start it
// either: that is how a typo made in the last 180 days gets fixed.
//
// Enforced by this screen, not by firestore.rules (decided with the owner for
// the 2026-09-28 handoff): the rules are shared with the mobile app, and a
// rule would refuse its profile edits until it is updated too. The clinic
// still sees every patient rename on Patient History whichever app made it.
const NAME_CHANGE_COOLDOWN_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether the patient must still wait, and how long.
 *
 * @param  {string} stampIso  nameEditedByPatientAt, or empty
 * @param  {number} [nowMs]   for the checks; defaults to now
 * @return {{locked: boolean, daysLeft: number, until: Date|null}}
 */
function nameChangeLock(stampIso, nowMs) {
    const at = stampIso ? Date.parse(stampIso) : NaN;
    if (isNaN(at)) return { locked: false, daysLeft: 0, until: null };
    const until = new Date(at + NAME_CHANGE_COOLDOWN_DAYS * DAY_MS);
    const left = until.getTime() - (nowMs == null ? Date.now() : nowMs);
    if (left <= 0) return { locked: false, daysLeft: 0, until: until };
    // Rounded UP: with 3 hours to go it is still "1 day", never "0 days".
    return { locked: true, daysLeft: Math.ceil(left / DAY_MS), until: until };
}

/** "March 26, 2027" — the day the name can be changed again. */
function nameLockDate(d) {
    return d ? d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "";
}

/** The sentence shown on the locked form and in the toast. */
function nameLockMessage(lock) {
    return "You changed your name recently. You can change it again in " +
        lock.daysLeft + (lock.daysLeft === 1 ? " day" : " days") +
        " (on " + nameLockDate(lock.until) + "). If it is spelled wrong, " +
        "ask the clinic to correct it for you.";
}

/**
 * Lock or unlock the patient's name boxes, with the countdown in red above
 * the Save button. Called when the tab opens and straight after a rename.
 */
function renderNameLock() {
    const lock = nameChangeLock(acctPatientOnOpen && acctPatientOnOpen.nameEditedByPatientAt);
    // Save is left pressable on purpose: pressing it on a locked form gives the
    // red toast with the days left (submitAccountName), rather than nothing.
    ["patient-acct-first", "patient-acct-middle", "patient-acct-last"]
        .forEach(id => {
            const el = document.getElementById(id);
            if (el) el.disabled = lock.locked;
        });
    const note = document.getElementById("patient-acct-name-lock");
    if (note) {
        note.textContent = lock.locked ? nameLockMessage(lock) : "";
        note.hidden = !lock.locked;
    }
    return lock;
}

function acctEl(prefix, name) {
    return document.getElementById(prefix + "-acct-" + name);
}

function setAcctStatus(prefix, which, msg, kind) {
    const el = acctEl(prefix, which + "-status");
    if (!el) return;
    el.textContent = msg || "";
    el.className = "acct-status" + (kind ? " acct-status--" + kind : "");
}

/**
 * Fill the "This account" card. Called when the tab opens, so it always shows
 * the email Firebase actually has rather than one cached at sign-in.
 */
function loadAccountSettings(prefix) {
    const user = (typeof auth !== "undefined" && auth.currentUser) || null;

    const nameEl = acctEl(prefix, "name");
    if (nameEl) nameEl.textContent = currentUser || (user && user.displayName) || "—";

    const roleEl = acctEl(prefix, "role");
    if (roleEl) roleEl.textContent = ACCOUNT_ROLE_LABEL[currentRole] || currentRole || "—";

    // An account that signs in with its mobile number (2026-10-01) is shown
    // its number, never the address built from it, and has no email to change.
    const signInEmail = (user && user.email) || currentEmail || "";
    const byPhone = typeof isPhoneSignIn === "function" && isPhoneSignIn(signInEmail);
    const emailEl = acctEl(prefix, "email");
    if (emailEl) {
        emailEl.textContent = byPhone
            ? "You sign in with your mobile number " + phoneFromSignIn(signInEmail)
            : (signInEmail || "—");
    }
    const emailLabel = acctEl(prefix, "email-label");
    if (emailLabel) emailLabel.textContent = byPhone ? "Signs in with" : "Sign-in email";
    const emailSection = acctEl(prefix, "email-section");
    if (emailSection) emailSection.hidden = byPhone;

    ["email", "pass", "recovery"].forEach(which => setAcctStatus(prefix, which, ""));

    // The name boxes, and for a patient the recovery contact, read from the
    // record itself rather than from whatever was cached at sign-in.
    if (prefix === "patient" && currentUserId) {
        db.collection("patients").doc(currentUserId).get()
        .then(doc => {
            if (!doc.exists) return;
            const p = doc.data();
            acctPatientOnOpen = {
                firstName: p.firstName, middleName: p.middleName, lastName: p.lastName,
                recoveryEmail: p.recoveryEmail, recoveryPhone: p.recoveryPhone,
                nameEditedByPatientAt: p.nameEditedByPatientAt || ""
            };
            const first = document.getElementById("patient-acct-first");
            const middle = document.getElementById("patient-acct-middle");
            const last = document.getElementById("patient-acct-last");
            if (first) first.value = p.firstName || "";
            if (middle) middle.value = p.middleName || "";
            if (last) last.value = p.lastName || "";
            const mail = document.getElementById("patient-acct-recovery-email");
            const phone = document.getElementById("patient-acct-recovery-phone");
            if (mail) mail.value = p.recoveryEmail || "";
            if (phone) phone.value = p.recoveryPhone || "";
            renderNameLock();
        })
        .catch(err => console.warn("Could not read the patient record:", err));
    } else if (currentUserId) {
        // Auth stores only displayName. It is unsafe to infer which words in a
        // legacy full name belong to which field, so require explicit parts.
        ["first", "middle", "last"].forEach(part => {
            const field = acctEl(prefix, part);
            if (field) field.value = "";
        });
    }
}

/**
 * Save the name this account is known by.
 *
 * Added 2026-09-16: the clinic was going to delete its test accounts purely
 * because "Jane Doe" could not be renamed. Where the name lives depends on who
 * it belongs to:
 *
 *   A PATIENT owns firstName and lastName on their own patient record, which
 *   the rules already let them write (their record card and every screen read
 *   from there).
 *
 *   STAFF AND THE DENTIST have a name on the Firebase account itself
 *   (displayName). That is deliberate: their users document is the one thing
 *   every role check trusts, so nothing lets an account write to its own (see
 *   firestore.rules). displayName needs no rule, cannot carry a role, and
 *   js/app.js prefers it over the users document when it is set. The owner's
 *   copy in users.name is updated as well where the rules allow it, so the
 *   clinic's own lists stay right.
 */
function submitAccountName(e, prefix) {
    e.preventDefault();

    const btn = acctEl(prefix, "profile-btn");
    if (!currentUserId) {
        setAcctStatus(prefix, "profile", "You are signed out. Sign in again.", "error");
        return;
    }
    if (btn && btn.disabled) return;

    let write;
    let shownName;

    if (prefix === "patient") {
        const first = tidyPersonName(document.getElementById("patient-acct-first").value);
        const middleEl = document.getElementById("patient-acct-middle");
        const middle = tidyPersonName(middleEl ? middleEl.value : "");
        const last = tidyPersonName(document.getElementById("patient-acct-last").value);

        // A name that is really a name. Account Settings exists so a typo at
        // registration can be corrected; it is not a way to become somebody
        // else, or "asdasd". checkPersonName() lives in js/app.js and the
        // registration form runs the same one.
        const checks = [checkPersonNameAt(prefix + "-acct-first", first, "First name"),
                        checkPersonNameAt(prefix + "-acct-last", last, "Last name")];
        if (middle) checks.push(checkPersonNameAt(prefix + "-acct-middle", middle, "Middle name"));
        const bad = checks.filter(c => !c.ok)[0];
        if (bad) {
            setAcctStatus(prefix, "profile", bad.reason, "error");
            return;
        }

        shownName = first + " " + last;
        const names = { firstName: first, middleName: middle, lastName: last };

        // The 180-day limit. Checked here as well as by the disabled boxes,
        // so a form left open across the limit still says why.
        const lock = nameChangeLock(acctPatientOnOpen && acctPatientOnOpen.nameEditedByPatientAt);
        if (lock.locked) {
            renderNameLock();
            setAcctStatus(prefix, "profile", nameLockMessage(lock), "error");
            showToast("You cannot change your name yet: " + lock.daysLeft +
                      (lock.daysLeft === 1 ? " day" : " days") + " left.", "error");
            return;
        }
        const unchanged = acctPatientOnOpen &&
            ["firstName", "middleName", "lastName"].every(k => (acctPatientOnOpen[k] || "") === names[k]);
        if (unchanged) {
            setAcctStatus(prefix, "profile", "Nothing to save: that is already your name.", "warn");
            return;
        }

        const nextUntil = nameLockDate(new Date(Date.now() + NAME_CHANGE_COOLDOWN_DAYS * DAY_MS));
        const stamp = new Date().toISOString();
        write = confirmDialog(
            "Your name will be: " + [first, middle, last].filter(Boolean).join(" ") + "\n\n" +
            "After this change you cannot change your name again for " + NAME_CHANGE_COOLDOWN_DAYS +
            " days (until " + nextUntil + "). Please check the spelling first.",
            { title: "Change your name?", confirmLabel: "Change name", cancelLabel: "Go back" }
        ).then(yes => {
            if (!yes) {
                const cancelled = new Error("cancelled");
                cancelled.code = "name-change-cancelled";
                throw cancelled;
            }
            setAcctStatus(prefix, "profile", "Saving…");
            return saveChangedFields(
            db.collection("patients").doc(currentUserId),
            acctPatientOnOpen && {
                firstName: acctPatientOnOpen.firstName,
                middleName: acctPatientOnOpen.middleName,
                lastName: acctPatientOnOpen.lastName
            },
            names,
            // Stamped so the clinic sees it on Patient History. A rule can only
            // check the SHAPE of a name; a person reading "the patient renamed
            // themselves last Tuesday" is the check that catches the rest.
            // Written only when a name part actually changed.
            { nameEditedByPatientAt: stamp }
            );
        }).then(result => {
            // The saved values are now what this screen shows, so a second
            // save from it is compared against these, not the old ones. The
            // new stamp starts the 180 days on screen straight away.
            if (acctPatientOnOpen) {
                Object.assign(acctPatientOnOpen, names, { nameEditedByPatientAt: stamp });
            }
            renderNameLock();
            syncConversationName(currentUserId, shownName);
            return result;
        });
    } else {
        const first = tidyPersonName(acctEl(prefix, "first").value);
        const middle = tidyPersonName(acctEl(prefix, "middle").value);
        const last = tidyPersonName(acctEl(prefix, "last").value);
        const checks = [checkPersonNameAt(prefix + "-acct-first", first, "First name"),
                        checkPersonNameAt(prefix + "-acct-last", last, "Last name")];
        if (middle) checks.push(checkPersonNameAt(prefix + "-acct-middle", middle, "Middle name"));
        const bad = checks.find(check => !check.ok);
        if (bad) {
            setAcctStatus(prefix, "profile", bad.reason, "error");
            return;
        }
        // Keep the same Auth displayName and optional users.name copy; no new
        // role-document fields or Firestore permissions are introduced.
        shownName = [first, middle, last].filter(Boolean).join(" ");
        const user = (typeof auth !== "undefined" && auth.currentUser) || null;
        if (!user) {
            setAcctStatus(prefix, "profile", "You are signed out. Sign in again.", "error");
            return;
        }
        write = user.updateProfile({ displayName: shownName })
            // The clinic owner may also keep the copy on the users document in
            // step; for the front desk the rules refuse it, which is fine — the
            // name above is the one every screen shows.
            .then(() => db.collection("users").doc(currentUserId)
                           .update({ name: shownName }).catch(() => {}));
    }

    if (btn) btn.disabled = true;
    // A patient is asked to confirm first; "Saving…" waits for their yes.
    setAcctStatus(prefix, "profile", prefix === "patient" ? "" : "Saving…");

    write.then(() => {
        currentUser = shownName;
        const nameEl = acctEl(prefix, "name");
        if (nameEl) nameEl.textContent = shownName;
        // The sidebar greets by name, so it would otherwise still say the old one.
        const greeting = document.getElementById(prefix + "-name-display");
        if (greeting) greeting.textContent = shownName;
        if (typeof refreshReference === "function") {
            refreshReference(prefix === "patient" ? "patients" : "users");
        }
        setAcctStatus(prefix, "profile", "Saved.", "ok");
        showToast("Name updated.", "success");
    })
    .catch(err => {
        if (err && err.code === "name-change-cancelled") {
            setAcctStatus(prefix, "profile", "Not changed.", "");
            return;
        }
        if (err && err.code === RECORD_CHANGED) {
            setAcctStatus(prefix, "profile", recordChangedMessage(err, {
                firstName: "your first name", middleName: "your middle name",
                lastName: "your last name"
            }), "error");
            loadAccountSettings(prefix);
            return;
        }
        console.error("Could not save the name:", err);
        setAcctStatus(prefix, "profile",
            err && err.code === "permission-denied"
                ? "The clinic's security rules have not been published yet, so this cannot be saved today."
                : accountErrorMessage(err), "error");
    })
    .finally(() => {
        if (btn) btn.disabled = false;
        // A patient who just renamed is locked again for 180 days.
        if (prefix === "patient") renderNameLock();
    });
}

/**
 * Prove it is really this person, by signing in again in the background.
 * Returns a promise that rejects with the Firebase error if the password is wrong.
 */
function reauthenticate(password) {
    const user = auth.currentUser;
    if (!user) return Promise.reject(new Error("Nobody is signed in."));
    const credential = firebase.auth.EmailAuthProvider.credential(user.email, password);
    return user.reauthenticateWithCredential(credential);
}

/** Firebase's codes, in words the clinic can act on. */
function accountErrorMessage(err) {
    const code = (err && err.code) || "";
    if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        return "That password is not right. Try again.";
    }
    if (code === "auth/too-many-requests") {
        return "Too many tries. Wait a few minutes and try again.";
    }
    if (code === "auth/email-already-in-use") {
        return "Another account already uses that email.";
    }
    if (code === "auth/invalid-email") {
        return "That does not look like an email address.";
    }
    if (code === "auth/weak-password") {
        return "That password is too easy to guess. Use at least 8 characters, with a capital letter and a number.";
    }
    if (code === "auth/requires-recent-login") {
        return "For safety, sign out and back in, then try again.";
    }
    if (code === "auth/network-request-failed") {
        return "No internet connection. Nothing was changed.";
    }
    return "Could not do that. Nothing was changed.";
}

/**
 * Change this account's sign-in email.
 *
 * The clinic's own use for it: the test logins it launched with become the
 * real addresses without deleting the accounts, which keeps every record those
 * accounts have already signed. (This file is public on the live site, so the
 * test addresses themselves are deliberately not written here.)
 */
function submitAccountEmail(e, prefix) {
    e.preventDefault();

    const newEmail = (acctEl(prefix, "new-email").value || "").trim();
    const password = acctEl(prefix, "email-pass").value || "";
    const btn = acctEl(prefix, "email-btn");

    const user = (typeof auth !== "undefined" && auth.currentUser) || null;
    if (!user) {
        setAcctStatus(prefix, "email", "You are signed out. Sign in again.", "error");
        return;
    }
    if (newEmail.toLowerCase() === String(user.email || "").toLowerCase()) {
        setAcctStatus(prefix, "email", "That is already the sign-in email.", "warn");
        return;
    }
    if (btn && btn.disabled) return;
    if (btn) btn.disabled = true;
    setAcctStatus(prefix, "email", "Checking your password…");

    reauthenticate(password)
    .then(() => {
        setAcctStatus(prefix, "email", "Sending the confirmation link…");
        // The new address has to confirm before the change happens, so a typo
        // cannot lock anyone out of the account.
        return typeof user.verifyBeforeUpdateEmail === "function"
            ? user.verifyBeforeUpdateEmail(newEmail)
            : user.updateEmail(newEmail);
    })
    .then(() => {
        // The role document carries a copy of the email for the clinic's own
        // lists. Only the owner may write users/{uid} (firestore.rules), so for
        // staff and patients this quietly does nothing, and the sign-in email
        // above is the one that counts.
        if (currentUserId) {
            db.collection("users").doc(currentUserId).update({ email: newEmail })
              .catch(() => {});
        }
        setAcctStatus(prefix, "email",
            "Check " + newEmail + " and open the link we sent. The sign-in email changes " +
            "once you do. Until then, keep signing in with the old one.", "ok");
        showToast("Confirmation link sent to " + newEmail + ".", "success");
        acctEl(prefix, "email-pass").value = "";
        if (typeof hidePasswordAgain === "function") hidePasswordAgain(prefix + "-acct-email-pass");
    })
    .catch(err => {
        console.error("Could not change the sign-in email:", err);
        setAcctStatus(prefix, "email", accountErrorMessage(err), "error");
    })
    .finally(() => { if (btn) btn.disabled = false; });
}

/** The same rule the registration form applies, so one account cannot be weaker. */
function passwordIsStrong(pw) {
    return typeof pw === "string" && pw.length >= 8 && /[A-Z]/.test(pw) && /[0-9]/.test(pw);
}

function submitAccountPassword(e, prefix) {
    e.preventDefault();

    const oldPass = acctEl(prefix, "old-pass").value || "";
    const newPass = acctEl(prefix, "new-pass").value || "";
    const again = acctEl(prefix, "new-pass2").value || "";
    const btn = acctEl(prefix, "pass-btn");

    if (newPass !== again) {
        setAcctStatus(prefix, "pass", "The two new passwords are not the same.", "error");
        return;
    }
    if (!passwordIsStrong(newPass)) {
        setAcctStatus(prefix, "pass",
            "Use at least 8 characters, with a capital letter and a number.", "error");
        return;
    }
    if (oldPass === newPass) {
        setAcctStatus(prefix, "pass", "That is the same password you have now.", "warn");
        return;
    }
    if (btn && btn.disabled) return;
    if (btn) btn.disabled = true;
    setAcctStatus(prefix, "pass", "Checking your current password…");

    reauthenticate(oldPass)
    .then(() => auth.currentUser.updatePassword(newPass))
    .then(() => {
        setAcctStatus(prefix, "pass", "Password changed. Use the new one next time you sign in.", "ok");
        showToast("Password changed.", "success");
        acctEl(prefix, "old-pass").value = "";
        acctEl(prefix, "new-pass").value = "";
        acctEl(prefix, "new-pass2").value = "";
        // A box left showing would display the next password typed into it.
        if (typeof hidePasswordAgain === "function") {
            ["old-pass", "new-pass", "new-pass2"].forEach(k =>
                hidePasswordAgain(prefix + "-acct-" + k));
        }
    })
    .catch(err => {
        console.error("Could not change the password:", err);
        setAcctStatus(prefix, "pass", accountErrorMessage(err), "error");
    })
    .finally(() => { if (btn) btn.disabled = false; });
}

/**
 * The patient's recovery contact.
 *
 * Deliberately NOT a second address Firebase can send a reset to — there is no
 * such thing. It is how the clinic reaches the patient, and how the patient
 * proves who they are, when the sign-in email is gone. The clinic then changes
 * the email on the account itself.
 */
function submitRecoveryContact(e) {
    e.preventDefault();

    const mail = document.getElementById("patient-acct-recovery-email");
    const phone = document.getElementById("patient-acct-recovery-phone");
    const btn = document.getElementById("patient-acct-recovery-btn");

    const recoveryEmail = (mail && mail.value.trim()) || "";
    const recoveryPhone = (phone && phone.value.trim()) || "";

    if (recoveryEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recoveryEmail)) {
        setAcctStatus("patient", "recovery", "That does not look like an email address.", "error");
        return;
    }
    // The whole point of a recovery number is that somebody can be reached on
    // it when they are locked out. One that cannot be dialled is worse than
    // none, because it looks like a way back in (2026-09-19).
    if (recoveryPhone && typeof checkPhone === "function") {
        const verdict = checkPhone(recoveryPhone, "Mobile number");
        if (!verdict.ok) {
            setAcctStatus("patient", "recovery", verdict.reason, "error");
            return;
        }
    }
    if (!currentUserId) return;
    if (btn && btn.disabled) return;
    if (btn) btn.disabled = true;

    const contact = { recoveryEmail: recoveryEmail, recoveryPhone: recoveryPhone };
    saveChangedFields(
        db.collection("patients").doc(currentUserId),
        acctPatientOnOpen && {
            recoveryEmail: acctPatientOnOpen.recoveryEmail,
            recoveryPhone: acctPatientOnOpen.recoveryPhone
        },
        contact
    )
    .then(() => {
        if (acctPatientOnOpen) Object.assign(acctPatientOnOpen, contact);
        setAcctStatus("patient", "recovery",
            recoveryEmail || recoveryPhone
                ? "Saved. The clinic can reach you this way if your email stops working."
                : "Cleared.", "ok");
        showToast("Recovery contact saved.", "success");
    })
    .catch(err => {
        if (err && err.code === RECORD_CHANGED) {
            setAcctStatus("patient", "recovery", recordChangedMessage(err, {
                recoveryEmail: "the recovery email", recoveryPhone: "the recovery mobile"
            }), "error");
            loadAccountSettings("patient");
            return;
        }
        console.error("Could not save the recovery contact:", err);
        setAcctStatus("patient", "recovery",
            err && err.code === "permission-denied"
                ? "The clinic's security rules have not been published yet, so this cannot be saved today."
                : "Could not save. Check your connection and try again.", "error");
    })
    .finally(() => { if (btn) btn.disabled = false; });
}
