import { expect, test, type Page } from '@playwright/test';
import { gotoStory } from './helpers/story';

// Core and pro stylesheets together, in the order of packages/pro/README.md (core theme + styles,
// then pro styles; .storybook/preview-pro.ts). Before #175's fix pro re-emitted core utilities
// (`.flex-col`, `.gap-3`, ...) in the same layer: loaded after core, they beat core's `sm:flex-row`
// and the Object Page / List Report headers stayed in a column at >= 640px.

/** Index, in the cascade order of the page, of the first style rule whose text contains `needle`. */
async function ruleIndex(page: Page, needle: string): Promise<number> {
  return page.evaluate((text) => {
    let index = 0;
    const walk = (rules: CSSRuleList): number => {
      for (const rule of Array.from(rules)) {
        index += 1;
        if (rule instanceof CSSStyleRule && rule.selectorText.includes(text)) return index;
        if ('cssRules' in rule) {
          const found = walk((rule as CSSGroupingRule).cssRules);
          if (found >= 0) return found;
        }
      }
      return -1;
    };
    for (const sheet of Array.from(document.styleSheets)) {
      const found = walk(sheet.cssRules);
      if (found >= 0) return found;
    }
    return -1;
  }, needle);
}

test.describe('core + pro stylesheets (README order)', () => {
  test('the page loads core CSS before pro CSS, as a consumer following the README does', async ({ page }) => {
    await gotoStory(page, 'floorplans-object-page-layout--overview');
    const core = await ruleIndex(page, '.sm\\:flex-row');
    const pro = await ruleIndex(page, '.rop-pro-change-summary');
    expect(core).toBeGreaterThan(0);
    expect(pro).toBeGreaterThan(0);
    expect(core).toBeLessThan(pro);
  });

  test('at 1024px the Object Page header is a row (core sm: variants are not overridden by pro)', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 600 });
    await gotoStory(page, 'floorplans-object-page-layout--overview');
    const header = page.locator('[class~="sm:flex-row"]').filter({ has: page.getByRole('heading', { level: 1 }) }).last();
    await expect(header).toHaveCSS('flex-direction', 'row');
    await expect(header).toHaveCSS('column-gap', '16px'); // sm:gap-4, not the base gap-3
  });

  test('at 1024px the List Report header is a row', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 600 });
    await gotoStory(page, 'floorplans-list-report--flow-layout');
    const header = page.locator('[class~="sm:flex-row"][class~="shrink-0"]').first();
    await expect(header).toHaveCSS('flex-direction', 'row');
  });

  test('at 1024px the Object Page footer is a row', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 600 });
    await gotoStory(page, 'floorplans-object-page-footer--with-actions');
    const footer = page.locator('[class~="sm:flex-row"][class~="sm:px-6"]').first();
    await expect(footer).toHaveCSS('flex-direction', 'row');
  });

  test('a core utility in className (p-0) overrides the ChangeSummary default padding', async ({ page }) => {
    await gotoStory(page, 'pro-changesummary--empty');
    const root = page.locator('.rop-pro-change-summary');
    await expect(root).toHaveCSS('padding-top', '16px');
    // What `cn('rop-pro-change-summary', 'p-0')` renders (unit test: ChangeSummary.test.tsx).
    await root.evaluate((el) => el.classList.add('p-0'));
    await expect(root).toHaveCSS('padding-top', '0px');
    await expect(root).toHaveCSS('padding-left', '0px');
  });
});
