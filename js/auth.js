// ─────────────────────────────────────────────────────────────
// DentCare – js/auth.js (Authentication Control Engine)
// ─────────────────────────────────────────────────────────────

// Toggle between Login and Register form modes
function toggleAuthForm(mode) {
    const loginForm = document.getElementById("form-login");
    const regForm = document.getElementById("form-register");
    const loginTab = document.getElementById("tab-btn-login");
    const regTab = document.getElementById("tab-btn-register");
    const bookingPage = document.getElementById("screen-booking");
    if (bookingPage) bookingPage.classList.toggle("booking-page--login", mode === "login");

    if (mode === "login") {
        loginForm.classList.remove("hidden");
        regForm.classList.add("hidden");
        loginTab.classList.add("active");
        regTab.classList.remove("active");
    } else {
        loginForm.classList.add("hidden");
        regForm.classList.remove("hidden");
        loginTab.classList.remove("active");
        regTab.classList.add("active");
        goBackToRegisterStep1(); // Always start at step 1
    }
}

// Toggle minor guardian fields visibility
function toggleMinorFields(checked) {
    const wrap = document.getElementById("minor-fields-wrap");
    if (wrap) {
        if (checked) {
            wrap.classList.remove("hidden");
        } else {
            wrap.classList.add("hidden");
            document.getElementById("reg-parent-name").value = "";
            document.getElementById("reg-parent-phone").value = "";
        }
    }
}

// ─────────────────────────────────────────────────────────────
// Is this an email address the patient will actually receive?
// ─────────────────────────────────────────────────────────────
//
// ── WHY THERE IS NO VERIFICATION LINK ────────────────────────────────────
//
// The textbook way to prove an address is real is to mail it a link and
// refuse the account until somebody clicks. This clinic is the wrong place
// for that. A good share of its patients are not confident with a phone, and
// "go to your email, find our message, tap the link, come back here" is
// exactly the step where they give up and ring the clinic instead — which is
// the thing this system exists to reduce.
//
// The clinic also already has the defence that matters. A patient booking is
// created with status Pending and the front desk approves it — see
// isOwnNewBooking() in firestore.rules. A fake account cannot give itself a
// confirmed appointment; a person sees every one first.
//
// ── SO WHAT IS THIS FOR ──────────────────────────────────────────────────
//
// The real damage from a bad address is quiet, and it lands on the patient
// rather than the clinic. Type gmial.com for gmail.com and the old regex
// passed it, the account was created, and sendPasswordResetEmail() then
// posted the recovery link to a mailbox nobody owns. The patient is locked
// out of her own records the first time she forgets her password, and
// nothing ever told her why.
//
// So: catch the typo, which helps the patient, and refuse the throwaway
// domains, which helps the clinic. Neither costs a real patient a step.

// The domains this clinic actually sees. Used ONLY for the "did you mean"
// check — never as an allow-list. A patient on a company, school or provider
// domain must still be able to register.
const EMAIL_COMMON_DOMAINS = [
    "gmail.com", "yahoo.com", "yahoo.com.ph", "outlook.com", "hotmail.com",
    "icloud.com", "live.com", "protonmail.com", "aol.com", "msn.com"
];

// Throwaway inbox services. Somebody registering from one of these is not a
// patient the clinic will ever be able to reach again.
const EMAIL_DISPOSABLE = [
    "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com",
    "temp-mail.org", "yopmail.com", "throwawaymail.com", "trashmail.com",
    "sharklasers.com", "getnada.com", "maildrop.cc", "fakeinbox.com",
    "dispostable.com", "mintemail.com", "spamgourmet.com", "mailnesia.com",
    "tempr.email", "emailondeck.com"
];

// Edit distance, short-circuited on length. Only ever asked one question:
// "is this within one slip of gmail.com?"
//
// A SWAPPED PAIR COUNTS AS ONE SLIP. Plain Levenshtein scores gmial -> gmail as
// two edits, because it has no idea the two letters merely changed places — and
// transposition is the single most common way a domain gets mistyped. Scoring
// it as 2 meant the exact typo this whole feature was written for, gmial.com,
// sailed straight through. The extra term below is what catches it.
function emailEditDistance(a, b) {
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > 2) return 99;
    if (a.length > 40 || b.length > 40) return 99;

    const d = [];
    for (let i = 0; i <= a.length; i++) {
        d[i] = [i];
    }
    for (let j = 0; j <= b.length; j++) {
        d[0][j] = j;
    }

    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
            d[i][j] = Math.min(
                d[i - 1][j] + 1,        // deletion
                d[i][j - 1] + 1,        // insertion
                d[i - 1][j - 1] + cost  // substitution
            );
            if (i > 1 && j > 1 &&
                a.charAt(i - 1) === b.charAt(j - 2) &&
                a.charAt(i - 2) === b.charAt(j - 1)) {
                d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);  // transposition
            }
        }
    }
    return d[a.length][b.length];
}

/**
 * The domain the patient probably meant, or "" if there is no good guess.
 *
 * TWO RULES, AND THE SECOND ONE IS THE IMPORTANT ONE.
 *
 * 1. Within one slip of a domain the clinic knows.
 *
 * 2. Starting with the same letter. Without this, one edit from gmail.com also
 *    reaches mail.com and ymail.com — both real, working mail providers — and
 *    the app tells a patient with a perfectly good address that she has
 *    misspelled her own email. The first character of a domain is the one
 *    people get right; the slips happen in the middle and at the end. So
 *    gmial, gmai, gmaill and gnail are all still caught, while mail.com and
 *    ymail.com are left alone.
 */
function suggestEmailDomain(domain) {
    if (EMAIL_COMMON_DOMAINS.indexOf(domain) !== -1) return "";

    for (let i = 0; i < EMAIL_COMMON_DOMAINS.length; i++) {
        const known = EMAIL_COMMON_DOMAINS[i];
        if (domain.charAt(0) !== known.charAt(0)) continue;
        if (emailEditDistance(domain, known) === 1) return known;
    }
    return "";
}

/**
 * @returns {{ok: boolean, level: string, reason: string, suggestion: string}}
 *
 * THREE OUTCOMES, AND ONLY ONE OF THEM STOPS HER.
 *
 *   level "ok"     nothing to say.
 *
 *   level "typo"   probably a slip, and here is what she meant. ok stays TRUE
 *                  — this shows the offer and lets her past anyway.
 *
 *   level "error"  this address cannot be delivered to at all. ok is false and
 *                  Next refuses.
 *
 * The split matters more than it looks. A "did you mean" is a guess, and a
 * guess that blocks is a guess that can shut a patient out of registering with
 * her own working address because the app was wrong about her. Nobody is going
 * to argue with it; she will just stop and phone the clinic. So the guess gets
 * to advise and never to refuse, and hard refusal is kept for the cases where
 * there is no argument — no @ at all, two dots in a row, a throwaway inbox.
 *
 * Every reason is written for someone who does not know what a domain is.
 */
function checkEmailAddress(value) {
    const email = String(value === null || value === undefined ? "" : value).trim();
    const no = (reason) => ({
        ok: false,
        level: "error",
        reason: reason,
        suggestion: ""
    });

    if (!email) return no("Please enter an email address.");

    // 320 is the real-world maximum for an address, and matches the ceiling
    // firestore.rules puts on the stored field. Checked here so the patient
    // is told before the write is refused.
    if (email.length > 320) return no("That email address is too long.");
    if (/\s/.test(email)) return no("An email address cannot contain spaces.");

    const parts = email.split("@");
    if (parts.length !== 2) {
        return no("An email address needs exactly one @ sign, like name@gmail.com.");
    }

    const local = parts[0];
    const domain = parts[1].toLowerCase();

    if (!local) return no("Please type the part before the @ sign.");
    if (local.length > 64) return no("The part before the @ sign is too long.");
    if (!domain) return no("Please type the part after the @ sign, like gmail.com.");

    // Every one of these passed the old regex, and not one of them can be
    // delivered to.
    if (domain.indexOf(".") === -1) {
        return no("The part after the @ needs a dot in it, like gmail.com.");
    }
    if (local.indexOf("..") !== -1 || domain.indexOf("..") !== -1) {
        return no("That address has two dots in a row.");
    }
    if (local.charAt(0) === "." || local.charAt(local.length - 1) === "." ||
        domain.charAt(0) === "." || domain.charAt(domain.length - 1) === ".") {
        return no("That address starts or ends with a dot.");
    }
    if (domain.charAt(0) === "-" || domain.indexOf(".-") !== -1 ||
        domain.indexOf("-.") !== -1) {
        return no("That does not look like a website name.");
    }
    if (!/^[a-z0-9.-]+$/.test(domain)) {
        return no("The part after the @ has a character that cannot be there.");
    }
    if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) {
        return no("The part before the @ has a character that cannot be there.");
    }

    const tld = domain.split(".").pop();
    if (tld.length < 2 || !/^[a-z]+$/.test(tld)) {
        return no("The ending, like .com or .ph, does not look right.");
    }

    if (EMAIL_DISPOSABLE.indexOf(domain) !== -1) {
        return no("That is a temporary email service. Please use an address " +
                  "the clinic can still reach you on later.");
    }

    // Advice, not a refusal — see the three outcomes above.
    const better = suggestEmailDomain(domain);
    if (better) {
        return {
            ok: true,
            level: "typo",
            reason: "Did you mean " + local + "@" + better + "?",
            suggestion: local + "@" + better
        };
    }

    return { ok: true, level: "ok", reason: "", suggestion: "" };
}

