import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
// @ts-expect-error plain .mjs helper shared with the assembler and the server, no type declarations
import { EARLY_ACCESS_URL, EXPECTED_PRICE_TEXT, PRIVACY_EMAIL, SITE_BASE } from '../../scripts/site-config.mjs';
import { expectNoA11yViolations } from '../helpers/a11y';

// Pre-deploy smoke of the Pro page for teams (/teams/) and of the privacy page (/privacy/), ticket #490.
// Runs against the assembled `site/` with whatever scripts/site-config.mjs holds: placeholders in PR builds,
// the real values at deploy time (the assertions read the constants, they never hard-code them).

const base = SITE_BASE as string;
const earlyAccessUrl = EARLY_ACCESS_URL as string;
const priceText = EXPECTED_PRICE_TEXT as string;
const privacyEmail = PRIVACY_EMAIL as string;
const SITE_DIR = fileURLToPath(new URL('../../site/', import.meta.url));

// Pro features that exist (spec §3, stories in packages/pro). Anything else must not be offered.
const BUILT_PRO_FEATURES = ['Change Summary', 'Form Rebase', 'Rebase notice', 'Virtual List Report'];
const NOT_BUILT = [
  /advanced dirty/i,
  /robust dirty/i,
  /async(hronous)? combobox/i,
  /combobox/i,
  /picker/i,
  /embedded grid/i,
  /bulk action/i,
  /soft[- ]?delete/i,
];
const OFFICIAL_POLICIES = [
  'https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement',
  'https://tally.so/help/gdpr',
  'https://tally.so/help/privacy-policy',
];
const THIRD_PARTY = [
  'sap',
  'fiori',
  'ui5',
  'salesforce',
  'lightning',
  'material',
  'ant design',
  'antd',
  'microsoft',
  'fluent',
  'atlassian',
  'carbon',
  'polaris',
  'oracle',
];

