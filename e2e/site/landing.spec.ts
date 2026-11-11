import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
// @ts-expect-error plain .mjs helper shared with the assembler and the server, no type declarations
import { EARLY_ACCESS_URL, SITE_BASE } from '../../scripts/site-config.mjs';
import { expectNoA11yViolations } from '../helpers/a11y';
import { VIEWPORTS } from '../helpers/viewports';

// Pre-deploy smoke of the landing page at the site root (ticket #382), see playwright.site.config.ts.

const base = SITE_BASE as string;
const earlyAccessUrl = EARLY_ACCESS_URL as string;
const SITE_DIR = fileURLToPath(new URL('../../site/', import.meta.url));

test.describe('the root is the landing page', () => {
  test('bare root, #pro and foreign parameters stay on the landing (no redirect)', async ({ page }) => {
    for (const link of ['', '#pro', '?utm_source=newsletter']) {
      await page.goto(link);
      await page.waitForTimeout(300);
      expect(new URL(page.url()).pathname, link).toBe(base);
      await expect(page.getByRole('heading', { level: 1, name: 'Formrail' })).toBeVisible();
    }
  });

  test('hero text is the proposed positioning sentence', async ({ page }) => {
    await page.goto('');
    await expect(page.locator('.lead')).toHaveText(
      'An open-core React design system for List Report and Object Page screens: lists with filters and bulk actions, sectioned editors with a sticky save bar and dirty-guard.',
    );
  });

  test('the wording names no third-party product (spec §5 point 3)', async ({ page }) => {
    await page.goto('');
    const text = (await page.locator('body').innerText()).toLowerCase();
    const html = (await page.content()).toLowerCase();
    for (const word of ['sap', 'fiori', 'ui5', 'salesforce', 'lightning', 'material', 'ant design', 'antd', 'microsoft', 'fluent', 'atlassian', 'carbon', 'polaris', 'oracle']) {
      expect(new RegExp(`\\b${word}\\b`).test(text), `visible text mentions "${word}"`).toBe(false);
      expect(new RegExp(`\\b${word}\\b`).test(html), `markup mentions "${word}"`).toBe(false);
    }
  });
});

test.describe('links', () => {
  test('hero buttons go to storybook/ and pro/, and Back returns to the landing', async ({ page }) => {
    await page.goto('');
    const free = page.getByRole('link', { name: 'Browse the components (free, MIT)' });
    const pro = page.getByRole('link', { name: 'See the Pro preview' });
    await expect(free).toHaveAttribute('href', 'storybook/');
    await expect(pro).toHaveAttribute('href', 'pro/');
    await free.click();
    await page.waitForURL(`**${base}storybook/`);
    await expect(page.locator('#storybook-preview-iframe')).toBeAttached();
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${base}$`));
    await pro.click();
    await page.waitForURL(`**${base}pro/`);
    await expect(page.locator('#storybook-preview-iframe')).toBeAttached();
    await expect(page.frameLocator('#storybook-preview-iframe').locator('.rop-pro-banner')).toBeVisible({ timeout: 30_000 });
  });

  test('every story link of the differentiators and of the Pro section opens a rendered docs page', async ({ page }) => {
    await page.goto('');
    const hrefs = await page.locator('.cards a, .pro-list a').evaluateAll((as) => as.map((a) => a.getAttribute('href')!));
    expect(hrefs.length).toBeGreaterThanOrEqual(7);
    for (const href of hrefs) {
      expect(href, 'a story link').toMatch(/^(storybook|pro)\/\?path=\/docs\/[a-z0-9-]+--docs$/);
      await page.goto(href);
      const id = new URL(page.url()).searchParams.get('path')!.replace('/docs/', '');
      const frame = page.frameLocator('#storybook-preview-iframe');
      await expect(page.locator('#storybook-preview-iframe'), href).toHaveAttribute('src', new RegExp(`id=${id}&viewMode=docs`), { timeout: 30_000 });
      await expect(frame.locator('.sbdocs-content'), href).toBeVisible({ timeout: 30_000 });
      await expect(frame.getByRole('heading', { level: 1 }).first(), href).toBeVisible();
    }
  });

  test('the Pro banner "Learn more" lands on #pro of the landing', async ({ page }) => {
    await page.goto('pro/iframe.html?id=pro-introduction--docs&viewMode=docs');
    await page.locator('.rop-pro-banner a', { hasText: 'Learn more' }).click();
    await page.waitForURL(`**${base}#pro`);
    await expect(page.getByRole('heading', { level: 2, name: 'Pro' })).toBeVisible();
  });

  test('external links (GitHub) point to the repository', async ({ page }) => {
    await page.goto('');
    const hrefs = await page.locator('a[href^="http"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    expect(new Set(hrefs)).toEqual(
      new Set(['https://github.com/Utumno1984/react-object-page', ...(earlyAccessUrl ? [earlyAccessUrl] : [])]),
    );
  });
});

