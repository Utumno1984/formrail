import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { assembleSite, renderPurchaseTerms } from './assemble-site.mjs';
import { findConfigProblems } from './check-site-config.mjs';
import { LICENSOR, PRIVACY_EMAIL, PURCHASE_RETENTION_YEARS, REFUND_DAYS } from './site-config.mjs';

// Refund policy and purchase privacy (ticket #692): /refund/, the "Purchases" section of /privacy/ and their guards.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirs = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function build(options) {
  const tmp = mkdtempSync(path.join(tmpdir(), 'assemble-refund-'));
  dirs.push(tmp);
  const storybookDir = path.join(tmp, 'storybook-static');
  mkdirSync(storybookDir);
  writeFileSync(path.join(storybookDir, 'index.html'), '<!-- manager -->');
  const outDir = path.join(tmp, 'site');
  assembleSite({ storybookDir, outDir, ...options });
  const read = (file) => readFileSync(path.join(outDir, file), 'utf8');
  return {
    refund: read('refund/index.html'),
    privacy: read('privacy/index.html'),
    license: read('license/index.html'),
    teams: read('teams/index.html'),
    home: read('index.html'),
    notFound: read('404.html'),
  };
}

const ENTITIES = { '&amp;': '&', '&quot;': '"', '&lt;': '<', '&gt;': '>', '&ndash;': '-' };
/** Visible text of a piece of markup, on one line. */
const text = (html) =>
  html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(amp|quot|lt|gt|ndash);/g, (e) => ENTITIES[e])
    .replace(/\s+/g, ' ')
    .trim();
const h2 = (html) => [...html.matchAll(/<h2 [^>]*>([^<]+)<\/h2>/g)].map((m) => m[1]);
const hrefs = (html) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
const external = (html) => hrefs(html).filter((h) => /^https?:/.test(h));
const lastUpdated = (html) => html.match(/Last updated: <time datetime="(\d{4}-\d{2}-\d{2})">/)?.[1];
const ownRepo = (h) => h.startsWith('https://github.com/Utumno1984/formrail');

// The URLs the purchase pages may link to outside the site: official pages only.
const OFFICIAL_REFUND = ['https://paddle.net/', 'https://www.paddle.com/legal/buyer-terms'];
const OFFICIAL_PRIVACY = [
  'https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement',
  'https://tally.so/help/gdpr',
  'https://tally.so/help/privacy-policy',
  'https://www.paddle.com/legal/privacy',
];

