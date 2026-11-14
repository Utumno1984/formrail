// Customers of the demo company: B2B accounts (manufacturers, contractors, utilities, ...) with a
// nested billing address, a list of contacts with ids, commercial terms in the customer's currency
// and an account manager among the company's sales staff.
import type { StatusBadgeTone } from '../../status-badge/StatusBadge';
import { makeContacts, type DemoContact } from './contacts';
import { convertFromEurMinor, type DemoCurrency } from './currency';
import { createDataset, indexFromId } from './dataset';
import { daysAgo } from './dates';
import { pickAccountManagerId } from './employees';
import { DEMO_COUNTRIES, makeAddress, type DemoAddress, type DemoCountryCode } from './geo';
import { createCompanyNameSpace } from './organizations';
import { createRowRng, hashSeed } from './rng';
import type { DemoPaymentTerms } from './terms';

export type DemoCustomerStatus = 'active' | 'on-hold' | 'archived';

export type DemoIndustry =
  | 'manufacturing'
  | 'construction'
  | 'energy'
  | 'transport-equipment'
  | 'food-and-beverage'
  | 'chemicals-and-plastics'
  | 'logistics'
  | 'facility-services';

export interface DemoCustomer {
  /** Stable id, e.g. `cus-12`. */
  readonly id: string;
  /** Account number, e.g. `C-10012`. */
  readonly code: string;
  readonly name: string;
  readonly industry: DemoIndustry;
  readonly status: DemoCustomerStatus;
  readonly country: DemoCountryCode;
  readonly billingAddress: DemoAddress;
  /** One to four contacts; exactly one has `primary: true`. */
  readonly contacts: readonly DemoContact[];
  /** `https://www.<name>.example`. */
  readonly website: string;
  /** The currency the customer is invoiced in. */
  readonly currency: DemoCurrency;
  readonly paymentTerms: DemoPaymentTerms;
  /** Credit limit in minor units of `currency` (0 for customers who pay on receipt). */
  readonly creditLimitMinor: number;
  /** The group entity that serves the customer (`DEMO_LEGAL_ENTITIES`). */
  readonly entityId: string;
  /** A sales employee of `entityId` (see `DEMO_REFERENCE_POOL`); may have left the company. */
  readonly accountManagerId: string;
  /** ISO date the account was opened, before `DEMO_TODAY`. */
  readonly createdOn: string;
}

export const CUSTOMER_STATUS_LABEL: Readonly<Record<DemoCustomerStatus, string>> = Object.freeze({
  active: 'Active',
  'on-hold': 'On hold',
  archived: 'Archived',
});

export const CUSTOMER_STATUS_TONE: Readonly<Record<DemoCustomerStatus, StatusBadgeTone>> = Object.freeze({
  active: 'success',
  'on-hold': 'warning',
  archived: 'neutral',
});

export const INDUSTRY_LABEL: Readonly<Record<DemoIndustry, string>> = Object.freeze({
  manufacturing: 'Manufacturing',
  construction: 'Construction',
  energy: 'Energy & utilities',
  'transport-equipment': 'Transport equipment',
  'food-and-beverage': 'Food & beverage',
  'chemicals-and-plastics': 'Chemicals & plastics',
  logistics: 'Logistics',
  'facility-services': 'Facility services',
});

/** Trade words of customer names, with the industry each one implies. */
const CUSTOMER_TRADES: readonly (readonly [string, DemoIndustry])[] = [
  ['Engineering', 'manufacturing'],
  ['Machining', 'manufacturing'],
  ['Fabrication', 'manufacturing'],
  ['Precision Parts', 'manufacturing'],
  ['Tooling', 'manufacturing'],
  ['Components', 'manufacturing'],
  ['Construction', 'construction'],
  ['Builders', 'construction'],
  ['Civil Works', 'construction'],
  ['Steel Structures', 'construction'],
  ['Energy', 'energy'],
  ['Power Systems', 'energy'],
  ['Water Services', 'energy'],
  ['Wind Services', 'energy'],
  ['Automotive', 'transport-equipment'],
  ['Rail Systems', 'transport-equipment'],
  ['Marine Works', 'transport-equipment'],
  ['Foods', 'food-and-beverage'],
  ['Dairy', 'food-and-beverage'],
  ['Brewing', 'food-and-beverage'],
  ['Chemicals', 'chemicals-and-plastics'],
  ['Plastics', 'chemicals-and-plastics'],
  ['Coatings', 'chemicals-and-plastics'],
  ['Logistics', 'logistics'],
  ['Freight', 'logistics'],
  ['Facility Services', 'facility-services'],
  ['Maintenance', 'facility-services'],
];

