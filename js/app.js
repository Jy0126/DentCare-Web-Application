// ─────────────────────────────────────────────────────────────
// DentCare – js/app.js (Global App State & Router Engine)
// ─────────────────────────────────────────────────────────────

// Firebase Configuration (Matching mobile / Web options)
//
// ── THE apiKey BELOW IS NOT A SECRET, AND HIDING IT PROTECTS NOTHING ───────
//
// This is the single most misunderstood line in the project, so it is worth
// being blunt about: a Firebase Web API key is an identifier, not a password.
// It says which project a request is for. It grants nothing.
//
// It cannot be hidden either. The browser has to have it to reach Firebase at
// all, so it is in the page source of every Firebase app ever shipped, and it
// is in build/web/ and android/app/google-services.json in this repo as well.
// Moving it to a .env, a PHP constant or a "config server" only moves it —
// the browser still downloads it, and anyone can read it in devtools in about
// four seconds. Effort spent hiding it is effort not spent on the thing that
// actually holds the door.
//
// What actually stops somebody who has this key from reading the clinic's
// patient records is, in order:
//
//   1. firestore.rules and storage.rules. Every read and write is checked
//      against the signed-in account. Without a sign-in the key opens nothing;
//      with one it opens only that person's own rows. THIS IS THE LOCK.
//   2. Firebase Auth. The key does not sign anybody in.
//   3. App Check (below). Ties requests to this app rather than to a script
//      somebody wrote with the key pasted into it.
//   4. Authorized domains, in the console, which is what stops the key being
//      used from a page that is not ours.
//
// The keys that ARE secret are the service-account JSON and any Admin SDK
// credential — those bypass rules entirely. None of those are in this repo and
// none must ever be. .gitignore already covers .env for that reason.
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBJnMKpozBy675YvkOjhQZEIq_FZHKwcAM",
  authDomain: "dentcare-nijims.firebaseapp.com",
  projectId: "dentcare-nijims",
  storageBucket: "dentcare-nijims.firebasestorage.app",
  messagingSenderId: "1031133662362",
  appId: "1:1031133662362:web:280da404470c4702ce2323",
  measurementId: "G-7E6H44NY9G"
};

// Initialize Firebase App
firebase.initializeApp(firebaseConfig);

// ─────────────────────────────────────────────────────────────
// App Check — this project's answer to rate limiting
// ─────────────────────────────────────────────────────────────
//
// There is no Express server here, so there is no express-rate-limit and
// nowhere to put it. Requests go from the browser straight to Google. The
// equivalent controls are three, and none of them live in this file's logic:
//
//   • Brute force on sign-in — Firebase Auth already throttles repeated failed
//     password attempts per account and per IP, and locks out temporarily. It
//     is on by default and cannot be turned off. This is the /login limiter.
//   • Automated abuse of the database — App Check, below. It attests that a
//     request came from this actual site, so a script holding the API key and
//     a stolen password still cannot hammer Firestore from a server somewhere.
//   • Ceilings — App Check plus a budget alert. The free tier is a fixed quota,
//     and exhausting it is a denial of service against the clinic.
//
// ── THIS IS INERT UNTIL THE SITE KEY IS FILLED IN ──────────────────────────
//
// Left empty on purpose. Registering the site in the console gives you a
// reCAPTCHA v3 site key; paste it here, then turn on enforcement for Firestore
// and Storage. Doing it the other way round — enforcing first — locks the
// clinic out of its own database, so the order matters. SECURITY.md has the
// steps.
//
// A site key is public, exactly like the apiKey above. It goes in this file.
const APP_CHECK_SITE_KEY = "6LfIIcUtAAAAADoxokkUg5rPVEu7SPihhMcQzADG";

// ── IS THIS DEVICE AT THE CLINIC? (2026-09-18, clinic request) ─────────────
//
// Walk-in registration puts the patient straight into today's queue. Done on
// the clinic's tablet at the desk that is exactly right, and it is what the
// button is for. Opened at home it is wrong: the queue fills up with people
// who are not in the waiting room, and the front desk cannot tell.
//
// So before walk-in registration starts, the browser is asked where it is
// (checkAtClinic() in js/queue.js).
//
// ── WHAT THIS IS WORTH, AND WHAT IT IS NOT ────────────────────────────────
//
// It needs no paid service and no API key: every browser has had a location
// feature for years, and the distance is ten lines of arithmetic. What it
// CANNOT be is proof that somebody is here. A browser reports its own
// position, and anybody willing to open the developer tools can make it report
// this doorstep from anywhere on earth. Nothing running in a browser can do
// better, and neither can a phone app. Treat it as a guard against an honest
// mistake, not as attendance.
//
// Since 2026-09-25 (owner decision) a device that gives NO usable location is
// stopped too, instead of let through: switching location off was the easy
// way past the check. The patient is sent to the booking form or the desk;
// see checkAtClinic() in js/queue.js.
//
// ── OFF UNTIL THE COORDINATES ARE FILLED IN ───────────────────────────────
//
// lat and lng are null on purpose. A wrong coordinate here would turn away
// patients standing at the desk, which is far worse than a patient queueing
// early from home. Get them from Google Maps (right-click the clinic, click
// the numbers) and see docs/DEPLOY-WEB-APP.md, Part E6, which also says how to
// switch it off again in a hurry.
//
//   radiusM       how far from that point still counts as "here". 300 m covers
//                 a mall unit and its car park without covering the next block.
//   maxAccuracyM  a reading vaguer than this is not used to turn anybody away.
//                 Indoors, a phone can be tens of metres out.
const CLINIC_GEOFENCE = {
    // The clinic's own pin in Google Maps, read off the right-click menu on
    // 2026-09-18: Dr. Reina Gapit-Perez, Ramada Centrum, Naga City.
    // Latitude first, longitude second, exactly as Maps prints them.
    lat: 13.626340,
    lng: 123.186532,
    radiusM: 300,
    // How vague a reading may be and still be trusted to TURN SOMEBODY AWAY.
    //
    // Raised from 200m to 2000m on 2026-09-19, because at 200m a desktop was
    // waved straight through: a PC has no GPS and positions itself from Wi-Fi,
    // which is typically several hundred metres out, so every reading was
    // "too vague to judge" and every reading therefore passed. A phone, which
    // has GPS and reports 5-50m, was being checked properly all along.
    //
    // Raising it is safer than it sounds, because the reading's own margin of
    // error is already subtracted in the patient's favour further down
    // (checkAtClinic in js/queue.js): somebody 5km away with a 2km margin is
    // still 3km away and is turned away, while somebody at the desk with the
    // same 2km margin is well inside and is let through. What this number
    // really guards against is a reading so hopeless -- pure IP lookup, tens
    // of kilometres out, sometimes plain wrong -- that it should not be
    // allowed to refuse anybody.
    maxAccuracyM: 2000
};

function activateAppCheck() {
    if (!APP_CHECK_SITE_KEY) {
        // Said once, quietly, in the console. Not a toast: an unconfigured
        // App Check is a to-do for whoever deploys, not something a patient at
        // the front desk can act on.
        console.info(
            "App Check is not configured — APP_CHECK_SITE_KEY is empty in js/app.js. " +
            "The rules files are still enforcing; this is the extra layer that keeps " +
            "scripted traffic off the project. See SECURITY.md."
        );
        return;
    }
    if (typeof firebase.appCheck !== "function") {
        console.warn("App Check SDK did not load — check the script tag in templates/partials/page-head.php.");
        return;
    }
    try {
        firebase.appCheck().activate(
            new firebase.appCheck.ReCaptchaEnterpriseProvider(APP_CHECK_SITE_KEY),
            // Refresh tokens automatically. Without this the token expires
            // mid-session and every request starts failing while the user is
            // still signed in, which is indistinguishable from a rules bug.
            true
        );
    } catch (err) {
        // Never fatal. A failure here must not be able to take the clinic
        // offline — the rules files are the guard, and they are unaffected.
        console.error("App Check failed to activate:", err);
    }
}

activateAppCheck();

const db = firebase.firestore();
const auth = firebase.auth();

/**
 * Role spellings the app will accept.
 *
 * The role is compared trimmed and lower-cased. A users document holding
 * "Staff", " staff" or "receptionist" used to match none of the branches in
 * routeToRoleDashboard() and get signed straight back out, which looks exactly
 * like a wrong password — so the spelling is forgiven here instead of costing
 * somebody their login.
 */
const ROLE_ALIASES = {
    "patient": "patient",
    "dentist": "dentist",
    "doctor": "dentist",
    "staff": "staff",
    "receptionist": "staff",
    "front desk": "staff",
    "secretary": "staff",
    "admin": "admin",
    "administrator": "admin",
    "owner": "admin"
};

function normaliseRole(raw) {
    return ROLE_ALIASES[String(raw == null ? "" : raw).trim().toLowerCase()] || "";
}

/**
 * Say why a sign-in could not finish, and leave the user signed in.
 *
 * Signing them out here was the bug: it threw away the only screen that could
 * explain the problem and dropped them back at a login form that looked like
 * it had silently refused them. Whatever is wrong is something a person has to
 * read and fix, so it has to stay on screen.
 */
function signInProblem(headline, detail) {
    console.error("Sign-in problem:", headline, detail);

    const gate = document.getElementById("portal-gate");
    if (gate) {
        // Escaped, even though both arguments are written by this file today.
        //
        // One caller already interpolates a value that came out of the
        // database — the role string, at the bottom of routeToRoleDashboard()
        // — and another interpolates a Firebase error message. Neither can
        // carry markup right now, because the rules pin a self-registered role
        // to case-variants of 'patient'. That is a property of a rule in a
        // different file, not of this line, and it is exactly the kind of
        // distance that turns into a hole when somebody adds a third caller.
        gate.innerHTML =
            '<div class="portal-gate__inner" style="max-width:460px;text-align:center;">' +
                '<img src="images/logo-160.png" alt="" class="portal-gate__logo" width="64" height="64">' +
                '<h3 style="margin:0;">' + escapeHtml(headline) + '</h3>' +
                '<p class="portal-gate__text" style="white-space:pre-line;text-align:left;">' + escapeHtml(detail) + '</p>' +
                '<button onclick="performLogout()">Back to sign in</button>' +
            '</div>';
        return;
    }
    if (typeof showToast === "function") showToast(headline + " " + detail, "error");
}

// Global state variables
let currentUser = "";
let currentRole = "";
// The role exactly as stored, so an error message can quote it back.
let currentRoleRaw = "";
let currentEmail = "";
let currentUserId = "";

// ─────────────────────────────────────────────────────────────
// Reference data, fetched once instead of on every tab click
// ─────────────────────────────────────────────────────────────
//
// Three collections get read over and over: patients, dentists and treatments.
// Every screen that lists anything needs them to turn an id into a name, so
// before this cache, clicking Appointments then Billing then back downloaded
// every patient in the clinic three times. On the clinic's connection that is
// what made the dashboard feel slow — not the rendering, the round trips.
//
// They are cached because they are REFERENCE data: a patient list changes when
// somebody registers, not several times a minute. Appointments and billing are
// deliberately NOT cached — those are the live working data, and showing a
// stale bill at the counter would be worse than a slow one.
//
// Staleness is bounded two ways:
//   - anything this browser changes calls refreshReference() straight away
//   - anything another machine changes is picked up within REFERENCE_TTL_MS
//
// So the worst case is a receptionist seeing a patient another receptionist
// registered up to a minute ago. Making that window shorter costs round trips;
// making it longer risks someone booking against a patient who is not there
// yet. A minute is the compromise.

/**
 * Make text safe to drop into HTML.
 *
 * Every screen in this app builds rows by concatenating strings, so anything
 * that came from a person has to pass through here first. A patient called
 * O'Brien or an item named 3" gauze is enough to break a row's buttons on its
 * own — no ill intent required — and the same gap would let a name containing
 * a tag run as markup in the staff table.
 *
 * Single and double quotes are both escaped because these values land inside
 * onclick="..." attributes as well as in cell text.
 */
// ── Row density ─────────────────────────────────────────────────────────────
//
// One setting for every table in the app, kept on <body> and remembered. It is
// a preference about the person, not about the screen: somebody clearing a
// morning's bookings wants as many rows as will fit, and the same person
// reading one patient's history wants room to breathe. Making it per-table
// would mean setting it again on every tab.
//
// Written before any table renders, so rows are never painted at one height
// and then reflowed to another as the preference loads.

const DENSITIES = ["compact", "default", "comfortable"];
const DENSITY_KEY = "dentcare.density";

/** Apply a density, remember it, and update any control on screen. */
function setRowDensity(value) {
    const density = DENSITIES.indexOf(value) === -1 ? "default" : value;
    document.body.setAttribute("data-density", density);

    // localStorage throws in a private window on some browsers, and a
    // preference failing to save must never take the table down with it.
    try { localStorage.setItem(DENSITY_KEY, density); } catch (err) { /* not fatal */ }

    document.querySelectorAll(".density__btn").forEach(btn => {
        btn.setAttribute("aria-pressed", String(btn.dataset.density === density));
    });
}

/** The remembered density, or the sensible middle one. */
function storedRowDensity() {
    try {
        const saved = localStorage.getItem(DENSITY_KEY);
        if (DENSITIES.indexOf(saved) !== -1) return saved;
    } catch (err) { /* fall through to the default */ }
    return "default";
}

/**
 * Draw the density control into every placeholder, and apply the preference.
 *
 * Built here rather than written into each template: it belongs beside ten
 * different tables, and ten copies of the same three buttons is ten chances
 * for one of them to drift.
 */
function initRowDensity() {
    const current = storedRowDensity();

    document.querySelectorAll("[data-density-control]").forEach(host => {
        if (host.dataset.ready === "1") return;   // tabs re-render; build once
        host.dataset.ready = "1";
        host.className = "density";
        host.setAttribute("role", "group");
        host.setAttribute("aria-label", "Row height");

        host.innerHTML = DENSITIES.map(d =>
            '<button type="button" class="density__btn" data-density="' + d + '" ' +
            'aria-pressed="false" onclick="setRowDensity(\'' + d + '\')">' +
            d.charAt(0).toUpperCase() + d.slice(1) +
            "</button>"
        ).join("");
    });

    setRowDensity(current);
}

