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
    // the exception for fraud or abuse: decision of Daniele of 2026-11-27, as in Paddle's Refund Policy (1.3)
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
    // the expected text changed (critic of PR #713, note 4): using the product does not shorten the policy,
    // and the Buyer Terms apply on top of it (they make the statutory withdrawal end once you start using it)
    await expect(section).toContainText(
      `Starting to use Formrail Pro does not shorten the ${days} days of this policy; your rights under Paddle's Buyer Terms apply in addition.`,
    );
    await expect(section).not.toContainText('even if you have already started to use');
  });

  test('the license and the refund page agree on the number of days', async ({ page }) => {
    await page.goto('license/');
    // same days and the same exception for fraud or abuse (decision of Daniele of 2026-11-27), in the same words
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
    // The expected list changed (critic of PR #713, points 3 and 10): the Paddle Billing checkout can also
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
      'the identifier of the transaction.',
    ]);
    const main = page.locator('main');
    await expect(main).toContainText('GitHub user names that you give us');
    await expect(main).toContainText('art. 6(1)(b) GDPR');
    await expect(main).toContainText('art. 6(1)(c) GDPR');
    // the expected text changed with the decision of Daniele of 2026-11-27 (critic of PR #713, point 1): the
    // period is counted from the end of the year of the sale, not from the end of a license that may never end
    await expect(page.locator('#purchase-retention-title + p')).toContainText(
      `for ${retention} years from the end of the year in which the sale takes place`,
    );
    await expect(page.locator('#purchase-retention-title + p + p')).toContainText(
      'The data controller deletes them when your access to the registry ends',
    );
    await expect(main).not.toContainText('in force');
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
      'Paddle (Paddle.com Market Limited, based in the United Kingdom; if you buy from the United States, Paddle.com Inc.; if you buy from Canada, Paddle.com (Canada) Ltd. Your receipt names the company that sold to you) is the reseller of Formrail Pro',
    );
    for (const entity of ['Paddle.com Market Limited', 'Paddle.com Inc.', 'Paddle.com (Canada) Ltd']) {
      await expect(section).toContainText(entity);
    }
    await expect(section).toContainText('independent controller');
    await expect(section).not.toContainText('What it passes to us');
    const text = await page.locator('#purchases-title ~ *').evaluateAll((els) => els.map((e) => e.textContent ?? '').join(' '));
    expect(text).not.toMatch(/processor/i);
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
    // neither paragraph mentions Paddle at all (critic of PR #713, note 7)
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
