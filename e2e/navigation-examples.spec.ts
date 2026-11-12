import { expect, test } from '@playwright/test';
import { gotoStory } from './helpers/story';

// The copy-paste examples of the Navigation pages (ticket #444): what a reader gets by pasting the code
// works with the keyboard as the example's comments promise.

test.describe('Navigation examples', () => {
  test('Tabs: arrow keys move between the tabs and the panel follows', async ({ page }) => {
    await gotoStory(page, 'navigation-tabs--example');
    const overview = page.getByRole('tab', { name: 'Overview' });
    await expect(overview).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('textbox', { name: 'Reference' })).toBeVisible();
    await overview.focus();
    await page.keyboard.press('ArrowRight');
    const details = page.getByRole('tab', { name: 'Details' });
    await expect(details).toHaveAttribute('aria-selected', 'true');
    await expect(details).toBeFocused();
    await expect(page.getByRole('tabpanel')).toHaveText('Details panel');
    await expect(overview).toHaveAttribute('aria-selected', 'false');
    await page.keyboard.press('End');
    await expect(page.getByRole('tab', { name: 'History' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel')).toHaveText('History panel');
    await page.keyboard.press('ArrowLeft');
    await expect(details).toHaveAttribute('aria-selected', 'true');
  });

  test('Accordion: Enter and Space toggle a section with a coherent aria-expanded', async ({ page }) => {
    await gotoStory(page, 'navigation-accordion--example');
    const details = page.getByRole('button', { name: 'Invoice details' });
    const shipping = page.getByRole('button', { name: 'Shipping' });
    await expect(details).toHaveAttribute('aria-expanded', 'true'); // initial value, no click needed
    await expect(shipping).toHaveAttribute('aria-expanded', 'false');
    await shipping.focus();
    await page.keyboard.press('Enter');
    await expect(shipping).toHaveAttribute('aria-expanded', 'true');
    await expect(details).toHaveAttribute('aria-expanded', 'false'); // type="single"
    await expect(page.getByRole('textbox', { name: 'Shipping note' })).toBeVisible();
    await page.keyboard.press('Space');
    await expect(shipping).toHaveAttribute('aria-expanded', 'false'); // collapsible
    await expect(page.getByRole('textbox', { name: 'Shipping note' })).toBeHidden();
  });

  test('Collapsible: Enter and Space open and close the section', async ({ page }) => {
    await gotoStory(page, 'navigation-collapsible--example');
    const trigger = page.getByRole('button', { name: 'Advanced options' });
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('textbox', { name: 'Reference' })).toBeHidden();
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('textbox', { name: 'Reference' })).toBeVisible();
    await page.keyboard.press('Space');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('textbox', { name: 'Reference' })).toBeHidden();
  });

  test('Pagination: changing page updates aria-current', async ({ page }) => {
    await gotoStory(page, 'navigation-pagination--example');
    const current = page.locator('[aria-current="page"]');
    await expect(current).toHaveAttribute('aria-label', 'Page 1'); // initial value, no gesture needed
    await page.getByRole('button', { name: 'Next page' }).focus();
    await page.keyboard.press('Enter');
    await expect(current).toHaveAttribute('aria-label', 'Page 2');
    await page.getByRole('button', { name: 'Page 3' }).click();
    await expect(current).toHaveAttribute('aria-label', 'Page 3');
    await page.getByRole('button', { name: 'Previous page' }).click();
    await expect(current).toHaveAttribute('aria-label', 'Page 2');
    await expect(current).toHaveCount(1);
  });

  test('Breadcrumb: the last item is the current page and the links stay on the page', async ({ page }) => {
    await gotoStory(page, 'navigation-breadcrumb--example');
    const current = page.locator('[aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveText('2026-0142');
    await expect(current).not.toHaveAttribute('href', /.*/);
    const url = page.url();
    for (const name of ['Home', 'Invoices']) {
      const link = page.getByRole('link', { name });
      await expect(link).toHaveAttribute('href', /^#/);
      await link.click();
      expect(page.url()).toBe(url);
    }
  });
});
