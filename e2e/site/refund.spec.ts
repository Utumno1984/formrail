import { expect, test } from '@playwright/test';
// @ts-expect-error plain .mjs helper shared with the assembler and the server, no type declarations
import { PRIVACY_EMAIL, PURCHASE_RETENTION_YEARS, REFUND_DAYS, SITE_BASE } from '../../scripts/site-config.mjs';
import { expectNoA11yViolations } from '../helpers/a11y';

// Pre-deploy smoke of the refund policy (/refund/) and of the purchase section of /privacy/, ticket #692.
// Runs against the assembled `site/`.

const base = SITE_BASE as string;
const days = REFUND_DAYS as number;
const retention = PURCHASE_RETENTION_YEARS as string;
const privacyEmail = PRIVACY_EMAIL as string;

test.describe('refund page', () => {
  test('has one h1, the five h2 sections in order and a machine-readable "Last updated" date', async ({ page }) => {
    await page.goto('refund/');
    await expect(page).toHaveTitle('Refund policy · Formrail');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Refund policy');
    await expect(page.getByRole('heading', { level: 2 })).toHaveText([
      'Who can ask, and until when',
      'How to ask',
      'What happens to your access',
      'Consumers in the EU and the UK',
      'Who is behind the sale',
    ]);
    await expect(page.locator('main time')).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}$/);
  });

  test('in a few seconds: 14 days, no reason, anyone, and how to ask', async ({ page }) => {
    await page.goto('refund/');
    // the first screen already says it, before any scrolling
    // the exception for fraud or abuse: maintainer decision of 2026-11-27, as in Paddle's Refund Policy (1.3)
    await expect(page.locator('.lead')).toContainText(
      `within ${days} days of the purchase, without giving a reason, whoever you are, except in case of fraud or abuse.`,
    );
    const main = page.locator('main');
    await expect(main).toContainText(`within ${days} days of the purchase, without giving a reason`);
    await expect(page.locator('#who-and-when-title + p')).toContainText(
      'This is true for everyone who buys Formrail Pro, companies and consumers alike, except in case of fraud or abuse.',
    );
    await expect(main).toContainText(`A request made on day ${days} after the purchase is still within the term.`);
    expect(days).toBe(14);
  });

  test('how to ask: Paddle link (official, opens safely) or the contact email', async ({ page }) => {
    await page.goto('refund/');
    const how = page.locator('#how-to-ask-title ~ ul').first();
    const paddle = how.getByRole('link', { name: "Paddle's buyer support page" });
    await expect(paddle).toHaveAttribute('href', 'https://paddle.net/');
    await expect(paddle).toHaveAttribute('rel', /noopener/);
    await expect(how.getByRole('link', { name: privacyEmail })).toHaveAttribute('href', `mailto:${privacyEmail}`);
    await expect(how).toContainText('write the email address you used to buy, your company name, if any,');
    await expect(page.locator('main')).toContainText('You do not have to say why.');
  });

  test('the refund ends the license and the registry access; a chargeback counts as a refund; the license clause is one click away', async ({
    page,
  }) => {
    await page.goto('refund/');
    const section = page.locator('#access-title ~ p').first();
    await expect(section).toContainText('A refund ends the license and the access to the private registry');
    await expect(section).toContainText('chargeback');
    await section.getByRole('link', { name: 'Refund and termination' }).click();
    await page.waitForURL(`**${base}license/#refund-and-termination-title`);
    await expect(page.locator('#refund-and-termination-title')).toBeVisible();
    await expect(page.locator('#refund-and-termination-title + p')).toContainText('the license and the registry access end');
  });

  test("consumers: the Buyer Terms of Paddle are linked and no right is taken away, even after use", async ({ page }) => {
    await page.goto('refund/');
    const link = page.getByRole('link', { name: "Paddle's Buyer Terms" });
    await expect(link).toHaveAttribute('href', 'https://www.paddle.com/legal/buyer-terms');
    await expect(link).toHaveAttribute('rel', /noopener/);
    const section = page.locator('#consumers-title ~ p').first();
    await expect(section).toContainText('does not take away any right you have as a consumer');
    // the expected text changed (code review of PR #713, note 4): using the product does not shorten the policy,
    // and the Buyer Terms apply on top of it (they make the statutory withdrawal end once you start using it)
    await expect(section).toContainText(
      `Starting to use Formrail Pro does not shorten the ${days} days of this policy; your rights under Paddle's Buyer Terms apply in addition.`,
    );
    await expect(section).not.toContainText('even if you have already started to use');
  });

  test('the license and the refund page agree on the number of days', async ({ page }) => {
    await page.goto('license/');
    // same days and the same exception for fraud or abuse (maintainer decision of 2026-11-27), in the same words
    const rule = `within ${days} days of the purchase, without giving a reason, whoever you are, except in case of fraud or abuse.`;
    await expect(page.locator('#refunds-title + p')).toContainText(rule);
    await page.getByRole('link', { name: 'https://formrail.dev/refund/' }).click();
    await page.waitForURL(`**${base}refund/`);
    await expect(page.locator('main')).toContainText(`within ${days} days of the purchase`);
    await expect(page.locator('.lead')).toContainText(rule);
  });

  test('passes axe', async ({ page }) => {
    await page.goto('refund/');
    await expectNoA11yViolations(page);
  });

  test('requests nothing outside the site origin, sets no cookie, embeds nothing', async ({ page, context }) => {
    const origin = new URL(test.info().project.use.baseURL!).origin;
    const foreign: string[] = [];
    page.on('request', (req) => {
      const u = new URL(req.url());
      if (u.protocol !== 'data:' && u.protocol !== 'blob:' && u.origin !== origin) foreign.push(req.url());
    });
    await page.goto('refund/');
    await page.waitForLoadState('networkidle');
    expect(foreign).toEqual([]);
    await expect(page.locator('iframe, embed, object, script')).toHaveCount(0);
    expect(await context.cookies()).toEqual([]);
    expect(await page.evaluate(() => document.cookie)).toBe('');
  });

  test('/refund redirects to /refund/ and the skip link works from the keyboard', async ({ page }) => {
    const res = await page.goto('refund');
    expect(res?.status()).toBe(200);
    await page.waitForURL(`**${base}refund/`);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('main')).toBeFocused();
  });

  for (const [name, width, height] of [
    ['narrow', 320, 640],
    ['small phone', 375, 667],
    ['tablet', 768, 1024],
    ['desktop', 1280, 800],
  ] as const) {
    test(`${name} ${width}px: no horizontal scroll, nothing outside the viewport`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      for (const url of ['refund/', 'privacy/#purchases-title']) {
        await page.goto(url);
        const m = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
          outside: [...document.querySelectorAll('main *, footer *')]
            .map((el) => el.getBoundingClientRect())
            .filter((r) => r.width > 0 && (r.left < 0 || r.right > window.innerWidth + 0.5)).length,
        }));
        expect(m.scrollWidth, url).toBeLessThanOrEqual(m.innerWidth);
        expect(m.outside, url).toBe(0);
      }
    });
  }
});

