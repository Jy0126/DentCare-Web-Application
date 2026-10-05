/**
 * DentCare — Booking Screen Behaviour
 * ---------------------------------------------------------------------------
 * Two responsibilities, both belonging to the booking/registration screen:
 *
 *   1. Screen switching  — showing and hiding #screen-booking
 *   2. Signature pad     — the draw-your-signature canvas in step 3
 *
 * The multi-step form logic (validation, submission) lives in js/auth.js.
 */

// ── 1. Screen switching ─────────────────────────────────────────────────────

/**
 * Show the booking screen and hide the landing page.
 *
 * @param {"login"|"register"} mode  Which form to show first.
 */
function openBookingPage(mode = "register", opts = {}) {
    const landing = document.getElementById("screen-landing");
    const booking = document.getElementById("screen-booking");
    if (!landing || !booking) return;

    // Any route into this form that is NOT the Walk-In button is an ordinary
    // registration, so clear a walk-in flag left behind by an abandoned one.
    //
    // The front desk shares one tablet. Somebody tapped Walk-In, changed their
    // mind, went back, and the next patient — who booked online days ago — was
    // silently added to today's queue as a walk-in, because the sessionStorage
    // flag outlived the form it was set for. The Walk-In button now says so
    // explicitly via opts.walkIn; everything else cleans up after it.
    if (!opts.walkIn && typeof clearWalkInIntake === "function") {
        clearWalkInIntake();
    }
    if (!opts.walkIn) {
        const staleBanner = document.getElementById("walkin-banner");
        if (staleBanner) staleBanner.classList.add("hidden");
    }

    landing.classList.add("hidden");
    booking.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });

    // toggleAuthForm() is defined in js/auth.js.
    if (typeof toggleAuthForm === "function") {
        toggleAuthForm(mode);
    }
}

/**
 * Hide the booking screen and return to the landing page.
 */
function closeBookingPage() {
    const landing = document.getElementById("screen-landing");
    const booking = document.getElementById("screen-booking");
    if (!landing || !booking) return;

    // Backing out abandons the intake, walk-in or not. Leaving the flag set
    // here is what let it reach the next person at the front desk.
    if (typeof clearWalkInIntake === "function") clearWalkInIntake();
    const banner = document.getElementById("walkin-banner");
    if (banner) banner.classList.add("hidden");

    booking.classList.add("hidden");
    landing.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
}


// ── 2. Signature pad ────────────────────────────────────────────────────────
//
// Rewritten 2026-09-30 (client revision 10). The pad is taller on a phone and
// as wide as the form, so its size on screen now varies a great deal, and the
// saved image used to be whatever size the pad happened to be: a 300 by 160
// picture from a phone, which the record card then stretched to the 600 by 160
// shape it draws a signature in. So the pad now remembers the strokes
// themselves, and what is saved is always those strokes drawn onto a 600 by
// 160 image, scaled by one factor and centred. The shape the patient drew is
// the shape that is filed, on any screen.

// Per canvas since 2026-10-01 (client revision 16): the same pad also takes a
// consent signature on Patient History, collected in person for a record the
// front desk made. Each canvas keeps its own strokes; #sig-canvas, the
// registration form's pad, is the default, so every existing caller is
// unchanged.

/** The registration pad, the default for every function below. */
const DEFAULT_SIGNATURE_CANVAS = "sig-canvas";

/** True once the registration pad's listeners are attached (tests wait on it). */
let signaturePadReady = false;

/** The saved image: the size js/patient-history.js draws a signature at. */
const SIGNATURE_IMAGE = { width: 600, height: 160 };

/**
 * Each pad's state, by canvas id.
 *
 *   strokes  what has been drawn, as strokes of points, in the coordinates of
 *            the pad as it was when the signature was started (base)
 *   base     that pad's size
 *   view     how a stroke point becomes a point on today's pad: one scale
 *            factor and an offset that centres it, worked out from base every
 *            time, never from the previous view, so turning a phone back and
 *            forth does not shrink the mark a little more with each turn
 *   padSize  the drawing buffer's current size
 *   hasInk   whether anything was drawn at all. A canvas never touched still
 *            exports a valid PNG, a blank one; without this a patient who
 *            typed their name would have an empty image filed as a signature
 *   ready    listeners attached
 */
