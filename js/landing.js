/**
 * DentCare — Landing Page Behaviour
 * ---------------------------------------------------------------------------
 * Everything on this file is about the public landing page only:
 *
 *   updateClinicStatus()  — shows whether the clinic is open right now
 *   scrollToSection()     — smooth scroll to a section, allowing for the navbar
 *   toggleMobileNav()     — opens/closes the mobile menu drawer
 *   highlightCurrentNav() — underlines the nav link you are currently reading
 *
 * Switching to the booking screen lives in js/booking.js.
 */

// ── Configuration ───────────────────────────────────────────────────────────

/**
 * Opening hours in 24-hour time, keyed by JavaScript's day number
 * (0 = Sunday … 6 = Saturday). Omit a day to mark it closed.
 * Keep this in sync with $opening_hours in templates/partials/clinic-data.php.
 */
const OPENING_HOURS = {
    1: { open: "09:00", close: "17:00" }, // Monday
    2: { open: "09:00", close: "17:00" },
    3: { open: "09:00", close: "17:00" },
    4: { open: "09:00", close: "17:00" },
    5: { open: "09:00", close: "17:00" }, // Friday
    6: { open: "09:00", close: "17:00" }, // Saturday
    // Sunday (0) is closed. Visits are strictly by appointment.
};

const STATUS_REFRESH_MS = 60000;


// ── Start-up ────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
    updateClinicStatus();
    setInterval(updateClinicStatus, STATUS_REFRESH_MS);

    window.addEventListener("scroll", highlightCurrentNav, { passive: true });
    highlightCurrentNav();

    // Wayfinding first: it moves `.reveal` from the four steps onto their
    // container, and armScrollReveal() must observe the final set.
    armWayfinding();
    armServiceFocus();
    armPaymentNames();
    armPayStage();
    armAppShowcase();
    armScrollReveal();
});

// A small, scroll-linked product story. The wordmark moves like the large
// type in the references, while the phone stays readable and the three
// highlights can be explored by mouse, touch, or keyboard.
function armAppShowcase() {
    const section = document.getElementById("download-app");
    const visual = section?.querySelector(".app-showcase__visual");
    const phone = section?.querySelector(".app-showcase__phone-wrap");
    if (!section || !visual || !phone) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const buttons = Array.from(section.querySelectorAll("[data-app-preview]"));
    const card = section.querySelector(".app-showcase__screen-card");
    const label = document.getElementById("app-preview-label");
    const title = document.getElementById("app-preview-title");
    const description = document.getElementById("app-preview-description");
    const live = document.getElementById("app-preview-live");
    const previews = {
        visit: { label: "01 / APPOINTMENTS", title: "Make a visit.", description: "Choose a time that works for you.", announcement: "Plan your next visit" },
        upcoming: { label: "02 / WHAT'S NEXT", title: "Stay in step.", description: "Keep your next visit in view.", announcement: "Know what comes next" },
        care: { label: "03 / MY CARE", title: "Care stays close.", description: "Your dental details in one place.", announcement: "Keep care close" }
    };

    buttons.forEach((button) => button.addEventListener("click", () => {
        const preview = previews[button.dataset.appPreview];
        if (!preview || button.classList.contains("is-current")) return;
        buttons.forEach((item) => {
            const current = item === button;
            item.classList.toggle("is-current", current);
            item.setAttribute("aria-pressed", String(current));
        });
        label.textContent = preview.label;
        title.textContent = preview.title;
        description.textContent = preview.description;
        live.textContent = `Preview: ${preview.announcement}.`;
        if (!reducedMotion && card?.animate) {
            card.animate([
                { opacity: .72, transform: "translateY(5px)" },
                { opacity: 1, transform: "translateY(0)" }
            ], { duration: 380, easing: "cubic-bezier(.22,.61,.36,1)" });
        }
    }));

    if (reducedMotion || typeof IntersectionObserver !== "function") return;

    let visible = false;
    let queued = false;
    let pointer = 0;

    const paint = () => {
        queued = false;
        if (!visible) return;
        const rect = section.getBoundingClientRect();
        const travel = window.innerHeight + rect.height;
        const progress = Math.max(0, Math.min(1, (window.innerHeight - rect.top) / travel));
        phone.style.setProperty("--app-shift", `${((.5 - progress) * 42).toFixed(1)}px`);
        phone.style.setProperty("--app-rotate", `${(((progress - .5) * 3) + pointer).toFixed(2)}deg`);
        section.style.setProperty("--app-wordmark-shift", `${((progress - .5) * 110).toFixed(1)}px`);
        section.style.setProperty("--app-ribbon-shift", `${((progress - .5) * 62).toFixed(1)}px`);
        visual.style.setProperty("--app-glow-shift", `${((.5 - progress) * 28).toFixed(1)}px`);
    };
    const schedule = () => {
        if (!queued && visible) {
            queued = true;
            requestAnimationFrame(paint);
        }
    };

    new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (visible) schedule();
    }, { rootMargin: "100px 0px" }).observe(section);

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });

    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
        visual.addEventListener("pointermove", (event) => {
            const rect = visual.getBoundingClientRect();
            pointer = ((event.clientX - rect.left) / rect.width - .5) * 2;
            schedule();
        });
        visual.addEventListener("pointerleave", () => {
            pointer = 0;
            schedule();
        });
    }
}