// Show the verdict under the email box. The message and the button are built
// with createElement/textContent rather than innerHTML — the text quotes back
// whatever the patient typed, so building it as markup would make the field
// its own XSS sink. Nothing to escape if nothing is parsed as HTML.
function showEmailHint(inputEl, verdict) {
    if (!inputEl) return;

    // Derived from the field, so the same helper serves the registration box
    // and the forgot-password box without either knowing about the other.
    const hintId = inputEl.id + "-hint";

    let hint = document.getElementById(hintId);
    if (!hint) {
        hint = document.createElement("div");
        hint.id = hintId;
        inputEl.insertAdjacentElement("afterend", hint);
    }

    hint.textContent = "";

    if (!verdict || !verdict.reason) {
        hint.className = "email-hint hidden";
        return;
    }

    // Amber for a guess, red for a refusal. Dressing a "did you mean" in the
    // same red as a real error tells the patient she has done something wrong
    // when the app is the one that is unsure.
    hint.className = verdict.level === "typo"
        ? "email-hint email-hint--fix"
        : "email-hint";

    const msg = document.createElement("span");
    msg.textContent = verdict.reason;
    hint.appendChild(msg);

    if (verdict.suggestion) {
        const fix = document.createElement("button");
        fix.type = "button";
        fix.className = "email-hint__fix";
        fix.textContent = "Yes, use that";
        fix.addEventListener("click", () => {
            inputEl.value = verdict.suggestion;
            markFieldStatus(inputEl, true);
            showEmailHint(inputEl, null);
            inputEl.focus();
        });
        hint.appendChild(fix);
    }
}

// ── "Already on a DentCare record", under the mobile box (2026-10-05) ──────
// Asked once a whole mobile number has been typed, a moment after typing
// stops. A warning, never a block: a family can share one number (the owner's
// decision). isMobileOnFile() is in js/app.js; an answer that arrives after a
// newer number was typed is ignored.
let mobileOnFileTimer = null;
let mobileOnFileAsk = 0;
function checkMobileOnFileLive(now) {
    const box = document.getElementById("reg-phone");
    const hint = document.getElementById("reg-phone-on-file");
    if (!box || !hint) return Promise.resolve();
    if (mobileOnFileTimer) { clearTimeout(mobileOnFileTimer); mobileOnFileTimer = null; }
    const ask = ++mobileOnFileAsk;
    const typed = box.value;
    if (typeof normaliseMobile !== "function" || typeof isMobileOnFile !== "function" || !normaliseMobile(typed)) {
        hint.hidden = true;
        return Promise.resolve();
    }
    const run = () => isMobileOnFile(typed).then(onFile => {
        if (ask !== mobileOnFileAsk) return;
        hint.textContent = "This number is already on a DentCare record. If it is yours, sign in instead, " +
                           "or ask the clinic. You can still continue, for example for a family member.";
        hint.hidden = !onFile;
    });
    if (now === true) return run();
    return new Promise(resolve => {
        mobileOnFileTimer = setTimeout(() => { mobileOnFileTimer = null; run().then(resolve); }, 400);
    });
}

// Called from the field's own blur handler, so the patient is told while she
// is still looking at the box — not four fields later when she presses Next.
//
// Used by the registration box and by the forgot-password box. The second one
// matters more than it looks: a reset link can only ever be SENT, never
// confirmed to the person waiting for it (see submitForgotPassword), so the
// typo has to be caught here or it is never caught at all.
function checkEmailFieldLive(inputId) {
    const el = document.getElementById(inputId || "reg-email");
    if (!el) return;

    const val = el.value ? el.value.trim() : "";
    if (!val) {                       // Empty is Next's business, not ours.
        showEmailHint(el, null);
        return;
    }

    const verdict = checkEmailAddress(val);

    // The red outline is only for an address that genuinely cannot work. A
    // suspected typo gets the amber hint and nothing else — she may well be
    // right and the app wrong.
    markFieldStatus(el, verdict.ok);
    showEmailHint(el, verdict);
}

// Helper to toggle red input-error outline and shake animation
// With a message, the reason is also written under the field (owner request
// 2026-09-25: the red box and, under it, what to fix), through showFieldError()
// in js/app.js. Without one, an earlier message on the field is left as it is.
function markFieldStatus(elementOrId, isValid, message) {
    const el = typeof elementOrId === "string" ? document.getElementById(elementOrId) : elementOrId;
    if (!el) return;

    if (!isValid) {
        el.classList.add("input-error", "input-error-shake");
        setTimeout(() => el.classList.remove("input-error-shake"), 450);
        if (message && typeof showFieldError === "function") showFieldError(el, message, false);
    } else {
        el.classList.remove("input-error", "input-error-shake");
        if (typeof clearFieldError === "function") clearFieldError(el);
    }
}

// Auto-remove error highlight when user interacts with inputs
document.addEventListener("input", function (e) {
    if (e.target && e.target.classList.contains("input-error")) {
        e.target.classList.remove("input-error");
    }
});
document.addEventListener("change", function (e) {
    if (e.target && e.target.classList.contains("input-error")) {
        e.target.classList.remove("input-error");
    }
});

// Password Strength & Passkey Recommendation Evaluator
function evaluatePasswordStrength(pwd) {
    const pwdVal = pwd || "";
    
    const hasLength = pwdVal.length >= 8;
    const hasUpper = /[A-Z]/.test(pwdVal);
    const hasLower = /[a-z]/.test(pwdVal);
    const hasNumber = /[0-9]/.test(pwdVal);
    const hasSymbol = /[^A-Za-z0-9]/.test(pwdVal);

    updateCritEl("crit-length", hasLength, "Min 8 characters");
    updateCritEl("crit-upper", hasUpper, "Uppercase (A-Z)");
    updateCritEl("crit-lower", hasLower, "Lowercase (a-z)");
    updateCritEl("crit-number", hasNumber, "Number (0-9)");
    updateCritEl("crit-symbol", hasSymbol, "Special char (!@#$)");

    let score = 0;
    if (hasLength) score++;
    if (hasUpper) score++;
    if (hasLower) score++;
    if (hasNumber) score++;
    if (hasSymbol) score++;

    const fillBar = document.getElementById("strength-bar-fill");
    const textLabel = document.getElementById("strength-text");

    if (fillBar && textLabel) {
        if (!pwdVal) {
            fillBar.style.transform = "scaleX(0)";
            fillBar.style.backgroundColor = "#cbd5e1";
            textLabel.textContent = "Not entered";
            textLabel.style.color = "var(--text-muted)";
        } else if (score <= 1) {
            fillBar.style.transform = "scaleX(0.2)";
            fillBar.style.backgroundColor = "#ef4444";
            textLabel.textContent = "Too weak";
            textLabel.style.color = "#ef4444";
        } else if (score === 2) {
            fillBar.style.transform = "scaleX(0.4)";
            fillBar.style.backgroundColor = "#f97316";
            textLabel.textContent = "Weak";
            textLabel.style.color = "#f97316";
        } else if (score === 3) {
            fillBar.style.transform = "scaleX(0.6)";
            fillBar.style.backgroundColor = "#eab308";
            textLabel.textContent = "Fair";
            textLabel.style.color = "#d97706";
        } else if (score === 4) {
            fillBar.style.transform = "scaleX(0.8)";
            fillBar.style.backgroundColor = "#10b981";
            textLabel.textContent = "Strong";
            textLabel.style.color = "#10b981";
        } else {
            fillBar.style.transform = "scaleX(1)";
            fillBar.style.backgroundColor = "#059669";
            textLabel.textContent = "Very strong";
            textLabel.style.color = "#059669";
        }
    }

    return { score, isStrong: score >= 4 };
}

function updateCritEl(id, isMet, label) {
    const el = document.getElementById(id);
    if (!el) return;
    // The tick or dash in front of the label is drawn by CSS (.crit-item::before
    // in css/booking.css) so the text here stays plain and copy-pasteable.
    el.textContent = label;
    el.classList.toggle("valid", isMet);
}

// Cryptographically Strong Passkey Recommendation Generator
function generateStrongPasskey() {
    const uppers = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const lowers = "abcdefghijkmnopqrstuvwxyz";
    const numbers = "23456789";
    const symbols = "!@#$%^&*()_+-=";

    // crypto.getRandomValues, not Math.random (2026-09-13). Math.random is
    // predictable by design, which is the wrong property for something handed
    // to a patient as their password. Rejection sampling keeps every character
    // equally likely rather than skewing toward the start of the set.
    const randomIndex = (n) => {
        const buf = new Uint32Array(1);
        const limit = Math.floor(0x100000000 / n) * n;
        do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
        return buf[0] % n;
    };
    const getRandom = (str) => str[randomIndex(str.length)];

    let passkeyArr = [
        getRandom(uppers),
        getRandom(uppers),
        getRandom(lowers),
        getRandom(lowers),
        getRandom(numbers),
        getRandom(numbers),
        getRandom(symbols),
        getRandom(symbols)
    ];

    const allChars = uppers + lowers + numbers + symbols;
    for (let i = passkeyArr.length; i < 16; i++) {
        passkeyArr.push(getRandom(allChars));
    }

    for (let i = passkeyArr.length - 1; i > 0; i--) {
        const j = randomIndex(i + 1);
        [passkeyArr[i], passkeyArr[j]] = [passkeyArr[j], passkeyArr[i]];
    }

    const passkey = passkeyArr.join("");
    const pwdInput = document.getElementById("reg-password");
    if (pwdInput) {
        pwdInput.value = passkey;
        pwdInput.type = "text";
        markFieldStatus(pwdInput, true);
        evaluatePasswordStrength(passkey);
    }

    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(passkey).catch(() => {});
    }

    showToast("Generated a strong passkey and copied it to your clipboard.", "success");
}

// ── Date of birth as Month / Day / Year (client request 2026-09-27) ─────────
//
// One <input type="date"> made a phone user scroll back through decades to
// reach a birth year. Now the month is picked by name, and the day and year
// are typed (or picked from a short list). The three are joined here into the
// same "YYYY-MM-DD" string the old picker produced, which is what the database,
// the mobile app, the walk-in lookup and every age calculation already read.

const DOB_MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

/**
 * Read the three birth-date boxes.
 *
 * @returns {{value: string, empty: boolean, bad: string[], reason: string}}
 *   value  "YYYY-MM-DD" when the date is complete and real, otherwise ""
 *   empty  true when nothing at all was entered
 *   bad    which parts are wrong: "month", "day", "year"
 *   reason what to tell the patient, "" when the date is fine
 */