test.describe('early access call-to-action', () => {
  test(earlyAccessUrl ? 'the CTA is an external rel=noopener link to the form' : 'EARLY_ACCESS_URL is empty: the CTA is not in the DOM', async ({ page }) => {
    await page.goto('');
    const cta = page.getByRole('link', { name: 'Request early access' });
    if (!earlyAccessUrl) {
      await expect(cta).toHaveCount(0);
      expect(await page.locator('body').innerText()).not.toMatch(/early access/i);
      await expect(page.locator('a[href=""], a[href="#"]')).toHaveCount(0);
      return;
    }
    await expect(cta).toHaveCount(1);
    await expect(cta).toHaveAttribute('href', earlyAccessUrl);
    await expect(cta).toHaveAttribute('rel', /\bnoopener\b/);
    await expect(page.getByText('Opens an external form')).toBeVisible();
  });
});

test.describe('network and weight', () => {
  test('loading the page requests nothing outside the site origin (no embed of the form, no third party)', async ({ page }) => {
    const origin = new URL(test.info().project.use.baseURL!).origin;
    const foreign: string[] = [];
    page.on('request', (req) => {
      const url = new URL(req.url());
      if (url.protocol !== 'data:' && url.protocol !== 'blob:' && url.origin !== origin) foreign.push(req.url());
    });
    await page.goto('');
    await page.waitForLoadState('networkidle');
    expect(foreign).toEqual([]);
    await expect(page.locator('iframe, embed, object')).toHaveCount(0);
  });

  test('HTML + CSS + JS of the landing stay under 50 kB uncompressed, tokens excluded', () => {
    const size = ['index.html', 'landing.css', 'copy.js'].reduce((sum, f) => sum + statSync(`${SITE_DIR}${f}`).size, 0);
    expect(size).toBeLessThan(50_000);
  });

  test('the only scripts are the redirect (inline) and the optional copy button', async ({ page }) => {
    await page.goto('');
    const scripts = await page.locator('script').evaluateAll((els) => els.map((s) => s.getAttribute('src') ?? 'inline'));
    expect(scripts.sort()).toEqual(['copy.js', 'inline']);
    // The only absolute URLs are GitHub and, when set, the early-access form (the CTA).
    const html = readFileSync(`${SITE_DIR}index.html`, 'utf8').replace(earlyAccessUrl || '\0', '');
    expect(html).not.toMatch(/https?:\/\/(?!github\.com\/Utumno1984\/react-object-page)/);
  });
});

async function box(page: Page, selector: string) {
  const b = await page.locator(selector).first().boundingBox();
  if (!b) throw new Error(`no box for ${selector}`);
  return b;
}

test.describe('responsive', () => {
  for (const [name, width, height] of [['narrow', 320, 640], ...VIEWPORTS] as const) {
    test(`${name} ${width}px: no horizontal overflow, text readable`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('');
      const m = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        small: [...document.querySelectorAll('body *')]
          .filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim()) && (el as HTMLElement).offsetParent !== null)
          .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 14)
          .map((el) => el.tagName),
      }));
      expect(m.scrollWidth).toBeLessThanOrEqual(m.innerWidth);
      expect(m.small).toEqual([]);
      for (const sel of ['.actions .btn', '.install .code', '.card']) {
        const bs = await page.locator(sel).evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ left: r.left, right: r.right })));
        for (const b of bs) {
          expect(b.left, sel).toBeGreaterThanOrEqual(0);
          expect(b.right, sel).toBeLessThanOrEqual(width);
        }
      }
    });
  }

  test('hero buttons are stacked on mobile and side by side on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('');
    const a = await box(page, '.actions .btn:nth-child(1)');
    const b = await box(page, '.actions .btn:nth-child(2)');
    expect(Math.abs(a.x - b.x)).toBeLessThan(1);
    expect(b.y).toBeGreaterThanOrEqual(a.y + a.height);
    await page.setViewportSize({ width: 1280, height: 800 });
    const a2 = await box(page, '.actions .btn:nth-child(1)');
    const b2 = await box(page, '.actions .btn:nth-child(2)');
    expect(Math.abs(a2.y - b2.y)).toBeLessThan(1);
    expect(b2.x).toBeGreaterThan(a2.x + a2.width);
  });

  test('long button text wraps inside the button at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('');
    await page.locator('.actions .btn').first().evaluate((el) => {
      el.textContent = 'Browse the components (free, MIT) with an unreasonably long label that must wrap Supercalifragilisticexpialidocious';
    });
    const m = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      iw: window.innerWidth,
      btn: document.querySelector('.actions .btn')!.getBoundingClientRect().right,
    }));
    expect(m.sw).toBeLessThanOrEqual(m.iw);
    expect(m.btn).toBeLessThanOrEqual(m.iw);
  });

  test('opening #pro puts the section in view', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('#pro');
    const top = await page.evaluate(() => document.getElementById('pro')!.getBoundingClientRect().top);
    expect(top).toBeGreaterThanOrEqual(-1);
    expect(top).toBeLessThan(667);
    await expect(page.getByRole('heading', { level: 2, name: 'Pro' })).toBeInViewport();
  });
});

