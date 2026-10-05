<?php
/**
 * DentCare — Shared page head
 * ---------------------------------------------------------------------------
 * Both entry points open with this, so there is one place to add a stylesheet
 * or change the browser title.
 *
 * Set before including:
 *   $page_title  string  browser tab title
 *   $page_id     string  'public' for index.php, 'portal' for portal.php
 *
 * $page_id is published to JavaScript as window.DENTCARE_PAGE. js/app.js reads
 * it to decide where to send a visitor when their sign-in state changes: a
 * signed-in visitor on the public page goes to the portal, and a signed-out
 * visitor on the portal comes back here.
 *
 * The reporting libraries (jsPDF, SheetJS, JSZip) are only used by the
 * portal's exports, so the public page does not load them.
 */

if (!isset($page_title)) { $page_title = 'DentCare'; }
if (!isset($page_id))    { $page_id = 'public'; }

require_once __DIR__ . '/helpers.php';

/**
 * Appends the file's last-modified time to an asset URL.
 *
 * Without this the browser keeps serving the CSS and JS it cached, so a change
 * only shows up after a hard refresh — which looks exactly like the change not
 * working. The stamp changes when the file does, so the browser refetches then
 * and only then.
 */
if (!function_exists('asset')) {
    function asset(string $path): string
    {
        $full = dirname(__DIR__, 2) . '/' . $path;
        $stamp = is_file($full) ? filemtime($full) : time();
        return e($path) . '?v=' . $stamp;
    }
}

?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= e($page_title) ?></title>
    <!-- Round tab icon (tools/make-logo-icons.php). About 2 KB, where the
         square original it replaced was 224 KB on every page load. -->
    <link rel="icon" type="image/png" sizes="32x32" href="images/icon-circle-32.png">
    <link rel="icon" type="image/png" sizes="64x64" href="images/icon-circle-64.png">
    <link rel="apple-touch-icon" sizes="180x180" href="images/icon-circle-180.png">

    <!--
        The two families the public landing page uses: Cormorant Garamond for
        display and Hanken Grotesk for everything else. Both are applied only
        through --font-display / --font-body inside .landing, so every
        dashboard keeps Montserrat from base.css.

        display=swap so text paints immediately on a slow connection rather
        than sitting invisible — a patient standing in a mall corridor on
        mobile data should see the phone number before the font arrives.
    -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<?php if ($page_id === 'portal'): ?>
    <!-- The dashboards use only Montserrat (headings). One request, found at
         once here rather than through an @import inside css/base.css, which
         the browser only discovered after downloading that stylesheet
         (2026-09-24). The landing fonts are not fetched for the portal. -->
    <link rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700&display=swap">
<?php else: ?>
    <link rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500;600&family=Hanken+Grotesk:wght@400;500;600;700&family=Montserrat:wght@500;600;700&display=swap">
<?php endif; ?>

<?php if ($page_id !== 'portal'): ?>
    <!-- The storefront photo is the largest thing on the public page and a CSS
         background, which the browser would otherwise find only after every
         stylesheet. Measured 2026-09-24 on a throttled phone: it arrived at
         8.5 s. Each screen size asks for the one file it will use. -->
    <link rel="preload" as="image" href="images/clinic-hero-1280.jpg" media="(max-width: 1000px)" fetchpriority="high">
    <link rel="preload" as="image" href="images/clinic-hero.jpg" media="(min-width: 1001px)" fetchpriority="high">
<?php endif; ?>
    <link rel="stylesheet" href="<?= asset('css/base.css') ?>">
    <link rel="stylesheet" href="<?= asset('css/layout.css') ?>">
    <link rel="stylesheet" href="<?= asset('css/components.css') ?>">
    <link rel="stylesheet" href="<?= asset('css/auth.css') ?>">
    <link rel="stylesheet" href="<?= asset('css/dashboard.css') ?>">
    <link rel="stylesheet" href="<?= asset('css/landing.css') ?>">
    <link rel="stylesheet" href="<?= asset('css/booking.css') ?>">
    <link rel="stylesheet" href="<?= asset('css/oral-care.css') ?>">
    <link rel="stylesheet" href="<?= asset('css/services.css') ?>">
    <link rel="stylesheet" href="<?= asset('css/clinic.css') ?>">
    <link rel="stylesheet" href="<?= asset('css/queue.css') ?>">
    <!-- The landing page's Mobile App section. Scoped to .landing, so it can
         come before marble.css, which must stay last for the portal. -->
