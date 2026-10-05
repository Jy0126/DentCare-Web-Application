// ─────────────────────────────────────────────────────────────
// Notification bell (2026-09-24)
// ─────────────────────────────────────────────────────────────
//
// One bell per role, in the sidebar brand row (the top bar on phones). The
// owner chose DERIVED notifications: nothing here writes a notification
// document. Each item is computed live from data the signed-in role can
// already read under the deployed Firestore Rules:
//
//   staff / dentist  upcoming appointments (new bookings, patient reschedule
//                    requests, cancellations), inventory (low stock, expiry),
//                    and the unread-message total already kept by js/clinic.js
//   patient          their own appointments (approved, not approved, moved or
//                    cancelled by the clinic, missed, visit recorded,
//                    today/tomorrow reminders) and their unread messages
//
// Read/unread is a per-account list of item keys in this browser's
// localStorage. It is a view preference, not a clinical record, and it is
// why no Rules change was needed. The honest limit: marking something read on
// the front-desk PC does not mark it read on the tablet.
//
// A key names the exact state it reports ("status:<id>:Approved:<date>:<time>")
// so a later change to the same appointment produces a new, unread item.
// Nothing is pushed while the browser is closed; this is an in-app bell.

const NOTIF_SEEN_PREFIX = "dentcare.notifSeen.";
const NOTIF_CLEARED_PREFIX = "dentcare.notifCleared.";
const NOTIF_SEEN_CAP = 400;
const NOTIF_CLEARED_CAP = 2000;
const NOTIF_EXPIRY_WARN_DAYS = 30;
const NOTIF_CLINIC_APPT_LIMIT = 300;
const NOTIF_TICK_MS = 5 * 60 * 1000;

let notifRole = "";
let notifUid = "";
let notifUnsubs = [];
let notifTimer = null;
let notifItems = [];
let notifSeen = new Set();
let notifCleared = new Set();
let notifFirstRun = false;
let notifSources = {};           // name -> data, filled by each listener
let notifConfirmed = {};       // server-confirmed sources, never an empty cache or failed read
let notifMessageReady = false;
let notifReady = {};             // name -> true once that listener reported
let notifError = "";
let notifMessageCount = 0;
let notifToastPrimed = false;    // no toast for what was already waiting at sign-in
let notifOpenPanel = null;

function notifLayoutRole(role) {
    return role === "admin" ? "staff" : role;
}

function notifSeenKey() {
    return NOTIF_SEEN_PREFIX + notifUid;
}

function notifClearedKey() {
    return NOTIF_CLEARED_PREFIX + notifUid;
}

function loadNotificationSeen() {
    notifSeen = new Set();
    notifFirstRun = true;
    try {
        const raw = window.localStorage.getItem(notifSeenKey());
        if (raw !== null) {
            const list = JSON.parse(raw);
            if (Array.isArray(list)) list.forEach(k => typeof k === "string" && notifSeen.add(k));
            notifFirstRun = false;
        }
    } catch (e) { /* storage blocked or corrupt: behave as a first visit */ }
}

function saveNotificationSeen() {
    try {
        const list = Array.from(notifSeen).slice(-NOTIF_SEEN_CAP);
        window.localStorage.setItem(notifSeenKey(), JSON.stringify(list));
    } catch (e) { /* storage blocked: read state lasts for this page only */ }
}

function loadNotificationCleared() {
    notifCleared = new Set();
    try {
        const list = JSON.parse(window.localStorage.getItem(notifClearedKey()) || "[]");
        if (Array.isArray(list)) list.slice(-NOTIF_CLEARED_CAP).forEach(k => {
            if (typeof k === "string") notifCleared.add(k);
        });
    } catch (e) { /* storage blocked or corrupt: only this browser session remembers clear */ }
}

function saveNotificationCleared() {
    notifCleared = new Set(Array.from(notifCleared).slice(-NOTIF_CLEARED_CAP));
    try { window.localStorage.setItem(notifClearedKey(), JSON.stringify(Array.from(notifCleared))); }
    catch (e) { /* storage blocked: clear lasts for this page only */ }
}