function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, c => (
        { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
}

/**
 * Make text safe to drop into a JS string literal inside an HTML attribute.
 *
 * escapeHtml() is NOT enough for onclick="fn('HERE')", and this is the subtle
 * part: the browser HTML-decodes an attribute's value BEFORE the JavaScript in
 * it is parsed. So escapeHtml turning ' into &#39; achieves nothing — the
 * parser turns it straight back into ' and the string closes early.
 *
 * A patient called O'Brien was enough to break the Mark Done button on the
 * dentist's list, with no ill intent at all; a patient who chose their own
 * display name could close the string and run whatever they liked in a
 * clinician's signed-in session.
 *
 * Order matters. The backslash is escaped first, or a name containing one
 * would escape our own escape and reopen the hole.
 */
function escapeJsAttr(str) {
    return escapeHtml(
        String(str == null ? "" : str)
            .replace(/\\/g, "\\\\")
            .replace(/'/g, "\\'")
    );
}

/**
 * Today as YYYY-MM-DD in the clinic's OWN timezone.
 *
 * Not `new Date().toISOString().split("T")[0]`, which this app used in six
 * places. toISOString() is UTC, and the clinic is UTC+8 — so between midnight
 * and 8am local it returns YESTERDAY. That was enough to:
 *
 *   - let a patient book a date the calendar meant to have excluded
 *   - date a clinical record to the previous day for an early-morning visit
 *
 * Neither shows up in testing unless somebody works before 8am, which is
 * exactly when this clinic opens.
 */
function localDateKey(d) {
    const date = d || new Date();
    return date.getFullYear() + "-" +
           String(date.getMonth() + 1).padStart(2, "0") + "-" +
           String(date.getDate()).padStart(2, "0");
}

const REFERENCE_TTL_MS = 60 * 1000;

const referenceCache = {};   // name -> { at: timestamp, byId: {docId: data} }

/**
 * A whole reference collection as a plain {docId: data} map.
 *
 * Always returns a promise, cached or not, so callers read the same either
 * way and nothing has to know whether it was a hit.
 */
function getReference(name) {
    const hit = referenceCache[name];
    // A live copy (watchReference below) is current by definition, however
    // long ago it last changed.
    if (hit && hit.live) return Promise.resolve(hit.byId);

    // A listener has been opened and its first snapshot is on the way. Wait
    // for it, even over a copy still inside its minute: that copy may be
    // missing the very patient somebody is looking for, and the listener only
    // reports what changes AFTER its first snapshot. A separate get() here
    // would read every document twice.
    const watch = referenceWatch[name];
    if (watch) return watch.first;

    if (hit && (Date.now() - hit.at) < REFERENCE_TTL_MS) {
        return Promise.resolve(hit.byId);
    }

    return db.collection(name).get().then(snapshot => {
        const byId = {};
        snapshot.forEach(doc => { byId[doc.id] = doc.data(); });
        referenceCache[name] = { at: Date.now(), byId: byId };
        return byId;
    });
}

/**
 * Only the patients a screen actually shows, as {id: data}.
 *
 * ── WHY NOT getReference("patients") (2026-09-13 launch audit) ─────────────
 *
 * The appointment lists and the billing ledger used to download EVERY patient
 * the clinic has ever registered — medical history, signature image and all —
 * to put a phone number beside forty rows. On the free Spark plan every
 * document is a billed read against a 50,000-a-day ceiling, so with two
 * thousand patients on file, twenty-five opens of a list would take the clinic
 * offline for the rest of the day. It also sent every patient's medical
 * history to a screen that shows none of it.
 *
 * So these screens ask for the ids they display, thirty per query (Firestore's
 * limit for "in"). The full list is still used when it is already cached — a
 * patient picker opened a moment ago has it — because re-reading it costs
 * nothing. Search pickers genuinely need every patient and keep using
 * getReference("patients").
 */
const patientByIdCache = {};   // id -> { at, data }

function getPatientsByIds(ids) {
    const wanted = Array.from(new Set((ids || []).filter(id => typeof id === "string" && id)));
    const out = {};
    if (!wanted.length) return Promise.resolve(out);

    // The whole list is already in hand and fresh: use it.
    const whole = referenceCache.patients;
    if (whole && (whole.live || (Date.now() - whole.at) < REFERENCE_TTL_MS)) {
        wanted.forEach(id => { if (whole.byId[id]) out[id] = whole.byId[id]; });
        return Promise.resolve(out);
    }

    const missing = [];
    wanted.forEach(id => {
        const hit = patientByIdCache[id];
        if (hit && (Date.now() - hit.at) < REFERENCE_TTL_MS) out[id] = hit.data;
        else missing.push(id);
    });
    if (!missing.length) return Promise.resolve(out);

    const chunks = [];
    for (let i = 0; i < missing.length; i += 30) chunks.push(missing.slice(i, i + 30));

    return Promise.all(chunks.map(chunk =>
        db.collection("patients")
          .where(firebase.firestore.FieldPath.documentId(), "in", chunk)
          .get()
    )).then(snaps => {
        const at = Date.now();
        snaps.forEach(snap => snap.forEach(doc => {
            patientByIdCache[doc.id] = { at: at, data: doc.data() };
            out[doc.id] = doc.data();
        }));
        return out;
    });
}

/**
 * Drop a cached collection so the next read goes to Firestore.
 *
 * Call this immediately after writing to one of these collections. Without it
 * a receptionist would add a patient, and that patient would not appear on
 * their own screen for up to a minute — which reads as the save having failed
 * and gets the record entered twice.
 */
function refreshReference(name) {
    // A live copy is left alone: the listener already has the write (Firestore
    // reports this browser's own writes to it straight away), and dropping it
    // would only make the next screen read the whole collection again.
    const drop = k => { if (!(referenceCache[k] && referenceCache[k].live)) delete referenceCache[k]; };
    if (name) drop(name);
    else Object.keys(referenceCache).forEach(drop);
    // The per-patient cache is the same data, so it goes stale with it.
    if (!name || name === "patients") {
        Object.keys(patientByIdCache).forEach(k => delete patientByIdCache[k]);
    }
}

// ── Live reference lists (2026-09-27) ──────────────────────────────────────
//
// Client testing on dentcare.site: a patient was registered, and the patient
// list did not show them until the page was refreshed. The minute-long cache
// above is fine for a name beside an appointment, but a list somebody is
// LOOKING AT, waiting for a new person to appear in, has to update by itself —
// including when the patient registered on another machine (the walk-in
// tablet, the public form, the front-desk PC).
//
// So while a screen that shows a whole reference list is open, it holds a
// Firestore listener on it. It costs no more than the get() it replaces: the
// first snapshot reads each document once, exactly as get() did, and after
// that Firestore sends only the documents that changed, one read each. The
// listener is closed as soon as the screen is left, like the queue's.
//
// The listener keeps referenceCache[name] current (marked live), so every
// other reader — getReference, getPatientsByIds — gets the live copy for free.

const referenceWatch = {};   // name -> { unsub, first: Promise<byId>, onChange }

/**
 * Keep referenceCache[name] live until unwatchReference(name).
 *
 * onChange(byId) runs on every snapshot AFTER the first; the first is handed
 * to whoever is waiting in getReference(), which draws the screen. Calling
 * this again while already watching only replaces onChange.
 */
function watchReference(name, onChange) {
    const existing = referenceWatch[name];
    if (existing) {
        existing.onChange = onChange || null;
        return existing.first;
    }

    const watch = { unsub: null, onChange: onChange || null, first: null };
    let seenFirst = false;

    watch.first = new Promise((resolve, reject) => {
        watch.unsub = db.collection(name).onSnapshot(snapshot => {
            const byId = {};
            snapshot.forEach(doc => { byId[doc.id] = doc.data(); });
            referenceCache[name] = { at: Date.now(), byId: byId, live: true };
            if (name === "patients") {
                Object.keys(patientByIdCache).forEach(k => delete patientByIdCache[k]);
            }

            if (!seenFirst) {
                seenFirst = true;
                resolve(byId);
                return;
            }
            if (typeof watch.onChange === "function") {
                try { watch.onChange(byId); }
                catch (err) { console.error("Redrawing the " + name + " list failed:", err); }
            }
        }, err => {
            // Usually a lost sign-in or a rules refusal. Fall back to the old
            // behaviour — a fresh read the next time the screen opens — rather
            // than leave a copy marked live that nothing is updating.
            console.error("Live " + name + " list stopped:", err);
            if (referenceWatch[name] === watch) delete referenceWatch[name];
            const cached = referenceCache[name];
            if (cached && cached.live) delete referenceCache[name];
            reject(err);
        });
    });

    // A rejection nobody awaited must not surface as an unhandled error.
    watch.first.catch(() => {});

    // The listener could not even be opened: leave nothing registered, so the
    // next getReference() simply reads the collection the ordinary way.
    if (!watch.unsub) return watch.first;

    referenceWatch[name] = watch;
    return watch.first;
}

/** Stop the listener. What it last saw stays cached for the usual minute. */
function unwatchReference(name) {
    const watch = referenceWatch[name];
    if (!watch) return;
    delete referenceWatch[name];
    try { watch.unsub(); } catch (err) { /* already closed */ }
    const cached = referenceCache[name];
    if (cached && cached.live) {
        cached.live = false;
        cached.at = Date.now();
    }
}

// ─────────────────────────────────────────────────────────────
// Which page are we on?
// index.php sets this to "public", portal.php to "portal" (see
// templates/partials/page-head.php). The dashboards only exist on the portal
// and the landing page only exists on the public page, so whenever the
// sign-in state and the current page disagree, we navigate instead of
// showing or hiding a div.
// ─────────────────────────────────────────────────────────────
const PAGE = window.DENTCARE_PAGE || "public";

// Set by submitRegister() in js/auth.js. Creating an account signs the new
// patient in immediately, which fires the auth listener below — but their
// profile documents are still being written at that moment, and navigating
// away would abandon those writes. The registration flow raises this flag and
// does its own redirect once the writes have finished.
let suppressPortalRedirect = false;

function setSuppressPortalRedirect(value) {
    suppressPortalRedirect = value;
}

// Send a signed-in visitor from the public page to their dashboard.
// Returns true if we navigated, so callers can stop what they were doing.
function leaveForPortal() {
    if (PAGE === "portal") return false;
    if (suppressPortalRedirect) return true;
    window.location.replace("portal.php");
    return true;
}

// Send a signed-out visitor from the portal back to the public page.
function leaveForPublic() {
    if (PAGE === "public") return false;
    window.location.replace("index.php");
    return true;
}

// Uncover the portal once we know who is signed in. Until this runs the
// dashboards sit behind an opaque cover — see the comment in portal.php.
function revealPortal() {
    const gate = document.getElementById("portal-gate");
    if (!gate) return;
    // A 200ms fade, then gone. Removed on a timer as well as on transitionend,
    // because a background tab may never fire the transition.
    gate.classList.add("is-leaving");
    const remove = () => { if (gate.isConnected) gate.remove(); };
    gate.addEventListener("transitionend", remove, { once: true });
    setTimeout(remove, 400);
}

// ── The Privacy Policy agreement (2026-10-03, R22) ─────────────────────────
//
// "I agree to the Privacy Policy" (privacy.php) is ticked at every sign-in, at
// registration, in Create online account and with Collect consent signature.
// What is saved, on the patient record only, is
//   privacyAccepted: { version, textHash, acceptedAt, method[, recordedBy] }
// method "online" when the patient ticked it on their own account or the
// online form, "in person" with recordedBy when the clinic's tablet was handed
// to them. textHash is the fingerprint of the policy's words that this page
// shows (window.DENTCARE_PRIVACY, set in templates/partials/page-head.php).
//
// Where a page has no box, nothing is asked and nothing is saved: that is the
// static build for dentcare.site until the policy is approved. So every
// function below treats a missing box as "carry on exactly as before".
// Keep PRIVACY_POLICY_VERSION equal to the one in helpers.php (check-privacy).
const PRIVACY_POLICY_VERSION = "1.0";
// sessionStorage: the time the box was ticked at sign-in, carried across the
// hop from the public page to the portal, where the agreement is saved.
const PRIVACY_AGREED_KEY = "dentcare.privacyAgreed";

/** "absent" when this page has no such box, otherwise "ticked" or "unticked". */
function privacyBoxState(id) {
    const box = document.getElementById(id);
    if (!box) return "absent";
    return box.checked ? "ticked" : "unticked";
}

/** The policy this page shows ({version, textHash}), or null when it shows none. */
function currentPrivacyPolicy() {
    const policy = typeof window !== "undefined" ? window.DENTCARE_PRIVACY : null;
    if (!policy || typeof policy.version !== "string" || typeof policy.textHash !== "string") return null;
    return policy;
}

/** The map to save on the patient record, or null when this page has no policy. */
function privacyAgreementFor(method, recordedBy, acceptedAt) {
    const policy = currentPrivacyPolicy();
    if (!policy) return null;
    const agreed = {
        version: policy.version,
        textHash: policy.textHash,
        acceptedAt: acceptedAt || new Date().toISOString(),
        method: method
    };
    if (method === "in person") agreed.recordedBy = recordedBy || "";
    return agreed;
}

/** True when the saved agreement is missing, or was for other words than this page's. */
function privacyAgreementOutdated(saved) {
    const policy = currentPrivacyPolicy();
    if (!policy) return false;
    return !saved || saved.version !== policy.version || saved.textHash !== policy.textHash;
}

/**
 * A box the form needs: rings its row in red when it is not ticked.
 * @return {boolean} true when the form may go on (ticked, or no box at all)
 */
function requirePrivacyBox(id) {
    const state = privacyBoxState(id);
    if (state === "absent") return true;
    const ok = state === "ticked";
    const row = document.getElementById(id + "-row");
    if (row && typeof markFieldStatus === "function") {
        markFieldStatus(row, ok, ok ? "" : "Tick the box to agree to the Privacy Policy.");
    }
    return ok;
}

/** Clear a box and its red ring when a form opens again. */
function resetPrivacyBox(id) {
    const box = document.getElementById(id);
    if (box) box.checked = false;
    const row = document.getElementById(id + "-row");
    if (row && typeof markFieldStatus === "function") markFieldStatus(row, true);
}

/**
 * After a sign-in where the box was ticked: save the agreement on the
 * patient's own record, but only when it is missing or for older words, so it
 * is not rewritten at every login. Staff and the dentist save nothing. Runs on
 * the portal; the flag is cleared whatever happens.
 * @return {Promise<boolean>} whether an agreement was written
 */
function settlePrivacyAgreementAtSignIn(uid, role, patient) {
    let ticked = null;
    try { ticked = sessionStorage.getItem(PRIVACY_AGREED_KEY); } catch (e) { ticked = null; }
    if (!ticked) return Promise.resolve(false);
    try { sessionStorage.removeItem(PRIVACY_AGREED_KEY); } catch (e) { /* nothing to clear */ }
    if (role !== "patient" || !patient || !privacyAgreementOutdated(patient.privacyAccepted)) {
        return Promise.resolve(false);
    }
    const at = /^\d{4}-\d{2}-\d{2}T[0-9:.]+Z$/.test(ticked) ? ticked : new Date().toISOString();
    const agreed = privacyAgreementFor("online", "", at);
    if (!agreed) return Promise.resolve(false);
    return db.collection("patients").doc(uid).update({ privacyAccepted: agreed })
        .then(() => true)
        .catch(err => {
            // Never a reason to stop the sign-in: the next one asks again.
            console.warn("Could not record the Privacy Policy agreement:", err);
            return false;
        });
}
// ── end of privacy agreement

// Firebase auth state change listener (replaces DOMContentLoaded check)
auth.onAuthStateChanged((user) => {
    if (user) {
        currentUserId = user.uid;
        currentEmail = user.email;
        
        // Fetch role and name from Firestore
        db.collection("users").doc(user.uid).get()
        .then(doc => {
            if (doc.exists) {
                const userData = doc.data();
                currentRoleRaw = userData.role;
                currentRole = normaliseRole(userData.role);

                // Ticked "I agree to the Privacy Policy" at this sign-in: a
                // patient's agreement is saved below; anyone else's flag is
                // simply cleared (2026-10-03, R22).
                if (currentRole !== "patient" && PAGE === "portal") {
                    settlePrivacyAgreementAtSignIn(user.uid, currentRole, null);
                }
                
                if (currentRole === "patient") {
                    // Fetch patient details for name
                    return db.collection("patients").doc(user.uid).get()
                    .then(patientDoc => {
                        if (patientDoc.exists) {
                            const pData = patientDoc.data();
                            // A patient the clinic has marked deceased or
                            // inactive is not left signing in to a live
                            // dashboard. They are told to ring the clinic; the
                            // record itself is untouched. See patientStatusOf().
                            const marked = String(pData.status || "active").toLowerCase();
                            if (marked === "deceased" || marked === "inactive") {
                                auth.signOut()
                                    .then(() => alertDialog("This account is not active. Please contact the clinic.",
                                        { title: "Account not active" }))
                                    .then(() => window.location.replace("index.php"));
                                return;
                            }
                            currentUser = `${pData.firstName} ${pData.lastName}`;
                            // Saved once per version of the policy, never
                            // waited on: the screens below carry on at once.
                            if (PAGE === "portal") settlePrivacyAgreementAtSignIn(user.uid, "patient", pData);
                            // An account made online confirms its email first
                            // (2026-10-01). js/email-confirm.js is loaded on the
                            // portal only, so the public page simply hands over
                            // to the portal, which shows the confirm screen.
                            if (typeof emailConfirmNeeded === "function" && emailConfirmNeeded(pData, user)) {
                                if (leaveForPortal()) return;
                                showEmailConfirmScreen(user);
                                return;
                            }
                            // Opened the link on another device: tidy the flag.
                            if (pData.emailConfirmPending === true && user.emailVerified &&
                                typeof clearConfirmedEmailFlag === "function") {
                                clearConfirmedEmailFlag(user);
                            }
                            // An account the clinic made may still have to
                            // sign the consent or change a temporary password
                            // (2026-10-02, js/first-signin.js).
                            if (typeof firstSignInNeeded === "function" && firstSignInNeeded(pData)) {
                                if (leaveForPortal()) return;
                                showFirstSignInScreen(pData);
                                return;
                            }
                        } else {
                            currentUser = userData.name || user.displayName || user.email;
                        }
                        routeToRoleDashboard();
                    });
                } else if (currentRole === "dentist") {
                    // displayName first: Account Settings writes the name there,
                    // because nothing may write to its own users document (see
                    // firestore.rules). users.name is the fallback for accounts
                    // that have never been renamed.
                    currentUser = user.displayName || userData.name || "Dr. Reina Gapit";
                    routeToRoleDashboard();
                } else {
                    currentUser = user.displayName || userData.name || "Jane Doe";
                    routeToRoleDashboard();
                }
            } else {
                console.error("User document not found in Firestore.");
                currentUser = user.displayName || user.email;
                currentRole = "patient";
                routeToRoleDashboard();
            }
        })
        .catch(err => {
            // Usually Firestore rules refusing the read. Signing the user out
            // here would hide the one detail that says so.
            const code = (err && err.code) ? err.code : "unknown";
            const hint = code === "permission-denied"
                ? "\n\nFirestore security rules are refusing to let this account read its own " +
                  "profile at users/" + currentUserId + "."
                : "";
            signInProblem("Could not load your profile.",
                code + " — " + ((err && err.message) ? err.message : "no details") + hint);
        });
    } else {
        // Nobody is signed in, so nothing should still be polling for
        // lapsed appointments. Left running, a signed-out tab keeps
        // making reads against whoever signs in next.
        if (typeof stopAppointmentSweepTimer === "function") stopAppointmentSweepTimer();
        if (typeof unwatchClinicUnread === "function") unwatchClinicUnread();
        if (typeof unwatchPatientUnread === "function") unwatchPatientUnread();
        if (typeof stopNotifications === "function") stopNotifications();
        if (typeof stopChatThread === "function") stopChatThread(true);
        if (typeof unwatchClinicQueue === "function") unwatchClinicQueue();
        if (typeof unwatchReference === "function") unwatchReference("patients");
        // Every live list (watchLive, 2026-10-02).
        unwatchAllLive();
        // A tick from a sign-in that never finished must not count for the
        // next person to sign in on this tab (a shared clinic tablet).
        try { sessionStorage.removeItem(PRIVACY_AGREED_KEY); } catch (e) { /* nothing to clear */ }

        currentUser = "";
        currentRole = "";
        currentEmail = "";
        currentUserId = "";
        if (leaveForPublic()) return;
        navToLayout("auth-layout");
    }
});

// ─────────────────────────────────────────────────────────────
// Sign out a portal left unattended
// ─────────────────────────────────────────────────────────────
//
// Added 2026-09-13 from the launch audit. Firebase keeps a sign-in forever by
// default, and this clinic's screens are shared: a front-desk PC, a tablet
// passed between walk-ins. A portal left open at the counter is every patient
// record in the clinic, available to whoever sits down next.
//
// Activity is recorded in localStorage, not a variable, so the clock is
// shared across tabs: a receptionist working in one tab is not signed out
// because a second tab of the portal has been sitting idle behind it.
//
// Thirty minutes: long enough that a dentist mid-procedure does not come back
// to a login box, short enough that an abandoned screen closes itself.
const IDLE_SIGN_OUT_MS = 30 * 60 * 1000;
const IDLE_ACTIVITY_KEY = "dentcare.lastActivity";
let idleLastLocal = Date.now();
let idleLastWrite = 0;

function noteUserActivity() {
    idleLastLocal = Date.now();
    // Throttled: a mousemove fires dozens of times a second, and one write
    // every 15 seconds is plenty for a 30-minute clock.
    if (idleLastLocal - idleLastWrite < 15000) return;
    idleLastWrite = idleLastLocal;
    try { window.localStorage.setItem(IDLE_ACTIVITY_KEY, String(idleLastLocal)); } catch (e) { /* storage blocked: local clock still works */ }
}

function lastUserActivity() {
    let shared = 0;
    try { shared = Number(window.localStorage.getItem(IDLE_ACTIVITY_KEY)) || 0; } catch (e) { /* ignore */ }
    return Math.max(idleLastLocal, shared);
}

["click", "keydown", "mousemove", "touchstart", "scroll"].forEach(ev =>
    document.addEventListener(ev, noteUserActivity, { passive: true, capture: true }));

setInterval(() => {
    if (!auth.currentUser) return;
    if (Date.now() - lastUserActivity() < IDLE_SIGN_OUT_MS) return;
    if (typeof performLogout === "function") {
        performLogout();
    } else {
        auth.signOut().then(() => window.location.replace("index.php"));
    }
}, 60 * 1000);

// ─────────────────────────────────────────────────────────────
// Say when the connection is gone
// ─────────────────────────────────────────────────────────────
//
// Added 2026-09-13. Offline, a save in this app does not fail quickly: a
// booking or a payment errors with a generic message, and a message just hangs.
// The clinic sits on a mall connection and patients book on mobile data, so the
// commonest cause of "it didn't work" deserves to be named on screen, once, in
// words, rather than guessed at from a spinner.
function renderConnectionBanner() {
    let bar = document.getElementById("offline-banner");
    if (navigator.onLine) {
        if (bar) bar.remove();
        return;
    }
    if (bar) return;
    bar = document.createElement("div");
    bar.id = "offline-banner";
    bar.className = "offline-banner";
    bar.setAttribute("role", "status");
    bar.textContent = "You are offline. Nothing can be saved until the internet connection is back.";
    document.body.appendChild(bar);
}
window.addEventListener("offline", renderConnectionBanner);
window.addEventListener("online", () => {
    renderConnectionBanner();
    if (typeof showToast === "function") showToast("Back online.", "success");
});
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderConnectionBanner);
} else {
    renderConnectionBanner();
}