// ── Ways to pay: the desk light ─────────────────────────────────────────────

/**
 * Split each payment name so it can roll letter by letter on hover.
 *
 * Built with DOM calls, never innerHTML: the names come from clinic-data.php,
 * and text assembled into markup is exactly how an escaping bug starts.
 *
 * The real name stays in the page, visually hidden, for screen readers; the
 * two rows of letters are hidden from them. Skipped entirely on touch screens
 * and for anyone who asked for less motion, so those devices keep the plain
 * name and a simpler DOM.
 */
function armPaymentNames() {
    const names = document.querySelectorAll(".pay__name");
    if (!names.length) return;

    const canHover = window.matchMedia && window.matchMedia("(hover: hover)").matches;
    const wantsLessMotion = window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!canHover || wantsLessMotion) return;

    names.forEach((name) => {
        const text = name.textContent.trim();
        if (!text) return;

        const readable = document.createElement("span");
        readable.className = "visually-hidden";
        readable.textContent = text;

        const roll = document.createElement("span");
        roll.setAttribute("aria-hidden", "true");

        let index = 0;
        text.split(/\s+/).forEach((word, w) => {
            if (w > 0) roll.appendChild(document.createTextNode(" "));

            const wrap = document.createElement("span");
            wrap.className = "pay__word";

            ["pay__letters pay__letters--first", "pay__letters pay__letters--copy"].forEach((cls) => {
                const row = document.createElement("span");
                row.className = cls;
                Array.from(word).forEach((ch, c) => {
                    const letter = document.createElement("span");
                    letter.className = "pay__char";
                    letter.style.setProperty("--i", String(index + c));
                    letter.textContent = ch;
                    row.appendChild(letter);
                });
                wrap.appendChild(row);
            });

            index += word.length + 1;
            roll.appendChild(wrap);
        });

        name.textContent = "";
        name.appendChild(readable);
        name.appendChild(roll);
    });
}

/**
 * Pause the swaying light while the band is off screen. Infinite CSS
 * animations keep running when nobody can see them; on a phone that is
 * battery spent for nothing.
 */
function armPayStage() {
    const stage = document.querySelector(".pay-stage");
    if (!stage || typeof IntersectionObserver !== "function") return;

    new IntersectionObserver((entries) => {
        stage.classList.toggle("is-offscreen", !entries[0].isIntersecting);
    }, { rootMargin: "120px 0px" }).observe(stage);
}


// ── Services: one area of care in focus at a time ───────────────────────────