/** Also called by the screens themselves, so your own action never notifies you. */
function markNotificationSeen(key) {
    if (!key || !notifUid) return;
    notifSeen.add(key);
    saveNotificationSeen();
    renderNotifications();
}

function markAllNotificationsSeen() {
    notifItems.forEach(item => notifSeen.add(item.key));
    saveNotificationSeen();
    renderNotifications();
}

function clearReadNotifications() {
    if (!notifUid) return;
    let changed = false;
    notifItems.forEach(item => {
        if (!item.unread && !notifCleared.has(item.key)) {
            notifCleared.add(item.key);
            changed = true;
        }
    });
    if (!changed) return;
    saveNotificationCleared();
    renderNotifications();
}

// ── Lifecycle ────────────────────────────────────────────────

function startNotifications() {
    const role = notifLayoutRole(typeof currentRole === "string" ? currentRole : "");
    if (!role || !currentUserId || typeof db === "undefined") return;
    if (notifRole === role && notifUid === currentUserId && notifUnsubs.length) return;
    stopNotifications();

    notifRole = role;
    notifUid = currentUserId;
    notifSources = {};
    notifReady = {};
    notifConfirmed = {};
    notifMessageReady = false;
    notifError = "";
    notifToastPrimed = false;
    loadNotificationSeen();
    loadNotificationCleared();

    const fail = source => err => {
        console.warn("Notifications: " + source + " unavailable:", err);
        notifError = "Some notifications could not load. Check the internet connection.";
        notifReady[source] = true;
        notifConfirmed[source] = false;
        renderNotifications();
    };

    if (role === "patient") {
        notifUnsubs.push(db.collection("appointments")
            .where("patientId", "==", currentUserId)
            .onSnapshot({ includeMetadataChanges: true }, snap => {
                const rows = [];
                snap.forEach(doc => rows.push({ id: doc.id, ...doc.data() }));
                notifSources.appointments = rows;
                notifReady.appointments = true;
                notifConfirmed.appointments = !snap.metadata || !snap.metadata.fromCache;
                renderNotifications();
            }, fail("appointments")));
    } else {
        // Upcoming only: every pending request, reschedule and cancellation
        // worth acting on is for today or later. Single-field range, so no
        // composite index; bounded, so a busy year cannot grow this read.
        notifUnsubs.push(db.collection("appointments")
            .where("appointmentDate", ">=", localDateKey())
            .limit(NOTIF_CLINIC_APPT_LIMIT)
            .onSnapshot({ includeMetadataChanges: true }, snap => {
                const rows = [];
                snap.forEach(doc => rows.push({ id: doc.id, ...doc.data() }));
                notifSources.appointments = rows;
                notifReady.appointments = true;
                notifConfirmed.appointments = !snap.metadata || !snap.metadata.fromCache;
                renderNotifications();
            }, fail("appointments")));
        notifUnsubs.push(db.collection("inventory")
            .onSnapshot({ includeMetadataChanges: true }, snap => {
                const rows = [];
                snap.forEach(doc => rows.push({ id: doc.id, ...doc.data() }));
                notifSources.inventory = rows;
                notifReady.inventory = true;
                notifConfirmed.inventory = !snap.metadata || !snap.metadata.fromCache;
                renderNotifications();
            }, fail("inventory")));
        // Take-outs waiting for Dr. Gapit (2026-10-01). Only she decides
        // them, so only her bell counts them. Bounded by the status filter.
        if (role === "dentist") {
            notifUnsubs.push(db.collection("stock_requests")
                .where("status", "==", "Pending")
                .onSnapshot({ includeMetadataChanges: true }, snap => {
                    const rows = [];
                    snap.forEach(doc => rows.push({ id: doc.id, ...doc.data() }));
                    notifSources.stockRequests = rows;
                    notifReady.stockRequests = true;
                    notifConfirmed.stockRequests = !snap.metadata || !snap.metadata.fromCache;
                    renderNotifications();
                }, fail("stockRequests")));
        }
    }

    // Reminders and "today" move with the clock even when no data changes.
    notifTimer = setInterval(renderNotifications, NOTIF_TICK_MS);
    renderNotifications();
}

