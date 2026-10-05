<?php
/**
 * DentCare — Clinical & billing modals
 * ---------------------------------------------------------------------------
 * Only included by portal.php. These contain patient clinical fields, so they
 * must never be part of the public page's markup.
 */
require_once __DIR__ . '/materials.php';

// The completion form embeds the Dental Record Card chart, so it needs both the
// FDI number lists and render_card_tooth(). require_once, so it does not matter
// whether the charting tab already pulled them in — this file must stand up on
// its own if the include order ever changes.
require_once __DIR__ . '/dentition.php';
require_once __DIR__ . '/tooth-glyph.php';
?>

<!-- Tooth chart editor — opened from the dentist's charting tab -->
<div id="modal-tooth-editor" class="modal-overlay">
    <div class="modal-card">
        <div class="modal-header">
            <h3>Edit Tooth <span id="tooth-modal-number">--</span> Status</h3>
            <button class="modal-close-btn" aria-label="Close"
                    onclick="closeModal('modal-tooth-editor')">&times;</button>
        </div>
        <div class="modal-body">
            <form id="form-tooth-status" onsubmit="saveToothStatus(event)">
                <input type="hidden" id="tooth-modal-num-hidden">

                <p id="tooth-modal-kind"
                   style="margin: 0 0 var(--space-s); color: var(--text-muted); font-size: 12px;">
                    Permanent tooth
                </p>

                <label>Affected surfaces</label>
                <!--
                    The five surfaces from the paper Dental Record Card. Built
                    by clickTooth() in js/records.js rather than written here,
                    because a front tooth is labelled La and a back tooth Bu,
                    and the biting surface is incisal on one and occlusal on
                    the other.

                    Leave them all unticked to mark the whole tooth, which is
                    how records made before surfaces existed were stored.
                -->
                <div class="surface-pick" id="tooth-modal-surfaces"></div>

                <!-- The same eight values, in the same order, as TOOTH_CONDITIONS
                     in js/records.js (tools/check-dentition.js compares them).
                     EXO and RCT were added on 2026-09-30. -->
                <label for="tooth-condition">Condition Status</label>
                <select id="tooth-condition" required onchange="onToothConditionChange()">
                    <option value="Healthy">Healthy (Unmarked)</option>
                    <option value="Decayed">Decayed (Caries)</option>
                    <option value="Filled">Filled (Restored)</option>
                    <option value="Missing">Missing (Extracted/Unerupted)</option>
                    <option value="Crowned">Crowned (Caps)</option>
                    <option value="Bridge">Bridge Support</option>
                    <option value="Extracted">EXO (Extraction)</option>
                    <option value="RCT">RCT (Root canal treatment)</option>
                </select>

                <!-- Shown only while the condition is Filled; see
                     onToothConditionChange() in js/records.js. -->
                <div id="tooth-material-wrap" class="hidden">
                    <label for="tooth-material">Filling type</label>
                    <select id="tooth-material">
                        <option value="">Not specified</option>
                        <option value="LC">LC (Light-cure composite)</option>
                        <option value="AM">AM (Amalgam)</option>
                        <option value="TF">TF (Temporary filling)</option>
                        <option value="GIC">GIC (Glass ionomer cement)</option>
                    </select>
                </div>

                <label for="tooth-notes">Clinical Notes</label>
                <textarea maxlength="1000" id="tooth-notes" placeholder="Describe symptoms, cavity depth, root conditions..."></textarea>

                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="closeModal('modal-tooth-editor')">Cancel</button>
                    <button type="submit">Update Tooth Chart</button>
                </div>
            </form>
        </div>
    </div>
</div>

<!-- Printable invoice receipt — opened from the staff billing tab.
     Printed through printReceipt() in js/billing.js (2026-09-30): the receipt
     alone, on the clinic's half sheet, with the Paper chooser beside the
     button. It used to call window.print() on the whole page. -->
