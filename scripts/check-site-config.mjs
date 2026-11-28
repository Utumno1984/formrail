#!/usr/bin/env node
// Guard against publishing the stand-in values of scripts/site-config.mjs (ticket #490).
//
// Mechanism: this check runs ONLY where the site is published, never in PR builds. The `deploy-pages` job
// calls it first (before any build, so a mistake fails in seconds) and passes `--strict` to the assembler
// as a second line of defence. PR builds, `npm run check` and the visual job assemble the site with the
// placeholders and stay green. A pure function is used instead of an environment variable that an
// operator could forget to set: the default behaviour of the deploy job is to be strict.
import { fileURLToPath } from 'node:url';
import {
  DESIGN_PARTNER_URL,
  EARLY_ACCESS_URL,
  LICENSOR,
  PRIVACY_EMAIL,
  PURCHASE_RETENTION_YEARS,
} from './site-config.mjs';

const PLACEHOLDER = /placeholder|example\.(invalid|com|org|net)|\.invalid\b|\btodo\b|\bxxx+\b/i;
const EMAIL = /^[^\s@<>()"]+@[^\s@<>()"]+\.[^\s@<>()"]{2,}$/;

/**
 * @param {{ earlyAccessUrl: string, privacyEmail: string, designPartnerUrl?: string, purchaseRetentionYears?: string | number, licensor?: { name: string, status: string, country: string, email: string } }} config
 * @returns {string[]} one message per problem; empty when the config can be published
 */
export function findConfigProblems({ earlyAccessUrl, privacyEmail, designPartnerUrl = '', purchaseRetentionYears, licensor }) {
  const problems = [];
  if (earlyAccessUrl === '') problems.push('EARLY_ACCESS_URL is empty: the early access form link is missing.');
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
  // Empty = design partner section switched off (ticket #697): allowed, unlike the early access URL.
  if (designPartnerUrl !== '') {
    let url = null;
    try {
      url = new URL(designPartnerUrl);
    } catch {
      problems.push(`DESIGN_PARTNER_URL is not an absolute URL: ${designPartnerUrl}`);
    }
    if (url && url.protocol !== 'https:') problems.push('DESIGN_PARTNER_URL must be an https:// URL.');
    if (PLACEHOLDER.test(designPartnerUrl)) problems.push('DESIGN_PARTNER_URL is still a placeholder.');
    if (designPartnerUrl === earlyAccessUrl)
      problems.push('DESIGN_PARTNER_URL is the same as EARLY_ACCESS_URL: the two forms must be distinct.');
  }
  if (privacyEmail === '') problems.push('PRIVACY_EMAIL is empty.');
  else if (!EMAIL.test(privacyEmail)) problems.push(`PRIVACY_EMAIL is not an email address: ${privacyEmail}`);
  else if (PLACEHOLDER.test(privacyEmail)) problems.push('PRIVACY_EMAIL is still a placeholder.');
  // Ticket #691: who licenses Formrail Pro (printed in /license/). Callers that do not render that page omit it.
  if (licensor !== undefined) {
    for (const field of ['name', 'status', 'country', 'email']) {
      const value = licensor[field];
      if (typeof value !== 'string' || value.trim() === '')
        problems.push(`LICENSOR.${field} is empty: the license page needs it.`);
      else if (PLACEHOLDER.test(value)) problems.push(`LICENSOR.${field} is still a placeholder.`);
    }
    if (typeof licensor.email === 'string' && licensor.email.trim() !== '' && !EMAIL.test(licensor.email))
      problems.push(`LICENSOR.email is not an email address: ${licensor.email}`);
  }
  // Ticket #692: retention of the purchase data (decision D8), printed in /privacy/. Callers that do not render
  // that page omit it. It must be a whole number of years from 1 to 99.
  if (purchaseRetentionYears !== undefined && !/^[1-9]\d?$/.test(String(purchaseRetentionYears).trim()))
    problems.push(
      `PURCHASE_RETENTION_YEARS is not a whole number of years from 1 to 99: ${JSON.stringify(purchaseRetentionYears)}. It is decision D8 of the licensor and the privacy page needs it.`,
    );
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
      designPartnerUrl: DESIGN_PARTNER_URL,
      licensor: LICENSOR,
      purchaseRetentionYears: PURCHASE_RETENTION_YEARS,
    });
    console.log('site-config: values are final.');
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
