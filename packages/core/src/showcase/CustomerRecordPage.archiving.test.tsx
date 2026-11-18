import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { UseObjectPageFormReturn } from '../object-page/use-object-page-form';
import { createCustomerStore, makeShowcaseCustomers } from './customer-store';
import {
  ACTIVE,
  ARCHIVED,
  combobox,
  descriptions,
  footer,
  pick,
  ready,
  retype,
  save,
  setupCustomerTests,
  setupPage,
  stored,
  textbox,
  visibleBar,
} from './modules/customers/customer-test-kit';
import { toValues, type CustomerValues } from './modules/customers/customer-form';
import { ARCHIVED_REASON, ARCHIVING_REASON, CUSTOMERS } from './modules/customers/customers-module';

// #523 (red team, round 1): a save that ARCHIVES the customer. The fields lock on the saved status; edits typed while
// that save was in flight used to survive it, so an archived customer had a dirty draft that the footer's Save wrote
// (a name changed, or even the status put back to Active without Restore). Now the page is locked from the moment
// such a save starts until it settles: once it lands the draft is what was saved.
setupCustomerTests();

function gatedStore(outcome: 'success' | 'error' = 'success') {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const store = createCustomerStore(undefined, { saveDelayMs: gate, saveOutcome: outcome });
  return { store, release };
}

const headerOf = () => screen.getByRole('heading', { level: 1 }).parentElement!.parentElement!;
const discardButton = () => within(footer()!).getByRole('button', { name: 'Discard' });
const announced = (text: string) => screen.getAllByRole('status').some((s) => s.textContent === text);

/** Status "Archived", then Save: the save stays in flight until `release()`. */
async function startArchiving(outcome: 'success' | 'error' = 'success') {
  const { store, release } = gatedStore(outcome);
  const { onSaved } = setupPage(ACTIVE, store);
  await ready();
  const savedName = stored(store, ACTIVE).name;
  await pick(combobox('Status'), 'Archived');
  await save();
  return { store, release, onSaved, savedName };
}

