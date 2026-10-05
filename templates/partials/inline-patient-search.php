<?php /* Shared patient combobox for intake and clinic booking. */ ?>
<label for="<?= e($picker_id) ?>-search">Patient name</label>
<div id="<?= e($picker_id) ?>-picker" class="inline-patient-field"
     onfocusout="blurInlinePatient(event, '<?= e($picker_id) ?>')">
    <input id="<?= e($picker_id) ?>-search" type="text" maxlength="150" autocomplete="off"
           autocapitalize="words" spellcheck="false" placeholder="Type first or last name"
           role="combobox" aria-autocomplete="list" aria-expanded="false"
           aria-controls="<?= e($picker_id) ?>-matches" aria-describedby="<?= e($picker_id) ?>-suggestion"
           oninput="inputInlinePatient('<?= e($picker_id) ?>')"
           onfocus="focusInlinePatient('<?= e($picker_id) ?>')"
           onkeydown="keyInlinePatient(event, '<?= e($picker_id) ?>')">
    <div id="<?= e($picker_id) ?>-matches" class="patient-suggestions" role="listbox" aria-label="Matching patients" hidden></div>
    <div class="inline-patient-controls">
        <span id="<?= e($picker_id) ?>-suggestion" class="inline-patient-description" role="status">Type at least two letters.</span>
        <button type="button" id="<?= e($picker_id) ?>-change" class="btn-secondary" onclick="clearInlinePatient('<?= e($picker_id) ?>'); document.getElementById('<?= e($picker_id) ?>-search').focus()" hidden>Change</button>
    </div>
</div>
