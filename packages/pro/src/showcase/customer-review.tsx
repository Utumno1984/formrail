// Story-only (#524), not part of @formrail/pro (`src/index.ts` never reaches `src/showcase/`, and the lint forbids it):
// the "Review changes" step of `Pro/Showcase/Record editing integrity` on the customers, plugged into the Free
// record-editing shell through the per-module `reviewSave` add-on (#519), as sales-order-review.tsx does for the sales
// orders. The customer is a record of another shape: a nested object (`billingAddress.*`), an array of contacts with
// ids, a relation to an employee (the account manager) and a credit limit in the customer's currency.
//
// Everything that names or compares comes from the engine: the contacts are matched by `id` (`arrayIdKeys`), named by
// `itemLabel` (#424) and a mere reorder is the engine's `reorders`. This file only says what the customer's fields are
// called, when two credit limits are the same amount (the editor's own rule) and how a value reads (a status, an
// industry, payment terms and a country by their labels, an account manager and a primary contact by their names, a
// credit limit in its currency).
import type { ReactNode } from 'react';
import { COUNTRY_NAME, CUSTOMER_STATUS_LABEL, INDUSTRY_LABEL, PAYMENT_TERMS_LABEL, formatMoney, type DemoCurrency } from '../../../core/src/internal/demo-data';
import type { ContactValues, CustomerValues } from '../../../core/src/showcase/modules/customers/customer-form';
import { accountManagerName } from '../../../core/src/showcase/modules/customers/customers-module';
import { sameAmount, textToMinor } from '../../../core/src/showcase/modules/sales-orders/order-lines';
import type { RecordSaveReview, RecordSaveReviewContext } from '../../../core/src/showcase/RecordPageShell';
import { ChangeSummary } from '../change-summary/ChangeSummary';
import { computeChangeSummaryResult } from '../change-summary/compute-change-summary';
import { DEFAULT_VALUE_LABELS, formatChangeValue } from '../change-summary/format-change-value';
import type { ChangeEntry, ChangeSummaryResult, ItemLabelContext } from '../change-summary/types';
import { REVIEW_LOCALE, absentText, fieldAsChange, reviewDescription, reviewValue } from './record-integrity';

export type CustomerReviewContext = RecordSaveReviewContext<CustomerValues>;

/** The contacts are identified by `id`, never by position: the entries of a contact survive the removal of another one. */
export const CUSTOMER_ARRAY_ID_KEYS = { contacts: 'id' } as const;

/**
 * The labels of the customer page's Fields and sections, so an entry reads like the field the user edited:
 * `Billing address > Postal code`, `Contacts > Contact 2 (Giulia Bellini) > E-mail`. `contacts.*` names the fields of
 * every contact; the contact segment itself is `itemLabel`'s ({@link customerContactLabel}).
 */
export const CUSTOMER_LABELS: Readonly<Record<string, string>> = {
  name: 'Name',
  industry: 'Industry',
  status: 'Status',
  billingAddress: 'Billing address',
  'billingAddress.line1': 'Street',
  'billingAddress.line2': 'Street, line 2',
  'billingAddress.postalCode': 'Postal code',
  'billingAddress.city': 'City',
  'billingAddress.region': 'Region or state',
  'billingAddress.country': 'Country',
  contacts: 'Contacts',
  'contacts.name': 'Name',
  'contacts.role': 'Role',
  'contacts.email': 'E-mail',
  'contacts.phone': 'Phone',
  primaryContactId: 'Primary contact',
  currency: 'Currency',
  paymentTerms: 'Payment terms',
  creditLimit: 'Credit limit',
  accountManagerId: 'Account manager',
};

/**
 * A contact named by its position and its name, `Contact 2 (Giulia Bellini)`: the name is who the user knows, the
 * position is the card on the page (its Fields are `Contact 2 e-mail`, ...) and tells two contacts of the same name
 * apart. The position is the one the engine gives (`context.index`): in the contacts as they are now, or in the saved
 * ones for a removed contact. A contact with no name yet is `Contact 3`. `undefined` (the engine's `Item N`) for any
 * other array. The same function names the contacts of the review (#424) and of the conflicts of a server update
 * (#534). Module scope: a stable identity.
 */
export function customerContactLabel(arrayPath: string, item: unknown, { index }: ItemLabelContext): string | undefined {
  if (arrayPath !== 'contacts' || typeof item !== 'object' || item === null) return undefined;
  const { name } = item as { name?: unknown };
  return typeof name === 'string' && name.trim() !== '' ? `Contact ${index + 1} (${name.trim()})` : `Contact ${index + 1}`;
}

