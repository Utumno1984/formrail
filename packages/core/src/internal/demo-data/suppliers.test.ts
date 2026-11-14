// @vitest-environment node
// Large-n checks collect every violation and assert once (one `expect` per row would dominate the run).
import { PRODUCT_CATEGORIES } from './catalog';
import { DEMO_REFERENCE_POOL } from './dataset';
import { makeEmployees } from './employees';
import { DEMO_COUNTRIES, POSTAL_CODE_PATTERN } from './geo';
import { makeSuppliers, SUPPLIER_UNIQUE_NAMES } from './suppliers';

describe('makeSuppliers', () => {
  it('every buyerId is a procurement employee within the employee reference pool (n = 10,000)', () => {
    const employees = new Map(makeEmployees(DEMO_REFERENCE_POOL.employees).map((employee) => [employee.id, employee]));
    const problems = makeSuppliers(10_000)
      .filter((supplier) => employees.get(supplier.buyerId)?.department !== 'procurement')
      .map((supplier) => `${supplier.id} -> ${supplier.buyerId}`);
    expect(problems).toEqual([]);
  });

  it('covers every product category within the supplier reference pool', () => {
    const categories = new Set(makeSuppliers(DEMO_REFERENCE_POOL.suppliers).map((supplier) => supplier.category));
    expect(categories).toEqual(new Set(PRODUCT_CATEGORIES));
  });

  it('has an address in its country format, 1-3 contacts with one primary, the currency of its country', () => {
    const contactIds = new Set<string>();
    const problems: string[] = [];
    for (const supplier of makeSuppliers(10_000)) {
      const { address, contacts } = supplier;
      if (address.country !== supplier.country || !POSTAL_CODE_PATTERN[supplier.country].test(address.postalCode)) problems.push(`${supplier.id}: address`);
      if (supplier.currency !== DEMO_COUNTRIES[supplier.country].currency) problems.push(`${supplier.id}: currency`);
      if (contacts.length < 1 || contacts.length > 3) problems.push(`${supplier.id}: ${contacts.length} contacts`);
      if (contacts.filter((contact) => contact.primary).length !== 1) problems.push(`${supplier.id}: primary`);
      for (const contact of contacts) {
        if (contactIds.has(contact.id)) problems.push(`${supplier.id}: duplicate contact id ${contact.id}`);
        contactIds.add(contact.id);
      }
      if (!Number.isInteger(supplier.leadTimeDays) || supplier.leadTimeDays <= 0) problems.push(`${supplier.id}: lead time`);
    }
    expect(problems).toEqual([]);
  });

  it('has distinct names and web sites for the first SUPPLIER_UNIQUE_NAMES rows', () => {
    expect(SUPPLIER_UNIQUE_NAMES).toBeGreaterThanOrEqual(DEMO_REFERENCE_POOL.suppliers);
    const suppliers = makeSuppliers(SUPPLIER_UNIQUE_NAMES);
    expect(new Set(suppliers.map((supplier) => supplier.name)).size).toBe(suppliers.length);
    expect(new Set(suppliers.map((supplier) => supplier.website)).size).toBe(suppliers.length);
  });

  it('never repeats a name root within the first 50 rows (what a showcase list shows)', () => {
    const roots = makeSuppliers(50).map((supplier) => supplier.name.split(' ')[0]);
    expect(roots.filter((root, index) => roots.indexOf(root) !== index)).toEqual([]);
  });

  it('the buyer is at manager level or below (depth >= 2: never the CEO nor a department head)', () => {
    const employees = new Map(makeEmployees(DEMO_REFERENCE_POOL.employees).map((employee) => [employee.id, employee]));
    const problems = makeSuppliers(10_000)
      .map((row) => employees.get(row.buyerId)!)
      .filter((employee) => employee.managerId === null || employee.managerId === 'emp-1')
      .map((employee) => `${employee.id} ${employee.title}`);
    expect(problems).toEqual([]);
  });
});