<div id="modal-receipt" class="modal-overlay">
    <div class="modal-card">
        <div class="modal-header">
            <h3>Clinic Official Receipt</h3>
            <button class="modal-close-btn" aria-label="Close"
                    onclick="closeModal('modal-receipt')">&times;</button>
        </div>
        <div class="modal-body" id="receipt-printable-area">
            <!-- Filled in by renderReceipt() in js/billing.js -->
        </div>
        <div class="modal-footer">
            <span class="print-sheet-slot"></span>
            <button class="btn-secondary" onclick="closeModal('modal-receipt')">Close</button>
            <button onclick="printReceipt()">Print Receipt</button>
        </div>
    </div>
</div>

<!--
    ═══════════════════════════════════════════════════════════════════════
    COMPLETING A VISIT — the Dental Record Card, on screen
    ═══════════════════════════════════════════════════════════════════════

    Opened from Daily Appointments. This is deliberately the widest dialog in
    the system: the doctor is charting 52 teeth and writing four clinical
    fields, and doing that down a 550px column meant scrolling away from the
    chart to type what the chart was about.

    It carries no charge, price or payment field, and it must not gain one.
    The amount is taken from treatments/{id}.price when the form is submitted,
    and firestore.rules refuses a bill that does not match the price list —
    so the doctor never sees, sets or confirms a number. See
    tools/check-billing.js, which fails the build if a money word appears on
    any dentist screen.

    Nothing here writes to Firestore as it is filled in. The chart marks, the
    clinical notes and the bill are all written by ONE transaction on submit — submitCompleteAppointment() in
    js/appointments.js. A visit is either fully recorded or not recorded.
-->
<!--
    Shown straight after a visit is saved.

    Its job is the Print button. Since 2026-09-30 the only page printed for the
    patient is the PRESCRIPTION, laid out like Dr. Gapit's pad (js/prescription.js).
    It used to be a "visit record" with the charting, operation, findings and
    diagnosis on it; she asked for that to stop, because those are the clinic's
    records. It carries no money either: the official receipt comes from the
    front desk once the bill is actually settled.

    The button is disabled when the visit has no prescription. The Paper chooser
    beside it is filled in by fillPrintSheetSlots() in js/print.js.

    Filled by offerVisitPrintout() in js/appointments.js.
-->
<div id="modal-visit-done" class="modal-overlay">
    <div class="modal-card" style="max-width: 480px;">
        <div class="modal-header">
            <h3>Visit saved</h3>
            <button class="modal-close-btn" aria-label="Close"
                    onclick="closeModal('modal-visit-done')">&times;</button>
        </div>
        <div class="modal-body" id="visit-done-body"></div>
        <div class="modal-footer">
            <span class="print-sheet-slot"></span>
            <button type="button" class="btn-secondary"
                    onclick="closeModal('modal-visit-done')">Close</button>
            <button type="button" id="visit-done-print" onclick="printCompletedPrescription()">
                <?= icon('file') ?> Print prescription
            </button>
        </div>
    </div>
</div>

<!--
    A visit that was already recorded, reopened.
    ---------------------------------------------------------------------------
    Two things needed this. The printout is offered once, straight after saving,
    and a dentist who closes that dialog — or whose patient changes her mind
    about wanting a copy ten minutes later — had no way back to it. And there
    was nowhere to simply CHECK a visit she had written up, short of the
    patient's full history tab.

    Read-only on purpose. Correcting a record is a different act with different
    consequences, and it is not something to fall into by clicking Print.

    The dialog shows the doctor the whole record on screen. What it PRINTS is
    the prescription only (2026-09-30), and the button is disabled when that
    visit has none.
-->
<div id="modal-visit-record" class="modal-overlay">
    <div class="modal-card" style="max-width: 680px;">
        <div class="modal-header">
            <h3>Visit record</h3>
            <button class="modal-close-btn" aria-label="Close"
                    onclick="closeModal('modal-visit-record')">&times;</button>
        </div>
        <div class="modal-body" id="visit-record-body">
            <p class="field-hint">Loading&hellip;</p>
        </div>
        <div class="modal-footer">
            <span class="print-sheet-slot"></span>
            <button type="button" class="btn-secondary"
                    onclick="closeModal('modal-visit-record')">Close</button>
            <button type="button" id="visit-record-print"
                    onclick="printViewedVisit()">
                <?= icon('file') ?> Print prescription
            </button>
        </div>
    </div>
