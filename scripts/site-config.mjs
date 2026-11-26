// Single source of the site base path (tickets #380, #667): the assembler, the local server and the
// smoke test all read it from here. The site is served from the root of the custom domain
// (https://formrail.dev/), so the base is `/` whatever GITHUB_REPOSITORY says (a fork does not get
// its own prefix by accident). A fork that publishes under a project-site URL (`https://<user>.<host>/<repo>/`) sets
// SITE_BASE=/<repo>/ explicitly; note that the story links of the Pro demo (`/teams/`) assume the root.
/** Origin of the published site: the single source for canonical URLs (`SITE_ORIGIN + SITE_BASE + path`). */
export const SITE_ORIGIN = 'https://formrail.dev';
export const SITE_DOMAIN = new URL(SITE_ORIGIN).host;

/**
 * Validates an explicit base path: it must already look like `/` or `/segment/…/`. A value that does not
 * (no leading or trailing slash, empty, `//`, `..`, spaces, `?`, `#`) fails with a clear message instead of
 * silently producing broken links.
 */
export function normalizeSiteBase(value) {
  if (!/^\/([A-Za-z0-9._~-]+\/)*$/.test(value) || /(^|\/)\.\.?\//.test(value)) {
    throw new Error(`SITE_BASE must start and end with "/" and contain plain path segments (e.g. "/" or "/my-repo/"), got: ${JSON.stringify(value)}`);
  }
  return value;
}

/** Path prefix of the published site, with leading and trailing slash. */
export const SITE_BASE = normalizeSiteBase(process.env.SITE_BASE ?? '/');

/** Port of the local server used by the pre-deploy smoke (override for parallel worktrees). */
export const SITE_PORT = Number(process.env.SITE_PORT) || 6008;

// Final values (ticket #490): the waitlist form URL and the privacy contact below were supplied by Daniele.
// `scripts/check-site-config.mjs` (run by the `deploy-pages` job, and by `assemble-site.mjs --strict`)
// still refuses to publish if any of them is ever replaced by a placeholder, an empty or a malformed value.

/**
 * Target of the "Request early access" call-to-action (tickets #382, #490): the waitlist form, a Tally
 * form (EU servers) created by Daniele, opened from an external link (never embedded). It asks for the email,
 * three qualification questions (team size, form libraries in use, timing) and ends with an unchecked
 * consent checkbox.
 *
 * Must be an absolute `https://` URL. Setting it to '' makes the assembler leave every CTA out of the
 * pages (never a link to `#` or a broken one); the strict guard rejects '' too.
 */
export const EARLY_ACCESS_URL = 'https://tally.so/r/vXepWQ';

/** Contact address of the data controller, printed on the privacy page (GDPR art. 13). */
export const PRIVACY_EMAIL = 'formrail.dev@gmail.com';

/**
 * The indicative price, shown on the Pro page for teams exactly as written (decision of 2026-11-13).
 * '' removes the price block: no figure and no currency then appear anywhere on the site.
 */
export const EXPECTED_PRICE_TEXT = 'Expected price: from \u20AC199 per developer/year';