const signaturePads = {};

function signaturePad(canvasId) {
    const id = canvasId || DEFAULT_SIGNATURE_CANVAS;
    return signaturePads[id] || (signaturePads[id] = {
        strokes: [], base: { width: 0, height: 0 }, view: { scale: 1, x: 0, y: 0 },
        padSize: { width: 0, height: 0 }, hasInk: false, ready: false
    });
}

/** The canvas id a caller meant: a string, or the registration pad. */
function signatureCanvasId(canvasId) {
    return typeof canvasId === "string" && canvasId ? canvasId : DEFAULT_SIGNATURE_CANVAS;
}

/** Ink, not the interface's blue: the clinic's paper cards are signed in black. */
function signaturePen(context, width) {
    context.lineWidth = width;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#111111";
}

/** Draw a pad's strokes onto a canvas, moved and scaled by one factor. */
function drawSignatureStrokes(context, strokes, scale, offsetX, offsetY) {
    strokes.forEach(stroke => {
        if (!stroke.length) return;
        context.beginPath();
        context.moveTo(stroke[0].x * scale + offsetX, stroke[0].y * scale + offsetY);
        // A tap with no movement is still a mark: a dot.
        if (stroke.length === 1) context.lineTo(stroke[0].x * scale + offsetX + 0.1, stroke[0].y * scale + offsetY);
        for (let i = 1; i < stroke.length; i++) {
            context.lineTo(stroke[i].x * scale + offsetX, stroke[i].y * scale + offsetY);
        }
        context.stroke();
    });
}

/**
 * Match the drawing buffer to the pad's real size on screen, and keep what
 * was drawn.
 *
 * Without the match a stroke appears offset from the finger. The pad changes
 * size when a phone is turned, and setting a canvas's size wipes it, so the
 * strokes are drawn again in the new pad, scaled by one factor and centred.
 * Turning the phone never loses a signature.
 */
function fitSignaturePad(canvasId) {
    const id = signatureCanvasId(canvasId);
    const canvas = document.getElementById(id);
    if (!canvas) return;
    const pad = signaturePad(id);

    const bounds = canvas.getBoundingClientRect();
    const width = Math.round(bounds.width) || SIGNATURE_IMAGE.width;
    const height = Math.round(bounds.height) || SIGNATURE_IMAGE.height;
    if (width === pad.padSize.width && height === pad.padSize.height &&
        canvas.width === width && canvas.height === height) return;

    canvas.width = width;
    canvas.height = height;
    pad.padSize = { width: width, height: height };

    if (pad.strokes.length && pad.base.width && pad.base.height) {
        const scale = Math.min(width / pad.base.width, height / pad.base.height);
        pad.view = {
            scale: scale,
            x: (width - pad.base.width * scale) / 2,
            y: (height - pad.base.height * scale) / 2
        };
    } else {
        pad.view = { scale: 1, x: 0, y: 0 };
    }

    const context = canvas.getContext("2d");
    signaturePen(context, 2.5);
    drawSignatureStrokes(context, pad.strokes, pad.view.scale, pad.view.x, pad.view.y);
}

/**
 * Prepare a signature canvas for drawing with a mouse or a finger.
 * Called by js/auth.js when the visitor reaches step 3, and by
 * js/patient-history.js for a consent collected in person.
 */