</div>

<!--
    ── Correcting a treatment log (2026-09-15) ────────────────────────────
    Opened from Edit on Treatment Logs. It changes the record that already
    exists; it never writes a new one. The date, procedure and charted teeth are
    shown but not editable: they are tied to the chart and to the stock taken at
    that visit, and changing them here would leave those disagreeing with the log.
    firestore.rules (dental_records, amendmentIsAttributable) lets only the owner
    save this, and requires it to be signed and dated.
-->
<!--
    ── Marking a patient (2026-09-16) ─────────────────────────────────────
    There is no "delete patient" anywhere in DentCare, on purpose. A dental
    record outlives the patient: the family may ask for it, and dental records
    are what identify remains. The Data Privacy Act asks that personal data be
    kept only as long as it is needed and then disposed of properly — a
    retention decision the clinic makes in its own policy, not a button.

    So the record stays whole and is marked instead. A marked patient drops out
    of the lists used to start new work, and every screen that shows them says
    what they are marked as.
-->
<!--
    Collect consent signature (2026-10-01, client revision 16). A record the
    front desk made without the patient there to sign carries consentPending;
    when the patient comes in, staff open this from Patient History and hand
    over the tablet. It writes consentSignature, consentSignatureImage and
    consentDate into medicalHistory and clears the flag: openCollectConsent()
    and submitCollectConsent() in js/records.js. The statement is filled in from
    CLINIC_CONSENT_STATEMENT, the one copy the record card prints.
-->
<div id="modal-collect-consent" class="modal-overlay">
    <div class="modal-card" style="max-width: 640px;">
        <div class="modal-header">
            <h3>Collect consent signature</h3>
            <button class="modal-close-btn" aria-label="Close"
                    onclick="closeModal('modal-collect-consent')">&times;</button>
        </div>
        <form id="form-collect-consent" onsubmit="submitCollectConsent(event)" novalidate>
            <div class="modal-body">
                <p class="field-hint" id="collect-consent-who"></p>
                <div class="consent collect-consent">
                    <div class="consent__text" id="collect-consent-statement"></div>
                    <div class="consent__agree">
                        <input type="checkbox" id="collect-consent-agree">
                        <label for="collect-consent-agree">
                            I have read, understood, and voluntarily agree to the Clinical Consent statement above.
                        </label>
                    </div>
                </div>
                <?php /* Ticked by the patient with the signature (2026-10-03, R22). */ ?>
                <?= privacy_agree_box('collect-consent-privacy') ?>
                <div class="signature collect-consent">
                    <div class="signature__header">
                        <div class="signature__title">Patient / Guardian Signature</div>
                        <div class="signature__subtitle">Draw the signature below, and type the full name under it.</div>
                    </div>
                    <div class="signature__wrap">
                        <canvas id="consent-canvas" class="signature__pad"></canvas>
                        <div class="signature__tools">
                            <button type="button" class="btn btn--clear" onclick="clearSignatureCanvas('consent-canvas')">Clear signature</button>
                            <span class="signature__hint">Draw using mouse or touch</span>
                        </div>
                    </div>
                    <label for="collect-consent-name">Signature Over Printed Name <span style="color:red;">*</span></label>
                    <input maxlength="200" type="text" id="collect-consent-name" placeholder="Type full legal name (e.g., Juan Dela Cruz)">
                    <label for="collect-consent-date">Date</label>
                    <input type="date" id="collect-consent-date">
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn-secondary"
                        onclick="closeModal('modal-collect-consent')">Cancel</button>
                <button type="submit" id="collect-consent-save">Save signature</button>
            </div>
        </form>
    </div>
</div>