<?php if ($page_id !== 'portal'): ?>
    <link rel="stylesheet" href="<?= asset('css/landing-app.css') ?>">
<?php endif; ?>
<?php if ($page_id === 'portal'): ?>
    <!-- Walk-in & Booking, the patient picker and the stock batch (2026-10-04).
         Before marble.css like every other sheet; its button sizes carry
         .app-layout so they still beat marble's 42px minimum. -->
    <link rel="stylesheet" href="<?= asset('css/clinic-workflow.css') ?>">
<?php endif; ?>
    <!-- Last on purpose: the marble canvas and the grouped sidebar both
         override earlier rules, and load order is how they win the tie. -->
    <link rel="stylesheet" href="<?= asset('css/marble.css') ?>">

    <script>window.DENTCARE_PAGE = <?= json_encode($page_id) ?>;</script>
<?php if (privacy_feature_on()): ?>
    <!-- The Privacy Policy version and the fingerprint of its words, saved
         with each "I agree" (2026-10-03, R22). Absent from the static build
         until the policy is approved, and then nothing is asked or saved. -->
    <script>window.DENTCARE_PRIVACY = <?= json_encode(['version' => PRIVACY_POLICY_VERSION, 'textHash' => privacy_text_hash(), 'approved' => PRIVACY_POLICY_APPROVED]) ?>;</script>
<?php endif; ?>

    <!-- Firebase SDK (v10 compat) — the app's only backend, shared with the
         Flutter mobile app via the same "dentcare-nijims" project. -->
    <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js"
            integrity="sha384-4gq9w/AGf72FXdNQ3Kn3EqWP7633NbCMjpYHt8YCZyXf23o2opcuAr4cif41tLrC" crossorigin="anonymous"></script>
    <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-auth-compat.js"
            integrity="sha384-xtdq4MQqPj1dB5DQsuw9O7dh4kHhMP/Wp5u8O1jiaWiou13ZfJIgiccjtVK2pBhL" crossorigin="anonymous"></script>
    <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore-compat.js"
            integrity="sha384-Qgqc/HETq5lqJnRDqWnV1AZGw3pgMYNUVaqLLN1W/55XuWK94epwbCQrOvdoh1Zo" crossorigin="anonymous"></script>

    <!-- App Check — the abuse and rate-limiting layer.
         Loaded before app.js so activateAppCheck() there has it. It does
         nothing at all until APP_CHECK_SITE_KEY in js/app.js is filled in;
         see SECURITY.md for what to switch on in the console first. ~15 KB. -->
    <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-app-check-compat.js"
            integrity="sha384-NDFDftmSWhHkz3UIclV1BgVjP4jQatEUrT4I3UH3s3rOSAjwtTIGM332IgOKDs/d" crossorigin="anonymous"></script>
<?php if ($page_id === 'portal' && DENTCARE_XRAY_UPLOADS): ?>
    <!-- Storage — x-ray and scanned-file uploads on the patient record. Portal
         only, and only when uploads are switched on (DENTCARE_XRAY_UPLOADS in
         partials/helpers.php; off on the Spark plan). ~40 KB. -->
    <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-storage-compat.js"
            integrity="sha384-yTXgVdKIoM5XuQZ1AGw9zFUgmu45OeHYpGDbbWtXHu/qOJxneVAXbw5Rh5CGninE" crossorigin="anonymous"></script>
<?php endif; ?>

<?php /* The portal's reporting libraries (jsPDF, jsPDF-AutoTable, SheetJS,
          JSZip) are no longer <script> tags here. They were ~1.4 MB that
          blocked every dashboard from drawing, used only when exporting.
          js/app.js loadReportLibraries() now fetches them on first use, with
          the same pinned integrity hashes (REPORT_LIBRARIES). */ ?>
</head>
<body>

<?php
// The SVG icon sprite is defined once per page so any screen can draw an icon
// with icon('name') instead of pasting an emoji into the markup.
include __DIR__ . '/icon-sprite.php';
?>