function readRegisterDob() {
    const monthEl = document.getElementById("reg-dob-month");
    const dayEl = document.getElementById("reg-dob-day");
    const yearEl = document.getElementById("reg-dob-year");
    const month = monthEl ? monthEl.value.trim() : "";
    const dayRaw = dayEl ? dayEl.value.trim() : "";
    const yearRaw = yearEl ? yearEl.value.trim() : "";

    const out = { value: "", empty: !month && !dayRaw && !yearRaw, bad: [], reason: "" };
    if (out.empty) {
        out.bad = ["month", "day", "year"];
        out.reason = "Please enter the date of birth: month, day and year.";
        return out;
    }

    const problems = [];
    const m = /^(0[1-9]|1[0-2])$/.test(month) ? Number(month) : 0;
    if (!m) { out.bad.push("month"); problems.push("choose the month"); }

    const d = /^\d{1,2}$/.test(dayRaw) ? Number(dayRaw) : 0;
    if (d < 1 || d > 31) { out.bad.push("day"); problems.push("type the day (1 to 31)"); }

    // All four digits. "95" could be 1995 or 2095, and guessing wrong puts a
    // wrong age on a medical record, so it is asked for rather than assumed.
    const y = /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : 0;
    if (!y) {
        out.bad.push("year");
        problems.push(yearRaw ? "type all 4 digits of the year, e.g. 1995" : "type the year, e.g. 1995");
    }

    if (problems.length) {
        out.reason = "Date of Birth: please " + problems.join(", ") + ".";
        return out;
    }

    // A day the month does not have: 31 June, 30 February, 29 February in a
    // year that is not a leap year. Date() would quietly roll these into the
    // next month, so the check is made against what comes back.
    const probe = new Date(y, m - 1, d);
    if (probe.getFullYear() !== y || probe.getMonth() !== m - 1 || probe.getDate() !== d) {
        out.bad = ["day"];
        out.reason = "Date of Birth: " + DOB_MONTH_NAMES[m - 1] + " " + y +
                     " does not have a day " + d + ".";
        return out;
    }

    out.value = y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
    return out;
}

/**
 * Outline the wrong parts of the birth date and say why under the group.
 * An empty list clears it. The group itself is not outlined, so the focus
 * after a failed Next lands on the first wrong box rather than on a <div>.
 */
function markRegisterDob(bad, reason) {
    const group = document.getElementById("reg-dob");
    if (!group) return;
    const parts = {
        month: document.getElementById("reg-dob-month"),
        day: document.getElementById("reg-dob-day"),
        year: document.getElementById("reg-dob-year")
    };
    Object.keys(parts).forEach(k => {
        if (parts[k]) markFieldStatus(parts[k], bad.indexOf(k) === -1);
    });
    if (!bad.length) {
        group.classList.remove("input-error");
        if (typeof clearFieldError === "function") clearFieldError(group);
        return;
    }
    // .input-error-group: js/app.js clears the message the moment anything
    // inside the group is changed, as it does for the time-slot boxes.
    group.classList.add("input-error-group");
    if (typeof showFieldError === "function") showFieldError(group, reason, false);
    group.classList.remove("input-error");
}

/** The year list, this year back 120 — built here because the live site is static HTML. */
function fillDobYearList() {
    const list = document.getElementById("reg-dob-year-list");
    if (!list || list.options.length) return;
    const thisYear = new Date().getFullYear();
    const frag = document.createDocumentFragment();
    for (let y = thisYear; y >= thisYear - 120; y--) {
        const opt = document.createElement("option");
        opt.value = String(y);
        frag.appendChild(opt);
    }
    list.appendChild(frag);
}

/** Digits only in the day and year boxes; and one fix clears all three outlines. */
function initRegisterDob() {
    const group = document.getElementById("reg-dob");
    if (!group || group.dataset.ready === "1") return;
    group.dataset.ready = "1";
    fillDobYearList();

    ["reg-dob-day", "reg-dob-year"].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const max = Number(el.dataset.maxDigits) || 4;
        el.addEventListener("input", () => {
            // Strip first, then trim: a pasted " 1995" or "1995." keeps all
            // four digits (a maxlength would have cut it before stripping).
            // Surplus leading zeros go before the trim, so "007" is day 07,
            // not "00".
            let digits = el.value.replace(/\D/g, "");
            while (digits.length > max && digits.charAt(0) === "0") digits = digits.slice(1);
            digits = digits.slice(0, max);
            if (digits !== el.value) el.value = digits;
        });
    });

    ["input", "change"].forEach(type => group.addEventListener(type, () => {
        group.querySelectorAll(".input-error").forEach(el => el.classList.remove("input-error"));
    }));
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initRegisterDob);
} else {
    initRegisterDob();
}

// Step 1 Validation
function validateStep1() {
    let isValid = true;
    const missing = [];

    // Which boxes a check below has already outlined in red.
    //
    // The required-field pass at the bottom of this function re-marks every
    // non-empty field as valid, and it runs LAST -- so without this it wipes
    // the outline off the very field it is complaining about, and the patient
    // reads "that does not look like a name" with nothing on screen to say
    // which name. Recorded here, honoured there.
    const alreadyWrong = {};
    // Every caller has just pushed its reason onto `missing`; that sentence
    // is also written under the field.
    const markWrong = (el, id) => {
        if (id) alreadyWrong[id] = true;
        markFieldStatus(el, false, missing[missing.length - 1]);
    };

    // ── A patient record made by staff (2026-10-01, client revision 16) ────
    // Only the first name, last name and date of birth are required (the
    // owner's choice). Every other box turns red only when what was typed in
    // it is plainly wrong. No password and no login: the record has no
    // online account.
    const staffRecord = typeof isStaffPatientIntake === "function" && isStaffPatientIntake();

    // The email is optional since 2026-10-01: without one, the patient signs
    // in with their mobile number (checked below, after the phone check).
    const requiredFields = staffRecord ? [
        { id: "reg-first-name", name: "First Name" },
        { id: "reg-last-name", name: "Last Name" }
    ] : [
        // Online (2026-10-02, R19): last name, first name, date of birth,
        // mobile number, password and the consent. Sex, email and every other
        // personal box are optional; patients gave up on a form full of red.
        { id: "reg-first-name", name: "First Name" },
        { id: "reg-last-name", name: "Last Name" },
        { id: "reg-password", name: "Password", isPassword: true },
        // Date of Birth is three boxes now and is checked on its own below.
        { id: "reg-phone", name: "Mobile / Contact No." }
    ];

    // A name that is really a name (checkPersonName in js/app.js). Caught here
    // rather than at the end, so the patient fixes it on the step they are on.
    // Asked through checkPersonNameAt, keyed by the box, so an unusual but real
    // spelling is questioned once and accepted on the second press (2026-09-30).
    [["reg-first-name", "First name"],
     ["reg-middle-name", "Middle name"],
     ["reg-last-name", "Last name"]].forEach(([id, label]) => {
        const el = document.getElementById(id);
        if (!el) return;
        const val = el.value ? el.value.trim() : "";
        // Middle name is optional; an empty one is not an error.
        if (!val && id === "reg-middle-name") { markFieldStatus(el, true); return; }
        if (!val) return;   // the required-field pass below reports an empty one
        const verdict = typeof checkPersonNameAt === "function"
            ? checkPersonNameAt(id, val, label)
            : { ok: true, reason: "" };
        if (!verdict.ok) {
            isValid = false;
            missing.push(verdict.reason);
            markWrong(el, id);
        }
    });

    // ── A number the clinic can actually ring (2026-09-19) ──────────────────
    //
    // These were `type="tel"`, which checks NOTHING -- it only changes the
    // keyboard a phone shows -- so "adadaadadada" registered as a mobile
    // number on the live site. Every reminder and every "the dentist is ready
    // for you" call goes out by phone, so a junk number is a patient the
    // clinic can never reach again.
    //
    // The two optional ones are only checked when something was typed: an
    // empty office or guardian number is not an error.
    [["reg-phone", "Mobile / Contact No.", !staffRecord],
     ["reg-office-no", "Telephone No.", false],
     ["reg-parent-phone", "Guardian's contact number", false]].forEach(([id, label, required]) => {
        const el = document.getElementById(id);
        if (!el) return;
        const val = el.value ? el.value.trim() : "";
        if (!val) {
            // The required-field pass below reports an empty required one.
            if (!required) markFieldStatus(el, true);
            return;
        }
        const verdict = typeof checkPhone === "function"
            ? checkPhone(val, label)
            : { ok: true, reason: "" };
        if (!verdict.ok) {
            isValid = false;
            missing.push(verdict.reason);
            markWrong(el, id);
        }
    });

    // ── Email, or a mobile number to sign in with (2026-10-01) ─────────────
    // An email, when given, is the login and must be one that can be
    // delivered to. With no email, the mobile number is the login, so it has
    // to be a mobile, not a landline.
    {
        const emailEl = document.getElementById("reg-email");
        const typedEmail = emailEl && emailEl.value ? emailEl.value.trim() : "";
        if (emailEl && typedEmail) {
            const verdict = checkEmailAddress(typedEmail);
            showEmailHint(emailEl, verdict);
            if (!verdict.ok) {
                isValid = false;
                missing.push("Email Address — " + verdict.reason);
                markWrong(emailEl, "reg-email");
            } else {
                markFieldStatus(emailEl, true);
            }
        } else if (emailEl) {
            markFieldStatus(emailEl, true);
        }

        // Online, the number asked for is a MOBILE (2026-10-02, R19): the
        // clinic texts and calls it, and with no email it is also the login.
        // A staff record has no login, so a landline is fine there.
        const phoneEl = staffRecord ? null : document.getElementById("reg-phone");
        const phoneVal = phoneEl && phoneEl.value ? phoneEl.value.trim() : "";
        if (phoneEl && phoneVal && !alreadyWrong["reg-phone"] &&
            typeof normaliseMobile === "function" && !normaliseMobile(phoneVal)) {
            isValid = false;
            missing.push(typedEmail
                ? "Mobile / Contact No.: enter a mobile number (11 digits, like 0917 555 0101)."
                : "With no email, you sign in with your mobile number, so it has to be a mobile (11 digits, like 0917 555 0101).");
            markWrong(phoneEl, "reg-phone");
        }
    }

    // ── The rest of what ends up on the record (2026-09-19) ────────────────
    //
    // Everything below is free text that a dentist reads before she treats
    // somebody, or that the clinic uses to reach them. None of it was checked
    // at all. These are only refused when they are plainly a keyboard mash --
    // an address can be almost anything, and guessing at what a real Naga
    // address looks like would turn away more patients than it would help.
    [["reg-address", "Address"],
     ["reg-parent-name", "Parent or guardian's name"],
     ["reg-occupation", "Occupation"],
     ["reg-company", "Company or school"],
     ["reg-company-address", "Company address"],
     ["reg-nationality", "Nationality"],
     ["reg-former-dentist", "Previous dentist"],
     ["reg-referred-by", "Referred by"],
     ["reg-emergency", "Emergency contact"]].forEach(([id, label]) => {
        const el = document.getElementById(id);
        if (!el) return;
        const val = el.value ? el.value.trim() : "";
        if (!val) return;   // all optional; an empty one is not an error
        if (typeof looksMashed === "function" && looksMashed(val)) {
            isValid = false;
            missing.push(label + ": that does not look like a real entry.");
            markWrong(el, id);
            return;
        }
        markFieldStatus(el, true);
    });

    // The guardian's name is a person's name, so it gets the full check, not
    // just the mash one. A minor's record is the one place the clinic has to
    // be able to reach an adult.
    const guardianEl = document.getElementById("reg-parent-name");
    const isMinorEl = document.getElementById("reg-is-minor");
    if (guardianEl && isMinorEl && isMinorEl.checked) {
        const gv = guardianEl.value ? guardianEl.value.trim() : "";
        const verdict = (gv && typeof checkPersonNameAt === "function")
            ? checkPersonNameAt("reg-parent-name", gv, "Parent or guardian's name")
            : { ok: true, reason: "" };
        if (!verdict.ok) {
            isValid = false;
            missing.push(verdict.reason);
            markWrong(guardianEl, "reg-parent-name");
        }
    }

    // A date of birth that is complete, real, and could be true. Typing the
    // current year instead of the birth year is the ordinary slip, and it
    // silently makes a newborn. #reg-dob is the Month / Day / Year group; see
    // readRegisterDob().
    const dobEl = document.getElementById("reg-dob");
    if (dobEl) {
        const dobRead = readRegisterDob();
        let dobBad = dobRead.bad;
        let dobReason = dobRead.reason;
        if (dobRead.value) {
            const dob = new Date(dobRead.value + "T00:00:00");
            const now = new Date();
            const years = (now - dob) / (365.25 * 24 * 60 * 60 * 1000);
            if (isNaN(dob.getTime()) || years < 0) {
                dobBad = ["year"];
                dobReason = "Date of Birth: this is in the future.";
            } else if (years > 120) {
                dobBad = ["year"];
                dobReason = "Date of Birth: please check the year.";
            }
        }
        if (dobBad.length) {
            isValid = false;
            missing.push(dobRead.empty ? "Date of Birth" : dobReason);
        }
        markRegisterDob(dobBad, dobReason);
    }

    requiredFields.forEach(f => {
        const el = document.getElementById(f.id);
        if (!el) return;
        const val = el.value ? el.value.trim() : "";
        // A check above has already refused this one; do not paint it green.
        let fieldValid = val !== "" && !alreadyWrong[f.id];

        if (fieldValid && f.isEmail) {
            // The reason is carried into the summary in words the patient can
            // act on. "Email Address (invalid format)" just gets the same
            // typo retyped; "Did you mean maria@gmail.com?" gets it fixed.
            const verdict = checkEmailAddress(val);
            showEmailHint(el, verdict);
            if (!verdict.ok) {
                fieldValid = false;
                missing.push(f.name + " — " + verdict.reason);
            }
        }

        let reason = "";
        if (fieldValid && f.isPassword) {
            const strength = evaluatePasswordStrength(val);
            if (!strength.isStrong) {
                fieldValid = false;
                missing.push(`${f.name} (must include uppercase, lowercase, number & symbol, or click 'Generate Strong Passkey')`);
                reason = "Use upper and lower case letters, a number and a symbol, or press Generate Strong Passkey.";
            }
        }

        if (!fieldValid && !f.isEmail && !f.isPassword) {
            missing.push(f.name);
        }
        // An empty box says so. (The email box keeps its own hint underneath,
        // from showEmailHint, and one refused above keeps that reason.)
        if (!fieldValid && !val) reason = el.tagName === "SELECT" ? "Please choose an option." : "Please fill in this field.";

        markFieldStatus(el, fieldValid, reason);
        if (!fieldValid) isValid = false;
    });

    // The parent or guardian's name and number are asked for, not required,
    // on both forms (2026-10-02, R19: every personal box but the few above is
    // optional). What is typed is still checked above: a real name, a number
    // the clinic can ring.

    return { isValid, missing };
}