test.describe('Pro page for teams: content', () => {
  test('shows the message, Free vs Pro, the license scheme and the waitlist CTA, in one h1', async ({ page }) => {
    await page.goto('teams/');
    await expect(page.getByRole('heading', { level: 1, name: 'Formrail Pro for teams' })).toBeVisible();
    await expect(page.locator('.lead')).toContainText('Record-edit integrity');
    await expect(
      page.getByRole('heading', {
        level: 2,
        name: 'Edit records without losing work',
      }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Free and Pro' })).toBeVisible();
    const license = page.locator('#license');
    await expect(license.getByRole('heading', { level: 2, name: 'License' })).toBeVisible();
    await expect(license).toContainText('Annual license per developer, 12 months of updates included, terms published before sales.');
    await expect(license).toContainText('not a binding offer');
    await expect(license).toContainText('no payment or pre-order is taken');
    await expect(page.getByRole('heading', { level: 2, name: 'Join the waitlist' })).toBeVisible();
  });

  test('the wording names no third-party product, nor React Hook Form / TanStack (ticket #489 is not closed)', async ({ page }) => {
    for (const url of ['teams/', 'privacy/']) {
      await page.goto(url);
      const text = (await page.locator('body').innerText()).toLowerCase();
      const html = (await page.content()).toLowerCase();
      for (const word of THIRD_PARTY) {
        expect(new RegExp(`\\b${word}\\b`).test(text), `${url} text mentions "${word}"`).toBe(false);
        expect(new RegExp(`\\b${word}\\b`).test(html), `${url} markup mentions "${word}"`).toBe(false);
      }
      for (const word of ['react hook form', 'react-hook-form', 'tanstack', 'hookform']) {
        expect(text.includes(word) || html.includes(word), `${url} mentions ${word}`).toBe(false);
      }
    }
  });

  test('only built Pro features are offered: the feature list is a subset of the allowed one, each backed by a story link', async ({ page }) => {
    await page.goto('teams/');
    const cards = await page.locator('.cards h3').allInnerTexts();
    expect(cards).toEqual(['Change Summary', 'Form Rebase', 'Virtual List Report']);
    const rows = await page.locator('.compare tbody th[scope="row"]').allInnerTexts();
    const proRows = rows.filter((r) => !/List Report, Object Page|License/.test(r));
    for (const row of proRows) {
      expect(
        BUILT_PRO_FEATURES.some((f) => row.includes(f)),
        `table row "${row}"`,
      ).toBe(true);
    }
    const text = await page.locator('body').innerText();
    for (const pattern of NOT_BUILT) expect(text, String(pattern)).not.toMatch(pattern);
  });

  test('every demo link opens a rendered docs page of the Pro build', async ({ page }) => {
    test.slow(); // five Storybook documents loaded one after the other
    await page.goto('teams/');
    const hrefs = await page.locator('.demo-links a').evaluateAll((as) => as.map((a) => a.getAttribute('href')!));
    expect(hrefs.length).toBeGreaterThanOrEqual(5);
    for (const href of hrefs) {
      expect(href, 'a Pro story link').toMatch(/^\.\.\/pro\/\?path=\/docs\/pro-[\p{L}\p{N}-]+--docs$/u);
      await page.goto(`teams/${href}`);
      const id = new URL(page.url()).searchParams.get('path')!.replace('/docs/', '');
      const frame = page.frameLocator('#storybook-preview-iframe');
      await expect(page.locator('#storybook-preview-iframe'), href).toHaveAttribute('src', new RegExp(`id=${id}&viewMode=docs`), {
        timeout: 30_000,
      });
      await expect(frame.locator('.sbdocs-content'), href).toBeVisible({
        timeout: 30_000,
      });
      await expect(frame.getByRole('heading', { level: 1 }).first(), href).toBeVisible();
    }
  });

  test('the Free/Pro comparison is a real table: column and row headers, caption, a cell for every header', async ({ page }) => {
    await page.goto('teams/');
    const table = page.getByRole('table', {
      name: 'What the free core and Formrail Pro include',
    });
    await expect(table.getByRole('columnheader')).toHaveText(['Feature', 'Free', 'Pro']);
    const rowHeaders = table.getByRole('rowheader');
    expect(await rowHeaders.count()).toBeGreaterThanOrEqual(5);
    await expect(page.locator('.compare th[scope="col"]')).toHaveCount(3);
    await expect(page.locator('.compare tbody th[scope="row"]')).toHaveCount(await rowHeaders.count());
    for (const row of await page.locator('.compare tbody tr').all()) await expect(row.locator('td')).toHaveCount(2);
  });

  test('home: the nav and the Pro section lead to the page; Back returns to the home', async ({ page }) => {
    await page.goto('');
    await expect(page.locator('nav').getByRole('link', { name: 'Pro for teams' })).toHaveAttribute('href', 'teams/');
    await page.getByRole('link', { name: 'See Formrail Pro for teams' }).click();
    await page.waitForURL(`**${base}teams/`);
    await expect(page.getByRole('heading', { level: 1, name: 'Formrail Pro for teams' })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${base}$`));
    await page.locator('nav').getByRole('link', { name: 'Pro for teams' }).click();
    await page.waitForURL(`**${base}teams/`);
  });

  test('the Pro preview button goes to the demo; Back returns here', async ({ page }) => {
    await page.goto('teams/');
    await page.getByRole('link', { name: 'Explore the Pro preview' }).click();
    await page.waitForURL(`**${base}pro/`);
    await expect(page.locator('#storybook-preview-iframe')).toBeAttached();
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${base}teams/$`));
  });

  test('the demo banner "Learn more" returns here', async ({ page }) => {
    await page.goto('pro/iframe.html?id=pro-introduction--docs&viewMode=docs');
    await page.locator('.rop-pro-banner a', { hasText: 'Learn more' }).click();
    await page.waitForURL(`**${base}teams/`);
  });

  test('#license and #waitlist put their section in view', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    for (const [hash, heading] of [
      ['#license', 'License'],
      ['#waitlist', 'Join the waitlist'],
    ] as const) {
      await page.goto(`teams/${hash}`);
      const top = await page.evaluate((id) => document.getElementById(id)!.getBoundingClientRect().top, hash.slice(1));
      expect(top, hash).toBeGreaterThanOrEqual(-1);
      expect(top, hash).toBeLessThan(667);
      await expect(page.getByRole('heading', { level: 2, name: heading })).toBeInViewport();
    }
  });
});

