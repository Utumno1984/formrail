// Internal: the width that splits the app-shell components into "wide" and "narrow" layouts. Not exported from the
// package. The app shell (#640) puts its navigation beside the content from this width; the app switcher (#642)
// opens a Menu from this width and a Sheet below it. One value, so that the two always agree on the same screen.

/**
 * The media query that is true on a wide viewport (at or above `APP_SHELL_NAV_BREAKPOINT`, the single source in app-shell-styles.ts). A plain literal,
 * not a template built from the constant: a module-level template literal is not dropped by the bundler, so it
 * would weigh on every import of the package. A unit test pins the two together.
 */
export const APP_SHELL_WIDE_QUERY = '(min-width: 64rem)';
