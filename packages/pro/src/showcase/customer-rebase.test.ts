// #524: the simulated server changes of the customers, the server rule on archived customers and the merge of a
// server version into an edited customer (computeRebase with the options of the add-on), as pure functions. Fast: no
// React.
import { describe, expect, it } from 'vitest';
import { createCustomerStore, makeShowcaseCustomers, type StoredCustomer } from '../../../core/src/showcase/customer-store';
import { toCustomer, toValues, type CustomerValues } from '../../../core/src/showcase/modules/customers/customer-form';
import { CUSTOMERS, accountManagerOptions } from '../../../core/src/showcase/modules/customers/customers-module';
import { computeRebase } from '../form-rebase/compute-rebase';
import { CUSTOMER_ARRAY_ID_KEYS, CUSTOMER_LABELS, customerContactLabel, customerIsEqual } from './customer-review';
import {
  ARCHIVED_SAVE_ERROR,
  CUSTOMERS_WITH_INTEGRITY,
  CUSTOMER_SERVER_CHANGES,
  ON_HOLD_TOGGLE,
  nextAccountManager,
  serverChangeOf,
  serverEmail,
  withArchivedGuard,
} from './customer-rebase';
import { withoutKey } from './customer-integrity.test-kit';

const SEED = makeShowcaseCustomers();
const customer = (id: string): StoredCustomer => SEED.find((c) => c.id === id)!;
const CUS4 = customer('cus-4');
const CUS34 = customer('cus-34');

/** The merge the add-on asks for: the user's values on top of what they opened, the server's version incoming. */
const rebase = (baseline: StoredCustomer, values: CustomerValues, incoming: StoredCustomer) => {
  const [b, i] = [toValues(baseline), toValues(incoming)];
  return computeRebase({
    baseline: b,
    values,
    incoming: i,
    arrayIdKeys: CUSTOMER_ARRAY_ID_KEYS,
    labels: CUSTOMER_LABELS,
    isEqual: customerIsEqual(b.currency, values.currency),
    itemLabel: customerContactLabel,
  });
};
const editContact = (v: CustomerValues, index: number, patch: Partial<CustomerValues['contacts'][number]>): CustomerValues => ({
  ...v,
  contacts: v.contacts.map((c, i) => (i === index ? { ...c, ...patch } : c)),
});

describe('the simulated server changes of a customer', () => {
  it('lists the six of the Control', () => {
    expect(CUSTOMER_SERVER_CHANGES).toEqual(['account-manager', 'on-hold', 'primary-contact-email', 'remove-contact', 'move-contact', 'archive']);
  });

  it('account-manager: the next sales employee of the Combobox, another one than now; the first after the last, or for one who left', () => {
    const options = accountManagerOptions().map((o) => o.value);
    const changed = serverChangeOf('account-manager')(CUS4);
    expect(changed.accountManagerId).not.toBe(CUS4.accountManagerId);
    expect(options.indexOf(changed.accountManagerId)).toBe(options.indexOf(CUS4.accountManagerId) + 1);
    expect(nextAccountManager(options.at(-1)!)).toBe(options[0]);
    // cus-9's manager left the company (not among the options).
    expect(options).not.toContain(customer('cus-9').accountManagerId);
    expect(nextAccountManager(customer('cus-9').accountManagerId)).toBe(options[0]);
  });

  it('on-hold: active to on hold, on hold back to active; an archived customer stays archived', () => {
    expect(serverChangeOf('on-hold')(CUS4).status).toBe('on-hold');
    expect(serverChangeOf('on-hold')(customer('cus-17')).status).toBe('active');
    expect(serverChangeOf('on-hold')(customer('cus-11')).status).toBe('archived');
    expect(ON_HOLD_TOGGLE).toEqual({ active: 'on-hold', 'on-hold': 'active', archived: 'archived' });
  });

  it('primary-contact-email: only the primary contact\'s e-mail changes', () => {
    const changed = serverChangeOf('primary-contact-email')(CUS4);
    expect(changed.contacts.map((c) => c.email)).toEqual([serverEmail(CUS4.contacts[0]!.email), CUS4.contacts[1]!.email]);
    expect(serverEmail('a@b.example')).toBe('orders.a@b.example');
  });

  it('remove-contact: the last contact that is not the primary one; with a single (primary) contact nothing changes', () => {
    expect(serverChangeOf('remove-contact')(CUS4).contacts.map((c) => c.id)).toEqual(['cus-4-con-1']);
    expect(serverChangeOf('remove-contact')(CUS34).contacts.map((c) => c.id)).toEqual(['cus-34-con-1', 'cus-34-con-2', 'cus-34-con-3']);
    // The primary contact last: the one before it goes.
    const primaryLast = { ...CUS4, contacts: [{ ...CUS4.contacts[1]!, primary: false }, { ...CUS4.contacts[0]!, primary: true }] };
    expect(serverChangeOf('remove-contact')(primaryLast).contacts.map((c) => c.id)).toEqual(['cus-4-con-1']);
    const single = customer('cus-1');
    expect(serverChangeOf('remove-contact')(single)).toBe(single);
  });

  it('move-contact: the last contact to the top, nothing else; a single contact stays', () => {
    expect(serverChangeOf('move-contact')(CUS34).contacts.map((c) => c.id)).toEqual(['cus-34-con-4', 'cus-34-con-1', 'cus-34-con-2', 'cus-34-con-3']);
    expect(serverChangeOf('move-contact')(CUS34).contacts[0]).toEqual(CUS34.contacts[3]);
    const single = customer('cus-1');
    expect(serverChangeOf('move-contact')(single)).toBe(single);
  });

  it('archive: the status only', () => {
    expect(serverChangeOf('archive')(CUS4)).toEqual({ ...CUS4, status: 'archived' });
  });
});