test.describe('price', () => {
  test(
    priceText ? 'the price is the single constant, shown once and labelled indicative' : 'no price constant: no figure with a currency',
    async ({ page }) => {
      await page.goto('teams/');
      const text = await page.locator('body').innerText();
      if (!priceText) {
        expect(text).not.toMatch(/[€$£]\s?\d|\d\s?(EUR|USD)|indicative/);
        return;
      }
      expect(priceText).toBe('Expected price: from €199 per developer/year');
      await expect(page.locator('.price')).toHaveCount(1);
      await expect(page.locator('.price')).toHaveText(priceText);
      await expect(page.locator('#license')).toContainText('The price is indicative and not final.');
      expect(text.split(priceText).length - 1).toBe(1);
    },
  );

  test('no other page of the site shows a price', async ({ page }) => {
    for (const url of ['', 'privacy/']) {
      await page.goto(url);
      expect(await page.locator('body').innerText(), url).not.toMatch(/[€$£]\s?\d|\d\s?(EUR|USD)/);
    }
  });
});

test.describe('waitlist call-to-action', () => {
  test(
    earlyAccessUrl
      ? 'the CTA is an external rel=noopener link to the form, with the data note and the privacy link'
      : 'EARLY_ACCESS_URL is empty: no CTA in the DOM',
    async ({ page }) => {
      await page.goto('teams/');
      const cta = page.getByRole('link', { name: 'Request early access' });
      if (!earlyAccessUrl) {
        await expect(cta).toHaveCount(0);
        await expect(page.getByRole('link', { name: 'Join the waitlist' })).toHaveCount(0);
        expect(await page.locator('body').innerText()).not.toMatch(/early access|waitlist|external form/i);
        await expect(page.locator('a[href=""], a[href="#"], a[href="#waitlist"]')).toHaveCount(0);
        return;
      }
      await expect(cta).toHaveCount(1);
      await expect(cta).toHaveAttribute('href', earlyAccessUrl);
      await expect(cta).toHaveAttribute('target', '_blank');
      await expect(cta).toHaveAttribute('rel', /\bnoopener\b/);
      const note = page.locator('#waitlist .cta');
      await expect(note).toContainText('Opens an external form (Tally, servers in the EU)');
      await expect(note).toContainText('nothing is embedded');
      await expect(note.getByRole('link', { name: 'privacy page' })).toHaveAttribute('href', '../privacy/');
      await expect(note).toContainText('consent');
    await expect(note).toContainText('your email to contact you about Formrail Pro early access and your answers to plan the product');
      await expect(note).toContainText('its size');
      await expect(page.getByRole('link', { name: 'Join the waitlist' })).toHaveAttribute('href', '#waitlist');
    },
  );

  test('the home CTA also links the privacy page', async ({ page }) => {
    test.skip(!earlyAccessUrl, 'no CTA without a URL');
    await page.goto('');
    await expect(page.locator('#pro .cta').getByRole('link', { name: 'privacy page' })).toHaveAttribute('href', 'privacy/');
  });
});

