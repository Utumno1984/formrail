import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/**
 * Rules that only make sense for a whole page, not for a component rendered alone
 * in a story: they would fail for any "bare" component.
 */
const PAGE_LEVEL_RULES = ['landmark-one-main', 'page-has-heading-one', 'region'];

/**
 * Waits until every finite CSS animation/transition in the document has finished.
 * axe-core computes colour contrast from computed styles, so scanning in the middle
 * of an overlay enter transition (opacity/colour interpolation) yields a different
 * "violation" on every run. Infinite animations (spinners) are ignored.
 */
export async function settleMotion(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const finite = () =>
      document.getAnimations().filter((a) => {
        const t = a.effect?.getComputedTiming();
        return t !== undefined && Number.isFinite(t.endTime as number);
      });
    // Loop: finishing one animation may start another (e.g. a chained transition).
    for (let i = 0; i < 5; i++) {
      const pending = finite();
      if (pending.length === 0) return;
      await Promise.allSettled(pending.map((a) => a.finished));
    }
  });
}

/**
 * Fails if axe finds any WCAG 2.x A/AA violation in the page (or inside `include`).
 * The whole document is scanned by default so that portals (Dialog/Popover) are covered.
 */
export async function expectNoA11yViolations(
  page: Page,
  options: { include?: string } = {},
): Promise<void> {
  await settleMotion(page);
  let builder = new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .disableRules(PAGE_LEVEL_RULES);
  if (options.include) builder = builder.include(options.include);
  const { violations } = await builder.analyze();
  const summary = violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(' ')),
  }));
  expect(violations, `axe violations:\n${JSON.stringify(summary, null, 2)}`).toEqual([]);
}
