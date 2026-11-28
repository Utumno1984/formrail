import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow } from './helpers/geometry';
import { expectPlayToPass, gotoStory } from './helpers/story';

// Geometry at the three viewports of the visual grid, the narrowest being 320px (#724).
const VIEWPORTS = [
  { name: 'narrow 320', width: 320, height: 640 },
  { name: 'tablet 768', width: 768, height: 1024 },
  { name: 'desktop 1280', width: 1280, height: 800 },
] as const;

const EDGE = 8; // the Tooltip's collision padding

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}
const box = async (page: Page, selector: string): Promise<Box> =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    });

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test.describe('Tooltip', () => {
      for (const where of ['left', 'centre', 'right'] as const) {
        test(`long text opened from a trigger on the ${where} sits inside [8, width - 8] and wraps`, async ({ page }) => {
          await expectPlayToPass(page, 'overlays-tooltip--long-text');
          // The trigger moves to the wanted spot (the play has ended and left no tooltip open).
          const trigger = page.getByRole('button', { name: 'Detail' });
          await trigger.evaluate((el, w) => {
            const b = el as HTMLElement;
            b.style.position = 'fixed';
            b.style.top = '200px';
            b.style.left =
              w === 'left' ? '0px' : w === 'right' ? `${window.innerWidth - b.offsetWidth}px` : `${(window.innerWidth - b.offsetWidth) / 2}px`;
          }, where);
          await page.mouse.move(vp.width / 2, vp.height - 10);
          await trigger.hover();
          await expect(page.getByRole('tooltip')).toBeVisible();
          const t = await box(page, '[role="tooltip"]');
          expect(t.left, 'left edge').toBeGreaterThanOrEqual(EDGE - 0.5);
          expect(t.right, 'right edge').toBeLessThanOrEqual(vp.width - EDGE + 0.5);
          // 20rem outer at most at any width (a real maximum), narrower where the viewport asks for it.
          expect(t.width).toBeLessThanOrEqual(Math.min(320, vp.width - 2 * EDGE) + 0.5);
          if (vp.width >= 768) expect(t.width).toBeGreaterThan(300);
          // Wrapped: several lines of text.
          expect(t.height).toBeGreaterThan(40);
          await expect(page.locator('html')).toHaveJSProperty('scrollWidth', vp.width);
        });
      }

      test('a single very long word wraps inside the viewport', async ({ page }) => {
        await gotoStory(page, 'overlays-tooltip--long-text', `content:${'Supercalifragilistic'.repeat(5)}`);
        await page.getByRole('button', { name: 'Detail' }).hover();
        await expect(page.getByRole('tooltip')).toBeVisible();
        const t = await box(page, '[role="tooltip"]');
        expect(t.left).toBeGreaterThanOrEqual(EDGE - 0.5);
        expect(t.right).toBeLessThanOrEqual(vp.width - EDGE + 0.5);
      });

      test('near the bottom edge it flips above the trigger and stays inside the viewport', async ({ page }) => {
        await gotoStory(page, 'overlays-tooltip--long-text', 'side:bottom');
        const trigger = page.getByRole('button', { name: 'Detail' });
        await trigger.evaluate((el) => {
          const b = el as HTMLElement;
          b.style.position = 'fixed';
          b.style.left = '16px';
          b.style.top = `${window.innerHeight - b.offsetHeight - 8}px`;
        });
        await trigger.hover();
        await expect(page.getByRole('tooltip')).toBeVisible();
        const t = await box(page, '[role="tooltip"]');
        const triggerTop = await trigger.evaluate((el) => el.getBoundingClientRect().top);
        expect(t.bottom).toBeLessThanOrEqual(triggerTop + 0.5);
        expect(t.top).toBeGreaterThanOrEqual(EDGE - 0.5);
        expect(t.right).toBeLessThanOrEqual(vp.width - EDGE + 0.5);
      });
    });

    test.describe('Calendar', () => {
      for (const [label, args] of [
        ['en-US', undefined],
        ['ja-JP, week starting on Monday', 'locale:ja-JP;weekStartsOn:1'],
      ] as const) {
        test(`${label}: no horizontal overflow, 40px day cells, the grid keeps its height`, async ({ page }) => {
          await gotoStory(page, 'forms-calendar--manual', args);
          await expect(page.getByRole('grid')).toBeVisible();
          await expectNoHorizontalOverflow(page.locator('html'));
          await expect(page.locator('html')).toHaveJSProperty('scrollWidth', vp.width);
          const cells = await page.getByRole('gridcell').evaluateAll((els) =>
            els.map((e) => {
              const r = e.getBoundingClientRect();
              return [r.width, r.height] as const;
            }),
          );
          expect(cells.length).toBeGreaterThanOrEqual(35);
          for (const [w, h] of cells) {
            expect(w).toBeGreaterThanOrEqual(40);
            expect(h).toBeGreaterThanOrEqual(40);
          }
          // Six rows of 40px under a 32px header row, at every viewport (only the padding gave way).
          const grid = await box(page, '[role="grid"]');
          expect(grid.height).toBeCloseTo(32 + 6 * 40, 0);
          const root = await page.getByRole('grid').evaluate((el) => {
            const r = el.parentElement!.getBoundingClientRect();
            return { left: r.left, right: r.right };
          });
          expect(root.left).toBeGreaterThanOrEqual(0);
          expect(root.right).toBeLessThanOrEqual(vp.width);
        });
      }
    });

    test('DatePicker: the open calendar fits in the viewport', async ({ page }) => {
      await gotoStory(page, 'forms-datepicker--manual');
      await page.getByRole('button', { name: /^Choose date/ }).click();
      await expect(page.getByRole('dialog', { name: 'Choose date', exact: true })).toBeVisible();
      await expect(page.getByRole('grid')).toBeVisible();
      for (const selector of ['[role="dialog"]', '[role="grid"]']) {
        const b = await box(page, selector);
        expect(b.left, `${selector} left`).toBeGreaterThanOrEqual(0);
        expect(b.right, `${selector} right`).toBeLessThanOrEqual(vp.width);
      }
      await expect(page.locator('html')).toHaveJSProperty('scrollWidth', vp.width);
    });

    test('ListReportTable: the edge shade ends where the last row ends', async ({ page }) => {
      await gotoStory(page, 'data-listreporttable--narrow-container');
      // A scrollport much taller than its table: the table is shorter than the scrollport.
      await page.getByTestId('scroller').evaluate((el) => {
        el.style.minHeight = '700px';
      });
      await expect(page.locator('[data-rop-overflow-edge]')).toHaveCount(2);
      const table = await box(page, '[data-testid="scroller"] > table');
      const scroller = await box(page, '[data-testid="scroller"]');
      expect(scroller.height).toBeGreaterThan(table.height + 50);
      for (const side of ['start', 'end']) {
        await expect
          .poll(async () => (await box(page, `[data-rop-overflow-edge="${side}"]`)).bottom, { message: `${side} shade bottom` })
          .toBeLessThanOrEqual(table.bottom + 1);
        const shade = await box(page, `[data-rop-overflow-edge="${side}"]`);
        expect(shade.height, `${side} shade height`).toBeGreaterThan(0);
        expect(shade.top, `${side} shade top`).toBeGreaterThanOrEqual(table.top - 1);
      }
    });
  });
}
