import { describe, expect, it } from 'vitest';
import { getEmployee, makeEmployees, DEMO_REFERENCE_POOL, POSTAL_CODE_PATTERN, type DemoCountryCode } from '../../../internal/demo-data';
import { makeShowcaseCustomers, type StoredCustomer } from '../../customer-store';
import {
  MAX_CREDIT_LIMIT,
  POSTAL_CODE_EXAMPLE,
  nextContactId,
  sameAddress,
  sameContacts,
  sameValues,
  toCustomer,
  toValues,
  validateCustomer,
  type ContactValues,
  type CustomerValues,
} from './customer-form';
import { accountManagerName, accountManagerOptions, customerSearchText } from './customers-module';

// #523: the customer as the form sees it. Seed ids used below (makeShowcaseCustomers): cus-4 IT EUR active with two
// contacts and a region; cus-6 JP JPY; cus-8 SE with a line 2; cus-9 with an account manager who left the company.
const seed = makeShowcaseCustomers();
const byId = (id: string): StoredCustomer => seed.find((c) => c.id === id)!;
const base = toValues(byId('cus-4'));
const withPatch = (patch: Partial<CustomerValues>): CustomerValues => ({ ...base, ...patch });

describe('toValues / toCustomer (#523)', () => {
  it('every customer of the seed reads into values and back to the same customer, is its own baseline and is valid', () => {
    for (const customer of seed) {
      const values = toValues(customer);
      expect(sameValues(values, toValues(customer)), customer.id).toBe(true);
      expect(toCustomer(customer, values), customer.id).toEqual(customer);
      expect(validateCustomer(values), customer.id).toEqual({});
    }
  });

  it('an absent line 2 or region is `null` stored and `\'\'` in the form (what an Input shows and emits), and back', () => {
    const noLine2 = seed.find((c) => c.billingAddress.line2 === null && c.billingAddress.region === null)!;
    const values = toValues(noLine2);
    expect(values.billingAddress.line2).toBe('');
    expect(values.billingAddress.region).toBe('');
    const saved = toCustomer(noLine2, values);
    expect(saved.billingAddress.line2).toBeNull();
    expect(saved.billingAddress.region).toBeNull();
    // Emptied by the user: `null` on the server, never `''`.
    const withLine2 = byId('cus-8');
    expect(withLine2.billingAddress.line2).toBe('Gate 2');
    const emptied = toCustomer(withLine2, { ...toValues(withLine2), billingAddress: { ...toValues(withLine2).billingAddress, line2: '' } });
    expect(emptied.billingAddress.line2).toBeNull();
    // A text, even a blank one, is kept as typed: only the empty text is "absent".
    const spaced = toCustomer(withLine2, { ...toValues(withLine2), billingAddress: { ...toValues(withLine2).billingAddress, line2: ' ' } });
    expect(spaced.billingAddress.line2).toBe(' ');
    const region = byId('cus-4');
    expect(toValues(region).billingAddress.region).toBe('BO');
    expect(toCustomer(region, toValues(region)).billingAddress.region).toBe('BO');
  });

  it('the primary contact is a key of its own in the form and the flag of exactly one contact on the server', () => {
    const customer = byId('cus-4');
    expect(customer.contacts.map((c) => c.primary)).toEqual([true, false]);
    const values = toValues(customer);
    expect(values.primaryContactId).toBe(customer.contacts[0]!.id);
    const second = customer.contacts[1]!.id;
    const saved = toCustomer(customer, { ...values, primaryContactId: second });
    expect(saved.contacts.map((c) => c.primary)).toEqual([false, true]);
    // No primary chosen: no contact is flagged (the validation refuses it before any save).
    expect(toCustomer(customer, { ...values, primaryContactId: '' }).contacts.some((c) => c.primary)).toBe(false);
    // A stored customer with no primary contact reads as "none chosen", never as the first one.
    const none = { ...customer, contacts: customer.contacts.map((c) => ({ ...c, primary: false })) };
    expect(toValues(none).primaryContactId).toBe('');
  });

  it('the account country is the billing country; the credit limit is parsed in the chosen currency', () => {
    const customer = byId('cus-4');
    const values = toValues(customer);
    const moved = toCustomer(customer, { ...values, billingAddress: { ...values.billingAddress, country: 'DE' } });
    expect(moved.country).toBe('DE');
    expect(moved.billingAddress.country).toBe('DE');
    expect(toCustomer(customer, { ...values, creditLimit: '1234.56' }).creditLimitMinor).toBe(123_456);
    expect(toCustomer(customer, { ...values, currency: 'JPY', creditLimit: '1234' }).creditLimitMinor).toBe(1234);
    expect(toCustomer(customer, { ...values, creditLimit: '0' }).creditLimitMinor).toBe(0);
    // The text of the saved amount: two decimals in EUR, none in JPY.
    expect(values.creditLimit).toBe('100000.00');
    expect(toValues(byId('cus-6')).creditLimit).toBe('810000');
  });

  it('the website and the code are carried from the record, never from the form', () => {
    const customer = byId('cus-4');
    const saved = toCustomer(customer, toValues(customer));
    expect(saved.website).toBe(customer.website);
    expect(saved.code).toBe(customer.code);
    expect(saved.id).toBe(customer.id);
  });
});