// The density preference is applied on the same tick as the banner, before any
// table has rendered, so rows are never painted at one height and reflowed to
// another a moment later.
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initRowDensity);
} else {
    initRowDensity();
}

// ─────────────────────────────────────────────────────────────
// A table that could not load says so
// ─────────────────────────────────────────────────────────────
//
// Added 2026-09-13 from the launch audit. Several lists caught a failed read,
// logged it to the console, and left the table as it was — "Loading…" forever,
// or an empty table that reads exactly like "nobody is booked" or "nothing is
// owed". On the clinic's connection a failed read is ordinary, and an empty
// ledger that is really an unread one is how a bill goes uncollected.
//
// retryFn is the NAME of a global function (a constant from the caller, never
// data), so the button can offer to try again.
function renderTableLoadError(tbodyId, colspan, what, retryFn) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    tbody.innerHTML =
        '<tr><td colspan="' + Number(colspan) + '" class="table-load-error">' +
            'Could not load ' + escapeHtml(what) + '. Check the internet connection. ' +
            (retryFn && /^[A-Za-z_][A-Za-z0-9_]*$/.test(retryFn)
                ? '<button type="button" class="btn-secondary btn-sm" onclick="' + retryFn + '()">Try again</button>'
                : '') +
        '</td></tr>';
}

// Shows one layout and hides the rest. Each page only carries the layouts it
// needs, so this skips any that are not in the document.
function navToLayout(layoutId) {
    document.querySelectorAll("#auth-layout, .app-layout").forEach(el => {
        el.classList.add("hidden");
    });

    const target = document.getElementById(layoutId);
    if (target) target.classList.remove("hidden");
}

// Opens the right dashboard for the signed-in user's role. On the public page
// there are no dashboards to open, so this hands over to portal.php instead.
function routeToRoleDashboard() {
    if (leaveForPortal()) return;

    if (currentRole === "patient") {
        const nameDisp = document.getElementById("patient-name-display");
        if (nameDisp) nameDisp.innerText = currentUser;
        navToLayout("patient-layout");
        switchPatientTab("tab-patient-appointments", document.getElementById("nav-patient-appointments"));
        loadPatientAppointments();
        loadDentistDropdown();
        loadTreatmentOptions();

        // Oral health reminders, flash tips and the toothbrush tracker.
        // Patients only — the dentist and staff dashboards have no oral-care
        // surfaces and must not start a reminder loop. Guarded because
        // index.php loads app.js without js/oral-care.js.
        if (typeof initOralCare === "function") initOralCare();

        // Keeps the list honest while the portal sits open. The patient
        // cannot write, so for them this only re-renders — which is all
        // that was needed: their stale "Approved" was a display problem.
        if (typeof startAppointmentSweepTimer === "function") startAppointmentSweepTimer();
        if (typeof watchPatientUnread === "function") watchPatientUnread();
        if (typeof startNotifications === "function") startNotifications();
    } else if (currentRole === "dentist") {
        const nameDisp = document.getElementById("dentist-name-display");
        if (nameDisp) nameDisp.innerText = currentUser;
        navToLayout("dentist-layout");
        switchDentistTab("tab-dentist-queue", document.getElementById("nav-dentist-queue"));
        if (typeof startAppointmentSweepTimer === "function") startAppointmentSweepTimer();
        if (typeof watchClinicUnread === "function") watchClinicUnread();
        if (typeof startNotifications === "function") startNotifications();
    } else if (currentRole === "staff" || currentRole === "admin") {
        const nameDisp = document.getElementById("staff-name-display");
        if (nameDisp) nameDisp.innerText = currentUser;
        navToLayout("staff-layout");
        switchStaffTab("tab-staff-appointments", document.getElementById("nav-staff-appointments"));
        loadStaffAppointments();
        if (typeof startAppointmentSweepTimer === "function") startAppointmentSweepTimer();
        if (typeof watchClinicUnread === "function") watchClinicUnread();
        if (typeof startNotifications === "function") startNotifications();
    } else {
        signInProblem(
            "This account has no role we recognise.",
            'You are signed in, but the role stored on the account is "' + (currentRoleRaw || "(empty)") + '".\n\n' +
            "It has to be one of: patient, dentist, staff, admin.\n\n" +
            "Fix it in the Firebase console under  users/" + currentUserId + "  then sign in again."
        );
        return;
    }

    revealPortal();
}

