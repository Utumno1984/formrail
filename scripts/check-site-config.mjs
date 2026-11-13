#!/usr/bin/env node
// Guard against publishing the stand-in values of scripts/site-config.mjs (ticket #490).
//
// Mechanism: this check runs ONLY where the site is published, never in PR builds. The `deploy-pages` job
// calls it first (before any build, so a mistake fails in seconds) and passes `--strict` to the assembler
// as a second line of defence. PR builds, `npm run check` and the visual job assemble the site with the
// placeholders and stay green. A pure function is used instead of an environment variable that an
// operator could forget to set: the default behaviour of the deploy job is to be strict.
import { fileURLToPath } from 'node:url';
import { EARLY_ACCESS_URL, PRIVACY_EMAIL } from './site-config.mjs';

const PLACEHOLDER = /placeholder|example\.(invalid|com|org|net)|\.invalid\b|\btodo\b|\bxxx+\b/i;
const EMAIL = /^[^\s@<>()"]+@[^\s@<>()"]+\.[^\s@<>()"]{2,}$/;

/**
 * @param {{ earlyAccessUrl: string, privacyEmail: string }} config
 * @returns {string[]} one message per problem; empty when the config can be published
 */
export function findConfigProblems({ earlyAccessUrl, privacyEmail }) {
  const problems = [];
  if (earlyAccessUrl === '') problems.push('EARLY_ACCESS_URL is empty: the waitlist form link is missing.');
  else {
    let url = null;
    try {
      url = new URL(earlyAccessUrl);
    } catch {
      problems.push(`EARLY_ACCESS_URL is not an absolute URL: ${earlyAccessUrl}`);
    }
    if (url && url.protocol !== 'https:') problems.push('EARLY_ACCESS_URL must be an https:// URL.');
    if (PLACEHOLDER.test(earlyAccessUrl)) problems.push('EARLY_ACCESS_URL is still a placeholder.');
  }
  if (privacyEmail === '') problems.push('PRIVACY_EMAIL is empty.');
  else if (!EMAIL.test(privacyEmail)) problems.push(`PRIVACY_EMAIL is not an email address: ${privacyEmail}`);
  else if (PLACEHOLDER.test(privacyEmail)) problems.push('PRIVACY_EMAIL is still a placeholder.');
  return problems;
}

/** Throws with every problem listed; used by the assembler in strict mode and by the CLI below. */
export function assertConfigPublishable(config) {
  const problems = findConfigProblems(config);
  if (problems.length > 0) {
    throw new Error(`scripts/site-config.mjs is not ready to publish:\n- ${problems.join('\n- ')}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    assertConfigPublishable({
      earlyAccessUrl: EARLY_ACCESS_URL,
      privacyEmail: PRIVACY_EMAIL,
    });
    console.log('site-config: values are final.');
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