describe('sameValues, key by key (#523)', () => {
  it('is true for a deep copy', () => {
    expect(sameValues(base, structuredClone(base))).toBe(true);
  });

  it('is false when any single key of the customer differs', () => {
    expect(sameValues(base, withPatch({ name: `${base.name}x` }))).toBe(false);
    expect(sameValues(base, withPatch({ industry: base.industry === 'energy' ? 'logistics' : 'energy' }))).toBe(false);
    expect(sameValues(base, withPatch({ status: 'on-hold' }))).toBe(false);
    expect(sameValues(base, withPatch({ primaryContactId: base.contacts[1]!.id }))).toBe(false);
    expect(sameValues(base, withPatch({ primaryContactId: '' }))).toBe(false);
    expect(sameValues(base, withPatch({ currency: 'USD' }))).toBe(false);
    expect(sameValues(base, withPatch({ paymentTerms: 'net-60' }))).toBe(false);
    expect(sameValues(base, withPatch({ creditLimit: '1.00' }))).toBe(false);
    expect(sameValues(base, withPatch({ accountManagerId: 'emp-1' }))).toBe(false);
  });

  it('is false when any single part of the billing address differs (the nested object, part by part)', () => {
    for (const key of ['line1', 'line2', 'postalCode', 'city', 'region'] as const) {
      const billingAddress = { ...base.billingAddress, [key]: `${base.billingAddress[key]}x` };
      expect(sameValues(base, withPatch({ billingAddress })), key).toBe(false);
      expect(sameAddress(base.billingAddress, billingAddress), key).toBe(false);
    }
    expect(sameValues(base, withPatch({ billingAddress: { ...base.billingAddress, country: 'DE' } }))).toBe(false);
    // A postal code is text: the same characters without the space are another postal code.
    const nl = { ...base.billingAddress, postalCode: '1234 AB' };
    expect(sameAddress(nl, { ...nl, postalCode: '1234AB' })).toBe(false);
  });

  it('is false when any single text of a contact differs', () => {
    for (const key of ['name', 'role', 'email', 'phone'] as const) {
      const contacts = base.contacts.map((c, i) => (i === 1 ? { ...c, [key]: `${c[key]}x` } : c));
      expect(sameValues(base, withPatch({ contacts })), key).toBe(false);
    }
  });

  it('a contact removed and added again with the same texts but a new id IS a change (the identity rule)', () => {
    const removed = base.contacts[1]!;
    const again: ContactValues = { ...removed, id: 'new-contact-1' };
    const contacts = [base.contacts[0]!, again];
    const texts = (c: ContactValues) => [c.name, c.role, c.email, c.phone];
    expect(contacts.map(texts)).toEqual(base.contacts.map(texts));
    expect(sameContacts(base.contacts, contacts)).toBe(false);
    expect(sameValues(base, withPatch({ contacts }))).toBe(false);
    // The very same contact (same id) put back is no change.
    expect(sameValues(base, withPatch({ contacts: [base.contacts[0]!, { ...removed }] }))).toBe(true);
  });

  it('a reorder of the contacts, one more or one less, are changes', () => {
    expect(sameValues(base, withPatch({ contacts: [...base.contacts].reverse() }))).toBe(false);
    expect(sameValues(base, withPatch({ contacts: base.contacts.slice(1) }))).toBe(false);
    expect(sameValues(base, withPatch({ contacts: [...base.contacts, { id: 'new-contact-1', name: '', role: '', email: '', phone: '' }] }))).toBe(false);
  });

  it('the credit limit is compared as an amount of the currency: 100000 is 100000.00, an invalid text is a change, `\'\'` is not 0', () => {
    expect(base.creditLimit).toBe('100000.00');
    expect(sameValues(base, withPatch({ creditLimit: '100000' }))).toBe(true);
    expect(sameValues(base, withPatch({ creditLimit: '100000.0' }))).toBe(true);
    expect(sameValues(base, withPatch({ creditLimit: ' 100000.00' }))).toBe(true);
    expect(sameValues(base, withPatch({ creditLimit: '100000.000' }))).toBe(false);
    expect(sameValues(base, withPatch({ creditLimit: '1e5' }))).toBe(false);
    const zero = withPatch({ creditLimit: '0' });
    expect(sameValues(zero, { ...zero, creditLimit: '' })).toBe(false);
    expect(sameValues(zero, { ...zero, creditLimit: '0.00' })).toBe(true);
    const yen = toValues(byId('cus-6'));
    expect(sameValues(yen, { ...yen, creditLimit: `${yen.creditLimit}.0` })).toBe(false);
    // The same text in another currency is another amount.
    expect(sameValues(base, withPatch({ currency: 'GBP' }))).toBe(false);
  });
});

