// #524: the review of a customer save (Change Summary with the engine's labels and reorders), as pure functions and
// as the rendered list. Fast: no shell, no list of 200 customers.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { getEmployee } from '../../../core/src/internal/demo-data';
import { makeShowcaseCustomers, type StoredCustomer } from '../../../core/src/showcase/customer-store';
import { sameValues, toValues, type ContactValues, type CustomerValues } from '../../../core/src/showcase/modules/customers/customer-form';
import { accountManagerOptions } from '../../../core/src/showcase/modules/customers/customers-module';
import type { ChangeEntry } from '../change-summary/types';
import {
  CONTACTS_ORDER_ALSO_NOTE,
  CONTACTS_ORDER_ONLY_DESCRIPTION,
  CUSTOMER_ARRAY_ID_KEYS,
  CUSTOMER_LABELS,
  CustomerChanges,
  customerContactLabel,
  customerIsEqual,
  customerReview,
  customerSaveReview,
  customerValueText,
  reviewSides,
  sideOf,
  type CustomerSides,
} from './customer-review';
import { readItems, withoutKey } from './customer-integrity.test-kit';

afterEach(cleanup);

const CUSTOMERS = makeShowcaseCustomers();
const storedOf = (id: string): StoredCustomer => {
  const customer = CUSTOMERS.find((c) => c.id === id);
  if (!customer) throw new Error(`no customer ${id}`);
  return customer;
};
const valuesOf = (id: string): CustomerValues => toValues(storedOf(id));

// cus-4: EUR, 2 contacts (Matteo Gatti primary, Giulia Bellini), no line 2, region BO. cus-8: line 2 "Gate 2".
// cus-34: USD, 4 contacts. cus-40: JPY, 3 contacts.
const EUR = valuesOf('cus-4');
const GATE = valuesOf('cus-8');
const USD = valuesOf('cus-34');
const JPY = valuesOf('cus-40');

const withContact = (v: CustomerValues, index: number, patch: Partial<ContactValues>): CustomerValues => ({
  ...v,
  contacts: v.contacts.map((c, i) => (i === index ? { ...c, ...patch } : c)),
});
const review = (values: CustomerValues, baseline: CustomerValues) => customerReview({ values, baseline });
const summary = (values: CustomerValues, baseline: CustomerValues) =>
  review(values, baseline).entries.map((e) => ({ path: e.path, label: e.label, kind: e.kind }));
const sidesOf = (values: CustomerValues, baseline: CustomerValues): CustomerSides => reviewSides({ values, baseline });
const entry = (over: Partial<ChangeEntry> & { path: string }): ChangeEntry => ({
  labelPath: [],
  label: '',
  kind: 'changed',
  before: undefined,
  after: undefined,
  beforeMissing: false,
  afterMissing: false,
  ...over,
});
/** The list of the review as read by assistive technology, one string per entry. */
const listed = (values: CustomerValues, baseline: CustomerValues): string[] => {
  render(<CustomerChanges entries={review(values, baseline).entries} sides={sidesOf(values, baseline)} />);
  const items = readItems(screen.getByRole('list', { name: 'Changes to save' }));
  cleanup();
  return items;
};
/** Another active sales employee than the customer's own: a value the user can pick in the Combobox. */
const otherManager = (v: CustomerValues) => accountManagerOptions().find((o) => o.value !== v.accountManagerId)!;
const ILSE: ContactValues = { id: 'new-contact-1', name: 'Ilse Visser', role: 'Buyer', email: 'ilse.visser@company.example', phone: '+31 20 000 0101' };