describe('the refund page', () => {
  it('has one h1, the decided sections as h2, in order, and a dated "Last updated"', () => {
    const { refund } = build();
    expect(refund.match(/<h1[ >]/g)).toHaveLength(1);
    expect(text(refund.match(/<h1[^>]*>[\s\S]*?<\/h1>/)[0])).toBe('Refund policy');
    expect(refund).toContain('<title>Refund policy · Formrail</title>');
    expect(h2(refund)).toEqual([
      'Who can ask, and until when',
      'How to ask',
      'What happens to your access',
      'Consumers in the EU and the UK',
      'Who is behind the sale',
    ]);
    expect(lastUpdated(refund)).toBeDefined();
    expect(refund).not.toContain('{{');
    expect(refund).not.toContain('<script');
  });

  it('says 14 days, without a reason, for companies and consumers, from the single constant', () => {
    expect(REFUND_DAYS).toBe(14);
    const body = text(build().refund);
    expect(body).toContain(`within ${REFUND_DAYS} days of the purchase, without giving a reason`);
    expect(body).toContain('companies and consumers alike');
    // the 14th day is inside the term
    expect(body).toContain(`A request made on day ${REFUND_DAYS} after the purchase is still within the term.`);
    // the number is never typed into the page: change the constant and the page follows
    const changed = text(build({ refundDays: 30 }).refund);
    expect(changed).toContain('within 30 days of the purchase');
    expect(changed).not.toContain('14');
    expect(readFileSync(path.join(ROOT, 'site-root', 'refund.html'), 'utf8')).not.toMatch(/\b14\b/);
  });

  it('the license text says the same number of days', () => {
    const file = readFileSync(path.join(ROOT, 'packages', 'pro', 'LICENSE'), 'utf8').replace(/\s+/g, ' ');
    expect(file).toContain(`within ${REFUND_DAYS} days of the purchase, without giving a reason`);
    expect(text(build().license)).toContain(`within ${REFUND_DAYS} days of the purchase, without giving a reason`);
  });

  it('says how to ask: through Paddle (official link) or by email to the contact address', () => {
    const { refund } = build();
    const section = refund.slice(refund.indexOf('id="how-to-ask-title"'), refund.indexOf('id="access-title"'));
    expect(external(section)).toContain('https://paddle.net/');
    expect(section).toContain(`href="mailto:${LICENSOR.email}"`);
    expect(text(section)).toContain('You do not have to say why.');
    expect(LICENSOR.email).toBe(PRIVACY_EMAIL);
  });

  it('says the refund ends the license and the registry access, a chargeback counts the same, and links the license clause', () => {
    const { refund, license } = build();
    const section = text(refund.slice(refund.indexOf('id="access-title"'), refund.indexOf('id="consumers-title"')));
    expect(section).toContain('A refund ends the license and the access to the private registry');
    expect(section).toContain('payment is reversed (a chargeback): it is treated as a refund');
    expect(refund).toContain('href="../license/#refund-and-termination-title"');
    expect(license).toContain('id="refund-and-termination-title"'); // the anchor exists
    // same consequence as the clause of the license: coherence
    expect(text(license)).toContain(
      'the license and the registry access end, and you must stop using Formrail Pro and delete the copies you downloaded',
    );
    expect(section).toContain('You must stop using Formrail Pro and delete the copies you downloaded');
  });

  it("points consumers to Paddle's Buyer Terms and takes no right away, even after use", () => {
    const { refund } = build();
    const section = refund.slice(refund.indexOf('id="consumers-title"'), refund.indexOf('id="seller-title"'));
    expect(external(section)).toEqual(['https://www.paddle.com/legal/buyer-terms']);
    expect(text(section)).toContain('does not take away any right you have as a consumer');
    expect(text(section)).toContain('even if you have already started to use Formrail Pro');
  });

  it('links outside the site only to the official pages, with rel=noopener, and names only the contact address', () => {
    const { refund } = build();
    expect(external(refund).filter((h) => !ownRepo(h)).sort()).toEqual([...OFFICIAL_REFUND].sort());
    for (const m of refund.matchAll(/<a [^>]*href="https:\/\/(?:paddle\.net|www\.paddle\.com)[^"]*"[^>]*>/g)) {
      expect(m[0]).toContain('rel="noopener"');
    }
    const mails = [...refund.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g)].map((m) => m[0]);
    expect(new Set(mails)).toEqual(new Set([PRIVACY_EMAIL]));
  });

  it('names no private product and no third-party design system', () => {
    const body = text(build().refund).toLowerCase();
    for (const word of ['suite', 'sap', 'fiori', 'salesforce', 'microsoft']) {
      expect(body).not.toMatch(new RegExp(`\\b${word}\\b`));
    }
  });

  it('renderPurchaseTerms fills every placeholder, and escapes the retention value', () => {
    const filled = renderPurchaseTerms('{{REFUND_DAYS}}|{{RETENTION_YEARS}}|{{RETENTION_YEARS}}', {
      refundDays: 14,
      retentionYears: '7',
    });
    expect(filled).toBe('14|7|7');
    expect(renderPurchaseTerms('{{RETENTION_YEARS}}', { refundDays: 14, retentionYears: '<b>' })).not.toContain('<b>');
  });
});

describe('/refund/ is one click away from every page', () => {
  it('the footer of home, teams, privacy, license and the 404 link it; the refund page marks itself current', () => {
    const { home, teams, privacy, license, notFound, refund } = build();
    expect(home).toContain('<li><a href="refund/">Refund policy</a></li>');
    for (const page of [teams, privacy, license]) {
      expect(page).toContain('<li><a href="../refund/">Refund policy</a></li>');
    }
    expect(notFound).toContain('<a href="/refund/">Refund policy</a>');
    expect(refund).toContain('<li><a href="./" aria-current="page">Refund policy</a></li>');
    expect(refund).toContain('<li><a href="../license/">License terms</a></li>');
  });

  it('the footer of the article pages links it too', () => {
    for (const file of ['articles.html', 'article.html']) {
      const html = readFileSync(path.join(ROOT, 'site-root', file), 'utf8');
      expect(html, file).toMatch(/<li><a href="(\.\.\/)+refund\/">Refund policy<\/a><\/li>/);
    }
  });

  it('/license/ links it from its Refunds section', () => {
    expect(build().license).toContain('<a href="../refund/">https://formrail.dev/refund/</a>');
  });
});