describe('validateCustomer: messages on nested paths (#523)', () => {
  const contact = (patch: Partial<ContactValues>, i = 1): CustomerValues =>
    withPatch({ contacts: base.contacts.map((c, k) => (k === i ? { ...c, ...patch } : c)) });

  it('the name, the street and the city are required (spaces only count as empty)', () => {
    expect(validateCustomer(withPatch({ name: '  ' }))).toEqual({ name: 'Name is required.' });
    expect(validateCustomer(withPatch({ billingAddress: { ...base.billingAddress, line1: '' } }))).toEqual({
      'billingAddress.line1': 'Street is required.',
    });
    expect(validateCustomer(withPatch({ billingAddress: { ...base.billingAddress, city: ' ' } }))).toEqual({
      'billingAddress.city': 'City is required.',
    });
    // Line 2 and the region are optional.
    expect(validateCustomer(withPatch({ billingAddress: { ...base.billingAddress, line2: '', region: '' } }))).toEqual({});
  });

  it('the postal code follows the format of the billing country: changing the country changes the rule', () => {
    const it20121 = withPatch({ billingAddress: { ...base.billingAddress, country: 'IT', postalCode: '20121' } });
    expect(validateCustomer(it20121)).toEqual({});
    const nl = { ...it20121, billingAddress: { ...it20121.billingAddress, country: 'NL' as const } };
    expect(validateCustomer(nl)).toEqual({ 'billingAddress.postalCode': 'Postal code must look like 1234 AB for Netherlands.' });
    expect(validateCustomer({ ...nl, billingAddress: { ...nl.billingAddress, postalCode: '1234 AB' } })).toEqual({});
    expect(validateCustomer({ ...nl, billingAddress: { ...nl.billingAddress, postalCode: '' } })).toEqual({
      'billingAddress.postalCode': 'Postal code is required.',
    });
    // As typed: a space around it is not the format.
    expect(validateCustomer({ ...it20121, billingAddress: { ...it20121.billingAddress, postalCode: ' 20121' } })).toHaveProperty(
      ['billingAddress.postalCode'],
    );
  });

  it('the example of every country matches its own format and no other format of a different shape', () => {
    for (const code of Object.keys(POSTAL_CODE_EXAMPLE) as DemoCountryCode[]) {
      expect(POSTAL_CODE_PATTERN[code].test(POSTAL_CODE_EXAMPLE[code]), code).toBe(true);
    }
    expect(Object.keys(POSTAL_CODE_EXAMPLE).sort()).toEqual(Object.keys(POSTAL_CODE_PATTERN).sort());
  });

  it('a contact e-mail: required, with an @ and a domain; any domain is accepted', () => {
    expect(validateCustomer(contact({ email: '' }))).toEqual({ 'contacts.1.email': 'E-mail is required.' });
    for (const bad of ['name', 'name@', 'name@company', '@company.com', 'na me@company.com', 'name@company.com ', ' name@company.com']) {
      expect(validateCustomer(contact({ email: bad })), bad).toEqual({
        'contacts.1.email': 'Enter a valid e-mail address, like name@company.com.',
      });
    }
    for (const good of ['a@b.co', 'first.last@sub.domain.example', 'buyer@company.museum', 'x+tag@company.co.uk']) {
      expect(validateCustomer(contact({ email: good })), good).toEqual({});
    }
    // The error is on the contact's own path: the first contact keeps none.
    expect(validateCustomer(contact({ email: 'bad' }, 0))).toEqual({ 'contacts.0.email': expect.any(String) });
  });

  it('a contact name is required; the role and the phone are not', () => {
    expect(validateCustomer(contact({ name: ' ' }))).toEqual({ 'contacts.1.name': 'Contact name is required.' });
    expect(validateCustomer(contact({ role: '', phone: '' }))).toEqual({});
  });

  it('one contact must be the primary one: none chosen, or one that is no longer in the list', () => {
    expect(validateCustomer(withPatch({ primaryContactId: '' }))).toEqual({ primaryContactId: 'Choose the primary contact.' });
    expect(validateCustomer(withPatch({ primaryContactId: 'gone' }))).toEqual({ primaryContactId: 'Choose the primary contact.' });
    expect(validateCustomer(withPatch({ primaryContactId: base.contacts[1]!.id }))).toEqual({});
    // No contact at all: said once, on the list (not also as a missing primary contact).
    expect(validateCustomer(withPatch({ contacts: [], primaryContactId: '' }))).toEqual({ contacts: 'Add at least one contact.' });
  });

  it('the credit limit: required (`\'\'` is never 0), 0 or more, the decimals of the currency, a bound', () => {
    expect(validateCustomer(withPatch({ creditLimit: '' }))).toEqual({ creditLimit: 'Credit limit is required.' });
    expect(validateCustomer(withPatch({ creditLimit: '0' }))).toEqual({});
    expect(validateCustomer(withPatch({ creditLimit: '0.00' }))).toEqual({});
    const eurError = 'Credit limit must be an amount of 0 or more, with at most 2 decimals.';
    for (const bad of ['-1', '-0.01', '1.234', '1,000', 'abc', '1e3', ' ']) {
      expect(validateCustomer(withPatch({ creditLimit: bad })), bad).toEqual({ creditLimit: eurError });
    }
    expect(validateCustomer(withPatch({ currency: 'JPY', creditLimit: '10.5' }))).toEqual({
      creditLimit: 'Credit limit must be a whole amount of 0 or more (JPY has no decimals).',
    });
    expect(validateCustomer(withPatch({ currency: 'JPY', creditLimit: '4100000' }))).toEqual({});
    expect(validateCustomer(withPatch({ creditLimit: `${MAX_CREDIT_LIMIT}.00` }))).toEqual({});
    expect(validateCustomer(withPatch({ creditLimit: `${MAX_CREDIT_LIMIT}.01` }))).toEqual({ creditLimit: 'Credit limit is too large.' });
    expect(validateCustomer(withPatch({ currency: 'JPY', creditLimit: String(MAX_CREDIT_LIMIT) }))).toEqual({});
    expect(validateCustomer(withPatch({ currency: 'JPY', creditLimit: String(MAX_CREDIT_LIMIT + 1) }))).toEqual({
      creditLimit: 'Credit limit is too large.',
    });
  });

  it('an account manager is required', () => {
    expect(validateCustomer(withPatch({ accountManagerId: '' }))).toEqual({ accountManagerId: 'Choose an account manager.' });
  });

  it('several errors at once, each on its own path', () => {
    const v = withPatch({
      name: '',
      billingAddress: { ...base.billingAddress, postalCode: 'x' },
      contacts: base.contacts.map((c, i) => (i === 1 ? { ...c, email: 'nope' } : c)),
      creditLimit: '',
    });
    expect(Object.keys(validateCustomer(v)).sort()).toEqual(['billingAddress.postalCode', 'contacts.1.email', 'creditLimit', 'name']);
  });
});

