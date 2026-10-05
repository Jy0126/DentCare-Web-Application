<?php
// Staff make a patient RECORD with this form (2026-10-01, client revision 16):
// no online account, no password box, and only first name, last name and date
// of birth are required. The public form keeps its own required boxes. The
// staff form is novalidate so the browser's own bubbles never stand in for the
// red boxes and the message validateStep1() gives.
$staff_form = !empty($staff_intake);
$public_req = $staff_form ? '' : ' required';
$public_star = $staff_form ? '' : ' <span style="color:red;">*</span>';
?>
        <!-- REGISTER FORM (Patients Only - 3-Step Wizard) -->
        <form id="form-register" class="auth-form" onsubmit="submitRegister(event)"<?= $staff_form ? ' novalidate' : '' ?>>
            
            <!-- Step Progress Indicator -->
            <div class="steps">
                <div id="booking-step-pill-1" class="step is-active">
                    <span class="step__num">1</span>
                    <span>Personal Details</span>
                </div>
                <div id="booking-step-pill-2" class="step">
                    <span class="step__num">2</span>
                    <span>Health Screening</span>
                </div>
                <div id="booking-step-pill-3" class="step">
                    <span class="step__num">3</span>
                    <span>Consent & Signature</span>
                </div>
            </div>

            <?php if ($staff_form): ?>
            <!-- Shown by submitStaffPatientRecord() when a record with the same
                 name and date of birth is already on file. It does not block:
                 two real people can share all three. -->
            <div id="staff-duplicate-notice" class="staff-duplicate" role="alert" tabindex="-1" hidden>
                <p id="staff-duplicate-text"></p>
                <div class="staff-duplicate__actions">
                    <button type="button" class="btn-secondary" onclick="openStaffDuplicate()">Open it</button>
                    <button type="button" onclick="saveStaffRecordAnyway()">Save anyway</button>
                </div>
            </div>
            <?php endif; ?>

            <!-- STEP 1: Personal & Demographic Information -->
            <div id="register-step-1" class="form-step">
                <div class="form-step__title">Step 1: Patient Personal Information</div>
                <div class="form-step__subtitle">Official patient profile details matching Dr. Reina G. Gapit Dental Record Card.</div>

