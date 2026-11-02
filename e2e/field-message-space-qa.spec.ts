import { expect, test, type Page } from '@playwright/test';
import { gotoStory } from './helpers/story';

const PG = 'forms-field--playground';
const SHORT = 'Enter+a+valid+value';
const LONG = 'x'.repeat(120);

async function fieldInfo(page: Page) {
  return page.locator('[data-field-error-slot]').evaluate((m) => {
    const field = m.parentElement as HTMLElement;
    const input = field.querySelector('input') as HTMLInputElement;
    const ids = (input.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
    return {
      fieldHeight: field.getBoundingClientRect().height,
      scrollOverflow: field.scrollWidth - field.clientWidth,
      msgHeight: m.getBoundingClientRect().height,
      describedKinds: ids.map((id) => document.getElementById(id)?.textContent ?? 'MISSING'),
    };
  });
}

const cases: Record<'none' | 'help' | 'error' | 'reason' | 'all', string> = {
  none: 'help:',
  help: 'help:Helpline',
  error: `help:;error:${SHORT}`,
  reason: 'help:;state:forced;stateReason:Because+rule',
  all: `help:Helpline;error:${SHORT};state:forced;stateReason:Because+rule`,
};

for (const [vp, size, dir] of [
  ['desktop', { width: 1280, height: 800 }, 'ltr'],
  ['tablet', { width: 768, height: 1024 }, 'ltr'],
  ['mobile', { width: 375, height: 667 }, 'ltr'],
  ['rtl', { width: 1280, height: 800 }, 'rtl'],
] as const) {
  test.describe(`QA #140 message space (${vp})`, () => {
    test.use({ viewport: size });
    const measure = async (page: Page, args: string) => {
      await gotoStory(page, PG, args);
      if (dir === 'rtl') await page.evaluate(() => (document.documentElement.dir = 'rtl'));
      await page.locator('[data-field-error-slot]').waitFor();
      return fieldInfo(page);
    };

    test('the error line is reserved on its own: an error never changes the height, help and reason add theirs', async ({ page }) => {
      const none = await measure(page, cases.none);
      expect(none.msgHeight).toBeCloseTo(20, 0);
      const error = await measure(page, cases.error);
      expect(error.describedKinds.length).toBe(1);
      expect(error.fieldHeight).toBeCloseTo(none.fieldHeight, 1);
      for (const k of ['help', 'reason'] as const) {
        const m = await measure(page, cases[k]);
        expect(m.describedKinds.length, k).toBe(1);
        expect(m.msgHeight, k).toBeCloseTo(20, 0);
        // Static descriptions take their own line while present.
        expect(m.fieldHeight, k).toBeCloseTo(none.fieldHeight + 20, 1);
      }
    });

    test('with help and reason already shown, a one-line error adds no height', async ({ page }) => {
      const without = await measure(page, 'help:Helpline;state:forced;stateReason:Because+rule');
      const all = await measure(page, cases.all);
      expect(all.fieldHeight).toBeCloseTo(without.fieldHeight, 1);
      expect(all.msgHeight).toBeCloseTo(20, 0);
    });

    test('reason + error + help: description order and content', async ({ page }) => {
      const all = await measure(page, cases.all);
      expect(all.describedKinds).toEqual(['Because rule', 'Enter a valid value', 'Helpline']);
      await expect(page.getByRole('textbox')).toHaveAccessibleDescription('Because rule Enter a valid value Helpline');
    });

    test('a long unbroken error does not overflow horizontally', async ({ page }) => {
      const m = await measure(page, `help:;error:${LONG}`);
      expect(m.scrollOverflow).toBeLessThanOrEqual(0);
    });
  });
}

test('ListReportFilterBar search box: no message area, Field is as tall as its control', async ({ page }) => {
  await gotoStory(page, 'data-listreportfilterbar--search-only');
  const r = await page.getByRole('searchbox', { name: 'Search' }).evaluate((el) => {
    let f: HTMLElement | null = el.parentElement;
    while (f && !f.querySelector(':scope > label')) f = f.parentElement;
    const box = (el.closest('div[class*="rounded"]') ?? el).getBoundingClientRect();
    return {
      hasField: !!f,
      msgH: f?.querySelector('[data-field-error-slot]')?.getBoundingClientRect().height ?? -1,
      fieldH: f?.getBoundingClientRect().height ?? 0,
      boxH: box.height,
    };
  });
  expect(r.hasField).toBe(true);
  expect(r.msgH).toBe(0);
  expect(r.fieldH).toBeCloseTo(r.boxH, 0);
});
