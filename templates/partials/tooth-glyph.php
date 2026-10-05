<?php
/**
 * DentCare — One tooth, drawn the way the paper Dental Record Card draws it
 * ---------------------------------------------------------------------------
 * The card shows every tooth as a circle split into five surfaces:
 *
 *              Bu / La          outward face (cheek or lip side)
 *          D  (  O  )  M        distal · occlusal · mesial
 *              Li               tongue side
 *
 * Mesial means "towards the middle of the mouth", so which side it sits on
 * flips at the midline — and the card draws it that way. Teeth in quadrants 1
 * and 4 (the patient's right, printed on the left) have M on the right; teeth
 * in quadrants 2 and 3 have M on the left. Getting this backwards would put a
 * filling on the wrong side of the tooth.
 */

/**
 * ── WHY THIS TAKES A SCOPE ──────────────────────────────────────────────────
 *
 * The same chart is drawn in two places: the Dental Record Card tab, and the
 * visit form the doctor fills in when completing an appointment.
 *
 * Both are in the DOM at once. Without a scope both would emit id="tooth-11",
 * and getElementById returns the first match — so painting a tooth on the visit
 * form would silently paint the tab's chart instead, and the doctor would watch
 * their clicks do nothing.
 *
 * The scope also decides what a click MEANS, which differs between the two:
 *
 *   'chart'  the reference view. A click opens the tooth editor and the change
 *            is saved to Firestore on its own.
 *   'visit'  inside the completion form. A click marks the tooth for THIS
 *            visit and saves nothing — the whole form is written in one
 *            transaction on submit.
 *   'history' the Patient History record card. Read-only: it is the printed
 *            card on screen, not somewhere findings are entered.
 *
 * $interactive is what separates the third caller from the first two. A tooth
 * on the history card must not be clickable — that view exists to be read and
 * exported, and a doctor who edited a tooth there would expect it to save
 * somewhere. Dropping the handler is not enough on its own: the role and
 * tabindex go too, or the keyboard still offers it as a control and a screen
 * reader still announces a button that does nothing.
 *
 * @param int    $tooth        FDI number
 * @param string $arch         'upper' or 'lower' — decides which side the number sits
 * @param string $scope        'chart', 'visit' or 'history'
 * @param bool   $interactive  false renders the same tooth with no controls
 */
function render_card_tooth(int $tooth, string $arch, string $scope = 'chart', bool $interactive = true): void
{
    $quadrant = intdiv($tooth, 10);
    // Quadrants 1, 4, 5 and 8 are the patient's right side.
    $mesialOnRight = in_array($quadrant, [1, 4, 5, 8], true);

    $facial = (($tooth % 10) <= 3) ? 'La' : 'Bu';
    $left   = $mesialOnRight ? 'D' : 'M';
    $right  = $mesialOnRight ? 'M' : 'D';

    // Surface keys are stored in Firestore, so they must not change with layout.
    $leftKey  = $mesialOnRight ? 'distal' : 'mesial';
    $rightKey = $mesialOnRight ? 'mesial' : 'distal';

    // ── THE LOWER ARCH IS MIRRORED ──────────────────────────────────────
    //
    // The card meets the two rows at their LINGUAL edges: every Li faces the
    // middle of the chart and Bu/La face out. That is the drawing's meaning —
    // the upper arch is seen from below and the lower from above, so the
    // tongue side of both is the side nearest the centre.
    //
    // Until 2026-09-05 this file drew both rows identically, so on a lower
    // tooth the facial and lingual zones were swapped: decay recorded on the
    // tongue side of 41 was shown, and printed, on the lip side. The stored
    // surface KEYS were always right; only where they were drawn was wrong.
    $isLower  = in_array(intdiv($tooth, 10), [3, 4, 7, 8], true);
    $topKey    = $isLower ? 'lingual' : 'facial';
    $bottomKey = $isLower ? 'facial'  : 'lingual';
    $topLbl    = $isLower ? 'Li'      : $facial;
    $bottomLbl = $isLower ? $facial   : 'Li';

    $number = '<span class="ct__num">' . $tooth . '</span>';

    ob_start(); ?>
    <div class="ct<?= $interactive ? '' : ' ct--static' ?>" id="<?= $scope ?>-tooth-<?= $tooth ?>" data-tooth="<?= $tooth ?>"
         data-scope="<?= $scope ?>"
<?php if ($interactive): ?>
         role="button" tabindex="0"
         aria-label="Tooth <?= $tooth ?>"
         onclick="clickTooth('<?= $scope ?>', <?= $tooth ?>)"
         onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();clickTooth('<?= $scope ?>', <?= $tooth ?>);}"
<?php else: ?>
         aria-label="Tooth <?= $tooth ?>"
<?php endif; ?>
         >
        <svg viewBox="0 0 40 40" class="ct__svg" aria-hidden="true">
            <g class="ct__zones">
                <path class="ct__zone" data-surface="<?= $topKey ?>"
                      d="M15.4,15.4 L8.69,8.69 A16,16 0 0,1 31.31,8.69 L24.6,15.4 A6.5,6.5 0 0,0 15.4,15.4 Z"/>
                <path class="ct__zone" data-surface="<?= $rightKey ?>"
                      d="M24.6,15.4 L31.31,8.69 A16,16 0 0,1 31.31,31.31 L24.6,24.6 A6.5,6.5 0 0,0 24.6,15.4 Z"/>
                <path class="ct__zone" data-surface="<?= $bottomKey ?>"
                      d="M24.6,24.6 L31.31,31.31 A16,16 0 0,1 8.69,31.31 L15.4,24.6 A6.5,6.5 0 0,0 24.6,24.6 Z"/>
                <path class="ct__zone" data-surface="<?= $leftKey ?>"
                      d="M15.4,24.6 L8.69,31.31 A16,16 0 0,1 8.69,8.69 L15.4,15.4 A6.5,6.5 0 0,0 15.4,24.6 Z"/>
                <circle class="ct__zone" data-surface="occlusal" cx="20" cy="20" r="6.5"/>
            </g>
            <!-- The card prints O in the middle of every tooth. -->
            <text class="ct__o" x="20" y="20" text-anchor="middle" dominant-baseline="central">O</text>
        </svg>

        <!-- The card's letters, in the card's positions -->
        <span class="ct__lbl ct__lbl--top"><?= $topLbl ?></span>
        <span class="ct__lbl ct__lbl--left"><?= $left ?></span>
        <span class="ct__lbl ct__lbl--right"><?= $right ?></span>
        <span class="ct__lbl ct__lbl--bottom"><?= $bottomLbl ?></span>
    </div>
    <?php
    $tooth_html = ob_get_clean();

    // The card prints the upper row's numbers above the teeth and the lower
    // row's numbers below, so each column reads outward from the mouth.
    echo '<div class="ct-cell">'
        . ($arch === 'upper' ? $number . $tooth_html : $tooth_html . $number)
        . '</div>';
}
