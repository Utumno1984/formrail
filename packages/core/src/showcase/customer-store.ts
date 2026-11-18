// Story-only (#523): the in-memory "server" of the Customers module of the record-editing shell: the demo customers
// (`internal/demo-data`) as a customer master record: a nested billing address, a list of contacts with ids, commercial
// terms in the customer's currency and an account manager. Money is an integer amount of minor units next to the
// customer's currency, as in the demo data; the form turns it into text. Not exported by the package.
import {
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
  /** The currency the customer is invoiced in: the credit limit is in it. */
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