// Step 2 Validation
function validateStep2() {
    let isValid = true;
    const missing = [];

    const allergyOther = document.getElementById("reg-allergy-others");
    if (allergyOther && allergyOther.value.trim()) {
        const val = allergyOther.value.trim();
        if (typeof looksMashed === "function" && looksMashed(val)) {
            isValid = false;
            missing.push("Other allergies: that does not look like a real answer.");
            markFieldStatus(allergyOther, false, "That does not look like a real answer.");
        } else {
            markFieldStatus(allergyOther, true);
        }
    }

    const conditionalChecks = [
        { pillId: "med-treatment", inputId: "med-treatment-details", name: "Medical Treatment Details" },
        { pillId: "med-illness", inputId: "med-illness-details", name: "Illness / Operation Details" },
        { pillId: "med-hospitalized", inputId: "med-hospitalized-details", name: "Hospitalization Details" },
        { pillId: "med-prescribed", inputId: "med-prescribed-details", name: "Prescribed Medicine List" }
    ];

    conditionalChecks.forEach(item => {
        if (getRadioPillValue(item.pillId) === 1) {
            const inputEl = document.getElementById(item.inputId);
            if (inputEl) {
                const val = inputEl.value.trim();
                // A dentist reads these before she picks up an instrument. An
                // answer of "asdasd" to "what are you being treated for?" is
                // worse than no answer at all, because it looks like one
                // (2026-09-19).
                const mashed = val && typeof looksMashed === "function" && looksMashed(val);
                const fieldValid = val !== "" && !mashed;
                markFieldStatus(inputEl, fieldValid, mashed
                    ? "That does not look like a real answer."
                    : "You answered Yes, so please give the details.");
                if (!fieldValid) {
                    isValid = false;
                    missing.push(mashed
                        ? item.name + ": that does not look like a real answer."
                        : item.name);
                }
            }
        } else {
            const inputEl = document.getElementById(item.inputId);
            if (inputEl) markFieldStatus(inputEl, true);
        }
    });

    return { isValid, missing };
}

// Step 3 Validation
function validateStep3() {
    let isValid = true;
    const missing = [];

    const consentAgree = document.getElementById("reg-consent-agree");
    // ── Signing later, on a staff record (2026-10-01) ──────────────────────
    // Left completely blank, the consent is collected later on Patient History
    // and the record is saved with consentPending. Once anything is started
    // (the box, the typed name or a mark on the pad) it must be finished: a
    // name with no agreement, or an agreement with no name, is not a consent.
    // The date is not required there; today's is used when it is blank.
    const staffRecord = typeof isStaffPatientIntake === "function" && isStaffPatientIntake();
    if (staffRecord && !staffConsentStarted()) {
        const card = consentAgree ? consentAgree.closest(".consent") : null;
        if (card) markFieldStatus(card, true);
        const privacyRow = document.getElementById("reg-privacy-agree-row");
        if (privacyRow) markFieldStatus(privacyRow, true);
        ["reg-signature", "reg-consent-date"].forEach(id => {
            const el = document.getElementById(id);
            if (el) markFieldStatus(el, true);
        });
        return { isValid: true, missing: [] };
    }

    // The markup is .consent (templates/booking.php). It was .consent-statement-card
    // before the BEM rename, and this selector was left behind — so the consent
    // box was named in the "missing" list but never actually highlighted, and
    // the scroll-to-first-error had nothing to find.
    const consentCard = consentAgree ? consentAgree.closest(".consent") : null;
    if (consentAgree && !consentAgree.checked) {
        isValid = false;
        missing.push("Clinical Consent Checkbox");
        if (consentCard) markFieldStatus(consentCard, false, "Tick the box to agree before registering.");
    } else if (consentCard) {
        markFieldStatus(consentCard, true);
    }

    // The Privacy Policy, beside the consent (2026-10-03, R22): required
    // online, and on the staff form whenever the consent is signed now.
    if (typeof requirePrivacyBox === "function" && !requirePrivacyBox("reg-privacy-agree")) {
        isValid = false;
        missing.push("Privacy Policy agreement");
    }

    const signatureInput = document.getElementById("reg-signature");
    if (signatureInput) {
        const val = signatureInput.value.trim();
        // The name somebody signs a consent form with IS a name, and it is the
        // one printed on the record card under the mark. It was the only name
        // field on the form with no check on it at all (2026-09-19).
        const verdict = !val
            ? { ok: false, reason: "Signature Over Printed Name" }
            : (typeof checkPersonNameAt === "function"
                ? checkPersonNameAt("reg-signature", val, "Signature")
                : { ok: true, reason: "" });
        markFieldStatus(signatureInput, verdict.ok, !val ? "Type your full name as your signature." : verdict.reason);
        if (!verdict.ok) {
            isValid = false;
            missing.push(verdict.reason);
        }
    }

    const dateInput = document.getElementById("reg-consent-date");
    if (dateInput && !staffRecord) {
        const val = dateInput.value;
        const fieldValid = val !== "";
        markFieldStatus(dateInput, fieldValid, "Please fill in the date.");
        if (!fieldValid) {
            isValid = false;
            missing.push("Consent Date");
        }
    }

    return { isValid, missing };
}

