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

/**
 * Target of the "Apply as a design partner" link on /teams/ (ticket #697): the design partner application
 * form, a Tally form (EU servers) created by Daniele, SEPARATE from the waitlist form and opened from an
 * external link (never embedded). Its fields are listed one by one in site-root/privacy.html.
 *
 * Must be an absolute `https://` URL different from EARLY_ACCESS_URL. Setting it to '' switches the whole
 * design partner section off, on /teams/ and in the privacy notice (the strict guard accepts '').
 */
export const DESIGN_PARTNER_URL = 'https://tally.so/r/xVYjMo';

/**
 * Number of design partner seats (decision of 2026-11-26). 0 = seats exhausted: the section says so and
 * links to the waitlist instead of the form.
 */
export const DESIGN_PARTNER_SEATS = 3;
