<?php
/**
 * DentCare — Dentition reference data
 * ---------------------------------------------------------------------------
 * Single source of truth for tooth numbering and surface notation, transcribed
 * from the clinic's own paper Dental Record Card (scan in docs/).
 *
 * The card is the specification. If the two ever disagree, the card wins —
 * staff have been reading it for years and the system has to match, not the
 * other way round.
 *
 * NUMBERING — FDI two-digit notation. First digit is the quadrant, second is
 * the position counting outward from the midline.
 *
 *   Permanent   quadrants 1-4    32 teeth, positions 1-8
 *   Primary     quadrants 5-8    20 teeth, positions 1-5
 *
 * WHY BOTH ARE ALWAYS RENDERED — the paper card prints the permanent arches
 * and the primary arches on the same side, and it does that on purpose. A
 * child between roughly 6 and 12 is in *mixed dentition*: the permanent first
 * molars and incisors have come through while the primary canines and molars
 * are still in place. Both sets exist in one mouth at the same time, so a
 * chart that shows only one of them cannot record that child's mouth.
 *
 * This is why "patient is a minor" is the wrong switch. A 16-year-old is a
 * minor with a complete permanent dentition; a 7-year-old needs both charts at
 * once. Age decides which arch is *expanded by default*, never which one
 * exists. See dentition_stage_for_age() below.
 */

// ── Tooth numbering, in the same left-to-right order as the paper card ──────

$PERMANENT_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
$PERMANENT_LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
$PRIMARY_UPPER   = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65];
$PRIMARY_LOWER   = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75];

/**
 * Is this tooth at the front of the mouth?
 *
 * Positions 1-3 are the incisors and the canine — the teeth you can see when
 * someone smiles. Everything further back is a premolar or molar.
 *
 * This is what decides whether the outward-facing surface is called labial or
 * buccal, which is exactly the split drawn on the paper card: 13-11 and 21-23
 * are marked "La", 14-18 and 24-28 are marked "Bu".
 */
function is_anterior_tooth(int $tooth): bool
{
    return ($tooth % 10) <= 3;
}

/**
 * Surface codes for one tooth, matching the labels printed on the card.
 *
 * Every tooth on the card is drawn as a circle split into five zones. The
 * outward-facing label changes with the tooth's position; the other four are
 * the same everywhere.
 */
function tooth_surface_codes(int $tooth): array
{
    return [
        'facial'  => is_anterior_tooth($tooth) ? 'La' : 'Bu',
        'mesial'  => 'M',
        'distal'  => 'D',
        'centre'  => 'O',
        'lingual' => 'Li',
    ];
}

/**
 * Which dentition should be shown expanded for a patient of this age?
 *
 * Boundaries follow normal eruption: the first permanent molars and lower
 * central incisors arrive around 6, and the last primary teeth are usually
 * shed by about 12.
 *
 *   'primary'    under 6      only primary teeth present
 *   'mixed'      6 to 12      both present at once — show both
 *   'permanent'  13 and over  primary teeth shed
 *
 * A null age means we do not know, so nothing is assumed: both are shown.
 */
// The two boundaries, named once. The template exports these to the browser
// rather than the numbers being typed a second time in JavaScript, so the
// server and the page can never disagree about what counts as a child.
const DENTITION_LAST_PRIMARY_AGE = 5;   // this age and below: primary only
const DENTITION_LAST_MIXED_AGE   = 12;  // this age and below: both present

function dentition_stage_for_age(?int $age): string
{
    if ($age === null)                       return 'mixed';
    if ($age <= DENTITION_LAST_PRIMARY_AGE)  return 'primary';
    if ($age <= DENTITION_LAST_MIXED_AGE)    return 'mixed';
    return 'permanent';
}

// ── Acronym glossary ────────────────────────────────────────────────────────
//
// These are the abbreviations printed on the paper card. The system shows the
// same letters, and this is the one place their meaning is written down, so a
// label can never drift away from what the card means by it.

$SURFACE_GLOSSARY = [
    ['code' => 'M',  'name' => 'Mesial',   'meaning' => 'The side facing the midline — towards the front of the mouth.'],
    ['code' => 'D',  'name' => 'Distal',   'meaning' => 'The side facing away from the midline — towards the back.'],
    ['code' => 'O',  'name' => 'Occlusal', 'meaning' => 'The biting surface. On the front teeth this edge is called incisal.'],
    ['code' => 'Bu', 'name' => 'Buccal',   'meaning' => 'The cheek side of a back tooth (premolars and molars).'],
    ['code' => 'La', 'name' => 'Labial',   'meaning' => 'The lip side of a front tooth (incisors and canines).'],
    ['code' => 'Li', 'name' => 'Lingual',  'meaning' => 'The tongue side of any tooth.'],
];

// Whole-tooth conditions. The value stored in Firestore is the 'value' key —
// changing a label here is safe, changing a value is a data migration.
$TOOTH_CONDITIONS = [
    ['value' => 'Healthy',  'label' => 'Healthy',            'note' => 'No findings recorded'],
    ['value' => 'Decayed',  'label' => 'Decayed (caries)',   'note' => 'Active decay'],
    ['value' => 'Filled',   'label' => 'Filled (restored)',  'note' => 'Existing restoration'],
    ['value' => 'Missing',  'label' => 'Missing',            'note' => 'Extracted or never erupted'],
    ['value' => 'Crowned',  'label' => 'Crowned (cap)',      'note' => 'Full-coverage crown'],
    ['value' => 'Bridge',   'label' => 'Bridge support',     'note' => 'Abutment for a bridge'],
    // Added 2026-09-30, the codes Dr. Gapit writes on the paper chart. Must
    // match TOOTH_CONDITIONS in js/records.js; tools/check-dentition.js holds
    // the two lists, the tooth editor and the legend to the same order.
    ['value' => 'Extracted', 'label' => 'EXO (extraction)',           'note' => 'Taken out at the clinic'],
    ['value' => 'RCT',       'label' => 'RCT (root canal treatment)', 'note' => 'Root canal treated'],
];
