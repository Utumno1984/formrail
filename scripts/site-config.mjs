// Single source of the Pages path prefix (ticket #380): the assembler, the local server and the
// smoke test all read it from here. On Pages the project site lives under `/<repo-name>/`.
const repo = (process.env.GITHUB_REPOSITORY || 'Utumno1984/react-object-page').split('/')[1];

/** Path prefix of the published site, with leading and trailing slash. */
export const SITE_BASE = `/${repo}/`;

/** Port of the local server used by the pre-deploy smoke (override for parallel worktrees). */
export const SITE_PORT = Number(process.env.SITE_PORT) || 6008;
