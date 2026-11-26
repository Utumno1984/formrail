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
    await expect(page.locator('.lead')).toContainText(`within ${days} days of the purchase, without giving a reason, whoever you are`);
    const main = page.locator('main');
    await expect(main).toContainText(`within ${days} days of the purchase, without giving a reason`);
    await expect(main).toContainText('companies and consumers alike');
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
    await expect(section).toContainText('even if you have already started to use Formrail Pro');
  });

  test('the license and the refund page agree on the number of days', async ({ page }) => {
    await page.goto('license/');
    await expect(page.locator('#refunds-title + p')).toContainText(`within ${days} days of the purchase, without giving a reason`);
    await page.getByRole('link', { name: 'https://formrail.dev/refund/' }).click();
    await page.waitForURL(`**${base}refund/`);
    await expect(page.locator('main')).toContainText(`within ${days} days of the purchase`);
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
    await expect(page.locator('#purchase-data-title + p + ul li')).toHaveText([
      'your name;',
      'your email address;',
      'your company name;',
      'your country;',
      'the number of developers the license is for;',
      'the identifier of the transaction.',
    ]);
    const main = page.locator('main');
    await expect(main).toContainText('GitHub user names that you give us');
    await expect(main).toContainText('art. 6(1)(b) GDPR');
    await expect(main).toContainText('art. 6(1)(c) GDPR');
    await expect(main).toContainText(`plus ${retention} years`);
    await expect(main).toContainText('Paddle may transfer data outside the EEA');
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
    await expect(section).toContainText('is the reseller of Formrail Pro');
    await expect(section).toContainText('independent controller');
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

  test('"No cookies, no analytics" stays true: nothing is loaded or stored, the purchase page is the declared exception', async ({
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
    await expect(cookies.nth(1)).toContainText('The only exception will be the purchase page, which is not published yet');
    await expect(cookies.nth(1)).toContainText('only after you click "Buy"');
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