/**
 * As the page scrolls, lift whichever service is nearest the middle of the
 * screen and let the others recede.
 *
 * WHY IT IS NOT A SCROLL LISTENER
 * The obvious way to find "the row nearest the centre" is to measure them all
 * on every scroll event, which is exactly the per-frame layout reading this
 * page is built to avoid. Instead a single IntersectionObserver watches a thin
 * band across the middle of the viewport: a row entering that band becomes the
 * focused one. The browser reports the crossing; nothing runs in between.
 *
 * WHY THE DIMMING IS BEHIND A CLASS
 * `.is-focusing` is added here and nowhere else. Without JavaScript no service
 * is ever dimmed — all four stay at full strength, which is the only
 * acceptable resting state for a list of what the clinic actually treats.
 */
function armServiceFocus() {
    const list = document.querySelector(".svc-rows");
    if (!list) return;

    const rows = Array.from(list.querySelectorAll(".svc-row"));
    if (rows.length < 2) return;

    if (typeof IntersectionObserver !== "function") return;

    const wantsLessMotion = window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (wantsLessMotion) return;          // no dimming, no lifting

    list.classList.add("is-focusing");

    const setFocus = (row) => {
        rows.forEach((r) => r.classList.toggle("is-focus", r === row));
    };

    // A band through the middle of the viewport. Negative margins top and
    // bottom shrink the observer's root to roughly the centre third, so a row
    // only counts as focused once it is genuinely the one being read.
    const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) setFocus(entry.target);
        });
    }, { rootMargin: "-38% 0px -38% 0px", threshold: 0 });

    rows.forEach((row) => io.observe(row));

    // Hovering is a deliberate act and should win over where the page happens
    // to be scrolled to.
    rows.forEach((row) => {
        row.addEventListener("mouseenter", () => setFocus(row));
    });

    // Nothing is in the band until the reader scrolls there. Starting with the
    // first service lit means the section never appears uniformly greyed out.
    setFocus(rows[0]);

    // Transitions on the next frame, so the resting state is painted without
    // animating into it — otherwise every page load opens with all four
    // services visibly fading down together. A tab that is not rendering never
    // reaches this, and there the focus simply snaps, which is correct.
    requestAnimationFrame(() => {
        requestAnimationFrame(() => list.classList.add("is-focus-ready"));
    });
}


// ── Wayfinding: one step at a time ──────────────────────────────────────────

/**
 * State for the wayfinding walk. Module-level rather than on the element,
 * because wayfindStep() is called from inline onclick and has to find it.
 */
let wayfindIndex = 0;

/**
 * Turn the stacked wayfinding steps into a stepped display.
 *
 * PROGRESSIVE ENHANCEMENT IS THE POINT HERE.
 * Every CSS rule that hides a step sits behind `.wayfind--live`, which only
 * this function adds. If the script does not run, all four steps stack and
 * the whole route is still readable — which is what this section did before.
 * A patient standing in a mall corridor looking for a door must never be shown
 * one picture with no way to reach the next.
 */