<div id="modal-patient-status" class="modal-overlay">
    <div class="modal-card" style="max-width: 520px;">
        <div class="modal-header">
            <h3>Patient status</h3>
            <button class="modal-close-btn" aria-label="Close"
                    onclick="closeModal('modal-patient-status')">&times;</button>
        </div>
        <form id="form-patient-status" onsubmit="submitPatientStatus(event)">
            <div class="modal-body">
                <p class="field-hint" id="patient-status-who"></p>

                <div class="status-choice">
                    <label class="status-choice__item">
                        <input type="radio" name="patient-status" value="active" checked>
                        <span><strong>Active</strong>
                            <span class="field-hint">Coming to the clinic as usual.</span></span>
                    </label>
                    <label class="status-choice__item">
                        <input type="radio" name="patient-status" value="inactive">
                        <span><strong>Inactive</strong>
                            <span class="field-hint">Moved away, or has not been seen for a long time.
                            Hidden from the lists; the record is kept.</span></span>
                    </label>
                    <label class="status-choice__item">
                        <input type="radio" name="patient-status" value="deceased">
                        <span><strong>Deceased</strong>
                            <span class="field-hint">The record is kept in full and stays exportable.
                            Nothing is deleted.</span></span>
                    </label>
                </div>

                <label for="patient-status-date">Date (optional)</label>
                <input type="date" id="patient-status-date">

                <label for="patient-status-note">Note (optional)</label>
                <input maxlength="300" type="text" id="patient-status-note"
                       placeholder="E.g., informed by the family on 12 Sept">

                <p class="field-hint">
                    The chart, treatment logs, bills and record card are untouched, and the
                    patient still appears in Patient History and in the exports.
                </p>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn-secondary"
                        onclick="closeModal('modal-patient-status')">Cancel</button>
                <button type="submit" id="patient-status-save">Save status</button>
            </div>
        </form>
    </div>
</div>

<!--
    Deleting a patient who should never have existed: a duplicate, or one of the
    test entries from before launch. It is not how a deceased or former patient
    is handled — see modal-patient-status above — and it refuses outright once
    the patient has any appointment, treatment log, bill, receipt or x-ray row.
-->
<div id="modal-delete-patient" class="modal-overlay">
    <div class="modal-card" style="max-width: 520px;">
        <div class="modal-header">
            <h3>Delete patient</h3>
            <button class="modal-close-btn" aria-label="Close"
                    onclick="closeModal('modal-delete-patient')">&times;</button>
        </div>
        <form id="form-delete-patient" onsubmit="submitDeletePatient(event)">
            <div class="modal-body">
                <p class="delete-patient__who" id="delete-patient-who"></p>
                <p class="field-hint">
                    For a patient typed in twice, or a test entry. A patient who has died
                    or stopped coming is <strong>marked</strong> on Patient status, not deleted.
                </p>
                <div id="delete-patient-found"></div>

                <div class="hidden" id="delete-patient-confirm-row">
                    <label for="delete-patient-typed">Type DELETE to confirm</label>
                    <input maxlength="10" type="text" id="delete-patient-typed" autocomplete="off" placeholder="DELETE">
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn-secondary"
                        onclick="closeModal('modal-delete-patient')">Cancel</button>
                <button type="submit" class="btn-danger hidden" id="delete-patient-btn" disabled>
                    Delete permanently
                </button>
            </div>
        </form>
    </div>
</div>

<!--
    ── The clinic's certificate (2026-09-30) ──────────────────────────────
    Opened from the Certificate button on Patient History, by staff or the
    doctor, for the patient open there. It fills in Dr. Gapit's own form and
    prints it on the half sheet; she signs it by hand. Nothing here is saved.
    See js/certificate.js.
