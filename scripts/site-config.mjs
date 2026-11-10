// Single source of the Pages path prefix (ticket #380): the assembler, the local server and the
// smoke test all read it from here. On Pages the project site lives under `/<repo-name>/`.
const repo = (process.env.GITHUB_REPOSITORY || 'Utumno1984/react-object-page').split('/')[1];

/** Path prefix of the published site, with leading and trailing slash. */
export const SITE_BASE = `/${repo}/`;

/** Port of the local server used by the pre-deploy smoke (override for parallel worktrees). */
export const SITE_PORT = Number(process.env.SITE_PORT) || 6008;

/**
 * Target of the landing's "Request early access" call-to-action (ticket #382): an external form
 * (Tally or Google Forms) that Daniele creates with his own account.
 *
 * EMPTY ON PURPOSE until that URL exists: while it is empty the assembler leaves the whole CTA out of
 * the page (never a link to `#` or a broken one). When set it must be an absolute `https://` URL.
 */
export const EARLY_ACCESS_URL = '';