function armWayfinding() {
    const root = document.getElementById("wayfind");
    if (!root) return;

    const steps = root.querySelectorAll(".wayfind__step");
    if (steps.length < 2) return;          // nothing to step through

    root.classList.add("wayfind--live");

    // HAND THE REVEAL OVER TO THE CONTAINER.
    //
    // Each figure carries `.reveal` in the markup, which is right when there
    // is no script and the four steps stack. But once this is a carousel the
    // scroll-reveal rule `.reveal-armed .landing .reveal.is-in` — specificity
    // (0,4,0) — outranks the carousel's own hiding rule at (0,3,0), so the
    // observer would un-hide all four frames on top of each other.
    //
    // Escalating the carousel's specificity would win the fight and leave the
    // cause in place. The real problem is ownership: with the carousel live,
    // the individual steps are no longer things that reveal — the display as
    // a whole is. So the class moves to the container.
    steps.forEach((step) => step.classList.remove("reveal", "is-in"));
    root.classList.add("reveal");

    // The frames are stacked on top of each other, so every one of them is
    // "in view" as far as the browser is concerned. Leaving them lazy would
    // still work, but eager loading means pressing Next never shows an empty
    // box on a slow connection.
    root.querySelectorAll(".wayfind__frame img").forEach((img) => {
        img.loading = "eager";
    });

    // Arrow keys once the control has focus. Cheap, and the obvious thing to
    // try after clicking one of them.
    root.querySelector(".wayfind__nav")?.addEventListener("keydown", (event) => {
        if (event.key === "ArrowRight") { wayfindStep(1); event.preventDefault(); }
        if (event.key === "ArrowLeft") { wayfindStep(-1); event.preventDefault(); }
    });

    showWayfindStep(0);

    // Arm the transitions one frame after the starting state has painted.
    // Declaring them on .wayfind--live instead would make every page load
    // begin with four stacked frames fading out together, because adding that
    // class IS a change from visible to hidden.
    //
    // Two frames, not one: the first lets the browser apply the initial state,
    // the second guarantees it has been through style resolution before
    // transitions start mattering.
    //
    // requestAnimationFrame does not run in a tab that is not being rendered,
    // so a frozen tab simply never arms and the carousel switches instantly.
    // That is the right way to fail here — no animation is fine, four
    // overlapping photographs stuck mid-fade is not.
    requestAnimationFrame(() => {
        requestAnimationFrame(() => root.classList.add("wayfind--ready"));
    });
}

/**
 * Show one step and update the controls.
 *
 * @param {number} index Zero-based step to show. Clamped, not wrapped.
 */
function showWayfindStep(index) {
    const root = document.getElementById("wayfind");
    if (!root) return;

    const steps = Array.from(root.querySelectorAll(".wayfind__step"));
    if (!steps.length) return;

    // Clamped rather than wrapped: this is a route with a start and an end,
    // and a disabled arrow says "this is the door" better than looping the
    // patient back out to the street.
    wayfindIndex = Math.max(0, Math.min(steps.length - 1, index));

    steps.forEach((step, i) => {
        step.classList.toggle("is-current", i === wayfindIndex);
        // Hidden steps are taken out of the tab order and off the
        // accessibility tree; otherwise a keyboard user tabs into pictures
        // they cannot see.
        step.setAttribute("aria-hidden", i === wayfindIndex ? "false" : "true");
    });

    const count = document.getElementById("wayfind-count");
    if (count) count.textContent = `Step ${wayfindIndex + 1} of ${steps.length}`;

    const prev = document.getElementById("wayfind-prev");
    const next = document.getElementById("wayfind-next");
    if (prev) prev.disabled = wayfindIndex === 0;
    if (next) next.disabled = wayfindIndex === steps.length - 1;
}

/**
 * Move through the walk. Bound to the arrows via inline onclick.
 *
 * @param {number} delta -1 for the previous step, 1 for the next.
 */
function wayfindStep(delta) {
    showWayfindStep(wayfindIndex + delta);
}


// ── Reveal on scroll ────────────────────────────────────────────────────────

/**
 * Fade each .reveal block up 10px as it enters the viewport, every time it
 * enters — scrolling back up replays the reveal rather than finding the page
 * already inert.
 *
 * Also switches the navigation bar between its two states.
 *
 * WHY IT IS BUILT THIS WAY
 * The clinic runs on whatever phone the patient walked in with, and the brief
 * was explicit that the page must not stutter on a weak device. So:
 *
 *   · IntersectionObserver, not a scroll listener. The browser decides when to
 *     tell us; nothing runs on every frame of a scroll.
 *   · Only opacity and transform animate. Both are composited on the GPU and
 *     neither triggers layout, so a reveal costs nothing measurable.
 *   · Blocks are NOT unobserved after firing — that is what makes the reveal
 *     replay in both directions. Keeping ~20 observer entries alive costs
 *     nothing next to the scroll listener this design avoids.
 *
 * WHY THE CLASS IS ADDED BY SCRIPT
 * The hiding rule lives behind .reveal-armed, which only this function adds.
 * With JavaScript off, blocked, or still parsing, nothing is ever hidden and
 * the page reads normally — a patient looking for a phone number should never
 * meet a blank screen because an observer did not run.
 */
