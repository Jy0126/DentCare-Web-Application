<?php
/**
 * DentCare — Materials and medicines used chairside
 * ---------------------------------------------------------------------------
 * What the dentist ticks off as having been used or given during a procedure.
 *
 * THESE CARRY NO PRICE, ON PURPOSE.
 *
 * The clinic's price for a procedure already covers the materials it takes —
 * the price of a filling includes the composite. Pricing them again here would
 * bill the patient twice for the same thing.
 *
 * They are recorded because the clinical record should say what was used
 * (which anaesthetic, which cement), not because anyone is charged for them.
 *
 * Kept separate from the prescription field, which is a different thing again:
 * a prescription is written for the patient to buy at a pharmacy. The clinic
 * never handles it and must never bill for it.
 *
 * To change the list, edit this file. There is no admin screen because a list
 * that changes a few times a year does not need one.
 */

$MATERIALS_USED = [
    'Anaesthetic' => [
        'Lidocaine 2% with epinephrine',
        'Mepivacaine 3% (plain)',
        'Articaine 4%',
        'Topical benzocaine gel',
    ],
    'Restorative' => [
        'Composite resin',
        'Glass ionomer cement',
        'Amalgam',
        'Temporary filling material',
        'Etchant / bonding agent',
    ],
    'Endodontic' => [
        'Gutta-percha points',
        'Root canal sealer',
        'Calcium hydroxide paste',
        'Sodium hypochlorite irrigant',
    ],
    'Surgical & haemostatic' => [
        'Sterile gauze',
        'Absorbable sutures',
        'Haemostatic sponge',
        'Antiseptic (povidone-iodine)',
    ],
    'Preventive' => [
        'Prophylaxis paste',
        'Fluoride varnish',
        'Pit and fissure sealant',
    ],
];