describe('customerReview: the fields of the customer, by the labels of the page', () => {
  // One row per editable field of the page: changed, it is ONE entry named like its Field (a nested one under its
  // section); put back, none.
  it.each([
    ['name', 'Name', 'Borgavella Utensili S.p.A.'],
    ['industry', 'Industry', 'energy'],
    ['status', 'Status', 'on-hold'],
    ['primaryContactId', 'Primary contact', 'cus-4-con-2'],
    ['currency', 'Currency', 'USD'],
    ['paymentTerms', 'Payment terms', 'net-60'],
    ['creditLimit', 'Credit limit', '120000.00'],
    ['accountManagerId', 'Account manager', 'emp-1'],
  ] as const)('%s: one entry "%s" when changed, none when put back', (key, label, value) => {
    const changed = { ...EUR, [key]: value };
    expect(summary(changed, EUR)).toEqual([{ path: key, label, kind: 'changed' }]);
    expect(summary({ ...changed, [key]: EUR[key] }, EUR)).toEqual([]);
    expect(review({ ...changed, [key]: EUR[key] }, EUR).reorders).toEqual([]);
  });

  it.each([
    ['line1', 'Street', 'Via del Lavoro 3'],
    ['line2', 'Street, line 2', 'Building B'],
    ['postalCode', 'Postal code', '40121'],
    ['city', 'City', 'Modena'],
    ['region', 'Region or state', 'MO'],
    ['country', 'Country', 'DE'],
  ] as const)('billingAddress.%s: one entry "Billing address > %s", none when put back', (part, label, value) => {
    const changed = { ...EUR, billingAddress: { ...EUR.billingAddress, [part]: value } };
    expect(summary(changed, EUR)).toEqual([{ path: `billingAddress.${part}`, label: `Billing address > ${label}`, kind: 'changed' }]);
    expect(summary({ ...changed, billingAddress: { ...EUR.billingAddress } }, EUR)).toEqual([]);
  });

  it('two parts of the address: two entries, never one for the whole address', () => {
    const changed = { ...EUR, billingAddress: { ...EUR.billingAddress, postalCode: '40121', city: 'Modena' } };
    expect(summary(changed, EUR).map((e) => e.label)).toEqual(['Billing address > Postal code', 'Billing address > City']);
  });

  it.each([
    ['name', 'Name', 'Giulia Bellini-Rossi'],
    ['role', 'Role', 'Head of Purchasing'],
    ['email', 'E-mail', 'g.bellini@borgavella-tooling.example'],
    ['phone', 'Phone', '+39 051 000 9999'],
  ] as const)('contact field %s: one entry on that contact, named by its position and name, then "%s"', (field, label, value) => {
    const changed = withContact(EUR, 1, { [field]: value });
    const row = `Contact 2 (${changed.contacts[1]!.name})`;
    expect(summary(changed, EUR)).toEqual([{ path: `contacts.1.${field}`, label: `Contacts > ${row} > ${label}`, kind: 'changed' }]);
    expect(summary(withContact(changed, 1, { [field]: EUR.contacts[1]![field] }), EUR)).toEqual([]);
  });

  it('the labels are the Fields of the page and its sections', () => {
    expect(CUSTOMER_LABELS).toMatchObject({
      billingAddress: 'Billing address',
      'billingAddress.line2': 'Street, line 2',
      'billingAddress.region': 'Region or state',
      contacts: 'Contacts',
      'contacts.email': 'E-mail',
      primaryContactId: 'Primary contact',
      creditLimit: 'Credit limit',
      accountManagerId: 'Account manager',
    });
    expect(CUSTOMER_ARRAY_ID_KEYS).toEqual({ contacts: 'id' });
  });
});