// Navigation Tabs Switchers (Patient)
function switchPatientTab(tabId, el) {
    if (tabId !== "tab-patient-messages" && typeof stopChatThread === "function") stopChatThread();
    // Leaving a tab closes its live lists (watchLive, 2026-10-02).
    unwatchLiveExcept(tabId);
    document.querySelectorAll("#patient-layout .tab-content").forEach(tab => tab.classList.add("hidden"));
    document.querySelectorAll("#patient-layout .nav-item").forEach(btn => btn.classList.remove("active"));
    
    const targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.classList.remove("hidden");
    if (el) el.classList.add("active");
    closeMobileSidebar();

    if (tabId === "tab-patient-appointments") {
        loadPatientAppointments();
    } else if (tabId === "tab-patient-messages") {
        if (typeof loadPatientMessages === "function") loadPatientMessages();
    } else if (tabId === "tab-patient-account") {
        if (typeof loadAccountSettings === "function") loadAccountSettings("patient");
    }
    // tab-patient-guides needs no hook. It used to refresh the toothbrush bar,
    // which counted days against today's date; with that tracker moved to the
    // mobile app the tab is entirely static markup and re-rendering it would
    // do nothing.
}

// Navigation Tabs Switchers (Dentist)
function switchDentistTab(tabId, el) {
    if (tabId !== "tab-dentist-messages" && typeof stopChatThread === "function") stopChatThread();
    const panel = document.getElementById(tabId);
    if (!panel) {
        console.error("No such tab: " + tabId);
        return;
    }
    // Leaving a tab closes its live lists (watchLive, 2026-10-02).
    unwatchLiveExcept(tabId);
    document.querySelectorAll("#dentist-layout .tab-content").forEach(tab => tab.classList.add("hidden"));
    document.querySelectorAll("#dentist-layout .nav-item").forEach(btn => btn.classList.remove("active"));
    
    panel.classList.remove("hidden");
    if (el) el.classList.add("active");
    closeMobileSidebar();

    // Both live listeners are closed whichever tab you leave FOR — the same
    // fix the staff switcher below got. The queue's used to be stopped only
    // by the fall-through else at the bottom, so going from the queue to
    // Appointments, Charting, Records or History left it streaming.
    if (tabId !== "tab-dentist-queue" && typeof unwatchClinicQueue === "function") {
        unwatchClinicQueue();
    }
    unwatchPatientsUnlessPicker(tabId);

    if (tabId === "tab-dentist-appointments") {
        loadDentistAppointments();
    } else if (tabId === "tab-dentist-chart") {
        resetDentistChartTab();
    } else if (tabId === "tab-dentist-records") {
        resetDentistRecordsTab();
    } else if (tabId === "tab-dentist-history") {
        if (typeof resetHistoryTab === "function") resetHistoryTab();
    } else if (tabId === "tab-dentist-stock") {
        // Take-outs the front desk filed, for her to approve (2026-10-01).
        if (typeof loadStockApprovals === "function") loadStockApprovals();
    } else if (tabId === "tab-dentist-schedule") {
        loadAvailabilitySchedule("dentist");
    } else if (tabId === "tab-dentist-messages") {
        if (typeof loadClinicInbox === "function") loadClinicInbox();
    } else if (tabId === "tab-dentist-queue") {
        if (typeof watchClinicQueue === "function") watchClinicQueue();
    } else if (tabId === "tab-dentist-backup") {
        // The year-end income export lives here for the dentist — this is where
        // her other exports are. Still unwatches the queue, like every other tab
        // that is not the queue.
        if (typeof loadFinanceYearPicker === "function") loadFinanceYearPicker();
        // HMO parts she has not collected yet (Task 25).
        if (typeof loadHmoToCollect === "function") loadHmoToCollect();
        // Whether a restore window is already open (for example, left open
        // from a restore interrupted by a closed tab) is shown on arrival.
        if (typeof renderRestoreMode === "function") renderRestoreMode();
    } else if (tabId === "tab-dentist-account") {
        if (typeof loadAccountSettings === "function") loadAccountSettings("dentist");
    }
}

// The tabs that show a whole-clinic patient picker, and so keep the patient
// list live (watchPatientPickers in js/records.js). The two queue tabs are
// here since 2026-09-30: the returning walk-in search matches against the
// same list (onWalkinLookupInput in js/queue.js), and somebody registered at
// the desk a moment ago has to be found.
const PATIENT_PICKER_TABS = [
    "tab-dentist-chart", "tab-dentist-records", "tab-dentist-history",
    "tab-staff-history", "tab-staff-intake",
    "tab-dentist-queue", "tab-staff-queue"
];

/**
 * Leaving the pickers closes the live patient list. Without this, a dashboard
 * left open all day would stream every patient edit to a screen showing none.
 */
function unwatchPatientsUnlessPicker(tabId) {
    if (PATIENT_PICKER_TABS.indexOf(tabId) !== -1) return;
    if (typeof unwatchReference === "function") unwatchReference("patients");
}

// Navigation Tabs Switchers (Staff)
function switchStaffTab(tabId, el) {
    if (document.getElementById("tab-staff-patient-registration")?.classList.contains("hidden") === false &&
        tabId !== "tab-staff-patient-registration" &&
        (registrationInFlight || staffQueueInFlight)) {
        showToast("Please wait until patient registration or queue addition finishes.", "warning");
        return;
    }
    if (tabId !== "tab-staff-messages" && typeof stopChatThread === "function") stopChatThread();
    const panel = document.getElementById(tabId);
    if (!panel) {
        console.error("No such tab: " + tabId);
        return;
    }
    // Leaving a tab closes its live lists (watchLive, 2026-10-02).
    unwatchLiveExcept(tabId);
    document.querySelectorAll("#staff-layout .tab-content").forEach(tab => tab.classList.add("hidden"));
    document.querySelectorAll("#staff-layout .nav-item").forEach(btn => btn.classList.remove("active"));
    
    panel.classList.remove("hidden");
    if (el) el.classList.add("active");
    closeMobileSidebar();

    // The queue is a live Firestore listener, and leaving the tab has to stop
    // it whichever tab you leave FOR. This used to sit on the end of the chain
    // below as a fall-through else, so it only ran when the tab had no branch
    // of its own — which meant going from the queue to Billing, Inventory or
    // Schedule left it streaming in the background for the rest of the session.
    if (tabId !== "tab-staff-queue" && typeof unwatchClinicQueue === "function") {
        unwatchClinicQueue();
    }
    unwatchPatientsUnlessPicker(tabId);

    if (tabId === "tab-staff-appointments") {
        loadStaffAppointments();
    } else if (tabId === "tab-staff-intake") {
        loadClinicIntake();
    } else if (tabId === "tab-staff-billing") {
        loadStaffBilling();
        if (typeof loadFinanceYearPicker === "function") loadFinanceYearPicker();
    } else if (tabId === "tab-staff-history") {
        if (typeof resetHistoryTab === "function") resetHistoryTab();
    } else if (tabId === "tab-staff-patient-registration") {
        activateStaffPatientRegistration();
    } else if (tabId === "tab-staff-inventory") {
        loadStaffInventory();
    } else if (tabId === "tab-staff-schedule") {
        loadAvailabilitySchedule("staff");
    } else if (tabId === "tab-staff-services") {
        // Was missing entirely. The tab opened, the markup said "Loading
        // services…", and nothing ever loaded them — so the front desk could
        // not see or rename a single service, which is one of the few things
        // the clinic explicitly wanted staff to own. loadServicesAdmin() was
        // only ever called from inside its own success callbacks, and the
        // commonest of those returns early once the standard list is seeded.
        if (typeof loadServicesAdmin === "function") loadServicesAdmin();
    } else if (tabId === "tab-staff-messages") {
        if (typeof loadClinicInbox === "function") loadClinicInbox();
    } else if (tabId === "tab-staff-queue") {
        if (typeof watchClinicQueue === "function") watchClinicQueue();
    } else if (tabId === "tab-staff-account") {
        if (typeof loadAccountSettings === "function") loadAccountSettings("staff");
    }
}

// Mobile sidebar controls
// ── The module panel on phones and tablets (rebuilt 2026-09-16) ────────────
//
// At 900px and below the sidebar is a top bar with a "Menu" button, and the
// modules slide in as a panel (css/layout.css). The button's state is kept in
// aria-expanded and its label, so a screen reader and a sighted user are told
// the same thing. On a desktop the class does nothing.
function setMobileSidebar(open) {
    const sidebar = document.querySelector(".app-layout:not(.hidden) .sidebar");
    if (!sidebar) return;
    sidebar.classList.toggle("menu-open", open);

    const btn = sidebar.querySelector(".sidebar-toggle-btn");
    if (btn) {
        btn.setAttribute("aria-expanded", String(open));
        btn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
        const label = btn.querySelector(".sidebar-toggle-label");
        if (label) label.textContent = open ? "Close" : "Menu";
    }
}

function toggleMobileSidebar() {
    const sidebar = document.querySelector(".app-layout:not(.hidden) .sidebar");
    if (!sidebar) return;
    setMobileSidebar(!sidebar.classList.contains("menu-open"));
}

function closeMobileSidebar() {
    setMobileSidebar(false);
}

// Tapping the dimmed backdrop closes the panel. The backdrop is the sidebar's
// own ::after, so a tap on it arrives with the sidebar itself as the target;
// taps on the bar's logo, the Menu button or the panel have a child target.
document.addEventListener("click", (e) => {
    const sidebar = e.target && e.target.classList && e.target.classList.contains("sidebar")
        ? e.target : null;
    // The pseudo-backdrop and the bar padding both target .sidebar. Only a
    // click BELOW the bar is an outside tap; otherwise a near-toggle tap
    // opens and immediately closes the drawer on touch screens.
    if (sidebar && sidebar.classList.contains("menu-open") &&
        e.clientY >= sidebar.getBoundingClientRect().bottom) closeMobileSidebar();
});

// Escape closes it too, for a tablet with a keyboard.
document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const open = document.querySelector(".app-layout:not(.hidden) .sidebar.menu-open");
    if (open) closeMobileSidebar();
});

// Turning a tablet to landscape (past 900px) must not leave it stuck open.
if (window.matchMedia) {
    const wide = window.matchMedia("(min-width: 901px)");
    const onWide = () => { if (wide.matches) closeMobileSidebar(); };
    if (wide.addEventListener) wide.addEventListener("change", onWide);
    else if (wide.addListener) wide.addListener(onWide);
}

// ── Saving over a record somebody else may have changed (2026-09-17) ───────
//
// Several people use DentCare at once: a patient at home, the front desk, the
// doctor, sometimes the doctor on two devices. Every save that changes a record
// which ALREADY EXISTS goes through one of the two functions below, because the
// alternative — read it when the screen opened, write it back when Save is
// pressed — quietly overwrites whatever anybody else saved in between.
//
// That was not theoretical. Found in the 2026-09-17 audit:
//
//   • A patient cancels from home, which frees their hour. The front desk,
//     still looking at the old list, presses Approve. The appointment came back
//     to life as Approved with no hour held, and the next patient could book
//     the same time.
//   • The desk moves a visit the doctor has just completed back to "Awaiting
//     Consultation". Completion refuses a visit already marked Completed — but
//     it no longer was, so it could be completed, billed and deducted from
//     stock a second time.
//
// changeAppointmentStatus() re-reads the appointment inside a transaction and
// refuses unless it is still in a state the button was offered for.
// saveChangedFields() writes only the fields this screen actually changed, and
// refuses a field somebody else changed to something different meanwhile.
// Both tell the person what happened in words, and nothing is overwritten.
//
// A transaction is what makes this hold at the same moment and not just across
// minutes: if two screens save together, Firestore runs one, then re-runs the
// other against the result, where the check now sees the first change.

/** The error both functions throw when the record moved on. */
const RECORD_CHANGED = "record-changed";

function recordChangedError(message, details) {
    const err = new Error(message);
    err.code = RECORD_CHANGED;
    err.details = details || {};
    return err;
}

/** A value, reduced to something two copies can be compared by. */
function storedValueKey(value) {
    // Empty, missing and null are the same answer on a form: a middle name
    // nobody filled in is not a change.
    if (value === undefined || value === null || value === "") return "<empty>";
    if (Array.isArray(value)) return "[" + value.map(storedValueKey).join(",") + "]";
    if (typeof value === "object") {
        if (typeof value.toMillis === "function") return "time:" + value.toMillis();
        return "{" + Object.keys(value).sort()
            .map(k => JSON.stringify(k) + ":" + storedValueKey(value[k])).join(",") + "}";
    }
    return JSON.stringify(value);
}

function sameStoredValue(a, b) {
    return storedValueKey(a) === storedValueKey(b);
}

/** Read "medicalHistory.allergies" or "teethStatus.36" out of a document. */
function readFieldPath(data, path) {
    return String(path).split(".").reduce((o, k) => (o == null ? undefined : o[k]), data);
}

/**
 * Change an appointment's status only if it is still where the screen thought.
 *
 * @param {string}   apptId
 * @param {object}   update       the fields to write
 * @param {string[]} allowedFrom  stored statuses this change makes sense from
 * @param {object}   [expect]     other fields that must still match, e.g. the
 *                                date and time a reschedule is moving FROM
 * @return {Promise<object>} the appointment as it was just before the change,
 *                           read live — so a slot released afterwards is the
 *                           right one, not the one an old list remembered
 */
function changeAppointmentStatus(apptId, update, allowedFrom, expect) {
    const ref = db.collection("appointments").doc(apptId);
    return db.runTransaction(tx => tx.get(ref).then(snap => {
        if (!snap.exists) {
            throw recordChangedError("This appointment no longer exists. The list has been refreshed.");
        }
        const live = snap.data();
        if (allowedFrom.indexOf(live.status) === -1) {
            throw recordChangedError(
                "Nothing was changed: this appointment is now \"" + (live.status || "unknown") +
                "\". Someone updated it on another screen. The list has been refreshed.",
                { status: live.status });
        }
        Object.keys(expect || {}).forEach(field => {
            if (!sameStoredValue(live[field], expect[field])) {
                throw recordChangedError(
                    "Nothing was changed: this appointment was moved on another screen. " +
                    "The list has been refreshed.", { field: field });
            }
        });
        tx.update(ref, update);
        return live;
    }));
}

