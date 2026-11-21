import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectNoHorizontalOverflow } from './helpers/geometry';
import { expectPlayToPass, gotoStory } from './helpers/story';
import { VIEWPORTS } from './helpers/viewports';

// #654: the extra groups of AppLauncher (entries that can be activated but do not open an app).
const ID = 'navigation-applauncher--';

/** Clicks on the tiles, as `<id>:prevented|native` (an app is `app:<id>`, an extra item `item:<id>`). */
async function recordClicks(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __clicks: string[] };
    w.__clicks = [];
    document.addEventListener('click', (e) => {
      const tile = (e.target as Element).closest('[data-rop-app-id], [data-rop-app-launcher-item-id]');
      if (!tile) return;
      const app = tile.getAttribute('data-rop-app-id');
      const name = app !== null ? `app:${app}` : `item:${tile.getAttribute('data-rop-app-launcher-item-id')}`;
      // After React's handler (bubble phase on the document): sees `defaultPrevented`.
      w.__clicks.push(`${name}:${e.defaultPrevented ? 'prevented' : 'native'}`);
    });
  });
}
const clicks = (page: Page) => page.evaluate(() => (window as unknown as { __clicks: string[] }).__clicks);

/** The id of the focused tile (`app:<id>` / `item:<id>`), or the tag of the focused element. */
const focused = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return null;
    const app = el.getAttribute('data-rop-app-id');
    if (app !== null) return `app:${app}`;
    const item = el.getAttribute('data-rop-app-launcher-item-id');
    return item !== null ? `item:${item}` : el.tagName.toLowerCase();
  });

/** The boxes of the app tiles, rounded to 0.1px. */
const appBoxes = (page: Page) =>
  page.locator('[data-rop-app-id]').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      const round = (n: number) => Math.round(n * 10) / 10;
      return { x: round(r.left), y: round(r.top), width: round(r.width), height: round(r.height) };
    }),
  );