describe('customerReview: the contacts, matched by id (added, removed, edited, only reordered)', () => {
  it('a contact added: ONE entry on the new contact, named by its name, with the whole contact', () => {
    const values = { ...EUR, contacts: [...EUR.contacts, ILSE] };
    expect(summary(values, EUR)).toEqual([{ path: 'contacts.2', label: 'Contacts > Contact 3 (Ilse Visser)', kind: 'added' }]);
    expect(listed(values, EUR)).toEqual(['Contacts > Contact 3 (Ilse Visser), added, Ilse Visser (Buyer), ilse.visser@company.example, +31 20 000 0101']);
  });

  it('a contact removed: ONE entry named as it was saved, with the values it had', () => {
    const values = { ...EUR, contacts: [EUR.contacts[0]!] };
    expect(summary(values, EUR)).toEqual([{ path: 'contacts.1', label: 'Contacts > Contact 2 (Giulia Bellini)', kind: 'removed' }]);
    expect(listed(values, EUR)).toEqual([
      'Contacts > Contact 2 (Giulia Bellini), removed, Giulia Bellini (Buyer), giulia.bellini@borgavella-tooling.example, +39 051 000 0267',
    ]);
  });

  it('a contact edited: an entry on its field, nothing for the whole contact', () => {
    const values = withContact(EUR, 0, { email: 'm.gatti@borgavella-tooling.example' });
    expect(listed(values, EUR)).toEqual([
      'Contacts > Contact 1 (Matteo Gatti) > E-mail, changed, from matteo.gatti@borgavella-tooling.example to m.gatti@borgavella-tooling.example',
    ]);
  });

  it('only reordered: no entry, one reorder of "Contacts"; the review opens with its own text and no list', () => {
    const values = { ...USD, contacts: [USD.contacts[3]!, ...USD.contacts.slice(0, 3)] };
    const result = review(values, USD);
    expect(result.entries).toEqual([]);
    expect(result.reorders.map((r) => ({ path: r.path, label: r.label }))).toEqual([{ path: 'contacts', label: 'Contacts' }]);
    const dialog = customerSaveReview({ values, baseline: USD });
    expect(dialog?.description).toBe(CONTACTS_ORDER_ONLY_DESCRIPTION);
    expect(dialog?.children).toBeUndefined();
    // Dirty for the editor too: a reorder is a change (`sameContacts`).
    expect(sameValues(values, USD)).toBe(false);
  });

  it('the four cases together: three entries in the order of the visit, the reorder said once', () => {
    // Contact 4 moved to the top, contact 2 removed, contact 3 edited, a new contact added.
    const [c1, , c3, c4] = USD.contacts as [ContactValues, ContactValues, ContactValues, ContactValues];
    const values = { ...USD, contacts: [c4, c1, { ...c3, role: 'Lead Site Engineer' }, ILSE] };
    expect(summary(values, USD)).toEqual([
      { path: 'contacts.2.role', label: `Contacts > Contact 3 (${c3.name}) > Role`, kind: 'changed' },
      { path: 'contacts.3', label: 'Contacts > Contact 4 (Ilse Visser)', kind: 'added' },
      { path: 'contacts.1', label: `Contacts > Contact 2 (${USD.contacts[1]!.name})`, kind: 'removed' },
    ]);
    expect(review(values, USD).reorders.map((r) => r.path)).toEqual(['contacts']);
    const dialog = customerSaveReview({ values, baseline: USD });
    expect(dialog?.description).toBe('3 changes will be saved.');
    render(<>{dialog?.children}</>);
    expect(screen.getByText(CONTACTS_ORDER_ALSO_NOTE)).toBeInTheDocument();
  });

  it('a contact removed and the next one edited: the edit stays on ITS contact (by id), not on the position', () => {
    const values = { ...EUR, contacts: [{ ...EUR.contacts[1]!, role: 'Purchasing Lead' }] };
    expect(summary(values, EUR)).toEqual([
      { path: 'contacts.0.role', label: 'Contacts > Contact 1 (Giulia Bellini) > Role', kind: 'changed' },
      { path: 'contacts.0', label: 'Contacts > Contact 1 (Matteo Gatti)', kind: 'removed' },
    ]);
  });

  it('a contact renamed: named by the name it has NOW; a contact with no name by its position only', () => {
    expect(summary(withContact(EUR, 1, { name: 'Giulia Rossi' }), EUR)[0]?.label).toBe('Contacts > Contact 2 (Giulia Rossi) > Name');
    expect(summary(withContact(EUR, 1, { name: '  ' }), EUR)[0]?.label).toBe('Contacts > Contact 2 > Name');
    expect(listed({ ...EUR, contacts: [...EUR.contacts, { ...ILSE, name: '', role: '', email: '', phone: '' }] }, EUR)).toEqual([
      'Contacts > Contact 3, added, Empty name, Empty e-mail',
    ]);
  });

  it('removed and added again with the same texts is another contact (another id): removed + added', () => {
    const again = { ...EUR.contacts[1]!, id: 'new-contact-1' };
    const values = { ...EUR, contacts: [EUR.contacts[0]!, again] };
    expect(summary(values, EUR).map((e) => e.kind)).toEqual(['added', 'removed']);
    expect(sameValues(values, EUR)).toBe(false);
  });
});

