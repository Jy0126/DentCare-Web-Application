<?php
/**
 * DentCare — Clinic Content Data
 * ---------------------------------------------------------------------------
 * All editable content for the public landing page lives here, separated from
 * the markup that renders it (templates/landing.php).
 *
 * WHY: to change a service, an HMO, or the opening hours you edit one array
 * entry here — you never touch the HTML. This keeps the template short and
 * stops the same card markup from being copy-pasted a dozen times.
 *
 * Items marked TODO(CLIENT) still need to be confirmed by the clinic before
 * the site is shown to real patients.
 */

// ── Clinic identity & contact ───────────────────────────────────────────────
$clinic = [
    'name'         => 'Dr. Reina G. Gapit Dental Clinic',
    'brand'        => 'DentCare',
    // Both mobiles are printed on Dr. Gapit's business card, photographed
    // 2026-08-25 into images/. There is no landline on the card, and the
    // (054) number this replaced was a placeholder, never a real line.
    'phone'        => '0923-618-3285',
    'phone_alt'    => '0923-255-0731',
    // TODO(CLIENT): confirm the real clinic email address, then put it here.
    //
    // Blank on purpose (2026-09-13 launch audit). The page used to show
    // appointments@dentcareclinic.com, a placeholder nobody confirmed exists.
    // A patient writing to a dead mailbox about pain after an extraction gets
    // silence, which is worse than being given only the phone numbers. The
    // footer hides the email line while this is empty.
    'email'        => '',
    'address_line' => 'Stall 104B, Ground Floor, Ramaida Centrum',
    'address_city' => 'Elias Angeles Street, Naga City, Camarines Sur',
    // TODO(CLIENT): confirm the nearest landmark patients should look for.
    'landmark'     => 'Located inside Ramaida Centrum along Elias Angeles Street',
    // Clinic listing supplied by the owner, 2026-09-29. The embedded pin uses
    // the coordinates of that exact listing, not a search for the building.
    // Public wayfinding only: this does not change the walk-in geofence.
    'maps_link'    => 'https://maps.app.goo.gl/cVDPjW3ooGoD6enz9',
    'maps_query'   => '13.6262046,123.186446',
];

// Mobile app launch details. Add the verified store/APK URL and a QR image
// that encodes that same URL when the clinic is ready to publish the app.
// Until then, the landing page shows a clearly labelled preview state.
$mobile_app = [
    'platform'     => 'Android',
    // Supplied by the owner 2026-10-04 with images/app-download-qr.png, and
    // decoded to check it: the QR encodes exactly this URL (the v1.0.0 APK).
    'download_url' => 'https://github.com/janjanshenn/DentCare-Mobile-Releases/releases/download/v1.0.0/DentCare.apk',
    'qr_image'     => 'images/app-download-qr.png',
];

// ── Opening hours ───────────────────────────────────────────────────────────
// 'note' renders as a highlighted pill instead of a plain time.
// Client-confirmed web revision, 2026-09-22: Mon–Sat 9 AM–5 PM,
// strictly by appointment. The separate holiday hours were removed.
//
// KEEP IN SYNC with OPENING_HOURS in js/landing.js, which drives the live
// open/closed pill in the top bar from a second copy of these times.
$opening_hours = [
    ['day' => 'Monday – Saturday', 'time' => '9:00 AM – 5:00 PM', 'note' => false],
    ['day' => 'Appointments',      'time' => 'Strictly by appointment', 'note' => true],
];

// ── Clinic amenities ────────────────────────────────────────────────────────
// Emptied 2026-08-25 at the client's request: parking, wheelchair access and
// Wi-Fi were assumed, never confirmed, and the clinic is a mall stall where at
// least the parking claim was not the clinic's to make. The chip list has been
// removed from templates/landing.php too, so refilling this array alone will
// not bring it back.
$amenities = [];

