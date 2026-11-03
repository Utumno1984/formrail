import { expect, test } from '@playwright/test';
import { gotoStory } from './helpers/story';

// #160: the critic's static-analysis worry was "a stacked error ends up closer to the next field than
// to its own control". Measured live (Overview, f-error: help + error stacked): control→help 8,
// help→error 8, error→next field 16. Rule pinned here: every gap INSIDE a field (mt-2 = 8px) is
// strictly smaller than the gap BETWEEN fields (16px in the story column), so proximity grouping
// attributes the stacked messages to their own field. No spacing change was needed.
const VIEWPORTS = [
  ['desktop', { width: 1280, height: 800 }],
  ['tablet', { width: 768, height: 1024 }],
  ['mobile', { width: 375, height: 667 }],
] as const;

for (const [name, size] of VIEWPORTS) {
  test.describe(`#160 stacked messages ${name}`, () => {
    test.use({ viewport: size });

    test('Overview: gaps inside a field are smaller than the gap to the next field', async ({ page }) => {
      await gotoStory(page, 'forms-field--overview');
      const r = await page.evaluate(() => {
        const f = document.querySelector('[data-testid="f-error"]') as HTMLElement;
        const input = f.querySelector('input') as HTMLElement;
        const box = (input.closest('div[class*="rounded"]') ?? input).getBoundingClientRect();
        const help = (f.querySelector('[id$="-help"]') as HTMLElement).getBoundingClientRect();
        const err = (f.querySelector('[id$="-error"]') as HTMLElement).getBoundingClientRect();
        const next = (f.nextElementSibling as HTMLElement).getBoundingClientRect();
        return {
          controlToHelp: help.top - box.bottom,
          helpToError: err.top - help.bottom,
          errorToNextField: next.top - err.bottom,
        };
      });
      expect(r.controlToHelp).toBeCloseTo(8, 0);
      expect(r.helpToError).toBeCloseTo(8, 0);
      expect(r.errorToNextField).toBeCloseTo(16, 0);
      expect(r.helpToError).toBeLessThan(r.errorToNextField);
      expect(r.controlToHelp).toBeLessThan(r.errorToNextField);
    });
  });
}
