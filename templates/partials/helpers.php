<?php
/**
 * DentCare — Template Helper Functions
 * ---------------------------------------------------------------------------
 * Small, single-purpose helpers used by the public templates. Each one does
 * exactly one job so the templates stay readable.
 */

// ── Feature switches ────────────────────────────────────────────────────────
//
// X-RAY UPLOADS ARE OFF — decided 2026-09-13: the clinic stays on Firebase's
// free Spark plan, and Spark has no Cloud Storage bucket. Every upload would
// fail, so the upload panel, its shortcut button, the archiving notes and the
// Storage SDK are not shown or loaded at all rather than offered broken.
//
// To turn them on later: move the project to Blaze, create the bucket in
// production mode, run `firebase deploy --only storage`, and set this to true.
// js/clinic.js and js/backup.js keep the upload and archive code for that day.
if (!defined('DENTCARE_XRAY_UPLOADS')) {
    define('DENTCARE_XRAY_UPLOADS', false);
}

// ── The Privacy Policy (2026-10-03, client revision 22) ─────────────────────
//
// privacy.php, and the "I agree to the Privacy Policy" box at login,
// registration, Create online account and Collect consent signature.
//
// READY FOR THE LIVE SITE since 2026-10-05 (version 1.0): the owner asked for
// a short, plain policy with no legal-review markers, questions going to
// Dr. Gapit. With PRIVACY_POLICY_APPROVED true the static build for
// dentcare.site (tools/build-static.php) includes the page, its links and the
// tick boxes, so the NEXT hosting deploy puts it live. firestore.rules already
// accepts privacyAccepted (published 2026-10-05).
//
// To change the words: edit privacy-policy-body.php, raise
// PRIVACY_POLICY_VERSION here AND in js/app.js, and set the date. Patients are
// then asked to agree again. The build refuses the page if a
// [NEEDS HUMAN CONFIRMATION] marker or a DRAFT banner comes back
// (privacy_publish_problems below). Set APPROVED to false to keep it off the
// live site again.
if (!defined('PRIVACY_POLICY_VERSION')) {
    define('PRIVACY_POLICY_VERSION', '1.0');
}
if (!defined('PRIVACY_POLICY_APPROVED')) {
    define('PRIVACY_POLICY_APPROVED', true);
}
if (!defined('PRIVACY_POLICY_APPROVED_ON')) {
    define('PRIVACY_POLICY_APPROVED_ON', '2026-10-05');
}

if (!function_exists('privacy_feature_on')) {
    /**
     * Whether this render shows the Privacy Policy page, links and boxes.
     * Always on XAMPP and in the fixtures; in the static build for
     * dentcare.site only once the policy is approved.
     */
    function privacy_feature_on(): bool
    {
        return PRIVACY_POLICY_APPROVED || !defined('DENTCARE_STATIC_BUILD');
    }
}

if (!function_exists('privacy_policy_body')) {
    /** The policy's sections as HTML (templates/partials/privacy-policy-body.php). */
    function privacy_policy_body(): string
    {
        static $html = null;
        if ($html === null) {
            // The clinic's details, as the page itself has them. Loaded into
            // the GLOBAL scope when nothing has loaded them yet: the landing
            // template takes them with require_once, which would otherwise
            // find the file already loaded here and leave $clinic undefined
            // for the rest of the page.
            if (!isset($GLOBALS['clinic'])) {
                (function () {
                    require_once __DIR__ . '/clinic-data.php';
                    foreach (get_defined_vars() as $name => $value) {
                        $GLOBALS[$name] = $value;
                    }
                })();
            }
            ob_start();
            include __DIR__ . '/privacy-policy-body.php';
            $html = ob_get_clean();
        }
        return $html;
    }
}

