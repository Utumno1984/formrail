// @vitest-environment node
import { CATALOG_SIZE, catalogItem, PRODUCT_CATEGORY_CODE } from './catalog';
import { DEMO_COMPANY } from './company';
import { DEMO_CURRENCIES } from './currency';
import { DEMO_REFERENCE_POOL } from './dataset';
import { makeProducts, PRODUCT_UNIQUE_NAMES } from './products';
import { makeSuppliers } from './suppliers';

describe('makeProducts', () => {
  it('the first 200 rows of makeProducts(200) and makeProducts(100000) coincide', () => {
    expect(makeProducts(100_000).slice(0, 200)).toEqual(makeProducts(200));
  });

  it('prices every currency in integer minor units (yen in tens), the cost below the list price', () => {
    const currencies = [...DEMO_CURRENCIES].sort().join();
    const problems: string[] = [];
    for (const product of makeProducts(10_000)) {
      if (Object.keys(product.listPriceMinor).sort().join() !== currencies) problems.push(`${product.id}: currencies`);
      if (Object.keys(product.unitCostMinor).sort().join() !== currencies) problems.push(`${product.id}: cost currencies`);
      for (const currency of DEMO_CURRENCIES) {
        const list = product.listPriceMinor[currency];
        const cost = product.unitCostMinor[currency];
        if (!Number.isSafeInteger(list) || !Number.isSafeInteger(cost) || cost <= 0 || cost >= list) problems.push(`${product.id}: ${currency} ${cost}/${list}`);
      }
      if (product.listPriceMinor.JPY % 10 !== 0) problems.push(`${product.id}: yen ${product.listPriceMinor.JPY}`);
    }
    expect(problems).toEqual([]);
  });

  it('keeps stock per warehouse: known warehouse ids, no duplicates, 0 <= reserved <= onHand, none for a draft', () => {
    const warehouses = new Set(DEMO_COMPANY.warehouses.map((warehouse) => warehouse.id));
    let outOfStock = 0;
    const problems: string[] = [];
    for (const product of makeProducts(10_000)) {
      const ids = product.stock.map((level) => level.warehouseId);
      if (new Set(ids).size !== ids.length) problems.push(`${product.id}: duplicate warehouse`);
      for (const level of product.stock) {
        if (!warehouses.has(level.warehouseId)) problems.push(`${product.id}: warehouse ${level.warehouseId}`);
        if (!Number.isInteger(level.onHand) || level.reserved < 0 || level.reserved > level.onHand) problems.push(`${product.id}: ${level.reserved}/${level.onHand}`);
        if (level.onHand === 0) outOfStock++;
      }
      if (product.status === 'draft' && product.stock.length > 0) problems.push(`${product.id}: draft with stock`);
    }
    expect(problems).toEqual([]);
    expect(outOfStock).toBeGreaterThan(0);
  });

  // Note BASSA of the #513 review: the mutation `int(0, reorderPoint)` -> `int(1, ...)` for discontinued
  // products survived, because no golden showed a discontinued product out of stock. These counts do.
  it('golden: stock levels of the first 1,000 products, by status, in stock or at zero', () => {
    const counts: Record<string, number> = {};
    for (const product of makeProducts(1000)) {
      for (const level of product.stock) {
        const key = `${product.status}:${level.onHand === 0 ? 'zero' : 'in stock'}`;
        counts[key] = (counts[key] ?? 0) + 1;
      }
    }
    expect(counts).toEqual({ 'active:in stock': 2455, 'active:zero': 211, 'discontinued:in stock': 296, 'discontinued:zero': 25 });
  });

  it('names a preferred supplier of the same category within the supplier reference pool (n = 10,000)', () => {
    const suppliers = new Map(makeSuppliers(DEMO_REFERENCE_POOL.suppliers).map((supplier) => [supplier.id, supplier]));
    const problems = makeProducts(10_000)
      .filter((product) => suppliers.get(product.supplierId)?.category !== product.category)
      .map((product) => `${product.id} -> ${product.supplierId}`);
    expect(problems).toEqual([]);
  });

  it('has distinct names for the first PRODUCT_UNIQUE_NAMES rows; the catalogue has no duplicate item', () => {
    expect(PRODUCT_UNIQUE_NAMES).toBe(CATALOG_SIZE);
    // A product picker over the reference pool never shows two items with the same name.
    expect(PRODUCT_UNIQUE_NAMES).toBeGreaterThanOrEqual(DEMO_REFERENCE_POOL.products);
    const catalog = Array.from({ length: CATALOG_SIZE }, (_, slot) => catalogItem(slot).name);
    expect(new Set(catalog).size).toBe(CATALOG_SIZE);
    const names = makeProducts(PRODUCT_UNIQUE_NAMES).map((product) => product.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('has a SKU prefixed by its category code', () => {
    for (const product of makeProducts(500)) expect(product.sku).toMatch(new RegExp(`^${PRODUCT_CATEGORY_CODE[product.category]}-\\d{5,}$`));
    expect(new Set(makeProducts(500).map((product) => product.category)).size).toBeGreaterThanOrEqual(10);
  });
});