// Signup Wizard: Personal info to Medical Questionnaire
function goToRegisterStep2() {
    const { isValid, missing } = validateStep1();

    if (!isValid) {
        showToast(`Please complete required fields marked in red: ${missing.join(", ")}`, "warning");
        const firstError = document.querySelector("#register-step-1 .input-error");
        if (firstError) {
            firstError.scrollIntoView({ behavior: "smooth", block: "center" });
            firstError.focus();
        }
        return;
    }

    // Toggle female-only questions
    const gender = document.getElementById("reg-gender") ? document.getElementById("reg-gender").value : "";
    const femaleQuestions = document.getElementById("female-questions");
    if (femaleQuestions) {
        if (gender === "Female") {
            femaleQuestions.classList.remove("hidden");
        } else {
            femaleQuestions.classList.add("hidden");
            setRadioPill("med-pregnant", 0);
            setRadioPill("med-nursing", 0);
            setRadioPill("med-birth-control", 0);
        }
    }

    document.getElementById("register-step-1").classList.add("hidden");
    document.getElementById("register-step-2").classList.remove("hidden");
    document.getElementById("register-step-3").classList.add("hidden");
    updateBookingStepIndicator(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function goBackToRegisterStep1() {
    document.getElementById("register-step-2").classList.add("hidden");
    document.getElementById("register-step-3").classList.add("hidden");
    document.getElementById("register-step-1").classList.remove("hidden");
    updateBookingStepIndicator(1);
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function goToRegisterStep3() {
    const step1Check = validateStep1();
    if (!step1Check.isValid) {
        showToast("Please complete Step 1 required fields marked in red first.", "warning");
        goBackToRegisterStep1();
        return;
    }

    const { isValid, missing } = validateStep2();
    if (!isValid) {
        showToast(`Please specify details for highlighted items in red: ${missing.join(", ")}`, "warning");
        const firstError = document.querySelector("#register-step-2 .input-error");
        if (firstError) {
            firstError.scrollIntoView({ behavior: "smooth", block: "center" });
            firstError.focus();
        }
        return;
    }

    document.getElementById("register-step-1").classList.add("hidden");
    document.getElementById("register-step-2").classList.add("hidden");
    document.getElementById("register-step-3").classList.remove("hidden");
    updateBookingStepIndicator(3);
    window.scrollTo({ top: 0, behavior: "smooth" });

    // Initialize signature canvas after step 3 becomes visible
    setTimeout(function() {
        if (typeof initSignatureCanvas === "function") {
            initSignatureCanvas();
        }
    }, 150);
}

function goBackToRegisterStep2() {
    document.getElementById("register-step-3").classList.add("hidden");
    document.getElementById("register-step-1").classList.add("hidden");
    document.getElementById("register-step-2").classList.remove("hidden");
    updateBookingStepIndicator(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateBookingStepIndicator(stepNum) {
    for (let i = 1; i <= 3; i++) {
        const item = document.getElementById(`booking-step-pill-${i}`);
        if (item) {
            item.classList.remove("is-active", "is-done");
            if (i === stepNum) {
                item.classList.add("is-active");
            } else if (i < stepNum) {
                item.classList.add("is-done");
            }
        }
    }
    const intake = document.querySelector("#tab-staff-patient-registration:not(.hidden)");
    if (intake) {
        // The portal scrolls inside .main-content; keep each wizard heading in view.
        const content = intake.closest(".main-content");
        if (content) content.scrollTop = 0;
        const heading = document.querySelector("#register-step-" + stepNum + " .form-step__title");
        if (heading) {
            heading.tabIndex = -1;
            heading.focus({ preventScroll: true });
        }
    }
}

// Custom Radio Pill selectors
function setRadioPill(pillId, val) {
    const pill = document.getElementById(pillId);
    if (!pill) return;
    
    pill.querySelectorAll(".radio-pill-item").forEach(item => {
        if (parseInt(item.getAttribute("data-val")) === val) {
            item.classList.add("active");
        } else {
            item.classList.remove("active");
        }
    });
}

function getRadioPillValue(pillId) {
    const pill = document.getElementById(pillId);
    if (!pill) return 0;
    const active = pill.querySelector(".radio-pill-item.active");
    return active ? parseInt(active.getAttribute("data-val")) : 0;
}

// Custom Checkbox Cards selectors
function toggleCheckboxCard(el) {
    el.classList.toggle("checked");
    const checkbox = el.querySelector("input[type='checkbox']");
    if (checkbox) {
        checkbox.checked = el.classList.contains("checked");
    }
}

// Visibility details toggles
function showDetails(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove("hidden");
}

function hideDetails(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.add("hidden");
        const input = el.querySelector("input");
        if (input) {
            input.value = "";
            markFieldStatus(input, true);
        }
    }
}

// ─────────────────────────────────────────────────────────────
// Why every failed sign-in says the same thing
// ─────────────────────────────────────────────────────────────
//
// Firebase tells the truth, in detail, and that is the problem. Sign in with
// an address nobody has registered and it answers
//
//     "There is no user record corresponding to this identifier."
//
// Sign in with an address that IS registered, using the wrong password, and it
// answers
//
//     "The password is invalid or the user does not have a password."
//
// Two different answers. So anyone can sit at the login box, type an address,
// and learn from the reply whether that person is a patient of this clinic.
// Run a list of addresses and you have a patient list. Who someone's dentist is
// is medical information, and this clinic is small enough that the list is a
// short one.
//
// That is called account enumeration, and the fix is the whole of it: ONE
// message for every way a sign-in can fail on credentials. "Wrong email or
// password" tells the person who typed a typo everything useful, and tells the
// person fishing for patient names nothing at all.
//
// Do the server half too, in the Firebase console:
//     Authentication -> Settings -> Email enumeration protection -> ON
// which makes Firebase itself return the same auth/invalid-credential for both
// cases. This function does not depend on that being on, and should not — but
// with it off, the distinction is still visible in the network tab.
//
// The codes below that are NOT about credentials get their own message, because
// none of them reveals whether an account exists, and a person who cannot tell
// "wrong password" from "you are offline" will just keep retyping a password
// that was right the first time.
let failedSignIns = 0;

function describeSignInFailure(err) {
    const code = (err && err.code) ? err.code : "";

    if (code === "auth/too-many-requests") {
        return "Too many attempts. Please wait a few minutes and try again, " +
               "or reset your password.";
    }
    if (code === "auth/network-request-failed") {
        return "Could not reach the server. Check your internet connection " +
               "and try again.";
    }

    // Everything else — wrong password, no such account, a disabled account,
    // a malformed address, the newer catch-all invalid-credential — is one
    // message. A disabled account is deliberately in here: telling somebody
    // "that account is disabled" also tells them the account exists.
    let msg = "Wrong email, mobile number or password.";

    // Which is exactly the case a genuinely stuck person cannot get out of, so
    // after the third try they are pointed at the two things that do work.
    // This is also the graceful exit for a disabled account: she phones, and
    // the front desk can see what the app will not say.
    if (failedSignIns >= 3) {
        msg += " If you are sure these are right, use \"Forgot password\" " +
               "below, or call the clinic on 0923-618-3285.";
    }
    return msg;
}

// API Login Submission (Firebase Auth)
// ── "I agree to the Privacy Policy" at sign-in (2026-10-03, R22) ──────────
// Every sign-in, for every role, as on MyMedsPH: Sign in stays disabled until
// the box is ticked, and a short hint says why. A page without the box (the
// static build until the policy is approved) signs in exactly as before. A
// patient's agreement is saved on the portal (settlePrivacyAgreementAtSignIn
// in js/app.js), carried there in sessionStorage.
function updateLoginPrivacy() {
    const state = typeof privacyBoxState === "function" ? privacyBoxState("login-privacy") : "absent";
    const button = document.getElementById("login-submit");
    const hint = document.getElementById("login-privacy-hint");
    if (button) button.disabled = state === "unticked";
    if (hint) hint.hidden = state !== "unticked";
    const row = document.getElementById("login-privacy-row");
    if (row && state === "ticked") markFieldStatus(row, true);
}
// The browser may bring the page back from its cache with the box as it was.
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("pageshow", updateLoginPrivacy);
}

function submitLogin(e) {
    e.preventDefault();
    const emailEl = document.getElementById("login-email");
    const pwdEl = document.getElementById("login-password");
    // An email as typed, or the sign-in address built from a mobile number
    // (2026-10-01; signInAddressFor() in js/app.js). An unknown number and a
    // wrong password get the same answer as any other failed sign-in.
    const typed = emailEl ? emailEl.value.trim() : "";
    const email = typed && typeof signInAddressFor === "function" ? signInAddressFor(typed) : typed;
    const password = pwdEl ? pwdEl.value : "";

    if (!email || !password) {
        if (!email && emailEl) markFieldStatus(emailEl, false, "Enter your email or mobile number.");
        if (!password && pwdEl) markFieldStatus(pwdEl, false, "Enter your password.");
        const first = !email ? emailEl : pwdEl;
        if (first && typeof focusFieldOnce === "function") focusFieldOnce(first);
        return;
    }

    // The button waits for the box; Enter in a field must wait for it too.
    if (typeof requirePrivacyBox === "function" && !requirePrivacyBox("login-privacy")) {
        updateLoginPrivacy();
        return;
    }
    // Set before signing in: the sign-in may move this tab to the portal
    // before the promise below settles.
    const agreedToPrivacy = typeof privacyBoxState === "function" && privacyBoxState("login-privacy") === "ticked";
    if (agreedToPrivacy) {
        try { sessionStorage.setItem(PRIVACY_AGREED_KEY, new Date().toISOString()); } catch (err) { /* private mode */ }
    }

    auth.signInWithEmailAndPassword(email, password)
    .then(userCredential => {
        failedSignIns = 0;
        showToast("Logging in...", "success");
        document.getElementById("form-login").reset();
        updateLoginPrivacy();
    })
    .catch(err => {
        failedSignIns++;
        if (agreedToPrivacy) {
            try { sessionStorage.removeItem(PRIVACY_AGREED_KEY); } catch (e2) { /* nothing to clear */ }
        }

        // The real code goes to the console, where a developer can see it and
        // a stranger at the login box cannot.
        console.error("Sign-in failed:", (err && err.code) || err);

        // Both fields, never one. Highlighting only the password would say the
        // email was accepted — the same leak the message above avoids.
        markFieldStatus(emailEl, false);
        markFieldStatus(pwdEl, false);

        showToast(describeSignInFailure(err), "error");
    });
}

// ─────────────────────────────────────────────────────────────
// Why registration DOES admit that an address is already taken
// ─────────────────────────────────────────────────────────────
//
// The login box and the reset box both give one answer to everybody, because
// telling the two cases apart hands out a list of who is a patient here. This
// one is the deliberate exception, and it is worth writing down why rather than
// having somebody "fix" it later to match the other two.
//
// If a patient already has an account and we refuse to say so, she is stuck
// with "registration failed" and no idea what to do. She cannot make the
// account — Firebase will not allow two — and she does not know she already
// has one. That is the exact dead end this whole system is meant to keep her
// out of, and she will phone the clinic, which is the outcome we are paying to
// avoid. Hiding it protects a patient list a little; revealing it keeps a real
// patient moving. For a two-person clinic, the second is worth more.
//
// The honest accounting: this leaves the registration form as the one place a
// determined person can still test an address. It is a far poorer tool for it
// than the login box was — a three-step form with a consent signature at the
// end, not a box you can script through in a loop — but it is not nothing, and
// pretending otherwise would be worse than saying it plainly here.
//
// What is NOT acceptable either way is the raw Firebase text, which is how this
// read before: "Registration failed: The email address is already in use by
// another account." Developer English, in front of a patient, with no idea what
// to do next.
function describeRegistrationFailure(err, byMobile) {
    const code = (err && err.code) ? err.code : "";

    if (code === "auth/email-already-in-use" && byMobile) {
        return "That mobile number already has a DentCare account. Sign in with it, or ask the clinic.";
    }
    if (code === "auth/email-already-in-use") {
        return "That email address already has a DentCare account. Please sign " +
               "in instead, or use \"Forgot password\" if you cannot remember it.";
    }
    if (code === "auth/weak-password") {
        return "That password is too weak. Use at least 8 characters with an " +
               "uppercase letter, a number and a symbol — or tap \"Suggest a " +
               "strong passkey\".";
    }
    if (code === "auth/invalid-email") {
        return "That email address does not look right. Please check it and " +
               "try again.";
    }
    if (code === "auth/too-many-requests") {
        return "Too many attempts from this device. Please wait a few minutes " +
               "and try again, or call the clinic on 0923-618-3285.";
    }
    if (code === "auth/network-request-failed") {
        return "Could not reach the server. Check your internet connection and " +
               "try again — nothing has been saved yet.";
    }

    // Anything else is a fault on our side, not hers. Say so, and do not make
    // her decode a Firebase code to find that out.
    return "Sorry — we could not complete your registration. Nothing has been " +
           "saved. Please try again, or call the clinic on 0923-618-3285.";
}

// API Patient Registration Submission (Firebase Auth & Firestore)
// One registration at a time. A second press on a slow connection used to start
// a second createUser call, which failed with "email already in use" and showed
// an error on top of the registration that was, in fact, succeeding.
/**
 * The patient record as the registration form has it filled in: the
 * patients/{id} document, without the fields that belong to an online account.
 *
 * Shared by online registration (submitRegister below) and the record the
 * front desk makes (submitStaffPatientRecord in js/staff-patient-registration.js,
 * 2026-10-01), so the same form can never be saved two different ways.
 */
function readPatientProfileForm() {
    const getVal = (id) => {
        const el = document.getElementById(id);
        return el ? el.value.trim() : "";
    };

    const first_name = getVal("reg-first-name");
    const middle_name = getVal("reg-middle-name");
    const last_name = getVal("reg-last-name");
    const email = getVal("reg-email");
    // "YYYY-MM-DD", joined from the Month / Day / Year boxes; validateStep1
    // above has already refused anything incomplete or impossible.
    const date_of_birth = readRegisterDob().value;
    const gender = getVal("reg-gender");
    const phone_number = getVal("reg-phone");
    const address = getVal("reg-address");
    const emergency_contact = getVal("reg-emergency");

    const civil_status = getVal("reg-civil-status");
    const nationality = getVal("reg-nationality");
    const occupation = getVal("reg-occupation");
    const company = getVal("reg-company");
    const company_address = getVal("reg-company-address");
    const office_no = getVal("reg-office-no");
    const former_dentist = getVal("reg-former-dentist");

    const is_minor = document.getElementById("reg-is-minor") ? document.getElementById("reg-is-minor").checked : false;
    const parent_name = getVal("reg-parent-name");
    const parent_phone = getVal("reg-parent-phone");
    const referred_by = getVal("reg-referred-by");

    const good_health = getRadioPillValue("med-good-health");
    const under_medical_treatment = getRadioPillValue("med-treatment");
    const medical_treatment_details = getVal("med-treatment-details");
    const serious_illness_or_operation = getRadioPillValue("med-illness");
    const illness_or_operation_details = getVal("med-illness-details");
    const hospitalized = getRadioPillValue("med-hospitalized");
    const hospitalization_details = getVal("med-hospitalized-details");
    const prescribed_medicine = getRadioPillValue("med-prescribed");
    const prescribed_medicine_details = getVal("med-prescribed-details");
    const tobacco_use = getRadioPillValue("med-tobacco");
    const drugs_alcohol_use = getRadioPillValue("med-alcohol");

    const allergies = [];
    document.querySelectorAll("#reg-allergies-grid .checkbox-card.checked input").forEach(cb => {
        allergies.push(cb.value);
    });
    const allergy_others = getVal("reg-allergy-others");
    if (allergy_others) allergies.push(allergy_others);

    const conditions = [];
    document.querySelectorAll("#reg-conditions-grid .checkbox-card.checked input").forEach(cb => {
        conditions.push(cb.value);
    });
    const condition_others = getVal("reg-condition-others");
    if (condition_others) conditions.push(condition_others);

    const women_pregnant = getRadioPillValue("med-pregnant");
    const women_nursing = getRadioPillValue("med-nursing");
    const women_birth_control = getRadioPillValue("med-birth-control");

    const blood_type = getVal("reg-blood-type");
    const bleeding_time = getVal("reg-bleeding-time");
    const consent_agree = document.getElementById("reg-consent-agree") ? document.getElementById("reg-consent-agree").checked : true;
    const consent_signature = getVal("reg-signature");
    // The form offers a choice — draw it or type it — so both are kept. Typing
    // a name and drawing a mark are different things and a clinic may need
    // either, so neither is allowed to overwrite the other.
    const consent_signature_image =
        (typeof getSignatureDataUrl === "function") ? getSignatureDataUrl() : "";
    const consent_date = getVal("reg-consent-date");

    return {
        firstName: first_name,
        middleName: middle_name,
        lastName: last_name,
        dateOfBirth: date_of_birth,
        gender: gender,
        email: email,
        phoneNumber: phone_number,
        address: address,
        emergencyContact: emergency_contact,
        civilStatus: civil_status,
        nationality: nationality,
        occupation: occupation,
        company: company,
        companyAddress: company_address,
        officeNo: office_no,
        formerDentist: former_dentist,
        createdAt: new Date().toISOString(),
        minorInfo: {
            isMinor: is_minor,
            parentName: parent_name,
            parentPhone: parent_phone
        },
        referredBy: referred_by,
        medicalHistory: {
            goodHealth: good_health === 1,
            underMedicalTreatment: under_medical_treatment === 1,
            medicalTreatmentDetails: medical_treatment_details,
            seriousIllnessOrOperation: serious_illness_or_operation === 1,
            illness_or_operation_details: illness_or_operation_details,
            hospitalized: hospitalized === 1,
            hospitalization_details: hospitalization_details,
            prescribedMedicine: prescribed_medicine === 1,
            prescribed_medicine_details: prescribed_medicine_details,
            tobaccoUse: tobacco_use === 1,
            drugsAlcoholUse: drugs_alcohol_use === 1,
            allergies: allergies,
            womenPregnant: women_pregnant === 1,
            womenNursing: women_nursing === 1,
            womenBirthControl: women_birth_control === 1,
            conditionsChecklist: conditions,
            bleedingTime: bleeding_time,
            bloodType: blood_type,
            consentSignature: consent_signature,
            // Empty string when the pad was never drawn on, so a blank
            // canvas is never filed as though somebody signed it.
            consentSignatureImage: consent_signature_image,
            consentDate: consent_date
        },
        teethStatus: {},
    };
}

let registrationInFlight = false;

function submitRegister(e) {
    e.preventDefault();
    if (registrationInFlight) return;

    // The staff tab makes a patient record with no online account
    // (2026-10-01, client revision 16): js/staff-patient-registration.js.
    if (typeof isStaffPatientIntake === "function" && isStaffPatientIntake()) {
        return submitStaffPatientRecord(e);
    }
    if (typeof window !== "undefined" && window.DENTCARE_PAGE === "portal") return;

    // 1. Re-validate Step 1
    const step1Check = validateStep1();
    if (!step1Check.isValid) {
        goBackToRegisterStep1();
        showToast(`Please fix highlighted fields in Step 1: ${step1Check.missing.join(", ")}`, "warning");
        return;
    }

    // 2. Re-validate Step 2
    const step2Check = validateStep2();
    if (!step2Check.isValid) {
        goBackToRegisterStep2();
        showToast(`Please fix highlighted fields in Step 2: ${step2Check.missing.join(", ")}`, "warning");
        return;
    }

    // 3. Re-validate Step 3
    const step3Check = validateStep3();
    if (!step3Check.isValid) {
        showToast(`Please complete required fields marked in red: ${step3Check.missing.join(", ")}`, "warning");
        const firstError = document.querySelector("#register-step-3 .input-error");
        if (firstError) {
            firstError.scrollIntoView({ behavior: "smooth", block: "center" });
            firstError.focus();
        }
        return;
    }

    // Base details with null-safe element retrieval
    const getVal = (id) => {
        const el = document.getElementById(id);
        return el ? el.value.trim() : "";
    };

    const first_name = getVal("reg-first-name");
    const last_name = getVal("reg-last-name");
    const email = getVal("reg-email");
    const password = document.getElementById("reg-password") ? document.getElementById("reg-password").value : "";
    // ── No email: the mobile number is the login (2026-10-01) ──────────────
    // The mobile number is always asked for; the email is optional. With an
    // email, the email is the login, as before. Without one, the account
    // signs in with its number, through an address built from it that no
    // screen shows and no email is ever sent to (js/app.js, normaliseMobile).
    const signInPhone = !email && typeof normaliseMobile === "function"
        ? normaliseMobile(getVal("reg-phone")) : "";
    const loginAddress = email || (signInPhone ? signInPhone + "@" + PHONE_SIGN_IN_DOMAIN : "");
    if (!loginAddress) {
        goBackToRegisterStep1();
        showToast("Enter an email address, or a mobile number to sign in with (11 digits, like 0917 555 0101).", "warning");
        return;
    }
    // Everything else on the form: the same reader the staff record uses.
    const profile = readPatientProfileForm();
    // Ticked on step 3 (2026-10-03, R22); validateStep3 required it.
    if (typeof privacyBoxState === "function" && privacyBoxState("reg-privacy-agree") === "ticked") {
        const agreed = privacyAgreementFor("online");
        if (agreed) profile.privacyAccepted = agreed;
    }

    const registrationAuth = auth;
    const registrationDb = db;
    registrationInFlight = true;
    const regSubmitBtns = document.querySelectorAll("#form-register button[type='submit']");
    regSubmitBtns.forEach(button => { button.disabled = true; });

    showToast("Submitting registration...", "info");

    // Creating the account signs the patient in straight away, which would
    // normally bounce them to the portal. Hold that off until the profile
    // documents below have actually been written.
    setSuppressPortalRedirect(true);

    // Creating the account and writing its two documents cannot be one
    // atomic step: Firebase Auth and Firestore are separate services. So the
    // account can exist while its profile does not, and the catch below has to
    // tell those two failures apart.
    let accountCreated = false;
    // True once the profile batch has committed. The catch below also sees
    // errors thrown AFTER a successful save (a toast, a redirect), and a
    // registration that saved must never have its login deleted.
    let profileSaved = false;

    // Held at this scope, not inside the .then() below, because the walk-in
    // queue entry is written in a LATER link of the chain and needs it. A
    // const inside the first block is out of scope by then, and the failure is
    // a ReferenceError at the very end of a successful registration.
    let newUid = "";
    // The new Firebase user, so the confirmation email can be sent after the
    // profile is saved (2026-10-01).
    let newUser = null;

    // ── A walk-in registers on the CLINIC's tablet, not their own phone ──
    //
    // Found by the 2026-09-13 launch audit. Firebase keeps a sign-in for good
    // unless told otherwise, and this flow used to finish by opening the new
    // patient's portal. The tablet then went back to the desk still signed in
    // as that patient — and the next person to pick it up was sent straight
    // into their medical history, their appointments and their messages.
    //
    // So a walk-in session is tab-scoped from the start (SESSION persistence),
    // and it is ended outright once the queue entry is written — see the end
    // of the success branch below.
    const walkInIntake = typeof isWalkInIntake === "function" && isWalkInIntake();
    const persistence = walkInIntake
        ? firebase.auth.Auth.Persistence.SESSION
        : firebase.auth.Auth.Persistence.LOCAL;

    return registrationAuth.setPersistence(persistence)
    .then(() => registrationAuth.createUserWithEmailAndPassword(loginAddress, password))
    .then(userCredential => {
        accountCreated = true;
        const uid = userCredential.user.uid;
        newUid = uid;
        newUser = userCredential.user;
        
        // Both documents in ONE batch, so they are written together or not at
        // all (2026-09-13 launch audit). As two separate writes, the role
        // document could land while the profile was refused — leaving an
        // account that signs in to a patient portal with no patient behind it.
        const batch = registrationDb.batch();

        // 1. Create user role document
        batch.set(registrationDb.collection("users").doc(uid), {
            // The login: the email, or the address built from the number.
            email: loginAddress,
            role: "patient",
            name: `${first_name} ${last_name}`
        });

        // 2. Create patient profile document (matching Flutter Patient model format)
        batch.set(registrationDb.collection("patients").doc(uid), Object.assign(profile, {
            // ── Confirm the email (2026-10-01, the clinic's request) ──────
            // Only an account a patient makes ONLINE is asked to confirm its
            // email before it books or messages (firestore.rules,
            // emailConfirmedOrNotAsked). A walk-in on the clinic's tablet was
            // seen in person, so they are sent the email but not held back by
            // it. (The front desk no longer makes accounts here: it makes a
            // record, js/staff-patient-registration.js.)
            // An account that signs in with its mobile number has no email to
            // confirm, so it is not asked to.
            ...((walkInIntake || signInPhone) ? {} : { emailConfirmPending: true }),
            // The canonical number the account signs in with (639XXXXXXXXX).
            ...(signInPhone ? { signInPhone: signInPhone } : {})
        }));

        return batch.commit().then(() => {
            profileSaved = true;
            // The number is now on a record (2026-10-05); never waited on.
            if (typeof notePhoneOnFile === "function") notePhoneOnFile(getVal("reg-phone"));
        });
    })
    .then(() => {
        // Everyone is sent the confirmation link. Sending it can fail (a
        // network blip, a sending limit) and that must never undo or fail a
        // registration that has already been saved: the patient can ask for
        // the link again from the confirm screen.
        // No email to send to when the account signs in with its number.
        return signInPhone ? false : sendRegistrationConfirmEmail(newUser);
    })
    .then(() => {
        // A receptionist with the patient list already open would not see
        // this person for up to a minute otherwise, and would enter them a
        // second time thinking the first save had failed.
        refreshReference("patients");
        showToast("Registration completed successfully! Welcome to DentCare.", "success");
        
        document.getElementById("form-register").reset();
        document.querySelectorAll("#reg-allergies-grid .checkbox-card").forEach(card => card.classList.remove("checked"));
        document.querySelectorAll("#reg-conditions-grid .checkbox-card").forEach(card => card.classList.remove("checked"));

        if (typeof clearSignatureCanvas === "function") {
            clearSignatureCanvas();
        }

        goBackToRegisterStep1();

        // ── Walk-in: join today's queue straight away ────────────────────
        //
        // Only when the registration came in through the Walk-In door. A
        // patient registering from home is booking for later and must not be
        // dropped into today's waiting room.
        //
        // This runs AFTER the profile documents are written, so the queue
        // entry can never name a patient whose record does not exist yet.
        // Failure here is reported but does not block the redirect: the
        // account and the medical history are saved either way, and the front
        // desk can add them to the queue by hand. Losing a completed
        // registration over a queue write would be far worse.
        const joiningQueue = walkInIntake
            ? enqueuePatient({
                  patientId: newUid,
                  patientName: `${first_name} ${last_name}`,
                  isWalkIn: true
              })
              .then(() => {
                  showToast("Registered and added to today's queue. Please take a seat.", "success");
              })
              .catch(err => {
                  console.error("Walk-in queue entry failed:", err);
                  showToast("You are registered, but we could not add you to the queue. " +
                            "Please tell the front desk.", "warning");
              })
              .then(() => { clearWalkInIntake(); })
            : Promise.resolve();

        // The profile is saved and the patient is already signed in, so take
        // them to their dashboard. The short pause lets them read the toast.
        //
        // EXCEPT a walk-in. The device belongs to the clinic, so their session
        // ends here, whether or not the queue write worked, and the tablet goes
        // back to the public page for the next person. Their account is saved;
        // they can sign in on their own phone later.
        if (walkInIntake) {
            joiningQueue
                .then(() => auth.signOut())
                .catch(err => console.error("Could not sign the walk-in out:", err))
                .then(() => {
                    showToast("All set. Please hand the tablet back to the front desk.", "success");
                    setSuppressPortalRedirect(false);
                    setTimeout(() => {
                        window.location.replace("index.php");
                    }, 2500);
                });
            return;
        }

        setSuppressPortalRedirect(false);
        joiningQueue.then(() => {
            setTimeout(() => {
                window.location.replace("portal.php");
            }, 1200);
        });
    })
    .catch(err => {
        setSuppressPortalRedirect(false);
        console.error("Registration failed:", err);

        // Only a failed registration may be pressed again. A successful one
        // is navigating away and keeps its button locked.
        // Unlock only after failed-account cleanup has finished.

        if (!accountCreated) {
            // Nothing was created. Say so and let them try again.
            showToast(describeRegistrationFailure(err, !!signInPhone), "error");
            return;
        }

        if (profileSaved) {
            // Saved; something after the save failed. The registration stands.
            showToast("You are registered. If this page does not move on, please " +
                      "sign in.", "warning");
            return;
        }

        // The login exists but its profile does not.
        //
        // ── DELETE THE LOGIN, DON'T JUST SIGN OUT (2026-09-13 launch audit) ──
        // Signing out used to be the whole answer, with a message telling the
        // patient to "sign in and complete your profile" — but there is no screen
        // that completes a profile, and registering again said the email was
        // already in use. The patient was locked out of both doors for good.
        //
        // A login created seconds ago may delete itself without re-entering the
        // password, and nothing else has been saved (the profile is one batch),
        // so removing it puts everything back exactly as it was: the patient can
        // simply try again. Signing out stays as the fallback if deleting fails.
        const halfMade = registrationAuth.currentUser;
        const cleanup = halfMade
            ? halfMade.delete().then(() => true).catch(delErr => {
                  console.error("Could not remove the half-made login:", delErr);
                  return registrationAuth.signOut().catch(() => {}).then(() => false);
              })
            : Promise.resolve(false);

        return cleanup.then(removed => {
            showToast(removed
                ? "Sorry — your details did not save, so nothing was kept. Please try " +
                  "registering again, or call the clinic on 0923-618-3285."
                : "Your details did not save. Please call the clinic on 0923-618-3285 " +
                  "so we can finish your registration.", "error");
        });
    }).finally(() => {
        if (!profileSaved) {
            registrationInFlight = false;
            regSubmitBtns.forEach(button => { button.disabled = false; });
        }
    });
}

/**
 * Send Firebase's "verify your email" link to a just-registered account.
 * Never rejects: a failure is logged and the registration carries on.
 */
function sendRegistrationConfirmEmail(user) {
    if (!user || typeof user.sendEmailVerification !== "function") return Promise.resolve(false);
    return user.sendEmailVerification()
        .then(() => {
            try { window.sessionStorage.setItem("dentcare.confirmSentAt", String(Date.now())); } catch (e) { /* storage blocked */ }
            return true;
        })
        .catch(err => {
            console.warn("Could not send the confirmation email:", err);
            return false;
        });
}

// Log Out Action (Firebase Auth)
function performLogout() {
    auth.signOut()
    .then(() => {
        // Go straight back to the public page rather than waiting for the auth
        // listener, so the dashboard is never left on screen after signing out.
        window.location.replace("index.php");
    })
    .catch(() => {
        showToast("Logout failed. Please try again.", "error");
    });
}

// Toggle password field input type between password and text with matching eye icon
//
// Used by every password box: login, registration, and (since 2026-09-17) the
// four on Account Settings. aria-pressed and the label follow the state, so a
// screen reader says "Hide password" once it is showing rather than repeating
// the same words either way.
function togglePasswordVisibility(inputId, btnEl) {
    const input = document.getElementById(inputId);
    if (!input) return;

    const showing = input.type === "password";
    if (btnEl && btnEl.setAttribute) {
        btnEl.setAttribute("aria-pressed", showing ? "true" : "false");
        btnEl.setAttribute("aria-label", showing ? "Hide password" : "Show password");
    }

    if (showing) {
        input.type = "text";
        btnEl.innerHTML = `
            <svg class="eye-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                <line x1="1" y1="1" x2="23" y2="23"></line>
            </svg>
        `;
    } else {
        input.type = "password";
        btnEl.innerHTML = `
            <svg class="eye-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
            </svg>
        `;
    }
}

/**
 * Hide a password box again if somebody left it showing.
 *
 * Emptying a box is not enough on its own. If the eye was pressed before a
 * save, the box stays a plain text field, and the NEXT password typed into it
 * on the clinic's shared computer is shown on screen for anyone standing
 * behind the desk. Account Settings calls this whenever it clears its boxes.
 */
function hidePasswordAgain(inputId) {
    const input = document.getElementById(inputId);
    if (!input || input.type === "password") return;
    const container = input.parentNode;
    const btn = container && container.querySelector
        ? container.querySelector(".password-toggle-btn")
        : null;
    if (btn) {
        togglePasswordVisibility(inputId, btn);
    } else {
        input.type = "password";
    }
}

// Open Forgot Password Modal
function openForgotModal() {
    const modal = document.getElementById("modal-forgot");
    if (!modal) return;

    modal.classList.add("active");
    const titleEl = document.getElementById("forgot-modal-title");
    const pwdForm = document.getElementById("form-forgot-password");
    
    // Reset form and display states. The confirmation panel is hidden again
    // here, or a second visit opens straight onto "Check your email" with no
    // way to type a different address.
    pwdForm.reset();
    titleEl.textContent = "Forgot Password";
    pwdForm.classList.remove("hidden");

    const sent = document.getElementById("forgot-sent");
    if (sent) sent.classList.add("hidden");

    const hint = document.getElementById("forgot-pwd-email-hint");
    if (hint) hint.className = "email-hint hidden";

    // ── CARRY THE ADDRESS ACROSS ──────────────────────────────────────────
    //
    // "Forgot Password?" is a link inside the login form, so by the time it is
    // clicked she has almost always typed her address already. Asking for it a
    // second time, in a box that opens empty, is not just an annoyance:
    //
    //   * it is a second chance to mistype it, and a typo here is the one this
    //     app can never tell her about afterwards — the reply is deliberately
    //     identical whether or not anything was sent;
    //   * retyping is where a patient who is already flustered about being
    //     locked out gives up and phones instead.
    //
    // So it is prefilled from whatever she last typed, and checked immediately,
    // which means a typo she made at the login box gets caught HERE — the first
    // moment anything in the app has had reason to look at it.
    const source = document.getElementById("login-email")
                || document.getElementById("reg-email");
    const emailEl = document.getElementById("forgot-pwd-email");

    if (emailEl && source && source.value && source.value.trim()) {
        emailEl.value = source.value.trim();
        // A mobile number is not checked as an email (2026-10-01).
        if (emailEl.value.indexOf("@") !== -1) checkEmailFieldLive("forgot-pwd-email");
    }
    const note = document.getElementById("forgot-mobile-note");
    if (note) note.hidden = true;
}

// Close Forgot Modal
function closeForgotModal() {
    const modal = document.getElementById("modal-forgot");
    if (modal) modal.classList.remove("active");
}

/**
 * Swap the reset form for the "now go and look for it" panel.
 *
 * The sender address is read from firebaseConfig rather than typed into the
 * markup, so it cannot quietly stop matching the project the app signs in
 * against. Firebase sends these from noreply@<authDomain> unless custom SMTP is
 * configured — if the clinic ever sets that up, this line is the one to change,
 * because telling a patient to look for the wrong sender is worse than telling
 * her nothing.
 */
function showForgotSentPanel() {
    const form = document.getElementById("form-forgot-password");
    const sent = document.getElementById("forgot-sent");
    const title = document.getElementById("forgot-modal-title");
    const sender = document.getElementById("forgot-sender-address");

    if (sender) {
        const domain = (typeof firebaseConfig === "object" && firebaseConfig.authDomain)
            ? firebaseConfig.authDomain
            : "";
        // textContent, not innerHTML — this is config, but the habit is the
        // point. Falls back to the wording already in the markup if the config
        // is missing, rather than showing "noreply@".
        if (domain) sender.textContent = "noreply@" + domain;
    }

    if (title) title.textContent = "Check your email";
    if (form) form.classList.add("hidden");
    if (sent) sent.classList.remove("hidden");
}

// Submit Forgot Password (Firebase password reset email)
// ─────────────────────────────────────────────────────────────
// Forgot password
// ─────────────────────────────────────────────────────────────
//
// Three decisions, and they pull against each other.
//
// 1. THE ANSWER IS ALWAYS THE SAME. sendPasswordResetEmail() throws
//    auth/user-not-found for an address nobody registered, and the old code
//    toasted that straight to the screen — so the forgot-password box was a
//    second way to ask "is this person a patient here?", exactly like the login
//    box was. It now says the same sentence whether or not anything was sent.
//
// 2. WHICH LEAVES A REAL PATIENT WITH NO FEEDBACK. If she mistypes her address,
//    "if that address is registered, a link is on its way" is indistinguishable
//    from success, and she will sit waiting for an email that was never sent to
//    anybody. That is unacceptable for this clinic's patients, so the typo is
//    caught BEFORE sending, by the same checker registration uses — this is the
//    one moment where "Did you mean maria@gmail.com?" earns its keep. What the
//    app cannot tell her afterwards, it tells her before.
//
// 3. AND SHE IS TOLD WHAT TO DO WHEN NOTHING ARRIVES. Check spam, then phone.
//    In a two-person clinic the phone genuinely works, and a patient who knows
//    to call is not a patient who is locked out.
//
// The cooldown is not rate limiting — Firebase does that server-side. It stops
// an anxious patient pressing Send four times and filling her own inbox, and it
// stops anyone using this form to pester somebody else's.
let forgotCooldownUntil = 0;

/** What Forgot Password says for a mobile number (2026-10-01). */
const FORGOT_MOBILE_MESSAGE = "An account that signs in with a mobile number cannot get a reset link. " +
    "Call or text the clinic on 0923-618-3285, or ask at the desk, and the staff will give you a " +
    "new temporary password.";

function submitForgotPassword(e) {
    e.preventDefault();

    const el = document.getElementById("forgot-pwd-email");
    if (!el) return;

    const email = el.value.trim();
    if (!email) {
        markFieldStatus(el, false, "Enter your email address.");
        if (typeof focusFieldOnce === "function") focusFieldOnce(el);
        return;
    }

    // ── A mobile number has no reset link (2026-10-01) ────────────────────
    // There is no inbox behind an account that signs in with its number, and
    // texting a code needs the paid plan. So the patient is told how the
    // clinic resets it. The same words for every number, registered or not.
    const mobileNote = document.getElementById("forgot-mobile-note");
    if (email.indexOf("@") === -1) {
        if (mobileNote) {
            mobileNote.textContent = FORGOT_MOBILE_MESSAGE;
            mobileNote.hidden = false;
        } else {
            showToast(FORGOT_MOBILE_MESSAGE, "info");
        }
        return;
    }
    if (mobileNote) mobileNote.hidden = true;

    // Point 2. A hard error stops here; a suspected typo only advises, same as
    // registration — she may well be right and the app wrong.
    const verdict = checkEmailAddress(email);
    showEmailHint(el, verdict);
    if (!verdict.ok) {
        markFieldStatus(el, false);
        showToast(verdict.reason, "warning");
        return;
    }

    const now = Date.now();
    if (now < forgotCooldownUntil) {
        const wait = Math.ceil((forgotCooldownUntil - now) / 1000);
        showToast("A reset link was just sent. Please check your email, " +
                  "including the spam folder, and wait " + wait +
                  " seconds before asking for another.", "warning");
        return;
    }
    forgotCooldownUntil = now + 60000;

    // Point 1. Said regardless of how the call resolves, so that neither the
    // wording nor the timing gives the answer away.
    //
    // It swaps the form for the confirmation panel instead of closing the
    // modal. The reset email cannot be customised — Firebase's console refuses
    // template edits on this project — so it arrives from
    // noreply@dentcare-nijims.firebaseapp.com with Firebase's own wording, and
    // a patient who has been taught not to trust strange senders is right to
    // hesitate. The one place we CAN set her expectation is here, before she
    // goes looking. A toast cannot do that job: it is gone in four seconds and
    // she needs this while she is hunting through a spam folder.
    const sameAnswerEitherWay = () => {
        showForgotSentPanel();
        showToast("Check your email, including spam.", "success");
    };

    auth.sendPasswordResetEmail(email)
    .then(sameAnswerEitherWay)
    .catch(err => {
        const code = (err && err.code) ? err.code : "";
        console.error("Password reset failed:", code || err);

        // Only failures that are about the REQUEST, not about the account, get
        // their own message. auth/user-not-found deliberately falls through to
        // the same sentence as success.
        if (code === "auth/too-many-requests") {
            forgotCooldownUntil = Date.now() + 300000;
            showToast("Too many reset requests. Please wait a few minutes, " +
                      "or call the clinic on 0923-618-3285.", "warning");
            return;
        }
        if (code === "auth/network-request-failed") {
            forgotCooldownUntil = 0;   // Nothing was sent; let her retry now.
            showToast("Could not reach the server. Check your internet " +
                      "connection and try again.", "error");
            return;
        }

        sameAnswerEitherWay();
    });
}
