import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectPlayToPass, gotoStory } from './helpers/story';

const SIZES = { xs: 12, sm: 16, md: 20, lg: 24, xl: 32 } as const;

test.describe('Primitives/Spinner', () => {
  test('the Playground play function passes and axe is clean', async ({ page }) => {
    await expectPlayToPass(page, 'primitives-spinner--playground');
    await expectNoA11yViolations(page);
  });

  test('every story is free of a11y violations', async ({ page }) => {
    for (const id of ['sizes', 'inline-with-text', 'on-primary']) {
      await gotoStory(page, `primitives-spinner--${id}`);
      await expectNoA11yViolations(page);
    }
  });

  test('each size matches its --icon-rop-* token within 0.5px', async ({ page }) => {
    await gotoStory(page, 'primitives-spinner--sizes');
    for (const [size, px] of Object.entries(SIZES)) {
      const box = (await page.getByTestId(`spinner-${size}`).boundingBox())!;
      expect(Math.abs(box.width - px)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(box.height - px)).toBeLessThanOrEqual(0.5);
    }
  });

  test('the colour is inherited (currentColor): white inside a primary background', async ({ page }) => {
    await gotoStory(page, 'primitives-spinner--on-primary');
    const colours = await page.getByTestId('on-primary').evaluate((el) => ({
      own: getComputedStyle(el).color,
      parent: getComputedStyle(el.parentElement!).color,
      stroke: getComputedStyle(el.querySelector('path')!).stroke,
    }));
    expect(colours.own).toBe(colours.parent);
    expect(colours.stroke).toBe(colours.parent);
    expect(colours.own).toBe('rgb(255, 255, 255)');
  });

  test('announces: the region exists empty, then the SAME node gains "Loading" once', async ({ page }) => {
    // The play function runs one full cycle on load: wait for it, then observe a second one.
    await expectPlayToPass(page, 'primitives-spinner--playground');
    await expect(page.getByRole('status')).toHaveCount(0);
    // Observe the DOM from before the click: record every text mutation of any status region.
    await page.evaluate(() => {
      const w = window as unknown as { __log: string[] };
      w.__log = [];
      new MutationObserver((records) => {
        for (const r of records) {
          for (const n of Array.from(r.addedNodes)) {
            const el = n instanceof Element ? n : null;
            if (el?.matches('[role="status"]')) w.__log.push(`region-added:"${el.textContent}"`);
          }
          const target = r.target instanceof Element ? r.target : r.target.parentElement;
          if (target?.closest('[role="status"]') && r.type !== 'childList') w.__log.push('text');
          if (target?.closest('[role="status"]') && r.type === 'childList' && r.addedNodes.length > 0 && !target.matches('[role="status"]'))
            w.__log.push(`text:"${target.textContent}"`);
        }
      }).observe(document.body, { subtree: true, childList: true, characterData: true });
    });
    await page.getByRole('button', { name: 'Refresh' }).click();
    const status = page.getByRole('status');
    await expect(status).toHaveText('Loading');
    await expect(status).toHaveCount(0, { timeout: 5000 });
    const log = await page.evaluate(() => (window as unknown as { __log: string[] }).__log);
    // The region was inserted empty, then its text was written once.
    expect(log[0]).toBe('region-added:""');
    expect(log.filter((l) => l.startsWith('text:"Loading"'))).toHaveLength(1);
  });

  test('rotates normally; with prefers-reduced-motion there is no animation and the shape stays visible', async ({
    page,
  }) => {
    await gotoStory(page, 'primitives-spinner--sizes');
    const running = await page.getByTestId('spinner-md').evaluate((el) => el.querySelector('svg')!.getAnimations().length);
    expect(running).toBeGreaterThan(0);
    const duration = await page
      .getByTestId('spinner-md')
      .evaluate((el) => getComputedStyle(el.querySelector('svg')!).animationDuration);
    expect(duration).toBe('0.8s');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoStory(page, 'primitives-spinner--sizes');
    const reduced = await page.getByTestId('spinner-md').evaluate((el) => {
      const svg = el.querySelector('svg')!;
      const arc = el.querySelector('path')!.getBoundingClientRect();
      return {
        animations: svg.getAnimations().length + el.getAnimations({ subtree: true }).length,
        arcWidth: arc.width,
        arcHeight: arc.height,
        stroke: getComputedStyle(el.querySelector('path')!).stroke,
      };
    });
    expect(reduced.animations).toBe(0);
    expect(reduced.arcWidth).toBeGreaterThan(0);
    expect(reduced.arcHeight).toBeGreaterThan(0);
    expect(reduced.stroke).not.toBe('none');
  });

  test('reduced motion also applies in the announced Playground (no animation, region still announces)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoStory(page, 'primitives-spinner--playground');
    await page.getByRole('button', { name: 'Refresh' }).click();
    const status = page.getByRole('status');
    await expect(status).toHaveText('Loading');
    expect(await status.evaluate((el) => el.getAnimations({ subtree: true }).length)).toBe(0);
  });

  test('inline with body text: the box is vertically aligned with the text within 1px and does not grow the line', async ({
    page,
  }) => {
    await gotoStory(page, 'primitives-spinner--inline-with-text');
    const m = await page.evaluate(() => {
      const line = document.querySelector('[data-testid="line"]')!;
      const sp = document.querySelector('[data-testid="inline-spinner"]')!.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(line.firstChild!);
      const text = range.getBoundingClientRect();
      return {
        spinnerCentre: sp.top + sp.height / 2,
        textCentre: text.top + text.height / 2,
        lineHeight: line.getBoundingClientRect().height,
        lineHeightCss: parseFloat(getComputedStyle(line).lineHeight),
      };
    });
    expect(Math.abs(m.spinnerCentre - m.textCentre)).toBeLessThanOrEqual(1);
    // A 16px box inside a body line: the line keeps its own height.
    expect(Math.abs(m.lineHeight - m.lineHeightCss)).toBeLessThanOrEqual(1);
  });
});
