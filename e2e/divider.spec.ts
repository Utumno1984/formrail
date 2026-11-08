import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectPlayToPass, gotoStory } from './helpers/story';

test.describe('Primitives/Divider', () => {
  test('the Playground and Toolbar play functions pass, axe is clean', async ({ page }) => {
    await expectPlayToPass(page, 'primitives-divider--playground');
    await expectNoA11yViolations(page);
    await expectPlayToPass(page, 'primitives-divider--toolbar');
    await expectNoA11yViolations(page);
  });

  test('every story is free of a11y violations', async ({ page }) => {
    for (const id of ['spacings', 'vertical-in-toolbar', 'decorative', 'edge-cases']) {
      await gotoStory(page, `primitives-divider--${id}`);
      await expectNoA11yViolations(page);
    }
  });

  test('vertical-in-toolbar: at 375px the toolbar and the page never exceed the viewport (#312)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await gotoStory(page, 'primitives-divider--vertical-in-toolbar');
    const m = await page.evaluate(() => {
      const toolbar = document.querySelector('[data-testid="toolbar"]')!;
      const r = toolbar.getBoundingClientRect();
      const buttons = [...toolbar.querySelectorAll('button')].map((b) => b.getBoundingClientRect().right);
      return {
        viewport: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        left: r.left,
        right: r.right,
        maxButtonRight: Math.max(...buttons),
      };
    });
    expect(m.scrollWidth).toBeLessThanOrEqual(m.viewport);
    expect(m.left).toBeGreaterThanOrEqual(0);
    expect(m.right).toBeLessThanOrEqual(m.viewport);
    expect(m.maxButtonRight).toBeLessThanOrEqual(m.right);
  });

  test('horizontal: exactly 1px tall, no inset/double border, no browser margins beyond the spacing', async ({ page }) => {
    await gotoStory(page, 'primitives-divider--spacings');
    for (const [spacing, margin] of [['none', 0], ['sm', 8], ['md', 16], ['lg', 24]] as const) {
      const hr = page.getByTestId(`spacing-${spacing}`).locator('hr');
      const m = await hr.evaluate((el) => {
        const s = getComputedStyle(el);
        return {
          tag: el.tagName,
          height: el.getBoundingClientRect().height,
          top: s.borderTopStyle,
          topW: s.borderTopWidth,
          bottomW: s.borderBottomWidth,
          leftW: s.borderLeftWidth,
          rightW: s.borderRightWidth,
          mt: s.marginTop,
          mb: s.marginBottom,
          ml: s.marginLeft,
          mr: s.marginRight,
          overflow: s.overflow,
        };
      });
      expect(m.tag).toBe('HR');
      expect(m.height).toBe(1);
      expect(m.top).toBe('solid');
      expect([m.topW, m.bottomW, m.leftW, m.rightW]).toEqual(['1px', '0px', '0px', '0px']);
      expect([m.mt, m.mb]).toEqual([`${margin}px`, `${margin}px`]);
      expect([m.ml, m.mr]).toEqual(['0px', '0px']);
    }
  });

  test('horizontal: colour is the border token, and it spans the container width', async ({ page }) => {
    await gotoStory(page, 'primitives-divider--spacings');
    const hr = page.getByTestId('spacing-md').locator('hr');
    const m = await hr.evaluate((el) => {
      const probe = document.createElement('div');
      probe.style.color = 'var(--color-rop-border)';
      document.body.appendChild(probe);
      const token = getComputedStyle(probe).color;
      probe.remove();
      return {
        token,
        color: getComputedStyle(el).borderTopColor,
        width: el.getBoundingClientRect().width,
        parent: (el.parentElement as HTMLElement).getBoundingClientRect().width,
      };
    });
    expect(m.color).toBe(m.token);
    expect(m.width).toBeCloseTo(m.parent, 0);
  });

  test('vertical in a toolbar: 1px wide, as tall as the buttons row, role + aria-orientation, skipped by Tab', async ({ page }) => {
    await gotoStory(page, 'primitives-divider--toolbar');
    const seps = page.getByRole('separator');
    await expect(seps).toHaveCount(2);
    const row = await page.getByRole('button', { name: 'Cut' }).evaluate((el) => el.getBoundingClientRect().height);
    for (const sep of await seps.all()) {
      await expect(sep).toHaveAttribute('aria-orientation', 'vertical');
      const box = await sep.boundingBox();
      expect(box!.width).toBe(1);
      expect(Math.abs(box!.height - row)).toBeLessThanOrEqual(1);
      expect(await sep.evaluate((el) => getComputedStyle(el).alignSelf)).toBe('stretch');
      expect(await sep.evaluate((el) => (el as HTMLElement).tabIndex)).toBe(-1);
    }
    // Start from the first button (the story's play function already moved the focus), then walk
    // forwards and backwards: the dividers in between are never a stop.
    const active = () => page.evaluate(() => document.activeElement?.textContent ?? '');
    await page.getByRole('button', { name: 'Cut' }).focus();
    const order: string[] = [await active()];
    for (const key of ['Tab', 'Tab', 'Shift+Tab', 'Shift+Tab']) {
      await page.keyboard.press(key);
      order.push(await active());
    }
    expect(order).toEqual(['Cut', 'Copy', 'Paste', 'Copy', 'Cut']);
  });

  test('decorative: absent from the accessibility tree', async ({ page }) => {
    await gotoStory(page, 'primitives-divider--decorative');
    await expect(page.getByRole('separator')).toHaveCount(0);
    for (const id of ['decorative-h', 'decorative-v']) {
      const el = page.getByTestId(id);
      await expect(el).toHaveAttribute('aria-hidden', 'true');
      expect(await el.evaluate((n) => ({ tag: n.tagName, role: n.getAttribute('role') }))).toEqual({ tag: 'DIV', role: null });
    }
    const box = await page.getByTestId('decorative-h').boundingBox();
    expect(box!.height).toBe(1);
    const snap = await page.locator('body').ariaSnapshot();
    expect(snap).not.toContain('separator');
  });

  test('vertical outside a flex container keeps a real height (not 0); horizontal in a flex row does not collapse', async ({ page }) => {
    await gotoStory(page, 'primitives-divider--edge-cases');
    const v = await page.getByTestId('vertical-block').boundingBox();
    expect(v!.width).toBe(1);
    expect(v!.height).toBeGreaterThanOrEqual(10);
    const h = await page.getByTestId('horizontal-row').boundingBox();
    expect(h!.height).toBe(1);
    expect(h!.width).toBe(300);
  });

  test('stays a 1px solid border (visible) in forced-colors mode', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await gotoStory(page, 'primitives-divider--spacings');
    const hr = page.getByTestId('spacing-md').locator('hr');
    const m = await hr.evaluate((el) => {
      const s = getComputedStyle(el);
      return { w: s.borderTopWidth, style: s.borderTopStyle, color: s.borderTopColor, h: el.getBoundingClientRect().height };
    });
    expect(m.w).toBe('1px');
    expect(m.style).toBe('solid');
    expect(m.h).toBe(1);
    // In forced-colors mode the border colour is replaced by a system colour (not transparent).
    expect(m.color).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('the hr is not focusable', async ({ page }) => {
    await gotoStory(page, 'primitives-divider--spacings');
    const focusable = await page.locator('hr').first().evaluate((el) => {
      (el as HTMLElement).focus();
      return document.activeElement === el;
    });
    expect(focusable).toBe(false);
  });
});
