// #524: "Simulate server update" on a customer (Form Rebase): what the server changes lands in the fields the user did
// not touch (the nested address part by part, the contacts by id), a field both changed is a conflict with "Keep
// mine" / "Use server value", a contact the server removed while edited is a conflict explained on its fields, and
// nothing the server does is ever taken for a gesture of the user (no dirty form, no entry in the review).
import { act } from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { StoredCustomer } from '../../../core/src/showcase/customer-store';
import { ARCHIVED_REASON, accountManagerOptions } from '../../../core/src/showcase/modules/customers/customers-module';
import {
  ARCHIVED_REVIEW_DESCRIPTION,
  ARCHIVED_SAVED_TEXT,
  ARCHIVED_SAVE_ERROR,
  ARCHIVED_TEXT,
  ARCHIVED_TITLE,
  CONFLICT_HELP,
  NOTICE_TITLE,
  REMOVED_HELP,
  UNSAVED_LIST_LABEL,
  nextAccountManager,
  serverChangeOf,
  serverEmail,
  type CustomerServerChangeKind,
} from './customer-rebase';
import {
  CUSTOMER,
  FOUR_CONTACTS,
  WITH_LINE_2,
  changesIn,
  clean,
  combobox,
  conflictTexts,
  descriptions,
  footer,
  gate,
  integrityStore,
  notice,
  opened,
  pick,
  readItems,
  renderCustomer,
  retype,
  reviewDialog,
  saveButton,
  serverUpdate,
  setupIntegrityTests,
  stored,
  textbox,
  withoutKey,
} from './customer-integrity.test-kit';

setupIntegrityTests();

const SEED = integrityStore().snapshot();
const seed = (id = CUSTOMER): StoredCustomer => SEED.find((c) => c.id === id)!;
const managerName = (id: string) => accountManagerOptions().find((o) => o.value === id)!.label;
const archivedStrip = () => screen.queryByText(ARCHIVED_TITLE)?.closest<HTMLElement>('[tabindex="-1"]') ?? null;
/** Every control of the customer's sections (textboxes and Selects/Combobox), as a user reaches them. */
const controls = () => [...screen.getAllByRole('textbox'), ...screen.getAllByRole('combobox')];

