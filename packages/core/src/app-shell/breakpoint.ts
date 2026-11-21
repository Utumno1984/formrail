// Internal: the width that splits the app-shell components into "wide" and "narrow" layouts. Not exported from the
// package. The app shell (#640) puts its navigation beside the content from this width; the app switcher (#642)
// opens a Menu from this width and a Sheet below it. One value, so that the two always agree on the same screen.

/**
 * The breakpoint of the app shell: 64rem (1024px with the default font size). Desktop 1280 and landscape tablet
 * 1024 are "wide", portrait tablet 768 and phones are "narrow". A plain literal, for a `matchMedia` query (a class
 * built from it would not be seen by the CSS build).
 */
export const APP_SHELL_NAV_BREAKPOINT = '64rem';

/**
 * The media query that is true on a wide viewport (at or above {@link APP_SHELL_NAV_BREAKPOINT}). A plain literal,
 * not a template built from the constant: a module-level template literal is not dropped by the bundler, so it
 * would weigh on every import of the package. A unit test pins the two together.
 */
export const APP_SHELL_WIDE_QUERY = '(min-width: 64rem)';