<!--
                    Middle name is optional and sits between the two, the way it
                    does on the clinic's paper record card. Filipino records
                    usually carry the mother's maiden surname here, and a patient
                    who has none simply leaves it blank.
                -->
                <div class="form-row">
                    <div class="flex-1">
                        <label for="reg-first-name">First Name <span style="color:red;">*</span></label>
                        <input maxlength="100" type="text" id="reg-first-name" placeholder="Juan" required>
                    </div>
                    <div class="flex-1">
                        <label for="reg-middle-name">Middle Name</label>
                        <input maxlength="100" type="text" id="reg-middle-name" placeholder="Santos">
                    </div>
                    <div class="flex-1">
                        <label for="reg-last-name">Last Name <span style="color:red;">*</span></label>
                        <input maxlength="100" type="text" id="reg-last-name" placeholder="Dela Cruz" required>
                    </div>
                </div>

                <!-- Optional since 2026-10-01. With an email, the email is the
                     login; without one, the mobile number below is. -->
                <label for="reg-email">Email Address (optional)</label>
                <!-- onblur, not oninput: checking every keystroke means telling
                     the patient her address is wrong while she is still typing
                     it. checkEmailFieldLive() inserts #reg-email-hint after
                     this input the first time it has something to say. -->
                <input maxlength="320" type="email" id="reg-email" placeholder="name@example.com" onblur="checkEmailFieldLive()">
                <?php if ($staff_form): ?>
                <p class="field-hint">A contact detail only. Saving here makes no online account.</p>
                <?php else: ?>
                <p class="field-hint">No email? Leave this blank and sign in with your mobile number instead.</p>
                <?php endif; ?>

                <?php if (!$staff_form): ?>
                <label for="reg-password">Password <span style="color:red;">*</span></label>
                <div class="password-input-container">
                    <input maxlength="200" type="password" id="reg-password" placeholder="At least 8 chars with uppercase, number & symbol" autocomplete="new-password" required oninput="evaluatePasswordStrength(this.value)">
                    <button type="button" class="password-toggle-btn" onclick="togglePasswordVisibility('reg-password', this)" aria-label="Toggle Password Visibility">
                        <svg class="eye-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                    </button>
                </div>

                <!-- Password Strength Meter & Passkey Recommendation Generator -->
                <div class="password-strength-box">
                    <div class="strength-meter-header">
                        <span class="strength-label">Password Strength: <strong id="strength-text" style="color: var(--text-muted);">Not entered</strong></span>
                        <button type="button" class="btn-suggest-passkey" onclick="generateStrongPasskey()" title="Generate a secure strong passkey">
                            <span>Suggest a strong passkey</span>
                        </button>
                    </div>
                    
                    <div class="strength-bar-track">
                        <div id="strength-bar-fill" class="strength-bar-fill"></div>
                    </div>

                    <div class="passkey-criteria-list">
                        <span id="crit-length" class="crit-item">Min 8 characters</span>
                        <span id="crit-upper" class="crit-item">Uppercase (A-Z)</span>
                        <span id="crit-lower" class="crit-item">Lowercase (a-z)</span>
                        <span id="crit-number" class="crit-item">Number (0-9)</span>
                        <span id="crit-symbol" class="crit-item">Special character (!@#$)</span>
                    </div>
                </div>
                <?php endif; ?>

                <div class="form-row">
                    <!--
                        Month / Day / Year instead of one date picker (client
                        request 2026-09-27). On a phone the picker opens on
                        today and has to be scrolled back decades, one year at a
                        time; here the year is simply typed, or picked from the
                        list. The month is a named list so 03/04 can never be read
                        as April 3rd. readRegisterDob() in js/auth.js joins the
                        three into the same YYYY-MM-DD the database has always
                        stored, so nothing that reads dateOfBirth changes.
                        #reg-dob is the group, and is what errors are shown on.
                    -->
                    <div class="flex-1">
                        <label for="reg-dob-month" id="reg-dob-label">Date of Birth <span style="color:red;">*</span></label>
                        <div class="dob-fields" id="reg-dob" role="group" aria-labelledby="reg-dob-label">
                            <select id="reg-dob-month" aria-label="Birth month" autocomplete="bday-month">
                                <option value="" selected>Month</option>
                                <option value="01">January</option>
                                <option value="02">February</option>
                                <option value="03">March</option>
                                <option value="04">April</option>
                                <option value="05">May</option>
                                <option value="06">June</option>
                                <option value="07">July</option>
                                <option value="08">August</option>
                                <option value="09">September</option>
                                <option value="10">October</option>
                                <option value="11">November</option>
                                <option value="12">December</option>
                            </select>
                            <!-- maxlength is a loose bound (launch audit M1), not the
                                 real limit: maxlength="4" would cut a pasted " 1995" to
                                 " 199" before the non-digits are stripped. initRegisterDob()
                                 strips first, then trims to data-max-digits. -->
                            <input type="text" id="reg-dob-day" inputmode="numeric" maxlength="10" data-max-digits="2"
                                   placeholder="Day" aria-label="Birth day" autocomplete="bday-day"
                                   list="reg-dob-day-list">
                            <input type="text" id="reg-dob-year" inputmode="numeric" maxlength="10" data-max-digits="4"
                                   placeholder="Year" aria-label="Birth year (4 digits)" autocomplete="bday-year"
                                   list="reg-dob-year-list">
                        </div>
                        <datalist id="reg-dob-day-list">
                            <?php for ($d = 1; $d <= 31; $d++): ?><option value="<?php echo $d; ?>"></option><?php endfor; ?>
                        </datalist>
                        <!-- Filled by fillDobYearList() in js/auth.js, in the browser:
                             the live site is a static build, so a year written here
                             by PHP would stop at the year it was built. -->
                        <datalist id="reg-dob-year-list"></datalist>
                    </div>
                    <div class="flex-1">
                        <!-- Optional on both forms since 2026-10-02 (R19). -->
                        <label for="reg-gender">Gender</label>
                        <select id="reg-gender">
                            <option value="" disabled selected>Select Gender</option>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                </div>

                <div class="form-row">
                    <div class="flex-1">
                        <label for="reg-civil-status">Civil Status</label>
                        <select id="reg-civil-status">
                            <option value="" disabled selected>Select Civil Status</option>
                            <option value="Single">Single</option>
                            <option value="Married">Married</option>
                            <option value="Widowed">Widowed</option>
                            <option value="Separated">Separated</option>
                        </select>
                    </div>
                    <div class="flex-1">
                        <label for="reg-nationality">Nationality</label>
                        <input maxlength="100" type="text" id="reg-nationality" placeholder="Filipino">
                    </div>
                </div>

                <div class="form-row">
                    <div class="flex-1">
                        <label for="reg-occupation">Occupation</label>
                        <input maxlength="100" type="text" id="reg-occupation" placeholder="E.g., Student, Engineer">
                    </div>
                    <div class="flex-1">
                        <label for="reg-company">Company / School</label>
                        <input maxlength="150" type="text" id="reg-company" placeholder="Company or School Name">
                    </div>
                </div>

                <label for="reg-company-address">Company / Office Address</label>
                <input maxlength="300" type="text" id="reg-company-address" placeholder="Unit, Street, City">

                <div class="form-row">
                    <div class="flex-1">
                        <label for="reg-office-no">Office Phone No.</label>
                        <input maxlength="30" type="tel" id="reg-office-no" placeholder="Telephone No.">
                    </div>
                    <div class="flex-1">
                        <label for="reg-phone">Mobile / Contact No.<?= $public_star ?></label>
                        <input maxlength="30" type="tel" id="reg-phone" placeholder="0917-XXX-XXXX" oninput="checkMobileOnFileLive()"<?= $public_req ?>>
                        <?php /* "Already on a DentCare record": a warning, never a block (2026-10-05). */ ?>
                        <p id="reg-phone-on-file" class="field-hint field-hint--warn" role="status" hidden></p>
                    </div>
                </div>

                <div style="display: flex; align-items: center; gap: 10px; margin: 16px 0; background-color: var(--bg-canvas); padding: 12px 16px; border-radius: var(--radius-s);">
                    <input type="checkbox" id="reg-is-minor" style="width: auto; margin: 0; cursor: pointer;" onchange="toggleMinorFields(this.checked)">
                    <label for="reg-is-minor" style="margin: 0; cursor: pointer; user-select: none; font-weight: 700;">Patient is a minor (under 18 years old)</label>
                </div>

                <div id="minor-fields-wrap" class="minor-info-section hidden">
                    <div class="form-row">
                        <div class="flex-1">
                            <label for="reg-parent-name">Parent / Guardian Full Name</label>
                            <input maxlength="150" type="text" id="reg-parent-name" placeholder="Parent or Guardian Name">
                        </div>
                        <div class="flex-1">
                            <label for="reg-parent-phone">Parent / Guardian Contact No.</label>
                            <input maxlength="30" type="tel" id="reg-parent-phone" placeholder="0917-XXX-XXXX">
                        </div>
                    </div>
                </div>

                <label for="reg-address">Home Address</label>
                <input maxlength="500" type="text" id="reg-address" placeholder="House/Unit No., Street, Barangay, City">

                <div class="form-row">
                    <div class="flex-1">
                        <label for="reg-emergency">Emergency Contact Person & Phone</label>
                        <input maxlength="200" type="text" id="reg-emergency" placeholder="Name & Contact Phone Number">
                    </div>
                    <div class="flex-1">
                        <label for="reg-former-dentist">Former Dentist (Optional)</label>
                        <input maxlength="150" type="text" id="reg-former-dentist" placeholder="Previous dentist name">
                    </div>
                </div>

                <label for="reg-referred-by">Referred By (Optional)</label>
                <input maxlength="150" type="text" id="reg-referred-by" placeholder="Friend, Doctor, Social Media, etc.">

                <?php if ($staff_form): ?>
                <!-- Save record on every step, so a paper card's details can be
                     saved from here with the rest left blank. -->
                <div class="form-step-actions" style="display: flex; gap: 16px; margin-top: 24px;">
                    <button type="submit" class="btn-secondary" data-registration-intent="register-only" style="flex: 1; padding: 14px;">Save record</button>
                    <button type="button" onclick="goToRegisterStep2()" style="flex: 2; padding: 14px; font-size: 15px;">Continue to Step 2: Health Screening</button>
                </div>
                <?php else: ?>
                <button type="button" onclick="goToRegisterStep2()" style="margin-top: 24px; width: 100%; padding: 14px; font-size: 15px;">
                    Continue to Step 2: Health Screening
                </button>
                <?php endif; ?>
            </div>

            <!-- STEP 2: Medical History Questionnaire & Health Screening -->
            <div id="register-step-2" class="form-step hidden">
                <div class="form-step__title">Step 2: Dental Health Record & Medical History</div>
                <div class="form-step__subtitle">Please answer these health questions accurately for clinical treatment safety.</div>
                
                <div class="medical-history-wizard" style="margin-top: 0;">
                    
                    <div class="wizard-section-title">General Physical Health</div>

                    <div class="switch-row">
                        <div class="switch-label-col">
                            <div class="switch-label-title">Are you in good general health?</div>
                        </div>
                        <div class="switch-options-col">
                            <!--
                                YES is the default here, and it is the only
                                question on this form where it is.

                                Every other question defaults to NO, and NO
                                means "nothing to report" for all of them. This
                                one is phrased the other way round, so leaving
                                NO selected recorded "not in good general
                                health" for every patient who simply did not
                                touch it — which was almost all of them.
                            -->
                            <div class="radio-pill" id="med-good-health">
                                <div class="radio-pill-item active" data-val="1" onclick="setRadioPill('med-good-health', 1)">YES</div>
                                <div class="radio-pill-item" data-val="0" onclick="setRadioPill('med-good-health', 0)">NO</div>
                            </div>
                        </div>
                    </div>

                    <div class="switch-row">
                        <div class="switch-label-col">
                            <div class="switch-label-title">Are you under medical treatment now?</div>
                        </div>
                        <div class="switch-options-col">
                            <div class="radio-pill" id="med-treatment">
                                <div class="radio-pill-item" data-val="1" onclick="setRadioPill('med-treatment', 1); showDetails('med-treatment-details-wrap')">YES</div>
                                <div class="radio-pill-item active" data-val="0" onclick="setRadioPill('med-treatment', 0); hideDetails('med-treatment-details-wrap')">NO</div>
                            </div>
                        </div>
                    </div>
                    <div id="med-treatment-details-wrap" class="hidden">
                        <label for="med-treatment-details">Specify Condition Being Treated</label>
                        <input maxlength="500" type="text" id="med-treatment-details" placeholder="Condition being treated">
                    </div>

                    <div class="switch-row">
                        <div class="switch-label-col">
                            <div class="switch-label-title">Have you ever had serious illness or surgical operation?</div>
                        </div>
                        <div class="switch-options-col">
                            <div class="radio-pill" id="med-illness">
                                <div class="radio-pill-item" data-val="1" onclick="setRadioPill('med-illness', 1); showDetails('med-illness-details-wrap')">YES</div>
                                <div class="radio-pill-item active" data-val="0" onclick="setRadioPill('med-illness', 0); hideDetails('med-illness-details-wrap')">NO</div>
                            </div>
                        </div>
                    </div>
                    <div id="med-illness-details-wrap" class="hidden">
                        <label for="med-illness-details">Specify Operation / Illness Details</label>
                        <input maxlength="500" type="text" id="med-illness-details" placeholder="E.g., Heart surgery, Appendectomy">
                    </div>

                    <div class="switch-row">
                        <div class="switch-label-col">
                            <div class="switch-label-title">Have you ever been hospitalized?</div>
                        </div>
                        <div class="switch-options-col">
                            <div class="radio-pill" id="med-hospitalized">
                                <div class="radio-pill-item" data-val="1" onclick="setRadioPill('med-hospitalized', 1); showDetails('med-hospitalized-details-wrap')">YES</div>
                                <div class="radio-pill-item active" data-val="0" onclick="setRadioPill('med-hospitalized', 0); hideDetails('med-hospitalized-details-wrap')">NO</div>
                            </div>
                        </div>
                    </div>
                    <div id="med-hospitalized-details-wrap" class="hidden">
                        <label for="med-hospitalized-details">Specify Hospitalization Reason & Date</label>
                        <input maxlength="500" type="text" id="med-hospitalized-details" placeholder="Describe hospitalization">
                    </div>

                    <div class="switch-row">
                        <div class="switch-label-col">
                            <div class="switch-label-title">Taking prescribed or non-prescribed medicine?</div>
                        </div>
                        <div class="switch-options-col">
                            <div class="radio-pill" id="med-prescribed">
                                <div class="radio-pill-item" data-val="1" onclick="setRadioPill('med-prescribed', 1); showDetails('med-prescribed-details-wrap')">YES</div>
                                <div class="radio-pill-item active" data-val="0" onclick="setRadioPill('med-prescribed', 0); hideDetails('med-prescribed-details-wrap')">NO</div>
                            </div>
                        </div>
                    </div>
                    <div id="med-prescribed-details-wrap" class="hidden">
                        <label for="med-prescribed-details">List Current Medications</label>
                        <input maxlength="500" type="text" id="med-prescribed-details" placeholder="E.g. Blood pressure drugs, insulin">
                    </div>

                    <div class="wizard-section-title">Substance Habits & Allergies</div>

                    <div class="switch-row">
                        <div class="switch-label-col">
                            <div class="switch-label-title">Do you use tobacco products?</div>
                        </div>
                        <div class="switch-options-col">
                            <div class="radio-pill" id="med-tobacco">
                                <div class="radio-pill-item" data-val="1" onclick="setRadioPill('med-tobacco', 1)">YES</div>
                                <div class="radio-pill-item active" data-val="0" onclick="setRadioPill('med-tobacco', 0)">NO</div>
                            </div>
                        </div>
                    </div>

                    <div class="switch-row">
                        <div class="switch-label-col">
                            <div class="switch-label-title">Do you use alcohol, cocaine or dangerous drugs?</div>
                        </div>
                        <div class="switch-options-col">
                            <div class="radio-pill" id="med-alcohol">
                                <div class="radio-pill-item" data-val="1" onclick="setRadioPill('med-alcohol', 1)">YES</div>
                                <div class="radio-pill-item active" data-val="0" onclick="setRadioPill('med-alcohol', 0)">NO</div>
                            </div>
                        </div>
                    </div>

                    <label style="margin-top: 20px; margin-bottom: 8px; font-weight: 700;">Are you allergic to any of the following:</label>
                    <div class="checklist-grid" id="reg-allergies-grid">
                        <div class="checkbox-card" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Local Anesthetics (ex. Lidocaine)</span>
                            <input type="checkbox" value="Local Anesthetics (ex. Lidocaine)">
                        </div>
                        <div class="checkbox-card" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Penicillin, Antibiotics</span>
                            <input type="checkbox" value="Penicillin, Antibiotics">
                        </div>
                        <div class="checkbox-card" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Sulfa drugs</span>
                            <input type="checkbox" value="Sulfa drugs">
                        </div>
                        <div class="checkbox-card" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Aspirin</span>
                            <input type="checkbox" value="Aspirin">
                        </div>
                        <div class="checkbox-card" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Latex</span>
                            <input type="checkbox" value="Latex">
                        </div>
                    </div>
                    <label for="reg-allergy-others" style="margin-top: 8px;">Others (specify)</label>
                    <input maxlength="300" type="text" id="reg-allergy-others" placeholder="Other allergies not listed above">

                    <label style="margin-top: 20px; margin-bottom: 8px; font-weight: 700;">Do you have or have you had any of the following? Check which apply:</label>
                    <div class="checklist-grid" id="reg-conditions-grid">
                        <div class="checkbox-card" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>High Blood Pressure</span>
                            <input type="checkbox" value="High Blood Pressure">
                        </div>
                        <div class="checkbox-card" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Low Blood Pressure</span>
                            <input type="checkbox" value="Low Blood Pressure">
                        </div>
                        <div class="checkbox-card" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Heart Disease / Surgery</span>
                            <input type="checkbox" value="Heart Disease / Surgery">
                        </div>
                        <div class="checkbox-card" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Diabetes</span>
                            <input type="checkbox" value="Diabetes">
                        </div>
                        <div class="checkbox-card" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Asthma / Respiratory</span>
                            <input type="checkbox" value="Asthma / Respiratory">
                        </div>
                        <div class="checkbox-card" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Hepatitis / Liver Disease</span>
                            <input type="checkbox" value="Hepatitis / Liver Disease">
                        </div>
                        <div class="checkbox-card" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Bleeding Disorders</span>
                            <input type="checkbox" value="Bleeding Disorders">
                        </div>
                        <div class="checkbox-card" onclick="toggleCheckboxCard(this)">
                            <div class="checkbox-check-icon"></div>
                            <span>Kidney Disease</span>
                            <input type="checkbox" value="Kidney Disease">
                        </div>
                    </div>
                    <label for="reg-condition-others" style="margin-top: 8px;">Others (specify)</label>
                    <input maxlength="300" type="text" id="reg-condition-others" placeholder="Other medical conditions not listed above">

                    <div id="female-questions" class="hidden">
                        <div class="wizard-section-title">For Women Only</div>

                        <div class="switch-row">
                            <div class="switch-label-col">
                                <div class="switch-label-title">Are you pregnant?</div>
                            </div>
                            <div class="switch-options-col">
                                <div class="radio-pill" id="med-pregnant">
                                    <div class="radio-pill-item" data-val="1" onclick="setRadioPill('med-pregnant', 1)">YES</div>
                                    <div class="radio-pill-item active" data-val="0" onclick="setRadioPill('med-pregnant', 0)">NO</div>
                                </div>
                            </div>
                        </div>

                        <div class="switch-row">
                            <div class="switch-label-col">
                                <div class="switch-label-title">Are you nursing / breastfeeding?</div>
                            </div>
                            <div class="switch-options-col">
                                <div class="radio-pill" id="med-nursing">
                                    <div class="radio-pill-item" data-val="1" onclick="setRadioPill('med-nursing', 1)">YES</div>
                                    <div class="radio-pill-item active" data-val="0" onclick="setRadioPill('med-nursing', 0)">NO</div>
                                </div>
                            </div>
                        </div>

                        <div class="switch-row">
                            <div class="switch-label-col">
                                <div class="switch-label-title">Are you taking birth control pills?</div>
                            </div>
                            <div class="switch-options-col">
                                <div class="radio-pill" id="med-birth-control">
                                    <div class="radio-pill-item" data-val="1" onclick="setRadioPill('med-birth-control', 1)">YES</div>
                                    <div class="radio-pill-item active" data-val="0" onclick="setRadioPill('med-birth-control', 0)">NO</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- form-step-actions: on a phone the two buttons stack, primary
                         first (css/booking.css). The inline row layout is the desktop one. -->
                    <div class="form-step-actions" style="display: flex; gap: 16px; margin-top: 32px;">
                        <button type="button" class="btn-secondary" onclick="goBackToRegisterStep1()" style="flex: 1; padding: 14px;">Back to Step 1</button>
                        <?php if ($staff_form): ?>
                        <button type="submit" class="btn-secondary" data-registration-intent="register-only" style="flex: 1; padding: 14px;">Save record</button>
                        <?php endif; ?>
                        <button type="button" onclick="goToRegisterStep3()" style="flex: 2; padding: 14px;">Continue to Step 3: Consent & Signature</button>
                    </div>

                </div>
            </div>

            <!-- STEP 3: Clinical Terms, Declaration & Signature (Exact PDF Dental Record Card Statement) -->
            <div id="register-step-3" class="form-step hidden">
                <div class="form-step__title">Step 3: Clinical Consent, Declaration & Signature</div>
                <div class="form-step__subtitle">Clinical details and official patient consent statement from Dr. Reina G. Gapit Dental Card.</div>
                <?php if ($staff_form): ?>
                <p class="field-hint staff-sign-later">Patient not here to sign? Leave the consent blank and press Save record.
                    The record shows &ldquo;Consent not signed yet&rdquo; until you collect the signature on Patient History.</p>
                <?php endif; ?>

                <div class="form-row">
                    <div class="flex-1">
                        <label for="reg-blood-type">Blood Type (Optional)</label>
                        <input maxlength="10" type="text" id="reg-blood-type" placeholder="O+ / A+ / B+ / AB-">
                    </div>
                    <div class="flex-1">
                        <label for="reg-bleeding-time">Bleeding Time (Optional)</label>
                        <input maxlength="30" type="text" id="reg-bleeding-time" placeholder="E.g., 2-3 mins">
                    </div>
                </div>

                <!-- Exact Consent Box from Copy of DENTCARE.pdf -->
                <div class="consent">
                    <div class="consent__header">
                        <?= icon('file', 'icon--lg') ?>
                        <h4>Declaration & Clinical Consent Statement</h4>
                    </div>
                    
                    <div class="consent__text">
                        "I do hereby consent to the performance of all dental procedures, operations, and/or treatment that may be considered necessary to restore my oral and dental health. This consent is given voluntary and whatever result of any intervention or treatment may be, I absolve my dentist from all liability. Be it known further that I am willing to pay for all services rendered me and my family."
                    </div>

                    <div class="consent__agree">
                        <input type="checkbox" id="reg-consent-agree"<?= $public_req ?>>
                        <label for="reg-consent-agree">
                            I have read, understood, and voluntarily agree to the Clinical Consent statement above.
                        </label>
                    </div>
                </div>

                <?php /* The Privacy Policy, beside the clinic's consent and not part
                         of it (2026-10-03, R22). Required online; on the staff form
                         it is ticked by the patient with the consent, now or later.
                         A PHP comment, so the static build is unchanged without it. */ ?>
                <?= privacy_agree_box('reg-privacy-agree') ?>

                <!-- Digital Interactive Signature Block -->
                <div class="signature">
                    <div class="signature__header">
                        <div class="signature__title">Patient / Guardian Signature</div>
                        <div class="signature__subtitle">Please draw your signature below or type your full legal name:</div>
                    </div>

                    <div class="signature__wrap">
                        <canvas id="sig-canvas" class="signature__pad"></canvas>
                        <div class="signature__tools">
                            <button type="button" class="btn btn--clear" onclick="clearSignatureCanvas()">Clear signature</button>
                            <span class="signature__hint">Draw using mouse or touch</span>
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="flex-2">
                            <label for="reg-signature">Signature Over Printed Name<?= $public_star ?></label>
                            <input maxlength="200" type="text" id="reg-signature" placeholder="Type full legal name (e.g., Juan Dela Cruz)"<?= $public_req ?>>
                        </div>
                        <div class="flex-1">
                            <label for="reg-consent-date">Date<?= $public_star ?></label>
                            <input type="date" id="reg-consent-date"<?= $public_req ?>>
                        </div>
                    </div>
                </div>

                <div class="form-step-actions <?= $staff_form ? 'staff-intake-footer' : 'register-submit-row' ?>" style="display: flex; gap: 16px; margin-top: 32px;">
                    <button type="button" class="btn-secondary" onclick="goBackToRegisterStep2()" style="flex: 1; padding: 14px;">Back to Step 2</button>
                    <?php if ($staff_form): ?>
                        <div class="staff-intake-actions">
                            <button type="submit" data-registration-intent="register-only">Save record</button>
                            <button type="submit" data-registration-intent="register-queue">Register &amp; Add to Today's Queue</button>
                        </div>
                    <?php else: ?>
                        <button type="submit" style="flex: 2; padding: 14px; font-size: 16px; font-weight: 800;">Submit &amp; Complete Registration</button>
                    <?php endif; ?>
                </div>
            </div>

        </form>