test.describe('privacy page', () => {
  test('has the decided items, as headings, with the controller and the no cookies / no analytics statement', async ({ page }) => {
    await page.goto('privacy/');
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy notice' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2 })).toHaveText([
      'Data controller',
      'Data we collect',
      'Purpose and legal basis',
      'Where the data goes',
      'Transfers outside the EEA',
      'Retention',
      'Your rights',
      'No cookies, no analytics',
    ]);
    const main = page.locator('main');
    await expect(main).toContainText('Daniele Ingusci');
    const fields = main.locator('#data-title + p + ul li');
    await expect(fields).toHaveText([
      /email address \(required\)/,
      /size of your team \(required\)/,
      /when you would need Formrail Pro \(required\)/,
      /form libraries you use today \(optional, you can pick several\)/,
      /your consent .* \(required\)/,
    ]);
    await expect(main).toContainText('Without the required fields the form cannot be submitted');
    await expect(main).not.toContainText('Giving it is optional');
    await expect(main).toContainText('art. 6(1)(a)');
    await expect(main.locator('#purpose-title + p + ul li')).toHaveText([
      /contact you.*Formrail Pro early access/,
      /answers \(team size, form libraries, timing\) to plan the product/,
    ]);
    await expect(main).toContainText(
      'I agree that Formrail may use my email address to contact me about Formrail Pro early access, and my answers to plan the product, as described in the privacy notice above.',
    );
    await expect(main).toContainText('withdraw your consent at any time');
    await expect(main).toContainText('not copied to email or to any other service');
    await expect(main).toContainText('GitHub Pages');
    const transfers = main.locator('#transfers-title ~ p');
    await expect(transfers.nth(0)).toContainText('GitHub Inc., USA');
    await expect(transfers.nth(0)).toContainText('independent controller');
    await expect(transfers.nth(0)).toContainText('EU-US Data Privacy Framework');
    await expect(transfers.nth(1)).toContainText('Tally BV, Belgium');
    await expect(transfers.nth(1)).toContainText('stores the responses in the European Union');
    await expect(transfers.nth(1)).toContainText('outside the EEA');
    await expect(transfers.nth(1)).not.toContainText(/standard contractual clauses/i);
    const githubPolicy = main.getByRole('link', { name: 'privacy statement' });
    const tallyPolicy = main.getByRole('link', { name: 'privacy policy' });
    await expect(githubPolicy).toHaveAttribute(
      'href',
      'https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement',
    );
    const tallyGdpr = main.getByRole('link', { name: 'GDPR page' });
    await expect(tallyPolicy).toHaveAttribute('href', 'https://tally.so/help/privacy-policy');
    await expect(tallyGdpr).toHaveAttribute('href', 'https://tally.so/help/gdpr');
    await expect(tallyGdpr).toHaveAttribute('rel', /noopener/);
    // The old, dead URL must be gone.
    await expect(main.locator('a[href="https://tally.so/privacy-policy"]')).toHaveCount(0);
    expect(await main.innerHTML()).not.toContain('https://tally.so/privacy-policy"');
    await expect(githubPolicy).toHaveAttribute('rel', /noopener/);
    await expect(tallyPolicy).toHaveAttribute('rel', /noopener/);
    // No postal address: the contact is the email only.
    await expect(main).not.toContainText(/postal address/i);
    await expect(main).toContainText('no later than 24 months after sign-up, or earlier if you withdraw your consent');
    await expect(main).not.toContainText('once a year');
    await expect(main).toContainText('Formrail is a project by Daniele Ingusci');
    await expect(main).not.toContainText('12 months after');
    await expect(main).toContainText('not checked');
    await expect(main).toContainText('servers in the European Union');
    await expect(main).toContainText('sets no cookies and runs no analytics');
    await expect(main.getByRole('link', { name: privacyEmail })).toHaveAttribute('href', `mailto:${privacyEmail}`);
  });

  test('every page of the site links to it from the footer; the 404 page too', async ({ page }) => {
    const expected: Record<string, string> = {
      '': 'privacy/',
      'teams/': '../privacy/',
      'privacy/': './',
    };
    for (const [url, href] of Object.entries(expected)) {
      await page.goto(url);
      const link = page.getByRole('contentinfo').getByRole('link', { name: 'Privacy' });
      await expect(link, url).toHaveAttribute('href', href);
      await expect(page.getByRole('contentinfo'), url).not.toContainText('terms to be defined');
    }
    const res = await page.goto('does-not-exist/');
    expect(res?.status()).toBe(404);
    await expect(page.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', `${base}privacy/`);
    await page.getByRole('link', { name: 'Privacy' }).click();
    await page.waitForURL(`**${base}privacy/`);
  });

  test('the footer carries the decided license wording on every page', async ({ page }) => {
    for (const url of ['', 'teams/', 'privacy/']) {
      await page.goto(url);
      await expect(page.getByRole('contentinfo'), url).toContainText(
        'Formrail Pro: Annual license per developer, 12 months of updates included, terms published before sales.',
      );
    }
  });
});

