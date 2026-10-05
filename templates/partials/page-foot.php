<?php
/**
 * DentCare — Shared page footer
 * ---------------------------------------------------------------------------
 * The toast container and the script tags that every page needs.
 *
 * Set before including:
 *   $page_scripts  array  script filenames from js/, loaded in order after
 *                         app.js and auth.js (which both pages always need)
 */

if (!isset($page_scripts)) { $page_scripts = []; }
?>

    <div id="toast-container" class="toast-container"></div>

    <!-- app.js first: it initialises Firebase and defines showToast(), which
         everything below depends on. -->
    <script src="<?= asset('js/app.js') ?>"></script>
    <script src="<?= asset('js/auth.js') ?>"></script>
<?php foreach ($page_scripts as $script): ?>
    <script src="<?= asset('js/' . $script) ?>"></script>
<?php endforeach; ?>

</body>
</html>