function initSignatureCanvas(canvasId) {
    const id = signatureCanvasId(canvasId);
    const canvas = document.getElementById(id);
    if (!canvas) return;
    const pad = signaturePad(id);

    // Measured every time the pad is shown, not only the first: it has no
    // size while hidden.
    fitSignaturePad(id);
    if (pad.ready) return;

    const context = canvas.getContext("2d");
    let isDrawing = false;

    /** The pointer relative to the canvas, for both mouse and touch events. */
    function getPointerPosition(event) {
        const bounds = canvas.getBoundingClientRect();
        const point = event.touches && event.touches.length ? event.touches[0] : event;
        return {
            x: point.clientX - bounds.left,
            y: point.clientY - bounds.top,
        };
    }

    /** A point on today's pad, in the coordinates the strokes are kept in. */
    function toSignaturePoint(x, y) {
        return { x: (x - pad.view.x) / pad.view.scale, y: (y - pad.view.y) / pad.view.scale };
    }

    function startStroke(event) {
        fitSignaturePad(id);
        isDrawing = true;
        pad.hasInk = true;
        const { x, y } = getPointerPosition(event);
        // The first stroke of a signature fixes the pad it is measured against.
        if (!pad.strokes.length) {
            pad.base = { width: pad.padSize.width, height: pad.padSize.height };
            pad.view = { scale: 1, x: 0, y: 0 };
        }
        pad.strokes.push([toSignaturePoint(x, y)]);
        signaturePen(context, 2.5);
        context.beginPath();
        context.moveTo(x, y);
    }

    function continueStroke(event) {
        if (!isDrawing) return;
        event.preventDefault(); // stop the page scrolling while signing on mobile
        const { x, y } = getPointerPosition(event);
        pad.strokes[pad.strokes.length - 1].push(toSignaturePoint(x, y));
        context.lineTo(x, y);
        context.stroke();
    }

    function endStroke() {
        isDrawing = false;
    }

    canvas.addEventListener("mousedown", startStroke);
    canvas.addEventListener("mousemove", continueStroke);
    canvas.addEventListener("mouseup", endStroke);
    canvas.addEventListener("mouseleave", endStroke);

    canvas.addEventListener("touchstart", startStroke, { passive: false });
    canvas.addEventListener("touchmove", continueStroke, { passive: false });
    canvas.addEventListener("touchend", endStroke);

    // A phone being turned, or a window being resized.
    window.addEventListener("resize", () => fitSignaturePad(id));

    pad.ready = true;
    if (id === DEFAULT_SIGNATURE_CANVAS) signaturePadReady = true;
}

/** Wipe a signature canvas so the person can sign again. */
function clearSignatureCanvas(canvasId) {
    const id = signatureCanvasId(canvasId);
    const pad = signaturePad(id);
    pad.strokes = [];
    pad.hasInk = false;
    pad.base = { width: 0, height: 0 };
    pad.view = { scale: 1, x: 0, y: 0 };

    const canvas = document.getElementById(id);
    if (!canvas) return;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
}

/** Whether anything has been drawn on a pad. */
function signatureHasBeenDrawn(canvasId) {
    const pad = signaturePad(signatureCanvasId(canvasId));
    return pad.hasInk && pad.strokes.length > 0;
}

/**
 * The drawn signature as a PNG data URL, or "" if nothing was drawn.
 *
 * The form invites the patient to "draw your signature below or type your full
 * legal name". Only the typed name was ever read, so anyone who followed the
 * first half of that instruction had their signature silently discarded and
 * the consent recorded with no mark against it at all.
 *
 * Returns "" rather than a blank image when the pad was untouched, so an empty
 * canvas is never mistaken for a signature.
 *
 * Always a 600 by 160 image, whatever size the pad is on screen: the pad as
 * the patient saw it, scaled by one factor to fit and centred, so the mark
 * keeps its shape.
 */
function getSignatureDataUrl(canvasId) {
    const id = signatureCanvasId(canvasId);
    const canvas = document.getElementById(id);
    const pad = signaturePad(id);
    if (!canvas || !pad.hasInk || !pad.strokes.length) return "";

    try {
        // The pad the signature was started on, not the pad as it is now.
        const padWidth = pad.base.width || pad.padSize.width || canvas.width || SIGNATURE_IMAGE.width;
        const padHeight = pad.base.height || pad.padSize.height || canvas.height || SIGNATURE_IMAGE.height;
        const scale = Math.min(SIGNATURE_IMAGE.width / padWidth, SIGNATURE_IMAGE.height / padHeight);

        const image = document.createElement("canvas");
        image.width = SIGNATURE_IMAGE.width;
        image.height = SIGNATURE_IMAGE.height;
        const context = image.getContext("2d");
        // The line keeps its weight relative to the mark, within what prints.
        signaturePen(context, Math.max(1.5, 2.5 * scale));
        drawSignatureStrokes(context, pad.strokes, scale,
            (SIGNATURE_IMAGE.width - padWidth * scale) / 2,
            (SIGNATURE_IMAGE.height - padHeight * scale) / 2);
        return image.toDataURL("image/png");
    } catch (err) {
        // Losing the whole registration over a signature is not a trade worth
        // making: the typed name still stands.
        console.error("Could not read the signature pad:", err);
        return "";
    }
}
