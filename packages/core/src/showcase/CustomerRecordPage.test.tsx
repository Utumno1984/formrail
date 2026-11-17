import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createCustomerStore } from './customer-store';
import {
  ACTIVE,
  FORMER_MANAGER,
  YEN,
  combobox,
  descriptions,
  footer,
  gone,
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
import { accountManagerName, accountManagerOptions } from './modules/customers/customers-module';

// #523: the customer page in the record-editing shell: mounted hydrated, the dirty-tracking of EVERY editable field
// (nested address and array of contacts included), Save with values that are not the saved ones, the validation on
// nested paths. The contacts and the archived state are in CustomerRecordPage.contacts.test.tsx.
setupCustomerTests();

describe('CustomerRecordPage (#523)', () => {
  it('mounts no field while the customer is in flight, then the editor hydrated and clean', async () => {
    const { store } = setupPage(ACTIVE, createCustomerStore(undefined, { loadDelayMs: 50 }));
    expect(screen.getByRole('status')).toHaveTextContent('Loading customer');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(await ready()).toHaveValue(stored(store, ACTIVE).name);
    expect(textbox('Postal code')).toHaveValue(stored(store, ACTIVE).billingAddress.postalCode);
    expect(textbox('Contact 2 e-mail')).toHaveValue(stored(store, ACTIVE).contacts[1]!.email);
    // Nothing was typed: the values arrived with the editor, so the form is clean.
    expect(footer()).toBeNull();
  });

  it('the header: the code as title, the saved name and country, the saved status', async () => {
    const { store } = setupPage();
    const customer = stored(store, ACTIVE);
    const title = await screen.findByRole('heading', { level: 1 });
    expect(title).toHaveTextContent(customer.code);
    const header = title.parentElement!.parentElement!;
    expect(header).toHaveTextContent(`${customer.name} · Italy`);
    expect(header).toHaveTextContent('Active');
    // The header shows the SAVED name: typing changes nothing there until Save.
    await userEvent.type(textbox('Name'), ' (draft)');
    expect(header).not.toHaveTextContent('(draft)');
  });

  it('has the sections General, Billing address, Contacts, Commercial terms and Account in the Anchor Bar', async () => {
    setupPage();
    await ready();
    const bar = screen.getByRole('navigation', { name: 'Sections' });
    expect(within(bar).getAllByRole('link').map((l) => l.textContent)).toEqual([
      'General',
      'Billing address',
      'Contacts',
      'Commercial terms',
      'Account',
    ]);
  });

  it('the code is locked (focusable, read-only, with its reason); no Restore on an active customer', async () => {
    setupPage();
    await ready();
    const code = textbox('Code');
    expect(code).toHaveAttribute('readonly');
    expect(code).not.toBeDisabled();
    expect(descriptions(code)).toEqual(['The customer code is assigned by the system.']);
    expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull();
  });
});

describe('dirty-tracking of every editable field (#523)', () => {
  /** Types one more character, then removes it: the saved text is back and the save bar goes away. */
  const typeAndUndo = async (el: HTMLInputElement) => {
    const saved = el.value;
    await userEvent.type(el, '1');
    expect(await visibleBar()).toBeInTheDocument();
    await userEvent.type(el, '{Backspace}');
    expect(el).toHaveValue(saved);
    await gone();
  };
  const pickAndBack = async (name: string, other: string | RegExp, back: string | RegExp) => {
    await pick(combobox(name), other);
    expect(await visibleBar()).toBeInTheDocument();
    await pick(combobox(name), back);
    await gone();
  };

  for (const label of ['Name', 'Street', 'Postal code', 'City', 'Region or state', 'Contact 1 name', 'Contact 2 role', 'Contact 2 e-mail', 'Contact 2 phone']) {
    it(label, async () => {
      setupPage();
      await ready();
      await typeAndUndo(textbox(label));
    });
  }

  it('the city changed and put back (the criterion of the ticket): the save bar comes and goes', async () => {
    const { store } = setupPage();
    await ready();
    const city = textbox('City');
    await retype(city, 'Ravenna');
    expect(await visibleBar()).toBeInTheDocument();
    await retype(city, stored(store, ACTIVE).billingAddress.city);
    await gone();
  });

  it('Street, line 2: absent on the server (`null`), typed then emptied is not a change', async () => {
    const { store } = setupPage();
    await ready();
    expect(stored(store, ACTIVE).billingAddress.line2).toBeNull();
    const line2 = textbox('Street, line 2');
    expect(line2).toHaveValue('');
    await userEvent.type(line2, 'B');
    expect(await visibleBar()).toBeInTheDocument();
    await userEvent.type(line2, '{Backspace}');
    await gone();
  });

  it('Industry', async () => {
    setupPage();
    await ready();
    expect(combobox('Industry')).toHaveTextContent('Manufacturing');
    await pickAndBack('Industry', 'Energy & utilities', 'Manufacturing');
  }, 20_000);

  it('Status', async () => {
    setupPage();
    await ready();
    await pickAndBack('Status', 'On hold', 'Active');
  }, 20_000);

  it('Country (of the billing address)', async () => {
    setupPage();
    await ready();
    expect(combobox('Country')).toHaveTextContent('Italy');
    await pickAndBack('Country', 'Germany', 'Italy');
  }, 20_000);

  it('Primary contact', async () => {
    const { store } = setupPage();
    await ready();
    const [first, second] = stored(store, ACTIVE).contacts;
    expect(combobox('Primary contact')).toHaveTextContent(first!.name);
    await pickAndBack('Primary contact', second!.name, first!.name);
  }, 20_000);

  it('Currency', async () => {
    setupPage();
    await ready();
    await pickAndBack('Currency', 'USD', 'EUR');
  }, 20_000);

  it('Payment terms', async () => {
    setupPage();
    await ready();
    expect(combobox('Payment terms')).toHaveTextContent('Net 30 days');
    await pickAndBack('Payment terms', 'Net 60 days', 'Net 30 days');
  }, 20_000);

  it('Credit limit, and the same amount written differently is not a change', async () => {
    setupPage();
    await ready();
    const credit = textbox('Credit limit (EUR)');
    expect(credit).toHaveValue('100000.00');
    await typeAndUndo(credit);
    await retype(credit, '100000');
    await gone();
  });

  it('Account manager', async () => {
    const { store } = setupPage();
    await ready();
    const saved = accountManagerName(stored(store, ACTIVE).accountManagerId);
    const box = combobox('Account manager') as HTMLInputElement;
    expect(box).toHaveValue(saved);
    const other = accountManagerOptions().find((o) => o.label !== saved)!.label;
    await pick(box, other);
    expect(box).toHaveValue(other);
    expect(await visibleBar()).toBeInTheDocument();
    await pick(box, saved);
    await gone();
  }, 20_000);

  it('the label of the credit limit follows the currency of the draft', async () => {
    setupPage();
    await ready();
    await pick(combobox('Currency'), 'JPY');
    expect(textbox('Credit limit (JPY)')).toHaveValue('100000.00');
  }, 20_000);
});

describe('Save (#523)', () => {
  it('stores what was typed everywhere: nested address, a contact, terms, account manager, with values that are not the saved ones', async () => {
    const { store, onSaved } = setupPage();
    await ready();
    const before = stored(store, ACTIVE);
    await retype(textbox('Name'), 'Renamed Coatings S.r.l.');
    await retype(textbox('Street'), 'Via Emilia 12');
    await userEvent.type(textbox('Street, line 2'), 'Building C');
    await pick(combobox('Country'), 'Germany');
    await retype(textbox('Postal code'), '10115');
    await retype(textbox('City'), 'Berlin');
    await retype(textbox('Region or state'), '');
    await retype(textbox('Contact 2 e-mail'), 'new.buyer@renamed.example');
    await pick(combobox('Primary contact'), before.contacts[1]!.name);
    await pick(combobox('Currency'), 'GBP');
    await pick(combobox('Payment terms'), 'Net 45 days');
    await retype(textbox('Credit limit (GBP)'), '1234.5');
    const manager = accountManagerOptions().find((o) => o.value !== before.accountManagerId)!;
    await pick(combobox('Account manager'), manager.label);
    await save();
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    await gone();
    const after = stored(store, ACTIVE);
    expect(after).toMatchObject({
      name: 'Renamed Coatings S.r.l.',
      country: 'DE',
      currency: 'GBP',
      paymentTerms: 'net-45',
      creditLimitMinor: 123_450,
      accountManagerId: manager.value,
    });
    expect(after.billingAddress).toEqual({ line1: 'Via Emilia 12', line2: 'Building C', postalCode: '10115', city: 'Berlin', region: null, country: 'DE' });
    expect(after.contacts[1]).toMatchObject({ email: 'new.buyer@renamed.example', primary: true });
    expect(after.contacts[0]!.primary).toBe(false);
    expect(after.website).toBe(before.website);
    expect(onSaved).toHaveBeenCalledWith(after);
    // The header shows what was saved; the form is clean against it (the credit limit text is the server's).
    expect(screen.getByRole('heading', { level: 1 }).parentElement!.parentElement!).toHaveTextContent('Renamed Coatings S.r.l. · Germany');
    expect(textbox('Credit limit (GBP)')).toHaveValue('1234.50');
  }, 60_000);

  it('a credit limit of 0 is stored as 0; an empty one is refused, never stored as 0', async () => {
    const { store, onSaved } = setupPage();
    await ready();
    const credit = textbox('Credit limit (EUR)');
    await retype(credit, '');
    await save();
    const message = await screen.findByText('Credit limit is required.');
    expect(descriptions(credit)).toContain(message.textContent);
    expect(credit).toHaveAttribute('aria-invalid', 'true');
    expect(onSaved).not.toHaveBeenCalled();
    expect(stored(store, ACTIVE).creditLimitMinor).toBe(10_000_000);
    await userEvent.type(credit, '0');
    await save();
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(stored(store, ACTIVE).creditLimitMinor).toBe(0);
  });

  it('a negative credit limit is refused (0 or more)', async () => {
    const { onSaved } = setupPage();
    await ready();
    await retype(textbox('Credit limit (EUR)'), '-100');
    await save();
    expect(await screen.findByText('Credit limit must be an amount of 0 or more, with at most 2 decimals.')).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('a yen customer: whole yen, a decimal is refused', async () => {
    setupPage(YEN);
    await ready();
    const credit = textbox('Credit limit (JPY)');
    expect(credit).toHaveValue('810000');
    await userEvent.type(credit, '.5');
    await save();
    expect(await screen.findByText('Credit limit must be a whole amount of 0 or more (JPY has no decimals).')).toBeInTheDocument();
    await waitFor(() => expect(credit).toHaveFocus());
  });
});

describe('validation on nested paths (#523)', () => {
  it('a postal code of the wrong format for the country: the error is on billingAddress.postalCode, focused, counted', async () => {
    const { onSaved } = setupPage();
    await ready();
    // The saved Italian postal code is not a Dutch one: changing only the country makes it invalid.
    await pick(combobox('Country'), 'Netherlands');
    await save();
    const postal = textbox('Postal code');
    const message = 'Postal code must look like 1234 AB for Netherlands.';
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(postal).toHaveAttribute('aria-invalid', 'true');
    expect(descriptions(postal)).toContain(message);
    await waitFor(() => expect(postal).toHaveFocus());
    expect(await visibleBar()).toHaveTextContent('1 invalid field');
    expect(onSaved).not.toHaveBeenCalled();
    // Only the postal code is invalid: the city next to it is not.
    expect(textbox('City')).not.toHaveAttribute('aria-invalid');
    await retype(postal, '1234 AB');
    await save();
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  }, 30_000);

  it('an invalid e-mail of the second contact: the error is on contacts.1.email, not on the first contact', async () => {
    const { onSaved } = setupPage();
    await ready();
    const email = textbox('Contact 2 e-mail');
    await retype(email, 'buyer-at-company');
    await save();
    const message = 'Enter a valid e-mail address, like name@company.com.';
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAttribute('data-rop-name', 'contacts.1.email');
    expect(descriptions(email)).toContain(message);
    expect(textbox('Contact 1 e-mail')).not.toHaveAttribute('aria-invalid');
    await waitFor(() => expect(email).toHaveFocus());
    expect(await visibleBar()).toHaveTextContent('1 invalid field');
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('several invalid fields: the focus goes to the first one on the page, the summary counts them all', async () => {
    setupPage();
    await ready();
    await retype(textbox('Contact 2 e-mail'), 'nope');
    await retype(textbox('Street'), '');
    await retype(textbox('Name'), '');
    await save();
    expect(await visibleBar()).toHaveTextContent('3 invalid fields');
    await waitFor(() => expect(textbox('Name')).toHaveFocus());
    expect(textbox('Street')).toHaveAttribute('aria-invalid', 'true');
    expect(textbox('Contact 2 e-mail')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('the account manager (#523)', () => {
  it('one who left the company is still shown (not offered), without making the page dirty', async () => {
    const { store } = setupPage(FORMER_MANAGER);
    await ready();
    const id = stored(store, FORMER_MANAGER).accountManagerId;
    const name = accountManagerName(id);
    const box = combobox('Account manager');
    expect(box).toHaveValue(`${name} (left the company)`);
    expect(footer()).toBeNull();
    await userEvent.click(box);
    expect((await screen.findAllByRole('option')).length).toBe(accountManagerOptions().length);
    expect(screen.queryByRole('option', { name })).toBeNull();
    await userEvent.keyboard('{Escape}');
    // Still there, still clean, after the list was opened and closed.
    expect(box).toHaveValue(`${name} (left the company)`);
    expect(footer()).toBeNull();
  });

  it('typing filters the employees by name (accents ignored); leaving without a choice keeps the saved one', async () => {
    const { store } = setupPage();
    await ready();
    const saved = accountManagerName(stored(store, ACTIVE).accountManagerId);
    const box = combobox('Account manager') as HTMLInputElement;
    await userEvent.clear(box);
    await userEvent.type(box, 'nunez');
    const found = await screen.findAllByRole('option');
    expect(found.length).toBeGreaterThan(0);
    for (const option of found) expect(option.textContent).toMatch(/Núñez/);
    await userEvent.tab();
    expect(box).toHaveValue(saved);
    await gone();
  });
});
