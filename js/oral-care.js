// ─────────────────────────────────────────────────────────────
// DentCare – js/oral-care.js (Oral health flash tips)
// ─────────────────────────────────────────────────────────────
//
// The short rotating tips that appear above the patient's dashboard. The
// educational content itself — the routine, the techniques, the product
// guidance — is static markup in templates/tab_patient_guides.php and needs
// no JavaScript at all.
//
// Content is adapted from research sourced to the ADA (MouthHealthy), CDC,
// Cleveland Clinic and Colgate. Nothing here is personalised clinical advice
// and it must never read as if it is: the copy is deliberately encouraging
// rather than shaming, because the research is explicit that guilt-based
// messaging lowers compliance rather than raising it.
//
// ── WHAT USED TO BE HERE, AND WHY IT IS GONE ─────────────────────────────
//
// This module also held daily brushing reminders (a scheduler, browser
// notifications, permission handling) and a 90-day toothbrush replacement
// tracker. Both were removed on 2026-08-30: they are moving to the Flutter
// mobile app.
//
// That is the right call, and it fixes the module's real weakness rather than
// relocating it. A brushing reminder has to reach somebody who is NOT looking
// at anything. Without a service worker this could only fire while the portal
// sat open in a browser tab — which is not when anyone brushes their teeth.
// The phone can do it properly; a web page in this project cannot.
//
// Removed with it: the Firestore read/write of `patients/{uid}.oralCare`.
// Nothing on the web side reads those settings any more. THE STORED FIELD IS
// LEFT ALONE — it is not deleted, and any values already saved stay on the
// patient document for the mobile app to pick up.
//
// What survives needs no account data at all: the tips are a fixed library and
// the rotation state is per-device, so this module no longer touches Firestore.
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// Tunables
// ─────────────────────────────────────────────────────────────

// Flash tips are a quick dismissible line, like a loading-screen tip in a
// game. The research note is blunt that the failure mode here is
// over-delivery — one on every screen reads as spam and gets tuned out within
// a day. So a tip has to clear BOTH gates: at most one per browser session,
// and at least this long since the last one on this device.
const FLASH_TIP_COOLDOWN_MS = 6 * 60 * 60 * 1000;   // 6 hours

// How many recently-shown tips to remember, so the rotation cannot hand back
// something the patient just read. Kept below the pool size or there would be
// nothing left to choose from.
const FLASH_TIP_HISTORY = 6;

// Shown under every piece of guidance in this module, without exception.
const ORAL_CARE_DISCLAIMER =
    "General oral care guidance — always follow your dentist's personal recommendations.";

// ─────────────────────────────────────────────────────────────
// The tip library
// ─────────────────────────────────────────────────────────────
//
// Short-form copy, push-notification length, taken from the research notes.
// Each carries a stable `id` — the rotation history stores ids, so reordering
// or editing the text of a tip must not change its id or the "don't repeat
// this one" memory silently points at the wrong line.
//
// `category` is unused by the rotation today and is here on purpose: the
// research suggests surfacing tips based on what a patient logs or skips, and
// that becomes possible without re-tagging the whole library later.

const ORAL_CARE_TIPS = [
    { id: "two-minutes", category: "brushing",
      text: "Brushing twice a day for 2 full minutes removes significantly more plaque than a quick pass — try timing yourself tonight." },
    { id: "forty-five", category: "brushing",
      text: "Hold your brush at a 45° angle to your gums for the most effective clean." },
    { id: "swap-brush", category: "product-care",
      text: "It's time to swap your toothbrush if the bristles look frayed — every 3–4 months is the rule of thumb." },
    { id: "floss-reach", category: "flossing",
      text: "Floss reaches the tooth surface your brush can't. One pass a day makes a big difference." },
    { id: "curve-not-snap", category: "flossing",
      text: "Curve, don't snap — gentle C-shaped strokes protect your gums while flossing." },
    { id: "rinse-is-bonus", category: "mouthwash",
      text: "Mouthwash is a bonus step, not a substitute for brushing and flossing." },
    { id: "spit-dont-rinse", category: "routine",
      text: "Spit, don't rinse — skipping the water rinse after brushing lets fluoride keep protecting your teeth longer." },
    { id: "tongue", category: "brushing",
      text: "Don't forget your tongue — it's a hiding spot for the bacteria behind bad breath." },
    { id: "mirror", category: "flossing",
      text: "Struggling to floss? Try flossing in front of a mirror so you can see exactly where to go." },
    { id: "fluoride", category: "product-care",
      text: "Fluoride toothpaste is the single most proven tool against cavities — check the label for the ADA Seal of Acceptance." }
];

// ─────────────────────────────────────────────────────────────
// Per-device bookkeeping (localStorage)
// ─────────────────────────────────────────────────────────────
//
// Which tips this BROWSER has recently shown. Deliberately not stored on the
// patient's account: it is a property of the device, not the person, and
// sharing it would mean reading a tip on a phone silently suppressing it on
// the laptop the patient is actually looking at.
//
// Wrapped in try/catch throughout. localStorage throws rather than returning
// null in a private window and when a browser is set to block site data, and
// an exception here would take down whatever called it. A patient with storage
// blocked should get slightly repetitive tips, not a broken page.

function ocStoreKey(name) {
    return "dentcare.oralcare." + name + "." + (currentUserId || "anon");
}

function ocGetLocal(name) {
    try {
        return window.localStorage.getItem(ocStoreKey(name));
    } catch (err) {
        return null;
    }
}

function ocSetLocal(name, value) {
    try {
        window.localStorage.setItem(ocStoreKey(name), value);
    } catch (err) {
        /* Storage unavailable — tips may repeat. Better than throwing. */
    }
}