/**
 * Save only what this screen changed, without overwriting anybody else's change.
 *
 * @param {DocumentReference} ref
 * @param {object|null} openedWith  field → value as the screen showed it when it
 *        opened. null when that is not known (the screen never loaded the record):
 *        then changed fields are still written one by one, but no conflict can be
 *        detected.
 * @param {object} edits   field → value from the form. Keys may be dotted paths
 *                         ("medicalHistory.bloodType"), written as that one key.
 * @param {object} [extra] written alongside, only if something is written
 *                         (who and when stamps)
 * @return {Promise<{written: string[]}>}
 */
function saveChangedFields(ref, openedWith, edits, extra) {
    const known = openedWith && typeof openedWith === "object";
    const mine = Object.keys(edits).filter(f => !known || !sameStoredValue(edits[f], openedWith[f]));
    if (!mine.length) return Promise.resolve({ written: [] });
    // This screen's own change: a live view of the record is not told it
    // changed on another screen (R20).
    if (ref && ref.path && typeof noteOwnWrite === "function") noteOwnWrite(ref.path);

    return db.runTransaction(tx => tx.get(ref).then(snap => {
        if (!snap.exists) throw recordChangedError("This record no longer exists.");
        const live = snap.data();

        const write = {};
        const conflicts = [];
        mine.forEach(field => {
            const now = readFieldPath(live, field);
            if (sameStoredValue(now, edits[field])) return;           // already so
            if (known && !sameStoredValue(now, openedWith[field])) {  // someone else's
                conflicts.push(field);
                return;
            }
            write[field] = edits[field];
        });

        if (conflicts.length) {
            throw recordChangedError("Changed on another screen.", { fields: conflicts });
        }
        if (!Object.keys(write).length) return { written: [] };

        tx.update(ref, Object.assign({}, write, extra || {}));
        return { written: Object.keys(write) };
    }));
}

/**
 * The sentence for a refused save. `labels` names the fields as the screen does.
 */
function recordChangedMessage(err, labels) {
    const fields = (err && err.details && err.details.fields) || [];
    if (!fields.length) return (err && err.message) || "Someone changed this on another screen.";
    const names = fields.map(f => (labels && labels[f]) || f);
    return "Not saved: someone else changed " + names.join(", ") +
           " while you had this open. The latest version is now showing; " +
           "make your change again if it is still needed.";
}

// ── Is this a real person's name? (2026-09-16) ─────────────────────────────
//
// Account Settings let people correct their own name, which is what the clinic
// wanted: a typo at registration should not mean deleting an account. The risk
// it opens is the other direction — somebody renaming themselves to "asdasd"
// or to another patient's name — so a name is checked here before it is saved,
// and the same check runs at registration.
//
// What it allows is deliberately wide, because Filipino names are:
//   letters including Ñ and accents, spaces, hyphens (Santos-Cruz), apostrophes
//   (D'Souza), and full stops (Jr., Ma. Teresa).
// What it refuses is what a name never is: digits, symbols, a single letter,
// a keyboard mash, or one of the obvious placeholders.
//
// It cannot tell a lie from a truth, and does not pretend to. A patient who
// renames themselves is also stamped and shown to the clinic on Patient
// History, which is the check that actually matters.
const NAME_PLACEHOLDERS = [
    "test", "testing", "tester", "asdf", "asdasd", "qwerty", "dummy", "sample",
    "unknown", "none", "n/a", "na", "xxx", "abc", "aaa", "user", "admin", "patient"
];

// ── The rows of a QWERTY keyboard (rewritten 2026-09-30) ───────────────────
//
// A mash is a finger dragged along one row, so letters that sit side by side
// are the clearest sign nobody typed a real word. The first version of this
// rule was too eager and turned real patients away at the desk: it counted
// A, S, A as "three neighbouring keys", so Casanada, Rosas, Pasay and every
// other name with "asa" in it was refused, and it read runs across spaces and
// digits, so "Blk 20 lot 45" (b-l-k-l-o-t) failed as an address.
//
// What counts now:
//   - a run goes ONE WAY only. A, S, D is a run of three; A, S, A is not.
//   - everything is judged one word at a time, never across a space or digit.
//   - `run` is the length that cannot be a real word and is refused: four on
//     the home and bottom rows, five on the top row, which spells real
//     fragments of real names ("ert" in Alberto, "erty" in Liberty).
//   - `unusualRun` is one shorter. It matters only when EVERY letter of the
//     word is on that same row, and even then it never blocks: the person is
//     asked once to check the spelling and the second press accepts it (the
//     surname Sadsad is the known real case).
const KEYBOARD_ROWS = [
    { keys: "qwertyuiop", run: 5, unusualRun: 4 },
    { keys: "asdfghjkl",  run: 4, unusualRun: 3 },
    { keys: "zxcvbnm",    run: 4, unusualRun: 3 }
];

// Y is a vowel here: Lyn, Glyn, Flynn, Rhys and Bryll are real names.
const HAS_VOWEL = /[aeiouyà-æè-ïò-öø-ýÿ]/;

/** The words of a text, lower case, split at anything that is not a letter. */
function textWords(text) {
    return String(text == null ? "" : text).toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
}

/** The longest run of neighbouring keys on one row, going one way only. */
function longestKeyRun(word, keys) {
    let best = 1, run = 1, dir = 0;
    for (let i = 1; i < word.length; i++) {
        const prev = keys.indexOf(word[i - 1]);
        const here = keys.indexOf(word[i]);
        const step = (prev !== -1 && here !== -1) ? here - prev : 0;
        if (step === 1 || step === -1) {
            run = (step === dir) ? run + 1 : 2;
            dir = step;
        } else {
            run = 1;
            dir = 0;
        }
        if (run > best) best = run;
    }
    return best;
}

function distinctLetters(letters) {
    const seen = {};
    let n = 0;
    for (let i = 0; i < letters.length; i++) {
        if (!seen[letters[i]]) { seen[letters[i]] = true; n++; }
    }
    return n;
}

/** "adadaadadada": long, and made of two or three letters. Nothing real is. */
function builtFromAlmostNothing(letters) {
    const d = distinctLetters(letters);
    return (letters.length >= 6 && d <= 2) || (letters.length >= 8 && d <= 3);
}

/**
 * One word of a name: "mash" (cannot be a name), "unusual" (ask once), or "".
 */
function nameWordVerdict(word) {
    if (word.length >= 4 && !HAS_VOWEL.test(word)) return "mash";
    if (/(\p{L})\1{3,}/u.test(word)) return "mash";
    if (/^(\p{L}{2,3})\1{2,}$/u.test(word)) return "mash";
    if (builtFromAlmostNothing(word)) return "mash";
    let unusual = false;
    for (let r = 0; r < KEYBOARD_ROWS.length; r++) {
        const row = KEYBOARD_ROWS[r];
        const run = longestKeyRun(word, row.keys);
        if (run >= row.run) return "mash";
        if (run >= row.unusualRun && word.split("").every(ch => row.keys.indexOf(ch) !== -1)) unusual = true;
    }
    return unusual ? "unusual" : "";
}

/**
 * @param  {string} value  one name part, or a full name
 * @param  {string} label  what to call it in the message ("First name")
 * @param  {{allowUnusual?: boolean}} [opts]  true once the person has confirmed
 *         a spelling that was held
 * @return {{ok: boolean, reason: string, unusual: boolean}}
 */
