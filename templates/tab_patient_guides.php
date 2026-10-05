<?php
/**
 * DentCare — Patient tab: Oral Care Guides
 * ---------------------------------------------------------------------------
 * The patient-facing oral health education module.
 *
 * Content is adapted from research sourced to the ADA (MouthHealthy), CDC,
 * Cleveland Clinic and Colgate. It is general guidance and is labelled as
 * such at the top and the bottom of the page — see the note on the disclaimer
 * below.
 *
 * ── ENTIRELY STATIC ──────────────────────────────────────────────────────
 * The content is the same for every patient, so this tab is plain markup with
 * no JavaScript behind it at all.
 *
 * It used to hold two personalised panels — reminder settings and a toothbrush
 * tracker — which were removed on 2026-08-30 when those features moved to the
 * Flutter mobile app. Nothing on this tab is rendered dynamically any more,
 * and js/app.js no longer hooks it on open.
 *
 * The one dynamic oral-care element left in the patient dashboard is the flash
 * tip banner, which is inserted above the tabs by js/oral-care.js and is not
 * part of this file.
 *
 * The six numbered cards at the foot are Dr. Gapit's own clinic guidance and
 * predate this module. They are kept exactly as they were: they cover
 * post-extraction and braces care, which the general research does not, and
 * they are the clinic's own voice rather than a citation.
 *
 * ── REDESIGNED 2026-09-09 ────────────────────────────────────────────────
 * Photographed guide images live in images/oral-care/. Two facts were
 * added alongside the redesign, both ADA-sourced: how much toothpaste to use
 * by age (under "Product Guides"), and a new "Know your gums" section — the
 * module covered technique but never told a patient what's normal versus an
 * early warning sign, which is a real gap for a page that already talks about
 * gum health at the gumline. See css/oral-care.css for the styling notes.
 */
?>
<!-- Patient Tab: Oral Care Guides -->
<div id="tab-patient-guides" class="tab-content hidden">
    <div class="card-header">
        <h2>Oral Health Care Guidelines</h2>
    </div>

    <!--
        The disclaimer leads. A patient who reads nothing else on this screen
        should still have met the line that says this is general guidance —
        which is why it sits above the content rather than under it.
    -->
    <p class="oc-disclaimer">
        <?= icon('info') ?>
        <span><strong>General oral care guidance.</strong> Always follow your dentist's personal recommendations.</span>
    </p>

<?php
/*
 * REMOVED 2026-08-30: the Daily Reminders panel and the Toothbrush
 * Replacement tracker. Both moved to the Flutter mobile app.
 *
 * A brushing reminder has to reach a patient who is not looking at anything.
 * The web module could only fire one while the portal sat open in a browser
 * tab, which is not when anybody brushes their teeth. The phone can do it
 * properly; this could not.
 *
 * What stays is the reference material — the routine, the techniques, the
 * product guidance and Dr. Gapit's own clinic notes — which is what somebody
 * opens a web page to read in the first place.
 *
 * Do not re-add reminder UI here without deciding what happens when the mobile
 * app is also reminding them. Two apps nagging about the same 6am brush is how
 * a patient turns both of them off.
 *
 * A PHP comment, not an HTML one, so this note stays with the source instead
 * of being served to every patient who opens the page.
 */
