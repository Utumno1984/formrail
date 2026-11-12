import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
// @ts-expect-error plain .mjs helper, no type declarations
import { PRO_DEMO_NOT_PUBLIC } from '../../.storybook/story-globs.mjs';
import { buildText, proExamples } from '../helpers/pro-examples';

// Ticket #447, on the assembled site (see playwright.site.config.ts): the copy-paste examples of packages/pro are
// in the Pro demo (pro/), except the not-yet-public folders, and nowhere in the Free Storybook (storybook/). The
// complete build (where every Pro example is present) is checked by e2e/pro-examples.spec.ts.

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SITE_DIR = fileURLToPath(new URL('../../site/', import.meta.url));
const examples = proExamples(REPO_ROOT);
const notPublic = PRO_DEMO_NOT_PUBLIC as string[];

test.describe('Pro copy-paste examples per build (#447)', () => {
  test('the scan is not vacuous: every Pro page has an example; every folder is public since #384 (Form rebase)', () => {
    expect(examples.map((example) => example.folder).sort()).toEqual(['change-summary', 'form-rebase', 'form-rebase', 'list-report']);
    expect(notPublic).toEqual([]);
  });

  test('the Free Storybook carries no Pro example text', () => {
    const text = buildText(`${SITE_DIR}storybook`);
    // The core examples ARE there (the lookup works in this build): the scan reads the right assets.
    expect(text).toContain('export function InvoiceList(');
    for (const { file, marker } of examples) expect(text.includes(marker), file).toBe(false);
  });

  test('the Pro demo carries the public Pro examples only (all of them, the Form rebase ones included)', () => {
    const text = buildText(`${SITE_DIR}pro`);
    for (const { file, folder, marker } of examples) expect(text.includes(marker), file).toBe(!notPublic.includes(folder));
    for (const marker of ['export function InvoiceRebase(', 'export function InvoiceUpdatedNotice(']) expect(text, marker).toContain(marker);
    // Nor the core examples: the demo has no core page.
    expect(text).not.toContain('export function InvoiceList(');
  });

  test('a Free Docs page still opens with its example, without a lookup error', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.goto('storybook/iframe.html?id=floorplans-list-report--docs&viewMode=docs');
    await expect(page.locator('.sbdocs-content [data-styles-reminder] code')).toHaveText(["import '@formrail/core/styles.css';"]);
    expect(errors).toEqual([]);
  });

  test('a Pro demo Docs page opens with its example and the two stylesheets, core first', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.goto('pro/iframe.html?id=pro-changesummary--docs&viewMode=docs');
    await expect(page.locator('.sbdocs-content [data-styles-reminder] code')).toHaveText(["import '@formrail/core/styles.css';", "import '@formrail/pro/styles.css';"]);
    await expect(page.locator('.sbdocs-content').getByRole('list', { name: 'Unsaved changes' })).toHaveCount(0);
    await expect(page.locator('.sbdocs-content').getByText('No unsaved changes')).toBeVisible();
    expect(errors).toEqual([]);
  });
});