describe('Record editing integrity, customers: no echo of a server update (#524)', () => {
  // One row per change the server makes, on an editor the user has not touched: the fields take the server's values
  // and the form stays clean (no save bar), because a server change is not a gesture of the user.
  it.each([
    ['account manager changed', 'account-manager'],
    ['put on hold', 'on-hold'],
    ['primary contact e-mail changed', 'primary-contact-email'],
    ['a contact removed', 'remove-contact'],
    ['a contact moved to the top', 'move-contact'],
    ['archived', 'archive'],
  ] as const satisfies readonly (readonly [string, CustomerServerChangeKind])[])('clean editor, the server: %s; the fields follow, the form stays clean', async (_, kind) => {
    const { store } = renderCustomer(FOUR_CONTACTS, { serverChange: kind });
    await opened();
    await userEvent.click(screen.getByRole('button', { name: 'Simulate server update' }));
    const after = await waitFor(() => {
      const s = stored(store, FOUR_CONTACTS);
      expect(JSON.stringify(s)).not.toBe(JSON.stringify(seed(FOUR_CONTACTS)));
      return s;
    });
    await waitFor(() => expect(screen.getAllByRole('textbox', { name: /^Contact \d+ e-mail$/ })).toHaveLength(after.contacts.length));
    expect(after.contacts.map((_, i) => textbox(`Contact ${i + 1} e-mail`).value)).toEqual(after.contacts.map((c) => c.email));
    expect(combobox('Account manager')).toHaveValue(managerName(after.accountManagerId));
    expect(combobox('Status')).toHaveTextContent({ active: 'Active', 'on-hold': 'On hold', archived: 'Archived' }[after.status]);
    expect(footer()).toBeNull();
    // A reorder alone is no entry of `applied` (the engine's contract, `RebaseResult.applied`): no notice for it.
    if (kind === 'move-contact') expect(notice()).toBeNull();
    else expect(notice()).toHaveTextContent(NOTICE_TITLE);
    expect(screen.queryByRole('list', { name: 'Conflicts' })).toBeNull();
  }, 30_000);

  it('after the update, an edit of the City: the review lists the City only, nothing of what the server changed', async () => {
    const { store } = renderCustomer();
    await opened();
    await serverUpdate(store, serverChangeOf('primary-contact-email'));
    await serverUpdate(store, serverChangeOf('account-manager'));
    await retype(textbox('City'), 'Modena');
    await userEvent.click(await saveButton());
    const dialog = await reviewDialog();
    expect(dialog).toHaveAccessibleDescription('1 change will be saved.');
    expect(changesIn(dialog)).toEqual(['Billing address > City, changed, from Bologna to Modena']);
  }, 30_000);

  it('the server announces the customer as it already is: nothing changes, no notice, the form stays clean', async () => {
    const { store } = renderCustomer();
    await opened();
    await serverUpdate(store, (c) => c);
    expect(footer()).toBeNull();
    expect(notice()).toBeNull();
  }, 30_000);

  it('"Street, line 2": the server sends the key missing instead of null: the same empty field, no notice, no change', async () => {
    const { store } = renderCustomer();
    await opened();
    await serverUpdate(store, (c) => ({ ...c, billingAddress: withoutKey(c.billingAddress, 'line2') as StoredCustomer['billingAddress'] }));
    expect(stored(store, CUSTOMER).billingAddress).not.toHaveProperty('line2');
    expect(textbox('Street, line 2').value).toBe('');
    expect(footer()).toBeNull();
    expect(notice()).toBeNull();
  }, 30_000);

  it('the account manager set to null by the server: the field empty, no echo (the form stays clean), "1 field was updated."', async () => {
    const { store } = renderCustomer();
    await opened();
    await serverUpdate(store, (c) => ({ ...c, accountManagerId: null as unknown as string }));
    expect(combobox('Account manager')).toHaveValue('');
    expect(footer()).toBeNull();
    expect(notice()).toHaveTextContent(`${NOTICE_TITLE}1 field was updated.`);
    // An edit afterwards: the review lists only it.
    await retype(textbox('City'), 'Modena');
    await userEvent.click(await saveButton());
    expect(changesIn(await reviewDialog())).toEqual(['Billing address > City, changed, from Bologna to Modena']);
  }, 30_000);
});