if (!function_exists('privacy_text_hash')) {
    /**
     * SHA-256 of the policy's words: the tags stripped, entities decoded and
     * white space collapsed, so re-indenting the file does not change it but
     * changing a word does. Saved with every agreement as textHash, so the
     * clinic can show exactly which text a patient agreed to.
     */
    function privacy_text_hash(): string
    {
        $text = html_entity_decode(strip_tags(privacy_policy_body()), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = trim(preg_replace('/\s+/u', ' ', $text));
        return hash('sha256', $text);
    }
}

if (!function_exists('privacy_publish_problems')) {
    /**
     * What stops a rendered privacy page from going live: the DRAFT banner,
     * or any fact still waiting for a person to confirm it. Empty means none.
     */
    function privacy_publish_problems(string $html): array
    {
        $problems = [];
        if (strpos($html, 'privacy-draft-banner') !== false || stripos($html, 'Not yet in force') !== false) {
            $problems[] = 'the DRAFT banner is still on the page';
        }
        $markers = substr_count($html, '[NEEDS HUMAN CONFIRMATION');
        if ($markers > 0) {
            $problems[] = $markers . ' [NEEDS HUMAN CONFIRMATION] marker(s) are still on the page';
        }
        if (strpos(PRIVACY_POLICY_VERSION, 'draft') !== false) {
            $problems[] = 'the version is still a draft (' . PRIVACY_POLICY_VERSION . ')';
        }
        return $problems;
    }
}

if (!function_exists('privacy_agree_box')) {
    /**
     * "I agree to the Privacy Policy": never ticked to begin with, and the
     * words "Privacy Policy" open the page in a new tab, so nothing typed in
     * the form is lost. Prints nothing when the feature is off, and the
     * scripts then behave exactly as before (js/app.js privacyBoxState).
     *
     * @param string $id       the checkbox id
     * @param string $onchange optional JavaScript to run when it changes
     */
    function privacy_agree_box(string $id, string $onchange = ''): string
    {
        if (!privacy_feature_on()) {
            return '';
        }
        $id = e($id);
        $change = $onchange !== '' ? ' onchange="' . e($onchange) . '"' : '';
        return '<div class="privacy-agree" id="' . $id . '-row">'
             . '<input type="checkbox" id="' . $id . '"' . $change . '>'
             . '<label for="' . $id . '">I agree to the '
             . '<a href="privacy.php" target="_blank" rel="noopener">Privacy Policy</a></label>'
             . '</div>';
    }
}

if (!function_exists('password_toggle')) {
    /**
     * The eye button that shows or hides what was typed in a password box.
     *
     * Added 2026-09-17: the login and registration boxes had one, and the four
     * password boxes on Account Settings did not, so the one screen where
     * somebody types a NEW password twice was the one where they could not
     * check it. Wrap the input and this button in
     * <div class="password-input-container">. The click is handled by
     * togglePasswordVisibility() in js/auth.js, which every page loads.
     *
     * @param  string $inputId  the id of the password input it controls
     * @return string
     */
    function password_toggle(string $inputId): string
    {
        $id = e($inputId);
        return '<button type="button" class="password-toggle-btn"'
             . ' onclick="togglePasswordVisibility(\'' . $id . '\', this)"'
             . ' aria-controls="' . $id . '" aria-pressed="false"'
             . ' aria-label="Show password">'
             . '<svg class="eye-icon" viewBox="0 0 24 24" width="20" height="20" fill="none"'
             . ' stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
             . ' aria-hidden="true">'
             . '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>'
             . '<circle cx="12" cy="12" r="3"></circle>'
             . '</svg></button>';
    }
}

if (!function_exists('e')) {
    /**
     * Escape a value for safe output inside HTML.
     * Use this for every dynamic string printed into a template.
     *
     * @param  string|null $value
     * @return string
     */
    function e(?string $value): string
    {
        return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
    }
}

if (!function_exists('icon')) {
    /**
     * Render an icon from the sprite in templates/partials/icon-sprite.php.
     *
     * @param  string $name  Icon id without the "ic-" prefix, e.g. "phone".
     * @param  string $class Extra CSS class, e.g. "icon--lg".
     * @return string        Inline SVG markup.
     */
    function icon(string $name, string $class = ''): string
    {
        $css = trim('icon ' . $class);
        return '<svg class="' . e($css) . '" aria-hidden="true"><use href="#ic-' . e($name) . '"></use></svg>';
    }
}

if (!function_exists('tel_href')) {
    /**
     * A tel: link in international form, e.g. "0923-618-3285" -> "tel:+639236183285".
     *
     * Added 2026-09-13. The local 09xx form only dials from a Philippine SIM;
     * a patient on a foreign or roaming number could not call the clinic from
     * the page. Numbers already starting with + are left as they are.
     *
     * @param  string $phone  As printed, e.g. "0923-618-3285".
     * @return string         Escaped href value.
     */
    function tel_href(string $phone): string
    {
        $digits = preg_replace('/[^0-9+]/', '', $phone);
        if (strpos($digits, '+') !== 0 && strpos($digits, '0') === 0) {
            $digits = '+63' . substr($digits, 1);
        }
        return e('tel:' . $digits);
    }
}

if (!function_exists('maps_url')) {
    /**
     * Build a Google Maps link for a plain-text address query.
     *
     * @param  string $query  Address to search for.
     * @param  bool   $embed  True for an <iframe> src, false for a normal link.
     * @return string
     */
    function maps_url(string $query, bool $embed = false): string
    {
        $encoded = urlencode($query);
        return $embed
            ? "https://www.google.com/maps?q={$encoded}&output=embed"
            : "https://www.google.com/maps/search/?api=1&query={$encoded}";
    }
}