function armScrollReveal() {
    const root = document.documentElement;
    const canObserve = typeof IntersectionObserver === "function";

    // ── The navigation bar ──────────────────────────────────────────────────
    // The bar is position:fixed and sits directly under the top bar at rest,
    // so it needs that bar's real height. Measuring beats hard-coding: the
    // address wraps to two lines on a narrow phone and a fixed 44px would
    // leave a gap or an overlap.
    //
    // This runs even when the visitor asked for less motion. Turning the bar
    // into a readable surface is not decoration — white-on-photograph stops
    // being legible the moment the page scrolls onto the cream ground, so the
    // links would simply disappear. Reduced motion removes the ANIMATION, via
    // the media query in landing.css; it must not remove the state change.
    const topbar = document.querySelector(".topbar");

    const measureTopbar = () => {
        if (!topbar) return;
        root.style.setProperty(
            "--topbar-h",
            Math.round(topbar.getBoundingClientRect().height) + "px"
        );
    };
    measureTopbar();

    if (typeof ResizeObserver === "function" && topbar) {
        new ResizeObserver(measureTopbar).observe(topbar);
    } else {
        window.addEventListener("resize", measureTopbar);
    }

    // Observing the top bar itself, NOT a scroll listener: the browser reports
    // the state change once instead of us asking on every frame of a scroll.
    if (canObserve && topbar) {
        new IntersectionObserver((entries) => {
            root.classList.toggle("is-stuck", !entries[0].isIntersecting);
        }, { threshold: 0 }).observe(topbar);
    }

    // ── Reveal on scroll ────────────────────────────────────────────────────
    const blocks = document.querySelectorAll(".reveal");
    if (!blocks.length) return;

    // No observer support, or the visitor asked for less motion: leave every
    // block visible and do nothing else.
    const wantsLessMotion = window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (wantsLessMotion || !canObserve) return;

    // Siblings in one grid arrive in sequence rather than as a block. Capped
    // at four steps so a long list never leaves the reader waiting on the last
    // card, and written to a custom property the stylesheet reads — no inline
    // transition strings to keep in sync with the CSS.
    const STEP_MS = 90;
    const MAX_STEPS = 4;
    const seen = new Map();

    blocks.forEach((block) => {
        const parent = block.parentElement;
        const index = seen.get(parent) || 0;
        seen.set(parent, index + 1);
        if (index > 0) {
            block.style.setProperty("--d", Math.min(index, MAX_STEPS) * STEP_MS + "ms");
        }
    });

    root.classList.add("reveal-armed");

    let observerResponded = false;
    let revealFallback = false;
    const hero = document.querySelector(".hero");

    // REPLAYS BOTH WAYS.
    //
    // This used to unobserve each block the moment it appeared, so every
    // reveal was one-shot: scroll to the bottom, scroll back up, and the page
    // was inert until you reloaded it. The animation is most of what makes
    // the page feel alive, and it was only ever seen once per visit.
    //
    // So the class is TOGGLED rather than set, and nothing is unobserved: a
    // block that leaves the viewport is re-armed and animates again when it
    // comes back, whichever direction you came from.
    //
    // The cost of not unobserving is a handful of observer entries kept alive
    // for the life of the page — the browser is already tracking them, and it
    // is nothing next to a scroll listener, which is what this avoids.
    const io = new IntersectionObserver((entries) => {
        // A working observer also reports sections that are NOT in view.
        // The full-screen hero intentionally leaves every reveal below the
        // fold, so no visible section is not evidence of failed animation.
        observerResponded = true;
        if (revealFallback) {
            root.classList.add("reveal-armed");
            revealFallback = false;
        }
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add("is-in");
            } else {
                entry.target.classList.remove("is-in");
            }
        });
    }, {
        // Fires a little before the block reaches the fold, so the movement is
        // finished by the time it is properly in view. Because entry and exit
        // are decided by the same threshold, the -8% bottom margin also means
        // a block re-arms slightly after it has left, not on the exact pixel
        // it appeared — which is what stops it flickering at the boundary.
        rootMargin: "0px 0px -8% 0px",
        threshold: 0.08
    });

    blocks.forEach((block) => io.observe(block));

    // ── Failsafe ────────────────────────────────────────────────────────────
    // Every hiding rule on this page sits behind .reveal-armed, so dropping
    // that one class un-hides the hero AND every reveal block at once.
    //
    // This is not hypothetical. All of the above depends on the browser
    // actually running its rendering steps, and there are real states where it
    // does not — a hidden or backgrounded tab freezes the animation timeline
    // and stops delivering observer callbacks entirely. If that happens after
    // we have armed, the patient is left looking at a blank page where the
    // phone number should be.
    //
    // Fall back only if the observer has not responded, not if the visitor
    // is still reading the hero. A late callback (e.g. when a background tab
    // becomes visible) restores scroll motion without requiring a refresh.
    // Keep the hero readable during that recovery rather than replaying it.
    window.setTimeout(() => {
        if (!observerResponded) {
            if (hero) hero.classList.add("hero--motion-fallback");
            revealFallback = true;
            root.classList.remove("reveal-armed");
        }
    }, 2500);

    // ── Second failsafe: the hero specifically ──────────────────────────────
    // The check above only fires when the observer never responded.
    // The hero does not use the observer at all — it is hidden by CSS and
    // brought back by a keyframe animation. So if that animation fails while
    // the observer keeps working normally, `observerResponded` is true, the check
    // above never runs, and the headline, the sentence and BOTH buttons stay
    // invisible forever on an otherwise healthy page.
    //
    // That is not hypothetical either: a build step once prefixed the
    // @keyframes at-rule with a class, which makes it invalid. The browser
    // dropped it, `animation: heroRise` referenced nothing, and the hero sat
    // at opacity 0 while every other section faded in correctly.
    //
    // So verify the outcome rather than trusting the mechanism: once the
    // animation has had well past its 0.58s delay plus 0.95s duration, if the
    // headline is still transparent, show the hero only. A failed or paused
    // hero animation must not switch off the separate scroll animations.
    const heroTitle = document.querySelector(".hero__title");
    if (heroTitle) {
        window.setTimeout(() => {
            const painted = parseFloat(getComputedStyle(heroTitle).opacity);
            if (!(painted > 0.01) && hero) hero.classList.add("hero--motion-fallback");
        }, 2000);
    }
}


