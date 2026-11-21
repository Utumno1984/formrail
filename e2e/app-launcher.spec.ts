import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectFocusRingVisible, expectNoHorizontalOverflow } from './helpers/geometry';
import { expectPlayToPass, gotoStory } from './helpers/story';
import { VIEWPORTS } from './helpers/viewports';

const ID = 'navigation-applauncher--';

/** `data-rop-app-id` of the focused element (null when the focus is not on a tile). */
const focusedApp = (page: Page) =>
  page.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute('data-rop-app-id') ?? null);

/** Calls recorded by the `onNavigate` spy of the story (Storybook's Actions channel is not readable here). */
async function recordNavigations(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __navigations: string[] };
    w.__navigations = [];
    document.addEventListener(
      'click',
      (e) => {
        const tile = (e.target as Element).closest('[data-rop-app-id]');
        if (tile) w.__navigations.push(`${tile.getAttribute('data-rop-app-id')}:${e.defaultPrevented ? 'prevented' : 'native'}`);
      },
      // After React's handler (bubble phase on the document, registered after the root's): sees `defaultPrevented`.
      false,
    );
  });
}
const navigations = (page: Page) => page.evaluate(() => (window as unknown as { __navigations: string[] }).__navigations);

test.describe('Navigation/AppLauncher', () => {
  test('the Playground, LoadingToData and WithDirtyGuard play functions pass and axe is clean', async ({ page }) => {
    for (const id of ['playground', 'loading-to-data', 'with-dirty-guard']) {
      await expectPlayToPass(page, `${ID}${id}`);
      await expectNoA11yViolations(page);
    }
  });

  for (const id of ['apps', 'disabled-app', 'loading', 'empty', 'long-names-no-icons', 'many-apps', 'list-changes', 'example']) {
    test(`${id}: free of a11y violations`, async ({ page }) => {
      await gotoStory(page, `${ID}${id}`);
      await expectNoA11yViolations(page);
    });
  }

  for (const [name, width, height] of VIEWPORTS) {
    test(`${name}: Tab from the start of the page visits the apps in list order, which is also the visual order`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await gotoStory(page, `${ID}apps`);
      const order: (string | null)[] = [];
      const boxes: { x: number; y: number }[] = [];
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press('Tab');
        order.push(await focusedApp(page));
        boxes.push(await page.evaluate(() => {
          const r = document.activeElement!.getBoundingClientRect();
          return { x: Math.round(r.left), y: Math.round(r.top) };
        }));
      }
      expect(order).toEqual(['one', 'two', 'three', 'four', 'five', 'six']);
      // Reading order (row by row, start to end): no CSS `order` reverses the tab order.
      for (let i = 1; i < boxes.length; i++) {
        const [a, b] = [boxes[i - 1]!, boxes[i]!];
        expect(b.y > a.y || (b.y === a.y && b.x > a.x), `tile ${i + 1} after tile ${i}`).toBe(true);
      }
      await expectNoHorizontalOverflow(page.locator('body'));
    });
  }

  test('columns follow the width of the launcher, not of the window', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoStory(page, `${ID}apps`);
    const columns = () =>
      page.locator('nav ul').evaluate((ul) => getComputedStyle(ul).gridTemplateColumns.split(' ').filter(Boolean).length);
    expect(await columns()).toBe(4);
    // Same window, narrow launcher: one column.
    await page.locator('nav').evaluate((nav) => ((nav as HTMLElement).style.width = '300px'));
    expect(await columns()).toBe(1);
  });

  test('Enter on an enabled app with onNavigate: onNavigate takes over, the frame does not navigate', async ({ page }) => {
    await gotoStory(page, `${ID}apps`);
    await recordNavigations(page);
    const url = page.url();
    await page.getByRole('link', { name: 'App two' }).focus();
    await page.keyboard.press('Enter');
    expect(await navigations(page)).toEqual(['two:prevented']);
    expect(page.url()).toBe(url);
    expect(await page.evaluate(() => location.hash)).toBe('');
  });

  test('a plain click: onNavigate (navigation cancelled); Ctrl/Cmd/Shift+click and middle click: native, href intact', async ({
    page,
    context,
  }) => {
    await gotoStory(page, `${ID}apps`);
    await recordNavigations(page);
    const one = page.getByRole('link', { name: 'App one' });
    await one.click();
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    const popup = context.waitForEvent('page');
    await one.click({ modifiers: [modifier] });
    const opened = await popup;
    expect(opened.url()).toContain('#app-one');
    await opened.close();
    const win = context.waitForEvent('page');
    await one.click({ modifiers: ['Shift'] });
    await (await win).close();
    expect(await navigations(page)).toEqual(['one:prevented', 'one:native', 'one:native']);
    // The middle button fires no `click` on a link (`auxclick`): nothing reaches onNavigate, the href stays.
    await one.click({ button: 'middle' });
    expect(await navigations(page)).toHaveLength(3);
    await expect(one).toHaveAttribute('href', '#app-one');
  });

  test('without onNavigate the browser follows the href', async ({ page }) => {
    await gotoStory(page, `${ID}apps`, 'routed:!false');
    await recordNavigations(page);
    await page.getByRole('link', { name: 'App three' }).click();
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#app-three');
    expect(await navigations(page)).toEqual(['three:native']);
  });

  test('a disabled app: focusable, no href, aria-disabled, its reason visible and as description; Enter and click do nothing', async ({
    page,
  }) => {
    await gotoStory(page, `${ID}disabled-app`);
    await recordNavigations(page);
    const third = page.getByRole('link', { name: 'App three' });
    await expect(third).toHaveAttribute('aria-disabled', 'true');
    await expect(third).not.toHaveAttribute('href');
    await expect(third).toHaveAccessibleDescription('Short description of app three You do not have access to this app');
    // Visible on the tile (drawn over it, outside the link: the link's text is exactly its name).
    await expect(page.locator('li').filter({ has: third }).getByText('You do not have access to this app')).toBeVisible();
    for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
    expect(await focusedApp(page)).toBe('three');
    await page.keyboard.press('Enter');
    await page.keyboard.press(' ');
    // A real mouse click: Playwright's `click()` would wait forever for an `aria-disabled` element to be enabled.
    const box = (await third.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    expect(await navigations(page)).toEqual(['three:prevented']);
    expect(await page.evaluate(() => location.hash)).toBe('');
    // Distinguishable without colour: a dashed outline.
    expect(await third.evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe('dashed');
  });

  test('the current app has aria-current and a visible marker, and can still be opened', async ({ page }) => {
    await gotoStory(page, `${ID}apps`);
    await recordNavigations(page);
    const two = page.getByRole('link', { name: 'App two' });
    await expect(two).toHaveAttribute('aria-current', 'true');
    const marker = await two.evaluate((el) => {
      const s = getComputedStyle(el, '::before');
      return { content: s.content, width: s.width };
    });
    expect(marker.content).not.toBe('none');
    expect(parseFloat(marker.width)).toBeGreaterThan(0);
    await two.click();
    expect(await navigations(page)).toEqual(['two:prevented']);
  });

  for (const [name, width, height] of VIEWPORTS) {
    test(`${name}: loading to data does not move the launcher (same height and width, +-0.5px)`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await gotoStory(page, `${ID}loading-to-data`);
      // The play already loaded the data: load again, measure, finish.
      await page.getByRole('button', { name: 'Load again' }).click();
      const nav = page.getByRole('navigation', { name: 'Apps' });
      await expect(nav).toHaveAttribute('aria-busy', 'true');
      const before = await nav.evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect);
      await page.getByRole('button', { name: 'Finish loading' }).click();
      await expect(nav.getByRole('link')).toHaveCount(6);
      const after = await nav.evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect);
      expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(0.5);
      await expectNoHorizontalOverflow(page.locator('body'));
    });
  }

  test('loading to an empty list: the empty text, no grid in between, the height of one row', async ({ page }) => {
    await gotoStory(page, `${ID}loading-to-data`, 'count:0');
    await page.getByRole('button', { name: 'Load again' }).click();
    const nav = page.getByRole('navigation', { name: 'Apps' });
    await page.evaluate(() => {
      const w = window as unknown as { __lists: number };
      w.__lists = 0;
      new MutationObserver(() => {
        w.__lists += document.querySelectorAll('nav ul').length;
      }).observe(document.body, { childList: true, subtree: true });
    });
    await page.getByRole('button', { name: 'Finish loading' }).click();
    await expect(nav.getByText('No apps available')).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __lists: number }).__lists)).toBe(0);
    // The empty state is as tall as a row of tiles (the Apps story's first tile).
    const emptyHeight = (await nav.boundingBox())!.height;
    await gotoStory(page, `${ID}apps`);
    const tileHeight = (await page.getByRole('link', { name: 'App one' }).boundingBox())!.height;
    expect(Math.abs(emptyHeight - (tileHeight + 8 /* the region's padding */))).toBeLessThanOrEqual(0.5);
  });

  test('every tile has the same height: no icon, no description, long name, disabled with a reason', async ({ page }) => {
    await gotoStory(page, `${ID}long-names-no-icons`);
    const heights = await page.locator('nav li > a, nav li > button').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height * 10) / 10));
    expect(new Set(heights).size).toBe(1);
  });

  // WCAG 1.4.12 (text spacing): the user's own stylesheet sets these four values; nothing may be cut or overlap.
  const TEXT_SPACING =
    '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }' +
    ' p { margin-bottom: 2em !important; }';

  for (const [name, width, height] of VIEWPORTS) {
    test(`${name}: with the WCAG 1.4.12 text spacing no text of a tile is cut or overlapping, and every tile keeps the same height`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      for (const id of ['apps', 'disabled-app', 'long-names-no-icons']) {
        await gotoStory(page, `${ID}${id}`);
        await expect(page.locator('nav li').first()).toBeVisible();
        await page.addStyleTag({ content: TEXT_SPACING });
        const report = await page.evaluate(() => {
          const problems: string[] = [];
          const lineHeightOf = (el: Element) => parseFloat(getComputedStyle(el).lineHeight);
          const heights: number[] = [];
          for (const li of document.querySelectorAll('nav li')) {
            const tile = li.querySelector<HTMLElement>(':scope > a, :scope > button')!;
            const app = tile.getAttribute('data-rop-app-id');
            const t = tile.getBoundingClientRect();
            heights.push(Math.round(t.height * 10) / 10);
            const style = getComputedStyle(tile);
            // The content box of the tile: where its text may be drawn.
            const inner = {
              top: t.top + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop),
              bottom: t.bottom - parseFloat(style.borderBottomWidth) - parseFloat(style.paddingBottom),
            };
            const label = document.getElementById(tile.getAttribute('aria-labelledby')!)!;
            const l = label.getBoundingClientRect();
            if (label.scrollHeight > label.clientHeight + 0.5) problems.push(`${app}: the name is cut vertically`);
            if (l.height + 0.5 < lineHeightOf(label)) problems.push(`${app}: the name line is shorter than its line height`);
            if (l.top < inner.top - 0.5 || l.bottom > inner.bottom + 0.5) problems.push(`${app}: the name leaves the tile`);
            const details = li.querySelector('[data-rop-app-details]');
            if (!details) continue;
            let previousBottom = l.bottom;
            for (const part of details.children) {
              const p = part.getBoundingClientRect();
              const lines = p.height / lineHeightOf(part);
              // A line clamp cuts at a line boundary (ellipsis), never through a line: a whole number of lines.
              if (Math.abs(lines - Math.round(lines)) > 0.05) problems.push(`${app}: "${part.textContent}" cut through a line (${lines} lines)`);
              if (p.top < previousBottom - 0.5) problems.push(`${app}: "${part.textContent}" overlaps the text above it`);
              if (p.bottom > inner.bottom + 0.5) problems.push(`${app}: "${part.textContent}" leaves the tile`);
              previousBottom = p.bottom;
            }
          }
          return { problems, heights };
        });
        expect(report.problems, id).toEqual([]);
        expect(new Set(report.heights).size, `${id}: tile heights ${report.heights.join(', ')}`).toBe(1);
      }
    });
  }

  test('with the WCAG 1.4.12 text spacing the empty text stays inside the empty state', async ({ page }) => {
    await gotoStory(page, `${ID}empty`);
    await page.addStyleTag({ content: TEXT_SPACING });
    const nav = page.getByRole('navigation', { name: 'Apps' });
    const text = (await nav.getByText('No apps available').boundingBox())!;
    const box = (await nav.locator('[data-rop-app-launcher-empty]').boundingBox())!;
    expect(text.y).toBeGreaterThanOrEqual(box.y - 0.5);
    expect(text.y + text.height).toBeLessThanOrEqual(box.y + box.height + 0.5);
  });

  test('a long name is cut with an ellipsis inside a real max-width; its full text is the accessible name; no tooltip at mount', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await gotoStory(page, `${ID}long-names-no-icons`);
    const name = 'App one with a very long name that cannot fit on one line of the tile';
    const link = page.getByRole('link', { name });
    await expect(link).toBeVisible();
    const label = link.getByText(name);
    const m = await label.evaluate((el) => ({ truncated: el.scrollWidth > el.clientWidth, overflow: getComputedStyle(el).overflow }));
    expect(m).toEqual({ truncated: true, overflow: 'hidden' });
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await label.hover();
    await expect(page.getByRole('tooltip')).toHaveText(name);
    await expectNoHorizontalOverflow(page.locator('body'));
  });

  test('forty apps in a scrolling container of the consumer: no horizontal overflow at 375, 768 and 1280', async ({ page }) => {
    for (const [, width, height] of VIEWPORTS) {
      await page.setViewportSize({ width, height });
      await gotoStory(page, `${ID}many-apps`);
      await expect(page.getByRole('link')).toHaveCount(40);
      await expectNoHorizontalOverflow(page.getByTestId('scroll-container'));
      await expectNoHorizontalOverflow(page.locator('body'));
    }
  });

  test('the focus ring of every tile is fully visible (first, last, disabled, current), also in a scrolling container', async ({
    page,
  }) => {
    await gotoStory(page, `${ID}apps`);
    for (const name of ['App one', 'App two', 'App six']) await expectFocusRingVisible(page.getByRole('link', { name }));
    await gotoStory(page, `${ID}disabled-app`);
    await expectFocusRingVisible(page.getByRole('link', { name: 'App three' }));
    await page.setViewportSize({ width: 375, height: 667 });
    await gotoStory(page, `${ID}many-apps`);
    for (const name of ['App 1', 'App 40']) await expectFocusRingVisible(page.getByRole('link', { name, exact: true }));
  });

  test('the focused app leaves the list: the focus moves to the next app, not to the page', async ({ page }) => {
    await gotoStory(page, `${ID}list-changes`);
    await page.getByRole('button', { name: 'Remove App two in 1 s' }).click();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    expect(await focusedApp(page)).toBe('two');
    await expect(page.getByRole('link', { name: 'App two' })).toHaveCount(0, { timeout: 5000 });
    await expect(page.getByRole('link', { name: 'App three' })).toBeFocused();
  });

  test('onNavigate through the dirty guard: "Keep editing" returns the focus to the tile; leaving opens the app', async ({ page }) => {
    await gotoStory(page, `${ID}with-dirty-guard`);
    // The play ended with the focus back on App two. Open App four with the mouse this time.
    const four = page.getByRole('link', { name: 'App four' });
    await four.click();
    const dialog = page.getByRole('dialog', { name: 'Unsaved changes' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Keep editing' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(four).toBeFocused();
    await page.keyboard.press('Enter');
    await page.getByRole('dialog', { name: 'Unsaved changes' }).getByRole('button', { name: 'Leave without saving' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('Example: opening an app with the keyboard makes it the current one', async ({ page }) => {
    await gotoStory(page, `${ID}example`);
    await expect(page.getByRole('link', { name: 'App one' })).toHaveAttribute('aria-current', 'true');
    await page.getByRole('link', { name: 'App two' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('link', { name: 'App two' })).toHaveAttribute('aria-current', 'true');
    await expect(page.getByText('Current app: App two')).toBeVisible();
    expect(await page.evaluate(() => location.hash)).toBe('');
  });
});