test.describe('public wording matches the privacy notice', () => {
  test('no page says the data is used "only" to contact people; the CTA notes name both purposes', async ({ page }) => {
    for (const url of ['', 'teams/', 'privacy/']) {
      await page.goto(url);
      const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
      expect(text, url).not.toMatch(/only to contact|only use your answers/i);
    }
    test.skip(!earlyAccessUrl, 'no CTA note without a URL');
    await page.goto('');
    await expect(page.locator('#pro .cta')).toContainText('your answers to plan the product');
    await expect(page.locator('#pro .cta')).toContainText('privacy page');
  });

  test('the license sentence of the footers is the decided one, letter for letter', async ({ page }) => {
    for (const url of ['', 'teams/', 'privacy/']) {
      await page.goto(url);
      const footer = (await page.getByRole('contentinfo').innerText()).replace(/\s+/g, ' ');
      expect(footer, url).toContain('Annual license per developer, 12 months of updates included, terms published before sales.');
    }
  });
});

test.describe('network and weight', () => {
  for (const url of ['teams/', 'privacy/']) {
    test(`${url}: requests nothing outside the site origin, sets no cookie, embeds nothing`, async ({ page, context }) => {
      const origin = new URL(test.info().project.use.baseURL!).origin;
      const foreign: string[] = [];
      page.on('request', (req) => {
        const u = new URL(req.url());
        if (u.protocol !== 'data:' && u.protocol !== 'blob:' && u.origin !== origin) foreign.push(req.url());
      });
      await page.goto(url);
      await page.waitForLoadState('networkidle');
      expect(foreign).toEqual([]);
      await expect(page.locator('iframe, embed, object, script')).toHaveCount(0);
      expect(await context.cookies()).toEqual([]);
      expect(await page.evaluate(() => document.cookie)).toBe('');
    });
  }

  test('HTML + CSS of each new page stay under 50 kB uncompressed, tokens excluded', () => {
    for (const file of ['teams/index.html', 'privacy/index.html']) {
      const size = statSync(`${SITE_DIR}${file}`).size + statSync(`${SITE_DIR}landing.css`).size;
      expect(size, file).toBeLessThan(50_000);
    }
  });

  test('the only absolute URLs are GitHub and, when set, the form (the email is a mailto)', () => {
    for (const file of ['teams/index.html', 'privacy/index.html']) {
      let html = readFileSync(`${SITE_DIR}${file}`, 'utf8').replace(earlyAccessUrl || '\0', '');
      // Only the privacy page may carry the two official policy links (art. 13(1)(f)).
      if (file.startsWith('privacy')) for (const url of OFFICIAL_POLICIES) html = html.replace(url, '');
      expect(html, file).not.toMatch(/https?:\/\/(?!github\.com\/Utumno1984\/formrail)/);
    }
  });
});

async function box(page: Page, selector: string) {
  const b = await page.locator(selector).first().boundingBox();
  if (!b) throw new Error(`no box for ${selector}`);
  return b;
}

