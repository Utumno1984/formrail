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
  { page: 'confirmdialog', role: 'dialog', name: 'Delete invoice 2026/0142?', trigger: 'Delete invoice…', expanded: false },
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
    const dialog = page.getByRole('dialog', { name: 'Delete invoice 2026/0142?' });
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveText('');
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete invoice' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveText('Invoice deleted');
    // The trigger is disabled once the invoice is gone: the focus goes to the outcome message, never to <body>.
    // A single live region, which is NOT the element that takes the focus (one announcement, not two).
    const message = page.getByRole('status');
    await expect(message).toHaveCount(1);
    await expect(message).not.toBeFocused();
    const focused = message.locator('xpath=..');
    await expect(focused).toBeFocused();
    await expect(focused).not.toHaveAttribute('role', /.+/);
    await expect(focused).not.toHaveAttribute('aria-live', /.+/);
    // The focus is visible: a real outline, in the focus-ring colour of the controls.
    const outline = await focused.evaluate((el) => {
      const c = getComputedStyle(el);
      return { style: c.outlineStyle, width: c.outlineWidth, color: c.outlineColor };
    });
    expect(outline.style).toBe('solid');
    expect(outline.width).toBe('2px');
    const primary = await page.evaluate(() => {
      const probe = document.createElement('i');
      probe.style.color = 'var(--color-rop-primary)';
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    });
    expect(outline.color).toBe(primary);
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
    // Opened by a click, the focus is on the menu itself or one of its items: either way inside it.
    await expect(page.locator('[role="menu"]:focus, [role="menu"] :focus')).toHaveCount(1);
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

  // Ticket #463: on a real page (a Docs page holds several stories) another control often has the focus when
  // the trigger is clicked; a pointer press does not move the focus to the trigger, yet closing returns it there.
  test('opened by a click while another control has the focus: Escape and a chosen item return it to the trigger', async ({
    page,
  }) => {
    await exampleOf(page, 'menu');
    // The example has no other control: one is added to the page, outside the example.
    await page.evaluate(() => {
      const button = document.createElement('button');
      button.textContent = 'Save';
      document.body.prepend(button);
    });
    const save = page.getByRole('button', { name: 'Save', includeHidden: true });
    const trigger = page.getByRole('button', { name: 'More actions', includeHidden: true });
    await save.click();
    await expect(save).toBeFocused();
    await trigger.click();
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(trigger).toBeFocused();

    await save.click();
    await expect(save).toBeFocused();
    await trigger.click();
    await page.getByRole('menuitem', { name: 'Rename' }).click();
    await expect(page.getByRole('status')).toHaveText('Chosen: Rename');
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
    const state = page.getByTestId('note-state');
    await expect(state).toHaveText('Note not saved');
    await save.click();
    await expect(region).toContainText('Supplier note saved');
    await expect(state).toHaveText('Note saved');
    await expect(save).toBeFocused();
    await region.getByRole('button', { name: 'Undo' }).click();
    await expect(region).toBeEmpty();
    await expect(state).toHaveText('Note not saved');
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
    { id: 'confirmdialog', trigger: 'Delete invoice…', overlay: { role: 'dialog', name: 'Delete invoice 2026/0142?' }, expanded: false },
    { id: 'menu', trigger: 'More actions', overlay: { role: 'menu', name: undefined }, expanded: true },
    { id: 'tooltip', trigger: 'Delete', overlay: { role: 'tooltip', name: undefined }, expanded: false },
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

  // The Toast page: the example's live region is empty until the click, nothing is announced at load.
  test('overlays-toast--docs', async ({ page }) => {
    await page.goto('/iframe.html?id=overlays-toast--docs&viewMode=docs');
    const frame: Root = page.frameLocator('iframe[id="iframe--overlays-toast--example"]');
    await expect(frame.getByRole('button', { name: 'Save', exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(frame.getByRole('status')).toBeEmpty();
    await expect(frame.getByRole('button', { name: 'Undo' })).toHaveCount(0);
  });
});
