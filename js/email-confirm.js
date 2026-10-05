// ─────────────────────────────────────────────────────────────
// DentCare – js/email-confirm.js (confirm your email, 2026-10-01)
// ─────────────────────────────────────────────────────────────
//
// The clinic asked for email verification at registration, so nobody signs
// up with an anonymous or made-up address.
//
// A patient who registers ONLINE gets emailConfirmPending: true on their
// patient document, and Firebase emails them a link (js/auth.js). Until the
// link is opened, signing in shows this screen instead of the portal, and
// firestore.rules refuses their bookings and messages
// (emailConfirmedOrNotAsked). Once Firebase says the address is verified,
// the flag is cleared and the portal opens.
//
// A walk-in on the clinic's tablet and a patient the front desk registers are
// never held back. Staff and Dr. Gapit can also press "Confirmed in person" on
// Patient History for a patient whose email never arrives.
//
// The screen never names another account and never says whether an address
// is registered: it only ever speaks about the account signed in on it.
// ─────────────────────────────────────────────────────────────

/** The wait between two "send the link again" presses. */
const EMAIL_CONFIRM_RESEND_MS = 60 * 1000;

const EMAIL_CONFIRM_SENT_KEY = "dentcare.confirmSentAt";

/**
 * Does this signed-in patient still have to confirm their email?
 * Only when they were asked (the flag) and Firebase has not verified it.
 */
function emailConfirmNeeded(patient, user) {
    return !!patient && patient.emailConfirmPending === true && !(user && user.emailVerified);
}

function emailConfirmLastSent() {
    try { return Number(window.sessionStorage.getItem(EMAIL_CONFIRM_SENT_KEY)) || 0; } catch (e) { return 0; }
}

function emailConfirmNoteSent(at) {
    try { window.sessionStorage.setItem(EMAIL_CONFIRM_SENT_KEY, String(at)); } catch (e) { /* storage blocked */ }
}

function emailConfirmSay(message, tone) {
    const el = document.getElementById("email-confirm-status");
    if (!el) return;
    el.textContent = message || "";
    el.dataset.tone = tone || "";
}

/** Show the confirm screen instead of the portal. */
function showEmailConfirmScreen(user) {
    const address = document.getElementById("email-confirm-address");
    if (address) address.textContent = (user && user.email) || "your email address";
    emailConfirmSay("", "");
    if (typeof navToLayout === "function") navToLayout("email-confirm-layout");
    if (typeof revealPortal === "function") revealPortal();
}

/** "Send the link again", at most once a minute. */
function resendConfirmEmail() {
    const user = (typeof auth !== "undefined" && auth.currentUser) || null;
    if (!user) return Promise.resolve(false);

    const waited = Date.now() - emailConfirmLastSent();
    if (waited < EMAIL_CONFIRM_RESEND_MS) {
        const secs = Math.ceil((EMAIL_CONFIRM_RESEND_MS - waited) / 1000);
        emailConfirmSay("A link was sent a moment ago. You can ask for another in " + secs +
                        " second" + (secs === 1 ? "" : "s") + ".", "info");
        return Promise.resolve(false);
    }

    const btn = document.getElementById("email-confirm-resend");
    if (btn) btn.disabled = true;
    return user.sendEmailVerification()
        .then(() => {
            emailConfirmNoteSent(Date.now());
            emailConfirmSay("A new link is on its way. Check your inbox, and the spam folder too.", "success");
            return true;
        })
        .catch(err => {
            console.warn("Could not resend the confirmation email:", err);
            emailConfirmSay(err && err.code === "auth/too-many-requests"
                ? "Too many links were asked for just now. Wait a few minutes, then try again."
                : "The link could not be sent just now. Check your connection and try again.", "error");
            return false;
        })
        .finally(() => { if (btn) btn.disabled = false; });
}

/**
 * "I have opened the link": ask Firebase again (reload, then a fresh token
 * so the database sees the verified address), then clear the flag and open
 * the portal. Nothing is decided from the stale copy the page started with.
 */
function confirmEmailOpened() {
    const user = (typeof auth !== "undefined" && auth.currentUser) || null;
    if (!user) return Promise.resolve(false);
    const btn = document.getElementById("email-confirm-done");
    if (btn) btn.disabled = true;
    emailConfirmSay("Checking…", "info");

    return user.reload()
        .then(() => {
            const fresh = auth.currentUser || user;
            if (!fresh.emailVerified) {
                emailConfirmSay("The link has not been opened yet. Open the link in the email we sent, " +
                                "then press this button again.", "error");
                return false;
            }
            return fresh.getIdToken(true)
                .then(() => db.collection("patients").doc(fresh.uid).update({ emailConfirmPending: false }))
                .then(() => {
                    emailConfirmSay("Thank you. Your email is confirmed.", "success");
                    window.location.reload();
                    return true;
                });
        })
        .catch(err => {
            console.error("Could not check the confirmation:", err);
            emailConfirmSay("We could not check just now. Check your connection and try again.", "error");
            return false;
        })
        .finally(() => { if (btn) btn.disabled = false; });
}

/**
 * Called on sign-in for a patient whose address Firebase has verified but
 * whose flag is still set (they opened the link on another device). Best
 * effort: a failure leaves the flag for the next sign-in to clear.
 */
function clearConfirmedEmailFlag(user) {
    if (!user || !user.emailVerified) return Promise.resolve(false);
    return user.getIdToken(true)
        .then(() => db.collection("patients").doc(user.uid).update({ emailConfirmPending: false }))
        .then(() => true)
        .catch(err => { console.warn("Could not clear the confirmation flag:", err); return false; });
}

// ─────────────────────────────────────────────────────────────
// The clinic's side: "Confirmed in person" on Patient History
// ─────────────────────────────────────────────────────────────

/** Staff or Dr. Gapit vouch for an email that never arrived. */
function confirmPatientEmailInPerson(patientId) {
    if (!patientId) return Promise.resolve(false);
    if (typeof currentRole === "undefined" ||
        ["staff", "admin", "dentist"].indexOf(currentRole) === -1) {
        return Promise.resolve(false);
    }
    const ask = typeof confirmDialog === "function"
        ? confirmDialog("Mark this patient's email as confirmed? Use this when the patient is here and the " +
                        "confirmation email never arrived. Their account can then book and send messages.",
                        { title: "Confirm the email in person?", confirmLabel: "Confirmed in person" })
        : Promise.resolve(true);
    return Promise.resolve(ask).then(yes => {
        if (!yes) return false;
        if (typeof noteOwnWrite === "function") noteOwnWrite("patients/" + patientId);
        return db.collection("patients").doc(patientId).update({
            emailConfirmPending: false,
            emailConfirmedByClinicAt: new Date().toISOString(),
            emailConfirmedByClinicBy: currentUserId || ""
        }).then(() => {
            if (typeof showToast === "function") showToast("Email marked as confirmed.", "success");
            return true;
        });
    }).catch(err => {
        console.error("Could not mark the email confirmed:", err);
        if (typeof showToast === "function") showToast("Could not save that. Try again.", "error");
        return false;
    });
}