-->
<div id="modal-certificate" class="modal-overlay">
    <div class="modal-card" style="max-width: 560px;">
        <div class="modal-header">
            <h3>Certificate for <span id="cert-who"></span></h3>
            <button class="modal-close-btn" aria-label="Close"
                    onclick="closeModal('modal-certificate')">&times;</button>
        </div>
        <div class="modal-body">
            <div id="cert-date-select-wrap">
                <label for="cert-date-select">Examined and treated on</label>
                <select id="cert-date-select" onchange="onCertDateChange()"></select>
            </div>
            <div id="cert-date-other-wrap" class="hidden">
                <label for="cert-date-other">Date examined and treated</label>
                <input type="date" id="cert-date-other">
            </div>

            <label for="cert-findings">With the following</label>
            <textarea id="cert-findings" rows="4" maxlength="600"
                      oninput="certFindingsEdited = true"
                      placeholder="What the patient was examined and treated for"></textarea>

            <label for="cert-rest-days">Rest for at least (days)</label>
            <input id="cert-rest-days" type="number" min="0" max="365" step="1" inputmode="numeric"
                   placeholder="Leave empty to write it in by hand">

            <div class="form-row">
                <div class="flex-1">
                    <label for="cert-age">Age</label>
                    <input id="cert-age" type="text" maxlength="3" inputmode="numeric">
                </div>
                <div class="flex-2">
                    <label for="cert-address">Resident of</label>
                    <input id="cert-address" type="text" maxlength="200">
                </div>
            </div>
            <p class="field-hint">
                Printed on the clinic&rsquo;s certificate form for Dr. Gapit to sign. Nothing here is saved.
            </p>
        </div>
        <div class="modal-footer">
            <span class="print-sheet-slot"></span>
            <button type="button" class="btn-secondary"
                    onclick="closeModal('modal-certificate')">Cancel</button>
            <button type="button" onclick="printCertificate()">
                <?= icon('file') ?> Print certificate
            </button>
        </div>
    </div>
</div>

<div id="modal-edit-record" class="modal-overlay">
    <div class="modal-card" style="max-width: 640px;">
        <div class="modal-header">
            <h3>Edit treatment log</h3>
            <button class="modal-close-btn" aria-label="Close"
                    onclick="closeModal('modal-edit-record')">&times;</button>
        </div>
        <form id="form-edit-record" onsubmit="saveRecordCorrection(event)">
            <div class="modal-body">
                <input type="hidden" id="edit-rec-id">
                <div class="edit-rec-fixed" id="edit-rec-fixed"></div>
                <p class="field-hint edit-rec-lock-note">
                    The date, procedure and charted teeth stay as saved. They are tied to the
                    chart and the supplies used at that visit.
                </p>

                <label for="edit-rec-findings">Findings</label>
                <textarea maxlength="2000" id="edit-rec-findings" rows="2"></textarea>

                <label for="edit-rec-diagnosis">Diagnosis</label>
                <textarea maxlength="2000" id="edit-rec-diagnosis" rows="2"></textarea>

                <label for="edit-rec-treatment-done">Treatment done</label>
                <textarea maxlength="2000" id="edit-rec-treatment-done" rows="2"></textarea>

                <label for="edit-rec-prescription">Prescription (for the pharmacy)</label>
                <textarea maxlength="2000" id="edit-rec-prescription" rows="2"></textarea>

                <label for="edit-rec-notes">Notes</label>
                <textarea maxlength="2000" id="edit-rec-notes" rows="2"></textarea>

                <label for="edit-rec-next-visit">Next recommended visit</label>
                <input type="date" id="edit-rec-next-visit">

                <label for="edit-rec-reason">Why are you correcting it? <span class="required-mark">*</span></label>
                <input maxlength="300" type="text" id="edit-rec-reason" required
                       placeholder="E.g., wrong tooth written in the diagnosis">
            </div>
            <div class="modal-footer">
                <button type="button" class="btn-secondary"
                        onclick="closeModal('modal-edit-record')">Cancel</button>
                <button type="submit" id="edit-rec-save">Save correction</button>
            </div>
        </form>
    </div>
</div>

