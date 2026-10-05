// ─────────────────────────────────────────────────────────────
// DentCare – js/first-signin.js (the first sign-in screen, 2026-10-02)
// ─────────────────────────────────────────────────────────────
//
// Client revisions 17 and 18. A patient whose online account the clinic made
// may still have two things to do, and the portal waits for both:
//
//   consentPending      the clinic saved the record before the patient could
//                       sign the consent (Task 16): they sign it here, on the
//                       same pad as the registration form, on its own canvas;
//   mustChangePassword  the clinic gave a temporary password (Task 18): they
//                       choose their own, with updatePassword(). Firebase may
//                       ask for the sign-in again first (requires-recent-login),
//                       and then the temporary password is asked for.
//
// Each flag is cleared only after its part has worked. firestore.rules lets the
// patient clear these two flags on their own record, only to false.
// ─────────────────────────────────────────────────────────────

const FIRST_SIGNIN_CANVAS = "first-signin-canvas";

/** Does this patient still have a first sign-in step to do? */
function firstSignInNeeded(patient) {
    return !!patient && (patient.consentPending === true || patient.mustChangePassword === true);
}

/** What this screen was opened for, and whether the password part is already done. */
let firstSignIn = { consent: false, password: false, passwordDone: false };

function firstSignInSay(message, tone) {
    const el = document.getElementById("first-signin-status");
    if (!el) return;
    el.textContent = message || "";
    el.dataset.tone = tone || "";
}

/** Show the screen instead of the portal. */
function showFirstSignInScreen(patient) {
    firstSignIn = {
        consent: patient.consentPending === true,
        password: patient.mustChangePassword === true,
        passwordDone: false
    };
    const consent = document.getElementById("first-signin-consent");
    if (consent) consent.classList.toggle("hidden", !firstSignIn.consent);
    const password = document.getElementById("first-signin-password");
    if (password) password.classList.toggle("hidden", !firstSignIn.password);
    const statement = document.getElementById("first-signin-statement");
    if (statement && typeof CLINIC_CONSENT_STATEMENT === "string") {
        statement.textContent = "“" + CLINIC_CONSENT_STATEMENT + "”";
    }
    firstSignInSay("", "");
    if (typeof navToLayout === "function") navToLayout("first-signin-layout");
    if (typeof revealPortal === "function") revealPortal();
    // The pad has no size until the screen is showing.
    if (firstSignIn.consent && typeof initSignatureCanvas === "function") {
        setTimeout(() => initSignatureCanvas(FIRST_SIGNIN_CANVAS), 150);
    }
}

/** The checks, with the boxes marked. Returns the first bad box, or null. */
function checkFirstSignIn() {
    const el = id => document.getElementById(id);
    let firstBad = null;
    if (firstSignIn.consent) {
        const agree = el("first-signin-agree");
        const card = agree ? agree.closest(".consent") : null;
        if (!agree || !agree.checked) {
            if (card) markFieldStatus(card, false, "Tick the box to agree.");
            firstBad = firstBad || agree;
        } else if (card) {
            markFieldStatus(card, true);
        }
        const name = el("first-signin-name");
        const typed = name ? name.value.trim() : "";
        const verdict = !typed
            ? { ok: false, reason: "Type your full name as your signature." }
            : (typeof checkPersonNameAt === "function" ? checkPersonNameAt("first-signin-name", typed, "Signature") : { ok: true, reason: "" });
        if (name) markFieldStatus(name, verdict.ok, verdict.reason);
        if (!verdict.ok) firstBad = firstBad || name;
    }
    if (firstSignIn.password && !firstSignIn.passwordDone) {
        const pw = el("first-signin-new");
        const pw2 = el("first-signin-new2");
        const value = pw ? pw.value : "";
        if (!evaluatePasswordStrength(value).isStrong) {
            markFieldStatus(pw, false, "Use upper and lower case letters, a number and a symbol.");
            firstBad = firstBad || pw;
        } else {
            markFieldStatus(pw, true);
        }
        if (!pw2 || pw2.value !== value || !value) {
            markFieldStatus(pw2, false, "The two passwords are not the same.");
            firstBad = firstBad || pw2;
        } else {
            markFieldStatus(pw2, true);
        }
    }
    return firstBad;
}

/** The new password, confirming the sign-in with the temporary one if Firebase asks. */
function changeFirstPassword(user, newPassword) {
    return user.updatePassword(newPassword).catch(err => {
        if (!err || err.code !== "auth/requires-recent-login") throw err;
        const wrap = document.getElementById("first-signin-current-wrap");
        const current = document.getElementById("first-signin-current");
        const typed = current ? current.value : "";
        if ((wrap && wrap.classList.contains("hidden")) || !typed) {
            if (wrap) wrap.classList.remove("hidden");
            if (current) current.focus();
            throw Object.assign(new Error("Type the temporary password the clinic gave you, then press Save again."),
                                { code: "first-signin/need-current" });
        }
        const credential = firebase.auth.EmailAuthProvider.credential(user.email, typed);
        return user.reauthenticateWithCredential(credential).then(() => user.updatePassword(newPassword));
    });
}

let firstSignInInFlight = false;

function submitFirstSignIn(e) {
    if (e) e.preventDefault();
    const user = (typeof auth !== "undefined" && auth.currentUser) || null;
    if (!user || firstSignInInFlight) return Promise.resolve(false);
    const firstBad = checkFirstSignIn();
    if (firstBad) {
        firstSignInSay("Please complete the boxes marked in red.", "error");
        if (typeof firstBad.focus === "function") firstBad.focus();
        return Promise.resolve(false);
    }

    const save = document.getElementById("first-signin-save");
    firstSignInInFlight = true;
    if (save) save.disabled = true;
    firstSignInSay("Saving…", "info");

    const newPassword = (document.getElementById("first-signin-new") || {}).value || "";
    const passwordStep = firstSignIn.password && !firstSignIn.passwordDone
        ? changeFirstPassword(user, newPassword).then(() => { firstSignIn.passwordDone = true; })
        : Promise.resolve();

    return passwordStep
        .then(() => {
            // One write for everything that worked: the consent, and each flag.
            const update = {};
            if (firstSignIn.consent) {
                update["medicalHistory.consentSignature"] = document.getElementById("first-signin-name").value.trim();
                update["medicalHistory.consentSignatureImage"] =
                    typeof getSignatureDataUrl === "function" ? getSignatureDataUrl(FIRST_SIGNIN_CANVAS) : "";
                update["medicalHistory.consentDate"] = localDateKey();
                update.consentPending = false;
            }
            if (firstSignIn.password) update.mustChangePassword = false;
            return db.collection("patients").doc(user.uid).update(update);
        })
        .then(() => {
            ["first-signin-new", "first-signin-new2", "first-signin-current"].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = "";
            });
            firstSignInSay("All set. Opening your account…", "success");
            window.location.reload();
            return true;
        })
        .catch(err => {
            console.error("First sign-in step failed:", err);
            const code = (err && err.code) || "";
            firstSignInSay(code === "first-signin/need-current" ? err.message
                : code === "auth/wrong-password" || code === "auth/invalid-credential" || code === "auth/invalid-login-credentials"
                    ? "That is not the temporary password. Check it with the clinic, then try again."
                : code === "auth/weak-password" ? "That password is too weak. Choose a stronger one."
                : firstSignIn.passwordDone
                    ? "Your new password is saved, but the rest did not save. Press Save again."
                    : "This did not save. Check your connection and try again.", "error");
            return false;
        })
        .finally(() => {
            firstSignInInFlight = false;
            if (save) save.disabled = false;
        });
}