const CONTACT_ROLES = ['Purchasing Manager', 'Plant Manager', 'Accounts Payable', 'Maintenance Lead', 'Operations Director', 'Buyer', 'Site Engineer'];

/** Credit limits in EUR (converted and rounded per currency). */
const CREDIT_LIMITS_EUR = [5_000, 10_000, 25_000, 50_000, 100_000, 250_000];

// Weight tables are module constants: a literal per row would allocate on every call.
const STATUS_WEIGHTS: readonly (readonly [DemoCustomerStatus, number])[] = [
  ['active', 80],
  ['on-hold', 12],
  ['archived', 8],
];
const TERMS_WEIGHTS: readonly (readonly [DemoPaymentTerms, number])[] = [
  ['due-on-receipt', 8],
  ['net-15', 12],
  ['net-30', 50],
  ['net-45', 15],
  ['net-60', 15],
];
const CONTACT_COUNTS: readonly (readonly [number, number])[] = [
  [1, 3],
  [2, 4],
  [3, 2],
  [4, 1],
];

const SEED = hashSeed('demo-data/customers');
const NAMES = createCompanyNameSpace('demo-data/customers/names', CUSTOMER_TRADES);

/** Number of rows with distinct customer names (later rows repeat names, never ids or codes). */
export const CUSTOMER_UNIQUE_NAMES = NAMES.size;

function makeCustomer(index: number): DemoCustomer {
  const rng = createRowRng(SEED, index);
  const id = `cus-${index + 1}`;
  const company = NAMES.name(index, rng);
  const country = DEMO_COUNTRIES[company.country];
  const billingAddress = makeAddress(rng, company.country);
  const status = rng.weighted(STATUS_WEIGHTS);
  const paymentTerms = rng.weighted(TERMS_WEIGHTS);
  const currency = country.currency;
  // Two significant digits in each currency: 25,000 EUR is $27,000, £21,000, ¥4,100,000.
  const creditLimitMinor =
    paymentTerms === 'due-on-receipt'
      ? 0
      : niceRound(convertFromEurMinor(rng.pick(CREDIT_LIMITS_EUR) * 100, currency));
  return Object.freeze({
    id,
    code: `C-${10001 + index}`,
    name: company.name,
    industry: company.sector,
    status,
    country: company.country,
    billingAddress,
    contacts: makeContacts(rng, id, company.domain, billingAddress, CONTACT_ROLES, CONTACT_COUNTS),
    website: company.website,
    currency,
    paymentTerms,
    creditLimitMinor,
    entityId: country.entityId,
    accountManagerId: pickAccountManagerId(rng, country.entityId),
    createdOn: daysAgo(rng.int(status === 'archived' ? 900 : 30, 4500)),
  });
}

/** Rounds a positive integer to two significant digits. */
function niceRound(value: number): number {
  if (value <= 0) return 0;
  const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(value)) - 1);
  return Math.round(value / magnitude) * magnitude;
}

const customers = createDataset('makeCustomers', makeCustomer);

/**
 * The first `n` customers, frozen and cached per `n`. Row `i` is the same for every `n`. Every
 * `accountManagerId` is among `makeEmployees(DEMO_REFERENCE_POOL.employees)`. Throws on a negative or
 * non-integer `n`.
 */
export const makeCustomers = (n: number): readonly DemoCustomer[] => customers.make(n);

/** The customer with this id (any row, generated on demand), or `undefined` for a malformed id. */
export function getCustomer(id: string): DemoCustomer | undefined {
  const index = indexFromId(id, 'cus-');
  return index < 0 ? undefined : customers.at(index);
}
