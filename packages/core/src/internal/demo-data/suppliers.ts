// Suppliers of the demo company: manufacturers of the product categories it distributes, each with
// a postal address, contacts with ids, payment terms in its own currency and a buyer in procurement.
import type { StatusBadgeTone } from '../../status-badge/StatusBadge';
import type { DemoProductCategory } from './catalog';
import { makeContacts, type DemoContact } from './contacts';
import type { DemoCurrency } from './currency';
import { createDataset, DEMO_REFERENCE_POOL, indexFromId } from './dataset';
import { daysAgo } from './dates';
import { pickBuyerId } from './employees';
import { makeAddress, type DemoAddress, type DemoCountryCode } from './geo';
import { createCompanyNameSpace } from './organizations';
import { createRowRng, hashSeed, type Rng } from './rng';
import type { DemoPaymentTerms } from './terms';

/** `onboarding`: being qualified, no purchase orders yet; `blocked`: no new purchase orders. */
export type DemoSupplierStatus = 'active' | 'onboarding' | 'blocked';

export interface DemoSupplier {
  /** Stable id, e.g. `sup-7`. */
  readonly id: string;
  /** Vendor number, e.g. `V-20007`. */
  readonly code: string;
  readonly name: string;
  /** The product category the supplier makes (products of that category may name it as supplier). */
  readonly category: DemoProductCategory;
  readonly status: DemoSupplierStatus;
  readonly country: DemoCountryCode;
  readonly address: DemoAddress;
  /** One to three contacts; exactly one has `primary: true`. */
  readonly contacts: readonly DemoContact[];
  readonly website: string;
  /** The currency the supplier invoices in. */
  readonly currency: DemoCurrency;
  readonly paymentTerms: DemoPaymentTerms;
  /** Days from purchase order to delivery. */
  readonly leadTimeDays: number;
  /** The procurement employee who manages the supplier (see `DEMO_REFERENCE_POOL`). */
  readonly buyerId: string;
  /** ISO date the supplier was registered, before `DEMO_TODAY`. */
  readonly createdOn: string;
}

export const SUPPLIER_STATUS_LABEL: Readonly<Record<DemoSupplierStatus, string>> = Object.freeze({
  active: 'Active',
  onboarding: 'Onboarding',
  blocked: 'Blocked',
});

export const SUPPLIER_STATUS_TONE: Readonly<Record<DemoSupplierStatus, StatusBadgeTone>> = Object.freeze({
  active: 'success',
  onboarding: 'info',
  blocked: 'error',
});

/** Trade words of supplier names (disjoint from the customer ones), with the category they make. */
const SUPPLIER_TRADES: readonly (readonly [string, DemoProductCategory])[] = [
  ['Fasteners', 'fasteners'],
  ['Screw Works', 'fasteners'],
  ['Bearings', 'bearings'],
  ['Motion Parts', 'bearings'],
  ['Drive Systems', 'power-transmission'],
  ['Transmission', 'power-transmission'],
  ['Hydraulics', 'hydraulics'],
  ['Fluid Power', 'hydraulics'],
  ['Pneumatics', 'pneumatics'],
  ['Air Systems', 'pneumatics'],
  ['Electrical', 'electrical'],
  ['Cable Works', 'electrical'],
  ['Tool Works', 'hand-tools'],
  ['Hand Tools', 'hand-tools'],
  ['Power Tools', 'power-tools'],
  ['Abrasives', 'abrasives'],
  ['Grinding Products', 'abrasives'],
  ['Safety', 'safety'],
  ['Protective Wear', 'safety'],
  ['Lubricants', 'lubricants'],
  ['Oil Works', 'lubricants'],
  ['Adhesives', 'adhesives'],
  ['Sealants', 'adhesives'],
  ['Handling Systems', 'material-handling'],
  ['Storage Systems', 'material-handling'],
];

const CONTACT_ROLES = ['Key Account Manager', 'Sales Representative', 'Customer Service', 'Accounts Receivable', 'Quality Manager'];

// Weight tables are module constants: a literal per row would allocate on every call.
const STATUS_WEIGHTS: readonly (readonly [DemoSupplierStatus, number])[] = [
  ['active', 84],
  ['onboarding', 8],
  ['blocked', 8],
];
const TERMS_WEIGHTS: readonly (readonly [DemoPaymentTerms, number])[] = [
  ['net-30', 50],
  ['net-45', 20],
  ['net-60', 30],
];
const CONTACT_COUNTS: readonly (readonly [number, number])[] = [
  [1, 4],
  [2, 4],
  [3, 2],
];

const SEED = hashSeed('demo-data/suppliers');
const NAMES = createCompanyNameSpace('demo-data/suppliers/names', SUPPLIER_TRADES);

/** Number of rows with distinct supplier names (later rows repeat names, never ids or codes). */
export const SUPPLIER_UNIQUE_NAMES = NAMES.size;

function makeSupplier(index: number): DemoSupplier {
  const rng = createRowRng(SEED, index);
  const id = `sup-${index + 1}`;
  const company = NAMES.name(index, rng);
  const country = company.countryInfo;
  const address = makeAddress(rng, country);
  return Object.freeze({
    id,
    code: `V-${20001 + index}`,
    name: company.name,
    category: company.sector,
    status: rng.weighted(STATUS_WEIGHTS),
    country: company.country,
    address,
    contacts: makeContacts(rng, id, company.domain, address, country.area, CONTACT_ROLES, CONTACT_COUNTS),
    website: company.website,
    currency: country.currency,
    paymentTerms: rng.weighted(TERMS_WEIGHTS),
    leadTimeDays: company.country === 'JP' || company.country === 'US' ? rng.int(14, 42) : rng.int(3, 21),
    buyerId: pickBuyerId(rng),
    createdOn: daysAgo(rng.int(30, 5000)),
  });
}

const suppliers = createDataset('makeSuppliers', makeSupplier);

/**
 * The first `n` suppliers, frozen and cached per `n`. Row `i` is the same for every `n`. Every
 * `buyerId` is among `makeEmployees(DEMO_REFERENCE_POOL.employees)`. Throws on a negative or
 * non-integer `n`.
 */
export const makeSuppliers = (n: number): readonly DemoSupplier[] => suppliers.make(n);

/** The supplier with this id (any row, generated on demand), or `undefined` for a malformed id. */
export function getSupplier(id: string): DemoSupplier | undefined {
  const index = indexFromId(id, 'sup-');
  return index < 0 ? undefined : suppliers.at(index);
}

let byCategory: Map<DemoProductCategory, number[]> | undefined;

/** A supplier of `category` among the first `DEMO_REFERENCE_POOL.suppliers` suppliers. */
export function pickSupplierId(rng: Rng, category: DemoProductCategory): string {
  if (!byCategory) {
    byCategory = new Map();
    for (let i = 0; i < DEMO_REFERENCE_POOL.suppliers; i++) {
      const supplier = suppliers.at(i);
      const list = byCategory.get(supplier.category) ?? [];
      list.push(i);
      byCategory.set(supplier.category, list);
    }
  }
  const candidates = byCategory.get(category);
  if (!candidates) throw new Error(`No supplier of ${category} in the reference pool`);
  return `sup-${rng.pick(candidates) + 1}`;
}
