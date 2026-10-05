// ─────────────────────────────────────────────────────────────
// DentCare – js/clinic.js (Messaging & X-ray files)
// ─────────────────────────────────────────────────────────────
//
// Two features added 2026-08-29 in the clinic's revision round:
//
//   1. In-system messaging between a patient and the clinic
//   2. X-ray / scanned file upload onto a patient's record
//
// ── BOTH NEED A DEPLOY BEFORE THEY WORK ──────────────────────────────────
//
// firestore.rules ends with `match /{document=**} { allow read, write: if
// false; }` — anything not named there is denied. The `conversations` and
// `messages` collections are new, so until
//
//     firebase deploy --only firestore:rules
//
// has been run, every read and write below is refused. The failure looks like
// an empty inbox rather than an error, which is exactly why it is written here
// in capitals.
//
// X-ray upload additionally needs Firebase STORAGE rules, which live in a
// separate file (storage.rules) and deploy separately:
//
//     firebase deploy --only storage
//
// ── WHY MESSAGES ARE THEIR OWN COLLECTION ────────────────────────────────
//
// A conversation could have held its messages in an array. It does not,
// because an array is rewritten whole on every append: two people replying at
// the same moment would each write the array they had read, and the second
// write would silently erase the first person's message. Separate documents
// cannot collide that way.
//
// `conversations` then exists only to carry what an inbox list needs — who it
// is with, the last line, the unread count — so drawing the list does not mean
// reading every message in every thread.
// ─────────────────────────────────────────────────────────────

// ── Messaging ────────────────────────────────────────────────────────────

/**
 * Find a chat element inside the layout that is actually on screen.
 *
 * portal.php renders ALL THREE role layouts into the document at once and
 * hides the two that do not apply. A plain id would therefore appear three
 * times, and getElementById() would hand back the patient's copy while the
 * dentist typed into it — replies would vanish into a hidden panel.
 *
 * So these elements carry CLASSES, not ids, and are resolved against whichever
 * layout is visible. tools/check-dentition.js enforces the no-duplicate-id
 * rule that makes this necessary; it is what caught the bug.
 */
function chatEl(cls) {
    return document.querySelector(".app-layout:not(.hidden) ." + cls);
}

/** The thread currently open, or "" when none is. */
let openConversationId = "";

/** Unsubscribe handle for the live listener on the open thread. */
let chatUnsubscribe = null;

/** Cached conversation list for the clinic's inbox. */
let chatConversations = [];
let chatShowTrash = false;
let chatTrashed = false;
let chatLastMessageAt = "";
let chatViewVersion = 0;
let chatOpenVersion = 0;
let chatHiddenThrough = "";
let chatViewReady = false;
let chatSummaryReady = false;
let chatViewAvailable = true;
let chatViewData = null;
let chatSummaryData = null;
let chatLastMessageMarker = "";
let chatSeenMessageId = "";
let chatSeenMessageAt = "";
let chatSeenSenderId = "";
let chatReadPendingMarker = "";
let chatViewUnsubscribe = null;
let chatSummaryUnsubscribe = null;
let chatDrafts = Object.create(null);
let chatSendPendingConversation = "";
const chatPendingUnsend = new Set();
const chatPendingEdit = new Set();

// Owner decisions, 2026-09-24. A trashed chat is cleared from that account's
// view after 30 days (the messages stay as the clinic's record), and a sender
// may correct a message for 15 minutes, up to 5 times.
const CHAT_TRASH_DAYS = 30;
const CHAT_EDIT_WINDOW_MS = 15 * 60 * 1000;
const CHAT_EDIT_MAX = 5;
let chatMessagesById = Object.create(null);
let chatInboxRows = Object.create(null);
let chatClearingTrash = "";
let chatMenu = null;
let chatAllMessages = null;
let chatAllMessagesAtLimit = false;
let chatRenderedCleared = "";

/** Milliseconds from a Firestore Timestamp, a Date or an ISO string. */
function chatMillis(value) {
    if (!value) return 0;
    if (typeof value.toMillis === "function") return value.toMillis();
    if (value instanceof Date) return value.getTime();
    const t = Date.parse(value);
    return isNaN(t) ? 0 : t;
}

function chatClearedThrough(view) {
    return view && typeof view.clearedThroughAt === "string" ? view.clearedThroughAt : "";
}

/** In Trash for longer than 30 days, with nothing new since. */
function chatTrashExpired(view, marker) {
    const since = view ? chatMillis(view.updatedAt) : 0;
    return chatIsTrashed(view, marker) && since > 0 &&
        Date.now() - since > CHAT_TRASH_DAYS * 24 * 60 * 60 * 1000;
}

function chatTrashDaysLeft(view) {
    const since = view ? chatMillis(view.updatedAt) : 0;
    if (!since) return CHAT_TRASH_DAYS;
    const left = CHAT_TRASH_DAYS - Math.floor((Date.now() - since) / (24 * 60 * 60 * 1000));
    return Math.max(0, Math.min(CHAT_TRASH_DAYS, left));
}

/** The view document for one account and thread. clearedThroughAt is kept:
 *  history cleared once stays cleared, whatever happens to Trash later. */