function checkPersonName(value, label, opts) {
    const name = String(value == null ? "" : value).trim().replace(/\s+/g, " ");
    const say = (reason) => ({ ok: false, reason: label + ": " + reason, unusual: false });

    if (!name) return say("this cannot be empty.");
    if (name.length < 2) return say("this is too short.");
    if (name.length > 60) return say("this is too long.");
    if (/[0-9]/.test(name)) return say("a name has no numbers in it.");
    if (!/^[\p{L}][\p{L} .'\-]*$/u.test(name)) {
        return say("use letters only, with spaces, hyphens, apostrophes or full stops.");
    }
    // Letters, not punctuation pretending to be a name ("..", "--").
    if ((name.match(/\p{L}/gu) || []).length < 2) return say("this needs at least two letters.");

    // Word by word, because "asdada Santos" is still somebody typing rubbish
    // into the first half of their own record.
    const verdicts = textWords(name).map(nameWordVerdict);
    if (verdicts.indexOf("mash") !== -1) return say("that does not look like a name.");
    if (NAME_PLACEHOLDERS.indexOf(name.toLowerCase().replace(/[. ]/g, "")) !== -1) {
        return say("please use the real name.");
    }
    if (verdicts.indexOf("unusual") !== -1) {
        if (opts && opts.allowUnusual) return { ok: true, reason: "", unusual: true };
        return { ok: false, unusual: true,
                 reason: label + ": please check the spelling. If \"" + name +
                         "\" is correct, press the button again to continue." };
    }
    return { ok: true, reason: "", unusual: false };
}

// The held spellings each field has already been asked about, by field key.
const unusualNamesSeen = {};

/**
 * checkPersonName() for a field on a form. The first press holds an unusual
 * spelling and remembers it; pressing again with the same spelling accepts it.
 *
 * @param {string} key  the field (its element id), so each box is asked once
 */
function checkPersonNameAt(key, value, label) {
    const typed = String(value == null ? "" : value).trim().replace(/\s+/g, " ").toLowerCase();
    const verdict = checkPersonName(value, label, { allowUnusual: unusualNamesSeen[key] === typed });
    if (verdict.unusual && !verdict.ok) unusualNamesSeen[key] = typed;
    return verdict;
}

/**
 * Does this free text look like somebody dragged a finger across the keyboard?
 *
 * Used for the free-text fields that end up on a clinical record: address,
 * employer, emergency contact, the health details. Rewritten 2026-09-30
 * because ordinary addresses were being refused. Every rule is deliberately
 * blunt and only fires on what cannot be real, because the cost of a false
 * positive is a real patient standing at the desk unable to register
 * (tools/check-names.js holds the lists that keep it honest):
 *
 *   - six or more letters in the whole text and not one vowel
 *   - the whole text is a 2 to 3 letter unit typed three or more times
 *   - the whole text is long and built from two or three letters
 *   - any one word holds the same letter four times running
 *   - any one word holds a one-way keyboard run of four (five on the top row)
 *
 * Short abbreviations are left alone: "Blk", "Brgy", "DPWH" and "PLDT" have no
 * vowel and are exactly what an address or an employer looks like.
 *
 * @param   {string} text
 * @returns {boolean} true when it is not worth putting on a record
 */
function looksMashed(text) {
    const words = textWords(text);
    const letters = words.join("");
    if (letters.length < 3) return false;
    if (letters.length >= 6 && !HAS_VOWEL.test(letters)) return true;
    if (/^(\p{L}{2,3})\1{2,}$/u.test(letters)) return true;
    if (builtFromAlmostNothing(letters)) return true;
    for (let w = 0; w < words.length; w++) {
        if (/(\p{L})\1{3,}/u.test(words[w])) return true;
        for (let r = 0; r < KEYBOARD_ROWS.length; r++) {
            if (longestKeyRun(words[w], KEYBOARD_ROWS[r].keys) >= KEYBOARD_ROWS[r].run) return true;
        }
    }
    return false;
}

/**
 * Every Philippine landline area code, without its leading zero.
 *
 * Here so that a number merely STARTING with a zero cannot pose as a landline:
 * "012313213" has a leading zero and a plausible length, and "01" is not a
 * place. Manila is 2; Naga and the rest of Bicol are 54.
 */
const PH_AREA_CODES = [
    "2",
    "32", "33", "34", "35", "36", "38", "42", "43", "44", "45", "46", "47",
    "48", "49", "52", "53", "54", "55", "56", "62", "63", "64", "65", "68",
    "72", "74", "75", "77", "78", "82", "83", "84", "85", "86", "87", "88"
];

/**
 * A contact number the clinic could actually ring.
 *
 * The field was `type="tel"`, which validates NOTHING: it only changes the
 * keyboard a phone shows. "adadaadadada" registered happily (found on the live
 * site, 2026-09-19). For a clinic whose reminders and "your dentist is ready"
 * calls all go out by phone, an unreachable number is a patient who silently
 * never hears from them again.
 *
 * Deliberately loose about FORMAT and firm about SUBSTANCE. Spaces, hyphens,
 * brackets, dots and a leading +63 are all fine, because that is how people
 * write their own number and arguing about punctuation helps nobody. What it
 * refuses is a number that cannot be dialled: letters, a length no Philippine
 * number has, or the same digit over and over.
 *
 * @param   {string} value  what was typed
 * @param   {string} label  the field's name, for the message
 * @returns {{ok: boolean, reason: string}}
 */
function checkPhone(value, label) {
    const raw = String(value == null ? "" : value).trim();
    const say = (reason) => ({ ok: false, reason: label + ": " + reason });

    if (!raw) return say("this cannot be empty.");
    if (raw.length > 30) return say("this is too long.");

    // The separators people actually type. Everything else has to be a digit.
    const cleaned = raw.replace(/[\s().\-]/g, "");
    if (/[A-Za-z]/.test(cleaned)) return say("a phone number has no letters in it.");
    if (!/^\+?[0-9]+$/.test(cleaned)) return say("use numbers only.");

    // +639XX... and 09XX... are the same number written two ways.
    let digits = cleaned.replace(/^\+/, "");
    if (digits.indexOf("63") === 0 && digits.length > 10) digits = "0" + digits.slice(2);

    if (/^(\d)\1+$/.test(digits)) return say("that is not a real number.");

    // 12345678, 987654321: counting, not dialling.
    //
    // Six in a row, not five. Real numbers do contain "2345", and the whole
    // point of this file is that refusing a real patient is the expensive
    // mistake. Six running digits happens in roughly one real number in
    // seventeen thousand; five is nearer one in two thousand, which over the
    // life of the clinic is a person who cannot register.
    // The run has to keep going the SAME WAY. Without that, "2121212" counts
    // as six in a row because each step is one -- and alternating pairs are
    // ordinary in real numbers. That alone was refusing about one real mobile
    // in every fourteen hundred.
    let climb = 1;
    let lastStep = 0;
    for (let i = 1; i < digits.length; i++) {
        const step = Number(digits[i]) - Number(digits[i - 1]);
        climb = ((step === 1 || step === -1) && step === lastStep) ? climb + 1 : 1;
        lastStep = step;
        if (climb >= 6) return say("that is not a real number.");
    }

    // A Philippine mobile is 11 digits and starts 09. Said plainly, because
    // "0917 555 010" (one short) is the commonest way to get this wrong and
    // "check the format" would not tell anybody what to look for.
    if (digits.indexOf("09") === 0) {
        if (digits.length !== 11) {
            return say("a mobile number is 11 digits, like 0917 555 0101.");
        }
        return { ok: true, reason: "" };
    }

    // ── Everything else has to be a landline WITH its area code ────────────
    //
    // Twice now this branch has been the hole. It was "7 to 12 digits", which
    // let "123456678" through; then it was "7 or 8 digits with no prefix",
    // which let "12313213" through (both found on the live site, 2026-09-19).
    //
    // The bare local form is the problem: seven or eight digits with nothing in
    // front is a shape almost any mashed number happens to have. So a number
    // that is not a mobile has to carry its area code -- which is no hardship,
    // since the patient writes 054 in front of the number they already know,
    // and it is what the clinic would have to dial from a mobile anyway.
    const wants = "that does not look like a phone number. A mobile is 11 digits" +
                  " like 0917 555 0101; a landline needs its area code, like (054) 473 1234.";

    if (digits.charAt(0) !== "0") return say(wants);

    // 0 + area code + the local number. Manila is 02 + 8 digits; Naga is
    // 054 + 7. The area code has to be a real place.
    const rest = digits.slice(1);
    let area = "";
    for (let i = 0; i < PH_AREA_CODES.length; i++) {
        const code = PH_AREA_CODES[i];
        if (rest.indexOf(code) === 0 && code.length > area.length) area = code;
    }
    if (!area) return say(wants);

    const local = rest.slice(area.length);
    if (local.length < 7 || local.length > 8) return say(wants);
    return { ok: true, reason: "" };
}

// ── Signing in with a mobile number (2026-10-01) ──────────────────────────
//
// Many of the clinic's patients have no email. They register and sign in with
// their mobile number and a password. There is no SMS code: Firebase sends
// those only on the paid Blaze plan, and the clinic stays on Spark.
//
// Firebase signs in with an email and a password, so an account with no email
// is given a sign-in address built from its number:
//     0917 123 4567  ->  639171234567@phone.dentcare.site
// The clinic owns dentcare.site, and no email is ever sent to that address.
// No screen shows it: the patient only ever sees and types their number.
const PHONE_SIGN_IN_DOMAIN = "phone.dentcare.site";

/**
 * A Philippine mobile number in one spelling, 639XXXXXXXXX, however it was
 * typed (09XX, +639XX, 639XX, with spaces, dashes or brackets). "" when it is
 * not a mobile number: a landline, too short, too long, or not digits.
 */
function normaliseMobile(value) {
    const cleaned = String(value == null ? "" : value).trim().replace(/[\s().\-]/g, "");
    if (!/^\+?[0-9]+$/.test(cleaned)) return "";
    let digits = cleaned.replace(/^\+/, "");
    if (digits.indexOf("63") === 0 && digits.length === 12) digits = "0" + digits.slice(2);
    if (!/^09[0-9]{9}$/.test(digits)) return "";
    return "63" + digits.slice(1);
}

/**
 * What to hand Firebase as the sign-in address: an email exactly as typed, or
 * the built address for a mobile number. Anything else is returned as typed,
 * so Firebase gives its usual "wrong email or password" answer.
 */
function signInAddressFor(value) {
    const typed = String(value == null ? "" : value).trim();
    if (typed.indexOf("@") !== -1) return typed;
    const mobile = normaliseMobile(typed);
    return mobile ? mobile + "@" + PHONE_SIGN_IN_DOMAIN : typed;
}

// ── Mobile numbers already on file (2026-10-05) ───────────────────────────
//
// The owner's decision: when a mobile number typed at registration is already
// on another patient's record, say so at once and still allow it (a family can
// share one number). The fact lives in phone_index/{639XXXXXXXXX}, one entry
// per number in use, holding only a date: anyone may ask about one number, the
// list cannot be read, and no entry names a patient (firestore.rules). Every
// save of a patient notes its number; Dr. Gapit's Backup tab fills it in for
// patients saved before this existed (indexPatientPhones in js/backup.js).
/** The directory entry for a mobile number, or null when it is not one. */
function phoneIndexRef(value) {
    const number = normaliseMobile(value);
    return number && typeof db !== "undefined" ? db.collection("phone_index").doc(number) : null;
}

/** Is this mobile number already on a DentCare record? False when unknown. */
function isMobileOnFile(value) {
    const ref = phoneIndexRef(value);
    if (!ref) return Promise.resolve(false);
    return ref.get().then(snap => snap.exists).catch(() => false);
}

/**
 * Note a mobile number as in use. Never throws: a patient who was saved is
 * never undone because the note could not be written.
 * @return {Promise<boolean>} true when a new entry was written
 */
function notePhoneOnFile(value) {
    const ref = phoneIndexRef(value);
    if (!ref) return Promise.resolve(false);
    return ref.get()
        .then(snap => snap.exists ? false : ref.set({ createdAt: new Date().toISOString() }).then(() => true))
        .catch(err => { console.warn("Could not note the mobile number:", err); return false; });
}
// ── end of mobile numbers on file

/** True for an account that signs in with a mobile number. */
function isPhoneSignIn(email) {
    return /@phone\.dentcare\.site$/i.test(String(email == null ? "" : email).trim());
}

/** The mobile number behind a built address, written the way people read it. */
function phoneFromSignIn(email) {
    const m = /^63(9[0-9]{2})([0-9]{3})([0-9]{4})@/.exec(String(email == null ? "" : email));
    return m ? "0" + m[1] + " " + m[2] + " " + m[3] : "";
}

/** Tidy spacing and capitalisation, so "juan  dela  CRUZ" files properly. */
function tidyPersonName(value) {
    return String(value == null ? "" : value).trim().replace(/\s+/g, " ");
}

/**
 * A patient's whole name, middle name included when they have one.
 *
 * The clinic's paper card carries the middle name, so the printed record card
 * has to as well. Older records have no middleName field at all, which is why
 * this is built from whatever is there rather than assumed.
 */
function patientFullName(p) {
    p = p || {};
    return [p.firstName, p.middleName, p.lastName]
        .map(v => String(v == null ? "" : v).trim())
        .filter(Boolean)
        .join(" ");
}

// ── After a patient's name changes (2026-09-27) ────────────────────────────
//
// Several records copy the patient's name when they are made — a booking, a
// bill, a receipt, the chat thread. Team testing found the name changed on the
// record but not everywhere else. The rule chosen with the clinic:
//
//   - what is still TO HAPPEN shows the name the patient has now: a pending or
//     approved appointment, today's queue, the chat inbox
//   - what already HAPPENED keeps the name it happened under: a finished
//     visit, a bill, a receipt, and above all the signed consent
//
// Appointments are not rewritten to do this — a patient's account may not
// write to them (firestore.rules) — so the current name is shown instead,
// from the patient record the lists already load.

/** Statuses of an appointment that has not happened yet. */
const UPCOMING_APPT_STATUSES = ["Pending", "Approved", "Confirmed",
                                "Awaiting Consultation", "In Consultation"];

/** "First Last", the way every booking has always stored patientName. */
function patientShortName(p) {
    p = p || {};
    return [p.firstName, p.lastName]
        .map(v => String(v == null ? "" : v).trim())
        .filter(Boolean)
        .join(" ");
}

/**
 * The name to show on an appointment row.
 *
 * @param {Object} appt         the appointment (needs patientName)
 * @param {Object} patient      the patient record, if loaded
 * @param {string} shownStatus  the status the row shows (Expired included)
 */
function appointmentPatientName(appt, patient, shownStatus) {
    const stored = String((appt && appt.patientName) || "").trim();
    const current = patientShortName(patient);
    const status = shownStatus || (appt && appt.status) || "";
    if (current && UPCOMING_APPT_STATUSES.indexOf(status) !== -1) return current;
    return stored || current || "Unknown";
}

/** Lower-case, no dots, single spaces: "Ma. Teresa  Cruz" ~ "ma teresa cruz". */
function nameKey(s) {
    return String(s == null ? "" : s).toLowerCase().replace(/\./g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Whether the consent was signed under a name the patient no longer has.
 *
 * Only after a recorded name change — by the patient or corrected by the
 * clinic — so a signature typed a little differently from the record at
 * registration ("Juan D. Cruz") is not reported as a rename.
 */
function consentSignedUnderOldName(p) {
    p = p || {};
    const signed = nameKey(p.medicalHistory && p.medicalHistory.consentSignature);
    if (!signed) return false;
    if (!p.nameEditedByPatientAt && !p.nameCorrectedAt) return false;
    return signed !== nameKey(patientFullName(p)) && signed !== nameKey(patientShortName(p));
}

/**
 * "Consent signed by" as the record card prints it. The signature itself is
 * never changed — it is what the patient signed, on the day — so a later name
 * is written beside it rather than over it.
 */
// ── Live screens (2026-10-02, R20) ────────────────────────────────────────
//
// The owner: when a patient books and then cancels, the freed time does not
// show until somebody refreshes, and the cancelled booking still shows as
// booked. Every list that was read once with .get() now listens instead, with
// the SAME query (same filters, window and limits), through this registry:
//
//   watchLive(key, query, onRows, onError)  open query.onSnapshot under a name;
//                                           opening a key already open closes
//                                           the old listener first, so a tab
//                                           opened twice never stacks two
//   unwatchLive(key)                        close one
//   unwatchLiveExcept(prefix)               close every key not starting with it
//   unwatchAllLive()                        close all (signing out)
//
// Every key starts with the tab or dialog it belongs to
// ("tab-staff-appointments:list"); the three tab switchers call
// unwatchLiveExcept(tabId), so leaving a tab closes its listeners.
//
// The free plan allows 50,000 reads a day. A listener costs what one .get()
// cost when it opens, then one read per document that CHANGES, which is
// cheaper than the refreshes it replaces. A browser tab hidden for five
// minutes closes its listeners, and opens them again (one fresh read) when it
// is shown: a front-desk PC left on overnight must not read through the night.
//
// Where a query has no onSnapshot (an offline test's fake), it is read once,
// exactly as before.

const LIVE_HIDDEN_PAUSE_MS = 5 * 60 * 1000;

/** key -> { open(): unsubscribe, unsub, paused } */
const liveWatches = {};
let livePaused = false;
let liveHideTimer = null;

function watchLive(key, query, onRows, onError) {
    unwatchLive(key);
    const fail = err => {
        console.error("Live " + key + " stopped:", err);
        if (typeof onError === "function") {
            try { onError(err); } catch (e) { console.error(e); }
        }
    };
    const draw = snap => {
        try { onRows(snap); } catch (err) { console.error("Redrawing " + key + " failed:", err); }
    };
    const entry = { unsub: null, paused: false, open: null };
    entry.open = () => {
        if (!query || typeof query.onSnapshot !== "function") {
            // One read, as before: there is nothing to listen with.
            Promise.resolve().then(() => query.get()).then(draw, fail);
            return null;
        }
        try {
            return query.onSnapshot(draw, err => {
                // A listener that fails says so; it never leaves an empty
                // list on screen as though it were the truth.
                if (liveWatches[key] === entry) entry.unsub = null;
                fail(err);
            });
        } catch (err) {
            fail(err);
            return null;
        }
    };
    liveWatches[key] = entry;
    if (livePaused) entry.paused = true;
    else entry.unsub = entry.open();
    return entry;
}

function unwatchLive(key) {
    const entry = liveWatches[key];
    if (!entry) return;
    delete liveWatches[key];
    if (entry.unsub) {
        try { entry.unsub(); } catch (err) { /* already closed */ }
    }
}

function unwatchLiveExcept(prefix) {
    Object.keys(liveWatches).forEach(key => {
        if (!prefix || key.indexOf(prefix) !== 0) unwatchLive(key);
    });
}

function unwatchAllLive() {
    Object.keys(liveWatches).forEach(unwatchLive);
}

/** Close every listener, keeping what they were, for a hidden page. */
function pauseLive() {
    livePaused = true;
    Object.keys(liveWatches).forEach(key => {
        const entry = liveWatches[key];
        if (entry.unsub) {
            try { entry.unsub(); } catch (err) { /* already closed */ }
            entry.unsub = null;
        }
        entry.paused = true;
    });
}

/** The page is shown again: open what was paused (one fresh read each). */
function resumeLive() {
    livePaused = false;
    Object.keys(liveWatches).forEach(key => {
        const entry = liveWatches[key];
        if (entry.paused) {
            entry.paused = false;
            entry.unsub = entry.open();
        }
    });
}

if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            if (!liveHideTimer) liveHideTimer = setTimeout(() => { liveHideTimer = null; pauseLive(); }, LIVE_HIDDEN_PAUSE_MS);
        } else {
            if (liveHideTimer) { clearTimeout(liveHideTimer); liveHideTimer = null; }
            if (livePaused) resumeLive();
        }
    });
}

// ── A dialog open on a record that changed elsewhere ─────────────────────
//
// A dialog that is open (a payment, Adjust stock) is never redrawn under the
// person's hands: only the table behind it updates. But if the record the
// dialog is about changes on another screen, the dialog says so. The
// transactions underneath already refuse a stale save; this is so nobody is
// surprised by that refusal.
//
// This screen's own save changes the record too. noteOwnWrite(path) before a
// save marks it, and a change within a few seconds of that is taken as our
// own and simply becomes what the dialog has seen.

const LIVE_OWN_WRITE_MS = 5000;
const LIVE_CHANGED_ELSEWHERE = "This was changed on another screen. Check it before saving.";

/** modalId -> { path: "billing/abc", seen: the record as the dialog showed it } */
const liveDialogRecords = {};
/** path -> when this screen last wrote it */
const liveOwnWrites = {};

function liveRecordKey(data) {
    return typeof storedValueKey === "function" ? storedValueKey(data) : JSON.stringify(data);
}