describe('Record editing integrity, customers: merging into an edited customer (#524)', () => {
  it('the address edited, the server changes the account manager: the manager arrives, the address stays mine, no conflict', async () => {
    const { store } = renderCustomer();
    await opened();
    await retype(textbox('Street'), 'Via del Lavoro 3');
    await retype(textbox('Postal code'), '40121');
    await serverUpdate(store, serverChangeOf('account-manager'));
    expect(combobox('Account manager')).toHaveValue(managerName(nextAccountManager(seed().accountManagerId)));
    expect(textbox('Street').value).toBe('Via del Lavoro 3');
    expect(textbox('Postal code').value).toBe('40121');
    expect(textbox('City').value).toBe(seed().billingAddress.city);
    expect(screen.queryByRole('list', { name: 'Conflicts' })).toBeNull();
    expect(notice()).toHaveTextContent('1 field was updated.');
    await userEvent.click(await saveButton());
    expect(changesIn(await reviewDialog())).toEqual([
      'Billing address > Street, changed, from Via dell\'Industria 21 to Via del Lavoro 3',
      'Billing address > Postal code, changed, from 40139 to 40121',
    ]);
  }, 30_000);

  it('the primary contact\'s e-mail changed by both: mine stays, a conflict with both e-mails, the Field explained; "Keep mine" closes it', async () => {
    const { store } = renderCustomer();
    await opened();
    const email = textbox('Contact 1 e-mail');
    await retype(email, 'matteo@borgavella-tooling.example');
    await serverUpdate(store, serverChangeOf('primary-contact-email'));
    const theirs = serverEmail(seed().contacts[0]!.email);
    expect(email.value).toBe('matteo@borgavella-tooling.example');
    expect(conflictTexts()).toEqual([`Contacts > Contact 1 (Matteo Gatti) > E-mail Yours: matteo@borgavella-tooling.example Server: ${theirs} Use server value Keep mine`]);
    expect(email).toHaveAccessibleDescription(CONFLICT_HELP);
    expect(email).toHaveAccessibleName('Contact 1 e-mail');
    await userEvent.click(screen.getByRole('button', { name: 'Keep mine for Contacts > Contact 1 (Matteo Gatti) > E-mail' }));
    expect(screen.queryByRole('list', { name: 'Conflicts' })).toBeNull();
    expect(email.value).toBe('matteo@borgavella-tooling.example');
    expect(email).not.toHaveAccessibleDescription(CONFLICT_HELP);
    expect(footer()).not.toBeNull();
  }, 30_000);

  it('"Use server value" on the only edit: the e-mail takes it and the form is clean again', async () => {
    const { store } = renderCustomer();
    await opened();
    await retype(textbox('Contact 1 e-mail'), 'matteo@borgavella-tooling.example');
    await serverUpdate(store, serverChangeOf('primary-contact-email'));
    await userEvent.click(screen.getByRole('button', { name: 'Use server value for Contacts > Contact 1 (Matteo Gatti) > E-mail' }));
    expect(textbox('Contact 1 e-mail').value).toBe(serverEmail(seed().contacts[0]!.email));
    await clean();
  }, 30_000);

  it('the account manager changed by both: a conflict by the managers\' names, never ids', async () => {
    const { store } = renderCustomer();
    await opened();
    const mine = accountManagerOptions().find((o) => o.value !== seed().accountManagerId && o.value !== nextAccountManager(seed().accountManagerId))!;
    await pick(combobox('Account manager'), mine.label);
    await serverUpdate(store, serverChangeOf('account-manager'));
    expect(conflictTexts()).toEqual([`Account manager Yours: ${mine.label} Server: ${managerName(nextAccountManager(seed().accountManagerId))} Use server value Keep mine`]);
    expect(combobox('Account manager')).toHaveAccessibleDescription(CONFLICT_HELP);
  }, 30_000);

  it('the account manager I changed, set to null by the server: a conflict, "Server: Null"; "Use server value" empties the field', async () => {
    const { store } = renderCustomer();
    await opened();
    const mine = accountManagerOptions().find((o) => o.value !== seed().accountManagerId)!;
    await pick(combobox('Account manager'), mine.label);
    await serverUpdate(store, (c) => ({ ...c, accountManagerId: null as unknown as string }));
    expect(conflictTexts()).toEqual([`Account manager Yours: ${mine.label} Server: Null Use server value Keep mine`]);
    await userEvent.click(screen.getByRole('button', { name: 'Use server value for Account manager' }));
    expect(combobox('Account manager')).toHaveValue('');
    await clean();
  }, 30_000);

  it('the server removes the contact I edited: the contact stays with my value, one conflict on it, its fields marked; "Use server value" removes it, the focus on the contact before', async () => {
    const { store } = renderCustomer();
    await opened();
    await retype(textbox('Contact 2 e-mail'), 'giulia@borgavella-tooling.example');
    await serverUpdate(store, serverChangeOf('remove-contact'));
    expect(conflictTexts()).toEqual([
      'Contacts > Contact 2 (Giulia Bellini) Yours: Giulia Bellini (Buyer), giulia@borgavella-tooling.example, +39 051 000 0267 Server: Removed Use server value Keep mine',
    ]);
    for (const field of ['name', 'role', 'e-mail', 'phone']) expect(textbox(`Contact 2 ${field}`)).toHaveAccessibleDescription(REMOVED_HELP);
    expect(textbox('Contact 1 e-mail')).not.toHaveAccessibleDescription(REMOVED_HELP);
    await userEvent.click(screen.getByRole('button', { name: 'Use server value for Contacts > Contact 2 (Giulia Bellini)' }));
    expect(screen.getAllByRole('textbox', { name: /^Contact \d+ e-mail$/ })).toHaveLength(1);
    await waitFor(() => expect(textbox('Contact 1 name')).toHaveFocus());
    await clean();
  }, 30_000);

  it('the server removes the contact I edited, "Keep mine": the contact is saved back (the review says it is added again)', async () => {
    const { store } = renderCustomer();
    await opened();
    await retype(textbox('Contact 2 role'), 'Senior Buyer');
    await serverUpdate(store, serverChangeOf('remove-contact'));
    await userEvent.click(screen.getByRole('button', { name: 'Keep mine for Contacts > Contact 2 (Giulia Bellini)' }));
    await userEvent.click(await saveButton());
    const dialog = await reviewDialog();
    expect(changesIn(dialog)).toEqual(['Contacts > Contact 2 (Giulia Bellini), added, Giulia Bellini (Senior Buyer), giulia.bellini@borgavella-tooling.example, +39 051 000 0267']);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await clean();
    expect(stored(store, CUSTOMER).contacts.map((c) => [c.id, c.role])).toEqual([
      ['cus-4-con-1', 'Operations Director'],
      ['cus-4-con-2', 'Senior Buyer'],
    ]);
  }, 30_000);

  it('a contact reordered by the server while I edit another: the server\'s order, my edit on the same contact (now Contact 3), no conflict', async () => {
    const { store } = renderCustomer(FOUR_CONTACTS);
    await opened();
    const second = seed(FOUR_CONTACTS).contacts[1]!;
    await retype(textbox('Contact 2 role'), 'Senior Buyer');
    await serverUpdate(store, serverChangeOf('move-contact'), FOUR_CONTACTS);
    expect(screen.queryByRole('list', { name: 'Conflicts' })).toBeNull();
    expect(textbox('Contact 3 name').value).toBe(second.name);
    expect(textbox('Contact 3 role').value).toBe('Senior Buyer');
    expect(textbox('Contact 1 name').value).toBe(seed(FOUR_CONTACTS).contacts[3]!.name);
    await userEvent.click(await saveButton());
    const dialog = await reviewDialog();
    expect(changesIn(dialog)).toEqual([`Contacts > Contact 3 (${second.name}) > Role, changed, from Buyer to Senior Buyer`]);
    // The server's reorder is in the saved customer already: not a change of mine.
    expect(dialog).not.toHaveTextContent('order of the contacts');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await clean();
    expect(stored(store, FOUR_CONTACTS).contacts.map((c) => c.id)).toEqual(['cus-34-con-4', 'cus-34-con-1', 'cus-34-con-2', 'cus-34-con-3']);
  }, 30_000);

  it('I make contact 2 the primary one, the server removes contact 2: never saved with a primary contact that is gone (the validation says so)', async () => {
    const { store } = renderCustomer();
    await opened();
    await pick(combobox('Primary contact'), 'Giulia Bellini');
    await serverUpdate(store, serverChangeOf('remove-contact'));
    const before = JSON.stringify(store.snapshot());
    await userEvent.click(await saveButton());
    await waitFor(() => expect(combobox('Primary contact')).toHaveAccessibleDescription(/Choose the primary contact/));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(JSON.stringify(store.snapshot())).toBe(before);
  }, 30_000);

  it('"Street, line 2" changed by me, cleared on the server: a conflict with "Server: Empty"', async () => {
    const { store } = renderCustomer(WITH_LINE_2);
    await opened();
    await retype(textbox('Street, line 2'), 'Gate 3');
    await serverUpdate(store, (c) => ({ ...c, billingAddress: { ...c.billingAddress, line2: null } }), WITH_LINE_2);
    expect(conflictTexts()).toEqual(['Billing address > Street, line 2 Yours: Gate 3 Server: Empty Use server value Keep mine']);
  }, 30_000);

  it('Save with an open conflict: the review names the server change it overwrites', async () => {
    const { store } = renderCustomer();
    await opened();
    await retype(textbox('Contact 1 e-mail'), 'matteo@borgavella-tooling.example');
    await serverUpdate(store, serverChangeOf('primary-contact-email'));
    await userEvent.click(await saveButton());
    const dialog = await reviewDialog();
    expect(readItems(within(dialog).getByRole('list', { name: 'Server changes you overwrite' }))).toEqual(['Contacts > Contact 1 (Matteo Gatti) > E-mail']);
    expect(dialog).toHaveAccessibleDescription('1 change will be saved.');
  }, 30_000);

  it('two updates in a row: the conflict of the first stays open after the second (#584)', async () => {
    const { store } = renderCustomer();
    await opened();
    await retype(textbox('Contact 1 e-mail'), 'matteo@borgavella-tooling.example');
    await serverUpdate(store, serverChangeOf('primary-contact-email'));
    await serverUpdate(store, serverChangeOf('on-hold'));
    expect(conflictTexts()).toHaveLength(1);
    expect(combobox('Status')).toHaveTextContent('On hold');
  }, 30_000);

  it('an update landing under the open review: the review follows the new saved customer', async () => {
    const { store } = renderCustomer();
    await opened();
    await retype(textbox('City'), 'Modena');
    await userEvent.click(await saveButton());
    const dialog = await reviewDialog();
    expect(dialog).toHaveAccessibleDescription('1 change will be saved.');
    await serverUpdate(store, (c) => ({ ...c, billingAddress: { ...c.billingAddress, city: 'Modena' } }));
    await waitFor(() => expect(dialog).toHaveAccessibleDescription('Nothing left to save.'));
    expect(within(dialog).queryByRole('list', { name: 'Changes to save' })).toBeNull();
  }, 30_000);

  it('the primary contact changed by both: each side named by its own contacts ("Yours" a contact only in my form)', async () => {
    const { store } = renderCustomer();
    await opened();
    await userEvent.click(screen.getByRole('button', { name: 'Add contact' }));
    await userEvent.type(textbox('Contact 3 name'), 'Ilse Visser');
    await userEvent.type(textbox('Contact 3 e-mail'), 'ilse.visser@company.example');
    await pick(combobox('Primary contact'), 'Ilse Visser');
    await serverUpdate(store, (c) => ({ ...c, contacts: c.contacts.map((p) => ({ ...p, primary: p.id === 'cus-4-con-2' })) }));
    expect(conflictTexts()).toEqual(['Primary contact Yours: Ilse Visser Server: Giulia Bellini Use server value Keep mine']);
    expect(screen.getByRole('list', { name: 'Conflicts' })).not.toHaveTextContent(/new-contact-|cus-4-con-/);
  }, 30_000);

  it('the currency changed to yen and the limit retyped for it ("100000" for "100000.00" euros), then a server update: what I typed stays', async () => {
    const { store } = renderCustomer();
    await opened();
    await pick(combobox('Currency'), 'JPY');
    const limit = textbox(/^Credit limit/);
    await retype(limit, '100000');
    await serverUpdate(store, serverChangeOf('account-manager'));
    expect(limit.value).toBe('100000');
    expect(combobox('Currency')).toHaveTextContent('JPY');
    expect(screen.queryByRole('list', { name: 'Conflicts' })).toBeNull();
    await userEvent.click(await saveButton());
    expect(changesIn(await reviewDialog())).toEqual(['Currency, changed, from EUR to JPY', 'Credit limit, changed, from €100,000.00 to ¥100,000']);
  }, 30_000);

  it('another customer changing on the server does not touch the open one', async () => {
    const { store } = renderCustomer();
    await opened();
    await serverUpdate(store, serverChangeOf('account-manager'), FOUR_CONTACTS);
    expect(combobox('Account manager')).toHaveValue(managerName(seed().accountManagerId));
    expect(notice()).toBeNull();
  }, 30_000);
});