function chatViewPayload(conversationId, trash, marker, view, clearedThroughAt) {
    const data = {
        ownerId: currentUserId,
        conversationId: conversationId,
        isTrashed: !!trash,
        hiddenThrough: marker || "",
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    const cleared = [chatClearedThrough(view), clearedThroughAt || ""].sort().pop();
    if (cleared) data.clearedThroughAt = cleared;
    return data;
}

/** 30 days in Trash: clear the history from this account's view for good.
 *  New messages after this point start a fresh thread for this person. */
function clearExpiredTrash(conversationId, view, lastMessageAt) {
    if (!lastMessageAt || chatClearingTrash === conversationId) return Promise.resolve();
    chatClearingTrash = conversationId;
    return chatViewRef(conversationId).set(chatViewPayload(conversationId, false, "", view, lastMessageAt))
        .catch(err => console.warn("Could not clear an expired Trash entry:", err))
        .finally(() => { if (chatClearingTrash === conversationId) chatClearingTrash = ""; });
}

function stopChatThread(forgetDrafts = false) {
    const box = chatEl("chat-input");
    if (openConversationId && box && box.value.trim()) chatDrafts[openConversationId] = box.value;
    if (chatUnsubscribe) chatUnsubscribe();
    if (chatViewUnsubscribe) chatViewUnsubscribe();
    if (chatSummaryUnsubscribe) chatSummaryUnsubscribe();
    chatUnsubscribe = null;
    chatViewUnsubscribe = null;
    chatSummaryUnsubscribe = null;
    openConversationId = "";
    chatOpenVersion++;
    chatMessagesById = Object.create(null);
    chatAllMessages = null;
    chatAllMessagesAtLimit = false;
    closeChatMenu();
    if (forgetDrafts) chatDrafts = Object.create(null);
    paintChatTrash();
}

function chatViewRef(conversationId) {
    return db.collection("conversation_views").doc(currentUserId)
        .collection("threads").doc(conversationId);
}

function chatMarker(summary) {
    return summary ? (summary.lastMessageId || summary.lastMessageAt || "") : "";
}

function chatIsTrashed(view, marker) {
    return !!(view && view.isTrashed && view.hiddenThrough === (marker || ""));
}

function updateChatTrashState() {
    if (!chatViewReady || !chatSummaryReady) return;
    chatLastMessageMarker = chatMarker(chatSummaryData);
    chatLastMessageAt = chatSummaryData ? (chatSummaryData.lastMessageAt || "") : "";
    chatHiddenThrough = chatViewData && chatViewData.isTrashed ? chatViewData.hiddenThrough : "";
    chatTrashed = chatIsTrashed(chatViewData, chatLastMessageMarker);
    if (chatTrashExpired(chatViewData, chatLastMessageMarker)) {
        clearExpiredTrash(openConversationId, chatViewData, chatLastMessageAt);
    }
    paintChatTrash();
    if (chatAllMessages && chatClearedThrough(chatViewData) !== chatRenderedCleared) renderChatThread();
    if (!chatTrashed) markConversationRead(openConversationId);
}

function paintChatTrash() {
    const button = chatEl("chat-trash-action");
    const note = chatEl("chat-trash-note");
    const compose = chatEl("chat-compose");
    const thread = chatEl("chat-thread");
    if (button) {
        button.hidden = !openConversationId || !chatViewReady || !chatSummaryReady || !chatViewAvailable || !chatLastMessageMarker;
        button.textContent = chatTrashed ? "Restore conversation" : "Delete conversation";
        button.classList.toggle("is-restore", chatTrashed);
    }
    if (note) {
        note.hidden = !chatTrashed;
        const left = chatTrashDaysLeft(chatViewData);
        note.textContent = chatTrashed
            ? "This conversation is in your Trash. Restore it to reply. It is cleared from your view in " +
              left + " day" + (left === 1 ? "" : "s") + ". A new message brings it back to your inbox."
            : "";
    }
    if (compose) compose.hidden = chatTrashed || !chatViewReady || !chatSummaryReady || !openConversationId;
    if (thread) thread.hidden = chatTrashed || !chatViewReady || !chatSummaryReady;
}

function toggleConversationTrash() {
    if (!openConversationId || !currentUserId || !chatViewAvailable || !chatLastMessageMarker) {
        showToast("Open a conversation first.", "warning");
        return Promise.resolve();
    }
    return setConversationTrash(openConversationId, chatLastMessageMarker, !chatTrashed, chatViewData);
}

/** Move a thread to this account's Trash, or restore it. Never touches the
 *  messages or the other participant's view. */
async function setConversationTrash(conversationId, marker, trash, view) {
    if (!navigator.onLine) {
        showToast("Connect to the internet to change your Trash.", "warning");
        return;
    }
    if (trash && !(await confirmDialog("It disappears from YOUR inbox only; the other person still has it. " +
        "You can restore it from Trash within " + CHAT_TRASH_DAYS + " days. After that it is cleared from your " +
        "view for good. The clinic's record of the messages is kept.",
        { title: "Delete this conversation?", confirmLabel: "Delete conversation", tone: "danger" }))) return;
    const button = chatEl("chat-trash-action");
    if (button && conversationId === openConversationId) button.disabled = true;
    return chatViewRef(conversationId).set(chatViewPayload(conversationId, trash, marker, view))
    .then(() => {
        if (openConversationId === conversationId) updateChatTrashState();
        if (currentRole !== "patient") loadClinicInbox();
        showToast(trash ? "Conversation deleted. You can restore it from Trash for " + CHAT_TRASH_DAYS + " days."
                        : "Conversation restored.", "success");
    }).catch(err => {
        console.error("Could not change Trash state:", err);
        showToast("Could not change Trash state. Please try again.", "error");
    }).finally(() => { if (button) button.disabled = false; });
}

function toggleChatTrashList() {
    chatShowTrash = !chatShowTrash;
    loadClinicInbox();
}

/**
 * A patient's conversation id.
 *
 * Derived from their uid rather than generated, so there is exactly one thread
 * per patient and it can be addressed without a lookup. A generated id would
 * let a patient end up with two threads — one on their phone, one on the
 * laptop — and a reply landing in the one they were not reading.
 */
function conversationIdFor(patientUid) {
    return "conv_" + patientUid;
}

/**
 * Open the patient's own thread and start listening.
 *
 * Called when the patient opens their Messages tab.
 */
function loadPatientMessages() {
    if (!currentUserId) return;
    openConversation(conversationIdFor(currentUserId), "Dr. Gapit's clinic");
}

/**
 * Draw the clinic's inbox.
 *
 * Ordered by the most recent message so anything waiting is at the top. Read
 * once per tab open rather than kept live: an inbox that reorders itself while
 * somebody is clicking a row is how you reply to the wrong patient.
 */
function loadClinicInbox() {
    const host = chatEl("chat-list");
    if (!host) return;

    host.innerHTML = '<p class="chat-empty">Loading…</p>';

    const version = ++chatViewVersion;
    db.collection("conversations")
        .orderBy("lastMessageAt", "desc")
        .limit(100)
        .get()
        .then(async snap => {
            if (version !== chatViewVersion) return;
            chatConversations = [];
            snap.forEach(doc => chatConversations.push({ id: doc.id, ...doc.data() }));
            const views = await Promise.all(chatConversations.map(c =>
                chatViewRef(c.id).get().catch(() => ({ exists: false, denied: true }))));
            if (version !== chatViewVersion) return;
            const trashAvailable = !views.some(v => v.denied);
            if (!trashAvailable) chatShowTrash = false;
            chatInboxRows = Object.create(null);
            const shown = chatConversations.filter((c, i) => {
                const view = views[i].exists ? views[i].data() : null;
                const marker = chatMarker(c);
                const cleared = chatClearedThrough(view);
                // Cleared after 30 days in Trash, and nothing new since: gone
                // from this account's inbox and Trash alike.
                if (cleared && String(c.lastMessageAt || "") <= cleared) return false;
                if (chatTrashExpired(view, marker)) {
                    clearExpiredTrash(c.id, view, c.lastMessageAt);
                    return false;
                }
                const trashed = chatIsTrashed(view, marker);
                chatInboxRows[c.id] = { marker, view, trashed, name: c.patientName || "Patient" };
                return trashed === chatShowTrash;
            });
            host.innerHTML = (trashAvailable ? '<div class="chat-list__toolbar"><button type="button" ' +
                'onclick="toggleChatTrashList()" aria-pressed="' + (chatShowTrash ? 'true' : 'false') + '">' +
                (chatShowTrash ? 'Back to Inbox' : 'View Trash') + '</button></div>' :
                '<p class="chat-trash-note">Deleting conversations turns on after the next system update.</p>') +
                (shown.length ? shown.map(c => {
                const unread = Number(c.unreadForClinic) || 0;
                const row = chatInboxRows[c.id];
                const daysLeft = row && row.trashed ? chatTrashDaysLeft(row.view) : 0;
                return '<div class="chat-list__row">' +
                    '<button type="button" class="chat-list__item' +
                            (c.id === openConversationId ? " active" : "") + '" ' +
                        'data-chat-id="' + escapeHtml(c.id) + '" ' +
                        // escapeJsAttr, NOT escapeHtml. These land inside a JS
                        // string in an onclick attribute, and the browser
                        // HTML-decodes the attribute before the JS is parsed —
                        // so escapeHtml turning ' into &#39; achieves nothing:
                        // the parser hands back a real quote and the string
                        // closes early. patientName is chosen by the patient,
                        // making that a route from an unprivileged account
                        // into a clinician's signed-in session.
                        'onclick="openConversation(\'' + escapeJsAttr(c.id) + '\', \'' +
                            escapeJsAttr(c.patientName || "Patient") + '\')">' +
                    '<span class="chat-list__name">' +
                        escapeHtml(c.patientName || "Patient") +
                        (unread ? '<span class="chat-list__unread">' + unread + '</span>' : '') +
                    '</span>' +
                    '<span class="chat-list__preview">' +
                        escapeHtml(row && row.trashed
                            ? "Cleared from your view in " + daysLeft + " day" + (daysLeft === 1 ? "" : "s")
                            : (c.lastMessage || "—")) +
                    '</span>' +
                '</button>' +
                (trashAvailable
                    ? '<button type="button" class="chat-more chat-list__more" aria-haspopup="menu" ' +
                      'aria-label="More actions for the conversation with ' + escapeHtml(c.patientName || "Patient") + '" ' +
                      'onclick="openChatConversationMenu(this, \'' + escapeJsAttr(c.id) + '\')">' +
                      '<svg class="icon" aria-hidden="true"><use href="#ic-more"></use></svg></button>'
                    : '') +
                '</div>';
            }).join("") : '<p class="chat-empty">' +
                (chatShowTrash ? 'Trash is empty.' : 'No messages in your inbox.') + '</p>') +
                (chatConversations.length >= 100
                    ? '<p class="chat-limit-note">Showing the newest 100 conversations. Older threads may not appear here.</p>'
                    : '');
        })
        .catch(err => {
            console.error("Could not load the inbox:", err);
            host.innerHTML = '<p class="chat-empty">Could not load messages. ' +
                             'If this is the first run, the Firestore rules may not be deployed yet.</p>';
        });
}

/** Draw the open thread from the last messages snapshot. Called by the
 *  messages listener and again when this account's view changes (e.g. the
 *  30-day Trash clearing), so the screen never shows cleared history. */
function renderChatThread() {
    const thread = chatEl("chat-thread");
    if (!thread || !openConversationId) return;
    const all = chatAllMessages || [];
    chatRenderedCleared = chatClearedThrough(chatViewData);
    if (!all.length) {
        chatMessagesById = Object.create(null);
        chatSeenMessageId = "";
        chatSeenMessageAt = "";
        chatSeenSenderId = "";
        thread.innerHTML = '<p class="chat-empty">No messages yet. Say hello.</p>';
        return;
    }
    // History this account cleared (30 days in Trash) never returns to
    // its screen; the records themselves remain the clinic's.
    const cleared = chatClearedThrough(chatViewData);
    const ordered = cleared ? all.filter(m => String(m.createdAt || "") > cleared) : all;
    chatMessagesById = Object.create(null);
    ordered.forEach(m => { chatMessagesById[m.id] = m; });
    if (!ordered.length) {
        chatSeenMessageId = "";
        chatSeenMessageAt = "";
        chatSeenSenderId = "";
        thread.innerHTML = '<p class="chat-empty">' + (cleared
            ? "Earlier messages were cleared from your view. Write below to start again."
            : "No messages yet. Say hello.") + '</p>';
        return;
    }
    const latest = ordered[ordered.length - 1];
    chatSeenMessageId = latest.id || "";
    chatSeenMessageAt = latest.createdAt || "";
    chatSeenSenderId = latest.senderId || "";

    const rows = [];
    if (cleared && ordered.length < all.length) {
        rows.push('<p class="chat-cleared-note">Earlier messages were cleared from your view.</p>');
    }
    ordered.forEach(m => {
        const mine = m.senderId === currentUserId;
        const when = m.createdAt
            ? new Date(m.createdAt).toLocaleString("en-PH",
                { dateStyle: "medium", timeStyle: "short" })
            : "";

        const hasMenu = m.id && chatMessageActions(m).length > 0;
        rows.push(
            '<div class="chat-row ' + (mine ? "chat-row--mine" : "chat-row--theirs") + '">' +
            '<div class="chat-msg ' + (mine ? "chat-msg--mine" : "chat-msg--theirs") +
                (m.unsentAt ? " chat-msg--unsent" : "") + '">' +
                escapeHtml(m.unsentAt ? "Message unsent" : m.body) +
                '<span class="chat-msg__meta">' +
                    escapeHtml(mine ? "You" : (m.senderName || "Clinic")) +
                    (when ? " · " + escapeHtml(when) : "") +
                    (m.editedAt && !m.unsentAt ? " · Edited" : "") +
                '</span>' +
            '</div>' +
            (hasMenu
                ? '<button type="button" class="chat-more chat-msg__more" aria-haspopup="menu" ' +
                  'aria-label="More actions for this message" ' +
                  'onclick="openChatMessageMenu(this, \'' + escapeJsAttr(m.id) + '\')">' +
                  '<svg class="icon" aria-hidden="true"><use href="#ic-more"></use></svg></button>'
                : '') +
            '</div>'
        );
    });

    thread.innerHTML = (chatAllMessagesAtLimit
        ? '<p class="chat-limit-note" role="status">This conversation exceeds the 500-message view limit. Some messages may not be shown; the clinic record retains them.</p>'
        : '') + rows.join("");
    thread.scrollTop = thread.scrollHeight;

}

/**
 * Open one thread and listen to it live.
 *
 * Live here, unlike the inbox: a conversation you are looking at should show a
 * reply as it lands. The previous listener is detached first — without that,
 * clicking through five patients would leave five listeners running and every
 * new message would render five times.
 */
function openConversation(conversationId, title) {
    stopChatThread();
    openConversationId = conversationId;
    const box = chatEl("chat-input");
    if (box) {
        box.value = chatDrafts[conversationId] || "";
        box.disabled = !!chatSendPendingConversation;
    }
    chatTrashed = false;
    chatLastMessageAt = "";
    chatLastMessageMarker = "";
    chatHiddenThrough = "";
    chatViewReady = false;
    chatSummaryReady = false;
    chatViewAvailable = true;
    chatViewData = null;
    chatSummaryData = null;
    chatSeenMessageId = "";
    chatSeenMessageAt = "";
    chatSeenSenderId = "";
    chatReadPendingMarker = "";
    paintChatTrash();
    const viewVersion = ++chatOpenVersion;
    chatViewUnsubscribe = chatViewRef(conversationId).onSnapshot(view => {
        if (viewVersion !== chatOpenVersion || openConversationId !== conversationId) return;
        chatViewData = view.exists ? view.data() : null;
        chatViewReady = true;
        updateChatTrashState();
    }, err => {
        console.warn("Conversation Trash is unavailable:", err);
        if (viewVersion === chatOpenVersion && openConversationId === conversationId) {
            chatViewAvailable = false;
            chatViewReady = true;
            updateChatTrashState();
        }
    });
    chatSummaryUnsubscribe = db.collection("conversations").doc(conversationId)
        .onSnapshot(summary => {
            if (viewVersion !== chatOpenVersion || openConversationId !== conversationId) return;
            chatSummaryData = summary.exists ? summary.data() : null;
            chatSummaryReady = true;
            updateChatTrashState();
        }, err => {
            console.warn("Conversation summary is unavailable:", err);
            if (viewVersion === chatOpenVersion && openConversationId === conversationId) {
                chatSummaryReady = true;
                updateChatTrashState();
            }
        });

    const head = chatEl("chat-head");
    if (head) head.innerText = title || "Conversation";

    const thread = chatEl("chat-thread");
    if (!thread) return;
    thread.innerHTML = '<p class="chat-empty">Loading…</p>';

    // ── NO .orderBy() HERE, AND THAT IS THE FIX ───────────────────────────
    //
    // This query used to be
    //
    //     .where("conversationId", "==", id).orderBy("createdAt", "asc")
    //
    // and it failed every single time with "The query requires an index."
    // Firestore builds single-field indexes on its own, but an equality filter
    // on one field COMBINED with a sort on a different one needs a composite
    // index that somebody has to create — and none was ever created.
    //
    // The symptom was exactly what it looks like from the outside and nothing
    // like the cause: the inbox listed the conversation fine, because that
    // query sorts on lastMessageAt with no filter and needs no composite index;
    // the message really had arrived; and clicking the row said "Could not load
    // this conversation." A working list next to a thread that will not open.
    //
    // Sorting the messages here instead removes the index entirely, so there is
    // nothing to deploy and nothing to forget. A conversation is one patient
    // talking to one clinic — sorting a few hundred short strings in the
    // browser costs nothing measurable.
    //
    // The limit is the trade. Without an orderBy, Firestore picks WHICH 500 it
    // returns (by document id), so a thread past 500 messages would show an
    // arbitrary subset rather than the most recent. Nowhere near that today; if
    // it is ever approached, the answer is a composite index and orderBy, in a
    // firestore.indexes.json deployed alongside the rules.
    chatUnsubscribe = db.collection("messages")
        .where("conversationId", "==", conversationId)
        .limit(500)
        .onSnapshot(snap => {
            if (conversationId !== openConversationId) return;
            const all = [];
            snap.forEach(doc => all.push({ id: doc.id, ...doc.data() }));
            // createdAt is an ISO string, so a plain string compare is a
            // chronological one — no Date parsing per comparison.
            all.sort((a, b) =>
                String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
            chatAllMessages = all;
            chatAllMessagesAtLimit = snap.size >= 500;
            renderChatThread();
            if (chatViewReady && !chatTrashed) markConversationRead(conversationId);
        }, err => {
            if (conversationId !== openConversationId) return;
            console.error("Could not open that conversation:", err);

            // Says WHICH kind of failure it is. "Could not load this
            // conversation" on its own sent somebody looking for a lost message
            // when the message was there and the query was the problem — the
            // row in the list had loaded, so the data plainly existed.
            const code = (err && err.code) || "";
            const why =
                code === "failed-precondition"
                    ? "This query needs a Firestore index that has not been created. " +
                      "See the note above openConversation() in js/clinic.js — it should " +
                      "not need one."
                : code === "permission-denied"
                    ? "The security rules refused it. A patient can only open their own " +
                      "conversation; check that you are signed in as the right account."
                : "Check your connection and try again.";

            thread.innerHTML = '<p class="chat-empty">Could not load this conversation. ' +
                               escapeHtml(why) + '</p>';
        });

    if (currentRole !== "patient") {
        const inbox = chatEl("chat-list");
        if (inbox && inbox.querySelectorAll) inbox.querySelectorAll(".chat-list__item").forEach(item =>
            item.classList.toggle("active", item.dataset.chatId === conversationId));
    }
}

// ─────────────────────────────────────────────────────────────
// Tell the clinic a patient has written — added 2026-09-13
// ─────────────────────────────────────────────────────────────
//
// The inbox was only read when somebody opened the Messages tab. A patient
// writing "my face is swelling after yesterday's extraction" would sit unseen
// until someone happened to click there. This keeps one small live query
// running while a clinician is signed in — only conversations with something
// unread, at most 100 rows — and shows the count on the Messages menu item,
// in the browser tab title, and as a notice when a new message arrives.
let clinicUnreadUnsubscribe = null;
let clinicUnreadLast = null;
let patientUnreadUnsubscribe = null;
let patientUnreadLast = null;

function watchPatientUnread() {
    if (patientUnreadUnsubscribe || currentRole !== "patient" || !currentUserId) return;
    patientUnreadUnsubscribe = db.collection("conversations")
        .doc(conversationIdFor(currentUserId))
        .onSnapshot({ includeMetadataChanges: true }, snap => {
            const count = snap.exists ? Math.max(0, Number(snap.data().unreadForPatient) || 0) : 0;
            paintMessageUnread(["nav-patient-messages"], count, !snap.metadata || !snap.metadata.fromCache);
            if (patientUnreadLast !== null && count > patientUnreadLast) {
                showToast("New message from the clinic. Open Messages to read it.", "info");
            }
            patientUnreadLast = count;
        }, err => console.warn("Patient unread watch unavailable:", err));
}

function unwatchPatientUnread() {
    if (patientUnreadUnsubscribe) patientUnreadUnsubscribe();
    patientUnreadUnsubscribe = null;
    patientUnreadLast = null;
    paintMessageUnread(["nav-patient-messages"], 0, false);
}

function watchClinicUnread() {
    if (clinicUnreadUnsubscribe || currentRole === "patient" || !currentRole) return;

    clinicUnreadUnsubscribe = db.collection("conversations")
        .where("unreadForClinic", ">", 0)
        .limit(100)
        .onSnapshot({ includeMetadataChanges: true }, snap => {
            let total = 0;
            snap.forEach(doc => { total += Number(doc.data().unreadForClinic) || 0; });
            paintClinicUnread(total, !snap.metadata || !snap.metadata.fromCache);

            // Not on the first snapshot: that is what was already waiting, and
            // the badge says so without a toast on every page load.
            if (clinicUnreadLast !== null && total > clinicUnreadLast) {
                showToast("New message from a patient. Open Patient Messages to read it.", "info");
            }
            const list = chatEl("chat-list");
            const tab = list && list.closest ? list.closest(".tab-content") : null;
            if (tab && !tab.classList.contains("hidden")) loadClinicInbox();
            clinicUnreadLast = total;
        }, err => {
            // Not fatal and not a toast: the inbox itself still works when opened.
            console.warn("Unread-message watch unavailable:", err);
        });
}

function unwatchClinicUnread() {
    if (clinicUnreadUnsubscribe) clinicUnreadUnsubscribe();
    clinicUnreadUnsubscribe = null;
    clinicUnreadLast = null;
    paintClinicUnread(0, false);
}

function paintClinicUnread(total, confirmed = true) {
    paintMessageUnread(["nav-staff-messages", "nav-dentist-messages"], total, confirmed);
}

function paintMessageUnread(navIds, total, confirmed = true) {
    navIds.forEach(id => {
        const nav = document.getElementById(id);
        if (!nav) return;
        let badge = nav.querySelector(".chat-list__unread");
        if (total > 0) {
            if (!badge) {
                badge = document.createElement("span");
                badge.className = "chat-list__unread";
                nav.appendChild(badge);
            }
            badge.textContent = total > 99 ? "99+" : String(total);
        } else if (badge) {
            badge.remove();
        }
    });
    document.title = document.title.replace(/^\(\d+\+?\)\s*/, "");
    if (total > 0) document.title = "(" + (total > 99 ? "99+" : total) + ") " + document.title;
    // The bell lists unread messages as one line; see js/notifications.js.
    if (typeof noteNotificationMessages === "function") noteNotificationMessages(total, confirmed);
}

/** Clear only messages actually seen in this open thread. A transaction checks
 * the summary marker again so an incoming send cannot be erased by a late
 * "mark read" write from an older snapshot. */
function markConversationRead(conversationId) {
    if (!conversationId || conversationId !== openConversationId || !chatSummaryData ||
        chatTrashed || !chatSeenMessageAt || chatSeenSenderId === currentUserId) return;
    const marker = chatMarker(chatSummaryData);
    const seen = chatSummaryData.lastMessageId ? chatSeenMessageId : chatSeenMessageAt;
    if (!marker || marker !== seen || chatReadPendingMarker === marker) return;
    const field = (currentRole === "patient") ? "unreadForPatient" : "unreadForClinic";
    if (!(Number(chatSummaryData[field]) > 0)) return;
    chatReadPendingMarker = marker;
    const ref = db.collection("conversations").doc(conversationId);
    db.runTransaction(async tx => {
        const fresh = await tx.get(ref);
        if (!fresh.exists || chatMarker(fresh.data()) !== marker ||
            !(Number(fresh.data()[field]) > 0)) return;
        tx.update(ref, { [field]: 0 });
    }).catch(err => {
        if (chatReadPendingMarker === marker) chatReadPendingMarker = "";
        console.warn("Could not mark conversation read:", err);
    });
}

/**
 * Send a message.
 *
 * One transaction keeps the message and inbox summary together and retries
 * against concurrent sends to the same thread.
 */
function sendMessage(e) {
    if (e && e.preventDefault) e.preventDefault();

    const box = chatEl("chat-input");
    if (!box || box.disabled || chatTrashed || chatSendPendingConversation) return;

    const body = box.value.trim();
    if (!body) return;

    // A patient always writes to their own thread. Taking the id from the
    // signed-in user rather than from whatever is on screen means a patient
    // cannot post into somebody else's conversation by editing the page — the
    // rules refuse it too, but this is why they never see that error.
    const conversationId = (currentRole === "patient")
        ? conversationIdFor(currentUserId)
        : openConversationId;

    if (!conversationId) {
        showToast("Open a conversation first.", "warning");
        return;
    }

    // Offline, a queued write may wait, and the box used to sit disabled
    // with no word of explanation until the connection returned (2026-09-13).
    // Refused up front instead, with the text left where it was.
    if (!navigator.onLine) {
        showToast("You are offline, so the message was not sent. It is still in the box.", "warning");
        return;
    }

    const now = new Date().toISOString();
    const fromPatient = (currentRole === "patient");
    const senderId = currentUserId;
    const senderName = currentUser;
    const senderRole = currentRole;
    const includeMessageId = !fromPatient || chatViewAvailable;

    box.disabled = true;
    chatSendPendingConversation = conversationId;
    chatDrafts[conversationId] = body;

    // A pending Firestore write can outlive a slow connection. Keep the send
    // control locked so a second tap cannot create a duplicate message.
    const slowSend = setTimeout(() => {
        showToast("Still sending. Please keep this page open; do not send it again.", "warning");
    }, 15000);

    const messageRef = db.collection("messages").doc();
    const conversationRef = db.collection("conversations").doc(conversationId);
    db.runTransaction(async tx => {
        const previous = await tx.get(conversationRef);
        const message = {
            conversationId: conversationId,
            senderId: senderId,
            senderName: senderName,
            senderRole: senderRole,
            body: body,
            createdAt: now
        };
        // The server's clock, not the device's: the 15-minute edit window is
        // measured from this in firestore.rules. Only written once the new
        // Rules are detected (chatViewAvailable), because the older deployed
        // Rules refuse any extra field on a message.
        if (chatViewAvailable) message.sentAt = firebase.firestore.FieldValue.serverTimestamp();
        tx.set(messageRef, message);
        // set with merge creates the conversation on the first patient send.
        const summary = {
            patientId: fromPatient ? senderId : (conversationId.replace(/^conv_/, "")),
            // Only the other side's counter moves. Incrementing both would
            // leave the sender with an unread badge for their own message.
            unreadForClinic: fromPatient
                ? firebase.firestore.FieldValue.increment(1)
                : 0,
            unreadForPatient: fromPatient
                ? 0
                : firebase.firestore.FieldValue.increment(1)
        };
        summary.lastMessage = body.slice(0, 90);
        summary.lastMessageAt = now;
        // Older deployed patient Rules do not yet allow this optional field.
        // The view listener detects that Rules set before showing the composer.
        if (includeMessageId) summary.lastMessageId = messageRef.id;

        // patientName is ADDED only when a patient is sending — it is not set
        // to undefined the rest of the time.
        //
        // `patientName: fromPatient ? currentUser : undefined` is what this
        // was, and the compat SDK throws "Unsupported field value: undefined"
        // on it — the project does not enable ignoreUndefinedProperties. So
        // every reply from the clinic threw HERE, after the message itself had
        // already been written by the .add() above. The patient received the
        // message; the clinician was told "Message not sent. Please try again."
        // and would send it again. Meanwhile the inbox summary silently stopped
        // updating on every clinic reply, so the conversation list showed the
        // patient's last message forever.
        //
        // Omitting the key is also the correct merge behaviour: the name was
        // written when the patient opened the conversation, and a merge that
        // does not mention it leaves it alone.
        if (fromPatient) summary.patientName = senderName;

        tx.set(conversationRef, summary, { merge: true });
    })
    .then(() => {
        delete chatDrafts[conversationId];
        if (openConversationId === conversationId && box.value.trim() === body) box.value = "";
    })
    .catch(err => {
        console.error("Message failed to send:", err);
        showToast("Message not sent. Please try again.", "error");
        // The draft remains attached to this conversation even if the user
        // switched threads while the transaction was pending.
    })
    .finally(() => {
        clearTimeout(slowSend);
        chatSendPendingConversation = "";
        box.disabled = false;
        if (openConversationId === conversationId) box.focus();
    });
}

/** Replace only your own message with a visible tombstone; retain the original
 * in an owner-only audit document in the same transaction. */
async function unsendMessage(messageId) {
    if (!messageId || !currentUserId || !navigator.onLine) {
        showToast("Connect to the internet to unsend a message.", "warning");
        return;
    }
    if (chatPendingUnsend.has(messageId)) return;
    closeChatMenu();
    if (!(await confirmDialog("It will show as \"Message unsent\" for everyone. The original stays in the clinic's restricted record.",
        { title: "Unsend this message?", confirmLabel: "Unsend", tone: "danger" }))) return;
    chatPendingUnsend.add(messageId);
    const senderId = currentUserId;
    const conversationId = openConversationId;
    const messageRef = db.collection("messages").doc(messageId);
    const auditRef = db.collection("message_unsend_audit").doc(messageId);
    const conversationRef = db.collection("conversations").doc(conversationId);
    const now = firebase.firestore.FieldValue.serverTimestamp();
    db.runTransaction(async tx => {
        const [messageSnap, summarySnap] = await Promise.all([
            tx.get(messageRef), tx.get(conversationRef)
        ]);
        if (!messageSnap.exists ||
            messageSnap.data().senderId !== senderId || messageSnap.data().unsentAt ||
            messageSnap.data().conversationId !== conversationId) {
            throw new Error("This message is already unsent or is not yours.");
        }
        const message = messageSnap.data();
        tx.set(auditRef, {
            messageId, conversationId: message.conversationId,
            senderId: message.senderId, senderName: message.senderName,
            senderRole: message.senderRole, body: message.body,
            createdAt: message.createdAt, unsentAt: now, unsentBy: senderId
        });
        tx.update(messageRef, { body: "", unsentAt: now, unsentBy: senderId });
        if (summarySnap.exists) {
            const summary = summarySnap.data();
            if (summary.lastMessageId === messageId ||
                (!summary.lastMessageId && summary.lastMessageAt === message.createdAt &&
                 summary.lastMessage === message.body.slice(0, 90))) {
                tx.update(conversationRef, { lastMessage: "Message unsent" });
            }
        }
    }).then(() => {
        showToast("Message unsent for everyone.", "success");
        if (currentRole !== "patient") loadClinicInbox();
    }).catch(err => {
        console.error("Could not unsend message:", err);
        showToast("Could not unsend this message. It remains visible; please try again.", "error");
    }).finally(() => chatPendingUnsend.delete(messageId));
}

/** What the "⋯" menu offers for one message. */
function chatMessageActions(m) {
    if (!m || m.unsentAt) return [];
    const mine = m.senderId === currentUserId;
    const actions = [];
    if (mine && chatMessageEditable(m)) actions.push("edit");
    if (mine) actions.push("unsend");
    if (m.body) actions.push("copy");
    return actions;
}

/** Sender only, within 15 minutes of the SERVER send time, at most 5 times.
 *  Messages sent before the new Rules carry no sentAt and cannot be edited. */
function chatMessageEditable(m) {
    const sent = chatMillis(m && m.sentAt);
    return !!(m && sent && !m.unsentAt && m.senderId === currentUserId &&
        (Number(m.editCount) || 0) < CHAT_EDIT_MAX &&
        Date.now() - sent < CHAT_EDIT_WINDOW_MS);
}

function closeChatMenu(returnFocus) {
    if (!chatMenu) return;
    const { menu, opener, backdrop, selected } = chatMenu;
    menu.remove();
    if (backdrop) backdrop.remove();
    if (selected) selected.classList.remove("is-selected");
    opener.setAttribute("aria-expanded", "false");
    chatMenu = null;
    if (returnFocus && opener.isConnected) opener.focus();
}

/** Phones get a bottom sheet: there is no room beside a message bubble. */
const CHAT_SHEET_QUERY = "(max-width: 600px)";

/**
 * The "⋯" menu. Built with DOM text only.
 *
 * Desktop (owner request 2026-09-24, "like Messenger"): it opens BESIDE the
 * "⋯", on the side away from the message, level with it, so it never covers
 * the message it acts on or the ones below. Phones: a bottom sheet with the
 * chosen message highlighted and a Cancel button.
 */
function openChatMenu(opener, items) {
    const again = chatMenu && chatMenu.opener === opener;
    closeChatMenu();
    if (again || !items.length) return;
    const menu = document.createElement("div");
    menu.className = "chat-menu";
    menu.setAttribute("role", "menu");
    items.forEach(item => {
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("role", "menuitem");
        button.className = "chat-menu__item" + (item.danger ? " chat-menu__item--danger" : "");
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("class", "icon");
        svg.setAttribute("aria-hidden", "true");
        const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
        use.setAttribute("href", "#ic-" + item.icon);
        svg.appendChild(use);
        const label = document.createElement("span");
        label.textContent = item.label;
        button.appendChild(svg);
        button.appendChild(label);
        button.addEventListener("click", () => { closeChatMenu(); item.run(); });
        menu.appendChild(button);
    });
    const sheet = window.matchMedia(CHAT_SHEET_QUERY).matches;
    const row = opener.closest(".chat-row, .chat-list__row");
    let backdrop = null;
    if (sheet) {
        menu.classList.add("chat-menu--sheet");
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "chat-menu__cancel";
        cancel.textContent = "Cancel";
        cancel.addEventListener("click", () => closeChatMenu(true));
        menu.appendChild(cancel);
        backdrop = document.createElement("div");
        backdrop.className = "chat-sheet-backdrop";
        backdrop.addEventListener("click", () => closeChatMenu(true));
        document.body.appendChild(backdrop);
    }
    document.body.appendChild(menu);
    opener.setAttribute("aria-expanded", "true");
    if (row) row.classList.add("is-selected");
    chatMenu = { menu, opener, backdrop, selected: row };

    if (!sheet) {
        const box = opener.getBoundingClientRect();
        const width = menu.offsetWidth;
        const height = menu.offsetHeight;
        const gap = 6;
        // Your own message sits on the right with its "⋯" to its left, so its
        // menu opens further left; everything else opens to the right.
        const preferLeft = !!opener.closest(".chat-row--mine");
        const fitsLeft = box.left - gap - width >= 8;
        const fitsRight = box.right + gap + width <= window.innerWidth - 8;
        let left;
        if (preferLeft ? fitsLeft : !fitsRight && fitsLeft) left = box.left - gap - width;
        else if (fitsRight) left = box.right + gap;
        else left = Math.max(8, Math.min(box.right - width, window.innerWidth - width - 8));
        const top = box.top + box.height / 2 - height / 2;
        menu.style.left = left + "px";
        menu.style.top = Math.max(8, Math.min(top, window.innerHeight - height - 8)) + "px";
    }
    const first = menu.querySelector("button");
    if (first) first.focus();
}

function openChatMessageMenu(opener, messageId) {
    const m = chatMessagesById[messageId];
    if (!m) return;
    const items = [];
    chatMessageActions(m).forEach(action => {
        if (action === "edit") {
            const minutes = Math.max(1, Math.ceil((CHAT_EDIT_WINDOW_MS - (Date.now() - chatMillis(m.sentAt))) / 60000));
            items.push({ icon: "edit", label: "Edit (" + minutes + " min left)", run: () => editMessage(messageId) });
        } else if (action === "unsend") {
            items.push({ icon: "undo", label: "Unsend", danger: true, run: () => unsendMessage(messageId) });
        } else if (action === "copy") {
            items.push({ icon: "copy", label: "Copy text", run: () => copyMessageText(messageId) });
        }
    });
    openChatMenu(opener, items);
}

function openChatConversationMenu(opener, conversationId) {
    const row = chatInboxRows[conversationId];
    if (!row) return;
    openChatMenu(opener, [row.trashed
        ? { icon: "undo", label: "Restore conversation", run: () => setConversationTrash(conversationId, row.marker, false, row.view) }
        : { icon: "trash", label: "Delete conversation", danger: true, run: () => setConversationTrash(conversationId, row.marker, true, row.view) }]);
}

function copyMessageText(messageId) {
    const m = chatMessagesById[messageId];
    if (!m || !m.body) return;
    const done = () => showToast("Message copied.", "success");
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        navigator.clipboard.writeText(m.body).then(done, () => showToast("Could not copy. Select the text instead.", "warning"));
        return;
    }
    showToast("Copying is not available in this browser. Select the text instead.", "warning");
}

/** Correct a message within 15 minutes. The earlier wording goes, in the same
 *  transaction, to an owner-only record (message_edit_audit), the same way
 *  Unsend keeps its original. */
async function editMessage(messageId) {
    const held = chatMessagesById[messageId];
    if (!held || !chatMessageEditable(held)) {
        showToast("This message can no longer be edited.", "warning");
        return;
    }
    if (chatPendingEdit.has(messageId)) return;
    const answer = await appDialog({
        title: "Edit message", confirmLabel: "Save",
        message: "You can edit a message within 15 minutes of sending it. It will show “Edited”.",
        fields: [{ name: "body", label: "Message", value: held.body, multiline: true, rows: 5, maxLength: 4000, required: true }]
    });
    if (!answer.confirmed) return;
    const body = answer.values.body.trim();
    if (!body || body === held.body) return;
    if (!navigator.onLine) {
        showToast("You are offline, so the change was not saved.", "warning");
        return;
    }
    chatPendingEdit.add(messageId);
    const senderId = currentUserId;
    const conversationId = held.conversationId;
    const messageRef = db.collection("messages").doc(messageId);
    const conversationRef = db.collection("conversations").doc(conversationId);
    const now = firebase.firestore.FieldValue.serverTimestamp();
    db.runTransaction(async tx => {
        const [messageSnap, summarySnap] = await Promise.all([tx.get(messageRef), tx.get(conversationRef)]);
        const live = messageSnap.exists ? messageSnap.data() : null;
        if (!live || live.senderId !== senderId || live.unsentAt || live.conversationId !== conversationId) {
            throw new Error("This message is unsent or is not yours.");
        }
        if ((Number(live.editCount) || 0) !== (Number(held.editCount) || 0) || live.body !== held.body) {
            throw new Error("This message changed on another screen. Open it again to edit.");
        }
        const count = (Number(live.editCount) || 0) + 1;
        tx.set(db.collection("message_edit_audit").doc(messageId + "_" + count), {
            messageId: messageId, conversationId: conversationId, senderId: senderId,
            editCount: count, previousBody: live.body, editedAt: now
        });
        tx.update(messageRef, { body: body, editedAt: now, editCount: count });
        if (summarySnap.exists && summarySnap.data().lastMessageId === messageId) {
            tx.update(conversationRef, { lastMessage: body.slice(0, 90) });
        }
    }).then(() => {
        showToast("Message edited.", "success");
        if (currentRole !== "patient") loadClinicInbox();
    }).catch(err => {
        console.error("Could not edit message:", err);
        showToast(/changed|unsent/.test(err.message || "") ? err.message
            : "Could not save the edit. The 15-minute window may have passed; the original stays.", "error");
    }).finally(() => chatPendingEdit.delete(messageId));
}

if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener("click", event => {
        if (!chatMenu) return;
        if (chatMenu.menu.contains(event.target) || chatMenu.opener.contains(event.target)) return;
        closeChatMenu();
    });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && chatMenu) { event.stopPropagation(); closeChatMenu(true); }
    }, true);
    window.addEventListener("resize", () => closeChatMenu());
}

