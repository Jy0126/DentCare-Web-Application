<?php
/**
 * DentCare — SVG Icon Sprite
 * ---------------------------------------------------------------------------
 * All icons used by the public site, defined once and referenced anywhere with:
 *
 *     <svg class="icon"><use href="#ic-NAME"></use></svg>
 *
 * Icons inherit the surrounding text colour (stroke: currentColor) and are
 * sized with CSS, so there is no need to edit this file to restyle them.
 *
 * To add an icon: add one <symbol> below with a unique id, using a 24x24
 * viewBox and stroke-based paths (no fill), matching the existing style.
 */
?>
<svg width="0" height="0" class="icon-sprite" aria-hidden="true" focusable="false">
    <defs>
        <!-- Brand & dental -->
        <symbol id="ic-tooth" viewBox="0 0 24 24"><path d="M12 3c-2.2 0-3.3 1.1-4.5 1.1C6.1 4.1 5 3.3 4 4c-1.3 1-1.2 3.4-.8 5.4.5 2.6 1.6 5.2 2.6 7.4.5 1.1 1 2.3 1.9 2.3.9 0 1.1-1.3 1.4-2.7.3-1.4.6-2.9 1.9-2.9s1.6 1.5 1.9 2.9c.3 1.4.5 2.7 1.4 2.7.9 0 1.4-1.2 1.9-2.3 1-2.2 2.1-4.8 2.6-7.4.4-2 .5-4.4-.8-5.4-1-.7-2.1.1-3.5.1C15.3 4.1 14.2 3 12 3Z"/></symbol>
        <symbol id="ic-sparkle" viewBox="0 0 24 24"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/></symbol>
        <symbol id="ic-align" viewBox="0 0 24 24"><path d="M2.5 12h19"/><rect x="4.5" y="8.5" width="4.5" height="7" rx="1.2"/><rect x="15" y="8.5" width="4.5" height="7" rx="1.2"/></symbol>
        <symbol id="ic-root" viewBox="0 0 24 24"><path d="M12 3c-2.2 0-3.3 1.1-4.5 1.1C6.1 4.1 5 3.3 4 4c-1.3 1-1.2 3.4-.8 5.4.5 2.6 1.6 5.2 2.6 7.4.5 1.1 1 2.3 1.9 2.3.9 0 1.1-1.3 1.4-2.7.3-1.4.6-2.9 1.9-2.9s1.6 1.5 1.9 2.9c.3 1.4.5 2.7 1.4 2.7.9 0 1.4-1.2 1.9-2.3 1-2.2 2.1-4.8 2.6-7.4.4-2 .5-4.4-.8-5.4-1-.7-2.1.1-3.5.1C15.3 4.1 14.2 3 12 3Z"/><path d="M12 8.5v7"/></symbol>
        <symbol id="ic-implant" viewBox="0 0 24 24"><path d="M12 2 5 6v3l7 3 7-3V6l-7-4Z"/><path d="M12 12v9M9 21h6M9 15h6M9 18h6"/></symbol>
        <symbol id="ic-child" viewBox="0 0 24 24"><circle cx="12" cy="9" r="5"/><path d="M9 9h.01M15 9h.01M9.5 12c.8.7 1.7 1 2.5 1s1.7-.3 2.5-1"/><path d="M7 19c0-3 2-5 5-5s5 2 5 5"/></symbol>
        <symbol id="ic-droplet" viewBox="0 0 24 24"><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z"/></symbol>
        <symbol id="ic-layers" viewBox="0 0 24 24"><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/></symbol>

        <!-- Contact & location -->
        <symbol id="ic-phone" viewBox="0 0 24 24"><path d="M6.6 10.8a15.9 15.9 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.4c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .8-.2 1L6.6 10.8Z"/></symbol>
        <symbol id="ic-mail" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 6.5 8 6.5 8-6.5"/></symbol>
        <symbol id="ic-pin" viewBox="0 0 24 24"><path d="M12 21s7-6.3 7-11.5A7 7 0 0 0 5 9.5C5 14.7 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/></symbol>
        <symbol id="ic-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></symbol>
        <symbol id="ic-calendar" viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/></symbol>

        <!-- Amenities -->
        <symbol id="ic-parking" viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M9 17V7h3.2a2.9 2.9 0 1 1 0 5.8H9"/></symbol>
        <symbol id="ic-access" viewBox="0 0 24 24"><circle cx="12" cy="4.5" r="1.8"/><path d="M9 21l2.2-7L9 10M15 21l-2-6.5M6.5 12h5.5l2 2h4"/></symbol>
        <symbol id="ic-wifi" viewBox="0 0 24 24"><path d="M2 8.5a15 15 0 0 1 20 0M5.5 12a10 10 0 0 1 13 0M9 15.5a5 5 0 0 1 6 0"/><circle cx="12" cy="19" r="1"/></symbol>

        <!-- Payments -->
        <symbol id="ic-cash" viewBox="0 0 24 24"><rect x="2.5" y="6.5" width="19" height="11" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M5.5 9v.01M18.5 15v.01"/></symbol>
        <symbol id="ic-wallet" viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 14.5h2"/></symbol>
        <symbol id="ic-bank" viewBox="0 0 24 24"><path d="M4 10.5 12 5l8 5.5M5 10.5V19M9 10.5V19M15 10.5V19M19 10.5V19M3.5 19h17"/></symbol>
        <symbol id="ic-card" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9.5h18M7 14.5h4"/></symbol>

        <!-- UI -->
        <symbol id="ic-menu" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></symbol>
        <symbol id="ic-close" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></symbol>
        <symbol id="ic-search" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m19.5 19.5-4.3-4.3"/></symbol>
        <symbol id="ic-key" viewBox="0 0 24 24"><circle cx="8" cy="15" r="4"/><path d="m11 12 8-8M16 5l2.5 2.5M13.5 7.5 16 10"/></symbol>
        <symbol id="ic-file" viewBox="0 0 24 24"><path d="M7 3h7l4 4v14H7Z"/><path d="M14 3v4h4M9.5 13h5M9.5 16.5h5"/></symbol>
        <symbol id="ic-shield" viewBox="0 0 24 24"><path d="M12 3 4.5 5.5v5.6c0 5 3.2 8.4 7.5 9.9 4.3-1.5 7.5-4.9 7.5-9.9V5.5L12 3Z"/><path d="m9 12 2 2 4-4"/></symbol>
        <symbol id="ic-alert" viewBox="0 0 24 24"><path d="M12 3.5 21.5 20h-19L12 3.5Z"/><path d="M12 10v4M12 17v.01"/></symbol>
        <symbol id="ic-arrow-right" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></symbol>
        <symbol id="ic-arrow-left" viewBox="0 0 24 24"><path d="M19 12H5M11 6l-6 6 6 6"/></symbol>

        <!-- Dashboard navigation & status -->
        <symbol id="ic-clipboard" viewBox="0 0 24 24"><path d="M9 4H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><rect x="9" y="2.5" width="6" height="3.5" rx="1"/><path d="M8.5 11h7M8.5 15h5"/></symbol>
        <symbol id="ic-notes" viewBox="0 0 24 24"><path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H14l5 5v11.5A1.5 1.5 0 0 1 17.5 21h-11A1.5 1.5 0 0 1 5 19.5Z"/><path d="M14 3v5h5M8.5 13h7M8.5 16.5h4.5"/></symbol>
        <symbol id="ic-bulb" viewBox="0 0 24 24"><path d="M9.5 18h5M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5.9 1.2.9 1.9V16h5.2v-.2c0-.7.3-1.4.9-1.9A6 6 0 0 0 12 3Z"/></symbol>
        <symbol id="ic-gear" viewBox="0 0 24 24"><path d="M3.5 7.5h8M17 7.5h3.5M3.5 16.5h3M12 16.5h8.5"/><circle cx="14" cy="7.5" r="2.5"/><circle cx="9" cy="16.5" r="2.5"/></symbol>
        <!-- Account Settings. The clinic asked for Font Awesome's sharp-duotone
             "user-gear"; that weight is Pro-only and this app loads no icon
             font, so the same shape is drawn here in the house style: a person
             with a small cog at the shoulder. -->
        <symbol id="ic-user-gear" viewBox="0 0 24 24"><circle cx="10" cy="7.5" r="3.5"/><path d="M3.5 20c0-3.6 2.9-6.5 6.5-6.5 1 0 1.9.2 2.7.6"/><circle cx="17.5" cy="17.5" r="2.4"/><path d="M17.5 13.4v1.3M17.5 20.3v1.3M21.6 17.5h-1.3M14.7 17.5h-1.3M20.4 14.6l-.9.9M15.5 19.5l-.9.9M20.4 20.4l-.9-.9M15.5 15.5l-.9-.9"/></symbol>
        <symbol id="ic-logout" viewBox="0 0 24 24"><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 16.5 5.5 12 10 7.5M5.5 12H16"/></symbol>
        <symbol id="ic-box" viewBox="0 0 24 24"><path d="M20.5 8 12 3.5 3.5 8v8L12 20.5 20.5 16Z"/><path d="M3.5 8 12 12.5 20.5 8M12 12.5v8"/></symbol>
        <symbol id="ic-trash" viewBox="0 0 24 24"><path d="M4.5 7h15M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 10.5v6M14 10.5v6"/></symbol>
        <symbol id="ic-edit" viewBox="0 0 24 24"><path d="M4 20h4l11-11a2.1 2.1 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></symbol>
        <symbol id="ic-check" viewBox="0 0 24 24"><path d="m4.5 12.5 5 5 10-11"/></symbol>
        <symbol id="ic-hourglass" viewBox="0 0 24 24"><path d="M6.5 3h11M6.5 21h11"/><path d="M7.5 3v3.2c0 1.6 3 3.4 3 5.8s-3 4.2-3 5.8V21M16.5 3v3.2c0 1.6-3 3.4-3 5.8s3 4.2 3 5.8V21"/></symbol>
        <symbol id="ic-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8v.01"/></symbol>
        <symbol id="ic-bell" viewBox="0 0 24 24"><path d="M18 8.5a6 6 0 0 0-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5Z"/><path d="M13.7 19a2 2 0 0 1-3.4 0"/></symbol>
        <symbol id="ic-more" viewBox="0 0 24 24"><path d="M5.5 12h.01M12 12h.01M18.5 12h.01" stroke-width="3.2"/></symbol>
        <symbol id="ic-copy" viewBox="0 0 24 24"><rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/></symbol>
        <symbol id="ic-undo" viewBox="0 0 24 24"><path d="M9 14 4.5 9.5 9 5"/><path d="M4.5 9.5H14a5.5 5.5 0 0 1 0 11h-3"/></symbol>
        <symbol id="ic-peso" viewBox="0 0 24 24"><path d="M7 20V4h5.5a4.5 4.5 0 0 1 0 9H7M5 8.5h11M5 12h11"/></symbol>


        <!-- Social (filled, not stroked) -->
        <symbol id="ic-facebook" viewBox="0 0 24 24"><path fill="currentColor" stroke="none" d="M24 12.07C24 5.44 18.63.07 12 .07S0 5.44 0 12.07c0 5.99 4.39 10.95 10.13 11.85v-8.38H7.08v-3.47h3.05V9.43c0-3.01 1.79-4.67 4.53-4.67 1.31 0 2.69.24 2.69.24v2.95h-1.51c-1.49 0-1.96.93-1.96 1.87v2.25h3.33l-.53 3.47h-2.8v8.38C19.61 23.02 24 18.06 24 12.07Z"/></symbol>
        <symbol id="ic-instagram" viewBox="0 0 24 24"><path fill="currentColor" stroke="none" d="M12 2.16c3.2 0 3.58.02 4.85.07 3.25.15 4.77 1.7 4.92 4.92.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.15 3.23-1.66 4.77-4.92 4.92-1.27.06-1.64.07-4.85.07s-3.58-.01-4.85-.07c-3.26-.15-4.77-1.7-4.92-4.92C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.15-3.23 1.66-4.77 4.92-4.92C8.42 2.18 8.8 2.16 12 2.16ZM12 0C8.74 0 8.33.01 7.05.07 2.7.27.27 2.69.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.2 4.36 2.62 6.78 6.98 6.98C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c4.35-.2 6.78-2.62 6.98-6.98.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.2-4.35-2.62-6.78-6.98-6.98C15.67.01 15.26 0 12 0Zm0 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.41-11.85a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88Z"/></symbol>
        <symbol id="ic-messenger" viewBox="0 0 24 24"><path fill="currentColor" stroke="none" d="M12 0C5.37 0 0 4.97 0 11.11c0 3.5 1.74 6.61 4.47 8.65V24l4.09-2.24c1.08.3 2.23.46 3.44.46 6.63 0 12-4.97 12-11.11C24 4.97 18.63 0 12 0Zm1.19 14.96-3.05-3.26-5.97 3.26 6.56-6.96 3.13 3.26 5.89-3.26-6.56 6.96Z"/></symbol>
    </defs>
</svg>