describe('customerContactLabel: the engine names a contact (itemLabel)', () => {
  const at = (index: number) => ({ path: `contacts.${index}`, index, side: 'values' as const, isLastSegment: true, defaultLabel: `Item ${index + 1}` });
  it('by position and trimmed name; by position alone without a name; never another array', () => {
    expect(customerContactLabel('contacts', { name: ' Ilse Visser ' }, at(2))).toBe('Contact 3 (Ilse Visser)');
    expect(customerContactLabel('contacts', { name: '' }, at(0))).toBe('Contact 1');
    expect(customerContactLabel('contacts', { name: 42 }, at(0))).toBe('Contact 1');
    expect(customerContactLabel('lines', { name: 'X' }, at(0))).toBeUndefined();
    expect(customerContactLabel('contacts', null, at(0))).toBeUndefined();
    expect(customerContactLabel('contacts', 'Ilse', at(0))).toBeUndefined();
  });
});

describe('customerReview: dirty if and only if an entry or a reorder (the editor\'s own equality)', () => {
  // Pairs (saved text, typed text) of the credit limit, in EUR and in JPY: `sameValues` (the dirty-tracking of the
  // page) and the review must agree on every one of them, in both directions.
  const cases: [string, string, string, CustomerValues][] = [
    ['25000 is 25000.00 in euros', '25000.00', '25000', EUR],
    ['spaces around are the same amount', '25000.00', ' 25000.00 ', EUR],
    ['25000.000 has too many decimals', '25000.00', '25000.000', EUR],
    ['25000.01 is another amount', '25000.00', '25000.01', EUR],
    ['empty is a change', '25000.00', '', EUR],
    ['letters are a change', '25000.00', 'abc', EUR],
    ['yen: 4100000 and 04100000', '4100000', '04100000', JPY],
    ['yen: 4100000.0 is not an amount in yen', '4100000', '4100000.0', JPY],
    ['two empty texts', '', '', EUR],
    ['invalid against empty', '', 'abc', EUR],
  ];
  it.each(cases)('%s', (_, saved, typed, base) => {
    const baseline = { ...base, creditLimit: saved };
    const values = { ...base, creditLimit: typed };
    for (const [a, b] of [
      [values, baseline],
      [baseline, values],
    ] as const) {
      const { entries, reorders } = review(a, b);
      expect(entries.length + reorders.length > 0).toBe(!sameValues(a, b));
    }
  });

  it('the currency changed with the limit retyped: the amount is read in BOTH currencies, so it is a change', () => {
    // 25000 and 25000.00 are the same euros but not the same yen: the limit typed for the new currency is an entry.
    const values = { ...EUR, currency: 'JPY' as const, creditLimit: '25000' };
    const baseline = { ...EUR, creditLimit: '25000.00' };
    expect(summary(values, baseline).map((e) => e.path)).toEqual(['currency', 'creditLimit']);
    expect(listed(values, baseline)).toEqual(['Currency, changed, from EUR to JPY', 'Credit limit, changed, from €25,000.00 to ¥25,000']);
    expect(sameValues(values, baseline)).toBe(false);
  });

  it('the currency changed, the same text: one entry for the currency only', () => {
    expect(summary({ ...EUR, currency: 'USD' }, EUR).map((e) => e.path)).toEqual(['currency']);
  });

  it('a field outside the credit limit is compared as text: "40139 " is not "40139"', () => {
    const changed = { ...EUR, billingAddress: { ...EUR.billingAddress, postalCode: '40139 ' } };
    expect(summary(changed, EUR).map((e) => e.path)).toEqual(['billingAddress.postalCode']);
  });

  it('the equality of the same currencies is the same function (a stable identity, in any order)', () => {
    expect(customerIsEqual('EUR', 'JPY')).toBe(customerIsEqual('JPY', 'EUR'));
    expect(customerIsEqual('EUR', 'EUR')).toBe(customerIsEqual('EUR'));
    expect(customerIsEqual('EUR')).not.toBe(customerIsEqual('USD'));
    expect(customerIsEqual('EUR')('1', '01', 'name')).toBeUndefined();
    expect(customerIsEqual('EUR')(null, '01', 'creditLimit')).toBeUndefined();
  });
});