// ── Dental services ─────────────────────────────────────────────────────────
// The four areas Dr. Gapit actually practises, confirmed 2026-08-24. This
// replaced eight speculative placeholder entries — do not pad this list back
// out; a clinic that lists what it does not do is worse than a short list.
//
// 'photo' => null shows the icon placeholder. To use a real photo, drop the
// file into images/services/ and set e.g. 'photo' => 'images/services/general.jpg'
$services = [
    [
        'icon'  => 'tooth',
        'photo' => null,
        'title' => 'General Dentistry',
        'text'  => 'Routine checkups, cleaning, tooth fillings, and fluoride treatment to keep your teeth healthy.',
        'tags'  => ['Cleaning', 'Fillings', 'Checkups'],
    ],
    [
        'icon'  => 'align',
        'photo' => null,
        'title' => 'Orthodontics',
        'text'  => 'Braces and retainers that straighten crooked or crowded teeth and correct how your bite meets.',
        'tags'  => ['Metal Braces', 'Ceramic', 'Retainers'],
    ],
    [
        // TODO(CLIENT): confirm this heading with Dr. Gapit at the walkthrough.
        // "General Surgery" is the clinic's own wording. The copy below is
        // deliberately specific about the procedures actually performed, so the
        // page does not read as a claim to the medical specialty of the same
        // name. "Oral Surgery" is the usual term if she would rather use it.
        'icon'  => 'implant',
        'photo' => null,
        'title' => 'General Surgery',
        'text'  => 'Tooth extraction, wisdom tooth removal, and minor oral procedures, including implants to replace a missing tooth.',
        'tags'  => ['Extraction', 'Wisdom Tooth', 'Implants'],
    ],
    [
        'icon'  => 'sparkle',
        'photo' => null,
        'title' => 'Aesthetics',
        'text'  => 'Teeth whitening, veneers, and smile design for patients who want to change how their smile looks.',
        'tags'  => ['Whitening', 'Veneers', 'Smile Design'],
    ],
];

// ── HMO providers ───────────────────────────────────────────────────────────
// ONE, not ten. The list used to carry ten speculative names with an "Ask to
// verify" caption on each; the clinic confirmed 2026-08-31 that MediCard is
// what Dr. Gapit accepts, and the artwork they supplied
// (images/hmo/My-MediCard.jpg) is a MediCard membership card.
//
// TODO(CLIENT): there is a SECOND accredited provider that has not been
// identified yet — the clinic is verifying it with Dr. Gapit. Two candidates
// were dictated as "Medicare" and "MeduCare"; neither is a Philippine HMO.
// "Medicare" here almost certainly means PhilHealth, the government insurance
// that took over the old Medicare programme in 1995 and which Filipinos of
// that generation still call by the old name.
//
// When she confirms it, add it here AND update the assertion in
// tools/check-billing.js in the same commit — the public page and the checker
// must never disagree about what a patient is told their insurance covers.
// Do not pad this list back out speculatively in the meantime: one honest
// entry beats five hopeful ones.
//
// If the second turns out to be PhilHealth, word it as government insurance
// rather than an HMO. They are not the same thing and patients know it.
$hmo_providers = [
    ['mark' => 'MC', 'logo' => 'images/hmo/medicard.jpg', 'name' => 'MediCard'],
];

// ── Payment methods ─────────────────────────────────────────────────────────
// Confirmed by the clinic 2026-08-31. GCash and InstaPay are ONE tile, not two:
// at the desk they are the same act — the patient sends it and shows the
// reference number. Maya was dropped because the clinic did not name it.
//
// NOTHING HERE IS AN ONLINE PAYMENT. The system records money that staff
// collect in person; it does not process a transaction. The note rendered
// beneath these tiles says so in as many words, and it must stay — a patient
// who sees the GCash and BDO marks will otherwise assume they can pay through
// the site. An earlier commit deliberately removed that implication once.
// 'photo' distinguishes a PHOTOGRAPH, which should fill its tile edge to edge,
// from a LOGO, which must be shown whole and never cropped.
//
// This used to be inferred in the template with strpos($logo, 'cash'), which
// silently matched "gcash.jpg" as well — so the GCash logo was cropped like a
// photograph and looked mangled. Filename sniffing is not a type system; the
// data says what each thing is.
// The card art is baked to one 800x1000 canvas by tools/make-payment-cards.php
// so all three fill their frame identically. Do not point these back at the
// small logos — the section is laid out as full-bleed pictures now, and a
// 260px logo stretched to fill is exactly the mess this replaced.
$payment_methods = [
    ['mark' => 'PHP', 'logo' => 'images/payments/card-cash.jpg',  'photo' => true,  'name' => 'Cash',
     'note' => 'Paid at the counter after your visit'],
    ['mark' => 'G',   'logo' => 'images/payments/card-gcash.jpg', 'photo' => true,  'name' => 'GCash / InstaPay',
     'note' => 'Send it, then show the reference number'],
    ['mark' => 'BDO', 'logo' => 'images/payments/card-bdo.jpg',   'photo' => true,  'name' => 'BDO',
     'note' => 'Ask the desk for the account details'],
];

// ── Main navigation links (also used to build the footer quick links) ───────
// Order matches the order the sections appear on the page. Services comes
// before Visit Us now — a visitor asks "what do you do" before "where are you".
$nav_links = [
    ['href' => 'home',         'label' => 'Home'],
    ['href' => 'services',     'label' => 'Services'],
    ['href' => 'visit-us',     'label' => 'Visit Us'],
    ['href' => 'hmo-payments', 'label' => 'HMO & Payments'],
    ['href' => 'download-app', 'label' => 'Mobile App'],
];
