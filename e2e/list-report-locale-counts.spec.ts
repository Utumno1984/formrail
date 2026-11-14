import { expect, test, type Page } from '@playwright/test';
import { expectPlayToPass, gotoStory } from './helpers/story';

// #500: numbers of the default count / selection text / "Select all N results" follow the `locale` of useListReport.
const FREE = 'floorplans-list-report--locale-count';
const PRO = 'pro-floorplans-virtual-list-report--default-no-play';

const fmt = (locale: string, n: number) => new Intl.NumberFormat(locale).format(n);
const count = (page: Page) => page.locator('[data-rop-count]');

test.describe('Free ListReport: locale-formatted count and selection text', () => {
  for (const locale of ['en-US', 'de-DE', 'fr-FR']) {
    test(`play passes and the count follows ${locale}`, async ({ page }) => {
      await expectPlayToPass(page, FREE, `locale:${locale}`);
      const total = fmt(locale, 10_000).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      await expect(count(page)).toHaveText(new RegExp(`^\\(.+ of ${total}\\)$`));
      await expect(page.locator('[data-rop-selection-count]')).toHaveText('1 selected');
    });
  }

  test('de-DE: "(10.000)" at rest; the count is a single box at 320px (no wrap inside the number)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await gotoStory(page, FREE, 'locale:de-DE;containerWidth:320');
    await expect(count(page)).toHaveText('(10.000)');
    expect(await count(page).evaluate((el) => el.getClientRects().length)).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test('fr-FR: the narrow no-break space never breaks the count', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await gotoStory(page, FREE, 'locale:fr-FR;containerWidth:320');
    await expect(count(page)).toHaveText(`(${fmt('fr-FR', 10_000)})`);
    expect(await count(page).evaluate((el) => el.getClientRects().length)).toBe(1);
  });

  for (const vp of [
    { width: 375, height: 667 },
    { width: 768, height: 1024 },
    { width: 1280, height: 800 },
  ]) {
    test(`${vp.width}x${vp.height}: loading -> 10,000 rows keeps the header height and the table box`, async ({ page }) => {
      await page.setViewportSize(vp);
      await gotoStory(page, FREE, 'locale:en-US;containerWidth:1280');
      await expect(count(page)).toHaveText('(10,000)');
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