describe('the server rule: an archived customer cannot be changed, only restored', () => {
  const archivedStore = () => withArchivedGuard(createCustomerStore());

  it('a change of an archived customer is refused and the store is unchanged', async () => {
    const store = archivedStore();
    const archived = customer('cus-11');
    await expect(store.save({ ...archived, name: 'Renamed GmbH' })).rejects.toThrow(ARCHIVED_SAVE_ERROR);
    await expect(store.save({ ...archived, status: 'active', name: 'Renamed GmbH' })).rejects.toThrow(ARCHIVED_SAVE_ERROR);
    expect(store.snapshot().find((c) => c.id === 'cus-11')).toEqual(archived);
  });

  it('"Restore" (the stored customer with another status) is accepted, as the page builds it', async () => {
    const store = archivedStore();
    const archived = customer('cus-11');
    // The page sends `toCustomer(record, { ...baseline, status: 'active' })`.
    const restored = await store.save(toCustomer(archived, { ...toValues(archived), status: 'active' }));
    expect(restored.status).toBe('active');
    expect(store.snapshot().find((c) => c.id === 'cus-11')).toEqual({ ...archived, status: 'active' });
  });

  it('a customer that is not archived is saved as usual, also when the save archives it', async () => {
    const store = archivedStore();
    expect((await store.save({ ...CUS4, name: 'Borgavella S.p.A.' })).name).toBe('Borgavella S.p.A.');
    expect((await store.save({ ...CUS4, status: 'archived' })).status).toBe('archived');
  });

  it('archived on the server while a save is in flight: the save was received first, then the archiving (replayed on top)', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const store = withArchivedGuard(createCustomerStore(undefined, { saveDelayMs: held }));
    const saving = store.save({ ...CUS4, name: 'Borgavella S.p.A.' });
    await store.updateFromServer('cus-4', serverChangeOf('archive'));
    release();
    await expect(saving).resolves.toMatchObject({ name: 'Borgavella S.p.A.' });
    expect(store.snapshot().find((c) => c.id === 'cus-4')).toMatchObject({ name: 'Borgavella S.p.A.', status: 'archived' });
  });

  it('the module of the showcase is the Free one with that store', () => {
    expect(CUSTOMERS_WITH_INTEGRITY.name).toBe('customers');
    expect(CUSTOMERS_WITH_INTEGRITY.form).toBe(CUSTOMERS.form);
    expect(CUSTOMERS_WITH_INTEGRITY.list).toBe(CUSTOMERS.list);
  });
});

