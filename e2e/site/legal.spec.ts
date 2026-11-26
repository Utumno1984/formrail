import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
// @ts-expect-error plain .mjs helper shared with the assembler and the server, no type declarations
import { LICENSOR, SITE_BASE } from '../../scripts/site-config.mjs';
import { expectNoA11yViolations } from '../helpers/a11y';

// Pre-deploy smoke of the license terms page (/license/), ticket #691. Runs against the assembled `site/`.

const base = SITE_BASE as string;
const licensor = LICENSOR as { name: string; status: string; country: string; email: string };
const LICENSE_FILE = readFileSync(fileURLToPath(new URL('../../packages/pro/LICENSE', import.meta.url)), 'utf8');

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

test.describe('license terms page', () => {
  test('has one h1, the sixteen h2 sections in order and a machine-readable "Last updated" date', async ({ page }) => {
    await page.goto('license/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Formrail Pro License Terms');
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(TITLES);
    const time = page.locator('main time');
    await expect(time).toHaveCount(1);
    await expect(time).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}$/);
    await expect(page.locator('.lead')).toContainText('Last updated:');
  });

  test('the Licensor section shows the individual, the country and a working mailto, nothing else', async ({ page }) => {
    await page.goto('license/');
    const section = page.locator('p').filter({ hasText: 'is licensed by' }).first();
    await expect(section).toContainText(`${licensor.name}, ${licensor.status}, based in ${licensor.country}`);
    await expect(section.getByRole('link', { name: licensor.email })).toHaveAttribute('href', `mailto:${licensor.email}`);
    const text = await page.locator('main').innerText();
    expect(text).not.toMatch(/\b(codice fiscale|tax code|VAT)\b/i);
    expect(text).not.toContain('{{');
  });

  test('states the decided terms where a reader looks for them', async ({ page }) => {
    await page.goto('license/');
    const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
    for (const phrase of [
      '12 months of updates',
      'The license does not renew automatically',
      'You may keep using every covered version, in development and in production, with no limit of time',
      'Ending the registry access is not a revocation of the license.',
      'you can replace them with another person',
      'to evaluate it and to develop and test applications',
      'A license is required for production use.',
      'within 14 days of the purchase, without giving a reason',
      'We aim to reply within 2 business days',
      'on a best-effort basis',
      'No release date, roadmap item or feature is promised.',
    ]) {
      expect(text, phrase).toContain(phrase);
    }
    expect(text).not.toMatch(/license key|activation|phone home|auto-renew|TO BE DEFINED/i);
  });

  test('the rendered text is the text of packages/pro/LICENSE', async ({ page }) => {
    await page.goto('license/');
    const rendered = (await page.locator('main').innerText()).replace(/\s+/g, ' ').trim();
    expect(rendered).toBe(LICENSE_FILE.replace(/\s+/g, ' ').trim());
  });

  test('the Refunds section links the refund page', async ({ page }) => {
    await page.goto('license/');
    await expect(page.getByRole('link', { name: 'https://formrail.dev/refund/' })).toHaveAttribute('href', '../refund/');
  });

  test('/license redirects to /license/ and the heading anchors work from the keyboard', async ({ page }) => {
    const res = await page.goto('license');
    expect(res?.status()).toBe(200);
    await page.waitForURL(`**${base}license/`);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('main')).toBeFocused();
  });

  test('passes axe', async ({ page }) => {
    await page.goto('license/');
    await expectNoA11yViolations(page);
  });

  test('requests nothing outside the site origin, sets no cookie, embeds nothing', async ({ page, context }) => {
    const origin = new URL(test.info().project.use.baseURL!).origin;
    const foreign: string[] = [];
    page.on('request', (req) => {
      const u = new URL(req.url());
      if (u.protocol !== 'data:' && u.protocol !== 'blob:' && u.origin !== origin) foreign.push(req.url());
    });
    await page.goto('license/');
    await page.waitForLoadState('networkidle');
    expect(foreign).toEqual([]);
    await expect(page.locator('iframe, embed, object, script')).toHaveCount(0);
    expect(await context.cookies()).toEqual([]);
    expect(await page.evaluate(() => document.cookie)).toBe('');
  });

  for (const [name, width, height] of [
    ['narrow', 320, 640],
    ['small phone', 375, 667],
    ['tablet', 768, 1024],
    ['desktop', 1280, 800],
  ] as const) {
    test(`${name} ${width}px: no horizontal scroll, nothing outside the viewport`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('license/');
      const m = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        outside: [...document.querySelectorAll('main *, footer *')]
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.width > 0 && (r.left < 0 || r.right > window.innerWidth + 0.5)).length,
      }));
      expect(m.scrollWidth).toBeLessThanOrEqual(m.innerWidth);
      expect(m.outside).toBe(0);
    });
  }
});

test.describe('license terms from the other pages', () => {
  test('the footer of home, /teams/, /privacy/ and the 404 reach /license/ in one click, with one sentence', async ({ page }) => {
    for (const url of ['', 'teams/', 'privacy/']) {
      await page.goto(url);
      const footer = page.getByRole('contentinfo');
      await expect(footer, url).toContainText('Formrail Pro: Annual license per developer, 12 months of updates included.');
      await expect(footer, url).not.toContainText('terms published before sales');
      await footer.getByRole('link', { name: 'License terms' }).click();
      await page.waitForURL(`**${base}license/`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Formrail Pro License Terms');
    }
    const res = await page.goto('does-not-exist/');
    expect(res?.status()).toBe(404);
    await page.getByRole('link', { name: 'License terms' }).click();
    await page.waitForURL(`**${base}license/`);
  });

  test('the license page footer marks itself as the current page', async ({ page }) => {
    await page.goto('license/');
    await expect(page.getByRole('contentinfo').getByRole('link', { name: 'License terms' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('contentinfo')).toContainText('Formrail Pro: Annual license per developer, 12 months of updates included.');
  });

  test('/teams/#license points to the terms and still says nothing can be bought yet', async ({ page }) => {
    await page.goto('teams/#license');
    const section = page.locator('#license');
    await expect(section.getByRole('link', { name: 'license terms' })).toHaveAttribute('href', '../license/');
    await expect(section).toContainText('Nothing can be bought yet: no payment or pre-order is taken.');
    await section.getByRole('link', { name: 'license terms' }).click();
    await page.waitForURL(`**${base}license/`);
  });
});
