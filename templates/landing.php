<?php
/**
 * DentCare — Public Landing Page
 * ---------------------------------------------------------------------------
 * Section order, and why it is this order:
 *   1. Nav        — sits ON the storefront photo, transparent. The first thing
 *                   a visitor sees is the actual clinic, not a header bar.
 *   2. Hero       — the storefront, full bleed. Book a Visit / I'm Here Now.
 *   3. Services   — what she does, as hairline rows.
 *   4. Getting seen — booked vs walk-in, the two ways into the queue.
 *   5. Visit Us   — address, hours, live map, and the walk from the street.
 *   6. HMO & pay  — MediCard, and the three rails the desk actually takes.
 *   7. Mobile app — a preview of care beyond the visit and its download path.
 *   8. Book       — the page must not end on an insurance logo.
 *
 * Content (services, HMO, hours, contact details) comes from
 * partials/clinic-data.php — edit content there, layout here.
 *
 * The reveal-on-scroll class is `reveal`; js/landing.js wires it with an
 * IntersectionObserver and honours prefers-reduced-motion. Anything without
 * the class is simply always visible, so the page still reads with JS off.
 */

require_once __DIR__ . '/partials/helpers.php';
require_once __DIR__ . '/partials/clinic-data.php';
?>

<div id="screen-landing" class="landing">

    <!-- ═══════════════════════════════════════════════════════════════════
         1 + 2. THE STOREFRONT, WITH THE NAVIGATION ON TOP OF IT
         ═══════════════════════════════════════════════════════════════ -->

    <div class="stage">

        <div class="topbar">
            <div class="topbar__group">
                <span class="topbar__item"><?= icon('phone') ?><?= e($clinic['phone']) ?></span>
                <span class="topbar__item"><?= icon('pin') ?><?= e($clinic['address_line']) ?></span>
            </div>
            <div class="topbar__group">
                <!-- Open/closed state is calculated by updateClinicStatus() in js/landing.js -->
                <span id="clinic-status" class="status">
                    <span class="status__dot"></span>
                    <span id="clinic-status-text">Checking hours&hellip;</span>
                </span>
            </div>
        </div>

        <nav class="navbar">
            <a href="#home" class="brand" onclick="scrollToSection('home'); return false;">
                <span class="brand__badge">
                    <img src="images/logo-64.png" alt="" class="brand__logo" width="32" height="32">
                </span>
                <span class="brand__text">
                    <span class="brand__name">Dent<span>Care</span></span>
                    <span class="brand__tagline"><?= e($clinic['name']) ?></span>
                </span>
            </a>

            <ul class="navbar__menu" id="navbar-menu">
                <?php foreach ($nav_links as $i => $link): ?>
                    <li>
                        <a href="#<?= e($link['href']) ?>"
                           class="navbar__link<?= $i === 0 ? ' is-active' : '' ?>"
                           data-section="<?= e($link['href']) ?>"
                           onclick="scrollToSection('<?= e($link['href']) ?>'); return false;"><?= e($link['label']) ?></a>
                    </li>
                <?php endforeach; ?>
                <!--
                    Login and Book inside the phone/tablet menu (2026-09-16).
                    A patient on a phone reported that Login was nowhere to be
                    found: the hero only offers booking. Since 2026-10-03 the
                    bar shows Login on a phone too; these stay as a second
                    route. Hidden on a desktop, where the bar already shows both.
                -->
                <li class="navbar__menu-actions">
                    <button type="button" class="btn btn--gold" onclick="closeMobileNav(); openBookingPage('register')">Book a visit</button>
                    <button type="button" class="btn btn--outline-brand" onclick="closeMobileNav(); openBookingPage('login')">Login</button>
                </li>
            </ul>

            <!--
                Login stays in the bar on a phone and tablet too (2026-10-03):
                patients on phones still could not find it inside the menu.
                Book is hidden there (the page's own button carries it), and the
                desktop bar is unchanged. The menu button comes after these, so
                the order on screen and the keyboard order are the same.
            -->
            <div class="navbar__actions">
                <button class="btn btn--glass" onclick="openBookingPage('login')">Login</button>
                <button class="btn btn--gold" onclick="openBookingPage('register')">Book</button>
            </div>

            <button class="navbar__toggle" onclick="toggleMobileNav()" aria-label="Open menu" aria-expanded="false">
                <?= icon('menu') ?>
            </button>
        </nav>

        <!--
            The background is the clinic's own storefront — see --hero-photo in
            css/landing.css for the crop and tint. To swap in a newer photo, drop
            the full-resolution file into images/ and run tools/make-hero-image.php
            over it; do not reference a straight-off-the-phone JPEG here, it is
            several megabytes in front of the first paint of the public page.
        -->
        <header id="home" class="hero">
            <div class="hero__inner">
                <p class="hero__kick">Stall 104B &middot; Ramaida Centrum &middot; Naga</p>

                <h1 class="hero__title">Compassionate Care, Confident Smiles.</h1>

                <p class="hero__text">
                    Strictly by Appointment.
                </p>

                <div class="hero__actions">
                    <button class="btn btn--gold btn--lg" onclick="openBookingPage('register')">
                        <?= icon('calendar') ?> Book a Visit
                    </button>
                    <button class="btn btn--glass btn--lg" onclick="startWalkInRegistration()">
                        <?= icon('clock') ?> I&rsquo;m Here Now
                    </button>
                </div>
            </div>
        </header>
    </div>


    <!-- ═══════════════════════════════════════════════════════════════════
         3. SERVICES
         Hairline rows, not photo cards. Four identical empty picture boxes
         read as unfinished; a numbered list reads as deliberate and needs no
         photography to look complete.
         ═══════════════════════════════════════════════════════════════ -->

    <section id="services" class="section section--white">
        <div class="service-layout">
        <div class="sec-head reveal">
            <p class="eyebrow">Services</p>
            <h2 class="sec-head__title">
                <span class="sec-head__mask"><span class="sec-head__line">Four areas</span></span>
                <span class="sec-head__mask"><span class="sec-head__line">of care</span></span>
            </h2>
            <p class="sec-head__lead">Not sure which you need? Book a check-up and Dr. Gapit will tell you.</p>
        </div>

        <div class="svc-rows">
            <?php foreach ($services as $i => $service): ?>
                <!--
                    No numeral here on purpose. Four services are a MENU, not a
                    sequence, and the 01-04 was the last thing still implying an
                    order to work through. The wayfinding steps keep their
                    numbers, because that one genuinely is a sequence.
                -->
                <article class="svc-row reveal">
                    <h3 class="svc-row__title"><?= e($service['title']) ?></h3>
                    <div class="svc-row__meta">
                        <p class="svc-row__tl"><?= e($service['text']) ?></p>
                        <ul class="tags">
                            <?php foreach ($service['tags'] as $tag): ?>
                                <li class="tag"><?= e($tag) ?></li>
                            <?php endforeach; ?>
                        </ul>
                    </div>
                    <button class="svc-row__go" onclick="openBookingPage('register')">Book</button>
                </article>
            <?php endforeach; ?>
        </div>
        </div>
    </section>


    <!-- ═══════════════════════════════════════════════════════════════════
         4. GETTING SEEN — booked, or walking in
         ═══════════════════════════════════════════════════════════════ -->

    <section class="section section--access">
        <div class="sec-head reveal">
            <p class="eyebrow">Getting seen</p>
            <h2 class="sec-head__title">
                <span class="sec-head__mask"><span class="sec-head__line">Walk in,</span></span>
                <span class="sec-head__mask"><span class="sec-head__line">or book ahead</span></span>
            </h2>
            <p class="sec-head__lead">
                Booked patients are seen at their slot. Walk-ins wait on standby and take the gaps.
            </p>
        </div>

        <div class="journey-story reveal">
            <div class="journey-scene" aria-hidden="true">
                <span class="journey-scene__floor"></span>
                <span class="journey-person journey-person--walking">
                    <svg viewBox="0 0 128 176" focusable="false" aria-hidden="true">
                        <defs>
                            <linearGradient id="arrival-knit" gradientUnits="userSpaceOnUse" x1="49" y1="55" x2="83" y2="72">
                                <stop stop-color="#d5b38a"/>
                                <stop offset=".42" stop-color="#ac7a50"/>
                                <stop offset="1" stop-color="#6c4834"/>
                            </linearGradient>
                            <linearGradient id="arrival-trousers" gradientUnits="userSpaceOnUse" x1="53" y1="100" x2="75" y2="105">
                                <stop stop-color="#626762"/>
                                <stop offset=".45" stop-color="#444c46"/>
                                <stop offset="1" stop-color="#28332d"/>
                            </linearGradient>
                            <linearGradient id="arrival-skin" gradientUnits="userSpaceOnUse" x1="53" y1="20" x2="87" y2="42">
                                <stop stop-color="#f3ceb0"/>
                                <stop offset=".5" stop-color="#deae8b"/>
                                <stop offset="1" stop-color="#b87c5b"/>
                            </linearGradient>
                            <linearGradient id="arrival-hair" x1="0" y1="0" x2=".7" y2="1">
                                <stop stop-color="#5b5145"/>
                                <stop offset=".5" stop-color="#3e3933"/>
                                <stop offset="1" stop-color="#252923"/>
                            </linearGradient>
                            <linearGradient id="arrival-sneaker" x1="0" y1="0" x2="0" y2="1">
                                <stop stop-color="#fffaf0"/>
                                <stop offset=".65" stop-color="#e3dbcc"/>
                                <stop offset="1" stop-color="#b3ab9a"/>
                            </linearGradient>
                            <radialGradient id="arrival-ground">
                                <stop stop-color="#604936" stop-opacity=".22"/>
                                <stop offset="1" stop-color="#604936" stop-opacity="0"/>
                            </radialGradient>
                        </defs>
                        <ellipse class="arrival-walker__shadow" fill="url(#arrival-ground)" cx="66" cy="167" rx="37" ry="6"/>
                        <g class="arrival-walker__body">
                            <!-- Far limbs sit behind the torso; each knee bends independently. -->
                            <g class="arrival-walker__arm arrival-walker__arm--far">
                                <path class="arrival-walker__sleeve" d="M59 66 L57 82"/>
                                <path class="arrival-walker__skin-limb" d="M57 81 Q59 94 65 103"/>
                                <ellipse fill="url(#arrival-skin)" cx="66" cy="104" rx="5" ry="6" transform="rotate(-20 66 104)"/>
                            </g>
                            <g class="arrival-walker__leg arrival-walker__leg--far">
                                <path class="arrival-walker__trouser" d="M61 99 L61 128"/>
                                <g class="arrival-walker__shin arrival-walker__shin--far">
                                    <path class="arrival-walker__trouser" d="M61 127 L61 156"/>
                                    <g class="arrival-walker__foot arrival-walker__foot--far">
                                        <path fill="url(#arrival-sneaker)" d="M54 153 L66 153 L67 157 Q81 158 82 164 Q82 167 77 167 L54 167 Q51 165 54 153Z"/>
                                        <path class="arrival-walker__sole" d="M54 165 L79 165"/>
                                    </g>
                                </g>
                            </g>
                            <g class="arrival-walker__leg arrival-walker__leg--near">
                                <path class="arrival-walker__trouser" d="M66 99 L66 128"/>
                                <g class="arrival-walker__shin arrival-walker__shin--near">
                                    <path class="arrival-walker__trouser" d="M66 127 L66 156"/>
                                    <path class="arrival-walker__seam" d="M62 130 L62 151"/>
                                    <g class="arrival-walker__foot arrival-walker__foot--near">
                                        <path fill="url(#arrival-sneaker)" d="M59 153 L71 153 L72 157 Q86 158 87 164 Q87 167 82 167 L59 167 Q56 165 59 153Z"/>
                                        <path class="arrival-walker__sole" d="M59 165 L84 165"/>
                                        <path class="arrival-walker__lace" d="M72 158 L77 160 M69 160 L74 162"/>
                                    </g>
                                </g>
                            </g>
                            <g class="arrival-walker__upper">
                                <path fill="url(#arrival-skin)" d="M63 44 L77 44 L76 59 L62 58Z"/>
                                <path fill="url(#arrival-knit)" d="M56 57 Q64 52 76 58 Q83 68 81 84 L79 103 Q66 107 51 101 L50 77 Q49 64 56 57Z"/>
                                <path class="arrival-walker__shirt-light" d="M57 63 Q53 78 57 97"/>
                                <path class="arrival-walker__hem" d="M53 99 Q66 103 78 100"/>
                                <path class="arrival-walker__neckline" d="M63 56 Q69 63 76 57"/>
                                <g class="arrival-walker__head">
                                    <path fill="url(#arrival-skin)" d="M59 23 Q64 16 75 20 Q84 23 84 33 L89 39 Q90 42 84 43 L83 48 Q80 55 68 52 Q57 49 55 38 Q53 29 59 23Z"/>
                                    <path fill="url(#arrival-hair)" d="M55 39 Q49 30 54 22 Q59 12 73 16 Q83 17 85 25 Q75 23 69 28 L63 34 L61 43 Q56 43 55 39Z"/>
                                    <path class="arrival-walker__hair-light" d="M56 25 Q63 17 75 21"/>
                                    <ellipse fill="url(#arrival-skin)" cx="63" cy="38" rx="4" ry="5"/>
                                    <path class="arrival-walker__ear" d="M63 36 Q60 36 62 40"/>
                                </g>
                                <g class="arrival-walker__arm arrival-walker__arm--near">
                                    <path class="arrival-walker__sleeve" d="M66 66 L66 82"/>
                                    <path class="arrival-walker__skin-limb" d="M66 82 Q68 94 75 102"/>
                                    <path class="arrival-walker__sleeve-light" d="M62 67 L62 77"/>
                                    <ellipse fill="url(#arrival-skin)" cx="76" cy="103" rx="5" ry="6" transform="rotate(-25 76 103)"/>
                                </g>
                            </g>
                        </g>
                    </svg>
                </span>
            </div>

            <div class="pick">
            <div class="pick__card">
                <?= icon('calendar', 'pick__icon') ?>
                <h3 class="pick__title">Book an appointment</h3>
                <p class="pick__text">
                    Pick a date and time. You will be seen at your slot, ahead of the walk-in queue.
                </p>
                <span class="pick__act">
                    <button class="btn btn--outline" onclick="openBookingPage('register')">Book a Visit</button>
                </span>
            </div>

            <div class="pick__card pick__card--now">
                <span class="journey-greeter" aria-hidden="true">
                    <svg viewBox="0 0 140 126" focusable="false" aria-hidden="true">
                        <defs>
                            <linearGradient id="welcome-knit" gradientUnits="userSpaceOnUse" x1="39" y1="63" x2="95" y2="97">
                                <stop stop-color="#d5b38a"/>
                                <stop offset=".45" stop-color="#ac7a50"/>
                                <stop offset="1" stop-color="#6c4834"/>
                            </linearGradient>
                            <linearGradient id="welcome-skin" gradientUnits="userSpaceOnUse" x1="49" y1="22" x2="87" y2="60">
                                <stop stop-color="#f3ceb0"/>
                                <stop offset=".55" stop-color="#deae8b"/>
                                <stop offset="1" stop-color="#b87c5b"/>
                            </linearGradient>
                            <linearGradient id="welcome-hair" x1="0" y1="0" x2=".8" y2="1">
                                <stop stop-color="#5b5145"/>
                                <stop offset="1" stop-color="#252923"/>
                            </linearGradient>
                        </defs>
                        <path fill="url(#welcome-skin)" d="M58 49 L74 49 L75 65 L57 65Z"/>
                        <path fill="url(#welcome-knit)" d="M48 64 Q57 58 66 61 Q78 59 87 66 Q96 77 95 95 L91 126 L39 126 L38 94 Q37 75 48 64Z"/>
                        <path class="journey-greeter__collar" d="M57 61 Q66 69 76 61"/>
                        <path class="journey-greeter__shirt-light" d="M45 78 Q42 96 45 115"/>
                        <ellipse fill="url(#welcome-skin)" cx="66" cy="37" rx="18" ry="21"/>
                        <ellipse fill="url(#welcome-skin)" cx="48" cy="38" rx="3" ry="5"/>
                        <ellipse fill="url(#welcome-skin)" cx="84" cy="38" rx="3" ry="5"/>
                        <path fill="url(#welcome-hair)" d="M48 36 Q43 18 58 14 Q75 8 83 22 Q86 28 83 36 L79 28 Q73 26 69 23 Q61 29 51 28 L50 36Z"/>
                        <path class="journey-greeter__hair-light" d="M51 22 Q62 14 75 20"/>
                        <g class="journey-greeter__card-hand">
                            <path class="journey-greeter__sleeve" d="M46 72 L40 81"/>
                            <path class="journey-greeter__arm" d="M40 81 Q31 80 28 69"/>
                            <rect class="journey-greeter__card" x="7" y="47" width="34" height="24" rx="5"/>
                            <path class="journey-greeter__card-check" d="M15 59 L20 64 L32 53"/>
                            <ellipse fill="url(#welcome-skin)" cx="32" cy="71" rx="5" ry="3"/>
                        </g>
                        <path class="journey-greeter__sleeve" d="M87 72 L98 63"/>
                        <g class="journey-greeter__wave">
                            <path class="journey-greeter__arm" d="M98 63 Q105 53 105 40"/>
                            <path fill="url(#welcome-skin)" d="M101 43 Q98 37 96 33 Q95 30 98 30 L102 34 L101 24 Q101 21 104 22 L106 33 L107 21 Q108 18 110 21 L110 33 L114 24 Q116 22 117 25 L114 36 L118 31 Q121 30 121 33 L114 43 Q109 48 104 45Z"/>
                        </g>
                    </svg>
                </span>
                <?= icon('clock', 'pick__icon') ?>
                <h3 class="pick__title">I&rsquo;m here now</h3>
                <p class="pick__text">
                    Tell the desk and we will add you to today&rsquo;s queue. First visit? Details
                    are taken on the tablet.
                </p>
                <span class="pick__act">
                    <button class="btn btn--gold" onclick="startWalkInRegistration()">Register as Walk-In</button>
                </span>
            </div>
            </div>
        </div>
    </section>


    <!-- ═══════════════════════════════════════════════════════════════════
         5. VISIT US — address, hours, map, and the walk from the street
         ═══════════════════════════════════════════════════════════════ -->

    <section id="visit-us" class="section section--white">
        <div class="sec-head reveal">
            <p class="eyebrow">Where to find us</p>
            <h2 class="sec-head__title">
                <span class="sec-head__mask"><span class="sec-head__line">Inside</span></span>
                <span class="sec-head__mask"><span class="sec-head__line">Ramaida Centrum</span></span>
            </h2>
            <p class="sec-head__lead">
                A marketplace of dozens of stalls on Elias Angeles Street. Hers is 104B, on the
                ground floor.
            </p>
        </div>

        <div class="visit reveal">
            <div class="visit__info">
                <span class="plate"><b>104B</b><span>Ground Floor</span></span>

                <address class="address">
                    <strong><?= e($clinic['name']) ?></strong>
                    <?= e($clinic['address_line']) ?><br>
                    <?= e($clinic['address_city']) ?>
                </address>

                <ul class="hours">
                    <?php foreach ($opening_hours as $row): ?>
                        <li class="hours__row">
                            <span class="hours__day"><?= e($row['day']) ?></span>
                            <span class="hours__time<?= $row['note'] ? ' hours__time--note' : '' ?>">
                                <?= e($row['time']) ?>
                            </span>
                        </li>
                    <?php endforeach; ?>
                </ul>

                <div class="contact-list">
                    <a class="contact-list__item" href="<?= tel_href($clinic['phone']) ?>">
                        <?= icon('phone') ?>
                        <span><span class="contact-list__label">Phone</span><?= e($clinic['phone']) ?></span>
                    </a>
                    <a class="contact-list__item" href="<?= tel_href($clinic['phone_alt']) ?>">
                        <?= icon('phone') ?>
                        <span><span class="contact-list__label">Phone (alt)</span><?= e($clinic['phone_alt']) ?></span>
                    </a>
                </div>

                <a class="btn btn--gold btn--block"
                   href="<?= e($clinic['maps_link']) ?>"
                   target="_blank" rel="noopener">
                    <?= icon('pin') ?> Get Directions
                </a>
            </div>

            <iframe
                class="visit__map"
                src="<?= e(maps_url($clinic['maps_query'], true)) ?>"
                title="Map showing the location of <?= e($clinic['name']) ?>"
                loading="lazy"
                allowfullscreen></iframe>
        </div>

        <!--
            The walk, in order. Numbering is honest here because it IS a
            sequence — Ramaida is dozens of near-identical glass fronts and a
            first-time patient is looking for a stall number they have never
            seen. Photographs supplied by the clinic; sized by
            tools/make-landing-images.php.
        -->
        <!--
            ONE step at a time, not four thumbnails in a row.

            Four small photographs side by side ask the patient to compare
            them; the walk is a sequence, so the section now shows one large
            frame and moves through it. Every existing class name is kept
            (.wayfind, .wayfind__step, .wayfind__frame) and each figure still
            carries .reveal — only the wrapper, the arrows and the counter are
            new, so nothing that referenced this markup can break.

            The list still renders in full with JavaScript off: without
            .wayfind--live the steps simply stack, which is exactly what this
            section did before.
        -->
        <div class="wayfind" id="wayfind">
            <div class="wayfind__stage">
            <figure class="wayfind__step reveal">
                <span class="wayfind__frame">
                    <img src="images/way-1-building.jpg" alt="Ramaida Centrum seen from Elias Angeles Street" loading="lazy">
                </span>
                <figcaption><b>01</b><span>Look for the RAMAIDA Centrum sign on Elias Angeles Street.</span></figcaption>
            </figure>
            <!--
                Step 02 is the one that does the real work. Ramaida holds a
                dozen clinics and the arcade entrance is an unmarked gap
                between two shops, so her name on the facade is what tells a
                patient this is the right doorway before they commit to
                walking in.
            -->
            <figure class="wayfind__step reveal">
                <span class="wayfind__frame">
                    <img src="images/way-2-sign.jpg" alt="Dr. Gapit's signboard on the Ramaida Centrum frontage" loading="lazy">
                </span>
                <figcaption><b>02</b><span>Her name is on the signboard above the entrance, beside Mr. Joe.</span></figcaption>
            </figure>
            <figure class="wayfind__step reveal">
                <span class="wayfind__frame">
                    <img src="images/way-3-corridor.jpg" alt="The ground floor corridor inside Ramaida Centrum" loading="lazy">
                </span>
                <figcaption><b>03</b><span>Go in and keep straight along the ground-floor corridor.</span></figcaption>
            </figure>
            <figure class="wayfind__step reveal">
                <span class="wayfind__frame">
                    <img src="images/way-4-door.jpg" alt="The clinic frontage at Stall 104B" loading="lazy">
                </span>
                <figcaption><b>04</b><span>Stall 104B. The red lettering on the glass is hers.</span></figcaption>
            </figure>
            </div>

            <div class="wayfind__nav">
                <button type="button" class="wayfind__arrow" id="wayfind-prev"
                        onclick="wayfindStep(-1)" aria-controls="wayfind" aria-label="Previous step">
                    <?= icon('arrow-left') ?>
                </button>
                <!-- aria-live so a screen reader hears the step change, since
                     the picture itself conveys nothing to one. -->
                <p class="wayfind__count" id="wayfind-count" aria-live="polite">Step 1 of 4</p>
                <button type="button" class="wayfind__arrow" id="wayfind-next"
                        onclick="wayfindStep(1)" aria-controls="wayfind" aria-label="Next step">
                    <?= icon('arrow-right') ?>
                </button>
            </div>
        </div>
    </section>


    <!-- ═══════════════════════════════════════════════════════════════════
         6. HMO & PAYMENTS
         ═══════════════════════════════════════════════════════════════ -->

    <section id="hmo-payments" class="section">
        <div class="coverage-layout section-sweep section-sweep--from-right reveal">
        <div class="sec-head">
            <p class="eyebrow">HMO</p>
            <?php
            // Split across the two masks so this heading rises the same way as
            // every other one. The provider's own name takes the first line
            // when there is only one, because that name IS the answer a patient
            // came to this section for.
            [$hmoLine1, $hmoLine2] = count($hmo_providers) === 1
                ? [$hmo_providers[0]['name'], 'is accepted here']
                : ['Insurance', 'we accept'];
            ?>
            <h2 class="sec-head__title">
                <span class="sec-head__mask"><span class="sec-head__line"><?= e($hmoLine1) ?></span></span>
                <span class="sec-head__mask"><span class="sec-head__line"><?= e($hmoLine2) ?></span></span>
            </h2>
            <p class="sec-head__lead">
                Bring your card and a valid ID. Coverage is checked at the desk before treatment
                starts, never after.
            </p>
        </div>

        <?php foreach ($hmo_providers as $provider): ?>
            <div class="hmo">
                <span class="hmo__logo">
                    <?php if (!empty($provider['logo'])): ?>
                        <img src="<?= e($provider['logo']) ?>" alt="<?= e($provider['name']) ?> card" loading="lazy">
                    <?php else: ?>
                        <span class="hmo__mark"><?= e($provider['mark']) ?></span>
                    <?php endif; ?>
                </span>
                <div class="hmo__body">
                    <h3 class="hmo__name"><?= e($provider['name']) ?></h3>
                    <p class="hmo__text">
                        Present your card and a valid ID at the front desk. If you carry a different
                        HMO, just ask. We will tell you honestly whether it is covered.
                    </p>
                </div>
            </div>
        <?php endforeach; ?>
        </div>
    </section>


    <!-- ═══════════════════════════════════════════════════════════════════
         6b. WAYS TO PAY — "the desk light"
         ═══════════════════════════════════════════════════════════════ -->
    <!--
        In the clinic, the gold tooth mark glows on the marble wall under a
        warm spotlight, right above the desk where patients pay. This band is
        that: her marble, with one warm light swaying slowly across it.

        Its own full-width band so the light can run edge to edge. It has NO id
        on purpose: highlightCurrentNav() only tracks sections that own a nav
        link, so "HMO & payments" stays highlighted while a patient reads this
        part, which is exactly what it is.

        Everything here reads with JavaScript off. The rising heading lines and
        the rolling card names are enhancements; the light layers are hidden
        from screen readers.
    -->
    <section class="pay-stage" aria-labelledby="pay-stage-title">
        <div class="pay-stage__light" aria-hidden="true"><div class="pay-stage__stone"></div></div>

        <div class="pay-stage__inner section-sweep section-sweep--from-left reveal">
        <!-- Same component as every other section header now. pay-stage__head
             is kept alongside it only for the marble pool behind the words,
             which is specific to this section's background and nothing else. -->
        <div class="sec-head pay-stage__head">
            <p class="eyebrow">Ways to pay</p>
            <h2 class="sec-head__title" id="pay-stage-title">
                <span class="sec-head__mask"><span class="sec-head__line">Settled at</span></span>
                <span class="sec-head__mask"><span class="sec-head__line">the front desk.</span></span>
            </h2>
            <p class="sec-head__lead">Three ways to pay, each one confirmed with our staff at the desk.</p>
        </div>

        <ul class="pay" aria-label="Ways to pay">
            <?php foreach ($payment_methods as $method): ?>
                <li class="pay__item">
                    <span class="pay__media<?= !empty($method['photo']) ? ' pay__media--photo' : '' ?>">
                        <?php if (!empty($method['logo'])): ?>
                            <img src="<?= e($method['logo']) ?>" alt="<?= e($method['name']) ?>" loading="lazy">
                        <?php else: ?>
                            <span class="pay__mark"><?= e($method['mark']) ?></span>
                        <?php endif; ?>
                    </span>
                    <span class="pay__body">
                        <b class="pay__name"><?= e($method['name']) ?></b>
                        <span class="pay__note"><?= e($method['note']) ?></span>
                    </span>
                </li>
            <?php endforeach; ?>
        </ul>

        <!--
            This paragraph is not optional. A patient who sees the GCash and BDO
            marks will reasonably assume the site takes payment. It does not —
            staff collect it and record it. A previous commit removed the same
            implication once already; do not let it back in.
        -->
        <p class="pay__truth">
            <?= icon('info') ?>
            <span>
                <strong>Payment happens at the clinic, not on this website.</strong>
                GCash, InstaPay and BDO are ways to send the money. Our staff confirm it at
                the desk and issue your receipt. Nothing is charged online.
            </span>
        </p>
        </div>
    </section>


    <!-- ═══════════════════════════════════════════════════════════════════
         7. MOBILE APP — the visit continues in your pocket
         ═══════════════════════════════════════════════════════════════ -->
    <section id="download-app" class="app-showcase" aria-labelledby="app-showcase-title">
        <div class="app-showcase__wordmark" aria-hidden="true">DentCare</div>

        <div class="app-showcase__inner section-sweep section-sweep--from-right reveal">
            <div class="app-showcase__story">
                <div class="app-showcase__brand">
                    <img src="images/logo-160.png" alt="" width="52" height="52" loading="lazy">
                    <span><strong>Dent<span>Care</span></strong><small>THE MOBILE EXPERIENCE</small></span>
                </div>
                <p class="app-showcase__eyebrow"><span class="app-showcase__eyebrow-line"></span> Care beyond the clinic</p>
                <h2 class="app-showcase__title" id="app-showcase-title">Your care,<br><span>in your pocket.</span></h2>
                <p class="app-showcase__intro">A visit starts at the clinic. The little things that follow can travel with you. Meet the DentCare app, a simpler way to stay connected to your smile.</p>

                <div class="app-showcase__chapters" aria-label="App highlights">
                    <button type="button" class="app-showcase__chapter is-current" data-app-preview="visit" aria-pressed="true"><span>01</span><span>Plan your next visit</span><?= icon('arrow-right') ?></button>
                    <button type="button" class="app-showcase__chapter" data-app-preview="upcoming" aria-pressed="false"><span>02</span><span>Know what comes next</span><?= icon('arrow-right') ?></button>
                    <button type="button" class="app-showcase__chapter" data-app-preview="care" aria-pressed="false"><span>03</span><span>Keep care close</span><?= icon('arrow-right') ?></button>
                </div>
                <p class="visually-hidden" id="app-preview-live" aria-live="polite">Preview: Plan your next visit.</p>

                <div class="app-showcase__download">
                    <div class="app-showcase__qr<?= !empty($mobile_app['qr_image']) && !empty($mobile_app['download_url']) ? ' app-showcase__qr--ready' : '' ?>">
                        <?php if (!empty($mobile_app['qr_image']) && !empty($mobile_app['download_url'])): ?>
                            <img src="<?= e($mobile_app['qr_image']) ?>" alt="QR code to download the DentCare mobile app" loading="lazy" width="124" height="124">
                        <?php else: ?>
                            <span class="app-showcase__qr-corner app-showcase__qr-corner--tl"></span>
                            <span class="app-showcase__qr-corner app-showcase__qr-corner--tr"></span>
                            <span class="app-showcase__qr-corner app-showcase__qr-corner--bl"></span>
                            <span class="app-showcase__qr-center">QR<br>soon</span>
                        <?php endif; ?>
                    </div>
                    <div class="app-showcase__download-copy">
                        <span class="app-showcase__download-label"><?= e($mobile_app['platform']) ?> app</span>
                        <?php if (!empty($mobile_app['download_url'])): ?>
                            <p><?= !empty($mobile_app['qr_image']) ? 'Scan the code or open the download link on your phone.' : 'Open the download link on your phone. The QR code will follow.' ?></p>
                            <a class="app-showcase__download-link" href="<?= e($mobile_app['download_url']) ?>" target="_blank" rel="noopener noreferrer">Download the app <?= icon('arrow-right') ?></a>
                        <?php else: ?>
                            <p>The app download link and QR code will appear here when the app is ready.</p>
                            <span class="app-showcase__coming-soon">Coming soon</span>
                        <?php endif; ?>
                    </div>
                </div>
            </div>

            <div class="app-showcase__visual" role="img" aria-label="Concept preview of the DentCare mobile app">
                <span class="app-showcase__visual-caption app-showcase__visual-caption--top">DENTCARE / APP PREVIEW <span>01 / 03</span></span>
                <div class="app-showcase__phone-wrap">
                    <div class="app-showcase__phone">
                        <div class="app-showcase__phone-top"><span></span></div>
                        <div class="app-showcase__screen">
                            <div class="app-showcase__screen-head"><img src="images/logo-160.png" alt="" width="36" height="36" loading="lazy"><span>Dent<span>Care</span></span><span class="app-showcase__screen-dot"></span></div>
                            <p class="app-showcase__screen-kicker">HELLO FROM DENTCARE</p>
                            <p class="app-showcase__screen-title">A little more<br>room to smile.</p>
                            <div class="app-showcase__screen-card">
                                <span class="app-showcase__screen-card-label" id="app-preview-label">01 / APPOINTMENTS</span>
                                <strong id="app-preview-title">Make a visit.</strong>
                                <span id="app-preview-description">Choose a time that works for you.</span>
                                <i aria-hidden="true"><?= icon('arrow-right') ?></i>
                            </div>
                            <div class="app-showcase__screen-row"><span class="app-showcase__screen-row-icon"><?= icon('calendar') ?></span><span>Appointments<small>Make time for your smile</small></span><?= icon('arrow-right') ?></div>
                            <div class="app-showcase__screen-row"><span class="app-showcase__screen-row-icon"><?= icon('tooth') ?></span><span>My care<small>A place for your records</small></span><?= icon('arrow-right') ?></div>
                            <div class="app-showcase__screen-nav"><span>Home</span><span>Visits</span><span>Profile</span></div>
                        </div>
                    </div>
                </div>
                <span class="app-showcase__visual-caption app-showcase__visual-caption--bottom"><span>DESIGNED AROUND YOUR SMILE</span><span>SCROLL TO EXPLORE ↓</span></span>
            </div>
        </div>
    </section>


    <!-- ═══════════════════════════════════════════════════════════════════
         8. BOOK — the last thing on screen is the thing to do
         ═══════════════════════════════════════════════════════════════ -->

    <section class="closing">
        <div class="closing__inner reveal">
            <h2 class="closing__title">Book your visit</h2>
            <p class="closing__text">
                Choose a date and time that suits you. It takes about a minute. Or come to
                the desk and we will fit you into today&rsquo;s queue.
            </p>
            <div class="closing__actions">
                <button class="btn btn--gold btn--lg" onclick="openBookingPage('register')">
                    <?= icon('calendar') ?> Book a Visit
                </button>
                <button class="btn btn--glass btn--lg" onclick="startWalkInRegistration()">
                    I&rsquo;m Here Now
                </button>
            </div>
        </div>
    </section>


    <!-- ═══════════════════════════════════════════════════════════════════
         FOOTER
         ═══════════════════════════════════════════════════════════════ -->

    <footer class="footer">
        <div class="footer__grid">
            <div>
                <h4 class="footer__head">DentCare</h4>
                <p class="footer__text">
                    <?= e($clinic['name']) ?><br><?= e($clinic['address_line']) ?>,
                    <?= e($clinic['address_city']) ?>
                </p>
            </div>

            <div>
                <h4 class="footer__head">Explore</h4>
                <ul class="footer__links">
                    <?php foreach ($nav_links as $link): ?>
                        <li><a href="#<?= e($link['href']) ?>"
                               onclick="scrollToSection('<?= e($link['href']) ?>'); return false;"><?= e($link['label']) ?></a></li>
                    <?php endforeach; ?>
                    <li><a href="#" onclick="openBookingPage('login'); return false;">Login</a></li>
                    <?php if (privacy_feature_on()): ?>
                    <li><a href="privacy.php" target="_blank" rel="noopener">Privacy Policy</a></li>
                    <?php endif; ?>
                </ul>
            </div>

            <div>
                <h4 class="footer__head">Contact</h4>
                <ul class="footer__contact">
                    <li><?= icon('phone') ?><?= e($clinic['phone']) ?></li>
                    <li><?= icon('phone') ?><?= e($clinic['phone_alt']) ?></li>
                    <?php if (!empty($clinic['email'])): ?>
                    <li><?= icon('mail') ?><?= e($clinic['email']) ?></li>
                    <?php endif; ?>
                    <!-- Derived from $opening_hours, never retyped: this line used to be a
                         hardcoded "Mon–Sat, 9:00 AM – 6:00 PM" that contradicted the hours
                         card higher up the same page once the real hours arrived. -->
                    <li><?= icon('clock') ?><?= e($opening_hours[0]['day']) ?>, <?= e($opening_hours[0]['time']) ?></li>
                    <li>Strictly by Appointment</li>
                </ul>
            </div>
        </div>

        <div class="footer__bottom">
            <p>&copy; <?= date('Y') ?> <?= e($clinic['name']) ?>. All rights reserved.</p>
            <p>Stall 104B, Ramaida Centrum, Naga City</p>
        </div>
    </footer>

</div>