/** Enter sends, Shift+Enter makes a new line — the convention everywhere else. */
function onChatKeydown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage(e);
    }
}


// ── X-ray and scanned files ──────────────────────────────────────────────

/**
 * What the uploader accepts.
 *
 * DICOM is included because that is what an intra-oral scanner actually
 * produces, but browsers cannot render it — a .dcm is stored and offered as a
 * download, not shown as a thumbnail. Pretending otherwise would give the
 * dentist a broken image icon and no explanation.
 */
const XRAY_ACCEPT = ".png,.jpg,.jpeg,.webp,.pdf,.dcm,application/dicom";

/** Anything larger than this is refused before the upload starts. */
const XRAY_MAX_BYTES = 20 * 1024 * 1024;   // 20 MB

/**
 * File names Storage will accept, as a pattern.
 *
 * Kept in step with hasExpectedExtension() in storage.rules and with
 * XRAY_ACCEPT above — all three list the same formats, and the rules file is
 * the one that decides. .svg and .html are absent from all three deliberately:
 * both are files a browser will execute, and a bucket that stores them will
 * serve them back from a firebasestorage.app URL as though the clinic had
 * published them.
 */
const XRAY_NAME_OK = /\.(png|jpe?g|webp|pdf|dcm|dicom)$/i;