function stopNotifications() {
    notifUnsubs.forEach(unsub => { try { unsub(); } catch (e) { /* already detached */ } });
    notifUnsubs = [];
    if (notifTimer) clearInterval(notifTimer);
    notifTimer = null;
    closeNotificationPanel();
    notifItems = [];
    notifSeen = new Set();
    notifCleared = new Set();
    notifSources = {};
    notifReady = {};
    notifConfirmed = {};
    notifMessageReady = false;
    notifMessageCount = 0;
    const role = notifRole;
    notifRole = "";
    notifUid = "";
    notifLastUnread = 0;
    if (role) paintNotificationBell(role, [], "");
    ["nav-staff-appointments", "nav-dentist-appointments", "nav-patient-appointments", "nav-dentist-stock"]
        .forEach(id => paintNavCount(id, 0, ""));
}

/** js/clinic.js reports the unread-message total here as it changes. */
function noteNotificationMessages(total, confirmed = true) {
    notifMessageReady = confirmed;
    notifMessageCount = Math.max(0, Number(total) || 0);
    if (notifRole) renderNotifications();
}

// ── Deriving the items ───────────────────────────────────────

function notifWhen(appt) {
    return typeof formatAppointmentWhen === "function" ? formatAppointmentWhen(appt)
        : (appt.appointmentDate || "") + " " + (appt.appointmentTime || "");
}

function notifDateOffset(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return localDateKey(d);
}

function notifShownStatus(appt) {
    return typeof effectiveAppointmentStatus === "function" ? effectiveAppointmentStatus(appt) : appt.status;
}

function deriveClinicNotifications(appts, inventory, messageCount, role) {
    const items = [];
    (appts || []).forEach(appt => {
        const shown = notifShownStatus(appt);
        const who = appt.patientName || "A patient";
        if (shown === "Pending") {
            const isMove = !!(appt.rescheduledAt && appt.rescheduleReason);
            items.push({
                key: isMove ? "resched:" + appt.id + ":" + appt.rescheduledAt : "booking:" + appt.id,
                kind: isMove ? "reschedule" : "booking", tone: "warning", icon: "calendar",
                title: isMove ? who + " asked to move their appointment" : "New booking from " + who,
                detail: notifWhen(appt) + (isMove ? " · Reason: " + appt.rescheduleReason : " · Waiting for approval"),
                sort: "1" + (appt.appointmentDate || "") + (appt.appointmentTime || ""),
                actionable: true, target: { tab: "appointments", filter: "Pending", date: appt.appointmentDate }
            });
        } else if (appt.status === "Cancelled") {
            items.push({
                key: "cancel:" + appt.id, kind: "cancelled", tone: "danger", icon: "close",
                title: "Cancelled: " + who,
                detail: notifWhen(appt) + " · The time is free again",
                sort: "3" + (appt.appointmentDate || ""),
                target: { tab: "appointments", filter: "Cancelled", date: appt.appointmentDate }
            });
        }
    });

    const today = localDateKey();
    const warnBy = notifDateOffset(NOTIF_EXPIRY_WARN_DAYS);
    (inventory || []).forEach(item => {
        const name = item.itemName || "An item";
        const qty = Number(item.quantity) || 0;
        const min = Number(item.minStockLevel) || 0;
        if (qty < 0 || qty <= min) {
            items.push({
                key: "stock:" + item.id + ":" + (qty < 0 ? "negative" : "low"), kind: "stock", tone: "danger", icon: "box",
                title: qty < 0 ? name + ": count needs checking" : name + " is low on stock",
                detail: qty + " " + (item.unit || "") + " left · alert level " + min,
                sort: "2" + name, actionable: true, target: role === "staff" ? { tab: "inventory" } : null
            });
        }
        const exp = typeof item.expiryDate === "string" ? item.expiryDate : "";
        if (/^\d{4}-\d{2}-\d{2}$/.test(exp) && exp <= warnBy && qty > 0) {
            const expired = exp < today;
            items.push({
                key: "expiry:" + item.id + ":" + exp + ":" + (expired ? "past" : "soon"), kind: "expiry",
                tone: expired ? "danger" : "warning", icon: "hourglass",
                title: expired ? name + " has expired" : name + " expires soon",
                detail: (expired ? "Expired " : "Expires ") + notifFormatDate(exp) + " · " + qty + " " + (item.unit || "") + " on the shelf",
                sort: "2" + exp, actionable: true, target: role === "staff" ? { tab: "inventory" } : null
            });
        }
    });

    if (messageCount > 0) {
        items.push({
            key: "messages:" + messageCount, kind: "messages", tone: "accent", icon: "mail",
            title: messageCount + " unread patient message" + (messageCount === 1 ? "" : "s"),
            detail: "Open Patient Messages to reply", sort: "0", target: { tab: "messages" }
        });
    }
    return items;
}

