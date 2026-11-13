// Single source of the Pages path prefix (ticket #380): the assembler, the local server and the
// smoke test all read it from here. On Pages the project site lives under `/<repo-name>/`.
const repo = (process.env.GITHUB_REPOSITORY || 'Utumno1984/formrail').split('/')[1];

/** Path prefix of the published site, with leading and trailing slash. */
export const SITE_BASE = `/${repo}/`;

/** Port of the local server used by the pre-deploy smoke (override for parallel worktrees). */
export const SITE_PORT = Number(process.env.SITE_PORT) || 6008;

// Final values (ticket #490): the waitlist form URL and the privacy contact below were supplied by Daniele.
// `scripts/check-site-config.mjs` (run by the `deploy-pages` job, and by `assemble-site.mjs --strict`)
// still refuses to publish if any of them is ever replaced by a placeholder, an empty or a malformed value.

/**
 * Target of the "Request early access" call-to-action (tickets #382, #490): the waitlist form, a Tally
 * form (EU servers) created by Daniele, opened from an external link (never embedded). Its first field
 * is an unchecked consent checkbox and it asks three qualification questions (team size, form library
 * in use, timing).
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