type IsEqual = (a: unknown, b: unknown, path: string) => boolean | undefined;

const EQUALITIES = new Map<string, IsEqual>();

/**
 * The editor's own equality (`sameValues` of the Customers module), per path: two credit limits are the same when
 * they are the same AMOUNT (`25000` is `25000.00`), and a text the rule refuses (`25000.0` in yen) is never
 * "unchanged". The amount is read in the currency of each side compared (`currencies`): while the user changes the
 * customer's currency, a credit limit is the same only if it reads as the same amount in both (`25000` and `25000.00`
 * are the same euros, not the same yen), so the merge of a server update never replaces what the user typed for the
 * new currency. Every other field is compared with `===`, the engine's default. Hence: the form is dirty if and only
 * if the review has an entry or a reorder. The same function for the same currencies (a stable identity).
 */
export function customerIsEqual(...currencies: DemoCurrency[]): IsEqual {
  const key = [...new Set(currencies)].sort().join('|');
  let isEqual = EQUALITIES.get(key);
  if (!isEqual) {
    const each = [...new Set(currencies)];
    isEqual = (a, b, path) => {
      if (path !== 'creditLimit' || typeof a !== 'string' || typeof b !== 'string') return undefined;
      return each.every((currency) => sameAmount(a, b, currency));
    };
    EQUALITIES.set(key, isEqual);
  }
  return isEqual;
}

/**
 * What a value of one side needs to read as the user knows it: the currency its credit limit is in and the contacts
 * its primary contact is one of. In the review the two sides are the saved customer (`before`) and the form
 * (`after`); in a conflict of a server update they are the form (`before`, "Yours") and the server (`after`).
 */
export interface CustomerSide {
  currency: DemoCurrency;
  contacts: readonly ContactValues[];
}
export interface CustomerSides {
  before: CustomerSide;
  after: CustomerSide;
}
export const sideOf = ({ currency, contacts }: CustomerValues): CustomerSide => ({ currency, contacts });

/** A contact as the "Primary contact" Select names it: its name, or its position while it has none. */
function contactName(id: string, side: CustomerSide, other: CustomerSide): string {
  for (const contacts of [side.contacts, other.contacts]) {
    const index = contacts.findIndex((c) => c.id === id);
    if (index >= 0) {
      const name = contacts[index]!.name.trim();
      return name === '' ? `Contact ${index + 1} (no name yet)` : name;
    }
  }
  return id;
}

/**
 * A whole contact (an added or removed one, a contact in conflict): `Giulia Bellini (Buyer), giulia@…, +39 …`. The
 * name and the e-mail (required) are always said, `Empty name` / `Empty e-mail` when blank; the role and the phone
 * (optional) only when there is one. `null` if it is not a contact of the form.
 */
function contactText(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const { name, role, email, phone } = value as Record<string, unknown>;
  if (typeof name !== 'string' || typeof role !== 'string' || typeof email !== 'string' || typeof phone !== 'string') return null;
  const who = name === '' ? `${DEFAULT_VALUE_LABELS.empty} name` : name;
  const parts = [role === '' ? who : `${who} (${role})`, email === '' ? `${DEFAULT_VALUE_LABELS.empty} e-mail` : email];
  if (phone !== '') parts.push(phone);
  return parts.join(', ');
}

/** `contacts.2` -> true: the path of a whole contact (an added or removed one, a conflict on the contact). */
const isContactPath = (path: string): boolean => {
  const parts = path.split('.');
  return parts.length === 2 && parts[0] === 'contacts';
};

/** A label of one of the customer's fixed lists (`on-hold` -> `On hold`); any other text as it is. */
const labelIn = (labels: Readonly<Record<string, string>>, value: string): string => (Object.hasOwn(labels, value) ? labels[value]! : value);

/**
 * The values as the user knows them: the status, the industry, the payment terms and the country by their labels, the
 * account manager by name (also one who left the company), the primary contact by the contact's name, a whole contact
 * as a sentence, the credit limit as money in the currency of its side. `''`, `null` and a missing key read
 * differently (`Empty`, `Null`, `Missing`: an account manager the server set to `null` is `Null`). A value these do
 * not recognize (a text the rule refuses, typed in a field in conflict) reads as typed.
 *
 * The side of a value (`before` or `after`, for its currency and its contacts) is the side it is equal to: the two
 * values of an entry or of a conflict are never the same text (the engine reports none for two equal texts).
 */