test.describe('refund policy from the other pages', () => {
  test('the footer of home, /teams/, /privacy/, /license/ and the 404 reach /refund/ in one click', async ({ page }) => {
    for (const url of ['', 'teams/', 'privacy/', 'license/']) {
      await page.goto(url);
      await page.getByRole('contentinfo').getByRole('link', { name: 'Refund policy' }).click();
      await page.waitForURL(`**${base}refund/`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Refund policy');
    }
    const res = await page.goto('does-not-exist/');
    expect(res?.status()).toBe(404);
    await page.getByRole('link', { name: 'Refund policy' }).click();
    await page.waitForURL(`**${base}refund/`);
  });

  test('the refund page footer marks itself as the current page and links the license', async ({ page }) => {
    await page.goto('refund/');
    const footer = page.getByRole('contentinfo');
    await expect(footer.getByRole('link', { name: 'Refund policy' })).toHaveAttribute('aria-current', 'page');
    await expect(footer.getByRole('link', { name: 'License terms' })).toHaveAttribute('href', '../license/');
    await expect(footer).toContainText('Formrail Pro: One-time license per developer, 12 months of updates included.');
  });
});

test.describe('privacy notice: purchases', () => {
  test('the Purchases section lists the data, the purposes, the legal bases and the retention', async ({ page }) => {
    await page.goto('privacy/');
    await expect(page.getByRole('heading', { level: 2, name: 'Purchases' })).toBeVisible();
    await expect(page.locator('#purchases-title ~ h3')).toHaveText([
      'Data we receive',
      'Purpose and legal basis',
      'Paddle, GitHub and the mailbox',
      'Transfers outside the EEA',
      'Retention',
    ]);
    // The expected list changed (code review of PR #713, points 3 and 10): the Paddle Billing checkout can also
    // collect the postal code or address and, for a business, the tax number, and makes them available to the
    // seller; a consumer has no company. The list says what the data "can include", it is not a closed list.
    await expect(page.locator('#purchase-data-title + p')).toContainText(
      'Depending on what you give to Paddle at checkout, it can include:',
    );
    await expect(page.locator('#purchase-data-title + p + ul li')).toHaveText([
      'your name;',
      'your email address;',
      'your company name, if any;',
      'your country;',
      'your postal code or address and, for a business, the tax or VAT number, when you give them to Paddle at checkout;',
      'the number of developers the license is for;',
      // the date and the amount are among the records of the sale that are kept (maintainer decision of 2026-11-27)
      'the identifier, the date and the amount of the transaction.',
    ]);
    // the whole 13(2)(e) sentence (code review of PR #713, round 3, problem 2)
    await expect(page.locator('#purchase-data-title + p + ul + p')).toContainText(
      'Without your email address and the GitHub user names we cannot grant the access or manage the license; the other data are optional or depend on what Paddle collects at checkout (art. 13(2)(e) GDPR).',
    );
    const main = page.locator('main');
    await expect(main).toContainText('GitHub user names that you give us');
    await expect(main).toContainText('art. 6(1)(b) GDPR');
    await expect(main).toContainText('art. 6(1)(f) GDPR');
    // the expected text changed with the maintainer decision of 2026-11-27 (code review of PR #713, point 1): the
    // period is counted from the end of the year of the sale, not from the end of a license that may never end
    await expect(page.locator('#purchase-retention-title + p')).toContainText(
      `for ${retention} years from the end of the year in which the sale takes place`,
    );
    // minimisation, maintainer decision of 2026-11-27 after code review round 3: the data kept for that period,
    // and when the other data are deleted (a new second paragraph, so the paragraphs after it moved by one)
    await expect(page.locator('#purchase-retention-title + p')).toContainText(
      'Of the purchase data received from Paddle, the records of the sale keep only the identifier of the transaction, the date, the amount, your country and your email address;',
    );
    await expect(page.locator('#purchase-retention-title + p + p')).toContainText(
      'The other purchase data received from Paddle, such as your name, your company name, your address and your tax or VAT number, are not records of the sale, and they are not kept for that period. The data controller deletes them at the end of the 12 months of updates of your license or, if you buy again, of the last license you buy, or earlier if the license ends',
    );
    await expect(page.locator('#purchase-retention-title + p + p + p')).toContainText(
      'The data controller deletes them when your access to the registry ends',
    );
    await expect(main).not.toContainText('in force');
    // maintainer decision of 2026-11-27: emails about a purchase are kept like the sale; the expected text changed
    // after round 3 (note A): the other emails follow the general section "Emails you send us"
    await expect(page.locator('#purchase-retention-title + p + p + p + p')).toContainText(
      `are records of the sale: they are kept for the same period, ${retention} years from the end of the year in which the sale takes place. The other emails follow the rule in "Emails you send us" below.`,
    );
    await expect(page.locator('#emails-title + p')).toContainText(
      'The other emails, including privacy requests, are deleted 2 years after our last reply, or 2 years after we receive them if we do not reply.',
    );
    await expect(page.locator('#emails-title + p')).toContainText('whether or not they have bought a license');
    await expect(page.locator('#emails-title + p + p')).toContainText(
      'We use these emails to answer you. For privacy requests this rests on our obligations under the GDPR (art. 6(1)(c)); for the other emails, on our legitimate interest in answering (art. 6(1)(f)). The mailbox is Gmail, provided by Google under its own terms and privacy policy. Google LLC is based in the United States, and the transfer of the emails to it rests on the EU-US Data Privacy Framework, to which it adheres.',
    );
    await expect(page.locator('.lead')).toContainText('and, in its own section, for the emails that anyone sends us; for the purchase data');
    await expect(page.locator('#purchase-data-title + p')).toContainText('as the licensor of the product');
    await expect(main).toContainText('Paddle may transfer data outside the EEA');
    await expect(page.locator('#purchase-transfers-title + p')).toContainText(
      'Paddle.com Market Limited is based in the United Kingdom, which the European Commission recognises, with an adequacy decision',
    );
    await expect(page.locator('#purchase-transfers-title + p')).toContainText(
      'the seller is the local Paddle company (Paddle.com Inc. or Paddle.com (Canada) Ltd)',
    );
    await expect(page.locator('.lead')).toContainText('it is also the information under art. 14 of the GDPR');
  });

  test('Paddle and GitHub are linked to their official pages, safely, and nothing else is added', async ({ page }) => {
    await page.goto('privacy/');
    const section = page.locator('#purchases-title ~ p, #purchases-title ~ ul').filter({ hasText: /Paddle|GitHub/ });
    const paddle = page.getByRole('link', { name: "Paddle's privacy notice" });
    const github = page.getByRole('link', { name: "GitHub's privacy terms" });
    await expect(paddle).toHaveAttribute('href', 'https://www.paddle.com/legal/privacy');
    await expect(github).toHaveAttribute(
      'href',
      'https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement',
    );
    for (const link of [paddle, github]) await expect(link).toHaveAttribute('rel', /noopener/);
    expect(await section.count()).toBeGreaterThan(0);
    // every external link of the notice is on the allowed list
    const hrefs = await page.locator('main a[href^="http"]').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    for (const href of hrefs) {
      expect(
        [
          'https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement',
          'https://tally.so/help/gdpr',
          'https://tally.so/help/privacy-policy',
          'https://www.paddle.com/legal/privacy',
        ],
        String(href),
      ).toContain(href);
    }
    // the only address named is the privacy contact
    const mails = (await page.locator('main').innerText()).match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? [];
    expect(new Set(mails)).toEqual(new Set([privacyEmail]));
  });

  test('the notice says what Paddle is and does not call Google a processor', async ({ page }) => {
    await page.goto('privacy/');
    const section = page.locator('#purchase-recipients-title ~ p').first();
    await expect(section).toContainText(
      'Paddle (Paddle.com Market Limited, based in the United Kingdom; if you buy from the United States, Paddle.com Inc.; if you buy from Canada, Paddle.com (Canada) Ltd) is the reseller of Formrail Pro',
    );
    for (const entity of ['Paddle.com Market Limited', 'Paddle.com Inc.', 'Paddle.com (Canada) Ltd']) {
      await expect(section).toContainText(entity);
    }
    await expect(section).toContainText('independent controller');
    // asserted on its own since it moved out of the parenthesis (code review of PR #713, round 3, problem 2)
    await expect(section).toContainText('Your receipt names the company that sold to you.');
    await expect(section).not.toContainText('What it passes to us');
    const text = await page.locator('#purchases-title ~ *').evaluateAll((els) => els.map((e) => e.textContent ?? '').join(' '));
    expect(text).not.toMatch(/processor/i);
  });

  test('the legal bases and the right to object: art. 21 in the Purchases section and, on its own, in "Your rights"', async ({
    page,
  }) => {
    await page.goto('privacy/');
    const bases = page.locator('#purchase-purpose-title + p + ul + p');
    await expect(bases).toContainText(
      'The second rests on our legitimate interest in defending ourselves in case of checks or disputes, art. 6(1)(f) GDPR.',
    );
    await expect(bases).toContainText(
      'the rights listed below still apply, including the right to object to the processing based on legitimate interest (art. 21 GDPR).',
    );
    await expect(page.locator('#purchase-purpose-title + p + ul li').nth(1)).toHaveText(
      'to keep the records of the sale for a period that covers the tax and accounting checks that can concern the sale, and to defend ourselves in case of a dispute.',
    );
    await expect(page.locator('#purchase-retention-title + p')).toContainText(
      'Until then you can object to this keeping (art. 21 GDPR), as described in "Your rights" below.',
    );
    // art. 21(4): clearly and separately from any other information, in the section the Purchases text points to
    const object = page.locator('#rights-title ~ p#right-to-object');
    await expect(object).toBeVisible();
    await expect(object).toHaveText(
      'Right to object. Where we keep data on the basis of our legitimate interest (the records of the sale described in the Purchases section), you can object to this keeping (art. 21 GDPR); we will then stop, unless we need the data to establish, exercise or defend legal claims or have compelling legitimate grounds that override your interests.',
      { useInnerText: true },
    );
    await expect(object.locator('strong')).toHaveText('Right to object.');
    await expect(page.locator('main')).not.toContainText(/weigh/i);
  });

  test('the waitlist description is unchanged and the Last updated date matches license and refund', async ({ page }) => {
    await page.goto('privacy/');
    const main = page.locator('main');
    await expect(main).toContainText('no later than 24 months after sign-up, or earlier if you withdraw your consent');
    await expect(main).toContainText('The waitlist form asks for these fields:');
    const dates: string[] = [];
    for (const url of ['privacy/', 'license/', 'refund/']) {
      await page.goto(url);
      dates.push((await page.locator('main time').getAttribute('datetime')) ?? '');
    }
    expect(new Set(dates).size).toBe(1);
    expect(dates[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('"No cookies, no analytics" stays true: nothing is loaded or stored, no exception is announced', async ({
    page,
    context,
  }) => {
    const origin = new URL(test.info().project.use.baseURL!).origin;
    const foreign: string[] = [];
    page.on('request', (req) => {
      const u = new URL(req.url());
      if (u.protocol !== 'data:' && u.protocol !== 'blob:' && u.origin !== origin) foreign.push(req.url());
    });
    await page.goto('privacy/');
    await page.waitForLoadState('networkidle');
    expect(foreign).toEqual([]);
    expect(await context.cookies()).toEqual([]);
    await expect(page.locator('script')).toHaveCount(0);
    const cookies = page.locator('#cookies-title ~ p');
    await expect(cookies.nth(0)).toContainText('sets no cookies and runs no analytics or tracking');
    await expect(cookies.nth(0)).toContainText('It loads no fonts, scripts or content from other sites.');
    await expect(cookies).toHaveCount(2);
    // the expected text changed with the sale standby decision: no purchase page is announced any more
    await expect(cookies.nth(1)).toContainText(
      'Every page of this site keeps this promise. If a page ever needs to load a script or content from another site, this notice will say so before that page is published.',
    );
    for (const word of [/Paddle\.js/i, /\bBuy\b/i, /purchase page/i, /exception/i]) {
      await expect(cookies.nth(1)).not.toContainText(word);
    }
    // neither paragraph mentions Paddle at all (code review of PR #713, note 7)
    for (const i of [0, 1]) await expect(cookies.nth(i)).not.toContainText(/Paddle/);
    // the other pages of the site load nothing from Paddle
    for (const url of ['', 'teams/', 'license/', 'refund/']) {
      await page.goto(url);
      expect(await page.content(), url).not.toMatch(/paddle\.js|cdn\.paddle\.com/i);
    }
  });

  test('passes axe', async ({ page }) => {
    await page.goto('privacy/');
    await expectNoA11yViolations(page);
  });
});
