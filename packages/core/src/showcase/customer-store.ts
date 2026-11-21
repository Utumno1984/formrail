// Story-only (#523): the in-memory "server" of the Customers module of the record-editing shell: the demo customers
// (`internal/demo-data`) as a customer master record: a nested billing address, a list of contacts with ids, commercial
// terms in the customer's currency and an account manager. Money is an integer amount of minor units next to the
// customer's currency, as in the demo data; the form turns it into text. Not exported by the package.
import {
  getCustomer,
  makeCustomers,
  type DemoCountryCode,
  type DemoCurrency,
  type DemoCustomer,
  type DemoCustomerStatus,
  type DemoIndustry,
  type DemoPaymentTerms,
} from '../internal/demo-data';
import { createRecordStore, type RecordStore, type RecordStoreConfig } from './record-store';

/** A postal address. `line2` and `region` are `null` when absent, never `''` (the demo data's rule). */
export interface StoredAddress {
  line1: string;
  line2: string | null;
  postalCode: string;
  city: string;
  region: string | null;
  country: DemoCountryCode;
}

/** One contact person. The id is the contact's identity: assigned by whoever creates the contact and kept as it is. */
export interface StoredContact {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  /** Exactly one contact of a stored customer is the primary one. */
  primary: boolean;
}

export interface StoredCustomer {
  id: string;
  /** Account number (`C-10012`), assigned by the system. */
  code: string;
  name: string;
  industry: DemoIndustry;
  status: DemoCustomerStatus;
  /** The account's country: the billing address' country, derived by the server on every write (see `normalize`). */
  country: DemoCountryCode;
  billingAddress: StoredAddress;
  /** In display order. */
  contacts: StoredContact[];
  /** Carried, not edited by the showcase. */
  website: string;
  /** The currency the customer is billed in: the credit limit is in it. */
  currency: DemoCurrency;
  paymentTerms: DemoPaymentTerms;
  /** Minor units of `currency`. */
  creditLimitMinor: number;
  /** A sales employee (`getEmployee`); may have left the company. */
  accountManagerId: string;
}

export type CustomerStoreConfig = RecordStoreConfig;
export type CustomerStore = RecordStore<StoredCustomer, never>;

const fromDemo = (c: DemoCustomer): StoredCustomer => ({
  id: c.id,
  code: c.code,
  name: c.name,
  industry: c.industry,
  status: c.status,
  country: c.country,
  billingAddress: { ...c.billingAddress },
  contacts: c.contacts.map((p) => ({ id: p.id, name: p.fullName, role: p.role, email: p.email, phone: p.phone, primary: p.primary })),
  website: c.website,
  currency: c.currency,
  paymentTerms: c.paymentTerms,
  creditLimitMinor: c.creditLimitMinor,
  accountManagerId: c.accountManagerId,
});

/** The seed: the first `count` demo customers (200: the list of the showcase). */
export const makeShowcaseCustomers = (count = 200): StoredCustomer[] => makeCustomers(count).map(fromDemo);

/**
 * #525: the seed of the customers of the app: the first `count` demo customers AND the customers `referencedIds` name
 * (the customers of the orders: an order's link to its customer must open that customer, and the orders' customers
 * come from a pool of 1,000), in the order of their number. An id that is not a demo customer is left out.
 */
export const makeCustomersReferencedBy = (referencedIds: Iterable<string>, count = 200): StoredCustomer[] => {
  const seed = new Map(makeShowcaseCustomers(count).map((c) => [c.id, c]));
  for (const id of referencedIds) {
    const demo = seed.has(id) ? undefined : getCustomer(id);
    if (demo) seed.set(demo.id, fromDemo(demo));
  }
  return [...seed.values()].sort((a, b) => Number(a.id.slice('cus-'.length)) - Number(b.id.slice('cus-'.length)));
};

/**
 * The "server" of the Customers module. Every write derives the account's country from the billing address, so the
 * two never disagree. No creation: the module has none (customers are archived and restored, not created or deleted).
 */
export function createCustomerStore(
  seed: readonly StoredCustomer[] = makeShowcaseCustomers(),
  initial: Partial<CustomerStoreConfig> = {},
): CustomerStore {
  return createRecordStore<StoredCustomer, never>(
    seed,
    {
      createId: (sequence) => `cus-new-${sequence}`,
      normalize: (customer) => ({ ...customer, country: customer.billingAddress.country }),
      copy: (customer) => ({
        ...customer,
        billingAddress: { ...customer.billingAddress },
        contacts: customer.contacts.map((c) => ({ ...c })),
      }),
      noun: { one: 'customer', many: 'customers' },
    },
    initial,
  );
}
