// #524: "Review changes" on a customer, on the record page of the shell with the Pro add-ons: what the dialog lists
// (nested paths, contacts by name, the account manager by name, the credit limit in its currency), against which
// saved customer, and what Save, "Save changes" and "Keep editing" do.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { accountManagerOptions } from '../../../core/src/showcase/modules/customers/customers-module';
import {
  ARCHIVED,
  CUSTOMER,
  FOUR_CONTACTS,
  YEN,
  changesIn,
  clean,
  combobox,
  footer,
  gate,
  integrityStore,
  opened,
  pick,
  renderCustomer,
  retype,
  reviewDialog,
  saveButton,
  setupIntegrityTests,
  stored,
  textbox,
} from './customer-integrity.test-kit';

setupIntegrityTests();

describe('Record editing integrity, customers: the review (#524)', () => {
  it('Postal code and a contact\'s e-mail + Save: "Review changes" lists exactly those two, with readable labels; nothing saved yet; "Keep editing" keeps everything', async () => {
    const { store, onSaved } = renderCustomer();
    await opened();
    const before = JSON.stringify(store.snapshot());
    await retype(textbox('Postal code'), '40121');
    await retype(textbox('Contact 2 e-mail'), 'g.bellini@borgavella-tooling.example');
    await userEvent.click(await saveButton());

    const dialog = await reviewDialog();
    expect(dialog).toHaveAccessibleDescription('2 changes will be saved.');
    expect(changesIn(dialog)).toEqual([
      'Billing address > Postal code, changed, from 40139 to 40121',
      'Contacts > Contact 2 (Giulia Bellini) > E-mail, changed, from giulia.bellini@borgavella-tooling.example to g.bellini@borgavella-tooling.example',
    ]);
    expect(dialog).not.toHaveTextContent(/Item \d|billingAddress|contacts\./);
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Keep editing' })).toHaveFocus());
    expect(JSON.stringify(store.snapshot())).toBe(before);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(textbox('Postal code').value).toBe('40121');
    expect(footer()).not.toBeNull();
    expect(JSON.stringify(store.snapshot())).toBe(before);
    expect(onSaved).not.toHaveBeenCalled();
  }, 30_000);

  it('the account manager by name (never its id), the status and payment terms by label, the credit limit in euros', async () => {
    renderCustomer();
    await opened();
    const saved = accountManagerOptions().find((o) => o.value === 'emp-375')!;
    const other = accountManagerOptions().find((o) => o.value !== 'emp-375')!;
    await pick(combobox('Account manager'), other.label);
    await pick(combobox('Status'), 'On hold');
    await pick(combobox('Payment terms'), 'Net 60 days');
    await retype(textbox(/^Credit limit/), '120000');
    await userEvent.click(await saveButton());
    const dialog = await reviewDialog();
    expect(changesIn(dialog)).toEqual([
      'Status, changed, from Active to On hold',
      'Payment terms, changed, from Net 30 days to Net 60 days',
      'Credit limit, changed, from €100,000.00 to €120,000.00',
      `Account manager, changed, from ${saved.label} to ${other.label}`,
    ]);
    expect(dialog).not.toHaveTextContent(/emp-\d/);
  }, 30_000);

  it('a yen customer: the credit limit in yen, no decimals', async () => {
    renderCustomer(YEN);
    await opened();
    await retype(textbox(/^Credit limit/), '5000000');
    await userEvent.click(await saveButton());
    expect(changesIn(await reviewDialog())).toEqual(['Credit limit, changed, from ¥4,100,000 to ¥5,000,000']);
  }, 30_000);

  it('the diff is against the customer SAVED on the server, not the one opened: save, edit again, the review lists only the second edit', async () => {
    const { store, onSaved } = renderCustomer();
    await opened();
    await retype(textbox('City'), 'Modena');
    await userEvent.click(await saveButton());
    await userEvent.click(within(await reviewDialog()).getByRole('button', { name: 'Save changes' }));
    await clean();
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(stored(store, CUSTOMER).billingAddress.city).toBe('Modena');

    await retype(textbox('Street, line 2'), 'Building B');
    await userEvent.click(await saveButton());
    const dialog = await reviewDialog();
    expect(dialog).toHaveAccessibleDescription('1 change will be saved.');
    expect(changesIn(dialog)).toEqual(['Billing address > Street, line 2, changed, from Empty to Building B']);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await clean();
    expect(stored(store, CUSTOMER).billingAddress).toMatchObject({ city: 'Modena', line2: 'Building B' });
  }, 30_000);

  it('contacts: one added, one removed, one edited: three entries named by the contacts, then saved with their ids', async () => {
    const { store } = renderCustomer(FOUR_CONTACTS);
    await opened();
    const names = stored(store, FOUR_CONTACTS).contacts.map((c) => c.name);
    await retype(textbox('Contact 3 role'), 'Lead Site Engineer');
    await userEvent.click(screen.getByRole('button', { name: 'Remove contact 2' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add contact' }));
    await userEvent.type(textbox('Contact 4 name'), 'Ilse Visser');
    await userEvent.type(textbox('Contact 4 e-mail'), 'ilse.visser@company.example');
    await userEvent.click(await saveButton());

    const dialog = await reviewDialog();
    expect(dialog).toHaveAccessibleDescription('3 changes will be saved.');
    expect(changesIn(dialog)).toEqual([
      `Contacts > Contact 2 (${names[2]}) > Role, changed, from Site Engineer to Lead Site Engineer`,
      'Contacts > Contact 4 (Ilse Visser), added, Ilse Visser, ilse.visser@company.example',
      `Contacts > Contact 2 (${names[1]}), removed, ${names[1]} (Buyer), raquel.navarro@glenquarry-construction.example, +1 704-555-0180`,
    ]);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await clean();
    expect(stored(store, FOUR_CONTACTS).contacts.map((c) => c.id)).toEqual(['cus-34-con-1', 'cus-34-con-3', 'cus-34-con-4', 'new-contact-1']);
  }, 30_000);

  it('the primary contact changed: by the contacts\' names', async () => {
    renderCustomer();
    await opened();
    await pick(combobox('Primary contact'), 'Giulia Bellini');
    await userEvent.click(await saveButton());
    expect(changesIn(await reviewDialog())).toEqual(['Primary contact, changed, from Matteo Gatti to Giulia Bellini']);
  }, 30_000);

  it('edited and restored by hand: clean, no footer, so nothing to review', async () => {
    renderCustomer();
    await opened();
    await retype(textbox('City'), 'Modena');
    await saveButton();
    await retype(textbox('City'), 'Bologna');
    await clean();
  }, 30_000);

  it('an invalid form: Save opens no review; the errors as without it', async () => {
    const { store } = renderCustomer();
    await opened();
    const before = JSON.stringify(store.snapshot());
    await retype(textbox('Postal code'), '4012');
    await userEvent.click(await saveButton());
    await waitFor(() => expect(within(footer()!).getByText('1 invalid field')).toBeInTheDocument());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(JSON.stringify(store.snapshot())).toBe(before);
  }, 30_000);

  it('a failing save: the error in the footer, the form still edited, a new Save reviews the same change', async () => {
    renderCustomer(CUSTOMER, { store: integrityStore({ saveOutcome: 'error' }) });
    await opened();
    await retype(textbox('City'), 'Modena');
    await userEvent.click(await saveButton());
    await userEvent.click(within(await reviewDialog()).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(footer()).toHaveTextContent('Could not save the customer: network error'));
    expect(textbox('City').value).toBe('Modena');
    await userEvent.click(await saveButton());
    expect(changesIn(await reviewDialog())).toEqual(['Billing address > City, changed, from Bologna to Modena']);
  }, 30_000);

  it('Save while a save is in flight: no second review, no second save', async () => {
    const held = gate();
    const { onSaved } = renderCustomer(CUSTOMER, { store: integrityStore({ saveDelayMs: held.promise }) });
    await opened();
    await retype(textbox('City'), 'Modena');
    const save = await saveButton();
    await userEvent.click(save);
    await userEvent.click(within(await reviewDialog()).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(save).toHaveAttribute('aria-disabled', 'true'));
    await userEvent.click(save);
    expect(screen.queryByRole('dialog')).toBeNull();
    held.release();
    await clean();
    expect(onSaved).toHaveBeenCalledTimes(1);
  }, 30_000);

  it('a customer archived when opened: the Free read-only page, no "archived on the server" message', async () => {
    renderCustomer(ARCHIVED);
    await screen.findByRole('heading', { level: 1, name: 'C-10011' });
    expect(textbox('Name')).toBeDisabled();
    expect(screen.getByText('Archived customer')).toBeInTheDocument();
    expect(screen.queryByText('This customer was archived on the server')).toBeNull();
    expect(footer()).toBeNull();
  }, 30_000);
});