/** True when the file is one a browser can draw as an image. */
function xrayIsViewable(contentType, name) {
    if (/^image\//.test(contentType || "")) return true;
    return /\.(png|jpe?g|webp)$/i.test(name || "");
}

/**
 * Whether Firebase Storage is actually available.
 *
 * The Storage SDK is an extra script tag. If it was not loaded, calling
 * firebase.storage() throws, and the dentist would see a raw exception rather
 * than a sentence telling them what is missing.
 */
function xrayStorageReady() {
    return typeof firebase !== "undefined" && typeof firebase.storage === "function";
}

/**
 * Scroll the x-ray panel into view.
 *
 * The panel is below the whole tooth chart. That is the right order for the
 * tab — charting is the work, files are the attachment — but it put the upload
 * a full screen and a half below the fold, and the doctor reported it as not
 * existing. Called by the X-rays button on the open-patient card.
 */
function jumpToXrays() {
    const panel = document.getElementById("xray-panel");
    if (!panel) return;
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * Say, on the page and permanently, that uploads are switched off.
 *
 * A toast is right for "that file was too big" — you read it, you pick another
 * file. It is wrong for this, because there is nothing the clinic can do at the
 * keyboard: the Firebase project has no Storage bucket, which is a billing
 * setting in the console. A message that fades leaves the doctor clicking the
 * same button and getting the same nothing.
 */
function showXrayStorageBlocked(detail) {
    const note = document.getElementById("xray-storage-note");
    if (!note) return;
    note.textContent =
        "File uploads are not switched on for this clinic yet. Firebase Storage " +
        "has to be enabled on the project before x-rays can be attached — it is a " +
        "setting in the Firebase console, not something this page can fix. " +
        "Everything else on the record card works normally." +
        (detail ? " (" + detail + ")" : "");
    note.classList.remove("hidden");
}

/**
 * Upload one or more files against a patient.
 *
 * Files go to Storage; a small document per file goes to Firestore so the
 * record card can list them without asking Storage to enumerate a folder.
 */
function uploadXrayFiles(patientId, fileList) {
    if (!patientId) {
        showToast("Open a patient's record first.", "warning");
        return;
    }
    if (!xrayStorageReady()) {
        showToast("File uploads are not switched on yet — the Firebase Storage script " +
                  "is not loaded. See js/clinic.js.", "error");
        return;
    }

    const files = Array.from(fileList || []);
    if (!files.length) return;

    const oversize = files.filter(f => f.size > XRAY_MAX_BYTES);
    if (oversize.length) {
        showToast(oversize.length + " file(s) are over 20 MB and were skipped.", "warning");
    }

    // The same extension list storage.rules enforces, checked here so a
    // refused file says why.
    //
    // XRAY_ACCEPT above only populates the file picker's filter, and a picker
    // filter is a suggestion — "All files" is one click away, and a drag-drop
    // ignores it entirely. Without this check those files reach Storage, get
    // refused there, and surface as "storage/unauthorized", which reads like
    // the uploader has lost their permissions rather than like they picked a
    // .docx. The rules stay the actual guard; this is so the message is true.
    const wrongType = files.filter(f => !XRAY_NAME_OK.test(String(f.name || "")));
    if (wrongType.length) {
        showToast(wrongType.length + " file(s) were skipped — x-rays and scans must be " +
                  "PNG, JPG, WEBP, PDF or DICOM (.dcm).", "warning");
    }

    const usable = files.filter(f => f.size <= XRAY_MAX_BYTES
                                  && f.size > 0
                                  && XRAY_NAME_OK.test(String(f.name || "")));
    if (!usable.length) return;

    const bar = document.getElementById("xray-progress-fill");
    const storage = firebase.storage();
    let done = 0;

    usable.forEach(file => {
        // Prefixed with a timestamp so two scans saved as "xray.jpg" on the
        // same machine do not overwrite one another in the bucket.
        const safeName = String(file.name).replace(/[^\w.\- ]+/g, "_");
        const path = "xrays/" + patientId + "/" + Date.now() + "_" + safeName;
        const task = storage.ref(path).put(file);

        task.on("state_changed",
            snap => {
                if (!bar) return;
                const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
                bar.style.transform = "scaleX(" + (pct / 100) + ")";
            },
            err => {
                console.error("X-ray upload failed:", err);
                const code = (err && err.code) || "";

                // Two failures look identical to the person clicking the
                // button and are completely different underneath.
                //
                // storage/unauthorized means the bucket exists and the rules
                // said no — a rules problem, fixable by deploying.
                //
                // The rest, and especially an unknown or a bucket-not-found,
                // is almost always that the project has no Storage bucket at
                // all. Firebase requires a paid plan to provision one, so on
                // the clinic's current plan EVERY upload fails this way. That
                // is not something to report as "could not upload" and let the
                // doctor try again with a smaller file.
                if (code === "storage/unauthorized") {
                    showToast("Could not upload " + file.name +
                              ". Storage rules are refusing it — see storage.rules.", "error");
                } else {
                    showXrayStorageBlocked(code || "no error code");
                    showToast("Could not upload " + file.name +
                              " — see the note on the panel.", "error");
                }
            },
            () => {
                task.snapshot.ref.getDownloadURL().then(url => {
                    return db.collection("patient_files").add({
                        patientId: patientId,
                        fileName: file.name,
                        storagePath: path,
                        downloadUrl: url,
                        contentType: file.type || "",
                        sizeBytes: file.size,
                        kind: "xray",
                        uploadedBy: currentUserId,
                        uploadedByName: currentUser,
                        createdAt: new Date().toISOString()
                    });
                })
                .then(() => {
                    done++;
                    if (done === usable.length) {
                        if (bar) bar.style.transform = "scaleX(0)";
                        showToast(done + " file(s) attached to the patient's record.", "success");
                        loadXrayFiles(patientId);
                    }
                })
                .catch(err => {
                    console.error("Could not record the uploaded file:", err);
                    showToast("The file uploaded but could not be listed. See the console.", "warning");
                });
            }
        );
    });
}

/** Draw the files already attached to a patient. */
function loadXrayFiles(patientId) {
    const host = document.getElementById("xray-grid");
    if (!host) return;

    if (!patientId) {
        host.innerHTML = '<p class="xray-empty">Select a patient to see their files.</p>';
        return;
    }

    host.innerHTML = '<p class="xray-empty">Loading…</p>';

    // Every id the record has had (R17): x-rays filed before an online
    // account was made stay under the old record's id.
    const picked = (typeof chartPatientCache !== "undefined" && chartPatientCache || [])
        .find(c => c.patient_id === patientId) || null;
    wherePatientIs(db.collection("patient_files"), patientRecordIds(patientId, picked))
        .get()
        .then(snap => {
            if (snap.empty) {
                host.innerHTML = '<p class="xray-empty">No x-rays or scans on file yet.</p>';
                return;
            }

            const files = [];
            snap.forEach(doc => files.push({ id: doc.id, ...doc.data() }));
            // Sorted here rather than with orderBy, so this needs no composite
            // index — a where + orderBy on different fields would require one,
            // and it would fail until somebody built it in the console.
            files.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

            host.innerHTML = files.map(f => {
                const when = f.createdAt
                    ? new Date(f.createdAt).toLocaleDateString("en-PH", { dateStyle: "medium" })
                    : "";
                const url = escapeHtml(f.downloadUrl);

                const visual = xrayIsViewable(f.contentType, f.fileName)
                    ? '<img class="xray-card__thumb" src="' + url + '" alt="' +
                        escapeHtml(f.fileName) + '" loading="lazy" ' +
                        'onclick="window.open(\'' + escapeJsAttr(f.downloadUrl) + '\', \'_blank\', \'noopener\')">'
                    : '<a class="xray-card__file" href="' + url + '" target="_blank" rel="noopener">' +
                        escapeHtml((f.fileName.split(".").pop() || "FILE").toUpperCase()) +
                      '</a>';

                return '<div class="xray-card">' + visual +
                    '<span class="xray-card__meta">' +
                        '<span class="xray-card__name" title="' + escapeHtml(f.fileName) + '">' +
                            escapeHtml(f.fileName) + '</span>' +
                        '<span class="xray-card__date">' + escapeHtml(when) + '</span>' +
                    '</span>' +
                '</div>';
            }).join("");
        })
        .catch(err => {
            console.error("Could not load patient files:", err);
            host.innerHTML = '<p class="xray-empty">Could not load files. ' +
                             'If this is the first run, the Firestore rules may not be deployed yet.</p>';
        });
}

/** Drag-and-drop onto the upload panel. */
function onXrayDragOver(e) {
    e.preventDefault();
    const zone = document.getElementById("xray-drop");
    if (zone) zone.classList.add("xray-drop--over");
}

function onXrayDragLeave() {
    const zone = document.getElementById("xray-drop");
    if (zone) zone.classList.remove("xray-drop--over");
}

function onXrayDrop(e, patientId) {
    e.preventDefault();
    onXrayDragLeave();
    uploadXrayFiles(patientId || selectedPatientId, e.dataTransfer.files);
}
