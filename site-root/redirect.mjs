// Pure redirect logic for the Pages root (ticket #380). The Storybook used to live at the site
// root; it now lives in `storybook/`, so the old deep links must keep landing on the same page.
//
// This file is the single source of truth: scripts/assemble-site.mjs inlines its source into
// `index.html` and `iframe.html` (no build step, no dependency, works with any static host), and
// the unit tests import it directly. Keep it free of imports and of anything but ES5-level syntax
// besides `export` (which the assembler strips).

/** Query parameters that only a Storybook URL carries; any of them marks a link to be forwarded. */
export const STORYBOOK_PARAMS = ['path', 'id', 'viewMode', 'args', 'globals'];

/**
 * Where an old root URL must go, or `null` when the page must stay where it is.
 *
 * @param {string} href the full URL of the page that is running the redirect
 * @param {'index' | 'iframe'} page which root file is running it: `index.html` (the site root, which
 *   used to be the Storybook manager) or `iframe.html` (the story renderer)
 * @returns {string | null} an absolute URL; the query and the hash are forwarded untouched
 */
export function resolveRedirect(href, page) {
  var url = new URL(href);
  // The directory the root files live in, whatever the prefix is (`/react-object-page/` on Pages,
  // `/` on a custom domain): strip the file name, keep the trailing slash.
  var base = url.pathname.replace(/[^/]*$/, '');
  // Already under `storybook/`: never prefix twice, never loop.
  if (/(^|\/)storybook\/$/.test(base)) return null;
  var target = url.origin + base + 'storybook/';

  if (page === 'iframe') {
    return target + 'iframe.html' + url.search + url.hash;
  }

  var isStorybookLink = STORYBOOK_PARAMS.some(function (name) {
    return url.searchParams.has(name);
  });
  // Bare root (or only foreign parameters such as `?utm_source=x`): the Storybook entry point,
  // without the foreign parameters, which the Storybook would only echo back in its own URL.
  return isStorybookLink ? target + url.search + url.hash : target;
}
