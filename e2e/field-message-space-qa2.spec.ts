import { expect, test, type Page } from '@playwright/test';
import { expectPlayToPass, gotoStory } from './helpers/story';

const ID = 'forms-field--error-reserves-space';
const tops = (page: Page) =>
  page.evaluate(() => {
    const f = document.querySelector('[data-testid="er-first"]') as HTMLElement;
    const s = document.querySelector('[data-testid="er-second"]') as HTMLElement;
    const help = f.querySelector('[id$="-help"]') as HTMLElement | null;
    const err = f.querySelector('[id$="-error"]') as HTMLElement | null;
    return {
      second: s.getBoundingClientRect().top,
      help: help ? help.getBoundingClientRect().top : null,
      err: err ? err.getBoundingClientRect().height : 0,
      first: f.getBoundingClientRect().height,
    };
  });

for (const [vp, size, dir] of [
  ['desktop', { width: 1280, height: 800 }, 'ltr'],
  ['tablet', { width: 768, height: 1024 }, 'ltr'],
  ['mobile', { width: 375, height: 667 }, 'ltr'],
  ['rtl', { width: 1280, height: 800 }, 'rtl'],
] as const) {
  test.describe('QA2 #140 ' + vp, () => {
    test.use({ viewport: size });
    for (const help of ['Some+help', '']) {
      test('reserve on, help=' + help + ': short error moves nothing, long moves by extra only', async ({ page }) => {
        await expectPlayToPass(page, ID, 'help:' + help);
        if (dir === 'rtl') await page.evaluate(() => (document.documentElement.dir = 'rtl'));
        const base = await tops(page);
        await page.getByRole('button', { name: 'Show error', exact: true }).click();
        // Retrying wait for the error to be rendered, then the layout reads.
        await expect.poll(async () => (await tops(page)).err).toBeCloseTo(16, 0);
        const short = await tops(page);
        expect(short.second).toBeCloseTo(base.second, 1);
        expect(short.help).toBe(base.help);
        expect(short.err).toBeCloseTo(16, 0);
        await page.getByRole('button', { name: 'Show long error' }).click();
        await expect.poll(async () => (await tops(page)).err).toBeGreaterThan(16);
        const long = await tops(page);
        expect(long.err).toBeGreaterThan(16);
        expect(long.second - base.second).toBeCloseTo(long.err - 16, 1);
        await page.getByRole('button', { name: 'Clear' }).click();
        await expect.poll(async () => (await tops(page)).err).toBe(0);
        expect((await tops(page)).second).toBeCloseTo(base.second, 1);
      });
      test('opt-out, help=' + help + ': error takes own room', async ({ page }) => {
        await expectPlayToPass(page, ID, 'reserveMessageSpace:!false;help:' + help);
        const base = await tops(page);
        await page.getByRole('button', { name: 'Show error', exact: true }).click();
        await expect.poll(async () => (await tops(page)).err).toBeGreaterThan(0);
        const short = await tops(page);
        expect(short.second - base.second).toBeCloseTo(short.err + 8, 1);
        await page.getByRole('button', { name: 'Clear' }).click();
        await expect.poll(async () => (await tops(page)).err).toBe(0);
        expect((await tops(page)).second).toBeCloseTo(base.second, 1);
      });
    }
  });
}

test('no empty node referenced; slot empty without error', async ({ page }) => {
  await gotoStory(page, 'forms-field--playground', 'help:;error:');
  const r = await page.evaluate(() => {
    const i = document.querySelector('input')!;
    return { d: i.getAttribute('aria-describedby'), slotChildren: document.querySelector('[data-field-error-slot]')!.childElementCount };
  });
  expect(r.d).toBeNull();
  expect(r.slotChildren).toBe(0);
});
