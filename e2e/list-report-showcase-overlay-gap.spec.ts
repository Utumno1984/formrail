import { expect, test } from '@playwright/test';
import { gotoStory } from './helpers/story';

// #308: on mobile (375x667) the visual story "New invoice" must not show a huge empty band between the
// last field and the footer. (The Sheet itself stays full-height by contract, see list-report-showcase.spec.ts.)
const STORY = 'floorplans-list-report--smart-filter-bar-showcase-overlay-open';

test.describe('SmartFilterBarShowcaseOverlayOpen: no empty band on mobile (#308)', () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true });

  test('the gap between the Supplier name field and the footer is at most 25% of the panel height', async ({
    page,
  }) => {
    await gotoStory(page, STORY);
    const panel = page.getByRole('dialog', { name: 'New invoice' });
    await expect(panel).toBeVisible();
    const field = (await panel.getByRole('textbox', { name: 'Supplier name' }).boundingBox())!;
    const cancel = (await panel.getByRole('button', { name: 'Cancel' }).boundingBox())!;
    const box = (await panel.boundingBox())!;
    const gap = cancel.y - (field.y + field.height);
    expect(gap / box.height).toBeLessThanOrEqual(0.25);
  });
});
