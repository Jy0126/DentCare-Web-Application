<?php
/**
 * DentCare — the Privacy Policy's words (2026-10-03, client revision 22)
 * ---------------------------------------------------------------------------
 * Printed by privacy.php, and hashed by privacy_text_hash() in helpers.php:
 * every agreement saves that hash, so changing a word here means patients are
 * asked to agree again at their next sign-in.
 *
 * Version 1.0, 2026-10-05: made short and plain at the owner's request. Only
 * what a patient needs to know about their information, in DentCare's own
 * words, from what the code really does (no analytics, no SMS, no government
 * IDs). Legal review items were taken out for now; any question goes to
 * Dr. Gapit. Never claim here what the system does not do.
 *
 * Included inside privacy_policy_body(), which makes sure the clinic's details
 * (templates/partials/clinic-data.php) are loaded first. Never include
 * clinic-data.php here: the landing page's require_once would then skip it.
 */
$clinic = $GLOBALS['clinic'];
?>
<div class="policy-section policy-section--short">
    <p>DentCare is the website and app of the <?= e($clinic['name']) ?>. This page tells you, in plain words, what
        information we keep about you, why, and who can see it. We respect your privacy under the Data Privacy Act
        of 2012. We do not sell your information, and this website has no advertising or tracking.</p>
</div>

<section id="what-we-collect" class="policy-section">
    <h2>1. What we keep</h2>
    <ul>
        <li>your name, date of birth, sex, mobile number, email (if you give one), address and emergency contact;</li>
        <li>for a patient under 18, a parent or guardian&rsquo;s name and number;</li>
        <li>your answers to the clinic&rsquo;s health questions, your tooth chart, and what was done at each visit;</li>
        <li>your signed consent, your appointments, your bills and payments, and your messages to the clinic.</li>
    </ul>
    <p>We never ask for government ID numbers. Your password is kept by Google&rsquo;s sign-in service: the clinic
        never sees it.</p>
</section>

<section id="why" class="policy-section">
    <h2>2. Why we keep it</h2>
    <ul>
        <li>to treat you safely: your allergies and conditions are shown to the dentist before treatment;</li>
        <li>to keep your dental record, appointments, bills and receipts;</li>
        <li>to answer your messages and help you with your account.</li>
    </ul>
</section>

<section id="who-sees-it" class="policy-section">
    <h2>3. Who can see it</h2>
    <ul>
        <li><strong>Dr. Gapit</strong> sees your whole record.</li>
        <li><strong>The clinic staff</strong> see only what they need for registration, appointments, billing
            and messages.</li>
        <li><strong>You</strong> see your appointments, your messages and your account details. Your health
            answers, tooth chart, treatment records and bills are not shown in your account: they stay with the
            clinic.</li>
        <li><strong>No other patient</strong> can see anything of yours.</li>
    </ul>
</section>

<section id="service-providers" class="policy-section">
    <h2>4. Services we use</h2>
    <p>DentCare runs on <strong>Google Firebase</strong> (sign-in, the database and the website). The website
        also uses Google Fonts, Google Maps on the home page, and Google reCAPTCHA, which checks that requests come
        from this website and not from a robot. None of them receive your dental record.</p>
</section>

<section id="protection" class="policy-section">
    <h2>5. How we keep it safe</h2>
    <ul>
        <li>every page uses a secure, encrypted connection;</li>
        <li>each person can open only what their role allows;</li>
        <li>an unused screen signs itself out after 30 minutes.</li>
    </ul>
    <p>If you think someone has used your account, tell the clinic right away.</p>
</section>

<section id="how-long" class="policy-section">
    <h2>6. How long we keep it</h2>
    <p>Your dental record stays with the clinic, so your history is there when you come back. A patient who no
        longer visits is marked inactive, not deleted.</p>
</section>

<section id="your-rights" class="policy-section">
    <h2>7. Seeing or correcting your information</h2>
    <p>Your treatment records, tooth chart and bills are not shown on this website or in the app. To see them or
        get a copy, ask Dr. Gapit: every request to see a record goes to her, and she decides how they are given
        to you.</p>
    <p>You can change your contact details yourself in Account Settings. If your health answers have changed, tell
        the staff or Dr. Gapit at your visit.</p>
</section>

<section id="browser-storage" class="policy-section">
    <h2>8. Your browser</h2>
    <p>We use no tracking cookies. The website keeps a few small items in your own browser so it works, such as
        your sign-in. Clearing your browser&rsquo;s data removes them and signs you out.</p>
</section>

<section id="changes" class="policy-section">
    <h2>9. Changes</h2>
    <p>If this policy changes, you will be asked to agree to the new version the next time you sign in.</p>
</section>

<section id="contact" class="policy-section">
    <h2>10. Questions? Please contact Dr. Gapit</h2>
    <p>For any question about your information, please contact <strong>Dr. Reina G. Gapit</strong>:<br>
        <?= e($clinic['name']) ?><br>
        <?= e($clinic['address_line']) ?>,<br>
        <?= e($clinic['address_city']) ?><br>
        <?= e($clinic['phone']) ?> or <?= e($clinic['phone_alt']) ?></p>
<?php if (!empty($clinic['email'])): ?>
    <p><?= e($clinic['email']) ?></p>
<?php endif; ?>
    <p>You can also ask at the clinic, or send a message through your account.</p>
</section>
