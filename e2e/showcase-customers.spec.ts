import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow } from './helpers/geometry';
import { expectPlayToPass, gotoStory } from './helpers/story';

// #523: Showcase/Record editing -> the Customers module: a record of another shape on the same shell. List Report ->
// customer page, a nested billing address, an array of contacts with ids, the account manager in a Combobox, an
// archived customer that is not interactive from the keyboard either, and the virtual keyboard on the e-mail of the
// last contact. Seed: cus-4 active (2 contacts), cus-1 one contact, cus-9 account manager who left, cus-11 archived,
// cus-34 four contacts.
const LIST = 'showcase-record-editing--customer-list-to-record-manual';
const PAGE = 'showcase-record-editing--customer-record-page-manual';
const NO_DELAYS = 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:0';
const VISUAL_STORIES = ['customer-record-open', 'customer-record-contact-error', 'customer-record-archived', 'customer-list'].map(
  (n) => `showcase-record-editing--${n}`,
);
const ITALIAN = ['Sezioni', 'Chiudi', 'Azioni di salvataggio', 'Modifiche non salvate', 'Nessun', 'Clienti', 'Cerca', 'Ripristina'];

type KeyboardWindow = { __setKeyboard: (px: number) => void };
type StoreWindow = { __ropShowcaseStore?: { snapshot: () => { id: string; status: string; name: string; billingAddress: { city: string; postalCode: string; country: string }; contacts: { id: string; name: string; email: string; primary: boolean }[] }[] } };

const table = (page: Page): Locator => page.getByRole('table', { name: /Customers/ });
const bar = (page: Page): Locator => page.getByRole('region', { name: 'Save actions' });
const back = (page: Page): Locator => page.getByRole('button', { name: 'Back to list' });
const textbox = (page: Page, name: string): Locator => page.getByRole('textbox', { name, exact: true });
const params = (page: Page): URLSearchParams => new URL(page.url()).searchParams;

async function openList(page: Page): Promise<void> {
  await page.goto(`/iframe.html?id=${LIST}&viewMode=story&args=${encodeURIComponent(NO_DELAYS)}&module=customers`);
  await expect(table(page)).toBeVisible();
  await expect(page.getByRole('row').nth(5)).toBeVisible();
}