describe('a save that archives the customer (#523)', () => {
  it('scenario a: typing in Name while it runs changes nothing; once saved, the archived customer has no draft to Save', async () => {
    const { store, release, onSaved, savedName } = await startArchiving();
    const name = textbox('Name');
    await userEvent.type(name, ' EDIT');
    // The edit never reaches the draft (it would survive the save on an archived customer).
    expect(name).toHaveValue(savedName);
    expect(name).toBeDisabled();
    expect(descriptions(name)).toContain(ARCHIVING_REASON);
    // Every control of the page, the code and the contacts included: nothing to add, nothing to remove.
    expect(textbox('Code')).toBeDisabled();
    expect(descriptions(textbox('Code'))).toContain(ARCHIVING_REASON);
    expect(textbox('City')).toBeDisabled();
    expect(textbox('Contact 1 e-mail')).toBeDisabled();
    expect(combobox('Account manager')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Add contact' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Remove contact/ })).toBeNull();
    // Said in the footer's status region, before it ends.
    expect(within(footer()!).getByRole('status')).toHaveTextContent(`Saving… ${ARCHIVING_REASON}`);

    release();
    await screen.findByRole('button', { name: 'Restore' });
    expect(stored(store, ACTIVE)).toMatchObject({ status: 'archived', name: savedName });
    expect(onSaved).toHaveBeenCalledTimes(1);
    // The draft is what was saved: clean, so no Save to press; the fields now say why they are disabled.
    await waitFor(() => expect(footer()).toBeNull());
    expect(textbox('Name')).toHaveValue(savedName);
    expect(textbox('Name')).toBeDisabled();
    expect(descriptions(textbox('Name'))).toContain(ARCHIVED_REASON);
    expect(within(headerOf()).getByText('Archived')).toBeInTheDocument();
    expect(announced(`Customer ${stored(store, ACTIVE).code} archived.`)).toBe(true);
  }, 30_000);

  it('scenario b: the status cannot be put back to Active while it runs; afterwards only Restore makes the customer active', async () => {
    const { store, release, onSaved } = await startArchiving();
    const status = combobox('Status');
    // The gesture that used to put Active back in the draft: the list does not even open.
    await userEvent.click(status);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(status).toHaveTextContent('Archived');
    expect(status).toBeDisabled();
    expect(descriptions(status)).toContain(ARCHIVING_REASON);

    release();
    await screen.findByRole('button', { name: 'Restore' });
    await waitFor(() => expect(footer()).toBeNull());
    expect(stored(store, ACTIVE).status).toBe('archived');
    expect(onSaved).toHaveBeenCalledTimes(1);

    // Restore drops no draft (there is none): the customer comes back exactly as saved, clean, editable.
    const before = stored(store, ACTIVE);
    await userEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(textbox('Name')).not.toBeDisabled());
    expect(stored(store, ACTIVE)).toEqual({ ...before, status: 'active' });
    expect(footer()).toBeNull();
    expect(onSaved).toHaveBeenCalledTimes(2);
  }, 30_000);

  it('Discard does nothing while it runs (aria-disabled): the page then shows the customer the server archived', async () => {
    const { store, release } = await startArchiving();
    const discard = discardButton();
    await userEvent.click(discard);
    // Not reset: the draft still says Archived, still locked.
    expect(combobox('Status')).toHaveTextContent('Archived');
    expect(discard).toHaveAttribute('aria-disabled', 'true');
    expect(textbox('Name')).toBeDisabled();

    release();
    await screen.findByRole('button', { name: 'Restore' });
    // The page agrees with the server: archived, locked, clean (never an "active" page over an archived customer).
    expect(stored(store, ACTIVE).status).toBe('archived');
    expect(within(headerOf()).getByText('Archived')).toBeInTheDocument();
    await waitFor(() => expect(footer()).toBeNull());
    expect(textbox('Name')).toBeDisabled();
  }, 30_000);

  it('a save that archives and fails: the fields unlock, the draft (Archived) and the error stay, Discard works again', async () => {
    const { store, release, onSaved } = await startArchiving('error');
    expect(textbox('Name')).toBeDisabled();
    release();
    await waitFor(() => expect(textbox('Name')).not.toBeDisabled());
    expect(stored(store, ACTIVE).status).toBe('active');
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull();
    expect(descriptions(textbox('Name'))).not.toContain(ARCHIVING_REASON);
    expect(combobox('Status')).toHaveTextContent('Archived');
    expect(discardButton()).not.toHaveAttribute('aria-disabled');
    await userEvent.click(discardButton());
    await waitFor(() => expect(footer()).toBeNull());
    expect(combobox('Status')).toHaveTextContent('Active');
  }, 30_000);

  it('a save that does NOT archive locks nothing: typing goes on during it and Discard stays available', async () => {
    const { store, release } = gatedStore();
    setupPage(ACTIVE, store);
    await ready();
    await retype(textbox('City'), 'Nuova Città');
    await save();
    const bar = await visibleBar();
    expect(within(bar).getByRole('button', { name: 'Save' })).toHaveAttribute('aria-disabled', 'true');
    expect(within(bar).getByRole('button', { name: 'Discard' })).not.toHaveAttribute('aria-disabled');
    expect(within(bar).getByRole('status')).not.toHaveTextContent(ARCHIVING_REASON);
    expect(textbox('Name')).not.toBeDisabled();
    await userEvent.type(textbox('Name'), ' Later');
    expect(textbox('Name').value).toMatch(/ Later$/);
    release();
    await waitFor(() => expect(stored(store, ACTIVE).billingAddress.city).toBe('Nuova Città'));
    // The edit made during the save is kept, as before (it was not part of that save).
    expect(textbox('Name').value).toMatch(/ Later$/);
    expect(stored(store, ACTIVE).name).not.toMatch(/ Later$/);
  }, 30_000);

  it('an archived customer opened as such announces nothing at mount; restored then archived again, it is announced', async () => {
    const store = createCustomerStore();
    setupPage(ARCHIVED, store);
    await screen.findByRole('button', { name: 'Restore' });
    const archivedText = `Customer ${stored(store, ARCHIVED).code} archived.`;
    expect(announced(archivedText)).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(textbox('Name')).not.toBeDisabled());
    await pick(combobox('Status'), 'Archived');
    await save();
    await screen.findByRole('button', { name: 'Restore' });
    await waitFor(() => expect(announced(archivedText)).toBe(true));
  }, 30_000);
});

describe('Restore, as a component: never while a save is in flight (#523)', () => {
  // The page no longer reaches "archived and saving" (see above); the action keeps its own guard all the same, as
  // the shell's Delete does: a click on the aria-disabled button writes nothing.
  it('a click on Restore while the form is saving sends nothing', async () => {
    const HeaderActions = CUSTOMERS.form.HeaderActions!;
    const record = makeShowcaseCustomers().find((c) => c.id === ARCHIVED)!;
    const baseline = toValues(record);
    const form = {
      values: baseline,
      baseline,
      isDirty: false,
      isSaving: true,
      reset: vi.fn(),
    } as unknown as UseObjectPageFormReturn<CustomerValues>;
    const saveRecord = vi.fn(async (r: typeof record) => r);
    render(<HeaderActions form={form} record={record} saveRecord={saveRecord} />);
    const restore = screen.getByRole('button', { name: 'Restore' });
    expect(restore).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(restore);
    expect(saveRecord).not.toHaveBeenCalled();
    expect(form.reset).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument();
  });
});