// ── Clinic open / closed badge ──────────────────────────────────────────────

/**
 * Convert an "HH:MM" string into minutes since midnight.
 *
 * @param   {string} time  e.g. "09:30"
 * @returns {number}       e.g. 570
 */
function toMinutes(time) {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
}

/**
 * Work out whether the clinic is open at a given moment.
 *
 * @param   {Date} now
 * @returns {{isOpen: boolean, closesAt: string|null}}
 */
function getClinicStatus(now) {
    // The badge describes the clinic in Naga, regardless of the visitor's
    // device timezone. formatToParts also crosses midnight/day boundaries.
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Manila", weekday: "short", hour: "2-digit",
        minute: "2-digit", hourCycle: "h23"
    }).formatToParts(now);
    const part = type => parts.find(item => item.type === type)?.value;
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(part("weekday"));
    const today = OPENING_HOURS[day];
    if (!today) {
        return { isOpen: false, closesAt: null };
    }

    const minutesNow = Number(part("hour")) * 60 + Number(part("minute"));
    const isOpen = minutesNow >= toMinutes(today.open) && minutesNow < toMinutes(today.close);

    return { isOpen, closesAt: isOpen ? formatTime(today.close) : null };
}

/**
 * Format "18:00" as "6:00 PM" for display.
 *
 * @param   {string} time
 * @returns {string}
 */
