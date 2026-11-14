// Products of the demo company: catalogue items with a list price and a unit cost in every group
// currency (integer minor units), stock levels per warehouse and a preferred supplier of the same
// category.
import type { StatusBadgeTone } from '../../status-badge/StatusBadge';
import { CATALOG_SIZE, catalogItem, PRODUCT_CATEGORY_CODE, type DemoProductCategory, type DemoProductUnit } from './catalog';
import { DEMO_COMPANY } from './company';
import { convertFromEurMinor, DEMO_CURRENCIES, type DemoCurrency } from './currency';
import { createDataset, indexFromId } from './dataset';
import { daysAgo } from './dates';
import { createPermutation, createRowRng, hashSeed, type Rng } from './rng';
import { pickSupplierId } from './suppliers';

export type DemoProductStatus = 'active' | 'discontinued' | 'draft';

/** On-hand stock of a product in one warehouse. */
export interface DemoStockLevel {
  /** A warehouse of `DEMO_COMPANY.warehouses`. */
  readonly warehouseId: string;
  readonly onHand: number;
  /** Units promised to open orders (`0 <= reserved <= onHand`). */
  readonly reserved: number;
}

/** An amount per group currency, in minor units of each one (yen have none). */
export type DemoPrices = Readonly<Record<DemoCurrency, number>>;

export interface DemoProduct {
  /** Stable id, e.g. `prd-42`. */
  readonly id: string;
  /** Stock-keeping unit: category code and number, e.g. `FAS-10042`. */
  readonly sku: string;
  readonly name: string;
  readonly category: DemoProductCategory;
  readonly unit: DemoProductUnit;
  readonly status: DemoProductStatus;
  /** List price per unit in each currency, minor units. */
  readonly listPriceMinor: DemoPrices;
  /** Purchase cost per unit in each currency, minor units (always below the list price). */
  readonly unitCostMinor: DemoPrices;
  /** One entry per warehouse that stocks the product (none for a `draft`). */
  readonly stock: readonly DemoStockLevel[];
  /** Below this on-hand quantity (per warehouse) the item should be reordered. */
  readonly reorderPoint: number;
  /** Preferred supplier, of the same category (see `DEMO_REFERENCE_POOL`). */
  readonly supplierId: string;
  /** ISO date the product was created, before `DEMO_TODAY`. */
  readonly createdOn: string;
}

export const PRODUCT_STATUS_LABEL: Readonly<Record<DemoProductStatus, string>> = Object.freeze({
  active: 'Active',
  discontinued: 'Discontinued',
  draft: 'Draft',
});

export const PRODUCT_STATUS_TONE: Readonly<Record<DemoProductStatus, StatusBadgeTone>> = Object.freeze({
  active: 'success',
  discontinued: 'neutral',
  draft: 'info',
});

const STATUS_WEIGHTS: readonly (readonly [DemoProductStatus, number])[] = [
  ['active', 85],
  ['discontinued', 10],
  ['draft', 5],
];
const REORDER_POINTS = [5, 10, 20, 25, 50, 100];

const SEED = hashSeed('demo-data/products');
const SLOTS = createPermutation(CATALOG_SIZE, 'demo-data/products/catalog');

/**
 * Number of rows with distinct product names. Later rows repeat a catalogue item under another SKU
 * (the same item sourced again), as a distributor's catalogue does.
 */
export const PRODUCT_UNIQUE_NAMES = CATALOG_SIZE;

/** Rounding step in minor units: 5 cents / pence, 10 yen. */
const PRICE_STEP: Readonly<Record<DemoCurrency, number>> = { EUR: 5, USD: 5, GBP: 5, JPY: 10 };

function prices(eurMinor: number): DemoPrices {
  const out = {} as Record<DemoCurrency, number>;
  for (const currency of DEMO_CURRENCIES) out[currency] = Math.max(PRICE_STEP[currency], convertFromEurMinor(eurMinor, currency, PRICE_STEP[currency]));
  return Object.freeze(out);
}

function stockLevels(rng: Rng, status: DemoProductStatus, reorderPoint: number): readonly DemoStockLevel[] {
  if (status === 'draft') return Object.freeze([]);
  const levels: DemoStockLevel[] = [];
  for (const warehouse of DEMO_COMPANY.warehouses) {
    // The headquarters' distribution center stocks almost everything, the others a selection.
    if (!rng.chance(warehouse.entityId === DEMO_COMPANY.headquarters.id ? 0.95 : 0.55)) continue;
    const onHand =
      status === 'discontinued'
        ? rng.int(0, reorderPoint)
        : rng.chance(0.08)
          ? 0
          : rng.int(1, reorderPoint * 8);
    levels.push(Object.freeze({ warehouseId: warehouse.id, onHand, reserved: onHand === 0 ? 0 : rng.int(0, Math.floor(onHand / 3)) }));
  }
  return Object.freeze(levels);
}

function makeProduct(index: number): DemoProduct {
  const rng = createRowRng(SEED, index);
  const item = catalogItem(SLOTS(index));
  const status = rng.weighted(STATUS_WEIGHTS);
  // +/- 12% around the catalogue price; the cost is 55-75% of the list price.
  const listEur = Math.round(item.basePriceEurMinor * (0.88 + rng.next() * 0.24));
  const costEur = Math.round(listEur * (0.55 + rng.next() * 0.2));
  const reorderPoint = rng.pick(REORDER_POINTS);
  return Object.freeze({
    id: `prd-${index + 1}`,
    sku: `${PRODUCT_CATEGORY_CODE[item.category]}-${10001 + index}`,
    name: item.name,
    category: item.category,
    unit: item.unit,
    status,
    listPriceMinor: prices(listEur),
    unitCostMinor: prices(costEur),
    stock: stockLevels(rng, status, reorderPoint),
    reorderPoint,
    supplierId: pickSupplierId(rng, item.category),
    createdOn: daysAgo(status === 'draft' ? rng.int(1, 60) : rng.int(60, 3000)),
  });
}

const products = createDataset('makeProducts', makeProduct);

/**
 * The first `n` products, frozen and cached per `n`. Row `i` is the same for every `n`. Every
 * `supplierId` is among `makeSuppliers(DEMO_REFERENCE_POOL.suppliers)`. Throws on a negative or
 * non-integer `n`.
 */
export const makeProducts = (n: number): readonly DemoProduct[] => products.make(n);

/** The product with this id (any row, generated on demand), or `undefined` for a malformed id. */
export function getProduct(id: string): DemoProduct | undefined {
  const index = indexFromId(id, 'prd-');
  return index < 0 ? undefined : products.at(index);
}
