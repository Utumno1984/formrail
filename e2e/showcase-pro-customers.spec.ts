import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectNoHorizontalOverflow } from './helpers/geometry';
import { MOBILE_VIEWPORT } from './helpers/viewports';
import { expectPlayToPass } from './helpers/story';

// #524: Pro/Showcase/Record editing integrity, customers. The Free record-editing shell with the Pro add-ons on a
// record of another shape than the sales order (showcase-pro-sales-orders.spec.ts): a nested billing address, contacts
// matched by id, an account manager (a relation to an employee), a credit limit in the customer's currency, and a
// customer archived on the server while it is open. Seed: cus-4 / C-10004 (EUR, 2 contacts: Matteo Gatti primary,
// Giulia Bellini), cus-34 / C-10034 (USD, 4 contacts), cus-40 / C-10040 (JPY).
const PREFIX = 'pro-showcase-record-editing-integrity--';
const FIXTURE = `${PREFIX}customer-manual`;
const FAST = 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:0;serverUpdateDelayMs:0';
const CUSTOMER = { id: 'cus-4', code: 'C-10004' };
const FOUR_CONTACTS = { id: 'cus-34', code: 'C-10034' };
const YEN = { id: 'cus-40', code: 'C-10040' };
const PLAYS = ['customer-review-changes', 'customer-review-contacts', 'customer-server-update', 'customer-archived-remotely'];
const VISUALS = ['customer-review-dialog', 'customer-archived-notice'];
const ARCHIVED_TITLE = 'This customer was archived on the server';

interface StoredContact {
  id: string;
  name: string;
  role: string;
  email: string;
  primary: boolean;
}
interface Stored {
  id: string;
  status: string;
  name: string;
  accountManagerId: string | null;
  billingAddress: { line1: string; line2: string | null; postalCode: string; city: string };
  contacts: StoredContact[];
}
interface ShowcaseStore {
  snapshot: () => Stored[];
  save: (customer: Stored) => Promise<Stored>;
  updateFromServer: (id: string, change: (c: Stored) => Stored) => Promise<Stored>;
}
type ShowcaseWindow = { __ropShowcaseStore?: ShowcaseStore; __ropSaves?: Stored[] };

const url = (args: string, id = FIXTURE): string => `/iframe.html?id=${id}&viewMode=story&args=${encodeURIComponent(args)}&module=customers`;
const reviewDialog = (page: Page): Locator => page.getByRole('dialog', { name: 'Review changes' });
const footer = (page: Page): Locator => page.getByRole('region', { name: 'Save actions' });
const saveButton = (page: Page): Locator => footer(page).getByRole('button', { name: 'Save' });
const conflicts = (page: Page): Locator => page.getByRole('list', { name: 'Conflicts' }).getByRole('listitem');
const notice = (page: Page): Locator => page.locator('.rop-pro-rebase-notice');
const textbox = (page: Page, name: string): Locator => page.getByRole('textbox', { name, exact: true });
const simulate = (page: Page): Locator => page.getByRole('button', { name: 'Simulate server update' });
const archivedStrip = (page: Page): Locator => page.locator('[tabindex="-1"]', { hasText: ARCHIVED_TITLE });

/** Opens a customer from the list, records every call to the store's `save`; returns the stored customer. */
async function openCustomer(page: Page, args = FAST, customer = CUSTOMER): Promise<Stored> {
  await page.goto(url(args));
  await page.getByRole('link', { name: customer.code }).click();
  await expect(page.getByRole('heading', { level: 1, name: customer.code })).toBeVisible();
  await page.evaluate(() => {
    const w = window as unknown as ShowcaseWindow;
    const store = w.__ropShowcaseStore!;
    const original = store.save.bind(store);
    w.__ropSaves = [];
    store.save = (c) => {
      w.__ropSaves!.push(c);
      return original(c);
    };
  });
  return (await stored(page, customer.id))!;
}

const stored = (page: Page, id = CUSTOMER.id): Promise<Stored | undefined> =>
  page.evaluate((i) => (window as unknown as ShowcaseWindow).__ropShowcaseStore?.snapshot().find((c) => c.id === i), id);
const saves = (page: Page): Promise<Stored[]> => page.evaluate(() => (window as unknown as ShowcaseWindow).__ropSaves ?? []);

