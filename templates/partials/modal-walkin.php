<?php
/**
 * DentCare — Walk-in chooser
 * ---------------------------------------------------------------------------
 * The first thing a walk-in patient sees on the front-desk tablet.
 *
 * WHY THIS ASKS BEFORE IT REGISTERS
 * Every walk-in used to be sent straight into the registration form. A patient
 * who had been to the clinic before would fill it in again, and end up with a
 * second account and a second chart for the same mouth — which is the one
 * mistake a dental record system must not make, because the tooth chart on the
 * new record is blank and the history on the old one is invisible.
 *
 * WHY A RETURNING PATIENT IS HANDED BACK TO STAFF
 * Looking a patient up means reading the patients collection, and
 * firestore.rules:115 allows that only for a clinician or the patient
 * themselves. That rule is right and is not being weakened: without it anyone
 * could type a common surname and find out who is a patient here. So the
 * lookup happens on the staff member's own signed-in screen, in the queue tab
 * — not on a tablet held by a stranger. (Since 2026-09-30 that staff lookup is
 * by surname alone, as it is typed; being signed in is what makes that safe.)
 *
 * Opened by startWalkInRegistration() in js/queue.js.
 */
?>

<div id="modal-walkin" class="modal-overlay">
    <div class="modal-card" style="max-width: 560px;">
        <div class="modal-header">
            <h3>Welcome! Are you a new patient?</h3>
            <button type="button" class="modal-close-btn" aria-label="Close"
                    onclick="closeWalkInModal()">&times;</button>
        </div>

        <div class="modal-body" style="padding: var(--space-m);">

            <!-- Step 1: the question -->
            <div id="walkin-choice">
                <p class="walkin-lead">
                    Please tap the one that applies to you. Our staff can help if
                    you are not sure.
                </p>

                <div class="walkin-options">
                    <button type="button" class="walkin-option" onclick="beginWalkInRegistration()">
                        <span class="walkin-option__mark"><?= icon('clipboard') ?></span>
                        <span class="walkin-option__title">This is my first visit</span>
                        <span class="walkin-option__text">
                            We will ask for your details and a short health history.
                            It takes a few minutes.
                        </span>
                    </button>

                    <button type="button" class="walkin-option" onclick="showWalkInReturning()">
                        <span class="walkin-option__mark"><?= icon('check') ?></span>
                        <span class="walkin-option__title">I have been here before</span>
                        <span class="walkin-option__text">
                            No need to fill anything in again. Our staff will find
                            your record.
                        </span>
                    </button>
                </div>
            </div>

            <!-- Shown while the browser is being asked where it is. Only a
                 clear "somewhere else" stops registration; see checkAtClinic()
                 in js/queue.js. -->
            <p id="walkin-checking" class="walkin-lead hidden">
                <?= icon('clock') ?>
                Just a moment. Checking you are at the clinic&hellip;
            </p>

            <!-- Shown when the device is clearly not at the clinic. -->
            <div id="walkin-too-far" class="hidden">
                <p class="walkin-handback">
                    <?= icon('info') ?>
                    <span>
                        <strong>The walk-in queue is for patients already at the clinic.</strong>
                        <span id="walkin-too-far__distance"></span>
                        Today&rsquo;s queue is the order people are waiting in, so it is
                        filled in at the clinic itself.
                    </span>
                </p>
                <!--
                    The address comes from clinic-data.php, not from a string
                    typed here.

                    This used to read "Stall 1049, ground floor, Ramada
                    Centrum". The real address is Stall 104B in RamAIda
                    Centrum, so both the stall and the building were wrong, on
                    the one screen shown to somebody standing outside trying to
                    find the door. Every other page on the site had it right,
                    which is exactly how a hardcoded copy goes unnoticed.
                -->
                <p class="walkin-lead">
                    Come to <strong><?= e($clinic['address_line']) ?></strong> and our
                    staff will add you to the queue. If you <strong>are</strong> at the clinic
                    and still see this, please ask our staff. They can add you by hand.
                </p>
                <div class="walkin-actions">
                    <button type="button" class="btn btn--outline" onclick="bookInsteadOfWalkIn()">
                        Book an appointment instead
                    </button>
                    <button type="button" class="btn-secondary" onclick="closeWalkInModal()">
                        Close
                    </button>
                </div>
            </div>

            <!-- Shown when the device gives no usable location: blocked,
                 switched off, too slow or too vague. Owner decision
                 2026-09-25: no location, no self check-in. Never a dead end:
                 try again, book instead, or the desk adds them by hand.
                 Filled by showWalkInNoLocation() in js/queue.js. -->
            <div id="walkin-no-location" class="hidden">
                <p class="walkin-handback">
                    <?= icon('info') ?>
                    <span>
                        <strong>We could not confirm that you are at the clinic.</strong>
                        <span id="walkin-no-location__why"></span>
                    </span>
                </p>
                <p class="walkin-lead">
                    Already at the clinic? Please ask our staff. They can add you to
                    today&rsquo;s queue.
                </p>
                <div class="walkin-actions walkin-actions--three">
                    <button type="button" class="btn" onclick="retryWalkInLocation()">
                        Try again
                    </button>
                    <button type="button" class="btn btn--outline" onclick="bookInsteadOfWalkIn()">
                        Book an appointment instead
                    </button>
                    <button type="button" class="btn-secondary" onclick="closeWalkInModal()">
                        Close
                    </button>
                </div>
            </div>

            <!-- Step 2: shown only to a returning patient -->
            <div id="walkin-returning" class="hidden">
                <p class="walkin-handback">
                    <?= icon('info') ?>
                    <span>
                        <strong>Please hand the tablet back to our staff.</strong>
                        They will find your record and add you to today&rsquo;s
                        queue. You do not need to sign in or fill in the form
                        again.
                    </span>
                </p>

                <button type="button" class="btn btn--outline btn--block"
                        onclick="resetWalkInModal()">
                    Back
                </button>
            </div>

        </div>
    </div>
</div>
