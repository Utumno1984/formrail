// @vitest-environment node
// Large-n checks collect every violation and assert once (one `expect` per row would dominate the run).
import { CURRENCY_MINOR_DIGITS } from './currency';
import { CUSTOMER_UNIQUE_NAMES, makeCustomers } from './customers';
import { DEMO_REFERENCE_POOL } from './dataset';
import { makeEmployees } from './employees';
import { DEMO_COUNTRIES, POSTAL_CODE_PATTERN } from './geo';
import { PAYMENT_TERMS_DAYS } from './terms';

const N = 10_000;
const pool = () => new Map(makeEmployees(DEMO_REFERENCE_POOL.employees).map((employee) => [employee.id, employee]));

describe('makeCustomers', () => {
  it('every accountManagerId is a sales employee of the serving entity, within the employee reference pool (n = 10,000)', () => {
    const employees = pool();
    const problems: string[] = [];
    for (const customer of makeCustomers(N)) {
      const manager = employees.get(customer.accountManagerId);
      if (!manager) problems.push(`${customer.id}: unknown ${customer.accountManagerId}`);
      else if (manager.department !== 'sales' || manager.entityId !== customer.entityId) problems.push(`${customer.id}: ${manager.id} ${manager.department} ${manager.entityId}`);
    }
    expect(problems).toEqual([]);
  });

  it('a single customer (n = 1) already resolves its account manager in makeEmployees(DEMO_REFERENCE_POOL.employees)', () => {
    const [customer] = makeCustomers(1);
    expect(pool().has(customer!.accountManagerId)).toBe(true);
  });

  it('some accounts are still owned by someone who left (the Combobox "value not in the options" case)', () => {
    const employees = pool();
    expect(makeCustomers(200).some((customer) => employees.get(customer.accountManagerId)!.status === 'inactive')).toBe(true);
  });

  it('nests a billing address whose postal code follows its country format (n = 10,000)', () => {
    const problems: string[] = [];
    for (const customer of makeCustomers(N)) {
      const address = customer.billingAddress;
      if (address.country !== customer.country) problems.push(`${customer.id}: country`);
      if (!POSTAL_CODE_PATTERN[address.country].test(address.postalCode)) problems.push(`${customer.id}: postal code ${address.postalCode} (${address.country})`);
      if (!DEMO_COUNTRIES[address.country].cities.some((city) => city.name === address.city)) problems.push(`${customer.id}: city ${address.city}`);
      if (address.line1 === '' || address.line2 === '') problems.push(`${customer.id}: empty line`);
    }
    expect(problems).toEqual([]);
  });

  it('has 1-4 contacts with globally unique ids, exactly one primary, distinct e-mails per customer', () => {
    const contactIds = new Set<string>();
    const counts = new Set<number>();
    const problems: string[] = [];
    for (const customer of makeCustomers(N)) {
      const { contacts } = customer;
      counts.add(contacts.length);
      if (contacts.length < 1 || contacts.length > 4) problems.push(`${customer.id}: ${contacts.length} contacts`);
      if (contacts.filter((contact) => contact.primary).length !== 1) problems.push(`${customer.id}: primary`);
      if (new Set(contacts.map((contact) => contact.email)).size !== contacts.length) problems.push(`${customer.id}: duplicate e-mail`);
      for (const contact of contacts) {
        if (!contact.id.startsWith(`${customer.id}-con-`) || contactIds.has(contact.id)) problems.push(`${customer.id}: contact id ${contact.id}`);
        contactIds.add(contact.id);
      }
    }
    expect(problems).toEqual([]);
    expect(counts).toEqual(new Set([1, 2, 3, 4]));
    // Single-contact customers among the first rows (removing the last contact must be refused, #523).
    expect(makeCustomers(20).some((customer) => customer.contacts.length === 1)).toBe(true);
  });

  it('bills in the currency of its country, with an integer credit limit in whole currency units', () => {
    const problems: string[] = [];
    for (const customer of makeCustomers(N)) {
      const country = DEMO_COUNTRIES[customer.country];
      const limit = customer.creditLimitMinor;
      if (customer.currency !== country.currency || customer.entityId !== country.entityId) problems.push(`${customer.id}: currency/entity`);
      if (PAYMENT_TERMS_DAYS[customer.paymentTerms] === undefined) problems.push(`${customer.id}: terms`);
      if (!Number.isSafeInteger(limit) || limit < 0) problems.push(`${customer.id}: limit ${limit}`);
      if ((customer.paymentTerms === 'due-on-receipt') !== (limit === 0)) problems.push(`${customer.id}: limit ${limit} with ${customer.paymentTerms}`);
      if (limit % 10 ** CURRENCY_MINOR_DIGITS[customer.currency] !== 0) problems.push(`${customer.id}: stray minor units ${limit}`);
    }
    expect(problems).toEqual([]);
  });

  it('includes every currency, a zero credit limit and yen customers among the first 200', () => {
    const customers = makeCustomers(200);
    expect(new Set(customers.map((customer) => customer.currency))).toEqual(new Set(['EUR', 'USD', 'GBP', 'JPY']));
    expect(customers.some((customer) => customer.creditLimitMinor === 0)).toBe(true);
  });

  it('has distinct names and web sites for the first CUSTOMER_UNIQUE_NAMES rows, at least the reference pool', () => {
    expect(CUSTOMER_UNIQUE_NAMES).toBeGreaterThanOrEqual(DEMO_REFERENCE_POOL.customers);
    const customers = makeCustomers(CUSTOMER_UNIQUE_NAMES);
    expect(new Set(customers.map((customer) => customer.name)).size).toBe(customers.length);
    expect(new Set(customers.map((customer) => customer.website)).size).toBe(customers.length);
  });

  it('never repeats a name root within the first 50 rows (what a showcase list shows)', () => {
    const roots = makeCustomers(50).map((customer) => customer.name.split(' ')[0]);
    expect(roots.filter((root, index) => roots.indexOf(root) !== index)).toEqual([]);
  });

  it('the account manager is at manager level or below (depth >= 2: never the CEO nor a department head)', () => {
    const employees = new Map(makeEmployees(DEMO_REFERENCE_POOL.employees).map((employee) => [employee.id, employee]));
    const problems = makeCustomers(10_000)
      .map((row) => employees.get(row.accountManagerId)!)
      .filter((employee) => employee.managerId === null || employee.managerId === 'emp-1')
      .map((employee) => `${employee.id} ${employee.title}`);
    expect(problems).toEqual([]);
  });
});