test.describe('responsive', () => {
  for (const url of ['teams/', 'privacy/']) {
    for (const [name, width, height] of [
      ['narrow', 320, 640],
      ['small phone', 375, 667],
      ['tablet', 768, 1024],
      ['desktop', 1280, 800],
    ] as const) {
      test(`${url} ${name} ${width}px: no horizontal overflow, text readable, content inside the viewport`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await page.goto(url);
        const m = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
          small: [...document.querySelectorAll('body *')]
            .filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim()) && (el as HTMLElement).offsetParent !== null)
            .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 14)
            .map((el) => el.tagName),
          outside: [...document.querySelectorAll('main *, footer *')]
            .filter((el) => (el as HTMLElement).offsetParent !== null && !el.closest('.visually-hidden') && !el.classList.contains('visually-hidden'))
            .map((el) => el.getBoundingClientRect())
            .filter((r) => r.width > 0 && (r.left < 0 || r.right > window.innerWidth + 0.5)).length,
        }));
        expect(m.scrollWidth).toBeLessThanOrEqual(m.innerWidth);
        expect(m.small).toEqual([]);
        expect(m.outside).toBe(0);
      });
    }
  }

  test('teams: hero buttons are stacked on mobile, side by side on desktop', async ({ page }) => {
    test.skip(!earlyAccessUrl, 'the hero button needs the URL');
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('teams/');
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

  test('teams: the CTA button is full width on mobile and a long label wraps inside it at 320px', async ({ page }) => {
    test.skip(!earlyAccessUrl, 'no CTA without a URL');
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('teams/');
    await page.locator('#waitlist .btn').evaluate((el) => {
      el.textContent = 'Request early access with an unreasonably long label that must wrap Supercalifragilisticexpialidocious';
    });
    const m = await page.evaluate(() => {
      const r = document.querySelector('#waitlist .btn')!.getBoundingClientRect();
      return {
        sw: document.documentElement.scrollWidth,
        iw: window.innerWidth,
        left: r.left,
        right: r.right,
        height: r.height,
      };
    });
    expect(m.sw).toBeLessThanOrEqual(m.iw);
    expect(m.left).toBeGreaterThanOrEqual(0);
    expect(m.right).toBeLessThanOrEqual(m.iw);
    expect(m.height).toBeGreaterThan(44);
  });

  test('teams: no word of the Free/Pro table is split across lines (320, 375, 768px) and nothing overflows sideways', async ({ page }) => {
    for (const width of [320, 375, 768]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('teams/');
      const split = await page.evaluate(() => {
        const broken: string[] = [];
        for (const cell of document.querySelectorAll('.compare th, .compare td')) {
          const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const text = node.textContent ?? '';
            for (const match of text.matchAll(/[^\s-]+/g)) {
              const range = document.createRange();
              range.setStart(node, match.index!);
              range.setEnd(node, match.index! + match[0].length);
              const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
              if (lines.size > 1) broken.push(match[0]);
            }
          }
        }
        return { broken, sw: document.documentElement.scrollWidth, iw: window.innerWidth };
      });
      expect(split.broken, `${width}px`).toEqual([]);
      expect(split.sw, `${width}px`).toBeLessThanOrEqual(split.iw);
    }
  });

  test('teams: the license line and the table cells are readable (>= 14px) and inside the viewport at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('teams/');
    for (const sel of ['.license-line', '.compare', '.compare td', '.compare th']) {
      const rects = await page.locator(sel).evaluateAll((els) =>
        els.map((e) => ({
          right: e.getBoundingClientRect().right,
          size: parseFloat(getComputedStyle(e).fontSize),
        })),
      );
      for (const r of rects) {
        expect(r.right, sel).toBeLessThanOrEqual(320);
        expect(r.size, sel).toBeGreaterThanOrEqual(14);
      }
    }
  });
});

