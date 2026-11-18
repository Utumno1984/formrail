// Story-only (#523): the customer record as the form sees it (text as typed) and the rules on it: the conversion to and
// from the stored customer, the comparison that decides "dirty", the validation (with errors on nested paths:
// `billingAddress.postalCode`, `contacts.1.email`) and the identity of a new contact. Pure functions, no React. Not
// exported by the package.
import {
  COUNTRY_NAME,
  CURRENCY_MINOR_DIGITS,
  POSTAL_CODE_PATTERN,
  type DemoCountryCode,
  type DemoCurrency,
  type DemoCustomerStatus,
  type DemoIndustry,
  type DemoPaymentTerms,
} from '../../../internal/demo-data';
import type { StoredAddress, StoredContact, StoredCustomer } from '../../customer-store';
import { minorToText, sameAmount, textToMinor } from '../sales-orders/order-lines';

/**
 * The billing address in the form. Every part is text as typed: the stored `null` of an absent `line2`/`region` is
 * `''` here (what an `Input` shows and what it emits when emptied), and `''` goes back to `null` on save. That one
 * conversion happens at the boundary (`toValues`/`toCustomer`), never in the form, so a field emptied by the user and a
 * field that was never filled are the same value and the form is not dirty for it (spec §1.13.1, "build the baseline
 * with the representation the control emits").
 */
export interface AddressValues {
  line1: string;
  line2: string;
  postalCode: string;
  city: string;
  region: string;
  country: DemoCountryCode;
}

/** A contact in the form. `id` is its identity: a contact is never paired with another one by its position. */
export interface ContactValues {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
}

/** The values of the customer page. */
export interface CustomerValues {
  name: string;
  industry: DemoIndustry;
  status: DemoCustomerStatus;
  billingAddress: AddressValues;
  contacts: ContactValues[];
  /** The id of the primary contact; `''` when none is chosen (the primary one was removed). */
  primaryContactId: string;
  currency: DemoCurrency;
  paymentTerms: DemoPaymentTerms;
  /** Major unit of `currency`, with at most its decimals (`25000.00`, `4100000` for JPY). */
  creditLimit: string;
  accountManagerId: string;
}

const toAddressValues = (a: StoredAddress): AddressValues => ({
  line1: a.line1,
  line2: a.line2 ?? '',
  postalCode: a.postalCode,
  city: a.city,
  region: a.region ?? '',
  country: a.country,
});

const toStoredAddress = (a: AddressValues): StoredAddress => ({
  line1: a.line1,
  line2: a.line2 === '' ? null : a.line2,
  postalCode: a.postalCode,
  city: a.city,
  region: a.region === '' ? null : a.region,
  country: a.country,
});

export const toValues = (c: StoredCustomer): CustomerValues => ({
  name: c.name,
  industry: c.industry,
  status: c.status,
  billingAddress: toAddressValues(c.billingAddress),
  contacts: c.contacts.map((p) => ({ id: p.id, name: p.name, role: p.role, email: p.email, phone: p.phone })),
  primaryContactId: c.contacts.find((p) => p.primary)?.id ?? '',
  currency: c.currency,
  paymentTerms: c.paymentTerms,
  creditLimit: minorToText(c.creditLimitMinor, c.currency),
  accountManagerId: c.accountManagerId,
});

/**
 * The customer to send on Save: the record the page was opened with (its identity, its website) with the values
 * applied. The values were validated first, so the credit limit is an amount of the currency. The country of the
 * account is the billing country (the server derives it too).
 */
export const toCustomer = (record: StoredCustomer, v: CustomerValues): StoredCustomer => ({
  ...record,
  name: v.name,
  industry: v.industry,
  status: v.status,
  country: v.billingAddress.country,
  billingAddress: toStoredAddress(v.billingAddress),
  contacts: v.contacts.map(
    (p): StoredContact => ({ id: p.id, name: p.name, role: p.role, email: p.email, phone: p.phone, primary: p.id === v.primaryContactId }),
  ),
  currency: v.currency,
  paymentTerms: v.paymentTerms,
  creditLimitMinor: textToMinor(v.creditLimit, v.currency) ?? 0,
  accountManagerId: v.accountManagerId,
});

/** Same address: every part as typed (a postal code is text, `1234 AB` is not `1234AB`). */
export const sameAddress = (a: AddressValues, b: AddressValues): boolean =>
  a.line1 === b.line1 &&
  a.line2 === b.line2 &&
  a.postalCode === b.postalCode &&
  a.city === b.city &&
  a.region === b.region &&
  a.country === b.country;

/**
 * Same contacts: the same ids in the same order, each with the same texts. Identity rule (declared, #523): a contact
 * removed and added again with the very same texts is a NEW contact (a new id), so it is a change, even though every
 * text is the one saved; the server would store another contact (another id), and a reader of the record would see
 * one contact replaced by another. A reorder is a change too (the order is the display order the server keeps).
 */