describe('computeRebase with the options of the add-on', () => {
  it('no echo: a clean form takes every server change as it is, with no conflict', () => {
    for (const kind of CUSTOMER_SERVER_CHANGES) {
      const incoming = serverChangeOf(kind)(CUS34);
      const { values, conflicts } = rebase(CUS34, toValues(CUS34), incoming);
      expect(conflicts, kind).toEqual([]);
      expect(values, kind).toEqual(toValues(incoming));
    }
  });

  it('the primary contact\'s e-mail changed by both: one conflict named by the contact, both e-mails', () => {
    const mine = editContact(toValues(CUS4), 0, { email: 'matteo@borgavella-tooling.example' });
    const { values, conflicts } = rebase(CUS4, mine, serverChangeOf('primary-contact-email')(CUS4));
    expect(conflicts.map((c) => ({ path: c.path, label: c.label, mine: c.mine, theirs: c.theirs }))).toEqual([
      { path: 'contacts.0.email', label: 'Contacts > Contact 1 (Matteo Gatti) > E-mail', mine: 'matteo@borgavella-tooling.example', theirs: serverEmail(CUS4.contacts[0]!.email) },
    ]);
    expect(values.contacts[0]!.email).toBe('matteo@borgavella-tooling.example');
  });

  it('a contact the server removed while the user edits it: kept with the user\'s value, one conflict on the contact (never a silent loss)', () => {
    const mine = editContact(toValues(CUS4), 1, { email: 'giulia@borgavella-tooling.example' });
    const { values, conflicts } = rebase(CUS4, mine, serverChangeOf('remove-contact')(CUS4));
    expect(values.contacts.map((c) => c.email)).toEqual([CUS4.contacts[0]!.email, 'giulia@borgavella-tooling.example']);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ path: 'contacts.1', label: 'Contacts > Contact 2 (Giulia Bellini)', theirsMissing: true, mineMissing: false });
  });

  it('a contact the server removed and the user did not touch: removed, no conflict', () => {
    const mine = { ...toValues(CUS4), name: 'Borgavella S.p.A.' };
    const { values, conflicts, applied } = rebase(CUS4, mine, serverChangeOf('remove-contact')(CUS4));
    expect(values.contacts.map((c) => c.id)).toEqual(['cus-4-con-1']);
    expect(values.name).toBe('Borgavella S.p.A.');
    expect(conflicts).toEqual([]);
    expect(applied.map((e) => ({ label: e.label, kind: e.kind }))).toEqual([{ label: 'Contacts > Contact 2 (Giulia Bellini)', kind: 'removed' }]);
  });

  it('a contact reordered by the server and edited by the user: the server\'s order, the user\'s edit on the same contact (by id), no conflict', () => {
    const mine = editContact(toValues(CUS34), 1, { role: 'Senior Buyer' });
    const { values, conflicts } = rebase(CUS34, mine, serverChangeOf('move-contact')(CUS34));
    expect(values.contacts.map((c) => c.id)).toEqual(['cus-34-con-4', 'cus-34-con-1', 'cus-34-con-2', 'cus-34-con-3']);
    expect(values.contacts[2]).toMatchObject({ id: 'cus-34-con-2', role: 'Senior Buyer' });
    expect(conflicts).toEqual([]);
  });

  it('"Street, line 2": the server sends the key missing (or null) instead of the stored null: the same "" in the form, no change', () => {
    const noLine2 = withoutKey(CUS4.billingAddress, 'line2') as StoredCustomer['billingAddress'];
    for (const incoming of [{ ...CUS4, billingAddress: noLine2 }, { ...CUS4, billingAddress: { ...CUS4.billingAddress, line2: null } }]) {
      const { values, conflicts, applied } = rebase(CUS4, toValues(CUS4), incoming);
      expect(values.billingAddress.line2).toBe('');
      expect(conflicts).toEqual([]);
      expect(applied).toEqual([]);
    }
  });

  it('"Street, line 2" changed by the user, cleared on the server (null): the user\'s text stays, one conflict against ""', () => {
    const cus8 = customer('cus-8');
    const mine = { ...toValues(cus8), billingAddress: { ...toValues(cus8).billingAddress, line2: 'Gate 3' } };
    const { values, conflicts } = rebase(cus8, mine, { ...cus8, billingAddress: { ...cus8.billingAddress, line2: null } });
    expect(values.billingAddress.line2).toBe('Gate 3');
    expect(conflicts.map((c) => ({ path: c.path, mine: c.mine, theirs: c.theirs }))).toEqual([{ path: 'billingAddress.line2', mine: 'Gate 3', theirs: '' }]);
  });

  it('the account manager set to null by the server: taken when the user did not touch it, a conflict (mine against null) when they did', () => {
    const cleared = { ...CUS4, accountManagerId: null as unknown as string };
    const untouched = rebase(CUS4, toValues(CUS4), cleared);
    expect(untouched.values.accountManagerId).toBeNull();
    expect(untouched.conflicts).toEqual([]);
    expect(untouched.applied.map((e) => e.path)).toEqual(['accountManagerId']);
    const other = accountManagerOptions().find((o) => o.value !== CUS4.accountManagerId)!.value;
    const touched = rebase(CUS4, { ...toValues(CUS4), accountManagerId: other }, cleared);
    expect(touched.values.accountManagerId).toBe(other);
    expect(touched.conflicts.map((c) => ({ path: c.path, mine: c.mine, theirs: c.theirs }))).toEqual([{ path: 'accountManagerId', mine: other, theirs: null }]);
  });

  it('the currency changed by the user, the limit retyped for it ("25000" yen for "25000.00" euros): never replaced by the stored text', () => {
    const base = { ...CUS4, creditLimitMinor: 2_500_000 };
    const mine = { ...toValues(base), currency: 'JPY' as const, creditLimit: '25000' };
    const { values, conflicts } = rebase(base, mine, serverChangeOf('account-manager')(base));
    expect(values).toMatchObject({ currency: 'JPY', creditLimit: '25000' });
    expect(conflicts).toEqual([]);
  });

  it('a credit limit retyped as the same amount ("100000" for "100000.00") is not an edit: the form takes the server\'s text, no conflict', () => {
    const mine = { ...toValues(CUS4), creditLimit: '100000' };
    const incoming = { ...CUS4, creditLimitMinor: 12_000_000 };
    const { values, conflicts } = rebase(CUS4, mine, incoming);
    expect(values.creditLimit).toBe('120000.00');
    expect(conflicts).toEqual([]);
  });
});