describe('dates', () => {
  it('"Last updated" is the same on /license/, /refund/ and /privacy/', () => {
    const { license, refund, privacy } = build();
    const dates = [license, refund, privacy].map(lastUpdated);
    expect(dates.every(Boolean)).toBe(true);
    expect(new Set(dates).size).toBe(1);
  });
});

describe('the Purchases section of the privacy notice', () => {
  const purchases = (privacy) => privacy.slice(privacy.indexOf('id="purchases-title"'), privacy.indexOf('id="rights-title"'));

  it('is its own h2, with the h3 items in order, before "Your rights"', () => {
    const { privacy } = build();
    expect(h2(privacy)).toEqual([
      'Data controller',
      'Data we collect',
      'Purpose and legal basis',
      'Where the data goes',
      'Transfers outside the EEA',
      'Retention',
      'Design partner applications',
      'Purchases',
      'Your rights',
      'No cookies, no analytics',
    ]);
    const h3 = [...purchases(privacy).matchAll(/<h3 [^>]*>([^<]+)<\/h3>/g)].map((m) => m[1]);
    expect(h3).toEqual([
      'Data we receive',
      'Purpose and legal basis',
      'Paddle, GitHub and the mailbox',
      'Transfers outside the EEA',
      'Retention',
    ]);
  });

  it('lists the data received from Paddle one by one, and the GitHub user names', () => {
    const section = purchases(build().privacy);
    const list = section.slice(section.indexOf('id="purchase-data-title"'), section.indexOf('id="purchase-purpose-title"'));
    const items = [...list.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => text(m[1]));
    expect(items).toEqual([
      'your name;',
      'your email address;',
      'your company name;',
      'your country;',
      'the number of developers the license is for;',
      'the identifier of the transaction.',
    ]);
    expect(text(list)).toContain('GitHub user names that you give us');
    expect(text(list)).toContain('We do not receive your payment card or your bank details');
    expect(text(list)).toContain('(art. 13(2)(e) GDPR)');
  });

  it('states the purposes and the legal bases: contract art. 6(1)(b) and legal obligation art. 6(1)(c), no consent', () => {
    const section = text(purchases(build().privacy));
    expect(section).toContain('to deliver and manage the license');
    expect(section).toContain('to grant, check and end the access to the registry');
    expect(section).toContain('to comply with the legal obligations that apply to a sale');
    expect(section).toContain('the contract of sale, art. 6(1)(b) GDPR');
    expect(section).toContain('a legal obligation, art. 6(1)(c) GDPR');
    expect(section).toContain('Neither rests on consent');
  });

  it('names Paddle (reseller, independent controller) and GitHub (registry) with their official policy', () => {
    const section = purchases(build().privacy);
    const body = text(section);
    expect(body).toContain('Paddle (Paddle.com Market Limited) is the reseller of Formrail Pro');
    expect(body).toContain('Paddle is an independent controller of your data');
    expect(body).toContain('The registry is hosted by GitHub (GitHub Packages)');
    expect(body).toContain('as an independent controller');
    expect(external(section).sort()).toEqual([
      'https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement',
      'https://www.paddle.com/legal/privacy',
    ]);
    // Google provides the mailbox under its own terms; it is never called a processor
    expect(body).toContain('a Gmail mailbox provided by Google under its own terms and privacy policy');
    expect(body).not.toMatch(/processor/i);
  });

  it('covers the transfers outside the EEA', () => {
    const body = text(purchases(build().privacy));
    expect(body).toContain('Paddle may transfer data outside the EEA');
    expect(body).toContain('EU-US Data Privacy Framework');
  });

  it('the retention period is the constant: duration of the license plus the number of years', () => {
    const body = (options) => text(purchases(build(options).privacy));
    expect(body({ purchaseRetentionYears: '10' })).toContain('for as long as your license is in force, plus 10 years');
    expect(body({ purchaseRetentionYears: '7' })).toContain('plus 7 years');
    // decision D8: the committed value is 7 years, and the default page prints it
    expect(PURCHASE_RETENTION_YEARS).toBe('7');
    expect(body()).toContain('plus 7 years');
    expect(readFileSync(path.join(ROOT, 'site-root', 'privacy.html'), 'utf8')).toContain('{{RETENTION_YEARS}}');
  });

  it('every external link of the whole notice is on the allowed list, and the only address is PRIVACY_EMAIL', () => {
    const { privacy } = build();
    for (const url of external(privacy).filter((h) => !ownRepo(h))) expect(OFFICIAL_PRIVACY, url).toContain(url);
    for (const m of privacy.matchAll(/<a [^>]*href="https?:[^"]*"[^>]*>/g)) {
      if (!m[0].includes('github.com/Utumno1984')) expect(m[0], m[0]).toContain('rel="noopener"');
    }
    const mails = [...privacy.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g)].map((m) => m[0]);
    expect(mails.length).toBeGreaterThan(0);
    expect(new Set(mails)).toEqual(new Set([PRIVACY_EMAIL]));
    // the guard is sensitive: another address or URL would be caught
    expect(new Set([...mails, 'someone@else.dev'])).not.toEqual(new Set([PRIVACY_EMAIL]));
    expect(OFFICIAL_PRIVACY).not.toContain('https://www.paddle.com/legal/other');
  });

  it('the waitlist description is the one it was before, word for word', () => {
    const fixture = readFileSync(path.join(import.meta.dirname, 'fixtures', 'privacy-waitlist-section.txt'), 'utf8').trim();
    const waitlist = (privacy, end) => text(privacy.slice(privacy.indexOf('<h2 id="data-title">'), privacy.indexOf(end)));
    // with the design partner section and without it
    expect(waitlist(build().privacy, '<h2 id="design-partners-title">')).toBe(fixture);
    expect(waitlist(build({ designPartnerUrl: '' }).privacy, '<h2 id="purchases-title">')).toBe(fixture);
  });

  it('keeps the promise: no cookies, no analytics, with the purchase page as the only declared exception', () => {
    const { privacy } = build();
    const cookies = text(privacy.slice(privacy.indexOf('id="cookies-title"')));
    expect(cookies).toContain('This site sets no cookies and runs no analytics or tracking.');
    expect(cookies).toContain('The only exception will be the purchase page, which is not published yet');
    expect(cookies).toContain('only after you click "Buy"');
    // nothing is claimed about what Paddle.js stores until it is measured
    expect(cookies).toContain('will be described here when that page is published');
    expect(cookies).not.toMatch(/Paddle[^.]*(sets|stores) no/i);
    for (const page of Object.values(build())) expect(page).not.toMatch(/<script[^>]*src=["']?https?:/);
  });
});

describe('the retention guard (decision D8)', () => {
  const FINAL = { earlyAccessUrl: 'https://tally.so/r/abc123', privacyEmail: 'privacy@formrail.dev' };

  it('the stand-in is refused, naming the constant', () => {
    expect(findConfigProblems({ ...FINAL, purchaseRetentionYears: 'TBD' }).join('\n')).toContain('PURCHASE_RETENTION_YEARS');
  });

  it.each([[''], ['  '], ['TBD'], ['ten'], ['0'], ['-1'], ['100'], ['7.5'], ['1e1'], ['07'], [Number.NaN], [null]])(
    'refuses %j',
    (value) => {
      const problems = findConfigProblems({ ...FINAL, purchaseRetentionYears: value });
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain('PURCHASE_RETENTION_YEARS');
    },
  );

  it.each([['1'], ['10'], ['99'], [10], [' 10 ']])('accepts %j', (value) => {
    expect(findConfigProblems({ ...FINAL, purchaseRetentionYears: value })).toEqual([]);
  });

  it('the committed constant is publishable: the strict deploy guard lets it through', () => {
    expect(findConfigProblems({ ...FINAL, purchaseRetentionYears: PURCHASE_RETENTION_YEARS })).toEqual([]);
  });

  it('a caller that does not pass it (an older call site) is not affected', () => {
    expect(findConfigProblems(FINAL)).toEqual([]);
  });

  it('strict mode refuses the assembly while a PR build with the same value stays green', () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'assemble-retention-'));
    dirs.push(tmp);
    const storybookDir = path.join(tmp, 'storybook-static');
    mkdirSync(storybookDir);
    writeFileSync(path.join(storybookDir, 'index.html'), '<!-- manager -->');
    const options = { storybookDir, purchaseRetentionYears: 'TBD' };
    expect(() => assembleSite({ ...options, outDir: path.join(tmp, 'a'), strict: true })).toThrow(/PURCHASE_RETENTION_YEARS/);
    expect(() => assembleSite({ ...options, outDir: path.join(tmp, 'b') })).not.toThrow();
    // with a real number and every other committed constant, the deploy guard lets the build through
    expect(() => assembleSite({ ...options, purchaseRetentionYears: '10', outDir: path.join(tmp, 'c'), strict: true })).not.toThrow();
  });
});