describe('nextContactId (#523)', () => {
  it('skips every taken id and never goes back', () => {
    expect(nextContactId(new Set(), 0)).toEqual({ id: 'new-contact-1', counter: 1 });
    expect(nextContactId(new Set(['new-contact-1', 'new-contact-2']), 0)).toEqual({ id: 'new-contact-3', counter: 3 });
    expect(nextContactId(new Set(), 5)).toEqual({ id: 'new-contact-6', counter: 6 });
    expect(nextContactId(new Set(['new-contact-7']), 6)).toEqual({ id: 'new-contact-8', counter: 8 });
  });
});

describe('the list and the account managers (#523)', () => {
  it('the search text is the code, the name and the city, each on its own line', () => {
    const customer = byId('cus-4');
    expect(customerSearchText(customer)).toBe(`${customer.code}\n${customer.name}\n${customer.billingAddress.city}`);
  });

  it('the account managers offered are the sales staff of the reference pool who did not leave, each name once', () => {
    const options = accountManagerOptions();
    const sales = makeEmployees(DEMO_REFERENCE_POOL.employees).filter((e) => e.department === 'sales');
    expect(options.length).toBe(sales.filter((e) => e.status !== 'inactive').length);
    expect(options.length).toBeGreaterThan(20);
    for (const option of options) {
      const employee = getEmployee(option.value)!;
      expect(employee.department).toBe('sales');
      expect(employee.status).not.toBe('inactive');
      expect(option.label).toBe(employee.fullName);
    }
    expect(new Set(options.map((o) => o.label)).size).toBe(options.length);
    // Sorted by name, the same list every time.
    expect(options.map((o) => o.label)).toEqual([...options.map((o) => o.label)].sort((a, b) => a.localeCompare(b, 'en')));
    expect(accountManagerOptions()).toBe(options);
  });

  it('a customer of the seed has an account manager who left: not offered, still named', () => {
    const customer = byId('cus-9');
    const manager = getEmployee(customer.accountManagerId)!;
    expect(manager.status).toBe('inactive');
    expect(accountManagerOptions().some((o) => o.value === manager.id)).toBe(false);
    expect(accountManagerName(manager.id)).toBe(manager.fullName);
    expect(accountManagerName('not-an-employee')).toBe('not-an-employee');
  });
});
