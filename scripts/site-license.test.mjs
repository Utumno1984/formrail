import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { assembleSite, renderLicensor } from './assemble-site.mjs';
import { assertConfigPublishable, findConfigProblems } from './check-site-config.mjs';
import { DESIGN_PARTNER_URL, EARLY_ACCESS_URL, LICENSOR, PRIVACY_EMAIL } from './site-config.mjs';

// License terms of Formrail Pro (ticket #691): the /license/ page and packages/pro/LICENSE carry one text.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirs = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function build(options) {
  const tmp = mkdtempSync(path.join(tmpdir(), 'assemble-license-'));
  dirs.push(tmp);
  const storybookDir = path.join(tmp, 'storybook-static');
  mkdirSync(storybookDir);
  writeFileSync(path.join(storybookDir, 'index.html'), '<!-- manager -->');
  const outDir = path.join(tmp, 'site');
  assembleSite({ storybookDir, outDir, ...options });
  const read = (file) => readFileSync(path.join(outDir, file), 'utf8');
  return {
    license: read('license/index.html'),
    home: read('index.html'),
    teams: read('teams/index.html'),
    privacy: read('privacy/index.html'),
    notFound: read('404.html'),
  };
}

const squash = (text) => text.replace(/\s+/g, ' ').trim();
const ENTITIES = { '&amp;': '&', '&quot;': '"', '&lt;': '<', '&gt;': '>' };

/** The text of the license section of the page: between the two markers, without markup. */
function pageText(html) {
  const match = html.match(/<!--LICENSE_TEXT_START-->([\s\S]*)<!--LICENSE_TEXT_END-->/);
  if (!match) throw new Error('The page has no LICENSE_TEXT_START/END markers.');
  return squash(
    match[1]
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<\/?(a|time)\b[^>]*>/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&(amp|quot|lt|gt);/g, (e) => ENTITIES[e]),
  );
}

const LICENSE_FILE = readFileSync(path.join(ROOT, 'packages', 'pro', 'LICENSE'), 'utf8');
const TITLES = [
  'Licensor',
  'Definitions',
  'Grant',
  'Term and updates',
  'After the term',
  'Evaluation and development use',
  'Production use',
  'Replacing a developer',
  'Restrictions',
  'Early access status',
  'Support',
  'Refunds',
  'Refund and termination',
  'Liability',
  'Governing law',
  'Changes to these terms',
];