// ─────────────────────────────────────────────────────────────
// Rotation
// ─────────────────────────────────────────────────────────────

/** The ids shown recently on this device, oldest first. */
function ocRecentTipIds() {
    try {
        const raw = ocGetLocal("recent-tips");
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        return [];
    }
}

function ocRememberTip(id) {
    const recent = ocRecentTipIds();
    recent.push(id);
    while (recent.length > FLASH_TIP_HISTORY) recent.shift();
    ocSetLocal("recent-tips", JSON.stringify(recent));
}

/**
 * Pick a tip the patient has not just seen.
 *
 * Falls back to the whole pool if the history has somehow swallowed all of it,
 * so this can never return undefined and blank the banner.
 */
function ocPickTip() {
    const recent = ocRecentTipIds();
    let pool = ORAL_CARE_TIPS.filter(tip => recent.indexOf(tip.id) === -1);
    if (!pool.length) pool = ORAL_CARE_TIPS;

    return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Whether a flash tip is allowed to appear right now.
 *
 * Both gates have to pass. The session gate stops a tip reappearing every time
 * the patient moves between tabs; the cooldown stops it reappearing every time
 * they open the portal during the day. Either alone leaves an obvious way for
 * the tips to become wallpaper, which the research is explicit is how a
 * feature like this dies.
 */
function ocFlashTipAllowed() {
    try {
        if (window.sessionStorage.getItem("dentcare.oralcare.tipShown")) return false;
    } catch (err) {
        /* sessionStorage blocked — fall through to the cooldown alone. */
    }

    const lastAt = Number(ocGetLocal("last-tip-at") || 0);
    if (lastAt && (Date.now() - lastAt) < FLASH_TIP_COOLDOWN_MS) return false;

    return true;
}

function ocMarkTipShown() {
    try {
        window.sessionStorage.setItem("dentcare.oralcare.tipShown", "1");
    } catch (err) {
        /* Nothing to do — the cooldown below still applies. */
    }
    ocSetLocal("last-tip-at", String(Date.now()));
}

// ─────────────────────────────────────────────────────────────
// The banner
// ─────────────────────────────────────────────────────────────

/**
 * Show one flash tip above the patient's dashboard, if the gates allow it.
 *
 * The banner is added to the shared column that holds every patient tab, not
 * to one tab's markup, so it stays put while the patient moves around instead
 * of being torn down and rebuilt — which would make the same tip look like a
 * new one each time.
 */
function showFlashTip() {
    const host = document.querySelector("#patient-layout .main-content");
    if (!host) return;
    if (document.getElementById("oc-flash-tip")) return;   // already on screen
    if (!ocFlashTipAllowed()) return;

    const tip = ocPickTip();
    if (!tip) return;

    const banner = document.createElement("div");
    banner.id = "oc-flash-tip";
    banner.className = "oc-flash";
    banner.setAttribute("role", "status");
    banner.innerHTML =
        '<svg class="icon oc-flash__icon" aria-hidden="true"><use href="#ic-bulb"></use></svg>' +
        '<p class="oc-flash__text">' + escapeHtml(tip.text) + '</p>' +
        '<button type="button" class="oc-flash__close" aria-label="Dismiss tip" ' +
                'onclick="dismissFlashTip()">&times;</button>';

    host.insertBefore(banner, host.firstChild);

    ocRememberTip(tip.id);
    ocMarkTipShown();
}

function dismissFlashTip() {
    const banner = document.getElementById("oc-flash-tip");
    if (banner) banner.remove();
}

// ─────────────────────────────────────────────────────────────
// Entry point, called from js/app.js
// ─────────────────────────────────────────────────────────────

/**
 * Set the module up for a patient who has just signed in.
 *
 * Now a single call. It used to load the patient's reminder settings from
 * Firestore first and start a scheduler; with reminders gone there is nothing
 * to fetch, so the tip appears immediately instead of after a round trip.
 */
function initOralCare() {
    showFlashTip();
    armOrderReveal();
}

// ─────────────────────────────────────────────────────────────
// Floss → Brush → Mouthwash, revealed in order
// ─────────────────────────────────────────────────────────────

/**
 * Reveal the routine's three cards one after another the first time the
 * patient sees them (css/oral-care.css, "The sequence reveal").
 *
 * Added 2026-09-14 with the restored step cards. The order is the lesson, so
 * the cards arrive in that order: Floss, its arrow, Brush, its arrow, then
 * Mouthwash. Motion that shows the sequence, played once.
 *
 * Nothing is hidden unless this runs: the CSS only starts the cards invisible
 * under .oc-order--armed, which is added here, and only when the browser can
 * tell us the section is on screen and the patient has not asked for less
 * motion. The Guides tab is display:none until opened, and IntersectionObserver
 * reports it as visible at the moment the tab is shown, which is exactly when
 * the reveal should play.
 */
function armOrderReveal() {
    const order = document.querySelector(".oc-order");
    if (!order || order.dataset.armed) return;
    order.dataset.armed = "1";

    const wantsLessMotion = window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (wantsLessMotion || typeof IntersectionObserver !== "function") return;

    order.classList.add("oc-order--armed");

    const reveal = () => {
        order.classList.add("is-in");
        // After the last card lands, let hover lifts respond without the
        // stagger delay still attached to them.
        setTimeout(() => order.classList.add("is-settled"), 1200);
    };

    const observer = new IntersectionObserver(entries => {
        if (!entries.some(e => e.isIntersecting)) return;
        observer.disconnect();
        reveal();
    }, { threshold: 0.25 });
    observer.observe(order);
}