function derivePatientNotifications(appts, messageCount) {
    const items = [];
    const today = localDateKey();
    const tomorrow = notifDateOffset(1);
    const recent = notifDateOffset(-7);
    (appts || []).forEach(appt => {
        const date = appt.appointmentDate || "";
        if (date < recent) return;          // old history is not news
        const when = notifWhen(appt);
        const stamp = appt.id + ":" + date + ":" + (appt.appointmentTime || "");
        const shown = notifShownStatus(appt);
        const target = { tab: "appointments" };

        if (appt.status === "Approved" && appt.clinicRescheduledAt) {
            items.push({ key: "moved:" + appt.id + ":" + appt.clinicRescheduledAt, kind: "moved", tone: "warning", icon: "calendar",
                title: "The clinic moved your appointment",
                detail: "New time: " + when + (appt.clinicRescheduleReason ? " · Reason: " + appt.clinicRescheduleReason : "") + " · Call the clinic if it does not suit you",
                sort: "1" + date, actionable: true, target });
        } else if (appt.status === "Approved" || appt.status === "Confirmed") {
            items.push({ key: "status:" + stamp + ":Approved", kind: "approved", tone: "success", icon: "check",
                title: "Your appointment was approved", detail: when, sort: "2" + date, target });
        } else if (appt.status === "Rejected") {
            items.push({ key: "status:" + stamp + ":Rejected", kind: "rejected", tone: "danger", icon: "close",
                title: "Your booking request was not approved",
                detail: when + " · You can choose another time or message the clinic", sort: "2" + date, target });
        } else if (appt.status === "Cancelled") {
            items.push({ key: "status:" + stamp + ":Cancelled", kind: "cancelled", tone: "danger", icon: "close",
                title: "Your appointment was cancelled", detail: when, sort: "2" + date, target });
        } else if (appt.status === "No-Show") {
            items.push({ key: "status:" + stamp + ":No-Show", kind: "missed", tone: "warning", icon: "alert",
                title: "You were marked as not attending", detail: when + " · Message the clinic to rebook", sort: "2" + date, target });
        } else if (appt.status === "Completed") {
            // No pointer to a treatment history: a patient account shows nothing
            // clinical (2026-09-30). The item opens their appointment list.
            items.push({ key: "status:" + appt.id + ":Completed", kind: "completed", tone: "success", icon: "notes",
                title: "Your visit is complete", detail: when, sort: "3" + date, target });
        }

        if ((shown === "Approved" || shown === "Confirmed") && (date === today || date === tomorrow)) {
            const isToday = date === today;
            items.push({ key: "remind:" + stamp + ":" + (isToday ? "today" : "tomorrow"), kind: "reminder", tone: "accent", icon: "clock",
                title: isToday ? "Your appointment is today" : "Reminder: your appointment is tomorrow",
                detail: when + " · Dr. Reina G. Gapit Dental Clinic", sort: "0" + date + (appt.appointmentTime || ""),
                actionable: true, target });
        }
    });
    if (messageCount > 0) {
        items.push({ key: "messages:" + messageCount, kind: "messages", tone: "accent", icon: "mail",
            title: messageCount + " unread message" + (messageCount === 1 ? "" : "s") + " from the clinic",
            detail: "Open Messages to read", sort: "0", target: { tab: "messages" } });
    }
    return items;
}