<div id="modal-complete-appt" class="modal-overlay">
    <div class="modal-card modal-card--wide">
        <div class="modal-header">
            <h3>Record Visit</h3>
            <button class="modal-close-btn" aria-label="Close"
                    onclick="closeModal('modal-complete-appt')">&times;</button>
        </div>

        <div class="modal-body">
            <form id="form-complete-appt" onsubmit="submitCompleteAppointment(event)">
                <input type="hidden" id="complete-appt-id">
                <input type="hidden" id="complete-patient-id">
                <input type="hidden" id="complete-treatment-id">

                <div class="summary-strip">
                    <strong>Patient:</strong> <span id="complete-patient-name">--</span>
                    &nbsp;&nbsp;<span id="complete-patient-meta" class="muted"></span><br>
                    <strong>Procedure booked:</strong> <span id="complete-treatment-name">--</span>

                    <!--
                        The patient's own words, when they booked through
                        "Others". Filled by openCompletionModal(); hidden when
                        the booking named only standard services.
                    -->
                    <div id="complete-other-request" class="svc-other-note hidden"></div>
                </div>

                <!-- Allergies and conditions, carried over from the charting
                     tab. A doctor about to prescribe should not have to leave
                     this form to find out the patient is penicillin-allergic. -->
                <div id="complete-safety-banner" class="clinical-alert-banner hidden">
                    <?= icon('alert') ?>
                    <span id="complete-safety-text"></span>
                </div>

                <!-- A record made without the patient's signature (2026-10-01).
                     Shown only; it never stops the visit being saved. -->
                <p id="complete-consent-notice" class="visit-consent-notice hidden">
                    Consent not signed yet. Collect the signature on Patient History when you can.
                </p>

                <!-- ── 1. Teeth treated this visit ─────────────────────── -->
                <section class="visit-section">
                    <h4 class="visit-section__title">1. Teeth treated this visit</h4>
                    <p class="card-hint">
                        Choose a condition, then click the teeth you treated. Click a
                        tooth again to take it back off this visit&rsquo;s list.
                        Teeth already on the patient&rsquo;s record are shown faded, and
                        today&rsquo;s changes are outlined.
                    </p>

                    <!-- The palette. Pick a condition and the surfaces once,
                         then click teeth — the same way you would shade the
                         paper card, rather than filling in a form per tooth. -->
                    <div class="visit-palette">
                        <div class="visit-palette__group">
                            <span class="visit-palette__label">Marking as</span>
                            <div class="visit-palette__chips" id="visit-condition-chips">
                                <!-- populated by renderVisitPalette() -->
                            </div>
                        </div>

                        <div class="visit-palette__group">
                            <span class="visit-palette__label">Surfaces</span>
                            <div class="surface-pick" id="visit-surface-pick">
                                <!-- populated by renderVisitPalette() -->
                            </div>
                            <p class="field-hint">Leave all unticked to mark the whole tooth.</p>
                        </div>
                    </div>

                    <?php
                    // The same chart the Dental Record Card tab draws, under the
                    // 'visit' scope so its ids and clicks stay separate.
                    $scope = 'visit';
                    include __DIR__ . '/record-card-chart.php';
                    ?>

                    <div id="visit-tooth-summary" class="visit-summary"></div>
                </section>

                <!-- ── 2. The clinical fields, as printed on the card ────
                     None of the four is required (Dr. Gapit, 2026-09-30): she
                     saves with whatever she filled in. Only the final charge
                     below is required, because saving a visit raises the bill. -->
                <section class="visit-section">
                    <h4 class="visit-section__title">2. Clinical record</h4>

                    <div class="visit-grid">
                        <div>
                            <label for="complete-diagnosis">Diagnosis</label>
                            <textarea maxlength="2000" id="complete-diagnosis" rows="3"
                                      placeholder="The condition being treated…"></textarea>
                        </div>
                        <div>
                            <!-- Findings is its own field on the paper card and
                                 is now its own field here. It used to be folded
                                 into Diagnosis, which meant what was observed
                                 and what it was judged to be were stored as one
                                 blob that could not be read back apart. -->
                            <label for="complete-findings">Findings</label>
                            <textarea maxlength="2000" id="complete-findings" rows="3"
                                      placeholder="What was observed on examination…"></textarea>
                        </div>
                        <div>
                            <label for="complete-treatment-done">Treatment / Operation</label>
                            <textarea maxlength="2000" id="complete-treatment-done" rows="3"
                                      placeholder="What was actually carried out…"></textarea>
                        </div>
                    </div>

                    <!-- Prescription: one row per medicine (2026-09-30). It
                         used to be one free-text box. Dr. Gapit's usual
                         medicines fill a row from a few typed letters; the
                         quantity is always hers to write. Drawn and handled by
                         js/prescription.js. The rows are what is printed for
                         the patient, in the layout of her pad. -->
                    <div class="rx-editor" role="group" aria-labelledby="complete-rx-title">
                        <span class="rx-editor__title" id="complete-rx-title">Prescription</span>
                        <div id="complete-rx-rows" class="rx-rows">
                            <!-- populated by renderVisitRx() -->
                        </div>
                        <button type="button" class="btn-secondary btn-sm" id="complete-rx-add"
                                onclick="addVisitRxRow()">Add medicine</button>
                        <p class="field-hint">
                            Type the first letters of a usual medicine and press Tab to fill the row.
                            Anything else can be typed in full. This is the page printed for the
                            patient. It is never billed.
                        </p>
                    </div>
                </section>

                <!-- ── 3. Follow-up ─────────────────────────────────────
                     There is no supplies list here any more (2026-10-01, Dr.
                     Gapit). Recording a visit takes nothing from stock: the
                     front desk files what was taken out in Medical Inventory,
                     and it comes off the shelf when she approves it on Stock
                     Approvals (js/stock-requests.js). -->
                <section class="visit-section">
                    <h4 class="visit-section__title">3. Follow-up</h4>

                    <div class="visit-grid">
                        <div>
                            <label for="complete-next-visit">Next recommended visit</label>
                            <input type="date" id="complete-next-visit">

                            <label for="complete-notes">Notes for the record</label>
                            <textarea maxlength="2000" id="complete-notes" rows="4"
                                      placeholder="Anything else worth having on file…"></textarea>
                        </div>
                    </div>
                </section>

                <!--
                    ── THE FINAL CHARGE ──────────────────────────────────────
                    Added 2026-08-29 at Dr. Gapit's request, and it REVERSES a
                    rule this system was built around: "a dentist never touches
                    an amount." The bill used to be priced automatically from
                    treatments/{id}.price, and the dentist never saw a number.

                    The clinic's reason is that a real visit does not cost what
                    the price list says. Two fillings, an unexpected extraction,
                    or a patient who needs less than was booked all end up at a
                    figure only the person who did the work can set.

                    What this means for anyone reading later: the separation of
                    duties is now WEAKER on purpose. It has not been abandoned —
                    staff still own payments, discounts and settlement, and the
                    dentist still cannot mark a bill paid — but the total is now
                    typed by the dentist rather than derived. firestore.rules
                    was changed to match; see the note on billing there.
                -->
                <section class="visit-section">
                    <h4 class="visit-section__title">Charge for this visit</h4>

                    <div class="form-row">
                        <div class="flex-1">
                            <label for="complete-charge">Final charge (₱) <span class="field-req">*</span></label>
                            <input type="number" id="complete-charge" min="0" step="0.01"
                                   placeholder="0.00" required
                                   oninput="updateCompleteChargeHint()">
                            <p class="field-hint" id="complete-charge-hint">
                                What the patient is billed for this visit. The front desk
                                collects it. You are not recording a payment here.
                            </p>
                        </div>
                        <div class="flex-1">
                            <label for="complete-charge-note">What the charge covers</label>
                            <input maxlength="200" type="text" id="complete-charge-note"
                                   placeholder="e.g. 2 surfaces composite + extraction">
                            <p class="field-hint">Appears on the patient's bill as the description.</p>
                        </div>
                    </div>
                </section>

                <div class="modal-footer">
                    <button type="button" class="btn-secondary"
                            onclick="closeModal('modal-complete-appt')">Cancel</button>
                    <button type="submit">Save visit &amp; complete appointment</button>
                </div>
            </form>
        </div>
    </div>
</div>
