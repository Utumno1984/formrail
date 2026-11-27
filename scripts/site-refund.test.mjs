import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
    // Decision of Daniele of 2026-11-27 (critic of PR #713, note 5): like point 1.3 of Paddle's Refund Policy, a
    // refund can be refused in case of fraud or abuse; the exception is in the lead, the rule and the description.
    const { refund } = build();
    expect(text(refund.match(/<p class="lead">[\s\S]*?<\/p>/)[0])).toContain(
      `within ${REFUND_DAYS} days of the purchase, without giving a reason, whoever you are, except in case of fraud or abuse.`,
    );
    expect(body).toContain(
      'This is true for everyone who buys Formrail Pro, companies and consumers alike, except in case of fraud or abuse.',
    );
    expect(refund).toMatch(/<meta\s+name="description"\s+content="[^"]*whoever you are, except in case of fraud or abuse\./);
    // the 14th day is inside the term
    expect(body).toContain(`A request made on day ${REFUND_DAYS} after the purchase is still within the term.`);
    // the number is never typed into the page: change the constant and the page follows
    const changed = text(build({ refundDays: 30 }).refund);
    expect(changed).toContain('within 30 days of the purchase');
    expect(changed).not.toContain('14');
    expect(readFileSync(path.join(ROOT, 'site-root', 'refund.html'), 'utf8')).not.toMatch(/\b14\b/);
  });

  it('the license text says the same number of days, and the same exception for fraud or abuse', () => {
    const file = readFileSync(path.join(ROOT, 'packages', 'pro', 'LICENSE'), 'utf8').replace(/\s+/g, ' ');
    expect(file).toContain(`within ${REFUND_DAYS} days of the purchase, without giving a reason`);
    expect(text(build().license)).toContain(`within ${REFUND_DAYS} days of the purchase, without giving a reason`);
    // Decision of Daniele of 2026-11-27 (PR #713): the license, the /license/ page and /refund/ carry the same
    // exception, in the same words; a refund policy wider than the license (or the reverse) fails here.
    const RULE = `within ${REFUND_DAYS} days of the purchase, without giving a reason, whoever you are, except in case of fraud or abuse.`;
    const { license, refund } = build();
    expect(file).toContain(RULE);
    expect(text(license)).toContain(RULE);
    expect(text(refund.match(/<p class="lead">[\s\S]*?<\/p>/)[0])).toContain(RULE);
    // "whoever you are" never appears without the exception, in any of the three texts
    for (const t of [file, text(license), text(refund)]) {
      expect(t.split('whoever you are').length - 1).toBe(t.split('whoever you are, except in case of fraud or abuse').length - 1);
    }
  });

  it('says how to ask: through Paddle (official link) or by email to the contact address', () => {
    const { refund } = build();
    const section = refund.slice(refund.indexOf('id="how-to-ask-title"'), refund.indexOf('id="access-title"'));
    expect(external(section)).toContain('https://paddle.net/');
    expect(section).toContain(`href="mailto:${LICENSOR.email}"`);
    expect(text(section)).toContain('You do not have to say why.');
    // a consumer has no company: the email request asks for it only if there is one
    expect(text(section)).toContain(
      'write the email address you used to buy, your company name, if any, and the transaction identifier of your receipt if you have it',
    );
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
    const consumers = (options) => {
      const { refund } = build(options);
      return refund.slice(refund.indexOf('id="consumers-title"'), refund.indexOf('id="seller-title"'));
    };
    const section = consumers();
    expect(external(section)).toEqual(['https://www.paddle.com/legal/buyer-terms']);
    expect(text(section)).toContain('does not take away any right you have as a consumer');
    // The expected text changed (critic of PR #713, note 4): the Buyer Terms say that the statutory right of
    // withdrawal is lost once you start to use the product, so the page no longer says that those terms apply
    // "even if you have already started to use" it. Using it does not shorten the policy, and the Buyer Terms
    // apply on top of it.
    expect(text(section)).toContain(
      `Starting to use Formrail Pro does not shorten the ${REFUND_DAYS} days of this policy; your rights under Paddle's Buyer Terms apply in addition.`,
    );
    expect(text(section)).not.toContain('even if you have already started to use');
    expect(text(consumers({ refundDays: 30 }))).toContain('does not shorten the 30 days of this policy');
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
      'your company name, if any;',
      'your country;',
      'your postal code or address and, for a business, the tax or VAT number, when you give them to Paddle at checkout;',
      'the number of developers the license is for;',
      'the identifier of the transaction.',
    ]);
    // The expected list changed (critic of PR #713, points 3 and 10): the Paddle Billing checkout can also collect
    // the postal code or address and, for a business, the tax number, and makes them available to the seller; a
    // consumer has no company. The list is introduced as what the data "can include", not as a closed list.
    expect(text(list)).toContain(
      'We receive from Paddle the data of your purchase that Paddle makes available to us as the seller of the product. Depending on what you give to Paddle at checkout, it can include:',
    );
    expect(text(section)).not.toContain('What it passes to us');
    expect(text(section)).not.toContain('the data listed above');
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
    // Paddle's Buyer Terms: the contracting entity depends on where the buyer purchases from (US: Paddle.com Inc.,
    // Canada: Paddle.com (Canada) Ltd, rest of world: Paddle.com Market Limited), critic of PR #713, point 2.
    expect(body).toContain(
      'Paddle (Paddle.com Market Limited, based in the United Kingdom; if you buy from the United States, Paddle.com Inc.; if you buy from Canada, Paddle.com (Canada) Ltd. Your receipt names the company that sold to you) is the reseller of Formrail Pro',
    );
    for (const entity of ['Paddle.com Market Limited', 'Paddle.com Inc.', 'Paddle.com (Canada) Ltd']) {
      expect(body).toContain(entity);
    }
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
    // Paddle itself is outside the EEA: the UK, covered by an adequacy decision (critic of PR #713, point 2)
    expect(body).toContain(
      'Paddle.com Market Limited is based in the United Kingdom, which the European Commission recognises, with an adequacy decision, as giving an adequate level of protection to personal data.',
    );
    expect(body).toContain('its other companies, and the safeguards it uses, are described in the privacy notice linked above');
    expect(body).toContain(
      'If you buy from the United States or from Canada, the seller is the local Paddle company (Paddle.com Inc. or Paddle.com (Canada) Ltd), and its transfers are described in that same notice.',
    );
  });

  it('the introduction cites art. 14 for the data received from Paddle, and art. 13 for the rest', () => {
    const { privacy } = build();
    const lead = text(privacy.match(/<p class="lead">[\s\S]*?<\/p>/)[0]);
    expect(lead).toContain('Information under art. 13 of the GDPR');
    expect(lead).toContain('for the purchase data that we receive from Paddle, it is also the information under art. 14 of the GDPR');
    expect(text(build({ designPartnerUrl: '' }).privacy)).toContain('information under art. 14 of the GDPR');
    expect(privacy).toContain('(GDPR art. 13 and 14)');
  });

  it('the retention period is the constant, counted from the end of the year of the sale; GitHub user names end with the access', () => {
    const body = (options) => text(purchases(build(options).privacy));
    // The expected text changed with the decision of Daniele of 2026-11-27 (critic of PR #713, point 1): the
    // reference of D8 is the end of the year of the sale (tax and accounting records), no longer "as long as your
    // license is in force", which for a perpetual license would never end.
    const RULE = (years) =>
      `We keep the purchase data received from Paddle for ${years} years from the end of the year in which the sale takes place: this is the period for which tax and accounting law requires the records of the sale to be kept.`;
    expect(body({ purchaseRetentionYears: '10' })).toContain(RULE(10));
    expect(body({ purchaseRetentionYears: '7' })).toContain(RULE(7));
    // decision D8: the committed value is 7 years, and the default page prints it
    expect(PURCHASE_RETENTION_YEARS).toBe('7');
    expect(body()).toContain(RULE(7));
    expect(body()).not.toMatch(/in force|plus \d+ years/);
    // GitHub user names are not records of the sale: deleted when the registry access ends, in each of the cases
    expect(body()).toContain(
      'The GitHub user names are not records of the sale, and they are not kept for that period. The data controller deletes them when your access to the registry ends: when the 12 months of updates end and you do not buy again, when you receive a refund or the payment is reversed, or when the license ends for a serious violation, as described in the license terms.',
    );
    // those cases are the ones of the license: the registry access ends with the 12 months, a refund, a chargeback
    // or a serious violation
    const license = text(build().license);
    expect(license).toContain('When the 12 months end, your access to the registry ends');
    expect(license).toContain('If you receive a refund, or the payment is reversed (a chargeback), the license and the registry access end');
    expect(license).toContain('A serious violation of the section Restrictions ends the license in the same way');
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

  it('keeps the promise: no cookies, no analytics, no exception announced (sale on standby)', () => {
    const { privacy } = build();
    const cookies = text(privacy.slice(privacy.indexOf('id="cookies-title"'), privacy.indexOf('</main>')));
    expect(cookies).toContain(
      'This site sets no cookies and runs no analytics or tracking. It loads no fonts, scripts or content from other sites.',
    );
    // the expected text changed with the sale standby decision: no purchase page is announced any more
    expect(cookies).toContain(
      'Every page of this site keeps this promise. If a page ever needs to load a script or content from another site, this notice will say so before that page is published.',
    );
    expect(cookies).not.toMatch(/Paddle\.js/i);
    expect(cookies).not.toMatch(/\bBuy\b/i);
    expect(cookies).not.toMatch(/purchase page/i);
    expect(cookies).not.toMatch(/exception/i);
    // the paragraph says nothing about Paddle at all: no promise about what a Paddle page would set (note 7)
    expect(cookies).not.toMatch(/Paddle/);
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

  // The CLI (`node scripts/check-site-config.mjs`, first step of the deploy job) builds the config from the
  // constants itself. It is run here from a temporary copy whose `site-config.mjs` re-exports the real one and
  // overrides one constant, so that forgetting to pass it to the guard makes this test fail (critic of PR #713,
  // note 8).
  function runCli(overrides) {
    const tmp = mkdtempSync(path.join(tmpdir(), 'check-site-config-'));
    dirs.push(tmp);
    copyFileSync(path.join(ROOT, 'scripts', 'check-site-config.mjs'), path.join(tmp, 'check-site-config.mjs'));
    const real = JSON.stringify(path.join(ROOT, 'scripts', 'site-config.mjs'));
    const lines = Object.entries(overrides).map(([name, value]) => `export const ${name} = ${JSON.stringify(value)};`);
    writeFileSync(path.join(tmp, 'site-config.mjs'), [`export * from ${real};`, ...lines].join('\n'));
    return spawnSync(process.execPath, [path.join(tmp, 'check-site-config.mjs')], { encoding: 'utf8' });
  }

  it('the CLI passes the retention to the guard: a stand-in fails the deploy step, the committed value passes', () => {
    const refused = runCli({ PURCHASE_RETENTION_YEARS: 'TBD' });
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain('PURCHASE_RETENTION_YEARS');
    const passed = runCli({});
    expect(passed.stderr).toBe('');
    expect(passed.status).toBe(0);
    expect(passed.stdout).toContain('site-config: values are final.');
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
