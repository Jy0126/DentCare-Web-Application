<?php
/**
 * DentCare — Patient tab: Messages
 * ---------------------------------------------------------------------------
 * The patient's single conversation with the clinic. There is no thread list
 * here: a patient only ever has one thread, addressed as conv_<their uid>, so
 * a list of one row would be furniture.
 *
 * Driven by js/clinic.js.
 */
?>
<!-- Patient Tab: Messages -->
<div id="tab-patient-messages" class="tab-content hidden">
    <div class="card-header">
        <h2>Message the Clinic</h2>
    </div>

    <div class="card">
        <div class="chat-layout">
            <div class="chat-panel">
                <div class="chat-panel__head">
                    <span class="chat-head">Dr. Gapit&rsquo;s clinic</span>
                    <button type="button" class="chat-trash-action" onclick="toggleConversationTrash()" hidden>Delete conversation</button>
                </div>
                <p class="chat-trash-note" hidden></p>

                <!--
                    Said on every thread, not once in a policy. A patient
                    describing tooth pain in a chat box may reasonably think
                    they are being treated; they are not, and the gap between
                    a reply arriving in an hour and one arriving on Monday is
                    exactly where that assumption becomes dangerous.
                -->
                <p class="chat-disclaimer">
                    Messages are answered during clinic hours and are not monitored
                    continuously. For severe pain, bleeding or swelling, call the
                    clinic or go to the nearest emergency room.
                </p>

                <div class="chat-thread" role="log" aria-live="polite">
                    <p class="chat-empty">Loading&hellip;</p>
                </div>

                <form class="chat-compose" onsubmit="sendMessage(event)">
                    <textarea maxlength="4000" class="chat-input" rows="1" required
                              placeholder="Ask about an appointment, a bill, or a concern&hellip;"
                              onkeydown="onChatKeydown(event)"></textarea>
                    <button type="submit">Send</button>
                </form>
            </div>
        </div>
    </div>
</div>
