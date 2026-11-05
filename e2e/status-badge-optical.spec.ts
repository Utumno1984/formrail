import { expect, test } from '@playwright/test';
import { expectPlayToPass, gotoStory } from './helpers/story';

// The warning icon of StatusBadge (an apex-up triangle) is moved up by 4% of its own height, an
// optical correction on top of the cap-height centring every icon shares (CapIconSlot); the round
// icons of the other tones stay geometric. Measured on the real layout boxes: the SVG against the
// box CapIconSlot centres on the cap height (its parent), so the result does not depend on the
// font. The isolation check reads the other CapIconSlot consumers on the icon/text alignment page.

const OVERVIEW = 'primitives-statusbadge--overview';
const TONES = ['neutral', 'info', 'success', 'warning', 'error'] as const;

for (const dpr of [1, 2]) {
  test.describe(`StatusBadge icon optical shift at ${dpr}x`, () => {
    test.use({ deviceScaleFactor: dpr });

    test('only the warning icon sits above the cap-height anchor, by 4% of its height', async ({ page }) => {
      await gotoStory(page, OVERVIEW);
      const rows = await page.evaluate(
        (tones) =>
          tones.map((tone) => {
            const svg = document.querySelector(`[data-testid="tone-icon-${tone}"] [data-rop-badge-icon] svg`) as SVGElement;
            const r = svg.getBoundingClientRect();
            const anchor = (svg.parentElement as HTMLElement).getBoundingClientRect();
            return {
              tone,
              height: r.height,
              shift: r.top + r.height / 2 - (anchor.top + anchor.height / 2),
            };
          }),
        [...TONES],
      );
      for (const row of rows) {
        const expected = row.tone === 'warning' ? -0.04 * row.height : 0;
        expect(row.shift, JSON.stringify(rows)).toBeCloseTo(expected, 2);
      }
      // Up, not down, and sub-pixel for the xs icon (12px): a nudge, not a visible misplacement.
      const warning = rows.find((r) => r.tone === 'warning')!;
      expect(warning.shift).toBeLessThan(0);
      expect(warning.shift).toBeGreaterThan(-1);
    });
  });
}

test('the shift is scoped to StatusBadge: no other icon next to text is moved', async ({ page }) => {
  await expectPlayToPass(page, 'internal-icontextalignment--all-pairs');
  const rows = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-align-case]')).map((c) => {
      const icon = c.querySelector(c.dataset.alignIcon!) as Element;
      return { name: c.dataset.alignCase!, translate: getComputedStyle(icon).translate };
    }),
  );
  const others = rows.filter((r) => !r.name.startsWith('status-badge-'));
  // The page has the non-portaled consumers of the shared alignment (MessageStrip, FieldMessage,
  // controls, List Report sort arrow, footer, Text): none of them is translated.
  expect(others.length).toBeGreaterThanOrEqual(8);
  for (const r of others) expect(r.translate, r.name).toBe('none');
  // On the same page, the warning badge is the only badge whose icon is translated.
  const badges = rows.filter((r) => r.name.startsWith('status-badge-'));
  expect(badges.map((r) => r.name)).toEqual([
    'status-badge-info',
    'status-badge-success',
    'status-badge-warning',
    'status-badge-error',
  ]);
  for (const r of badges) {
    if (r.name === 'status-badge-warning') expect(r.translate, r.name).not.toBe('none');
    else expect(r.translate, r.name).toBe('none');
  }
});