describe('the license page', () => {
  it('has the sixteen sections, as h2, in order, and a dated "Last updated"', () => {
    const { license } = build();
    const h2 = [...license.matchAll(/<h2 [^>]*>([^<]+)<\/h2>/g)].map((m) => m[1]);
    expect(h2).toEqual(TITLES);
    expect(license.match(/<h1[ >]/g)).toHaveLength(1);
    expect(license).toMatch(/Last updated: <time datetime="\d{4}-\d{2}-\d{2}">[^<]+<\/time>/);
    expect(license).not.toContain('{{');
    expect(license).not.toContain('<script');
  });

  it('is the same text as packages/pro/LICENSE (one source: change a word in one and this fails)', () => {
    const { license } = build();
    expect(pageText(license)).toBe(squash(LICENSE_FILE));
  });

  it('the equality test is sensitive: a changed word in either side is caught', () => {
    const { license } = build();
    expect(pageText(license.replace('Support is given', 'Support was given'))).not.toBe(squash(LICENSE_FILE));
    expect(pageText(license)).not.toBe(squash(LICENSE_FILE.replace('14 days', '15 days')));
  });

  it('states every decided term, as sentences that fail the test when removed', () => {
    const text = squash(LICENSE_FILE);
    const phrases = [
      // grant: per developer, 12 months from the access to the registry, no automatic renewal
      'for one licensed developer',
      'You pay once.',
      'every version published during 12 months of updates',
      'The 12 months start on the day access to the registry is granted to you, not on the day of the purchase.',
      'The license does not renew automatically',
      // after the term: what was received stays usable, with no time limit; revoking access is not revoking the license
      'your right to use what you already have does not',
      'You may keep using every covered version, in development and in production, with no limit of time',
      'Ending the registry access is not a revocation of the license.',
      'Versions published after the end of your update period are not covered.',
      // evaluation and production
      'to evaluate it and to develop and test applications',
      'A license is required for production use.',
      // replacing a developer
      'you can replace them with another person',
      'The number of licensed developers does not change',
      'the license cannot be held by two people at the same time',
      // refund
      'within 14 days of the purchase, without giving a reason',
      'https://formrail.dev/refund/',
      // covered versions include the ones available when access is granted
      'any version of Formrail Pro that is available in the registry on the day access is granted to you, and any version that is published during your update period',
      // refund and termination
      'If you receive a refund, or the payment is reversed (a chargeback), the license and the registry access end, and you must stop using Formrail Pro and delete the copies you downloaded.',
      'A serious violation of the section Restrictions ends the license in the same way',
      'This applies to a license that has not ended under the section Refund and termination.',
      // package name
      'the package published on GitHub Packages as @formrail-dev/pro (installed with the npm alias @formrail/pro)',
      // install-only access
      'they may use a read-only access token of your team to install it, with no license of their own',
      'You may not share registry access or access tokens outside your own organization',
      'The read-only installation access described in the section Definitions is allowed.',
      // support, dates, status, distribution
      'on a best-effort basis',
      'within 2 business days',
      'No release date, roadmap item or feature is promised.',
      'Its versions are 0.x, and the API can change between versions',
      'GitHub Packages',
      'Formrail Pro does not check for a license at runtime and needs no key.',
      'Paddle',
      'Merchant of Record',
    ];
    for (const phrase of phrases) expect(text, phrase).toContain(phrase);
  });

  it('defines "developer" as who writes or modifies code importing the package; build, CI and end users do not count', () => {
    const text = squash(LICENSE_FILE);
    expect(text).toContain('Developer means a person who writes or modifies code that imports Formrail Pro.');
    expect(text).toContain('Build systems, continuous integration and the end users of your application are not developers');
  });

  it('the datetime of the page is the "Last updated" date of the LICENSE file', () => {
    const { license } = build();
    const iso = license.match(/<time datetime="(\d{4}-\d{2}-\d{2})">/)[1];
    const [y, m, d] = iso.split('-').map(Number);
    const human = `${d} ${new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })} ${y}`;
    expect(LICENSE_FILE).toContain(`Last updated: ${human}\n`);
  });

  it('the old package name and the old definition-versus-restriction contradiction are gone', () => {
    const text = squash(LICENSE_FILE);
    expect(text).not.toContain('published as @formrail/pro');
    expect(text).not.toContain('with people who are not licensed developers');
  });

  it('the Refunds section links the refund page (the page itself is another ticket)', () => {
    const { license } = build();
    expect(license).toContain('<a href="../refund/">https://formrail.dev/refund/</a>');
  });

  it('says nothing the product does not do, and promises no date', () => {
    const text = squash(LICENSE_FILE);
    for (const banned of ['TO BE DEFINED', 'license key', 'activation', 'phone home', 'auto-renew']) {
      expect(text.toLowerCase(), banned).not.toContain(banned.toLowerCase());
    }
    // The only date is the "Last updated" one.
    const withoutUpdated = text.replace(/Last updated: [^.]*?20\d\d/, '');
    expect(withoutUpdated).not.toMatch(/20\d\d/);
    expect(text).toMatch(/^Formrail Pro License Terms Last updated: /);
  });

  it('names no third-party product other than Paddle and GitHub Packages', () => {
    const text = squash(LICENSE_FILE).toLowerCase();
    for (const word of ['sap', 'fiori', 'ui5', 'salesforce', 'material', 'antd', 'ant design', 'microsoft', 'oracle', 'stripe', 'lemon']) {
      expect(new RegExp(`\\b${word}\\b`).test(text), word).toBe(false);
    }
    // No private project of the author is named in the public repository.
    expect(text).not.toContain('suite');
  });

  it('carries the licensor from the single constant: individual, Italy, contact; no address, no tax code', () => {
    expect(LICENSOR.name).toBe('Daniele Ingusci');
    expect(LICENSOR.country).toBe('Italy');
    expect(LICENSOR.email).toBe(PRIVACY_EMAIL);
    const { license } = build();
    const text = pageText(license);
    for (const value of Object.values(LICENSOR)) expect(text).toContain(value);
    expect(license).toContain(`<a href="mailto:${LICENSOR.email}">${LICENSOR.email}</a>`);
    expect(text).not.toMatch(/\b(via|viale|piazza|codice fiscale|tax code|VAT|P\.? ?IVA)\b/i);
    // A changed constant changes the page, and is escaped.
    const other = build({ licensor: { ...LICENSOR, name: 'A <b> & Co' } }).license;
    expect(other).toContain('A &lt;b&gt; &amp; Co');
  });

  it('has no script and the file carries no markup of the page', () => {
    expect(LICENSE_FILE).not.toMatch(/<[a-z/]|\{\{/);
    expect(LICENSE_FILE.startsWith('Formrail Pro License Terms')).toBe(true);
  });
});

describe('footers and links', () => {
  const SENTENCE = 'Formrail Pro: Annual license per developer, 12 months of updates included.';

  it('every page has the same footer license sentence, letter for letter, and a "License terms" link', () => {
    const { license, home, teams, privacy } = build();
    for (const html of [home, teams, privacy, license]) {
      expect(html).toContain(`<li>${SENTENCE}</li>`);
      expect(html).not.toContain('terms published before sales');
    }
    expect(home).toMatch(/<footer[\s\S]*<a href="license\/">License terms<\/a>[\s\S]*<\/footer>/);
    expect(teams).toMatch(/<footer[\s\S]*<a href="\.\.\/license\/">License terms<\/a>[\s\S]*<\/footer>/);
    expect(privacy).toMatch(/<footer[\s\S]*<a href="\.\.\/license\/">License terms<\/a>[\s\S]*<\/footer>/);
    expect(license).toMatch(/<footer[\s\S]*<a href="\.\/" aria-current="page">License terms<\/a>[\s\S]*<\/footer>/);
  });

  it('the 404 page links the license terms with the base path', () => {
    const { notFound } = build({ siteBase: '/some-repo/' });
    expect(notFound).toContain('<a href="/some-repo/license/">License terms</a>');
    expect(notFound).not.toContain('<script');
  });

  it('/teams/#license points at /license/ and keeps the "nothing can be bought yet" sentence', () => {
    const { teams } = build();
    const section = teams.match(/<section class="band" id="license"[\s\S]*?<\/section>/)[0];
    expect(section).toContain('<a href="../license/">license terms</a>');
    expect(squash(section)).toContain('Nothing can be bought yet: no payment or pre-order is taken.');
    expect(squash(section)).not.toContain('terms published before sales');
  });
});

describe('the licensor guard', () => {
  const FINAL = { earlyAccessUrl: EARLY_ACCESS_URL, privacyEmail: PRIVACY_EMAIL, designPartnerUrl: DESIGN_PARTNER_URL };

  it('the committed constant is publishable', () => {
    expect(findConfigProblems({ ...FINAL, licensor: LICENSOR })).toEqual([]);
  });

  it('an empty or placeholder field is refused, with a message that names the constant', () => {
    for (const field of ['name', 'status', 'country', 'email']) {
      const empty = findConfigProblems({ ...FINAL, licensor: { ...LICENSOR, [field]: '' } });
      expect(empty.join('\n')).toContain(`LICENSOR.${field} is empty`);
    }
    const placeholder = findConfigProblems({ ...FINAL, licensor: { ...LICENSOR, name: 'TODO name' } });
    expect(placeholder.join('\n')).toContain('LICENSOR.name is still a placeholder');
    const badEmail = findConfigProblems({ ...FINAL, licensor: { ...LICENSOR, email: 'not an email' } });
    expect(badEmail.join('\n')).toContain('LICENSOR.email is not an email address');
  });

  it('strict mode refuses the assembly; a PR build (not strict) stays green with the same value', () => {
    const licensor = { ...LICENSOR, name: '' };
    expect(() => assertConfigPublishable({ ...FINAL, licensor })).toThrow(/LICENSOR\.name/);
    const tmp = mkdtempSync(path.join(tmpdir(), 'assemble-license-strict-'));
    dirs.push(tmp);
    const storybookDir = path.join(tmp, 'storybook-static');
    mkdirSync(storybookDir);
    writeFileSync(path.join(storybookDir, 'index.html'), '<!-- manager -->');
    expect(() => assembleSite({ storybookDir, outDir: path.join(tmp, 'a'), licensor, strict: true })).toThrow(/LICENSOR\.name/);
    expect(() => assembleSite({ storybookDir, outDir: path.join(tmp, 'b'), licensor })).not.toThrow();
  });

  it('a caller that does not pass the licensor (an older call site) is not affected', () => {
    expect(findConfigProblems(FINAL)).toEqual([]);
  });

  it('renderLicensor fills every placeholder', () => {
    const html = '{{LICENSOR_NAME}}|{{LICENSOR_STATUS}}|{{LICENSOR_COUNTRY}}|{{LICENSOR_EMAIL}}|{{LICENSOR_EMAIL}}';
    expect(renderLicensor(html, { name: 'a', status: 'b', country: 'c', email: 'd@e.fr' })).toBe('a|b|c|d@e.fr|d@e.fr');
  });
});
