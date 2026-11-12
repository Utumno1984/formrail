import { expect, test, type FrameLocator, type Locator, type Page } from '@playwright/test';
import { gotoStory } from './helpers/story';

// The copy-paste examples of the Overlays pages (ticket #443): each one is a REAL overlay, closed at load,
// opened by its trigger, with focus-trap / focus return / Escape working. The other stories of a page may leave
// overlays open, so everything here is looked up by the accessible name of the example's own overlay.

type Root = Page | FrameLocator;

const exampleOf = async (page: Page, id: string) => gotoStory(page, `overlays-${id}--example`);

/** Presses Tab (or Shift+Tab) `times` times and checks the focus never leaves `overlay`. */
async function expectFocusTrapped(page: Page, overlay: Locator, times = 8) {
  for (const key of ['Tab', 'Shift+Tab']) {
    for (let i = 0; i < times; i++) {
      await page.keyboard.press(key);
      await expect(overlay.locator(':focus')).toHaveCount(1);
    }
  }
}

const MODALS = [
  { page: 'dialog', role: 'dialog', name: 'Edit supplier', trigger: 'Edit supplier', expanded: true },
  { page: 'sheet', role: 'dialog', name: 'Supplier detail', trigger: 'Supplier detail', expanded: true },
  { page: 'confirmdialog', role: 'alertdialog', name: 'Delete invoice 2026/0142?', trigger: 'Delete invoice…', expanded: false },
] as const;

for (const m of MODALS) {
  test.describe(`Overlays/${m.page} example`, () => {
    test('is closed at load', async ({ page }) => {
      await exampleOf(page, m.page);
      const trigger = page.getByRole('button', { name: m.trigger, exact: true });
      await expect(trigger).toBeVisible();
      if (m.expanded) await expect(trigger).toHaveAttribute('aria-expanded', 'false');
      await expect(page.getByRole(m.role)).toHaveCount(0);
    });

    test('opens from the trigger, traps the focus, Escape closes and returns the focus', async ({ page }) => {
      await exampleOf(page, m.page);
      const trigger = page.getByRole('button', { name: m.trigger, exact: true });
      await trigger.click();
      const overlay = page.getByRole(m.role, { name: m.name });
      await expect(overlay).toBeVisible();
      await expect(overlay.locator(':focus')).toHaveCount(1);
      await expectFocusTrapped(page, overlay);
      await page.keyboard.press('Escape');
      await expect(page.getByRole(m.role)).toHaveCount(0);
      await expect(trigger).toBeFocused();
    });
  });
}

test.describe('Overlays/dialog and sheet examples: Save', () => {
  for (const m of [MODALS[0], MODALS[1]]) {
    test(`${m.page}: Cancel does not save, Save does`, async ({ page }) => {
      await exampleOf(page, m.page);
      const trigger = page.getByRole('button', { name: m.trigger, exact: true });
      await trigger.click();
      await page.getByRole(m.role, { name: m.name }).getByRole('button', { name: 'Cancel' }).click();
      await expect(page.getByRole('status')).toHaveText('');
      await expect(trigger).toBeFocused();
      await trigger.click();
      await page.getByRole(m.role, { name: m.name }).getByRole('button', { name: 'Save' }).click();
      await expect(page.getByRole('status')).toHaveText('Saved');
      await expect(trigger).toBeFocused();
    });
  }
});

test.describe('Overlays/confirmdialog example', () => {
  test('Cancel does not run the action, confirming does', async ({ page }) => {
    await exampleOf(page, 'confirmdialog');
    const trigger = page.getByRole('button', { name: 'Delete invoice…' });
    await trigger.click();
    const dialog = page.getByRole('alertdialog', { name: 'Delete invoice 2026/0142?' });
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveText('');
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete invoice' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveText('Invoice deleted');
  });
});