/** A dialog has opened on this record, as it is now. */
function watchDialogRecord(modalId, path, data) {
    liveDialogRecords[modalId] = { path: path, seen: liveRecordKey(data) };
    const modal = document.getElementById(modalId);
    const note = modal && modal.querySelector(".changed-elsewhere");
    if (note) note.remove();
}

/** This screen is about to write this record. */
function noteOwnWrite(path) {
    liveOwnWrites[path] = Date.now();
}

/** A live list just delivered these documents of `collection`: tell any open dialog whose record changed. */
function checkDialogRecords(collection, docs) {
    (docs || []).forEach(doc => {
        const path = collection + "/" + doc.id;
        Object.keys(liveDialogRecords).forEach(modalId => {
            const watched = liveDialogRecords[modalId];
            if (watched.path !== path) return;
            const modal = document.getElementById(modalId);
            if (!modal || !modal.classList.contains("active")) { delete liveDialogRecords[modalId]; return; }
            const now = liveRecordKey(doc.data());
            if (now === watched.seen) return;
            if (Date.now() - (liveOwnWrites[path] || 0) < LIVE_OWN_WRITE_MS) { watched.seen = now; return; }
            if (modal.querySelector(".changed-elsewhere")) return;
            const note = document.createElement("p");
            note.className = "changed-elsewhere";
            note.setAttribute("role", "status");
            note.textContent = LIVE_CHANGED_ELSEWHERE;
            const host = modal.querySelector(".modal-body") || modal.querySelector(".modal-card") || modal;
            host.insertBefore(note, host.firstChild);
        });
    });
}

// ── One record somebody is reading ───────────────────────────────────────
//
// Patient History, Treatment Logs and Charting are not redrawn while somebody
// reads them. Their record is listened to, and when it changes on another
// screen a bar says so, with "Show the latest" to reload it. The first
// snapshot is what the screen shows; a change within a few seconds of this
// screen's own save (noteOwnWrite) is its own.

/** A snapshot reduced to one comparable string: a document, or a list of them. */
function liveSnapKey(snap) {
    if (!snap) return "";
    if (typeof snap.forEach !== "function") {
        return liveRecordKey(snap.exists ? snap.data() : null);
    }
    const rows = [];
    snap.forEach(doc => rows.push(doc.id + "=" + liveRecordKey(doc.data())));
    return rows.sort().join("|");
}

/** True when this screen wrote under `prefix` ("patients/abc", "dental_records/") a moment ago. */
function wroteHereRecently(prefix) {
    const now = Date.now();
    return Object.keys(liveOwnWrites).some(path =>
        path.indexOf(prefix) === 0 && now - liveOwnWrites[path] < LIVE_OWN_WRITE_MS);
}

/**
 * Listen to an open record without redrawing it.
 * @param key         the watchLive key (starts with the tab)
 * @param query       a document or a query
 * @param barId       the "updated on another screen" bar to show
 * @param showLatest  what "Show the latest" does (reload the record)
 * @param ownPrefix   writes under this path are this screen's own
 */
function watchOpenRecord(key, query, barId, showLatest, ownPrefix) {
    let baseline = null;
    watchLive(key, query, snap => {
        const now = liveSnapKey(snap);
        if (baseline === null || now === baseline) { baseline = now; return; }
        baseline = now;
        if (ownPrefix && wroteHereRecently(ownPrefix)) return;
        showUpdatedBar(barId, showLatest);
    });
}

function showUpdatedBar(barId, showLatest) {
    const bar = document.getElementById(barId);
    if (!bar) return;
    bar.classList.remove("hidden");
    const btn = bar.querySelector("button");
    if (btn) btn.onclick = () => { bar.classList.add("hidden"); showLatest(); };
}

function hideUpdatedBar(barId) {
    const bar = document.getElementById(barId);
    if (bar) bar.classList.add("hidden");
}

// ── end of live screens ───────────────────────────────────────────────────

// ── A record moved onto an online account (2026-10-02, R17) ───────────────
//
// A record the front desk made (patients/{autoId}) can later get an online
// account. The account's record is patients/{uid}, a COPY of the old one, and
// the old visits, bills and receipts stay under the old id: a receipt can
// never be rewritten. So the copy carries mergedFrom, every id the record has
// had, and the clinic's history screens read all of them.

/** A Firestore "in" query takes at most ten values, so a record keeps at most ten ids. */
const MAX_RECORD_IDS = 10;

/** Every id this patient's history is filed under: their own, then the records they were made from. */
function patientRecordIds(id, patient) {
    const out = [];
    [id].concat(Array.isArray(patient && patient.mergedFrom) ? patient.mergedFrom : []).forEach(x => {
        const s = String(x == null ? "" : x);
        if (s && out.indexOf(s) === -1) out.push(s);
    });
    return out.slice(0, MAX_RECORD_IDS);
}

/** query.where("patientId", ...) for one id or several. One id stays "==", as it always was. */
function wherePatientIs(query, ids) {
    const list = Array.isArray(ids) ? ids : [ids];
    return list.length > 1 ? query.where("patientId", "in", list) : query.where("patientId", "==", list[0]);
}

// ── Conditions a dentist must see before treating (2026-10-02, R19) ───────
//
// ONE list, used by the Charting banner (renderSafetyBanner in js/records.js),
// Record Visit (loadVisitPatientContext in js/appointments.js) and the red box
// on Patient History (renderHistoryMedical in js/patient-history.js).
//
// It holds BOTH spellings. The web registration form stores its own names
// ("Asthma / Respiratory", "Heart Disease / Surgery"); the mobile app stores
// its own ("asthma", "heart disease"). The Charting banner used to know only
// the app's, so a web patient with asthma or heart disease raised no banner at
// all: it fired only for High Blood Pressure, Diabetes and Kidney Disease.
// Compared lower-cased and trimmed.
const CRITICAL_CONDITIONS = [
    // The web form's checklist (templates/partials/patient-registration-form.php).
    "high blood pressure", "low blood pressure", "heart disease / surgery", "diabetes",
    "asthma / respiratory", "hepatitis / liver disease", "bleeding disorders", "kidney disease",
    // The mobile app's names.
    "heart surgery", "heart attack", "heart disease", "heart murmur", "rheumatic fever",
    "bleeding problems", "blood disease", "stroke", "asthma", "aids / hiv infection",
    "hepatitis / jaundice"
];

/** True when a recorded condition is one of the critical ones, in either app's spelling. */
function isCriticalCondition(name) {
    return CRITICAL_CONDITIONS.indexOf(String(name == null ? "" : name).trim().toLowerCase()) !== -1;
}

/** Every recorded condition, the critical ones first, blanks dropped. */
function conditionsCriticalFirst(list) {
    const all = (Array.isArray(list) ? list : []).map(c => String(c == null ? "" : c).trim()).filter(Boolean);
    return all.filter(isCriticalCondition).concat(all.filter(c => !isCriticalCondition(c)));
}

function consentSignedByText(p) {
    const signed = String((p && p.medicalHistory && p.medicalHistory.consentSignature) || "").trim();
    // A record the front desk made before the patient could sign (2026-10-01).
    if (!signed && p && p.consentPending === true) return "Consent not signed yet";
    if (!signed || !consentSignedUnderOldName(p)) return signed;
    return signed + " (signed under a previous name; current name: " + patientFullName(p) + ")";
}

/**
 * Put the new name on the patient's chat thread, so the clinic inbox does not
 * list them under the old one until they next send a message.
 *
 * Best effort and never fatal: there may be no thread yet (update() then
 * fails, which is the right answer — nothing to rename), and the name itself
 * is already saved on the record by the time this runs.
 */
function syncConversationName(patientId, name) {
    if (!patientId || !name || typeof db === "undefined") return Promise.resolve();
    try {
        return Promise.resolve(db.collection("conversations").doc("conv_" + patientId)
            .update({ patientName: name }))
            .catch(() => {});
    } catch (err) {
        return Promise.resolve();   // never let the chat copy fail a saved rename
    }
}

// Modal Controllers
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add("active");
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove("active");
    }
}

// ─────────────────────────────────────────────────────────────
// Reporting libraries, loaded when first needed (2026-09-24)
// ─────────────────────────────────────────────────────────────
//
// jsPDF, its table plugin, SheetJS and JSZip were four parser-blocking
// <script> tags in the portal's <head>: roughly 1.4 MB that every patient,
// dentist and receptionist downloaded and parsed before the dashboard could
// even draw, to use only when somebody exports or prints. That was the
// largest measured cost in opening the portal.
//
// They now load the first time an export needs them, with the SAME pinned
// integrity hashes: if the CDN ever serves different bytes, the browser
// refuses to run them. A library loaded once stays loaded for the session.
const REPORT_LIBRARIES = {
    jspdf: {
        src: "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
        integrity: "sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk",
        ready: () => typeof window.jspdf !== "undefined"
    },
    autotable: {
        src: "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.29/jspdf.plugin.autotable.min.js",
        integrity: "sha384-UFvZBDnJ4PAYKb7VYwq105qNLT/F1oZzrmAmuOH2bBML35uj8CsDA2gZNKfdXIbD",
        needs: "jspdf",
        ready: () => typeof window.jspdf !== "undefined" && window.jspdf.jsPDF &&
                     window.jspdf.jsPDF.API && typeof window.jspdf.jsPDF.API.autoTable === "function"
    },
    xlsx: {
        src: "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
        integrity: "sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw",
        ready: () => typeof window.XLSX !== "undefined"
    },
    jszip: {
        src: "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
        integrity: "sha384-+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG",
        ready: () => typeof window.JSZip !== "undefined"
    }
};
const reportLibraryLoads = {};

function loadReportLibrary(name) {
    const lib = REPORT_LIBRARIES[name];
    if (!lib) return Promise.reject(new Error("Unknown library " + name));
    if (lib.ready()) return Promise.resolve();
    if (reportLibraryLoads[name]) return reportLibraryLoads[name];
    const before = lib.needs ? loadReportLibrary(lib.needs) : Promise.resolve();
    reportLibraryLoads[name] = before.then(() => new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = lib.src;
        script.integrity = lib.integrity;
        script.crossOrigin = "anonymous";
        script.referrerPolicy = "no-referrer";
        script.onload = () => (lib.ready() ? resolve() : reject(new Error(name + " did not initialise")));
        script.onerror = () => reject(new Error(name + " could not be downloaded"));
        document.head.appendChild(script);
    })).catch(err => {
        delete reportLibraryLoads[name];       // allow a retry after a failed download
        throw err;
    });
    return reportLibraryLoads[name];
}

/** Load several reporting libraries, in order. Rejects if any fails. */
function loadReportLibraries(names) {
    return names.reduce((chain, name) => chain.then(() => loadReportLibrary(name)), Promise.resolve());
}

/** For an export button: when its libraries are missing, fetch them, then
 *  run the same action once more. Returns true when it has taken over. */
function retryWithReportLibraries(names, rerun) {
    if (names.every(name => REPORT_LIBRARIES[name] && REPORT_LIBRARIES[name].ready())) return false;
    if (typeof showToast === "function") showToast("Preparing the export…", "info");
    loadReportLibraries(names).then(rerun, err => {
        console.error("Could not load the export library:", err);
        if (typeof showToast === "function") {
            showToast("The export tools could not be downloaded. Check the internet connection and try again.", "error");
        }
    });
    return true;
}

// ─────────────────────────────────────────────────────────────
// Form validation in the page, not in a browser bubble (2026-09-24)
// ─────────────────────────────────────────────────────────────
//
// A `required` field left empty made the browser draw its own grey bubble
// ("Please fill out this field") — the same kind of browser pop-up the
// in-app dialogs below replaced. Every form now shows the problem the way the
// registration form already did: a red outline on the field (the existing
// .input-error style) and a short message written under it, then focus moves
// to the first field that needs attention. The message clears as the person
// types. Text is set with textContent only.
function fieldErrorAnchor(field) {
    if (field.type === "checkbox" || field.type === "radio") {
        return field.closest("label, .radio-pill, .consent, .form-check") || field;
    }
    return field.closest(".password-input-container") || field;
}

function fieldErrorText(field) {
    const v = field.validity;
    if (v.valueMissing) {
        return field.type === "checkbox" ? "Please tick this box to continue."
             : field.tagName === "SELECT" ? "Please choose an option."
             : "Please fill in this field.";
    }
    if (v.typeMismatch && field.type === "email") return "Please enter a valid email address.";
    if (v.rangeUnderflow) return "Please enter " + field.min + " or more.";
    if (v.rangeOverflow) return "Please enter " + field.max + " or less.";
    if (v.tooShort) return "Please use at least " + field.minLength + " characters.";
    if (v.stepMismatch) return "Please enter a whole number.";
    return field.validationMessage || "Please check this field.";
}

function clearFieldError(field) {
    if (!field || !field.classList) return;
    field.removeAttribute("aria-invalid");
    const msgId = field.getAttribute("data-error-id");
    if (msgId) {
        const msg = document.getElementById(msgId);
        if (msg) msg.remove();
        field.removeAttribute("data-error-id");
        const described = (field.getAttribute("aria-describedby") || "").split(" ").filter(id => id && id !== msgId);
        if (described.length) field.setAttribute("aria-describedby", described.join(" "));
        else field.removeAttribute("aria-describedby");
    }
}

/**
 * Outline one field in red and write why under it. Used by the browser's own
 * checks (the "invalid" handler below), by flagField() for checks made in
 * code, and by the registration form's markFieldStatus() in js/auth.js, so a
 * wrong field looks the same everywhere. The message is text, never markup.
 * The first edit clears it (the input/change listener below).
 */
function showFieldError(field, message, focus) {
    if (!field || !field.classList) return;
    clearFieldError(field);
    field.classList.add("input-error");
    field.setAttribute("aria-invalid", "true");
    const msg = document.createElement("p");
    msg.className = "field-error-msg";
    msg.id = "field-error-" + Math.random().toString(36).slice(2, 10);
    msg.textContent = message;
    fieldErrorAnchor(field).insertAdjacentElement("afterend", msg);
    field.setAttribute("data-error-id", msg.id);
    field.setAttribute("aria-describedby", ((field.getAttribute("aria-describedby") || "") + " " + msg.id).trim());
    if (focus) focusFieldOnce(field);
}