test.describe('Navigation/AppLauncher: extra groups', () => {
  test('the WithExtraGroup and ExtraItemOpensDialog play functions pass and axe is clean', async ({ page }) => {
    for (const id of ['with-extra-group', 'extra-item-opens-dialog']) {
      await expectPlayToPass(page, `${ID}${id}`);
      await expectNoA11yViolations(page);
    }
  });

  test('two extra groups, and the groups added after the mount: free of a11y violations', async ({ page }) => {
    await gotoStory(page, `${ID}apps`, 'extraGroupCount:2');
    await expect(page.getByRole('list', { name: 'Help and information' })).toBeVisible();
    await expectNoA11yViolations(page);
    await gotoStory(page, `${ID}extra-groups-change`);
    await page.getByRole('button', { name: 'Show the extra groups' }).click();
    await expect(page.getByRole('list', { name: 'More modules' })).toBeVisible();
    await expectNoA11yViolations(page);
  });

  for (const [name, width, height] of VIEWPORTS) {
    test(`${name}: the apps list and each group are named lists; Tab order = DOM order = reading order`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await gotoStory(page, `${ID}apps`, 'extraGroupCount:2');
      const nav = page.getByRole('navigation', { name: 'Apps' });
      await expect(nav).toMatchAriaSnapshot(`
        - navigation "Apps":
          - list "Apps":
            - listitem:
              - link "App one"
            - listitem:
              - link "App two"
            - listitem:
              - link "App three"
            - listitem:
              - link "App four"
            - listitem:
              - link "App five"
            - listitem:
              - link "App six"
          - text: More modules
          - list "More modules":
            - listitem:
              - link "Module X"
            - listitem:
              - link "Module Y"
          - text: Help and information
          - list "Help and information":
            - listitem:
              - link "Getting started"
          - status
      `);
      // The visible label of a group is shown above its list.
      await expect(nav.getByText('More modules', { exact: true })).toBeVisible();
      const order: (string | null)[] = [];
      const boxes: { x: number; y: number }[] = [];
      for (let i = 0; i < 9; i++) {
        await page.keyboard.press('Tab');
        order.push(await focused(page));
        boxes.push(
          await page.evaluate(() => {
            const r = document.activeElement!.getBoundingClientRect();
            // Page coordinates: Tab scrolls the page to the focused tile on a small viewport.
            return { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY) };
          }),
        );
      }
      expect(order).toEqual(['app:one', 'app:two', 'app:three', 'app:four', 'app:five', 'app:six', 'item:module-x', 'item:module-y', 'item:guide']);
      for (let i = 1; i < boxes.length; i++) {
        const [a, b] = [boxes[i - 1]!, boxes[i]!];
        expect(b.y > a.y || (b.y === a.y && b.x > a.x), `tile ${i + 1} after tile ${i}`).toBe(true);
      }
      await expectNoHorizontalOverflow(page.locator('body'));
    });
  }

  test('Enter and a plain click on an item with an href: onExtraItemActivate (navigation cancelled), never onNavigate', async ({ page }) => {
    await gotoStory(page, `${ID}with-extra-group`);
    await recordClicks(page);
    const url = page.url();
    const y = page.getByRole('link', { name: 'Module Y' });
    await y.focus();
    await page.keyboard.press('Enter');
    await y.click();
    expect(await clicks(page)).toEqual(['item:module-y:prevented', 'item:module-y:prevented']);
    expect(page.url()).toBe(url);
    expect(await page.evaluate(() => location.hash)).toBe('');
    await expect(y).toBeFocused();
    // An app is still the app's: onNavigate (its click is cancelled too, by onNavigate, not by the items' callback).
    await page.getByRole('link', { name: 'App two' }).click();
    expect((await clicks(page)).at(-1)).toBe('app:two:prevented');
  });

  test('Ctrl/Cmd/Shift+click and middle click on an item with an href: native, the href opens, the callback is not called', async ({
    page,
    context,
  }) => {
    await gotoStory(page, `${ID}with-extra-group`);
    await recordClicks(page);
    const x = page.getByRole('link', { name: 'Module X' });
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    const tab = context.waitForEvent('page');
    await x.click({ modifiers: [modifier] });
    const opened = await tab;
    expect(opened.url()).toContain('#module-x');
    await opened.close();
    const win = context.waitForEvent('page');
    await x.click({ modifiers: ['Shift'] });
    await (await win).close();
    expect(await clicks(page)).toEqual(['item:module-x:native', 'item:module-x:native']);
    // The middle button fires no `click` on a link (`auxclick`): nothing reaches the callback, the href stays.
    await x.click({ button: 'middle' });
    expect(await clicks(page)).toHaveLength(2);
    await expect(x).toHaveAttribute('href', '#module-x');
  });

  test('an item without an href (a button): every click, modifiers included, and Enter/Space reach the callback', async ({ page }) => {
    await gotoStory(page, `${ID}apps`, 'extraGroupCount:1;extraWithHref:!false');
    await recordClicks(page);
    const x = page.getByRole('button', { name: 'Module X' });
    await x.click();
    await x.click({ modifiers: ['Shift'] });
    await x.click({ modifiers: ['Alt'] });
    await x.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press(' ');
    expect(await clicks(page)).toEqual(Array(5).fill('item:module-x:prevented'));
  });

  test('a dialog opened from an item: Escape and the close button return the focus to the tile', async ({ page }) => {
    await gotoStory(page, `${ID}extra-item-opens-dialog`);
    const x = page.getByRole('button', { name: 'Module X' });
    await x.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Module X' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(x).toBeFocused();
    // With the mouse this time, closed by its button.
    await x.click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /close/i }).click();
    await expect(dialog).toHaveCount(0);
    await expect(x).toBeFocused();
  });

  test('the badge: visible text with a neutral look (not the disabled look), part of the description', async ({ page }) => {
    await gotoStory(page, `${ID}with-extra-group`);
    const x = page.getByRole('link', { name: 'Module X' });
    await expect(x).toHaveAccessibleDescription('Learn what module X adds New');
    await expect(page.locator('li').filter({ has: x }).getByText('New', { exact: true })).toBeVisible();
    const look = await x.evaluate((el) => ({
      border: getComputedStyle(el).borderTopStyle,
      disabled: el.getAttribute('aria-disabled'),
      current: el.getAttribute('aria-current'),
    }));
    expect(look).toEqual({ border: 'solid', disabled: null, current: null });
  });

  for (const [name, width, height] of VIEWPORTS) {
    test(`${name}: the app tiles do not move with the extra groups, and the item tiles are as tall as the apps`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await gotoStory(page, `${ID}apps`);
      const without = await appBoxes(page);
      await gotoStory(page, `${ID}apps`, 'extraGroupCount:2');
      await expect(page.getByRole('list', { name: 'More modules' })).toBeVisible();
      expect(await appBoxes(page)).toEqual(without);
      const itemHeights = await page
        .locator('[data-rop-app-launcher-item-id]')
        .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height * 10) / 10));
      expect(itemHeights.length).toBeGreaterThan(0);
      for (const h of itemHeights) expect(h).toBeGreaterThanOrEqual(without[0]!.height - 0.1);
      // Columns by container query, as for the apps: the same template on both lists.
      const columns = await page
        .locator('nav ul')
        .evaluateAll((uls) => uls.map((ul) => getComputedStyle(ul).gridTemplateColumns.split(' ').filter(Boolean).length));
      expect(new Set(columns).size).toBe(1);
    });
  }

  test('groups arriving after the mount: the apps do not move; removing the group with the focus moves it to the next tile', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await gotoStory(page, `${ID}extra-groups-change`);
    const before = await appBoxes(page);
    await page.getByRole('button', { name: 'Show the extra groups' }).click();
    await expect(page.getByRole('list', { name: 'More modules' })).toBeVisible();
    expect(await appBoxes(page)).toEqual(before);
    // The long label of the second group is cut inside the region: no horizontal overflow at 375 px.
    const label = page.getByText(/^Help and information about every app/);
    expect(await label.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    await expectNoHorizontalOverflow(page.locator('body'));
    await page.getByRole('button', { name: 'Remove More modules in 1 s' }).click();
    await page.getByRole('link', { name: 'Module Y' }).focus();
    await expect(page.getByRole('list', { name: 'More modules' })).toHaveCount(0, { timeout: 5000 });
    await expect(page.getByRole('link', { name: 'Getting started' })).toBeFocused();
  });

  test('the last group goes away with the focus on its last item: the focus moves to the previous tile, never to the page', async ({
    page,
  }) => {
    await gotoStory(page, `${ID}extra-groups-change`);
    await page.getByRole('button', { name: 'Show the extra groups' }).click();
    await page.getByRole('button', { name: 'Remove the last group in 1 s' }).click();
    await page.getByRole('link', { name: 'Getting started' }).focus();
    await expect(page.getByRole('link', { name: 'Getting started' })).toHaveCount(0, { timeout: 5000 });
    await expect(page.getByRole('link', { name: 'Module Y' })).toBeFocused();
  });
});