/** Another user changes the customer on the server in a way the Control does not offer (an absent value). */
const serverSets = (page: Page, change: 'no-account-manager' | 'no-line-2', id = CUSTOMER.id): Promise<void> =>
  page.evaluate(
    ([cid, kind]) => {
      void (window as unknown as ShowcaseWindow).__ropShowcaseStore!.updateFromServer(cid, (c) => {
        if (kind === 'no-account-manager') return { ...c, accountManagerId: null };
        const address: Partial<Stored['billingAddress']> = { ...c.billingAddress };
        delete address.line2;
        return { ...c, billingAddress: address as Stored['billingAddress'] };
      });
    },
    [id, change] as const,
  );

/** The text of each item of a list as read by assistive technology (the arrow is `aria-hidden`). */
const itemsOf = (list: Locator): Promise<string[]> =>
  list.getByRole('listitem').evaluateAll((items) =>
    items.map((item) => {
      const copy = item.cloneNode(true) as Element;
      for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
      return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
    }),
  );
const changes = (page: Page): Promise<string[]> => itemsOf(reviewDialog(page).getByRole('list', { name: 'Changes to save' }));

async function choose(page: Page, field: string, option: string): Promise<void> {
  await page.getByRole('combobox', { name: field }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

test.describe('Pro/Showcase/Record editing integrity, customers: the stories play', () => {
  for (const id of [...PLAYS, ...VISUALS]) {
    test(`${id}: the play function passes`, async ({ page }) => {
      await expectPlayToPass(page, `${PREFIX}${id}`);
    });
  }
  for (const id of ['customer-review-changes', 'customer-review-contacts', 'customer-server-update']) {
    test(`${id}: the play function also passes with a failing save`, async ({ page }) => {
      await expectPlayToPass(page, `${PREFIX}${id}`, 'saveOutcome:error');
    });
  }
  for (const id of VISUALS) {
    test(`${id}: the reduced-motion preference leads to the same end state`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expectPlayToPass(page, `${PREFIX}${id}`);
    });
  }
});

test.describe('Pro/Showcase/Record editing integrity: the review of a customer', () => {
  test('Postal code and a contact\'s e-mail + Save: two entries with readable labels; nothing saved yet', async ({ page }) => {
    const customer = await openCustomer(page);
    await textbox(page, 'Postal code').fill('40121');
    await textbox(page, 'Contact 2 e-mail').fill('g.bellini@borgavella-tooling.example');
    await saveButton(page).click();
    await expect(reviewDialog(page)).toHaveAccessibleDescription('2 changes will be saved.');
    expect(await changes(page)).toEqual([
      'Billing address > Postal code, changed, from 40139 to 40121',
      `Contacts > Contact 2 (Giulia Bellini) > E-mail, changed, from ${customer.contacts[1]!.email} to g.bellini@borgavella-tooling.example`,
    ]);
    await expect(reviewDialog(page)).not.toContainText(/Item \d|billingAddress|contacts\./);
    expect(await saves(page)).toHaveLength(0);
    expect(await stored(page)).toEqual(customer);
  });

  test('"Save changes" (double click): ONE save with the values, the footer goes, the store holds them', async ({ page }) => {
    await openCustomer(page, 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:1000');
    await textbox(page, 'City').fill('Modena');
    await saveButton(page).click();
    await reviewDialog(page).getByRole('button', { name: 'Save changes' }).dblclick();
    await expect(reviewDialog(page)).toHaveCount(0);
    await expect(saveButton(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(footer(page)).toBeHidden({ timeout: 10_000 });
    const sent = await saves(page);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.billingAddress.city).toBe('Modena');
  });

  test('the account manager by name, the status and payment terms by label, the credit limit in euros; never an id', async ({ page }) => {
    await openCustomer(page);
    const manager = page.getByRole('combobox', { name: 'Account manager' });
    const saved = await manager.inputValue();
    await manager.click();
    const option = page.getByRole('option').filter({ hasNotText: saved }).first();
    const other = ((await option.textContent()) ?? '').trim();
    await option.click();
    await choose(page, 'Status', 'On hold');
    await textbox(page, 'Credit limit (EUR)').fill('120000');
    await saveButton(page).click();
    expect(await changes(page)).toEqual([
      'Status, changed, from Active to On hold',
      'Credit limit, changed, from €100,000.00 to €120,000.00',
      `Account manager, changed, from ${saved} to ${other}`,
    ]);
    await expect(reviewDialog(page)).not.toContainText(/emp-\d/);
  });

  test('a yen customer: the credit limit in yen', async ({ page }) => {
    await openCustomer(page, FAST, YEN);
    await textbox(page, 'Credit limit (JPY)').fill('5000000');
    await saveButton(page).click();
    expect(await changes(page)).toEqual(['Credit limit, changed, from ¥4,100,000 to ¥5,000,000']);
  });

  test('contacts: added, removed and edited are three distinct entries, each named by the contact', async ({ page }) => {
    const customer = await openCustomer(page, FAST, FOUR_CONTACTS);
    const [, second, third] = customer.contacts;
    await textbox(page, 'Contact 3 role').fill('Lead Site Engineer');
    await page.getByRole('button', { name: 'Remove contact 2' }).click();
    await page.getByRole('button', { name: 'Add contact' }).click();
    await textbox(page, 'Contact 4 name').fill('Ilse Visser');
    await textbox(page, 'Contact 4 e-mail').fill('ilse.visser@company.example');
    await saveButton(page).click();
    expect(await changes(page)).toEqual([
      `Contacts > Contact 2 (${third!.name}) > Role, changed, from ${third!.role} to Lead Site Engineer`,
      'Contacts > Contact 4 (Ilse Visser), added, Ilse Visser, ilse.visser@company.example',
      expect.stringMatching(new RegExp(`^Contacts > Contact 2 \\(${second!.name}\\), removed, ${second!.name} \\(${second!.role}\\), ${second!.email.replace(/\./g, '\\.')}`)),
    ]);
    await reviewDialog(page).getByRole('button', { name: 'Save changes' }).click();
    await expect(footer(page)).toBeHidden();
    expect((await stored(page, FOUR_CONTACTS.id))!.contacts.map((c) => c.id)).toEqual(['cus-34-con-1', 'cus-34-con-3', 'cus-34-con-4', 'new-contact-1']);
  });

  test('"Street, line 2" filled: from Empty to the text; after the save, cleared: from the text to Empty', async ({ page }) => {
    await openCustomer(page);
    await textbox(page, 'Street, line 2').fill('Building B');
    await saveButton(page).click();
    expect(await changes(page)).toEqual(['Billing address > Street, line 2, changed, from Empty to Building B']);
    await reviewDialog(page).getByRole('button', { name: 'Save changes' }).click();
    await expect(footer(page)).toBeHidden();
    expect((await stored(page))!.billingAddress.line2).toBe('Building B');
    await textbox(page, 'Street, line 2').fill('');
    await saveButton(page).click();
    expect(await changes(page)).toEqual(['Billing address > Street, line 2, changed, from Building B to Empty']);
    await reviewDialog(page).getByRole('button', { name: 'Save changes' }).click();
    await expect(footer(page)).toBeHidden();
    expect((await stored(page))!.billingAddress.line2).toBeNull();
  });

  test('"Keep editing" and Escape: nothing saved, the values stay, the focus back on Save', async ({ page }) => {
    await openCustomer(page);
    await textbox(page, 'City').fill('Modena');
    for (const close of ['Keep editing', 'Escape'] as const) {
      await saveButton(page).click();
      await expect(reviewDialog(page)).toBeVisible();
      if (close === 'Escape') await page.keyboard.press('Escape');
      else await reviewDialog(page).getByRole('button', { name: 'Keep editing' }).click();
      await expect(reviewDialog(page)).toHaveCount(0);
      await expect(saveButton(page)).toBeFocused();
      await expect(textbox(page, 'City')).toHaveValue('Modena');
    }
    expect(await saves(page)).toHaveLength(0);
  });

  test('no a11y violations with the review open; no horizontal overflow on mobile', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await openCustomer(page, FAST, FOUR_CONTACTS);
    await textbox(page, 'Postal code').fill('28226');
    await page.getByRole('button', { name: 'Remove contact 2' }).click();
    await saveButton(page).click();
    await expect(reviewDialog(page)).toBeVisible();
    await expectNoA11yViolations(page);
    await expectNoHorizontalOverflow(reviewDialog(page));
  });

  test('the Free showcase is unchanged: Save saves at once, no review, no server update', async ({ page }) => {
    await page.goto(`/iframe.html?id=showcase-record-editing--customer-list-to-record-manual&viewMode=story&args=${encodeURIComponent('listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:0')}&module=customers`);
    await page.getByRole('link', { name: CUSTOMER.code }).click();
    await textbox(page, 'City').fill('Modena');
    await saveButton(page).click();
    await expect(footer(page)).toBeHidden();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(simulate(page)).toHaveCount(0);
  });
});

test.describe('Pro/Showcase/Record editing integrity: server updates on a customer', () => {
  test('editor without edits: the account manager changes, the form stays clean, "Account manager was updated", no conflict', async ({ page }) => {
    await openCustomer(page);
    const before = await page.getByRole('combobox', { name: 'Account manager' }).inputValue();
    await simulate(page).click();
    await expect(notice(page)).toContainText('This customer was updated while you were editing.Account manager was updated.');
    await expect(page.getByRole('combobox', { name: 'Account manager' })).not.toHaveValue(before);
    await expect(footer(page)).toBeHidden();
    await expect(conflicts(page)).toHaveCount(0);
  });

  test('typing in the address while the account manager changes: the manager from the server, the address mine, focus and every keystroke kept', async ({ page }) => {
    await openCustomer(page, 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:0;serverUpdateDelayMs:400');
    const street = textbox(page, 'Street');
    const before = await page.getByRole('combobox', { name: 'Account manager' }).inputValue();
    await street.fill('');
    await simulate(page).click();
    await street.pressSequentially('Via del Lavoro 3', { delay: 40 });
    await expect(notice(page)).toBeVisible();
    await expect(street).toBeFocused();
    await expect(street).toHaveValue('Via del Lavoro 3');
    await expect(page.getByRole('combobox', { name: 'Account manager' })).not.toHaveValue(before);
    await expect(conflicts(page)).toHaveCount(0);
    await saveButton(page).click();
    expect(await changes(page)).toEqual(["Billing address > Street, changed, from Via dell'Industria 21 to Via del Lavoro 3"]);
  });

  test('the primary contact\'s e-mail changed by both: a conflict with both e-mails; "Keep mine" keeps mine, the focus on the field', async ({ page }) => {
    const customer = await openCustomer(page, `${FAST};serverChange:primary-contact-email`);
    const email = textbox(page, 'Contact 1 e-mail');
    await email.fill('matteo@borgavella-tooling.example');
    await simulate(page).click();
    await expect(conflicts(page)).toHaveCount(1);
    await expect(conflicts(page).first()).toContainText('Contacts > Contact 1 (Matteo Gatti) > E-mail');
    await expect(conflicts(page).first()).toContainText('Yours: matteo@borgavella-tooling.example');
    await expect(conflicts(page).first()).toContainText(`Server: orders.${customer.contacts[0]!.email}`);
    await expect(email).toHaveAccessibleDescription('Changed on the server too.');
    await page.getByRole('button', { name: 'Keep mine for Contacts > Contact 1 (Matteo Gatti) > E-mail' }).click();
    await expect(conflicts(page)).toHaveCount(0);
    await expect(email).toHaveValue('matteo@borgavella-tooling.example');
    await expect(email).toBeFocused();
    await expect(footer(page)).toBeVisible();
  });

  test('the server removes the contact I edit: kept with my value, a conflict explained on its fields; "Use server value" removes it, the focus on the previous contact', async ({ page }) => {
    await openCustomer(page, `${FAST};serverChange:remove-contact`);
    await textbox(page, 'Contact 2 e-mail').fill('giulia@borgavella-tooling.example');
    await simulate(page).click();
    await expect(conflicts(page)).toHaveCount(1);
    await expect(conflicts(page).first()).toContainText('Contacts > Contact 2 (Giulia Bellini)');
    await expect(conflicts(page).first()).toContainText('giulia@borgavella-tooling.example');
    await expect(conflicts(page).first()).toContainText('Server: Removed');
    await expect(textbox(page, 'Contact 2 e-mail')).toHaveAccessibleDescription('Removed on the server.');
    await expect(textbox(page, 'Contact 2 name')).toHaveAccessibleDescription('Removed on the server.');
    await conflicts(page).first().getByRole('button', { name: /^Use server value for Contacts > Contact 2/ }).click();
    await expect(page.getByRole('textbox', { name: /^Contact \d e-mail$/ })).toHaveCount(1);
    await expect(textbox(page, 'Contact 1 name')).toBeFocused();
    await expect(footer(page)).toBeHidden();
  });

  test('the server moves a contact while I type in another one: every keystroke kept on the same contact, now at another position, no conflict', async ({ page }) => {
    const customer = await openCustomer(page, 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:0;serverUpdateDelayMs:400;serverChange:move-contact', FOUR_CONTACTS);
    const second = customer.contacts[1]!;
    const role = textbox(page, 'Contact 2 role');
    await role.fill('');
    await simulate(page).click();
    await role.pressSequentially('Senior Buyer', { delay: 40 });
    // The contact moved down one card: its Fields are now "Contact 3 …".
    await expect(textbox(page, 'Contact 3 name')).toHaveValue(second.name);
    await expect(textbox(page, 'Contact 3 role')).toHaveValue('Senior Buyer');
    await expect(textbox(page, 'Contact 3 role')).toBeFocused();
    await expect(conflicts(page)).toHaveCount(0);
    await saveButton(page).click();
    expect(await changes(page)).toEqual([`Contacts > Contact 3 (${second.name}) > Role, changed, from ${second.role} to Senior Buyer`]);
  });

  test('the account manager set to null by the server: the field empty, the form clean; my change of it afterwards reads "from Null"', async ({ page }) => {
    await openCustomer(page);
    await serverSets(page, 'no-account-manager');
    await expect(notice(page)).toContainText('Account manager was updated.');
    await expect(page.getByRole('combobox', { name: 'Account manager' })).toHaveValue('');
    await expect(footer(page)).toBeHidden();
    await page.getByRole('combobox', { name: 'Account manager' }).click();
    const option = page.getByRole('option').first();
    const name = ((await option.textContent()) ?? '').trim();
    await option.click();
    await saveButton(page).click();
    expect(await changes(page)).toEqual([`Account manager, changed, from Null to ${name}`]);
  });

  test('"Street, line 2" sent without its key by the server: the same empty field, no notice, the form clean', async ({ page }) => {
    await openCustomer(page);
    await serverSets(page, 'no-line-2');
    await expect.poll(async () => Object.hasOwn((await stored(page))!.billingAddress, 'line2')).toBe(false);
    await expect(textbox(page, 'Street, line 2')).toHaveValue('');
    await expect(notice(page)).toHaveCount(0);
    await expect(footer(page)).toBeHidden();
  });

  test('no a11y violations with the notice and a conflict', async ({ page }) => {
    await openCustomer(page, `${FAST};serverChange:primary-contact-email`);
    await textbox(page, 'Contact 1 e-mail').fill('matteo@borgavella-tooling.example');
    await simulate(page).click();
    await expect(conflicts(page)).toHaveCount(1);
    await expectNoA11yViolations(page);
  });
});

test.describe('Pro/Showcase/Record editing integrity: a customer archived on the server while open', () => {
  /** City and a contact's role edited, the archiving sent with a delay, the focus back in the role field. */
  async function archivedWhileInAField(page: Page): Promise<Stored> {
    const customer = await openCustomer(page, 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:0;serverUpdateDelayMs:500;serverChange:archive');
    await textbox(page, 'City').fill('Modena');
    await textbox(page, 'Contact 2 role').fill('Senior Buyer');
    await simulate(page).click();
    await textbox(page, 'Contact 2 role').focus();
    await expect(archivedStrip(page)).toBeVisible();
    return customer;
  }

  test('the fields become disabled, the focus goes to the message, Tab never reaches a field, typing changes nothing; my changes stay in the fields', async ({ page }) => {
    await archivedWhileInAField(page);
    await expect(archivedStrip(page)).toBeFocused();
    await expect(textbox(page, 'City')).toBeDisabled();
    await expect(textbox(page, 'City')).toHaveValue('Modena');
    await expect(textbox(page, 'Contact 2 role')).toHaveValue('Senior Buyer');
    await expect(page.getByRole('combobox', { name: 'Account manager' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Add contact' })).toHaveCount(0);
    await page.keyboard.type('xyz');
    await expect(textbox(page, 'Contact 2 role')).toHaveValue('Senior Buyer');
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab');
      const onField = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return !!el && !!el.closest('[data-object-page-scroller]') && el.matches('input, [role="combobox"]');
      });
      expect(onField, `Tab ${i + 1}`).toBe(false);
    }
  });

  test('my changes are listed in the message as text that can be selected (copied)', async ({ page }) => {
    await archivedWhileInAField(page);
    const list = archivedStrip(page).getByRole('list', { name: 'Your unsaved changes' });
    expect(await itemsOf(list)).toEqual([
      'Billing address > City, changed, from Bologna to Modena',
      'Contacts > Contact 2 (Giulia Bellini) > Role, changed, from Buyer to Senior Buyer',
    ]);
    // Selected as a user would select it (a selection over the whole list): text, not `user-select: none`.
    const selected = await list.evaluate((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      return selection.toString();
    });
    expect(selected).toContain('Modena');
    expect(selected).toContain('Senior Buyer');
    expect(await list.evaluate((node) => getComputedStyle(node).userSelect)).not.toBe('none');
  });

  test('Save: the review says it can no longer be saved, the server refuses, nothing is written', async ({ page }) => {
    const customer = await archivedWhileInAField(page);
    await saveButton(page).click();
    await expect(reviewDialog(page)).toHaveAccessibleDescription('This customer was archived on the server: these changes can no longer be saved.');
    await reviewDialog(page).getByRole('button', { name: 'Save changes' }).click();
    await expect(footer(page)).toContainText('Could not save the customer: it was archived on the server.');
    expect(await stored(page)).toEqual({ ...customer, status: 'archived' });
    await expect(textbox(page, 'City')).toHaveValue('Modena');
  });

  test('Restore: active again, the fields enabled, the message gone', async ({ page }) => {
    const customer = await archivedWhileInAField(page);
    await page.getByRole('button', { name: 'Restore' }).click();
    await expect(textbox(page, 'City')).toBeEnabled();
    await expect(archivedStrip(page)).toHaveCount(0);
    expect(await stored(page)).toEqual(customer);
  });

  test('no a11y violations with the message and the disabled fields', async ({ page }) => {
    await archivedWhileInAField(page);
    await expectNoA11yViolations(page);
  });

  test('on mobile the message does not overflow sideways', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await archivedWhileInAField(page);
    await expectNoHorizontalOverflow(archivedStrip(page));
  });

  test('archived by my own Save, then "Simulate server update": the update applies, no "archived on the server" message', async ({ page }) => {
    await openCustomer(page, `${FAST};serverChange:account-manager`);
    await choose(page, 'Status', 'Archived');
    await saveButton(page).click();
    await reviewDialog(page).getByRole('button', { name: 'Save changes' }).click();
    await expect(textbox(page, 'City')).toBeDisabled();
    await expect.poll(async () => (await stored(page))?.status).toBe('archived');
    await simulate(page).click();
    await expect(notice(page)).toContainText('Account manager was updated.');
    await expect(page.getByText(ARCHIVED_TITLE)).toHaveCount(0);
  });

  test('a conflict open when the archiving lands, the focus on "Keep mine": the choices are gone, the focus goes to the message (never <body>), my e-mail stays and is listed', async ({ page }) => {
    const customer = await openCustomer(page, `${FAST};serverChange:primary-contact-email`);
    const email = textbox(page, 'Contact 1 e-mail');
    await email.fill('matteo@borgavella-tooling.example');
    await simulate(page).click();
    await expect(conflicts(page)).toHaveCount(1);
    await page.getByRole('button', { name: 'Keep mine for Contacts > Contact 1 (Matteo Gatti) > E-mail' }).focus();
    await page.evaluate((id) => {
      void (window as unknown as ShowcaseWindow).__ropShowcaseStore!.updateFromServer(id, (c) => ({ ...c, status: 'archived' }));
    }, customer.id);
    await expect(archivedStrip(page)).toBeFocused();
    await expect(page.getByRole('list', { name: 'Conflicts' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^(Use server value|Keep mine|Use all server values)/ })).toHaveCount(0);
    await expect(email).toBeDisabled();
    await expect(email).toHaveValue('matteo@borgavella-tooling.example');
    expect(await itemsOf(archivedStrip(page).getByRole('list', { name: 'Your unsaved changes' }))).toEqual([
      `Contacts > Contact 1 (Matteo Gatti) > E-mail, changed, from orders.${customer.contacts[0]!.email} to matteo@borgavella-tooling.example`,
    ]);
  });
});
