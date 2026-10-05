<?php
/**
 * DentCare — Health answers (the medical questionnaire), clinic side
 * ---------------------------------------------------------------------------
 * Only included by portal.php, once. Opened from Patient History by
 * openHealthAnswers() in js/records.js, for the patient that is open there.
 *
 * Moved here on 2026-09-30. It used to be the patient's own "My Medical
 * History" tab. The owner decided a patient account shows nothing clinical, so
 * allergies, medicines and conditions are kept up to date by staff and the
 * doctor instead. The form itself, and every pat-* id in it, is unchanged, so
 * the JavaScript that loads, locks and saves it did not have to change shape.
 *
 * Locked until Edit (clinic request, 2026-09-14), so scrolling past a YES/NO
 * pill cannot change an answer the dentist reads before treatment.
 */
?>
<div id="modal-health-answers" class="modal-overlay">
    <div class="modal-card" style="max-width: 760px;">
        <div class="modal-header">
            <h3>Health answers <span id="health-answers-who"></span></h3>
            <button class="modal-close-btn" aria-label="Close"
                    onclick="closeModal('modal-health-answers')">&times;</button>
        </div>
        <div class="modal-body">
            <div class="medical-lock-head">
                <p class="medical-lock-note" id="pat-medical-lock-note" aria-live="polite">Loading the patient&rsquo;s answers&hellip;</p>
                <button type="button" class="medical-edit-btn" id="pat-medical-edit-btn"
                        onclick="startMedicalEdit()" disabled>
                    <?= icon('notes') ?> Edit
                </button>
            </div>
            <form id="form-patient-medical" class="is-locked" onsubmit="updateMedicalHistory(event)">
                <fieldset id="pat-medical-fields" class="medical-fields" disabled>
                <legend class="visually-hidden">Health questionnaire</legend>
                <div class="medical-history-wizard" style="margin-top: 0;">
                    
                    <div class="switch-row">
                        <div class="switch-label-col">
                            <div class="switch-label-title">Good Health?</div>
                        </div>
                        <div class="switch-options-col">
                            <div class="radio-pill" id="pat-good-health">
                                <div class="radio-pill-item" data-val="1" onclick="setRadioPill('pat-good-health', 1)">YES</div>
                                <div class="radio-pill-item" data-val="0" onclick="setRadioPill('pat-good-health', 0)">NO</div>
                            </div>
                        </div>
                    </div>

                    <div class="switch-row">
                        <div class="switch-label-col"><div class="switch-label-title">Under Treatment?</div></div>
                        <div class="switch-options-col">
                            <div class="radio-pill" id="pat-treatment">
                                <div class="radio-pill-item" data-val="1" onclick="setRadioPill('pat-treatment', 1); showDetails('pat-treatment-details-wrap')">YES</div>
                                <div class="radio-pill-item" data-val="0" onclick="setRadioPill('pat-treatment', 0); hideDetails('pat-treatment-details-wrap')">NO</div>
                            </div>
                        </div>
                    </div>
                    <div id="pat-treatment-details-wrap" class="hidden">
                        <label for="pat-treatment-details">Treatment Details</label>
                        <input maxlength="500" type="text" id="pat-treatment-details">
                    </div>

                    <div class="switch-row">
                        <div class="switch-label-col"><div class="switch-label-title">Serious Illness / Operation?</div></div>
                        <div class="switch-options-col">
                            <div class="radio-pill" id="pat-illness">
                                <div class="radio-pill-item" data-val="1" onclick="setRadioPill('pat-illness', 1); showDetails('pat-illness-details-wrap')">YES</div>
                                <div class="radio-pill-item" data-val="0" onclick="setRadioPill('pat-illness', 0); hideDetails('pat-illness-details-wrap')">NO</div>
                            </div>
                        </div>
                    </div>
                    <div id="pat-illness-details-wrap" class="hidden">
                        <label for="pat-illness-details">Illness Details</label>
                        <input maxlength="500" type="text" id="pat-illness-details">
                    </div>

                    <div class="switch-row">
                        <div class="switch-label-col"><div class="switch-label-title">Hospitalized?</div></div>
                        <div class="switch-options-col">
                            <div class="radio-pill" id="pat-hospitalized">
                                <div class="radio-pill-item" data-val="1" onclick="setRadioPill('pat-hospitalized', 1); showDetails('pat-hospitalized-details-wrap')">YES</div>
                                <div class="radio-pill-item" data-val="0" onclick="setRadioPill('pat-hospitalized', 0); hideDetails('pat-hospitalized-details-wrap')">NO</div>
                            </div>
                        </div>
                    </div>
                    <div id="pat-hospitalized-details-wrap" class="hidden">
                        <label for="pat-hospitalized-details">Hospitalization Details</label>
                        <input maxlength="500" type="text" id="pat-hospitalized-details">
                    </div>

                    <div class="switch-row">
                        <div class="switch-label-col"><div class="switch-label-title">Prescribed Medicine?</div></div>
                        <div class="switch-options-col">
                            <div class="radio-pill" id="pat-prescribed">
                                <div class="radio-pill-item" data-val="1" onclick="setRadioPill('pat-prescribed', 1); showDetails('pat-prescribed-details-wrap')">YES</div>
                                <div class="radio-pill-item" data-val="0" onclick="setRadioPill('pat-prescribed', 0); hideDetails('pat-prescribed-details-wrap')">NO</div>
                            </div>
                        </div>
                    </div>
                    <div id="pat-prescribed-details-wrap" class="hidden">
                        <label for="pat-prescribed-details">Prescribed Medicine Details</label>
                        <input maxlength="500" type="text" id="pat-prescribed-details">
                    </div>

                    <label style="margin-top: 15px; margin-bottom: 5px;">Allergies</label>
                    <div class="checklist-grid" id="pat-allergies-grid">
                        <div class="checkbox-card" id="pat-allergy-Local-Anesthetics-ex-Lidocaine" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Local Anesthetics (ex. Lidocaine)</span>
                            <input type="checkbox" value="Local Anesthetics (ex. Lidocaine)">
                        </div>
                        <div class="checkbox-card" id="pat-allergy-Penicillin-Antibiotics" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Penicillin, Antibiotics</span>
                            <input type="checkbox" value="Penicillin, Antibiotics">
                        </div>
                        <div class="checkbox-card" id="pat-allergy-Sulfa-Drugs" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Sulfa Drugs</span>
                            <input type="checkbox" value="Sulfa drugs">
                        </div>
                        <div class="checkbox-card" id="pat-allergy-Aspirin" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Aspirin</span>
                            <input type="checkbox" value="Aspirin">
                        </div>
                        <div class="checkbox-card" id="pat-allergy-Latex" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Latex</span>
                            <input type="checkbox" value="Latex">
                        </div>
                    </div>
                    <label for="pat-allergy-others" style="margin-top: 8px;">Others (specify)</label>
                    <input maxlength="300" type="text" id="pat-allergy-others" placeholder="Other allergies not listed above">

                    <label style="margin-top: 15px; margin-bottom: 5px;">Has, or has had, any of the following (tick all that apply):</label>
                    <div class="checklist-grid" id="pat-conditions-grid">
                        <div class="checkbox-card" id="pat-condition-High-Blood-Pressure" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>High Blood Pressure</span>
                            <input type="checkbox" value="High blood pressure">
                        </div>
                        <div class="checkbox-card" id="pat-condition-Low-Blood-Pressure" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Low Blood Pressure</span>
                            <input type="checkbox" value="Low blood pressure">
                        </div>
                        <div class="checkbox-card" id="pat-condition-Epilepsy-Convulsion" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Epilepsy / Convulsion</span>
                            <input type="checkbox" value="Epilepsy / Convulsion">
                        </div>
                        <div class="checkbox-card" id="pat-condition-AIDS-HIV-Infection" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>AIDS / HIV Infection</span>
                            <input type="checkbox" value="AIDS / HIV Infection">
                        </div>
                        <div class="checkbox-card" id="pat-condition-Thyroid-Problem" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Thyroid Problem</span>
                            <input type="checkbox" value="Thyroid Problem">
                        </div>
                        <div class="checkbox-card" id="pat-condition-Stomach-Troubles-Ulcers" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Stomach Troubles / Ulcers</span>
                            <input type="checkbox" value="Stomach Troubles / Ulcers">
                        </div>
                        <div class="checkbox-card" id="pat-condition-Fainting-Seizure" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Fainting Seizure</span>
                            <input type="checkbox" value="Fainting Seizure">
                        </div>
                        <div class="checkbox-card" id="pat-condition-Rapid-Weight-Loss" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Rapid Weight Loss</span>
                            <input type="checkbox" value="Rapid Weight Loss">
                        </div>
                        <div class="checkbox-card" id="pat-condition-Radiation-Therapy" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Radiation Therapy</span>
                            <input type="checkbox" value="Radiation Therapy">
                        </div>
                        <div class="checkbox-card" id="pat-condition-Joint-Replacement-Implant" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Joint Replacement / Implant</span>
                            <input type="checkbox" value="Joint Replacement / Implant">
                        </div>
                        <div class="checkbox-card" id="pat-condition-Heart-Surgery" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Heart Surgery</span>
                            <input type="checkbox" value="Heart Surgery">
                        </div>
                        <div class="checkbox-card" id="pat-condition-Sexually-Transmitted-Disease" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Sexually Transmitted Disease</span>
                            <input type="checkbox" value="Sexually Transmitted Disease">
                        </div>
                        <div class="checkbox-card" id="pat-condition-Heart-Attack" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Heart Attack</span>
                            <input type="checkbox" value="Heart Attack">
                        </div>
                        <div class="checkbox-card" id="pat-condition-Heart-Disease" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Heart Disease</span>
                            <input type="checkbox" value="Heart Disease">
                        </div>
                        <div class="checkbox-card" id="pat-condition-Heart-Murmur" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Heart Murmur</span>
                            <input type="checkbox" value="Heart Murmur">
                        </div>
                        <div class="checkbox-card" id="pat-condition-Diabetes" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Diabetes</span>
                            <input type="checkbox" value="Diabetes">
                        </div>
                        <div class="checkbox-card" id="pat-condition-Rheumatic-Fever" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Rheumatic Fever</span>
                            <input type="checkbox" value="Rheumatic Fever">
                        </div>
                        <div class="checkbox-card" id="pat-condition-Hay-Fever-Allergies" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Hay Fever / Allergies</span>
                            <input type="checkbox" value="Hay Fever / Allergies">
                        </div>
                        <div class="checkbox-card" id="pat-condition-Respiratory-Problems" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Respiratory Problems</span>
                            <input type="checkbox" value="Respiratory Problems">
                        </div>
                        <div class="checkbox-card" id="pat-condition-Hepatitis-Jaundice" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Hepatitis / Jaundice</span>
                            <input type="checkbox" value="Hepatitis / Jaundice">
                        </div>
                        <div class="checkbox-card" id="pat-condition-Tuberculosis" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Tuberculosis</span>
                            <input type="checkbox" value="Tuberculosis">
                        </div>
                        <div class="checkbox-card" id="pat-condition-Swollen-Ankles" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Swollen Ankles</span>
                            <input type="checkbox" value="Swollen Ankles">
                        </div>
                        <div class="checkbox-card" id="pat-condition-Kidney-Disease" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Kidney Disease</span>
                            <input type="checkbox" value="Kidney Disease">
                        </div>
                        <div class="checkbox-card" id="pat-condition-Chest-Pain" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Chest Pain</span>
                            <input type="checkbox" value="Chest Pain">
                        </div>
                        <div class="checkbox-card" id="pat-condition-Stroke" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Stroke</span>
                            <input type="checkbox" value="Stroke">
                        </div>
                        <div class="checkbox-card" id="pat-condition-Cancer-Tumors" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Cancer / Tumors</span>
                            <input type="checkbox" value="Cancer / Tumors">
                        </div>
                        <div class="checkbox-card" id="pat-condition-Anemia" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Anemia</span>
                            <input type="checkbox" value="Anemia">
                        </div>
                        <div class="checkbox-card" id="pat-condition-Angina" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Angina</span>
                            <input type="checkbox" value="Angina">
                        </div>
                        <div class="checkbox-card" id="pat-condition-Asthma" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Asthma</span>
                            <input type="checkbox" value="Asthma">
                        </div>
                        <div class="checkbox-card" id="pat-condition-Bleeding-Problems" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Bleeding Problems</span>
                            <input type="checkbox" value="Bleeding Problems">
                        </div>
                        <div class="checkbox-card" id="pat-condition-Blood-Disease" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Blood Disease</span>
                            <input type="checkbox" value="Blood Disease">
                        </div>
                        <div class="checkbox-card" id="pat-condition-Head-Injury" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Head Injury</span>
                            <input type="checkbox" value="Head Injury">
                        </div>
                        <div class="checkbox-card" id="pat-condition-Arthritis-Rheumatism" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Arthritis / Rheumatism</span>
                            <input type="checkbox" value="Arthritis / Rheumatism">
                        </div>
                    </div>
                    <label for="pat-condition-others" style="margin-top: 8px;">Others (specify)</label>
                    <input maxlength="300" type="text" id="pat-condition-others" placeholder="Other conditions not listed above">

                    <div class="form-row">
                        <div class="flex-1">
                            <label for="pat-blood-type">Blood Type</label>
                            <input maxlength="10" type="text" id="pat-blood-type">
                        </div>
                        <div class="flex-1">
                            <label for="pat-bleeding-time">Bleeding Time</label>
                            <input maxlength="30" type="text" id="pat-bleeding-time">
                        </div>
                    </div>

                    <div class="form-row" style="margin-top: 10px;">
                        <div class="flex-1">
                            <label for="pat-parent-name">Parent/Guardian Name (For Minors)</label>
                            <input type="text" id="pat-parent-name" readonly style="background-color: var(--bg-canvas);">
                        </div>
                        <div class="flex-1">
                            <label for="pat-parent-phone">Parent/Guardian Contact No.</label>
                            <input type="text" id="pat-parent-phone" readonly style="background-color: var(--bg-canvas);">
                        </div>
                    </div>
                    
                    <label for="pat-referred-by">Referred By</label>
                    <input type="text" id="pat-referred-by" readonly style="background-color: var(--bg-canvas);">

                </div>
                </fieldset>
                <div class="medical-edit-actions hidden" id="pat-medical-actions">
                    <button type="button" class="btn-secondary" onclick="cancelMedicalEdit()">Cancel</button>
                    <button type="submit" id="pat-medical-save-btn">Save Health Changes</button>
                </div>
            </form>
        </div>
    </div>
</div>