test.describe('accessibility', () => {
  test('axe: no violations (WCAG 2.x A/AA)', async ({ page }) => {
    await page.goto('');
    await expectNoA11yViolations(page);
  });

  test('document structure: lang, one h1, landmarks, heading order, no duplicate ids', async ({ page }) => {
    await page.goto('');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('banner')).toHaveCount(1);
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.getByRole('contentinfo')).toHaveCount(1);
    const levels = await page.locator('h1,h2,h3,h4,h5,h6').evaluateAll((hs) => hs.map((h) => Number(h.tagName[1])));
    expect(levels[0]).toBe(1);
    levels.forEach((l, i) => {
      if (i > 0) expect(l - (levels[i - 1] as number), `heading jump at index ${i}`).toBeLessThanOrEqual(1);
    });
    const ids = await page.locator('[id]').evaluateAll((els) => els.map((e) => e.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('skip link is the first tab stop, becomes visible, and moves to main', async ({ page }) => {
    await page.goto('');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to main content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport({ ratio: 1 });
    await page.keyboard.press('Enter');
    await expect(page.locator('main')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Browse the components (free, MIT)' })).toBeFocused();
  });

  test('every link and button shows the theme focus ring; tab order equals visual order', async ({ page }) => {
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('');
      await page.evaluate(() => {
        const probe = document.createElement('div');
        probe.id = 'probe';
        probe.style.color = 'var(--color-rop-primary)';
        document.body.append(probe);
      });
      const primary = await page.evaluate(() => getComputedStyle(document.getElementById('probe')!).color);
      const stops: { text: string; top: number; left: number; gTop: number; gLeft: number; ring: string }[] = [];
      const total = await page.locator('a[href], button:not([hidden])').count();
      for (let i = 0; i < total; i++) {
        await page.keyboard.press('Tab');
        stops.push(
          await page.evaluate(() => {
            const el = document.activeElement as HTMLElement;
            const r = el.getBoundingClientRect();
            const group = (el.closest('.card') ?? el).getBoundingClientRect();
            const cs = getComputedStyle(el);
            return {
              text: el.textContent!.trim(),
              top: r.top + scrollY,
              left: r.left,
              gTop: group.top + scrollY,
              gLeft: group.left,
              ring: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`,
            };
          }),
        );
      }
      expect(new Set(stops.map((s) => s.text)).size, 'each stop is a different element').toBe(total);
      for (const s of stops) expect(s.ring, s.text).toBe(`solid 2px ${primary}`);
      const visual = [...stops].sort((a, b) => Math.round(a.gTop) - Math.round(b.gTop) || a.gLeft - b.gLeft || Math.round(a.top) - Math.round(b.top) || a.left - b.left);
      expect(stops.map((s) => s.text), `${width}px`).toEqual(visual.map((s) => s.text));
    }
  });

  test('prefers-reduced-motion: nothing animates or transitions (and nothing does without it either)', async ({ page }) => {
    for (const reducedMotion of ['reduce', 'no-preference'] as const) {
      await page.emulateMedia({ reducedMotion });
      await page.goto('');
      expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
      const durations = await page.evaluate(() =>
        [...document.querySelectorAll('a, button, main, section')].map((e) => getComputedStyle(e).transitionDuration),
      );
      expect(new Set(durations)).toEqual(new Set(['0s']));
    }
  });
});

test.describe('install command', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test('Copy command puts the command on the clipboard and announces "Copied" in the live region that was already mounted', async ({ page }) => {
    await page.goto('');
    const status = page.locator('#copy-status');
    await expect(status).toHaveAttribute('role', 'status');
    await expect(status).toHaveText('');
    await page.getByRole('button', { name: 'Copy command' }).click();
    await expect(status).toHaveText('Copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('npm install @react-object-page/core');
  });

  test('keyboard: the button copies with Enter', async ({ page }) => {
    await page.goto('');
    await page.getByRole('button', { name: 'Copy command' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#copy-status')).toHaveText('Copied');
  });
});

test.describe('JavaScript disabled', () => {
  test.use({ javaScriptEnabled: false });

  test('the landing renders, the command stays selectable text, there is no dead button', async ({ page }) => {
    await page.goto('');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('#install-cmd')).toHaveText('npm install @react-object-page/core');
    expect(await page.locator('#install-cmd').evaluate((el) => getComputedStyle(el).userSelect)).not.toBe('none');
    await expect(page.getByRole('button', { name: 'Copy command' })).toBeHidden();
    await page.getByRole('link', { name: 'See the Pro preview' }).click();
    await page.waitForURL(`**${base}pro/`);
  });
});