test.describe('accessibility', () => {
  for (const url of ['teams/', 'privacy/']) {
    test(`${url}: axe finds no violation (WCAG 2.x A/AA)`, async ({ page }) => {
      await page.goto(url);
      await expectNoA11yViolations(page);
    });

    test(`${url}: lang, one h1, landmarks, heading order, unique ids, current page marked`, async ({ page }) => {
      await page.goto(url);
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
      await expect(page.locator('[aria-current="page"]')).not.toHaveCount(0);
    });

    test(`${url}: skip link is the first tab stop, becomes visible and moves to main`, async ({ page }) => {
      await page.goto(url);
      await page.keyboard.press('Tab');
      const skip = page.getByRole('link', { name: 'Skip to main content' });
      await expect(skip).toBeFocused();
      await expect(skip).toBeInViewport({ ratio: 1 });
      await page.keyboard.press('Enter');
      await expect(page.locator('main')).toBeFocused();
    });

    test(`${url}: every link shows the theme focus ring; tab order equals visual order (375 and 1280px)`, async ({ page }) => {
      for (const width of [375, 1280]) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(url);
        const primary = await page.evaluate(() => {
          const probe = document.createElement('div');
          probe.style.color = 'var(--color-rop-primary)';
          document.body.append(probe);
          return getComputedStyle(probe).color;
        });
        const stops: {
          text: string;
          top: number;
          left: number;
          gTop: number;
          gLeft: number;
          ring: string;
        }[] = [];
        const total = await page.locator('a[href]').count();
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
        const keys = stops.map((s) => `${s.text}|${Math.round(s.top)}|${Math.round(s.left)}`);
        expect(new Set(keys).size, 'each stop is a different element').toBe(total);
        for (const s of stops) expect(s.ring, s.text).toBe(`solid 2px ${primary}`);
        const visual = [...stops].sort(
          (a, b) => Math.round(a.gTop) - Math.round(b.gTop) || a.gLeft - b.gLeft || Math.round(a.top) - Math.round(b.top) || a.left - b.left,
        );
        expect(
          stops.map((s) => s.text),
          `${url} ${width}px`,
        ).toEqual(visual.map((s) => s.text));
      }
    });

    test(`${url}: prefers-reduced-motion: nothing animates or transitions`, async ({ page }) => {
      for (const reducedMotion of ['reduce', 'no-preference'] as const) {
        await page.emulateMedia({ reducedMotion });
        await page.goto(url);
        expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
        const durations = await page.evaluate(() =>
          [...document.querySelectorAll('a, main, section')].map((e) => getComputedStyle(e).transitionDuration),
        );
        expect(new Set(durations)).toEqual(new Set(['0s']));
      }
    });
  }
});

test.describe('JavaScript disabled', () => {
  test.use({ javaScriptEnabled: false });

  test('the page is complete and the CTA is a plain link', async ({ page }) => {
    await page.goto('teams/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('#license')).toBeVisible();
    await expect(page.getByRole('table')).toBeVisible();
    if (earlyAccessUrl) {
      await expect(page.getByRole('link', { name: 'Request early access' })).toHaveAttribute('href', earlyAccessUrl);
      await page.getByRole('link', { name: 'Join the waitlist' }).click();
      await expect(page).toHaveURL(/#waitlist$/);
    }
    await page.getByRole('link', { name: 'privacy page' }).first().click();
    await page.waitForURL(`**${base}privacy/`);
    await expect(page.getByRole('heading', { level: 2, name: 'No cookies, no analytics' })).toBeVisible();
  });
});

test.describe('old links and redirects', () => {
  test('/teams and /privacy without a slash end on the page; deep Storybook links still redirect', async ({ page }) => {
    await page.goto(`${base}teams`);
    await expect(page).toHaveURL(new RegExp(`${base}teams/$`));
    await page.goto(`${base}privacy`);
    await expect(page).toHaveURL(new RegExp(`${base}privacy/$`));
    await page.goto('?path=/docs/forms-field--docs');
    await page.waitForURL(`**${base}storybook/?path=/docs/forms-field--docs`);
  });

  test('teams/ keeps foreign parameters and a hash without any redirect', async ({ page }) => {
    await page.goto('teams/?utm_source=newsletter#license');
    expect(new URL(page.url()).pathname).toBe(`${base}teams/`);
    expect(new URL(page.url()).search).toBe('?utm_source=newsletter');
    await expect(page.getByRole('heading', { level: 1, name: 'Formrail Pro for teams' })).toBeVisible();
  });
});
