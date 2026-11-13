import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { gotoStory } from './helpers/story';

// The copy-paste examples of the Primitives pages (#445), exercised the way someone who pasted them would.
test.describe('Primitives copy-paste examples', () => {
  test('Button: the icon-only button is found by its accessible name and works', async ({ page }) => {
    await gotoStory(page, 'primitives-button--example');
    await expect(page.getByRole('status')).toHaveText('Not saved yet');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status')).toHaveText('Saved');
    await page.getByRole('button', { name: 'Clear status' }).click();
    await expect(page.getByRole('status')).toHaveText('');
    await expectNoA11yViolations(page);
  });

  test('Skeleton: the container keeps its height from loading to content', async ({ page }) => {
    await gotoStory(page, 'primitives-skeleton--example');
    const card = page.getByLabel('Invoice summary');
    await expect(card).toHaveAttribute('aria-busy', 'true');
    const before = (await card.boundingBox())!.height;
    await page.getByRole('button', { name: 'Load' }).click();
    await expect(card).toHaveAttribute('aria-busy', 'false');
    await expect(page.getByText('Paid on 12 March by Acme Corp.')).toBeVisible();
    expect(Math.abs((await card.boundingBox())!.height - before)).toBeLessThanOrEqual(1);
    await expectNoA11yViolations(page);
  });

  test('MessageStrip: closes from the keyboard and the focus lands on a visible control', async ({ page }) => {
    await gotoStory(page, 'primitives-messagestrip--example');
    const close = page.getByRole('button', { name: 'Dismiss message: Session expiring' });
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(close).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Show the notice again' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Dismiss message: Session expiring' })).toBeVisible();
    // The focus goes to a NON-live wrapper: the strip inside it is the live region, and speaks once.
    const wrapper = page.getByText('Save your work within five minutes.').locator('xpath=ancestor::*[@tabindex="-1"][1]');
    await expect(wrapper).toBeFocused();
    await expect(wrapper).toBeVisible();
    await expect(wrapper).not.toHaveAttribute('role', /.+/);
    await expect(wrapper).not.toHaveAttribute('aria-live', /.+/);
    const outline = await wrapper.evaluate((el) => {
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
    await expect(page.getByRole('button', { name: 'Show the notice again' })).toBeDisabled();
  });

  test('ProgressBar: named, and completes with an announcement', async ({ page }) => {
    await gotoStory(page, 'primitives-progressbar--example');
    const bar = page.getByRole('progressbar', { name: 'Uploading invoices' });
    await expect(bar).toHaveAttribute('aria-valuenow', '0');
    await page.getByRole('button', { name: 'Start upload' }).click();
    await expect(bar).toHaveAttribute('aria-valuenow', '100', { timeout: 5_000 });
    await expect(page.getByRole('status')).toHaveText('Upload complete');
    await expectNoA11yViolations(page);
  });

  test('Spinner: announced while loading, then the data, in a panel of stable height', async ({ page }) => {
    await gotoStory(page, 'primitives-spinner--example');
    const panel = page.locator('[aria-busy]');
    await expect(panel).toHaveAttribute('aria-busy', 'false');
    const before = (await panel.boundingBox())!.height;
    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect(panel).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByRole('status')).toHaveText('Loading');
    expect(Math.abs((await panel.boundingBox())!.height - before)).toBeLessThanOrEqual(1);
    await expect(page.getByText('Invoice 1001')).toBeVisible();
    await expect(panel).toHaveAttribute('aria-busy', 'false');
    expect(Math.abs((await panel.boundingBox())!.height - before)).toBeLessThanOrEqual(1);
    await expectNoA11yViolations(page);
  });

  test('Avatar: no network request, the initials and the photo are named', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (request) => {
      const { protocol, hostname } = new URL(request.url());
      if (protocol !== 'data:' && hostname !== 'localhost' && hostname !== '127.0.0.1') external.push(request.url());
    });
    await gotoStory(page, 'primitives-avatar--example');
    await expect(page.getByRole('img', { name: 'Grace Hopper' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Ada Lovelace' })).toBeVisible();
    expect(external).toEqual([]);
    await expectNoA11yViolations(page);
  });

  test('FieldMessage: the message is the input description and turns into an error', async ({ page }) => {
    await gotoStory(page, 'primitives-fieldmessage--example');
    const input = page.getByLabel('Password');
    await expect(input).toHaveAccessibleDescription('At least 8 characters.');
    await input.fill('abc');
    await expect(input).toHaveAccessibleDescription('The password is too short.');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await input.fill('abcdefgh');
    await expect(input).toHaveAccessibleDescription('At least 8 characters.');
  });

  test('Card: a region named by its title; the footer action toggles', async ({ page }) => {
    await gotoStory(page, 'primitives-card--example');
    await expect(page.getByRole('region', { name: 'Invoice 2026-0142' })).toBeVisible();
    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText('Approved.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Undo approval' })).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test('Divider: one separator is exposed, the decorative vertical one is not', async ({ page }) => {
    await gotoStory(page, 'primitives-divider--example');
    await expect(page.getByRole('separator')).toHaveCount(1);
    await expectNoA11yViolations(page);
  });

  test('StatusBadge: the five statuses are plain text', async ({ page }) => {
    await gotoStory(page, 'primitives-statusbadge--example');
    for (const text of ['Draft', 'In review', 'Approved', 'Overdue', 'Rejected']) await expect(page.getByText(text, { exact: true })).toBeVisible();
    await expectNoA11yViolations(page);
  });
});
