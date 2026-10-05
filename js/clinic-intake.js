// Shared patient dropdown for walk-in intake and clinic booking.
const inlinePatientStates = {};
let intakeInFlight = false;
let intakeLoadVersion = 0;
function inlineEl(prefix, name) { return document.getElementById(prefix + '-' + name); }
function inlinePatientName(p) { return [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' '); }
function inlinePatientMeta(p) {
    return [p.dateOfBirth ? 'Born ' + p.dateOfBirth : '', p.phoneNumber || '', 'ID ' + p.id].filter(Boolean).join(' · ');
}
function initInlinePatient(prefix, patients, onPick) {
    inlinePatientStates[prefix] = { patients: patients || {}, hits: [], index: 0, selected: null, open: false, onPick };
    clearInlinePatient(prefix);
}
function clearInlinePatient(prefix) {
    const s = inlinePatientStates[prefix];
    if (!s) return;
    s.selected = null; s.hits = []; s.index = 0; s.open = false; s.more = 0; s.archived = 0;
    const box = inlineEl(prefix, 'search');
    if (box) { box.value = ''; box.readOnly = false; }
    if (s.onPick) s.onPick(null);
    paintInlinePatient(prefix);
}
function inputInlinePatient(prefix) {
    const s = inlinePatientStates[prefix];
    if (!s) return;
    s.selected = null; s.index = 0; s.open = true;
    const found = matchReturningPatients(s.patients, inlineEl(prefix, 'search').value, 8);
    s.hits = found.hits; s.archived = found.archived; s.more = found.more;
    if (s.onPick) s.onPick(null);
    paintInlinePatient(prefix);
}
function paintInlinePatient(prefix) {
    const s = inlinePatientStates[prefix], box = inlineEl(prefix, 'search');
    if (!s || !box) return;
    const expanded = s.open && !s.selected && s.hits.length > 0;
    box.setAttribute('aria-expanded', String(expanded));
    box.setAttribute('aria-activedescendant', expanded ? prefix + '-option-' + s.index : '');
    const list = inlineEl(prefix, 'matches');
    list.hidden = !expanded;
    list.innerHTML = expanded ? s.hits.map((p, index) =>
        '<button type="button" role="option" tabindex="-1" class="patient-suggestion" id="' + prefix + '-option-' + index +
        '" aria-selected="' + (index === s.index) + '" onpointerdown="event.preventDefault()" onclick="chooseInlinePatient(\'' + prefix + '\', ' + index + ')">' +
        '<strong>' + escapeHtml(inlinePatientName(p)) + '</strong><span>' + escapeHtml(inlinePatientMeta(p)) + '</span></button>'
    ).join('') : '';
    inlineEl(prefix, 'change').hidden = !s.selected;
    inlineEl(prefix, 'picker').classList.toggle('is-selected', !!s.selected);
    inlineEl(prefix, 'suggestion').textContent = s.selected
        ? 'Selected: ' + inlinePatientName(s.selected) + ' · ' + inlinePatientMeta(s.selected)
        : searchKey(box.value).length < 2 ? 'Type at least two letters.'
        : s.hits.length ? (s.more ? 'Showing 8 matches. Keep typing to narrow the names.' : s.hits.length + ' matching patient' + (s.hits.length === 1 ? '' : 's') + '. Tap a name to select.')
        : s.archived ? 'Matching records are inactive or deceased. Choose an active patient.'
        : 'No matching patient. Check the spelling or use Register Patient.';
}
function focusInlinePatient(prefix) {
    const s = inlinePatientStates[prefix];
    if (s && !s.selected) { s.open = true; paintInlinePatient(prefix); }
}
function blurInlinePatient(event, prefix) {
    const s = inlinePatientStates[prefix], field = inlineEl(prefix, 'picker');
    if (s && (!event.relatedTarget || !field.contains(event.relatedTarget))) { s.open = false; paintInlinePatient(prefix); }
}
function chooseInlinePatient(prefix, index) {
    const s = inlinePatientStates[prefix];
    if (!s || s.selected) return;
    const candidate = s.hits[index === undefined ? s.index : index];
    if (!candidate) return;
    const live = s.patients[candidate.id];
    if (!live || live.mergedInto || patientIsArchived(live)) return inputInlinePatient(prefix);
    s.selected = Object.assign({}, live, { id: candidate.id }); s.open = false;
    const box = inlineEl(prefix, 'search');
    box.value = inlinePatientName(s.selected); box.readOnly = true;
    paintInlinePatient(prefix);
    if (s.onPick) s.onPick(s.selected);
}
function keyInlinePatient(event, prefix) {
    if (event.isComposing) return;
    const s = inlinePatientStates[prefix];
    if (!s || s.selected) return;
    if (event.key === 'Enter' && s.open && s.hits.length) { event.preventDefault(); chooseInlinePatient(prefix); }
    else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && s.hits.length) {
        event.preventDefault();
        s.index = s.open ? (s.index + (event.key === 'ArrowDown' ? 1 : -1) + s.hits.length) % s.hits.length : 0;
        s.open = true; paintInlinePatient(prefix);
        const option = document.getElementById(prefix + '-option-' + s.index);
        if (option && typeof option.scrollIntoView === 'function') option.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Escape') { s.open = false; paintInlinePatient(prefix); }
}
function paintIntakeActions(patient) {
    ['walkin', 'book'].forEach(name => { const el = inlineEl('intake', name); if (el) el.disabled = !patient || intakeInFlight; });
    const status = inlineEl('intake', 'status');
    if (status) status.textContent = patient ? 'Choose walk-in for today, or book an available date and time.' : 'Choose a patient before adding a walk-in or booking.';
}
function loadClinicIntake() {
    if (!canBookForPatient()) return;
    initInlinePatient('intake', {}, paintIntakeActions);
    const version = ++intakeLoadVersion;
    inlineEl('intake', 'suggestion').textContent = 'Loading patients…';
    return getReference('patients').then(byId => {
        if (version !== intakeLoadVersion || document.getElementById('tab-staff-intake').classList.contains('hidden')) return;
        inlinePatientStates.intake.patients = byId || {};
        inputInlinePatient('intake');
        return watchReference('patients', next => {
            const s = inlinePatientStates.intake;
            s.patients = next || {};
            if (s.selected) {
                const p = s.patients[s.selected.id];
                if (!p || p.mergedInto || patientIsArchived(p)) clearInlinePatient('intake');
                else { s.selected = Object.assign({}, p, { id: s.selected.id }); paintInlinePatient('intake'); }
            } else inputInlinePatient('intake');
        }).then(latest => {
            if (latest && version === intakeLoadVersion && !inlinePatientStates.intake.selected) {
                inlinePatientStates.intake.patients = latest;
                inputInlinePatient('intake');
            }
        });
    }).catch(() => { inlineEl('intake', 'suggestion').textContent = 'Could not load patients. Reopen Walk-in & Booking to retry.'; });
}
function bookIntakePatient() {
    const s = inlinePatientStates.intake;
    if (s && s.selected && !intakeInFlight) openClinicBooking(s.selected.id);
}
async function addIntakeWalkin() {
    const s = inlinePatientStates.intake;
    if (!canBookForPatient() || !s || !s.selected || intakeInFlight) return;
    const p = s.selected;
    intakeInFlight = true;
    paintIntakeActions(p);
    try {
        // Read today's bookings as well as the existing transactional walk-in guard.
        const snap = await db.collection('appointments').where('patientId', '==', p.id).get();
        let existing = false;
        snap.forEach(doc => {
            const a = doc.data();
            if (a.appointmentDate === localDateKey() && QUEUE_LISTED_STATUSES.includes(a.status)) existing = true;
        });
        if (existing) {
            showToast(inlinePatientName(p) + ' is already in today\'s queue. Open Today\'s Queue.', 'info');
            return;
        }
        await enqueuePatient({ patientId: p.id, patientName: inlinePatientName(p), isWalkIn: true });
        showToast(inlinePatientName(p) + ' added to today\'s queue.', 'success');
        clearInlinePatient('intake');
    } catch (err) {
        showToast(err && err.code === 'already-queued' ? err.message : 'Could not add the walk-in. Please try again.', 'error');
    } finally {
        intakeInFlight = false;
        paintIntakeActions(s.selected);
    }
}