describe('customerValueText: the values as the user knows them', () => {
  const sides = sidesOf(EUR, EUR);
  const text = (value: unknown, path: string, over: Partial<ChangeEntry> = {}, s: CustomerSides = sides) => customerValueText(value, entry({ path, ...over }), s);

  it('status, industry, payment terms and country by their labels; an unknown code as it is', () => {
    expect(text('on-hold', 'status')).toBe('On hold');
    expect(text('archived', 'status')).toBe('Archived');
    expect(text('energy', 'industry')).toBe('Energy & utilities');
    expect(text('net-60', 'paymentTerms')).toBe('Net 60 days');
    expect(text('DE', 'billingAddress.country')).toBe('Germany');
    expect(text('XX', 'billingAddress.country')).toBe('XX');
    expect(text('toString', 'status')).toBe('toString');
  });

  it('the account manager by name, also one who left the company; an unknown id as it is', () => {
    const manager = otherManager(EUR);
    expect(text(manager.value, 'accountManagerId')).toBe(manager.label);
    // cus-9's manager left the company: still named.
    const former = valuesOf('cus-9').accountManagerId;
    expect(text(former, 'accountManagerId')).toBe(getEmployee(former)!.fullName);
    expect(text('emp-does-not-exist', 'accountManagerId')).toBe('emp-does-not-exist');
  });

  it('the primary contact by the name it has on its side; a removed one by its saved name; no name yet by position', () => {
    const values = { ...withContact(EUR, 0, { name: 'Matteo Gatti Jr.' }), contacts: [{ ...EUR.contacts[0]!, name: 'Matteo Gatti Jr.' }, ILSE], primaryContactId: ILSE.id };
    const s = sidesOf(values, EUR);
    // From the saved primary contact (named as saved) to the new one.
    expect(text(EUR.primaryContactId, 'primaryContactId', { before: EUR.primaryContactId, after: ILSE.id }, s)).toBe('Matteo Gatti');
    expect(text(ILSE.id, 'primaryContactId', { before: EUR.primaryContactId, after: ILSE.id }, s)).toBe('Ilse Visser');
    // Giulia is only on the saved side.
    expect(text('cus-4-con-2', 'primaryContactId', { before: 'x', after: 'cus-4-con-2' }, s)).toBe('Giulia Bellini');
    const unnamed = sidesOf({ ...EUR, contacts: [...EUR.contacts, { ...ILSE, name: ' ' }] }, EUR);
    expect(text(ILSE.id, 'primaryContactId', { after: ILSE.id }, unnamed)).toBe('Contact 3 (no name yet)');
    expect(text('nobody', 'primaryContactId')).toBe('nobody');
  });

  it('the credit limit as money in the currency of its side; a text the rule refuses as typed', () => {
    expect(text('100000.00', 'creditLimit', { before: '100000.00' })).toBe('€100,000.00');
    expect(text(' 120000 ', 'creditLimit', { after: ' 120000 ' })).toBe('€120,000.00');
    expect(text('4100000', 'creditLimit', {}, sidesOf(JPY, JPY))).toBe('¥4,100,000');
    expect(text('4100000.5', 'creditLimit', {}, sidesOf(JPY, JPY))).toBe('4100000.5');
    expect(text('1e5', 'creditLimit')).toBe('1e5');
    // The side is the one the value belongs to: before = the saved customer (EUR), after = the form (USD).
    const changed = sidesOf({ ...EUR, currency: 'USD' }, EUR);
    expect(text('100000.00', 'creditLimit', { before: '100000.00', after: '90000' }, changed)).toBe('€100,000.00');
    expect(text('90000', 'creditLimit', { before: '100000.00', after: '90000' }, changed)).toBe('$90,000.00');
  });

  it('"no value" in its forms, told apart: Empty, Null, Missing, Undefined (spec §1.13.1)', () => {
    expect(text('', 'billingAddress.line2')).toBe('Empty');
    expect(text(null, 'accountManagerId')).toBe('Null');
    expect(text(undefined, 'accountManagerId', { before: undefined, after: 'emp-1', beforeMissing: true })).toBe('Missing');
    expect(text(undefined, 'accountManagerId', { before: undefined, after: 'emp-1', beforeMissing: false })).toBe('Undefined');
  });

  it('a whole contact as a sentence: the optional parts only when there is one', () => {
    expect(text({ ...ILSE }, 'contacts.2')).toBe('Ilse Visser (Buyer), ilse.visser@company.example, +31 20 000 0101');
    expect(text({ ...ILSE, role: '', phone: '' }, 'contacts.2')).toBe('Ilse Visser, ilse.visser@company.example');
    expect(text({ ...ILSE, name: '', email: '' }, 'contacts.2')).toBe('Empty name (Buyer), Empty e-mail, +31 20 000 0101');
    // Not a contact of the form: the default formatting.
    expect(text({ id: 'x' }, 'contacts.2')).not.toContain('Empty name');
    // A field of a contact reads as typed.
    expect(text('Buyer', 'contacts.2.role')).toBe('Buyer');
  });
});

