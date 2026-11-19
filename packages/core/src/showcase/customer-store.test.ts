import { describe, expect, it } from 'vitest';
import { getCustomer, getEmployee, makeCustomers } from '../internal/demo-data';
import { createCustomerStore, makeCustomersReferencedBy, makeShowcaseCustomers } from './customer-store';
import { makeShowcaseSalesOrders } from './sales-order-store';

describe('the customer store (#523)', () => {
  it('seeds 200 customers of the demo universe, each with one primary contact and its billing country as country', () => {
    const customers = makeShowcaseCustomers();
    expect(customers).toHaveLength(200);
    expect(new Set(customers.map((c) => c.id)).size).toBe(200);
    for (const customer of customers) {
      expect(customer.contacts.length).toBeGreaterThanOrEqual(1);
      expect(customer.contacts.filter((c) => c.primary)).toHaveLength(1);
      expect(customer.country).toBe(customer.billingAddress.country);
      expect(getEmployee(customer.accountManagerId)).toBeDefined();
    }
  });

  it('a stored customer is the demo customer, contact by contact (the full name becomes the contact name)', () => {
    const demo = makeCustomers(4)[3]!;
    const stored = makeShowcaseCustomers(4)[3]!;
    expect(stored).toMatchObject({ id: demo.id, code: demo.code, name: demo.name, status: demo.status, currency: demo.currency });
    expect(stored.billingAddress).toEqual(demo.billingAddress);
    expect(stored.contacts).toEqual(
      demo.contacts.map((c) => ({ id: c.id, name: c.fullName, role: c.role, email: c.email, phone: c.phone, primary: c.primary })),
    );
    expect(stored.creditLimitMinor).toBe(demo.creditLimitMinor);
    expect(stored.accountManagerId).toBe(demo.accountManagerId);
  });

  it('the seed has the special customers the showcase relies on', () => {
    const by = (id: string) => makeShowcaseCustomers().find((c) => c.id === id)!;
    expect(by('cus-1').contacts).toHaveLength(1);
    expect(by('cus-4').contacts).toHaveLength(2);
    expect(by('cus-6').currency).toBe('JPY');
    expect(by('cus-9').status).toBe('active');
    expect(getEmployee(by('cus-9').accountManagerId)!.status).toBe('inactive');
    expect(by('cus-11').status).toBe('archived');
    expect(by('cus-17').status).toBe('on-hold');
    expect(by('cus-34').contacts).toHaveLength(4);
  });

  it('a save derives the country from the billing address, whatever country the client sent', async () => {
    const store = createCustomerStore();
    const customer = await store.get('cus-4');
    const saved = await store.save({ ...customer, country: 'JP', billingAddress: { ...customer.billingAddress, country: 'DE', postalCode: '10115' } });
    expect(saved.country).toBe('DE');
    expect((await store.get('cus-4')).country).toBe('DE');
  });

  it('a stored customer cannot be changed from outside: the address and the contacts are copied in and out', async () => {
    const store = createCustomerStore();
    const first = await store.get('cus-4');
    first.billingAddress.city = 'Elsewhere';
    first.contacts[0]!.email = 'changed@company.example';
    const again = await store.get('cus-4');
    expect(again.billingAddress.city).not.toBe('Elsewhere');
    expect(again.contacts[0]!.email).not.toBe('changed@company.example');
    const sent = { ...again, contacts: again.contacts.map((c) => ({ ...c })) };
    await store.save(sent);
    sent.contacts[0]!.name = 'Changed after the save';
    expect((await store.get('cus-4')).contacts[0]!.name).not.toBe('Changed after the save');
  });

  it('a failed save leaves the store unchanged; an unknown id is "not found" in the words of the module', async () => {
    const failing = createCustomerStore(undefined, { saveOutcome: 'error' });
    const customer = await failing.get('cus-4');
    await expect(failing.save({ ...customer, name: 'x' })).rejects.toThrow(/Could not save the customer/);
    expect((await failing.get('cus-4')).name).toBe(customer.name);
    await expect(createCustomerStore().get('cus-9999')).rejects.toThrow('Customer "cus-9999" not found');
  });
});

describe('the customers of the app: the seed and those the orders name (#525)', () => {
  const idNumber = (id: string) => Number(id.slice('cus-'.length));

  it('is in the order of the customer number, not the order the ids were named in (nor the order of the strings)', () => {
    const ids = makeCustomersReferencedBy(['cus-950', 'cus-1000', 'cus-205'], 200).map((c) => c.id);
    expect(ids).toHaveLength(203);
    // Named 950, 1000, 205: by number 205 < 950 < 1000 (as strings "1000" < "205" < "950").
    expect(ids.slice(-3)).toEqual(['cus-205', 'cus-950', 'cus-1000']);
    expect(ids).toEqual([...ids].sort((a, b) => idNumber(a) - idNumber(b)));
    expect(ids.slice(0, 200)).toEqual(makeShowcaseCustomers(200).map((c) => c.id));
  });

  it('every customer an order names is there, once, with the name the order shows', () => {
    const orders = makeShowcaseSalesOrders();
    const customers = makeCustomersReferencedBy(orders.map((o) => o.customerId));
    const byId = new Map(customers.map((c) => [c.id, c]));
    expect(byId.size).toBe(customers.length);
    for (const order of orders) {
      const customer = byId.get(order.customerId);
      expect(customer, order.customerId).toBeDefined();
      expect(customer!.name).toBe(order.customerName);
      expect(customer!.name).toBe(getCustomer(order.customerId)!.name);
    }
    // The seed and the named ones, nothing else.
    const named = new Set(orders.map((o) => o.customerId));
    for (const c of customers) expect(idNumber(c.id) <= 200 || named.has(c.id), c.id).toBe(true);
  });

  it('an id that is not a demo customer is left out; one already in the seed is not added twice, nor replaced', () => {
    const seed = makeShowcaseCustomers(200);
    const customers = makeCustomersReferencedBy(['nope', 'cus-', 'cus-abc', 'cus-0', 'cus-007', 'cus--4', 'inv-4', 'cus-4', 'cus-4', 'cus-200'], 200);
    expect(customers).toHaveLength(200);
    expect(customers.map((c) => c.id)).toEqual(seed.map((c) => c.id));
    expect(customers.find((c) => c.id === 'cus-4')).toEqual(seed.find((c) => c.id === 'cus-4'));
  });
});