export const sameContacts = (a: readonly ContactValues[], b: readonly ContactValues[]): boolean =>
  a.length === b.length &&
  a.every((p, i) => {
    const q = b[i]!;
    return p.id === q.id && p.name === q.name && p.role === q.role && p.email === q.email && p.phone === q.phone;
  });

/**
 * Whether the form differs from the saved customer. Texts are compared as typed; the credit limit is the same AMOUNT
 * when both texts are valid amounts of the same currency (`25000` is `25000.00`; `25000.0` in JPY is not valid, so it
 * is a change); a change of currency is a change whatever the amount.
 */
export const sameValues = (a: CustomerValues, b: CustomerValues): boolean =>
  a.name === b.name &&
  a.industry === b.industry &&
  a.status === b.status &&
  sameAddress(a.billingAddress, b.billingAddress) &&
  sameContacts(a.contacts, b.contacts) &&
  a.primaryContactId === b.primaryContactId &&
  a.currency === b.currency &&
  a.paymentTerms === b.paymentTerms &&
  sameAmount(a.creditLimit, b.creditLimit, a.currency) &&
  a.accountManagerId === b.accountManagerId;

/** What the postal codes of each country look like: the example the error shows (each one matches its pattern). */
export const POSTAL_CODE_EXAMPLE: Readonly<Record<DemoCountryCode, string>> = {
  NL: '1234 AB',
  BE: '1000',
  DE: '10115',
  AT: '1010',
  CH: '8001',
  FR: '75001',
  ES: '28001',
  IT: '20121',
  IE: 'D02 X285',
  GB: 'SW1A 1AA',
  SE: '113 51',
  DK: '1050',
  NO: '0150',
  PL: '00-950',
  US: '10001',
  JP: '100-0001',
};

/** The largest credit limit, in major units of any currency: well within a safe integer of minor units. */
export const MAX_CREDIT_LIMIT = 999_999_999;

// A plain shape check (one `@`, no space, a dot in the domain): any domain is accepted, the demo's `.example` too.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const creditLimitError = (text: string, currency: DemoCurrency): string | null => {
  if (text === '') return 'Credit limit is required.';
  const minor = textToMinor(text, currency);
  if (minor === null) {
    const digits = CURRENCY_MINOR_DIGITS[currency];
    return digits === 0
      ? `Credit limit must be a whole amount of 0 or more (${currency} has no decimals).`
      : `Credit limit must be an amount of 0 or more, with at most ${digits} decimals.`;
  }
  if (minor > MAX_CREDIT_LIMIT * 10 ** CURRENCY_MINOR_DIGITS[currency]) return 'Credit limit is too large.';
  return null;
};

export type CustomerErrors = Partial<Record<string, string>>;

/**
 * One message per invalid field, keyed by its dotted path: `name`, `billingAddress.postalCode`, `contacts.1.email`,
 * `primaryContactId`, `creditLimit`. The postal code depends on another field: its format is the billing country's.
 */
export function validateCustomer(v: CustomerValues): CustomerErrors {
  const errors: CustomerErrors = {};
  if (v.name.trim() === '') errors.name = 'Name is required.';
  const address = v.billingAddress;
  if (address.line1.trim() === '') errors['billingAddress.line1'] = 'Street is required.';
  if (address.postalCode === '') errors['billingAddress.postalCode'] = 'Postal code is required.';
  else if (!POSTAL_CODE_PATTERN[address.country].test(address.postalCode)) {
    errors['billingAddress.postalCode'] =
      `Postal code must look like ${POSTAL_CODE_EXAMPLE[address.country]} for ${COUNTRY_NAME[address.country]}.`;
  }
  if (address.city.trim() === '') errors['billingAddress.city'] = 'City is required.';
  if (v.contacts.length === 0) errors.contacts = 'Add at least one contact.';
  v.contacts.forEach((p, i) => {
    if (p.name.trim() === '') errors[`contacts.${i}.name`] = 'Contact name is required.';
    if (p.email === '') errors[`contacts.${i}.email`] = 'E-mail is required.';
    else if (!EMAIL.test(p.email)) errors[`contacts.${i}.email`] = 'Enter a valid e-mail address, like name@company.com.';
  });
  if (v.contacts.length > 0 && !v.contacts.some((p) => p.id === v.primaryContactId)) {
    errors.primaryContactId = 'Choose the primary contact.';
  }
  const credit = creditLimitError(v.creditLimit, v.currency);
  if (credit) errors.creditLimit = credit;
  if (v.accountManagerId === '') errors.accountManagerId = 'Choose an account manager.';
  return errors;
}

/**
 * The id of a new contact: `new-contact-<n>` with `n` past every one in `taken` (the saved ids and the ones on the
 * page), so an id is never a position and never repeats within the customer, also after add -> remove -> add.
 */
export function nextContactId(taken: ReadonlySet<string>, counter: number): { id: string; counter: number } {
  let n = counter;
  do n += 1;
  while (taken.has(`new-contact-${n}`));
  return { id: `new-contact-${n}`, counter: n };
}
