import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createCustomerStore } from './customer-store';
import {
  ACTIVE,
  ARCHIVED,
  ONE_CONTACT,
  combobox,
  descriptions,
  footer,
  gone,
  pick,
  ready,
  save,
  setupCustomerTests,
  setupPage,
  stored,
  textbox,
  visibleBar,
} from './modules/customers/customer-test-kit';
import { ARCHIVED_REASON } from './modules/customers/customers-module';

// #523: the contacts of a customer (an array with identity: add, remove, edit, the primary one, the last one that
// cannot be removed) and the archived customer (nothing interactive, from the keyboard either; "Restore").
setupCustomerTests();

const removeButton = (n: number) => screen.getByRole('button', { name: `Remove contact ${n}` });
const addButton = () => screen.getByRole('button', { name: 'Add contact' });

describe('the contacts (#523)', () => {
  it('Add contact: a new empty contact, the focus on its name; removing it brings the saved contacts back (clean)', async () => {
    setupPage();
    await ready();
    await userEvent.click(addButton());
    const name = textbox('Contact 3 name');
    await waitFor(() => expect(name).toHaveFocus());
    expect(name).toHaveValue('');
    expect(textbox('Contact 3 e-mail')).toHaveValue('');
    expect(await visibleBar()).toBeInTheDocument();
    await userEvent.click(removeButton(3));
    // The previous contact's Remove takes the focus (the removed one had no heir after it).
    await waitFor(() => expect(removeButton(2)).toHaveFocus());
    await gone();
  });

  it('removing a contact and adding an identical one is a change: the new one has another id (declared rule)', async () => {
    const { store, onSaved } = setupPage();
    await ready();
    const second = stored(store, ACTIVE).contacts[1]!;
    await userEvent.click(removeButton(2));
    expect(await visibleBar()).toBeInTheDocument();
    await userEvent.click(addButton());
    await userEvent.type(textbox('Contact 2 name'), second.name);
    await userEvent.type(textbox('Contact 2 role'), second.role);
    await userEvent.type(textbox('Contact 2 e-mail'), second.email);
    await userEvent.type(textbox('Contact 2 phone'), second.phone);
    // Every text is the saved one, the contact is not: the save bar stays.
    expect(await visibleBar()).toBeInTheDocument();
    await save();
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    const saved = stored(store, ACTIVE).contacts[1]!;
    expect({ ...saved, id: second.id }).toEqual(second);
    expect(saved.id).not.toBe(second.id);
    expect(saved.id).toMatch(/^new-contact-\d+$/);
  }, 30_000);

  it('an id is never reused: add, remove, add gives two different new ids', async () => {
    setupPage();
    await ready();
    await userEvent.click(addButton());
    const first = textbox('Contact 3 name').closest('[data-contact-id]')!.getAttribute('data-contact-id');
    await userEvent.click(removeButton(3));
    await userEvent.click(addButton());
    const second = textbox('Contact 3 name').closest('[data-contact-id]')!.getAttribute('data-contact-id');
    expect(first).toMatch(/^new-contact-/);
    expect(second).toMatch(/^new-contact-/);
    expect(second).not.toBe(first);
  });

  it('removing the first contact: the one that takes its place gets the focus on its Remove', async () => {
    const { store } = setupPage('cus-7');
    await ready();
    const contacts = stored(store, 'cus-7').contacts;
    expect(contacts).toHaveLength(3);
    await userEvent.click(removeButton(1));
    await waitFor(() => expect(removeButton(1)).toHaveFocus());
    expect(textbox('Contact 1 name')).toHaveValue(contacts[1]!.name);
  });

  it('removing a contact in the middle: the NEXT one (which takes its place) gets the focus, not the previous one', async () => {
    const { store } = setupPage('cus-7');
    await ready();
    const contacts = stored(store, 'cus-7').contacts;
    await userEvent.click(removeButton(2));
    await waitFor(() => expect(removeButton(2)).toHaveFocus());
    expect(textbox('Contact 2 name')).toHaveValue(contacts[2]!.name);
  });

  it('removing the primary contact leaves none chosen: Save says so on "Primary contact" and nothing is saved', async () => {
    const { store, onSaved } = setupPage();
    await ready();
    const [first, second] = stored(store, ACTIVE).contacts;
    expect(screen.getByText('Contact 1 (primary)')).toBeInTheDocument();
    await userEvent.click(removeButton(1));
    expect(combobox('Primary contact')).toHaveTextContent('Choose the primary contact');
    expect(screen.queryByText(/\(primary\)/)).toBeNull();
    await save();
    const primary = combobox('Primary contact');
    expect(await screen.findByText('Choose the primary contact.')).toBeInTheDocument();
    expect(primary).toHaveAttribute('aria-invalid', 'true');
    expect(descriptions(primary)).toContain('Choose the primary contact.');
    await waitFor(() => expect(primary).toHaveFocus());
    expect(onSaved).not.toHaveBeenCalled();
    // The remaining contact made primary: saved, and it is the one flagged.
    await pick(primary, second!.name);
    expect(screen.getByText('Contact 1 (primary)')).toBeInTheDocument();
    await save();
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(stored(store, ACTIVE).contacts).toEqual([{ ...second!, primary: true }]);
    expect(first).toBeDefined();
  }, 30_000);

  it('a new contact made primary: the options follow the names as typed; an invalid e-mail on it is reported on its path', async () => {
    const { onSaved } = setupPage();
    await ready();
    await userEvent.click(addButton());
    await userEvent.click(combobox('Primary contact'));
    expect(await screen.findByRole('option', { name: 'Contact 3 (no name yet)' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await userEvent.type(textbox('Contact 3 name'), 'Ilse Visser');
    await userEvent.type(textbox('Contact 3 e-mail'), 'ilse.visser@');
    await pick(combobox('Primary contact'), 'Ilse Visser');
    expect(screen.getByText('Contact 3 (primary)')).toBeInTheDocument();
    await save();
    const email = textbox('Contact 3 e-mail');
    await waitFor(() => expect(email).toHaveAttribute('aria-invalid', 'true'));
    expect(email).toHaveAttribute('data-rop-name', 'contacts.2.email');
    await waitFor(() => expect(email).toHaveFocus());
    expect(onSaved).not.toHaveBeenCalled();
  }, 30_000);

  it('a contact with no name and no e-mail: both errors, each on its own path', async () => {
    setupPage();
    await ready();
    await userEvent.click(addButton());
    await save();
    expect(await screen.findByText('Contact name is required.')).toBeInTheDocument();
    expect(screen.getByText('E-mail is required.')).toBeInTheDocument();
    expect(textbox('Contact 3 name')).toHaveAttribute('aria-invalid', 'true');
    expect(textbox('Contact 3 e-mail')).toHaveAttribute('aria-invalid', 'true');
    expect(textbox('Contact 3 role')).not.toHaveAttribute('aria-invalid');
    expect(await visibleBar()).toHaveTextContent('2 invalid fields');
  });

  it('the only contact cannot be removed: the button says why (aria-describedby) and a click does nothing', async () => {
    const { store } = setupPage(ONE_CONTACT);
    await ready();
    const remove = removeButton(1);
    expect(remove).toHaveAttribute('aria-disabled', 'true');
    expect(descriptions(remove)).toEqual(['A customer needs at least one contact: add another one before removing this one.']);
    await userEvent.click(remove);
    expect(textbox('Contact 1 name')).toHaveValue(stored(store, ONE_CONTACT).contacts[0]!.name);
    expect(footer()).toBeNull();
    // From the keyboard too.
    remove.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    expect(screen.getAllByRole('button', { name: /^Remove contact/ })).toHaveLength(1);
    expect(footer()).toBeNull();
    // With a second contact both can be removed, and the explanation is gone.
    await userEvent.click(addButton());
    expect(removeButton(1)).not.toHaveAttribute('aria-disabled');
    expect(removeButton(1)).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByText(/A customer needs at least one contact/)).toBeNull();
  });
});

describe('an archived customer (#523)', () => {
  it('every field is disabled (out of the Tab order) with the reason linked by aria-describedby; no button changes the contacts', async () => {
    setupPage(ARCHIVED);
    const restore = await screen.findByRole('button', { name: 'Restore' });
    expect(screen.getByRole('heading', { level: 1 }).parentElement!.parentElement!).toHaveTextContent('Archived');
    const controls = [...screen.getAllByRole('textbox'), ...screen.getAllByRole('combobox')];
    expect(controls.length).toBeGreaterThanOrEqual(19);
    for (const control of controls) {
      expect(control, control.getAttribute('data-rop-name') ?? control.id).toBeDisabled();
      expect(descriptions(control)).toContain(ARCHIVED_REASON);
    }
    expect(screen.queryByRole('button', { name: 'Add contact' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Remove contact/ })).toBeNull();
    expect(screen.getByText('Archived customer')).toBeInTheDocument();
    // Tab from "Back to list": Restore, then nothing of the form (the scroll area, the anchors and the page only).
    screen.getByRole('button', { name: 'Back to list' }).focus();
    for (let i = 0; i < 12; i++) {
      await userEvent.tab();
      const active = document.activeElement as HTMLElement;
      expect(active.matches('input, [role="combobox"], textarea, select'), active.outerHTML.slice(0, 80)).toBe(false);
    }
    expect(restore).toBeInTheDocument();
  });

  it('typing into a field of an archived customer changes nothing', async () => {
    const { store } = setupPage(ARCHIVED);
    await screen.findByRole('button', { name: 'Restore' });
    const name = textbox('Name');
    await userEvent.type(name, 'x');
    expect(name).toHaveValue(stored(store, ARCHIVED).name);
    expect(footer()).toBeNull();
  });

  it('Restore: the server first ("Restoring…", aria-disabled), then Active, every field enabled, the focus on Name, announced', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const store = createCustomerStore(undefined, { saveDelayMs: gate });
    const { onSaved } = setupPage(ARCHIVED, store);
    const restore = await screen.findByRole('button', { name: 'Restore' });
    await userEvent.click(restore);
    const pending = screen.getByRole('button', { name: 'Restoring…' });
    expect(pending).toHaveAttribute('aria-disabled', 'true');
    // A second click while it runs sends nothing more.
    await userEvent.click(pending);
    expect(stored(store, ARCHIVED).status).toBe('archived');
    expect(textbox('Name')).toBeDisabled();
    release();
    await waitFor(() => expect(textbox('Name')).not.toBeDisabled());
    expect(stored(store, ARCHIVED).status).toBe('active');
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: ARCHIVED, status: 'active' }));
    expect(screen.queryByRole('button', { name: /^Restor/ })).toBeNull();
    await waitFor(() => expect(textbox('Name')).toHaveFocus());
    expect(screen.getAllByRole('status').some((s) => s.textContent === `Customer ${stored(store, ARCHIVED).code} restored.`)).toBe(true);
    // A restore is not an edit: the form is clean, the header says Active, the fields describe no archived reason.
    expect(footer()).toBeNull();
    expect(screen.getByRole('heading', { level: 1 }).parentElement!.parentElement!).toHaveTextContent('Active');
    expect(descriptions(textbox('Name'))).not.toContain(ARCHIVED_REASON);
    expect(screen.getByRole('button', { name: 'Add contact' })).toBeInTheDocument();
    // And it can be edited and saved at once.
    await userEvent.type(textbox('Name'), ' Restored');
    await save();
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(2));
    expect(stored(store, ARCHIVED).name).toMatch(/ Restored$/);
    expect(stored(store, ARCHIVED).status).toBe('active');
  });

  it('a Restore that fails: still archived, said on screen, the focus stays on Restore', async () => {
    const store = createCustomerStore(undefined, { saveOutcome: 'error' });
    const { onSaved } = setupPage(ARCHIVED, store);
    const restore = await screen.findByRole('button', { name: 'Restore' });
    await userEvent.click(restore);
    expect(await screen.findByText('Could not restore the customer. Try again.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Restore' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Restore' })).not.toHaveAttribute('aria-disabled');
    expect(textbox('Name')).toBeDisabled();
    expect(stored(store, ARCHIVED).status).toBe('archived');
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('choosing "Archived" locks nothing until it is saved; once saved, the page is archived and Restore appears', async () => {
    const { store, onSaved } = setupPage();
    await ready();
    await pick(combobox('Status'), 'Archived');
    expect(await visibleBar()).toBeInTheDocument();
    expect(textbox('Name')).not.toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull();
    await save();
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(stored(store, ACTIVE).status).toBe('archived');
    await waitFor(() => expect(textbox('Name')).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument();
    expect(within(screen.getByRole('heading', { level: 1 }).parentElement!.parentElement!).getByText('Archived')).toBeInTheDocument();
  }, 20_000);
});