async function openCustomer(page: Page, id: string, args = 'loadDelayMs:0;saveDelayMs:0'): Promise<void> {
  await gotoStory(page, PAGE, `${args};recordId:${id}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(textbox(page, 'Name')).toBeVisible();
}

const storedCustomer = (page: Page, id: string) =>
  page.evaluate((cid) => (window as unknown as StoreWindow).__ropShowcaseStore?.snapshot().find((c) => c.id === cid), id);

test.describe('Showcase/Record editing, customers: the stories play', () => {
  for (const id of ['customer-record-page', 'customer-contacts', 'customer-list-to-record', 'customer-archived', ...VISUAL_STORIES.map((s) => s.replace('showcase-record-editing--', ''))]) {
    test(`${id}: the play function passes`, async ({ page }) => {
      await expectPlayToPass(page, `showcase-record-editing--${id}`);
    });
  }

  test('the reduced-motion preference leads the visual stories to the same end state', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const id of VISUAL_STORIES) await expectPlayToPass(page, id);
  });
});

test.describe('Showcase/Record editing, customers: the list', () => {
  test('200 customers with the six columns, the credit limit right-aligned in the customer currency, no word of another language', async ({ page }) => {
    await openList(page);
    await expect(page.getByRole('heading', { level: 2, name: /Customers/ })).toContainText('200');
    for (const header of ['Code', 'Name', 'Country', 'Account manager', 'Credit limit', 'Status']) {
      await expect(page.getByRole('columnheader', { name: new RegExp(header) })).toBeVisible();
    }
    const cells = page.getByRole('row').nth(1).getByRole('cell');
    await expect(cells.nth(4)).toHaveText(/^[€$£¥][\d,]+(\.\d{2})?$/);
    expect(await cells.nth(4).evaluate((el) => getComputedStyle(el).textAlign)).toMatch(/right|end/);
    await expect(cells.nth(5)).toHaveText(/^(Active|On hold|Archived)$/);
    const body = (await page.locator('body').innerText()) ?? '';
    for (const word of ITALIAN) expect(body, word).not.toContain(word);
  });

  test('the pill "On hold" and the search on code, name and city (accents ignored)', async ({ page }) => {
    await openList(page);
    await page.getByRole('radio', { name: 'On hold' }).click();
    await expect(page.getByRole('heading', { level: 2, name: /Customers/ })).toContainText('25 of 200');
    await expect(page.getByRole('row').nth(1).getByRole('cell').nth(5)).toHaveText('On hold');
    expect(params(page).get('customers.filter')).toBe('on-hold');
    await page.getByRole('radio', { name: 'All' }).click();
    const search = page.getByRole('searchbox', { name: 'Search' });
    await search.fill('C-10004');
    await search.press('Enter');
    await expect(page.getByRole('row')).toHaveCount(2);
    await search.fill('munchen');
    await search.press('Enter');
    await expect(page.getByRole('row').nth(1)).toBeVisible();
    expect(params(page).get('customers.q')).toBe('munchen');
    await search.fill('Italy');
    await search.press('Enter');
    await expect(table(page).getByText('No results for the current filters')).toBeVisible();
  });
});

test.describe('Showcase/Record editing, customers: list -> customer -> list', () => {
  test('a nested change, a contact, Save, back: the store holds them and the list shows the new name', async ({ page }) => {
    await openList(page);
    await page.getByRole('link', { name: 'C-10004', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'C-10004' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Sections' }).getByRole('link')).toHaveText([
      'General',
      'Billing address',
      'Contacts',
      'Commercial terms',
      'Account',
    ]);
    expect(params(page).get('module')).toBe('customers');
    await expect(bar(page)).toBeHidden();

    // The city changed and put back: the save bar comes and goes.
    const city = textbox(page, 'City');
    const savedCity = await city.inputValue();
    await city.fill('Ravenna');
    await expect(bar(page)).toBeVisible();
    await city.fill(savedCity);
    await expect(bar(page)).toBeHidden();

    // A nested change, a new contact made primary, a new name.
    await page.getByRole('combobox', { name: 'Country' }).click();
    await page.getByRole('option', { name: 'Germany' }).click();
    await textbox(page, 'Postal code').fill('10115');
    await city.fill('Berlin');
    await page.getByRole('button', { name: 'Add contact' }).click();
    await expect(textbox(page, 'Contact 3 name')).toBeFocused();
    await page.keyboard.type('Ilse Visser');
    await textbox(page, 'Contact 3 e-mail').fill('ilse.visser@company.example');
    await page.getByRole('combobox', { name: 'Primary contact' }).click();
    await page.getByRole('option', { name: 'Ilse Visser' }).click();
    await textbox(page, 'Name').fill('Borgavella Tools GmbH');
    await bar(page).getByRole('button', { name: 'Save' }).click();
    await expect(bar(page)).toBeHidden();
    const saved = await storedCustomer(page, 'cus-4');
    expect(saved?.billingAddress).toMatchObject({ city: 'Berlin', postalCode: '10115', country: 'DE' });
    expect(saved?.contacts).toHaveLength(3);
    expect(saved?.contacts.filter((c) => c.primary).map((c) => c.name)).toEqual(['Ilse Visser']);
    expect(saved?.contacts[2]?.id).toMatch(/^new-contact-/);

    await back(page).click();
    await expect(table(page)).toBeVisible();
    const row = page.getByRole('row').filter({ has: page.getByRole('link', { name: 'C-10004', exact: true }) });
    await expect(row).toContainText('Borgavella Tools GmbH');
    await expect(row).toContainText('Germany');
    await expect.poll(() => page.evaluate(() => document.activeElement?.textContent)).toBe('C-10004');
  });

  test('an invalid e-mail on a new contact: the error on that field, the summary in the bar, the focus on it', async ({ page }) => {
    await openCustomer(page, 'cus-4');
    await page.getByRole('button', { name: 'Add contact' }).click();
    await textbox(page, 'Contact 3 name').fill('Ilse Visser');
    const email = textbox(page, 'Contact 3 e-mail');
    await email.fill('ilse.visser@company');
    await page.getByRole('combobox', { name: 'Primary contact' }).click();
    await page.getByRole('option', { name: 'Ilse Visser' }).click();
    await bar(page).getByRole('button', { name: 'Save' }).click();
    await expect(email).toHaveAttribute('aria-invalid', 'true');
    await expect(email).toHaveAccessibleDescription('Enter a valid e-mail address, like name@company.com.');
    await expect(bar(page)).toContainText('1 invalid field');
    await expect(email).toBeFocused();
    await expect(textbox(page, 'Contact 2 e-mail')).not.toHaveAttribute('aria-invalid', 'true');
  });

  test('a postal code that is not of the billing country: the error on billingAddress.postalCode', async ({ page }) => {
    await openCustomer(page, 'cus-4');
    await page.getByRole('combobox', { name: 'Country' }).click();
    await page.getByRole('option', { name: 'Netherlands' }).click();
    await bar(page).getByRole('button', { name: 'Save' }).click();
    const postal = textbox(page, 'Postal code');
    await expect(postal).toHaveAttribute('aria-invalid', 'true');
    await expect(postal).toHaveAccessibleDescription('Postal code must look like 1234 AB for Netherlands.');
    await expect(postal).toBeFocused();
  });

  test('removing a contact and adding an identical one keeps the save bar (another id: another contact)', async ({ page }) => {
    await openCustomer(page, 'cus-4');
    const texts = await Promise.all(['name', 'role', 'e-mail', 'phone'].map((f) => textbox(page, `Contact 2 ${f}`).inputValue()));
    await page.getByRole('button', { name: 'Remove contact 2' }).click();
    await expect(bar(page)).toBeVisible();
    await page.getByRole('button', { name: 'Add contact' }).click();
    for (const [i, f] of ['name', 'role', 'e-mail', 'phone'].entries()) await textbox(page, `Contact 2 ${f}`).fill(texts[i]!);
    await expect(bar(page)).toBeVisible();
    await bar(page).getByRole('button', { name: 'Discard' }).click();
    await expect(bar(page)).toBeHidden();
  });

  test('after Save and reopening the customer, removing the saved new contact and re-adding it identical still shows the save bar', async ({ page }) => {
    await openList(page);
    await page.getByRole('link', { name: 'C-10004', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'C-10004' })).toBeVisible();
    await page.getByRole('button', { name: 'Add contact' }).click();
    await textbox(page, 'Contact 3 name').fill('Ilse Visser');
    await textbox(page, 'Contact 3 e-mail').fill('ilse.visser@company.example');
    await bar(page).getByRole('button', { name: 'Save' }).click();
    await expect(bar(page)).toBeHidden();
    const savedId = (await storedCustomer(page, 'cus-4'))?.contacts[2]?.id;
    expect(savedId).toMatch(/^new-contact-/);

    // Back to the list and open it again: the counter of the new ids starts from 0 again.
    await back(page).click();
    await expect(table(page)).toBeVisible();
    await page.getByRole('link', { name: 'C-10004', exact: true }).click();
    await expect(textbox(page, 'Contact 3 name')).toHaveValue('Ilse Visser');
    await page.getByRole('button', { name: 'Remove contact 3' }).click();
    await page.getByRole('button', { name: 'Add contact' }).click();
    await textbox(page, 'Contact 3 name').fill('Ilse Visser');
    await textbox(page, 'Contact 3 e-mail').fill('ilse.visser@company.example');
    await expect(bar(page)).toBeVisible();
    const newId = await page.locator('[data-contact-id]').nth(2).getAttribute('data-contact-id');
    expect(newId).toMatch(/^new-contact-/);
    expect(newId).not.toBe(savedId);
  });

  test('the only contact cannot be removed: aria-disabled, its reason, nothing happens on click or Enter', async ({ page }) => {
    await openCustomer(page, 'cus-1');
    const remove = page.getByRole('button', { name: 'Remove contact 1' });
    await expect(remove).toHaveAttribute('aria-disabled', 'true');
    await expect(remove).toHaveAccessibleDescription('A customer needs at least one contact: add another one before removing this one.');
    await remove.click({ force: true });
    await remove.focus();
    await page.keyboard.press('Enter');
    await expect(textbox(page, 'Contact 1 name')).toBeVisible();
    await expect(bar(page)).toBeHidden();
  });

  test('an account manager who left the company is still shown and not offered', async ({ page }) => {
    await openCustomer(page, 'cus-9');
    const manager = page.getByRole('combobox', { name: 'Account manager' });
    await expect(manager).toHaveValue(/ \(left the company\)$/);
    const name = (await manager.inputValue()).replace(' (left the company)', '');
    await manager.click();
    await expect(page.getByRole('option').first()).toBeVisible();
    await expect(page.getByRole('option', { name, exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(manager).toHaveValue(`${name} (left the company)`);
    await expect(bar(page)).toBeHidden();
  });
});

test.describe('Showcase/Record editing, customers: archived', () => {
  test('nothing is interactive from the keyboard: Tab skips every field; typing changes nothing; the reason is linked', async ({ page }) => {
    await openCustomer(page, 'cus-11');
    const name = textbox(page, 'Name');
    await expect(name).toBeDisabled();
    await expect(name).toHaveAccessibleDescription('An archived customer cannot be edited: restore it first.');
    await expect(page.getByRole('button', { name: 'Add contact' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Remove contact/ })).toHaveCount(0);
    await back(page).focus();
    const reached: string[] = [];
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      reached.push(await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return el ? `${el.tagName}:${el.getAttribute('role') ?? ''}:${el.textContent?.slice(0, 20) ?? ''}` : 'none';
      }));
    }
    expect(reached[0]).toMatch(/^BUTTON::Restore/);
    expect(reached.filter((r) => r.startsWith('INPUT') || r.includes(':combobox:'))).toEqual([]);
    await page.keyboard.type('xyz');
    await expect(bar(page)).toBeHidden();
    expect((await storedCustomer(page, 'cus-11'))?.status).toBe('archived');
  });

  test('Restore: Active on the server, the fields enabled, the focus on Name; it can be edited and saved', async ({ page }) => {
    await openCustomer(page, 'cus-11', 'loadDelayMs:0;saveDelayMs:600');
    await page.getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByRole('button', { name: 'Restoring…' })).toHaveAttribute('aria-disabled', 'true');
    const name = textbox(page, 'Name');
    await expect(name).toBeEnabled();
    await expect(name).toBeFocused();
    await expect(page.getByRole('button', { name: 'Restore' })).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 }).locator('xpath=../..')).toContainText('Active');
    expect((await storedCustomer(page, 'cus-11'))?.status).toBe('active');
    await expect(bar(page)).toBeHidden();
    await name.fill('Schwertling Power Systems AG');
    await bar(page).getByRole('button', { name: 'Save' }).click();
    await expect(bar(page)).toBeHidden();
    expect((await storedCustomer(page, 'cus-11'))?.name).toBe('Schwertling Power Systems AG');
  });

  test('a Save that archives locks the page while it runs: typing and Discard change nothing; then archived, clean, announced', async ({ page }) => {
    // The longest delay of the control: the checks "while it runs" have the whole of it.
    await openCustomer(page, 'cus-4', 'loadDelayMs:0;saveDelayMs:3000');
    const name = textbox(page, 'Name');
    const savedName = await name.inputValue();
    await page.getByRole('combobox', { name: 'Status' }).click();
    await page.getByRole('option', { name: 'Archived' }).click();
    await bar(page).getByRole('button', { name: 'Save' }).click();
    const reason = 'The customer is being archived: nothing can be changed until the save completes.';
    await expect(name).toBeDisabled();
    await expect(name).toHaveAccessibleDescription(reason);
    await expect(bar(page).getByRole('status')).toContainText(reason);
    // A click on a disabled field focuses nothing: the keys go nowhere.
    await name.click({ force: true });
    await page.keyboard.type(' EDIT');
    await expect(name).toHaveValue(savedName);
    const discard = bar(page).getByRole('button', { name: 'Discard' });
    await expect(discard).toHaveAttribute('aria-disabled', 'true');
    // `aria-disabled` does not block a click (nor Enter): neither resets the draft.
    await discard.click({ force: true });
    await discard.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('combobox', { name: 'Status' })).toHaveText(/Archived/);
    expect((await storedCustomer(page, 'cus-4'))?.status).toBe('active');

    await expect(page.getByRole('button', { name: 'Restore' })).toBeVisible({ timeout: 10_000 });
    await expect(bar(page)).toBeHidden();
    expect(await storedCustomer(page, 'cus-4')).toMatchObject({ status: 'archived', name: savedName });
    await expect(name).toHaveValue(savedName);
    await expect(name).toHaveAccessibleDescription('An archived customer cannot be edited: restore it first.');
    await expect(page.getByRole('status').filter({ hasText: 'Customer C-10004 archived.' })).toHaveCount(1);
  });

  test('a Restore that fails says so; the customer stays archived', async ({ page }) => {
    await openCustomer(page, 'cus-11', 'loadDelayMs:0;saveDelayMs:0;saveOutcome:error');
    await page.getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByText('Could not restore the customer. Try again.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Restore' })).toBeFocused();
    await expect(textbox(page, 'Name')).toBeDisabled();
  });
});

test.describe('Showcase/Record editing, customers: viewports', () => {
  for (const [label, viewport] of [
    ['mobile', { width: 375, height: 667 }],
    ['tablet', { width: 768, height: 1024 }],
  ] as const) {
    test.describe(label, () => {
      test.use({ viewport, hasTouch: true });

      test.beforeEach(async ({ page }) => {
        // Same stand-in for the visual viewport as e2e/showcase-sales-orders.spec.ts and e2e/field.spec.ts.
        await page.addInitScript(() => {
          const target = new EventTarget();
          let keyboard = 0;
          const vv = Object.defineProperties(target, {
            offsetTop: { value: 0 },
            offsetLeft: { value: 0 },
            pageTop: { value: 0 },
            pageLeft: { value: 0 },
            scale: { value: 1 },
            height: { get: () => window.innerHeight - keyboard },
            width: { get: () => window.innerWidth },
          });
          Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
          (window as unknown as KeyboardWindow).__setKeyboard = (px) => {
            keyboard = px;
            target.dispatchEvent(new Event('resize'));
          };
        });
      });

      test('the e-mail of the last contact stays above the virtual keyboard and is not covered by the save bar', async ({ page }) => {
        await openCustomer(page, 'cus-34');
        await expect(page.getByRole('button', { name: /^Remove contact/ })).toHaveCount(4);
        await textbox(page, 'Name').fill('Dirty on purpose');
        await expect(bar(page)).toBeVisible();
        const field = textbox(page, 'Contact 4 e-mail');
        const keyboard = Math.round(viewport.height * 0.45);
        const keyboardLine = viewport.height - keyboard;
        const rect = (loc: Locator) => loc.evaluate((el) => ({ top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom }));
        // The field at the BOTTOM of the visible page, where the keyboard will cover it: without this precondition the
        // check below would pass with no keyboard handling at all (red team of #523).
        await field.evaluate((el) => el.scrollIntoView({ block: 'end' }));
        await field.focus();
        expect((await rect(field)).bottom).toBeGreaterThan(keyboardLine);
        await page.evaluate((px) => (window as unknown as KeyboardWindow).__setKeyboard(px), keyboard);
        await expect.poll(async () => (await rect(field)).bottom).toBeLessThanOrEqual(keyboardLine);
        expect((await rect(field)).top).toBeGreaterThanOrEqual(0);
        const f = await rect(field);
        const b = await rect(bar(page));
        expect(f.bottom <= b.top + 1 || f.top >= b.bottom - 1).toBe(true);
        expect(await page.evaluate(() => window.scrollY)).toBe(0);
        await expect(field).toBeFocused();
        // Typing goes into the focused field.
        await page.keyboard.type('x');
        await expect(field).toHaveValue(/x$/);
      });

      test('the list and the customer page do not overflow sideways; the Anchor Bar with five sections is there', async ({ page }) => {
        await openList(page);
        expect(await page.evaluate(() => document.scrollingElement!.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
        await page.locator('a[data-record-id]').first().click();
        await expect(textbox(page, 'Name')).toBeVisible();
        await expect(page.getByRole('navigation', { name: 'Sections' }).getByRole('link')).toHaveCount(5);
        await expectNoHorizontalOverflow(page.locator('#storybook-root'));
        expect(await page.evaluate(() => document.scrollingElement!.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1);
      });
    });
  }
});