test.describe('Overlays/menu example', () => {
  test('is closed at load', async ({ page }) => {
    await exampleOf(page, 'menu');
    const trigger = page.getByRole('button', { name: 'More actions' });
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('menu')).toHaveCount(0);
  });

  test('arrow keys move the focus, a chosen item acts, Escape closes and returns the focus', async ({ page }) => {
    await exampleOf(page, 'menu');
    const trigger = page.getByRole('button', { name: 'More actions' });
    await trigger.click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Archive' })).toHaveAttribute('aria-disabled', 'true');
    const rename = page.getByRole('menuitem', { name: 'Rename' });
    const duplicate = page.getByRole('menuitem', { name: 'Duplicate' });
    await expect(menu.locator(':focus')).toHaveCount(1);
    await page.keyboard.press('Home');
    await expect(rename).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(duplicate).toBeFocused();
    // The disabled "Archive" is skipped.
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: 'Delete…' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(page.getByRole('status')).toHaveText('');

    await trigger.click();
    await page.getByRole('menuitem', { name: 'Duplicate' }).click();
    await expect(page.getByRole('status')).toHaveText('Chosen: Duplicate');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('the menu is above the page content', async ({ page }) => {
    await exampleOf(page, 'menu');
    await page.getByRole('button', { name: 'More actions' }).click();
    const item = page.getByRole('menuitem', { name: 'Rename' });
    await expect(item).toBeVisible();
    const box = (await item.boundingBox())!;
    const topmost = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x!, y!)?.closest('[role="menuitem"]')?.textContent,
      [box.x + box.width / 2, box.y + box.height / 2],
    );
    expect(topmost).toBe('Rename');
  });
});

test.describe('Overlays/tooltip example', () => {
  test('shows nothing at load, opens on hover and on keyboard focus, Escape closes', async ({ page }) => {
    await exampleOf(page, 'tooltip');
    const trigger = page.getByRole('button', { name: 'Delete', exact: true });
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await trigger.hover();
    await expect(page.getByRole('tooltip')).toHaveText('Delete the selected row');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await page.mouse.move(0, 0);
    await trigger.blur();

    await page.keyboard.press('Tab');
    await expect(trigger).toBeFocused();
    await expect(page.getByRole('tooltip')).toHaveText('Delete the selected row');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toHaveCount(0);
  });
});

test.describe('Overlays/toast example', () => {
  test('shows a toast only after the click, announced in the live region, closed by its action', async ({ page }) => {
    await exampleOf(page, 'toast');
    const region = page.getByRole('status');
    await expect(region).toHaveCount(1);
    await expect(region).toBeEmpty();
    const save = page.getByRole('button', { name: 'Save' });
    await save.click();
    await expect(region).toContainText('Supplier note saved');
    await expect(save).toBeFocused();
    await region.getByRole('button', { name: 'Undo' }).click();
    await expect(region).toBeEmpty();
  });

  test('several clicks in a row leave a single toast', async ({ page }) => {
    await exampleOf(page, 'toast');
    const save = page.getByRole('button', { name: 'Save' });
    await save.click();
    await save.click();
    await save.click();
    await expect(page.getByRole('status').getByRole('button', { name: 'Undo' })).toHaveCount(1);
  });
});

// On the Docs page the examples render in their own iframe: after loading, the trigger is closed and none of
// the example's own overlays is open (looked up by name: the other stories of the page may leave theirs open).
test.describe('Docs pages: the example is closed at load', () => {
  const PAGES = [
    { id: 'dialog', trigger: 'Edit supplier', overlay: { role: 'dialog', name: 'Edit supplier' }, expanded: true },
    { id: 'sheet', trigger: 'Supplier detail', overlay: { role: 'dialog', name: 'Supplier detail' }, expanded: true },
    { id: 'confirmdialog', trigger: 'Delete invoice…', overlay: { role: 'alertdialog', name: 'Delete invoice 2026/0142?' }, expanded: false },
    { id: 'menu', trigger: 'More actions', overlay: { role: 'menu', name: undefined }, expanded: true },
  ] as const;
  for (const p of PAGES) {
    test(`overlays-${p.id}--docs`, async ({ page }) => {
      await page.goto(`/iframe.html?id=overlays-${p.id}--docs&viewMode=docs`);
      const frame: Root = page.frameLocator(`iframe[id="iframe--overlays-${p.id}--example"]`);
      const trigger = frame.getByRole('button', { name: p.trigger, exact: true });
      await expect(trigger).toBeVisible({ timeout: 30_000 });
      if (p.expanded) await expect(trigger).toHaveAttribute('aria-expanded', 'false');
      await expect(frame.getByRole(p.overlay.role, p.overlay.name ? { name: p.overlay.name } : {})).toHaveCount(0);
      await expect(trigger).not.toBeFocused();
    });
  }
});
