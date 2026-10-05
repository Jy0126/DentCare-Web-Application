<?php
/**
 * DentCare — Clinic tab: Patient Messages (dentist and staff)
 * ---------------------------------------------------------------------------
 * The clinic side of the messaging module: an inbox of patient threads on the
 * left, the selected conversation on the right.
 *
 * Included by BOTH the dentist and the staff dashboard, so the tab id and the
 * element ids inside it must stay unique per page. They are: only one of the
 * two layouts is ever rendered into the portal at a time.
 *
 * Set before including:
 *   $role_prefix  string  'dentist' or 'staff' — drives the tab id, matching
 *                         the convention tab_manage_schedule.php already uses
 *
 * Driven by js/clinic.js.
 */

if (!isset($role_prefix)) { $role_prefix = 'staff'; }
?>
<!-- Clinic Tab: Patient Messages -->
<div id="tab-<?= e($role_prefix) ?>-messages" class="tab-content hidden">
    <div class="card-header">
        <h2>Patient Messages</h2>
    </div>

    <div class="card">
        <div class="chat-layout">
            <!-- Inbox -->
            <div class="chat-list">
                <p class="chat-empty">Loading&hellip;</p>
            </div>

            <!-- The open thread -->
            <div class="chat-panel">
                <div class="chat-panel__head">
                    <span class="chat-head">Select a conversation</span>
                    <button type="button" class="chat-trash-action" onclick="toggleConversationTrash()" hidden>Delete conversation</button>
                </div>
                <p class="chat-trash-note" hidden></p>

                <div class="chat-thread" role="log" aria-live="polite">
                    <p class="chat-empty">Choose a patient on the left to read their messages.</p>
                </div>

                <form class="chat-compose" onsubmit="sendMessage(event)">
                    <textarea maxlength="4000" class="chat-input" rows="1" required
                              placeholder="Reply to the patient&hellip;"
                              onkeydown="onChatKeydown(event)"></textarea>
                    <button type="submit">Send</button>
                </form>
            </div>
        </div>
    </div>
</div>