function formatTime(time) {
    const [hours, minutes] = time.split(":").map(Number);
    const period = hours >= 12 ? "PM" : "AM";
    const hour12 = hours % 12 || 12;
    return `${hour12}:${String(minutes).padStart(2, "0")} ${period}`;
}

/**
 * Paint the current open/closed state into the top bar badge.
 */
function updateClinicStatus() {
    const badge = document.getElementById("clinic-status");
    const label = document.getElementById("clinic-status-text");
    if (!badge || !label) return;

    const { isOpen, closesAt } = getClinicStatus(new Date());

    badge.classList.toggle("is-closed", !isOpen);
    label.textContent = isOpen
        ? "Open now · Mon–Sat 9:00 AM–5:00 PM"
        : "Closed now · Mon–Sat 9:00 AM–5:00 PM";
}


// ── Navigation ──────────────────────────────────────────────────────────────

/**
 * Smooth-scroll to a section, leaving room for the sticky navbar.
 * If the booking screen is open, return to the landing page first.
 *
 * @param {string} sectionId
 */
function scrollToSection(sectionId) {
    const bookingScreen = document.getElementById("screen-booking");
    const bookingIsOpen = bookingScreen && !bookingScreen.classList.contains("hidden");

    if (bookingIsOpen) {
        closeBookingPage();
        // Wait for the landing page to be visible before measuring positions.
        window.setTimeout(() => scrollToSection(sectionId), 100);
        return;
    }

    const target = document.getElementById(sectionId);
    if (!target) return;

    const navbar = document.querySelector(".navbar");
    const offset = navbar ? navbar.offsetHeight : 0;
    const top = target.getBoundingClientRect().top + window.pageYOffset - offset;

    window.scrollTo({ top, behavior: "smooth" });
    closeMobileNav();
}

/**
 * Open or close the mobile navigation drawer.
 */
function toggleMobileNav() {
    const menu = document.getElementById("navbar-menu");
    const toggle = document.querySelector(".navbar__toggle");
    if (!menu) return;

    const isOpen = menu.classList.toggle("is-open");
    if (toggle) toggle.setAttribute("aria-expanded", String(isOpen));
}

/**
 * Close the mobile navigation drawer if it is open.
 */
function closeMobileNav() {
    const menu = document.getElementById("navbar-menu");
    const toggle = document.querySelector(".navbar__toggle");
    if (!menu) return;

    menu.classList.remove("is-open");
    if (toggle) toggle.setAttribute("aria-expanded", "false");
}

// A tap anywhere outside the open menu, or Escape, closes it (2026-09-16).
// Without this the menu stayed open over the page until the button was found
// again.
document.addEventListener("click", (e) => {
    const menu = document.getElementById("navbar-menu");
    if (!menu || !menu.classList.contains("is-open")) return;
    if (menu.contains(e.target) || (e.target.closest && e.target.closest(".navbar__toggle"))) return;
    closeMobileNav();
});

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMobileNav();
});

/**
 * Mark the nav link whose section is currently on screen as active.
 */
function highlightCurrentNav() {
    const links = document.querySelectorAll(".navbar__link[data-section]");
    if (!links.length) return;

    const navbar = document.querySelector(".navbar");
    // A section becomes active once its opening content is in the upper part
    // of the viewport. This also tolerates fonts and images settling after a
    // long smooth scroll to a lower section.
    const offset = (navbar ? navbar.offsetHeight : 0) + Math.min(180, window.innerHeight * .2);

    let currentId = links[0].dataset.section;

    links.forEach((link) => {
        const section = document.getElementById(link.dataset.section);
        if (section && section.getBoundingClientRect().top <= offset) {
            currentId = link.dataset.section;
        }
    });

    links.forEach((link) => {
        link.classList.toggle("is-active", link.dataset.section === currentId);
    });
}