// Only the first wrong field of one submit takes focus.
let fieldErrorFocused = false;
function focusFieldOnce(field) {
    if (fieldErrorFocused) return;
    fieldErrorFocused = true;
    try { field.focus({ preventScroll: true }); } catch (e) { /* hidden fields cannot focus */ }
    if (field.scrollIntoView) field.scrollIntoView({ block: "center", behavior: "auto" });
    setTimeout(() => { fieldErrorFocused = false; }, 0);
}

document.addEventListener("invalid", event => {
    const field = event.target;
    if (!field || !field.classList) return;
    event.preventDefault();                       // no browser bubble
    showFieldError(field, fieldErrorText(field), true);
}, true);

["input", "change"].forEach(type => document.addEventListener(type, event => {
    const field = event.target;
    if (field && field.getAttribute && field.getAttribute("aria-invalid") === "true" &&
        field.validity && field.validity.valid) {        // validity.valid fires no event
        field.classList.remove("input-error");
        clearFieldError(field);
    }
    // A group outlined as a whole (the time-slot boxes, a file picker) clears
    // as soon as anything inside it is changed.
    const group = field && field.closest && field.parentElement &&
        field.parentElement.closest(".input-error-group[aria-invalid='true']");
    if (group) {
        group.classList.remove("input-error");
        clearFieldError(group);
    }
}, true));

/**
 * The red outline and message for a GROUP that has no single box to point
 * at: "choose at least one time slot", "choose a file". Drawn around the
 * group, with the message under it; changing anything inside clears it.
 */
function flagGroup(groupEl, message) {
    if (!groupEl || !groupEl.classList) {
        if (typeof showToast === "function") showToast(message, "warning");
        return false;
    }
    groupEl.classList.add("input-error-group");
    showFieldError(groupEl, message, false);
    const first = groupEl.querySelector("input, select, textarea, button");
    if (first) focusFieldOnce(first);
    else if (groupEl.scrollIntoView) groupEl.scrollIntoView({ block: "center", behavior: "auto" });
    return false;
}

/**
 * The same red outline and message for a check made in code (owner request
 * 2026-09-25: "don't only show a notif but red out the needed input box, and
 * under it is the message"). Checks the browser cannot express, like "a
 * reference is required for InstaPay", call this instead of a toast. It is
 * drawn by showFieldError() exactly like a missing required field, takes
 * focus, and the first edit clears it.
 *
 * ── IT DOES NOT TOUCH THE BROWSER'S OWN VALIDITY (fixed 2026-09-25) ────────
 * It used to also call setCustomValidity(), so a re-submit before the fix
 * would be stopped by the browser as well. That record only cleared when the
 * SAME box was edited, so a problem that depended on another field stayed
 * forever: "reference required for InstaPay", then Paid by switched back to
 * Cash, and the browser kept refusing the form with the box still red (owner
 * report). Every form that uses this re-checks in code on each submit, so
 * the outline and message are all that is needed, and a stale one can never
 * block a form that is now correct. clearFieldFlag() below removes one.
 *
 * @param {HTMLElement|string} fieldOrId  the input, select or textarea (or its id)
 * @param {string} message                what to fix, shown under the field
 * @returns {false}  so a submit handler can `return flagField(...)`
 */
function flagField(fieldOrId, message) {
    const field = typeof fieldOrId === "string" ? document.getElementById(fieldOrId) : fieldOrId;
    if (!field || !field.classList) {
        if (typeof showToast === "function") showToast(message, "warning");
        return false;
    }
    showFieldError(field, message, true);
    return false;
}

/**
 * Take a red outline and its message off a field, when what made it wrong
 * was another field that has changed (Paid by back to Cash, say).
 */
function clearFieldFlag(fieldOrId) {
    const field = typeof fieldOrId === "string" ? document.getElementById(fieldOrId) : fieldOrId;
    if (!field || !field.classList) return;
    field.classList.remove("input-error");
    clearFieldError(field);
}

// ─────────────────────────────────────────────────────────────
// In-app dialogs (2026-09-24) — no browser alert/confirm/prompt
// ─────────────────────────────────────────────────────────────
//
// The owner asked that nothing in the system use the browser's own pop-ups.
// They look like a warning from the browser rather than the clinic, cannot be
// styled or read aloud well, and on a phone they block the whole tab.
//
// appDialog() draws one clinic-styled form and resolves a Promise:
//   { confirmed: true|false, values: { name: text } }
// Every string is placed with textContent / .value, never innerHTML, so a
// patient name inside a question can never become markup.
let appDialogOpen = null;

function appDialog(options) {
    const opts = options || {};
    if (appDialogOpen) appDialogOpen.finish(false);   // one at a time

    return new Promise(resolve => {
        const opener = document.activeElement;
        const overlay = document.createElement("div");
        overlay.className = "modal-overlay app-dialog active";

        const card = document.createElement("form");
        card.className = "modal-card app-dialog__card" + (opts.tone === "danger" ? " app-dialog__card--danger" : "");
        card.setAttribute("role", opts.alertOnly ? "alertdialog" : "dialog");
        card.setAttribute("aria-modal", "true");
        card.noValidate = true;
        const titleId = "app-dialog-title-" + Date.now();
        card.setAttribute("aria-labelledby", titleId);

        const head = document.createElement("div");
        head.className = "modal-header";
        const title = document.createElement("h3");
        title.id = titleId;
        title.textContent = opts.title || "Please confirm";
        head.appendChild(title);
        card.appendChild(head);

        const body = document.createElement("div");
        body.className = "modal-body app-dialog__body";
        if (opts.message) {
            const msg = document.createElement("p");
            msg.className = "app-dialog__message";
            msg.textContent = opts.message;
            body.appendChild(msg);
        }

        const inputs = [];
        let typedGate = null;       // set below once the confirm button exists
        (opts.fields || []).forEach((field, index) => {
            const label = document.createElement("label");
            const inputId = "app-dialog-field-" + index + "-" + Date.now();
            label.htmlFor = inputId;
            label.textContent = field.label || "";
            const input = document.createElement(field.multiline ? "textarea" : "input");
            input.id = inputId;
            if (!field.multiline) input.type = "text";
            if (field.multiline) input.rows = field.rows || 4;
            input.value = field.value == null ? "" : String(field.value);
            if (field.placeholder) input.placeholder = field.placeholder;
            input.maxLength = field.maxLength || 500;
            input.autocomplete = "off";
            if (field.mustEqual !== undefined) {
                // A typed confirmation (e.g. RESTORE): its own highlighted
                // panel showing the exact word, capitals as you type, and a
                // tick once it matches. The confirm button waits for that.
                const panel = document.createElement("div");
                panel.className = "app-dialog__confirm-box";
                const lead = document.createElement("p");
                lead.className = "app-dialog__confirm-lead";
                lead.append("To confirm, type ");
                const word = document.createElement("code");
                word.textContent = field.mustEqual;
                lead.appendChild(word);
                lead.append(" below.");
                const row = document.createElement("div");
                row.className = "app-dialog__confirm-row";
                const tick = document.createElement("span");
                tick.className = "app-dialog__confirm-tick";
                tick.setAttribute("aria-hidden", "true");
                tick.textContent = "\u2713";
                input.className = "app-dialog__confirm-input";
                input.spellcheck = false;
                input.setAttribute("autocapitalize", "characters");
                input.placeholder = field.placeholder || field.mustEqual;
                input.addEventListener("input", () => {
                    const at = input.selectionStart;
                    input.value = input.value.toUpperCase();
                    try { input.setSelectionRange(at, at); } catch (e) { /* not all inputs */ }
                    const match = input.value.trim() === field.mustEqual;
                    panel.classList.toggle("is-match", match);
                    if (typedGate) typedGate();
                });
                panel.appendChild(lead);
                panel.appendChild(label);
                row.appendChild(input);
                row.appendChild(tick);
                panel.appendChild(row);
                body.appendChild(panel);
            } else {
                body.appendChild(label);
                body.appendChild(input);
            }
            if (field.hint) {
                const hint = document.createElement("p");
                hint.className = "field-hint";
                hint.textContent = field.hint;
                body.appendChild(hint);
            }
            inputs.push({ field, input });
        });

        const error = document.createElement("p");
        error.className = "app-dialog__error";
        error.setAttribute("role", "alert");
        error.hidden = true;
        body.appendChild(error);
        card.appendChild(body);

        const foot = document.createElement("div");
        foot.className = "modal-footer";
        let cancel = null;
        if (!opts.alertOnly) {
            cancel = document.createElement("button");
            cancel.type = "button";
            cancel.className = "btn-secondary";
            cancel.textContent = opts.cancelLabel || "Cancel";
            foot.appendChild(cancel);
        }
        const ok = document.createElement("button");
        ok.type = "submit";
        ok.className = opts.tone === "danger" ? "btn-danger" : "";
        ok.textContent = opts.confirmLabel || (opts.alertOnly ? "OK" : "Confirm");
        foot.appendChild(ok);
        // Typed confirmations keep the confirm button disabled until every
        // required word matches exactly.
        const typed = inputs.filter(({ field }) => field.mustEqual !== undefined);
        if (typed.length) {
            typedGate = () => {
                ok.disabled = !typed.every(({ field, input }) => input.value.trim() === field.mustEqual);
            };
            typedGate();
        }
        card.appendChild(foot);
        overlay.appendChild(card);

        const finish = confirmed => {
            if (!overlay.isConnected) return;
            const values = {};
            inputs.forEach(({ field, input }) => { values[field.name] = input.value; });
            overlay.remove();
            document.removeEventListener("keydown", onKey, true);
            appDialogOpen = null;
            if (opener && typeof opener.focus === "function" && opener.isConnected) opener.focus();
            resolve({ confirmed, values });
        };

        const onKey = event => {
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                finish(!!opts.alertOnly);
            } else if (event.key === "Tab") {
                // Keep focus inside the dialog.
                const focusable = [...card.querySelectorAll("button, input, textarea")].filter(el => !el.disabled);
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            }
        };

        card.addEventListener("submit", event => {
            event.preventDefault();
            for (const { field, input } of inputs) {
                const text = input.value.trim();
                if (field.required && !text) {
                    error.textContent = (field.label || "This field") + " is required.";
                    error.hidden = false;
                    input.focus();
                    return;
                }
                if (field.mustEqual !== undefined && text !== field.mustEqual) {
                    error.textContent = field.mismatch || ("Type " + field.mustEqual + " exactly to continue.");
                    error.hidden = false;
                    input.focus();
                    return;
                }
            }
            // A check across the answers (opts.validate), e.g. "is this a real
            // name?". It returns { message, field } to keep the dialog open with
            // the reason shown, or nothing to let it close.
            if (typeof opts.validate === "function") {
                const values = {};
                inputs.forEach(({ field, input }) => { values[field.name] = input.value; });
                const problem = opts.validate(values);
                if (problem && problem.message) {
                    error.textContent = problem.message;
                    error.hidden = false;
                    const bad = inputs.find(({ field }) => field.name === problem.field);
                    (bad ? bad.input : inputs[0] ? inputs[0].input : ok).focus();
                    return;
                }
            }
            finish(true);
        });
        if (cancel) cancel.addEventListener("click", () => finish(false));
        overlay.addEventListener("mousedown", event => { if (event.target === overlay && !opts.alertOnly) finish(false); });
        document.addEventListener("keydown", onKey, true);

        appDialogOpen = { finish };
        document.body.appendChild(overlay);
        const focusTarget = inputs.length ? inputs[0].input : (opts.tone === "danger" && cancel ? cancel : ok);
        focusTarget.focus();
        if (inputs.length && !inputs[0].field.multiline) inputs[0].input.select();
    });
}

/** Yes/no question. Resolves true only when the person confirms. */
function confirmDialog(message, options) {
    return appDialog(Object.assign({ message }, options || {})).then(result => result.confirmed);
}

/** One text answer, or null when cancelled. */
function promptDialog(message, defaultValue, options) {
    const opts = options || {};
    return appDialog(Object.assign({ message, fields: [Object.assign({
        name: "value", label: opts.label || "Answer", value: defaultValue
    }, opts.field || {})] }, opts)).then(result => (result.confirmed ? result.values.value : null));
}

/** A notice that needs acknowledging. */
function alertDialog(message, options) {
    return appDialog(Object.assign({ message, alertOnly: true, title: "Notice" }, options || {})).then(() => undefined);
}

// Toast Notification Engine
function showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    
    // The toast's colour bar and this label say what kind of message it is,
    // so the text stays readable to a screen reader and in plain text.
    const labels = { info: "Note", success: "Done", warning: "Heads up", error: "Problem" };
    const label = labels[type] || labels.info;

    // ── message is ESCAPED, and that is not optional ──────────────────────
    //
    // This one line is the widest XSS sink in the app, because of who calls it.
    // Nearly every module reports through here, and several pass a value that
    // came from a patient — js/queue.js announces "<name> is already in today's
    // queue", and that name is written by the patient themselves at
    // registration.
    //
    // So a patient could choose a display name containing a script tag, walk
    // in, and have it run inside the front desk's signed-in session. A
    // clinician's session can read every patient record in the clinic. That is
    // the whole database, from a text box on the registration form.
    //
    // No caller passes markup on purpose — checked — so escaping here fixes
    // every call site at once rather than trusting each one to remember.
    // If a toast ever genuinely needs markup, give it a separate function; do
    // not take this out.
    toast.innerHTML = `
        <div class="toast-body">
            <span class="toast-label">${label}</span>
            <span class="toast-message">${escapeHtml(message)}</span>
        </div>
        <button class="toast-close" aria-label="Dismiss"
                onclick="this.parentElement.remove()">&times;</button>
    `;
    
    container.appendChild(toast);
    
    // Auto remove toast after 4.5 seconds
    setTimeout(() => {
        toast.style.animation = "toastSlideOut 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards";
        toast.addEventListener("animationend", () => toast.remove());
    }, 4500);
}

// Custom style override keyframe for slide out toast in CSS
const style = document.createElement("style");
style.innerHTML = `
@keyframes toastSlideOut {
    from { opacity: 1; transform: translateY(0) scale(1); }
    to { opacity: 0; transform: translateY(20px) scale(0.95); }
}
`;
document.head.appendChild(style);