export function customerValueText(value: unknown, entry: ChangeEntry, sides: CustomerSides): string {
  if (value === '' || value === null || value === undefined) return absentText(value, entry);
  if (isContactPath(entry.path)) {
    const contact = contactText(value);
    if (contact !== null) return contact;
  }
  if (typeof value === 'string') {
    const [side, other] = value === entry.before ? [sides.before, sides.after] : [sides.after, sides.before];
    switch (entry.path) {
      case 'status':
        return labelIn(CUSTOMER_STATUS_LABEL, value);
      case 'industry':
        return labelIn(INDUSTRY_LABEL, value);
      case 'paymentTerms':
        return labelIn(PAYMENT_TERMS_LABEL, value);
      case 'billingAddress.country':
        return labelIn(COUNTRY_NAME, value);
      case 'accountManagerId':
        return accountManagerName(value);
      case 'primaryContactId':
        return contactName(value, side, other);
      case 'creditLimit': {
        const minor = textToMinor(value, side.currency);
        return minor === null ? value : formatMoney(minor, side.currency);
      }
      default:
        return value;
    }
  }
  return formatChangeValue(value, { locale: REVIEW_LOCALE, timeZone: 'UTC' });
}

/**
 * `renderValue` of `ChangeSummary` and `RebaseNotice`: the text of {@link customerValueText} in the wrapper the default
 * rendering uses (wrapping of long values, the muted look of a value that is not there).
 */
export const customerRenderValue =
  (sides: CustomerSides) =>
  (value: unknown, entry: ChangeEntry): ReactNode =>
    reviewValue(value, customerValueText(value, entry, sides));

/**
 * The review of a save, from ONE run of the engine against the SAVED customer (`baseline`, the record as the server
 * last returned it, never the values the page opened with): the entries, contacts named by
 * {@link customerContactLabel}, and the reorders (`contacts` when the contacts present on both sides changed their
 * relative order). A field of the customer with no value on one side (an account manager the server set to `null`)
 * reads as a change from or to that absence (`fieldAsChange`, record-integrity.tsx).
 */
export function customerReview({ values, baseline }: CustomerReviewContext): ChangeSummaryResult {
  const result = computeChangeSummaryResult<CustomerValues>({
    values,
    baseline,
    arrayIdKeys: CUSTOMER_ARRAY_ID_KEYS,
    labels: CUSTOMER_LABELS,
    isEqual: customerIsEqual(baseline.currency, values.currency),
    itemLabel: customerContactLabel,
  });
  return { ...result, entries: result.entries.map((entry) => fieldAsChange(entry, values, baseline)) };
}

export const CONTACTS_ORDER_ONLY_DESCRIPTION = 'Only the order of the contacts changed.';
export const CONTACTS_ORDER_ALSO_NOTE = 'The order of the contacts also changed.';

/** The list of the review: the changes, each value read on its side (the saved customer, the form). */
export function CustomerChanges({ entries, sides, label = 'Changes to save' }: { entries: ChangeEntry[]; sides: CustomerSides; label?: string }) {
  return <ChangeSummary entries={entries} label={label} locale={REVIEW_LOCALE} timeZone="UTC" renderValue={customerRenderValue(sides)} />;
}

/** The sides of the review: the saved customer before, the form after. */
export const reviewSides = ({ values, baseline }: CustomerReviewContext): CustomerSides => ({ before: sideOf(baseline), after: sideOf(values) });

/**
 * The `reviewSave` of the customers: the "Review changes" dialog, or `null` when there is nothing to review (the
 * editor then saves directly). A dirty form with no entry is a mere reorder of the contacts: the dialog still opens,
 * with its own text and no (empty) list. Computed once, when Save is pressed (a server update can change the form
 * under the dialog: customer-rebase.tsx gives a review that follows it).
 */
export function customerSaveReview(context: CustomerReviewContext): RecordSaveReview | null {
  const { entries, reorders } = customerReview(context);
  const reordered = reorders.length > 0;
  if (entries.length === 0 && !reordered) return null;
  return {
    title: 'Review changes',
    description: entries.length === 0 ? CONTACTS_ORDER_ONLY_DESCRIPTION : reviewDescription(entries.length),
    confirmLabel: 'Save changes',
    cancelLabel: 'Keep editing',
    tone: 'default',
    // A review the user must SEE: the focus opens on "Keep editing", so Enter held on Save (auto-repeat) cannot
    // confirm it unread. The confirm button stays the primary one (`tone: 'default'`).
    initialFocus: 'cancel',
    children:
      entries.length === 0 ? undefined : (
        <>
          <CustomerChanges entries={entries} sides={reviewSides(context)} />
          {reordered ? <p style={{ marginBlockStart: 12, marginBlockEnd: 0 }}>{CONTACTS_ORDER_ALSO_NOTE}</p> : null}
        </>
      ),
  };
}