describe('Record editing integrity, customers: archived on the server while open (#524)', () => {
  /** City and a contact's role edited, the focus in the role, then the server archives the customer. */
  async function archivedWhileEdited() {
    const setup = renderCustomer(CUSTOMER, { serverChange: 'archive' });
    await opened();
    await retype(textbox('City'), 'Modena');
    await retype(textbox('Contact 2 role'), 'Senior Buyer');
    expect(textbox('Contact 2 role')).toHaveFocus();
    await serverUpdate(setup.store, serverChangeOf('archive'));
    return setup;
  }

  it('every field becomes disabled (out of the Tab order) with the reason, my changes stay in the fields and are listed as text; the focus goes to the message', async () => {
    await archivedWhileEdited();
    const strip = archivedStrip();
    expect(strip).not.toBeNull();
    expect(strip).toHaveTextContent(ARCHIVED_TEXT);
    expect(readItems(within(strip!).getByRole('list', { name: UNSAVED_LIST_LABEL }))).toEqual([
      'Billing address > City, changed, from Bologna to Modena',
      'Contacts > Contact 2 (Giulia Bellini) > Role, changed, from Buyer to Senior Buyer',
    ]);
    await waitFor(() => expect(strip).toHaveFocus());
    for (const control of controls()) {
      expect(control).toBeDisabled();
      expect(descriptions(control).join(' ')).toContain(ARCHIVED_REASON);
    }
    expect(textbox('City').value).toBe('Modena');
    expect(textbox('Contact 2 role').value).toBe('Senior Buyer');
    expect(screen.queryByRole('button', { name: 'Add contact' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Remove contact/ })).toBeNull();
    // Typing reaches nothing: the disabled fields keep my values.
    await userEvent.keyboard('xyz');
    expect(textbox('Contact 2 role').value).toBe('Senior Buyer');
  }, 30_000);

  it('Save: the review says it can no longer be saved, the server refuses, the error in the footer, nothing lost', async () => {
    const { store } = await archivedWhileEdited();
    const before = JSON.stringify(store.snapshot());
    await userEvent.click(await saveButton());
    const dialog = await reviewDialog();
    expect(dialog).toHaveAccessibleDescription(ARCHIVED_REVIEW_DESCRIPTION);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(footer()).toHaveTextContent(ARCHIVED_SAVE_ERROR));
    expect(JSON.stringify(store.snapshot())).toBe(before);
    expect(textbox('City').value).toBe('Modena');
    expect(archivedStrip()).not.toBeNull();
  }, 30_000);

  it('the review open when the archiving lands: its description says it can no longer be saved', async () => {
    const { store } = renderCustomer();
    await opened();
    await retype(textbox('City'), 'Modena');
    await userEvent.click(await saveButton());
    const dialog = await reviewDialog();
    await serverUpdate(store, serverChangeOf('archive'));
    await waitFor(() => expect(dialog).toHaveAccessibleDescription(ARCHIVED_REVIEW_DESCRIPTION));
  }, 30_000);

  it('Restore: the customer is active again, the fields enabled, the message gone (the changes it listed are discarded, as it said)', async () => {
    const { store } = await archivedWhileEdited();
    await userEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(stored(store, CUSTOMER).status).toBe('active'));
    await waitFor(() => expect(textbox('City')).toBeEnabled());
    expect(archivedStrip()).toBeNull();
    expect(textbox('City').value).toBe(seed().billingAddress.city);
    expect(stored(store, CUSTOMER).billingAddress.city).toBe(seed().billingAddress.city);
    await clean();
  }, 30_000);

  it('archived on a clean form: the message says nothing was left unsaved, no list, no footer', async () => {
    const { store } = renderCustomer();
    await opened();
    await serverUpdate(store, serverChangeOf('archive'));
    const strip = archivedStrip();
    expect(strip).toHaveTextContent(ARCHIVED_SAVED_TEXT);
    expect(within(strip!).queryByRole('list')).toBeNull();
    expect(footer()).toBeNull();
  }, 30_000);

  it('the focus elsewhere (on a button) when the archiving lands: it stays there', async () => {
    const { store } = renderCustomer();
    await opened();
    await retype(textbox('City'), 'Modena');
    const simulate = screen.getByRole('button', { name: 'Simulate server update' });
    simulate.focus();
    await serverUpdate(store, serverChangeOf('archive'));
    expect(archivedStrip()).not.toBeNull();
    expect(simulate).toHaveFocus();
  }, 30_000);

  it('archived while my save is in flight: my save landed first, then the archiving; nothing unsaved', async () => {
    const held = gate();
    const store = integrityStore({ saveDelayMs: held.promise });
    renderCustomer(CUSTOMER, { store });
    await opened();
    await retype(textbox('City'), 'Modena');
    await userEvent.click(await saveButton());
    await userEvent.click(within(await reviewDialog()).getByRole('button', { name: 'Save changes' }));
    await serverUpdate(store, serverChangeOf('archive'));
    expect(notice()).toHaveTextContent('Applying server update after saving…');
    await act(async () => {
      held.release();
      await held.promise;
    });
    await waitFor(() => expect(archivedStrip()).toHaveTextContent(ARCHIVED_SAVED_TEXT));
    expect(stored(store, CUSTOMER)).toMatchObject({ status: 'archived', billingAddress: expect.objectContaining({ city: 'Modena' }) });
    expect(textbox('City')).toBeDisabled();
    await clean();
  }, 30_000);

  it('archived by my own Save (the Free flow): no "archived on the server" message', async () => {
    const onServerChange = vi.fn();
    const { store } = renderCustomer(CUSTOMER, { onServerChange });
    await opened();
    await pick(combobox('Status'), 'Archived');
    await userEvent.click(await saveButton());
    await userEvent.click(within(await reviewDialog()).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(stored(store, CUSTOMER).status).toBe('archived'));
    await waitFor(() => expect(textbox('City')).toBeDisabled());
    expect(archivedStrip()).toBeNull();
    expect(onServerChange).not.toHaveBeenCalled();
  }, 30_000);
});
