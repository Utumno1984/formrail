import { expect, test, type Page } from '@playwright/test';
import { makeDemoInvoices } from '../packages/core/src/internal/demo-invoices';
import { expectPlayToPass, gotoStory } from './helpers/story';

// #500: numbers of the default count / selection text / "Select all N results" follow the `locale` of useListReport.
const FREE = 'floorplans-list-report--locale-count';
const FREE_NO_PLAY = 'floorplans-list-report--locale-count-no-play';
const TOTAL = 1200;
const PRO = 'pro-floorplans-virtual-list-report--default-no-play';

const fmt = (locale: string, n: number) => new Intl.NumberFormat(locale).format(n);
const FERRARI = makeDemoInvoices(TOTAL).filter((r) => r.supplier.includes('Ferrari')).length;
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const count = (page: Page) => page.locator('[data-rop-count]');

test.describe('Free ListReport: locale-formatted count and selection text', () => {
  for (const locale of ['en-US', 'de-DE', 'fr-FR']) {
    test(`play passes and the count follows ${locale}`, async ({ page }) => {
      await expectPlayToPass(page, FREE, `locale:${locale}`);
      const total = fmt(locale, TOTAL).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[\u00a0\u202f ]/g, '\\s');
      await expect(count(page)).toHaveText(new RegExp(`^\\(.+ of ${total}\\)$`));
      const selection = page.locator('[data-rop-selection-count]');
      await expect(selection).toHaveText(
        new RegExp(`^${escape(fmt(locale, FERRARI))} selected \\(${escape(fmt(locale, TOTAL - FERRARI))} hidden by filters\\)$`.replace(/[\u00a0\u202f]/g, '\\s')),
      );
      // The regex accepts any space: the exact characters of Intl are checked on the raw text.
      expect(await selection.textContent()).toBe(`${fmt(locale, FERRARI)} selected (${fmt(locale, TOTAL - FERRARI)} hidden by filters)`);
    });
  }

  for (const locale of ['en-US', 'de-DE', 'fr-FR']) {
    test(`the live region announces the number of results in ${locale}, the same number as the visible count`, async ({ page }) => {
      await gotoStory(page, FREE_NO_PLAY, `locale:${locale}`);
      await expect(count(page)).toHaveText(`(${fmt(locale, TOTAL)})`);
      await page.getByRole('searchbox', { name: 'Search' }).fill('Ferrari');
      await page.keyboard.press('Enter');
      await expect(count(page)).toHaveText(`(${fmt(locale, FERRARI)} of ${fmt(locale, TOTAL)})`);
      const live = page.locator('[aria-live="polite"]');
      await expect(live).toHaveText(`${fmt(locale, FERRARI)} results`.replace(/[\u00a0\u202f]/g, ' '));
      // toHaveText folds every kind of space: the exact text (fr-FR: U+202F) is checked on the raw text.
      expect(await live.textContent()).toBe(`${fmt(locale, FERRARI)} results`);
      // Below 1,000 the formatter changes nothing: clear the search so the announced number has a separator.
      await page.getByRole('searchbox', { name: 'Search' }).fill('');
      await page.keyboard.press('Enter');
      await expect(count(page)).toHaveText(`(${fmt(locale, TOTAL)})`);
      expect(await live.textContent()).toBe(`${fmt(locale, TOTAL)} results`);
    });
  }

  test('a long custom labels.count wraps inside the pill: no horizontal overflow of the page at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await gotoStory(page, 'floorplans-list-report--locale-count-long-label', 'locale:de-DE;containerWidth:320');
    await expect(count(page)).toHaveText('Showing 1200 of 1200 invoices matching the filters');
    expect(await count(page).evaluate((el) => getComputedStyle(el).whiteSpace)).toBe('normal');
    expect(await count(page).evaluate((el) => el.getBoundingClientRect().width)).toBeLessThanOrEqual(320);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test('de-DE: "(1.200)" at rest; the count is a single box at 320px (no wrap inside the number)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await gotoStory(page, FREE_NO_PLAY, 'locale:de-DE;containerWidth:320');
    await expect(count(page)).toHaveText('(1.200)');
    expect(await count(page).evaluate((el) => el.getClientRects().length)).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test('fr-FR: the narrow no-break space never breaks the count', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await gotoStory(page, FREE_NO_PLAY, 'locale:fr-FR;containerWidth:320');
    await expect(count(page)).toHaveText(new RegExp(`^\\(${fmt('fr-FR', TOTAL).replace(/[\u00a0\u202f ]/g, '\\s')}\\)$`));
    expect(await count(page).evaluate((el) => el.getClientRects().length)).toBe(1);
  });

  for (const vp of [
    { width: 375, height: 667 },
    { width: 768, height: 1024 },
    { width: 1280, height: 800 },
  ]) {
    test(`${vp.width}x${vp.height}: loading -> 1,200 rows keeps the header height and the table box`, async ({ page }) => {
      await page.setViewportSize(vp);
      await gotoStory(page, FREE_NO_PLAY, 'locale:en-US;containerWidth:1280');
      await expect(count(page)).toHaveText('(1,200)');
      const measure = () =>
        page.evaluate(() => {
          const header = document.querySelector('[data-rop-count]')!.closest('h1,h2,h3,h4,h5,h6')!.parentElement!.getBoundingClientRect();
          const scroller = document.querySelector('table')!.parentElement!.getBoundingClientRect();
          return { header: header.height, top: scroller.top, height: scroller.height, width: scroller.width };
        });
      const ready = await measure();
      await page.getByRole('button', { name: 'Simulate loading' }).click();
      await expect(count(page)).toBeHidden();
      const loading = await measure();
      expect(Math.abs(loading.header - ready.header)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(loading.top - ready.top)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(loading.height - ready.height)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(loading.width - ready.width)).toBeLessThanOrEqual(0.5);
    });
  }
});