// Patient context remains explicit when moving from the queue into clinical tools.
let clinicPatientVisit = null;
let historyVisitOpening = false;
function openPatientFromQueue(id) {
    const a = currentQueue.find(row => row.id === id);
    if (!a || currentRole !== 'dentist') return;
    clinicPatientVisit = Object.assign({}, a);
    switchDentistTab('tab-dentist-history', document.getElementById('nav-dentist-history'));
    selectPatientForHistory({ patient_id: a.patientId });
}
function openHistoryDentalChart() {
    if (currentRole !== 'dentist' || !historyRecord) return;
    const patient = Object.assign({}, historyRecord.patient, { patient_id: historyRecord.patientId });
    switchDentistTab('tab-dentist-chart', document.getElementById('nav-dentist-chart'));
    selectPatientForChart(patient);
}
async function recordHistoryVisit() {
    if (historyVisitOpening || currentRole !== 'dentist' || !historyRecord || !clinicPatientVisit || clinicPatientVisit.patientId !== historyRecord.patientId) return;
    const row = clinicPatientVisit;
    historyVisitOpening = true;
    const button = document.getElementById('dentist-history-record-visit');
    if (button) button.disabled = true;
    try {
        const now = new Date().toISOString();
        await changeAppointmentStatus(row.id, { status: 'In Consultation', consultationStartedAt: row.consultationStartedAt || now, queuedAt: row.queuedAt || now }, QUEUE_LISTED_STATUSES);
        lastLoadedAppointments[row.id] = row;
        openCompletionModal(row.id, row.patientId, row.patientName, row.treatmentId || '', row.treatmentName || '');
    } catch (err) { showToast(err.code === RECORD_CHANGED ? err.message : 'Could not open this visit. Reopen Today\'s Queue and try again.', 'warning'); }
    finally { historyVisitOpening = false; if (button) button.disabled = false; }
}

function openChartPatientHistory() {
    if (currentRole !== 'dentist' || !selectedPatientId) return;
    const id = selectedPatientId;
    switchDentistTab('tab-dentist-history', document.getElementById('nav-dentist-history'));
    selectPatientForHistory({ patient_id: id });
}
