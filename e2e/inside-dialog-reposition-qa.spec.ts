import { expect, test } from '@playwright/test';
import { expectPlayToPass } from './helpers/story';

for (const kind of ['select', 'combobox'] as const) {
  for (const reduced of [false, true]) {
    test(`forms-${kind}--inside-dialog: list stays open and anchored after the play (reducedMotion=${reduced})`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
      await expectPlayToPass(page, `forms-${kind}--inside-dialog`);
      // Radix Select aria-hides the rest of the page while open: query by attribute, not by role.
      await expect(page.locator('[role="dialog"]')).toBeVisible();
      await expect(page.locator('[role="listbox"]')).toBeVisible();
      await expect(page.locator('[role="combobox"]').first()).toHaveAttribute('aria-expanded', 'true');
      await page.waitForTimeout(500);
      const g = await page.evaluate(() => {
        const t = document.querySelector('[role="combobox"]')!.getBoundingClientRect();
        const l = document.querySelector('[role="listbox"]')!.getBoundingClientRect();
        return { tTop: t.top, tBottom: t.bottom, tLeft: t.left, lTop: l.top, lBottom: l.bottom, lLeft: l.left };
      });
      console.log(kind, reduced, JSON.stringify(g));
      expect(Math.min(Math.abs(g.lTop - g.tBottom), Math.abs(g.tTop - g.lBottom))).toBeLessThan(12);
      expect(Math.abs(g.lLeft - g.tLeft)).toBeLessThan(4);
    });
  }
}