describe('customerReview: absent values (spec §1.13.1)', () => {
  it('"Street, line 2": a stored null and a missing key both reach the form as "" (the boundary), so no entry between them', () => {
    const stored = storedOf('cus-4');
    expect(stored.billingAddress.line2).toBeNull();
    const missing = toValues({ ...stored, billingAddress: withoutKey(stored.billingAddress, 'line2') as StoredCustomer['billingAddress'] });
    expect(missing.billingAddress.line2).toBe('');
    expect(review(missing, EUR).entries).toEqual([]);
    expect(sameValues(missing, EUR)).toBe(true);
  });

  it('"Street, line 2" cleared and filled: from the text to Empty, from Empty to the text', () => {
    const cleared = { ...GATE, billingAddress: { ...GATE.billingAddress, line2: '' } };
    expect(listed(cleared, GATE)).toEqual(['Billing address > Street, line 2, changed, from Gate 2 to Empty']);
    const filled = { ...EUR, billingAddress: { ...EUR.billingAddress, line2: 'Building B' } };
    expect(listed(filled, EUR)).toEqual(['Billing address > Street, line 2, changed, from Empty to Building B']);
  });

  it('an account manager the server set to null: a change from Null (never an "added" that hides it), and a missing key from Missing', () => {
    const manager = otherManager(EUR);
    const fromNull = { ...EUR, accountManagerId: null as unknown as string };
    expect(summary({ ...EUR, accountManagerId: manager.value }, fromNull)).toEqual([{ path: 'accountManagerId', label: 'Account manager', kind: 'changed' }]);
    expect(listed({ ...EUR, accountManagerId: manager.value }, fromNull)).toEqual([`Account manager, changed, from Null to ${manager.label}`]);
    expect(listed({ ...EUR, accountManagerId: manager.value }, withoutKey(EUR, 'accountManagerId') as CustomerValues)).toEqual([`Account manager, changed, from Missing to ${manager.label}`]);
    // Null on both sides: nothing to review.
    expect(review(fromNull, fromNull).entries).toEqual([]);
  });
});

describe('customerSaveReview: the dialog', () => {
  it('nothing changed: no dialog (the editor saves directly)', () => {
    expect(customerSaveReview({ values: { ...EUR }, baseline: EUR })).toBeNull();
  });

  it('the counts and the texts, against the SAVED customer', () => {
    const values = { ...EUR, status: 'on-hold' as const, billingAddress: { ...EUR.billingAddress, postalCode: '40121' } };
    const dialog = customerSaveReview({ values, baseline: EUR })!;
    expect(dialog).toMatchObject({ title: 'Review changes', description: '2 changes will be saved.', confirmLabel: 'Save changes', cancelLabel: 'Keep editing', initialFocus: 'cancel' });
    render(<>{dialog.children}</>);
    expect(readItems(screen.getByRole('list', { name: 'Changes to save' }))).toEqual([
      'Status, changed, from Active to On hold',
      'Billing address > Postal code, changed, from 40139 to 40121',
    ]);
    expect(screen.queryByText(CONTACTS_ORDER_ALSO_NOTE)).toBeNull();
  });

  it('the sides of the review are the saved customer and the form', () => {
    expect(reviewSides({ values: USD, baseline: EUR })).toEqual({ before: sideOf(EUR), after: sideOf(USD) });
    expect(sideOf(EUR)).toEqual({ currency: 'EUR', contacts: EUR.contacts });
  });
});