/**
 * Dr. Gapit's take-outs to approve (2026-10-01): one item for all of them,
 * keyed by the set waiting, so a new request notifies again and an approved
 * one stops counting.
 */
function deriveStockRequestNotifications(requests) {
    const rows = requests || [];
    if (!rows.length) return [];
    const ids = rows.map(r => r.id).sort().join(",");
    return [{ key: "stockreq:" + ids, kind: "stockreq", tone: "warning", icon: "box", actionable: true,
        title: rows.length === 1 ? "1 stock request waiting" : rows.length + " stock requests waiting",
        detail: "The front desk filed take-outs for your approval", sort: "0",
        target: { tab: "stock" } }];
}

function notifFormatDate(dateKey) {
    const d = new Date(dateKey + "T00:00:00");
    return isNaN(d.getTime()) ? dateKey
        : d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

// ── Rendering ────────────────────────────────────────────────

// Absence is meaningful only after this source has loaded from the server.
// Otherwise sign-in can forget a cleared item before its delayed source arrives.
function notificationSourceConfirmed(key) {
    if (key.startsWith('messages:')) return notifMessageReady;
    if (/^(stock|expiry):/.test(key)) return !!notifConfirmed.inventory;
    if (key.startsWith('stockreq:')) return !!notifConfirmed.stockRequests;
    return !!notifConfirmed.appointments;
}

function renderNotifications() {
    if (!notifRole) return;
    const role = notifRole;
    let items = role === "patient"
        ? derivePatientNotifications(notifSources.appointments, notifMessageCount)
        : deriveClinicNotifications(notifSources.appointments, notifSources.inventory, notifMessageCount, role);
    if (role === "dentist") items = items.concat(deriveStockRequestNotifications(notifSources.stockRequests));

    const allReady = role === "patient" ? notifReady.appointments
        : notifReady.appointments && notifReady.inventory && (role !== "dentist" || notifReady.stockRequests);

    if (allReady) {
        // First visit on this browser: what already happened is history, not
        // news. Anything that still needs acting on (a pending booking, today's
        // appointment) stays unread so it is not silently buried.
        if (notifFirstRun) {
            items.forEach(item => { if (!item.actionable && item.kind !== "messages") notifSeen.add(item.key); });
            notifFirstRun = false;
            saveNotificationSeen();
        } else {
            // Forget keys for things that are gone, so a supply that runs low
            // again, or a message count that comes back, notifies again.
            const live = new Set(items.map(item => item.key));
            let pruned = false;
            notifSeen.forEach(key => {
                if (!live.has(key) && notificationSourceConfirmed(key) && /^(stock|stockreq|expiry|messages|remind|booking|resched):/.test(key)) { notifSeen.delete(key); pruned = true; }
            });
            if (pruned) saveNotificationSeen();
        }
        // A cleared warning returns if its source disappears and later enters
        // the same state again (for example, stock recovers then runs low).
        const live = new Set(items.map(item => item.key));
        let clearedPruned = false;
        notifCleared.forEach(key => {
            if (!live.has(key) && notificationSourceConfirmed(key)) { notifCleared.delete(key); clearedPruned = true; }
        });
        if (clearedPruned) saveNotificationCleared();
    }

    items = items.filter(item => !notifCleared.has(item.key));
    items.forEach(item => { item.unread = !notifSeen.has(item.key); });
    items.sort((a, b) => (b.unread - a.unread) || a.sort.localeCompare(b.sort));

    // A toast for what arrives while the portal is open, never for the backlog
    // found at sign-in. Messages already toast from js/clinic.js.
    if (allReady && notifToastPrimed && typeof showToast === "function") {
        const before = new Set(notifItems.map(item => item.key));
        const fresh = items.filter(item => item.unread && !before.has(item.key) && item.kind !== "messages");
        if (fresh.length === 1) showToast(fresh[0].title + ".", "info");
        else if (fresh.length > 1) showToast(fresh.length + " new notifications.", "info");
    }
    if (allReady) notifToastPrimed = true;

    notifItems = items;
    paintNotificationBell(role, items, allReady ? notifError : "");

    // Sidebar counts: what is waiting on this person, not what they have seen.
    if (role === "patient") {
        const unseen = items.filter(item => item.unread && item.target && item.target.tab === "appointments").length;
        paintNavCount("nav-patient-appointments", unseen, unseen === 1 ? "1 appointment update" : unseen + " appointment updates");
    } else {
        const pending = (notifSources.appointments || []).filter(appt => notifShownStatus(appt) === "Pending").length;
        paintNavCount("nav-" + role + "-appointments", pending, pending === 1 ? "1 booking waiting for approval" : pending + " bookings waiting for approval");
        if (role === "dentist") {
            const waiting = (notifSources.stockRequests || []).length;
            paintNavCount("nav-dentist-stock", waiting, waiting === 1 ? "1 stock request waiting" : waiting + " stock requests waiting");
        }
    }
}

function paintNavCount(navId, count, label) {
    const nav = document.getElementById(navId);
    if (!nav) return;
    let badge = nav.querySelector(".nav-count");
    if (count > 0) {
        if (!badge) {
            badge = document.createElement("span");
            badge.className = "nav-count";
            nav.appendChild(badge);
        }
        badge.textContent = count > 99 ? "99+" : String(count);
        badge.setAttribute("aria-label", label);
        badge.title = label;
    } else if (badge) {
        badge.remove();
    }
}

let notifLastUnread = 0;

function paintNotificationBell(role, items, error) {
    const list = document.getElementById("notif-list-" + role);
    const triggers = Array.from(document.querySelectorAll('[data-notif-trigger="' + role + '"]'));
    if (!triggers.length || !list) return;
    const unread = items.filter(item => item.unread).length;
    // Ring once when something new arrives while the portal is open.
    const ring = notifToastPrimed && unread > notifLastUnread;
    notifLastUnread = unread;
    triggers.forEach(trigger => {
        const count = trigger.querySelector(".notif-count");
        if (count) {
            count.hidden = unread === 0;
            count.textContent = unread > 99 ? "99+" : String(unread);
        }
        trigger.setAttribute("aria-label", unread ? "Notifications, " + unread + " unread" : "Notifications");
        trigger.classList.toggle("has-unread", unread > 0);
        if (ring) {
            trigger.classList.remove("is-ringing");
            void trigger.offsetWidth;          // restart the animation
            trigger.classList.add("is-ringing");
            setTimeout(() => trigger.classList.remove("is-ringing"), 1400);
        }
    });

    const mark = document.getElementById("notif-mark-" + role);
    if (mark) mark.disabled = unread === 0;
    const clear = document.getElementById("notif-clear-" + role);
    if (clear) {
        const read = items.length - unread;
        clear.disabled = read === 0;
        clear.textContent = read ? "Clear read notifications (" + read + ")" : "Clear read notifications";
    }

    if (!items.length) {
        list.innerHTML = '<li class="notif-empty">' +
            escapeHtml(error || (notifRole ? "You're all caught up." : "")) + '</li>';
        return;
    }
    list.innerHTML = (error ? '<li class="notif-empty notif-empty--error">' + escapeHtml(error) + '</li>' : "") +
        items.map((item, index) =>
            '<li><button type="button" class="notif-item notif-item--' + item.tone + (item.unread ? ' is-unread' : '') + '"' +
                ' onclick="openNotification(' + index + ')">' +
                '<span class="notif-item__icon" aria-hidden="true"><svg class="icon"><use href="#ic-' + item.icon + '"></use></svg></span>' +
                '<span class="notif-item__text"><span class="notif-item__title">' + escapeHtml(item.title) + '</span>' +
                '<span class="notif-item__detail">' + escapeHtml(item.detail) + '</span></span>' +
                (item.unread ? '<span class="notif-item__dot"><span class="visually-hidden">Unread</span></span>' : '') +
            '</button></li>').join("");
}

// ── Panel and navigation ─────────────────────────────────────

function toggleNotificationPanel(button) {
    const panel = document.getElementById(button.getAttribute("aria-controls"));
    if (!panel) return;
    if (!panel.hidden) { closeNotificationPanel(); return; }
    closeNotificationPanel();
    if (typeof closeMobileSidebar === "function") closeMobileSidebar();
    panel.hidden = false;
    button.setAttribute("aria-expanded", "true");
    notifOpenPanel = { panel, button };
    positionNotificationPanel();
    const first = panel.querySelector(".notif-item, .notif-mark");
    if (first) first.focus({ preventScroll: true });
}

function positionNotificationPanel() {
    if (!notifOpenPanel) return;
    const { panel, button } = notifOpenPanel;
    if (window.matchMedia("(max-width: 900px)").matches) {
        panel.style.left = "";
        panel.style.top = "";
        return;
    }
    const box = button.getBoundingClientRect();
    const width = Math.min(380, window.innerWidth - 24);
    panel.style.left = Math.max(12, Math.min(box.left, window.innerWidth - width - 12)) + "px";
    panel.style.top = (box.bottom + 8) + "px";
}

function closeNotificationPanel(returnFocus) {
    if (!notifOpenPanel) return;
    const { panel, button } = notifOpenPanel;
    panel.hidden = true;
    button.setAttribute("aria-expanded", "false");
    notifOpenPanel = null;
    if (returnFocus) button.focus();
}

function openNotification(index) {
    const item = notifItems[index];
    if (!item) return;
    notifSeen.add(item.key);
    saveNotificationSeen();
    closeNotificationPanel();
    renderNotifications();
    const target = item.target;
    if (!target) return;
    const role = notifRole;
    const nav = id => document.getElementById(id);

    if (role === "patient") {
        const tab = { appointments: "tab-patient-appointments", messages: "tab-patient-messages" }[target.tab];
        if (tab) switchPatientTab(tab, nav("nav-" + tab.replace("tab-", "")));
    } else if (role === "staff") {
        if (target.tab === "appointments") {
            switchStaffTab("tab-staff-appointments", nav("nav-staff-appointments"));
            if (target.filter && typeof filterStaffAppointments === "function") filterStaffAppointments(target.filter);
        } else if (target.tab === "inventory") {
            switchStaffTab("tab-staff-inventory", nav("nav-staff-inventory"));
        } else if (target.tab === "messages") {
            switchStaffTab("tab-staff-messages", nav("nav-staff-messages"));
        }
    } else if (role === "dentist") {
        if (target.tab === "appointments") {
            switchDentistTab("tab-dentist-appointments", nav("nav-dentist-appointments"));
            if (typeof setDentistWindow === "function") {
                setDentistWindow(target.filter ? target.filter.toLowerCase() : "today");
            }
        } else if (target.tab === "messages") {
            switchDentistTab("tab-dentist-messages", nav("nav-dentist-messages"));
        } else if (target.tab === "stock") {
            switchDentistTab("tab-dentist-stock", nav("nav-dentist-stock"));
        }
    }
}

document.addEventListener("click", event => {
    if (!notifOpenPanel) return;
    const { panel, button } = notifOpenPanel;
    if (panel.contains(event.target) || button.contains(event.target)) return;
    closeNotificationPanel();
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape" && notifOpenPanel) {
        event.stopPropagation();
        closeNotificationPanel(true);
    }
}, true);

window.addEventListener("resize", positionNotificationPanel);

// Keep two open tabs on the same origin in agreement about read/cleared state.
window.addEventListener("storage", event => {
    if (!notifUid || event.storageArea !== window.localStorage) return;
    if (event.key === notifSeenKey() || event.key === notifClearedKey()) {
        loadNotificationSeen(); loadNotificationCleared(); renderNotifications();
    }
});