?>

    <!-- ───────────────────────────────────────────────────────────────────
         1. Daily order of operations
         ─────────────────────────────────────────────────────────────────── -->
    <div class="card">
        <h3>Your Daily Order of Operations</h3>
        <p class="oc-section__lede">
            Dentists broadly agree on the sequence below, because each step sets up
            the next one.
        </p>

        <div class="oc-order-figure">
            <img src="images/oral-care/daily-order-operation.jpg" alt="">
        </div>

        <!-- Three cards joined by arrows: the order IS the content, so the numbers
             stay. js/oral-care.js reveals them in sequence (armOrderReveal). -->
        <div class="oc-order">
            <div class="oc-order__step">
                <span class="oc-order__num" aria-hidden="true">1</span>
                <span class="oc-order__name"><span class="visually-hidden">Step 1: </span>Floss</span>
                <p class="oc-order__why">
                    Loosens food and plaque trapped between teeth and under the gumline,
                    the places a toothbrush cannot reach properly.
                </p>
            </div>

            <div class="oc-order__arrow" aria-hidden="true"><?= icon('arrow-right') ?></div>

            <div class="oc-order__step">
                <span class="oc-order__num" aria-hidden="true">2</span>
                <span class="oc-order__name"><span class="visually-hidden">Step 2: </span>Brush</span>
                <p class="oc-order__why">
                    Clears what flossing dislodged, and lets fluoride toothpaste reach
                    the surfaces between your teeth as well as all the rest.
                </p>
            </div>

            <div class="oc-order__arrow" aria-hidden="true"><?= icon('arrow-right') ?></div>

            <div class="oc-order__step">
                <span class="oc-order__num" aria-hidden="true">3</span>
                <span class="oc-order__name"><span class="visually-hidden">Step 3: </span>Mouthwash</span>
                <p class="oc-order__why">
                    Rinses away what is left, reaches soft tissue, and adds fluoride or
                    antibacterial protection depending on the product.
                </p>
            </div>
        </div>

        <!--
            This note is not filler. The ADA's own position is that all three
            happening daily matters more than the sequence, and a guide that
            only preached the ideal order would leave a patient who has always
            rinsed first believing they had been doing it wrong for years.
        -->
        <p class="oc-order-note">
            <strong>Don't stress about getting the order perfect.</strong>
            What matters most is that all three happen every day, done thoroughly.
            A routine you actually keep beats a perfect one you skip.
        </p>

        <div class="oc-section">
            <h4 class="oc-section__title">A typical day</h4>

            <!--
                Night is the full routine ("the thorough one") and gets a
                featured band; Morning and After-meals are genuinely short, so
                they share an even split underneath rather than being stretched
                to match — see the note in oral-care.css.
            -->
            <div class="oc-day-plan">
                <article class="oc-day-plan__feature">
                    <div class="oc-panel__figure">
                        <img src="images/oral-care/night-routine.jpg" alt="">
                    </div>
                    <div class="oc-panel__body">
                        <h5 class="oc-panel__title">Night, the thorough one</h5>
                        <p class="oc-panel__meta">Before bed</p>
                        <ol class="oc-steps">
                            <li><strong>Floss</strong> every tooth, including the back molars.</li>
                            <li><strong>Brush</strong> 2 minutes, all surfaces, plus your tongue.</li>
                            <li><strong>Mouthwash</strong> as the label instructs.</li>
                        </ol>
                    </div>
                </article>

                <div class="oc-day-plan__pair">
                    <article class="oc-panel">
                        <div class="oc-panel__figure">
                            <img src="images/oral-care/morning-routine.jpg" alt="">
                        </div>
                        <div class="oc-panel__body">
                            <h5 class="oc-panel__title">Morning</h5>
                            <p class="oc-panel__meta">First thing</p>
                            <ol class="oc-steps">
                                <li>Brush for <strong>2 minutes</strong>, soft-bristled brush, fluoride toothpaste.</li>
                                <li>Optional mouthwash, if you're not using it at night.</li>
                            </ol>
                        </div>
                    </article>

                    <article class="oc-panel">
                        <div class="oc-panel__figure">
                            <img src="images/oral-care/after-meals.jpg" alt="">
                        </div>
                        <div class="oc-panel__body">
                            <h5 class="oc-panel__title">After meals</h5>
                            <p class="oc-panel__meta">In between</p>
                            <ol class="oc-steps">
                                <li>If brushing isn't possible, rinse your mouth with plain water.</li>
                            </ol>
                        </div>
                    </article>
                </div>
            </div>
        </div>

        <div class="oc-section">
            <h4 class="oc-section__title">Timing details worth knowing</h4>
            <div class="oc-grid">
                <div class="oc-panel">
                    <div class="oc-panel__body">
                        <h5 class="oc-panel__title">Spit, don't rinse</h5>
                        <p class="oc-order__why">
                            After brushing, spit out the excess toothpaste but avoid rinsing
                            straight away with water. It leaves the fluoride in contact with
                            your enamel for longer.
                        </p>
                    </div>
                </div>

                <div class="oc-panel">
                    <div class="oc-panel__body">
                        <h5 class="oc-panel__title">Space out fluoride rinse</h5>
                        <p class="oc-order__why">
                            Using a fluoride mouthwash immediately after brushing can simply
                            rinse the toothpaste's fluoride away. Many dentists suggest waiting
                            about 30 minutes, or using it at a different time of day.
                        </p>
                    </div>
                </div>

                <div class="oc-panel">
                    <div class="oc-panel__body">
                        <h5 class="oc-panel__title">Check your label</h5>
                        <p class="oc-order__why">
                            Mouthwash formulations differ, and some specify their own timing,
                            before or after brushing. Where the label disagrees with a general
                            rule, follow the label.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- ───────────────────────────────────────────────────────────────────
         2. Brushing &amp; flossing technique
         ─────────────────────────────────────────────────────────────────── -->
    <div class="card">
        <h3>Brushing &amp; Flossing Technique</h3>
        <p class="oc-section__lede">
            Technique matters as much as frequency. The average person brushes for
            about 45 seconds, well short of the two minutes that actually clears
            plaque. Timing yourself once is usually a surprise.
        </p>

        <div class="oc-grid">
            <div class="oc-panel">
                <div class="oc-panel__figure">
                    <img src="images/oral-care/brushing-technique.jpg" alt="">
                </div>
                <div class="oc-panel__body">
                    <h5 class="oc-panel__title">How to brush</h5>
                    <p class="oc-panel__meta">Twice a day &middot; 2 minutes each time</p>
                    <ol class="oc-steps">
                        <li>Hold the brush at a <strong>45-degree angle</strong> to your gumline.</li>
                        <li>Use <strong>short, gentle back-and-forth strokes</strong>, about one tooth wide, not hard scrubbing.</li>
                        <li>Cover <strong>every surface</strong>: outer, inner, and the chewing surfaces.</li>
                        <li>For the inside of your front teeth, tilt the brush <strong>vertically</strong> and stroke up and down.</li>
                        <li>Finish with your <strong>tongue</strong>, bacteria there is behind most bad breath.</li>
                        <li>Keep the pressure <strong>gentle</strong>. Hard brushing wears enamel and injures gums.</li>
                    </ol>
                </div>
            </div>

            <div class="oc-panel">
                <div class="oc-panel__figure">
                    <img src="images/oral-care/flossing-technique.jpg" alt="">
                </div>
                <div class="oc-panel__body">
                    <h5 class="oc-panel__title">How to floss</h5>
                    <p class="oc-panel__meta">Once a day &middot; ideally at night</p>
                    <ol class="oc-steps">
                        <li>Break off about <strong>18 inches</strong> of floss.</li>
                        <li>Wind most around one middle finger, the rest around the other, leaving 1–2 inches to work with.</li>
                        <li>Hold it taut between your thumbs and index fingers.</li>
                        <li>Guide it between your teeth with a <strong>gentle rubbing motion</strong>, never snap or force it, which cuts and bruises gums.</li>
                        <li>Curve it into a <strong>C-shape</strong> against one tooth, slide just under the gumline, then move up and down.</li>
                        <li>Repeat against the neighbouring tooth before moving on.</li>
                        <li>Use a <strong>clean section</strong> for each gap.</li>
                        <li>Don't skip the <strong>back molars</strong>, the most commonly missed spot.</li>
                    </ol>
                </div>
            </div>
        </div>

        <div class="oc-section">
            <h4 class="oc-section__title">Why flossing is worth the two minutes</h4>
            <div class="oc-grid">
                <div class="oc-panel">
                    <div class="oc-panel__body">
                        <h5 class="oc-panel__title">Brushing alone misses a lot</h5>
                        <p class="oc-order__why">
                            A brush cannot reach the contact points between your teeth, which is
                            a substantial share of the total tooth surface. Around 1 in 5 adults
                            never floss at all, and gum disease is common in adults over 30,
                            flossing is one of the most effective ways to prevent it.
                        </p>
                    </div>
                </div>

                <div class="oc-panel">
                    <div class="oc-panel__body">
                        <h5 class="oc-panel__title">String floss isn't the only option</h5>
                        <p class="oc-order__why">
                            Floss picks, interdental brushes and water flossers are all acceptable
                            if they get the job done. The best tool is the one you will actually
                            use every day, if string floss is awkward for you, use something else
                            rather than skipping it.
                        </p>
                    </div>
                </div>
            </div>
        </div>

        <!-- ───────────────────────────────────────────────────────────────
             NEW 2026-09-09: gum health. The technique above only covers the
             gumline in passing; a patient reading this page has nowhere else
             on it that says what's a normal reaction to flossing more versus
             a sign worth mentioning at the next visit. Sourced to the ADA
             (MouthHealthy: Bleeding Gums).
             ─────────────────────────────────────────────────────────────── -->
        <div class="oc-section">
            <h4 class="oc-section__title">Know your gums</h4>
            <p class="oc-section__lede">
                Healthy gums are part of the technique above, not a separate routine.
                A little tenderness the first week you start flossing more often is
                normal; anything past that is worth mentioning at your next visit.
            </p>
            <div class="oc-grid">
                <article class="oc-panel">
                    <div class="oc-panel__figure">
                        <img src="images/oral-care/know-your-gums.jpg" alt="">
                    </div>
                    <div class="oc-panel__body">
                        <h5 class="oc-panel__title">What's normal</h5>
                        <ol class="oc-steps">
                            <li>Pale to coral-pink gums, firm against the tooth.</li>
                            <li>Very light bleeding for the first few days after you start flossing more, or after a deeper-than-usual clean.</li>
                        </ol>
                    </div>
                </article>

                <article class="oc-panel">
                    <div class="oc-panel__body">
                        <h5 class="oc-panel__title">Mention it to Dr. Gapit if you notice</h5>
                        <div class="oc-signs">
                            <div class="oc-signs__item">
                                <span class="oc-signs__num">01</span>
                                <div class="oc-signs__body">
                                    <span class="oc-signs__label">Regular bleeding</span>
                                    <p>Gums that bleed when you brush or floss, not just once or twice.</p>
                                </div>
                            </div>
                            <div class="oc-signs__item">
                                <span class="oc-signs__num">02</span>
                                <div class="oc-signs__body">
                                    <span class="oc-signs__label">Redness or swelling</span>
                                    <p>Tenderness around the gumline that doesn't settle down on its own.</p>
                                </div>
                            </div>
                            <div class="oc-signs__item">
                                <span class="oc-signs__num">03</span>
                                <div class="oc-signs__body">
                                    <span class="oc-signs__label">Pulling away</span>
                                    <p>Gums that look like they're receding, or teeth that feel loose.</p>
                                </div>
                            </div>
                        </div>
                        <p class="oc-panel-note">
                            <strong>The good news</strong>
                            These are the earliest signs of gingivitis, and it's fully reversible when caught early.
                        </p>
                    </div>
                </article>
            </div>
        </div>
    </div>

    <!-- ───────────────────────────────────────────────────────────────────
         3. Product guides
         ─────────────────────────────────────────────────────────────────── -->
    <div class="card">
        <h3>Product Guides</h3>
        <p class="oc-section__lede">
            What to look for when you are standing in the aisle deciding.
        </p>

        <div class="oc-grid">
            <div class="oc-panel">
                <div class="oc-panel__figure">
                    <img src="images/oral-care/product-guide.jpg" alt="">
                </div>
                <div class="oc-panel__body">
                    <h5 class="oc-panel__title">Toothbrush &amp; toothpaste</h5>
                    <ol class="oc-steps">
                        <li>Choose <strong>soft bristles</strong>. Medium and hard brushes wear enamel and injure gums.</li>
                        <li>Manual and electric are <strong>equally effective</strong> when used correctly, pick whichever you will use properly.</li>
                        <li>Replace it every <strong>3&ndash;4 months</strong>, or sooner if the bristles look frayed or matted.</li>
                        <li>Use a <strong>fluoride toothpaste</strong>. Alongside brushing frequency, it is the single most evidence-backed factor in preventing cavities.</li>
                        <li>Look for the <strong>ADA Seal of Acceptance</strong> on either.</li>
                    </ol>
                </div>
            </div>

            <!--
                NEW 2026-09-09: how much toothpaste to actually use. The guide
                covered frequency and technique but never the dose, and "how
                much toothpaste" is a genuinely common question — pea-sized for
                adults/children 3+ is the ADA's own guidance, and it matters
                for young children because of swallowed-fluoride exposure.
            -->
            <div class="oc-panel">
                <div class="oc-panel__figure">
                    <img src="images/oral-care/toothpaste-amount.jpg" alt="">
                </div>
                <div class="oc-panel__body">
                    <h5 class="oc-panel__title">How much toothpaste</h5>
                    <ol class="oc-steps">
                        <li>A <strong>pea-sized amount</strong> for adults and children 3 and up.</li>
                        <li>Children under 3 need only a <strong>rice-grain-sized smear</strong>.</li>
                    </ol>
                </div>
            </div>

            <div class="oc-panel">
                <div class="oc-panel__figure">
                    <img src="images/oral-care/product-guide-mouthwash.jpg" alt="">
                </div>
                <div class="oc-panel__body">
                    <h5 class="oc-panel__title">Mouthwash</h5>
                    <ol class="oc-steps">
                        <li>A <strong>supplement, not a replacement</strong>, for brushing and flossing.</li>
                        <li>Use the amount on the label, usually about <strong>10&ndash;20&nbsp;mL</strong>.</li>
                        <li>Swish for <strong>30 seconds to a minute</strong>, unless the label says otherwise.</li>
                        <li><strong>Don't swallow it.</strong></li>
                        <li>Go easy on alcohol-based rinses, heavy use can dry and irritate your mouth.</li>
                    </ol>
                </div>
            </div>
        </div>

        <div class="oc-section">
            <h4 class="oc-section__title">Which mouthwash is right for me?</h4>
            <p class="oc-section__lede">
                Mouthwash is a <strong>supplement, not a replacement</strong> for brushing and
                flossing. It freshens breath, reaches some places the other two miss, and,
                depending on the type, adds cavity or gum protection.
            </p>

            <div class="oc-table-wrap">
                <table class="oc-table">
                    <thead>
                        <tr>
                            <th>Type</th>
                            <th>Main purpose</th>
                            <th>Notes</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><span class="oc-table__dot oc-table__dot--fluoride"></span>Fluoride rinse</td>
                            <td>Cavity prevention, strengthens enamel</td>
                            <td>Good if you are prone to cavities</td>
                        </tr>
                        <tr>
                            <td><span class="oc-table__dot oc-table__dot--antimicrobial"></span>Antimicrobial</td>
                            <td>Reduces plaque and gingivitis</td>
                            <td>Often contains essential oils or CPC</td>
                        </tr>
                        <tr>
                            <td><span class="oc-table__dot oc-table__dot--cosmetic"></span>Cosmetic</td>
                            <td>Freshens breath only</td>
                            <td>Does not treat plaque or cavities</td>
                        </tr>
                        <tr>
                            <td><span class="oc-table__dot oc-table__dot--alcohol-free"></span>Alcohol-free</td>
                            <td>Gentler, less burning and dryness</td>
                            <td>Good if stinging puts you off rinsing</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <!-- ───────────────────────────────────────────────────────────────────
         The clinic's own guidance — pre-existing content, kept as it was
         ─────────────────────────────────────────────────────────────────── -->
    <div class="card">
        <h3>DentCare Dental Wellness Hub</h3>
        <p>Keeping your smile bright and healthy starts with good daily habits. Explore our clinical guides prepared by Dr. Reina G. Gapit.</p>

        <div class="guide-card-grid">

            <div class="guide-card">
                <div class="guide-card__figure">
                    <img src="images/oral-care/brushing-technique.jpg" alt="">
                </div>
                <div class="guide-card__body">
                    <span class="guide-number">01</span>
                    <span class="guide-title">Correct Brushing Method</span>
                    <span class="guide-desc">Brush twice daily for at least 2 minutes. Hold your toothbrush at a 45-degree angle pointing towards the gumline. Use gentle circular motions instead of scrubbing.</span>
                </div>
            </div>

            <div class="guide-card">
                <div class="guide-card__figure">
                    <img src="images/oral-care/flossing-technique.jpg" alt="">
                </div>
                <div class="guide-card__body">
                    <span class="guide-number">02</span>
                    <span class="guide-title">Daily Flossing Guide</span>
                    <span class="guide-desc">Flossing removes food particles and plaque between teeth where brush bristles can't reach. Curve the floss around each tooth in a C-shape and slide gently up and down.</span>
                </div>
            </div>

            <div class="guide-card">
                <div class="guide-card__figure">
                    <img src="images/oral-care/preventing-cavities.jpg" alt="">
                </div>
                <div class="guide-card__body">
                    <span class="guide-number">03</span>
                    <span class="guide-title">Preventing Cavities</span>
                    <span class="guide-desc">Limit sweet and acidic foods. Drink water after meals to help wash away acids. Choose toothpastes containing fluoride to strengthen enamel and fight tooth decay.</span>
                </div>
            </div>

            <div class="guide-card">
                <div class="guide-card__figure">
                    <img src="images/oral-care/post-extraction-care.jpg" alt="">
                </div>
                <div class="guide-card__body">
                    <span class="guide-number">04</span>
                    <span class="guide-title">Post-Extraction Care</span>
                    <span class="guide-desc">Bite down on the gauze pad for 30-45 minutes. Avoid spitting, smoking, or drinking through a straw for 24 hours. Stick to soft foods and rinse gently with warm salt water.</span>
                </div>
            </div>

            <div class="guide-card">
                <div class="guide-card__figure">
                    <img src="images/oral-care/braces-care.jpg" alt="">
                </div>
                <div class="guide-card__body">
                    <span class="guide-number">05</span>
                    <span class="guide-title">Braces &amp; Aligners Care</span>
                    <span class="guide-desc">Clean brackets and wires carefully with an interdental brush. Avoid sticky, hard, or crunchy foods like gum, nuts, and corn chips that can break brackets or wires.</span>
                </div>
            </div>

            <div class="guide-card">
                <div class="guide-card__figure">
                    <img src="images/oral-care/regular-checkups.jpg" alt="">
                </div>
                <div class="guide-card__body">
                    <span class="guide-number">06</span>
                    <span class="guide-title">Regular Dental Checkups</span>
                    <span class="guide-desc">Visit Dr. Reina Gapit every 6 months for a regular checkup and professional oral prophylaxis (cleaning) to prevent major dental issues.</span>
                </div>
            </div>

        </div>
    </div>

    <p class="oc-disclaimer oc-disclaimer--foot">
        <?= icon('info') ?>
        <span><strong>General oral care guidance.</strong> Always follow your dentist's personal recommendations.</span>
    </p>
</div>