test.describe('Pro VirtualListReport: locale-formatted count and "Select all N results"', () => {
  for (const locale of ['en-US', 'de-DE', 'fr-FR']) {
    test(`play (search, select a row, "Select all n results", "n selected") passes in ${locale}`, async ({ page }) => {
      await expectPlayToPass(page, 'pro-floorplans-virtual-list-report--locale-count', `locale:${locale}`);
    });
  }

  test('en-US: "(100,000)" and "Select all 100,000 results"', async ({ page }) => {
    await gotoStory(page, PRO, 'locale:en-US');
    await expect(count(page)).toHaveText('(100,000)');
    await page.getByRole('checkbox', { name: 'Select INV-000003' }).click();
    await expect(page.getByRole('button', { name: 'Select all 100,000 results' })).toBeVisible();
    await expect(page.locator('[data-rop-selection-count]')).toHaveText('1 selected');
  });

  test('de-DE: count and action use the dot; switching the locale does not flash nor move anything', async ({ page }) => {
    await gotoStory(page, PRO, 'locale:de-DE');
    await expect(count(page)).toHaveText('(100.000)');
    await page.getByRole('checkbox', { name: 'Select INV-000003' }).click();
    await expect(page.getByRole('button', { name: 'Select all 100.000 results' })).toBeVisible();
    await expect(count(page)).not.toHaveAttribute('data-changed', '');
  });

  for (const vp of [
    { width: 375, height: 667 },
    { width: 768, height: 1024 },
    { width: 1280, height: 800 },
  ]) {
    test(`${vp.width}x${vp.height}: the header and the table box do not depend on the length of the formatted number`, async ({ page }) => {
      await page.setViewportSize(vp);
      const boxes: { header: number; top: number; height: number }[] = [];
      for (const locale of ['en-US', 'de-DE', 'fr-FR']) {
        await gotoStory(page, PRO, `locale:${locale};rowCount:1000`);
        await expect(count(page)).toHaveText(`(${fmt(locale, 1000)})`);
        boxes.push(
          await page.evaluate(() => {
            const header = document.querySelector('[data-rop-count]')!.closest('h1,h2,h3,h4,h5,h6')!.parentElement!.getBoundingClientRect();
            const table = document.querySelector('table')!.parentElement!.getBoundingClientRect();
            return { header: header.height, top: table.top, height: table.height };
          }),
        );
      }
      for (const b of boxes) {
        expect(Math.abs(b.header - boxes[0]!.header)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(b.top - boxes[0]!.top)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(b.height - boxes[0]!.height)).toBeLessThanOrEqual(0.5);
      }
    });
  }
});
