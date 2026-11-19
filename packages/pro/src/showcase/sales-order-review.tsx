// Story-only (#522), not part of @formrail/pro (`src/index.ts` never reaches `src/showcase/`, and the lint forbids it):
// the "Review changes" step of `Pro/Showcase/Record editing integrity` on the sales orders, plugged into the Free
// record-editing shell through the per-module `reviewSave` add-on (#519). The shell and the Sales orders module are
// imported from the core SOURCES (one copy, never duplicated here): see the `no-restricted-imports` rules in
// eslint.config.js.
//
// Everything that names or compares comes from the engine: the rows are matched by `id` (`arrayIdKeys`), named by
// `itemLabel` (#424) and a mere reorder is the engine's `reorders`. This file only says what the order's fields are
// called, when two texts of a line are the same number (the editor's own rule), and how a value reads (a status by
// its label, a date as a date, an amount in the order's currency).
import type { ReactNode } from 'react';
import { isIsoDate } from '../../../core/src/calendar/date-math';
import {
  SALES_ORDER_STATUS_LABEL,
  formatDate,
  formatMoney,
  getProduct,
  type DemoCurrency,
} from '../../../core/src/internal/demo-data';
import { INTEGER } from '../../../core/src/showcase/number-text';
import { sameAmount, sameInteger, textToMinor } from '../../../core/src/showcase/modules/sales-orders/order-lines';
import type { SalesOrderValues } from '../../../core/src/showcase/modules/sales-orders/sales-orders-module';
import type { RecordSaveReview, RecordSaveReviewContext } from '../../../core/src/showcase/RecordPageShell';
import { ChangeSummary } from '../change-summary/ChangeSummary';
import { computeChangeSummaryResult } from '../change-summary/compute-change-summary';
import { DEFAULT_VALUE_LABELS, formatChangeValue } from '../change-summary/format-change-value';
import type { ChangeEntry, ChangeSummaryResult, ItemLabelContext } from '../change-summary/types';
import { REVIEW_LOCALE, absentText, fieldAsChange, reviewDescription, reviewValue } from './record-integrity';

// What every module's review shares (#524) lives in record-integrity.tsx; re-exported for the files that read it here.
export { NOTHING_LEFT_DESCRIPTION, REVIEW_LOCALE, reviewDescription } from './record-integrity';

export type SalesOrderReviewContext = RecordSaveReviewContext<SalesOrderValues>;

/** The lines are identified by `id`, never by position: the entries of a row survive the removal of another one. */
export const SALES_ORDER_ARRAY_ID_KEYS = { lines: 'id' } as const;

/**
 * The labels of the order page's Fields, so an entry reads like the field the user edited. `lines.*` names the
 * fields of every line (`Lines > Line 2 (Threadlocker) > Quantity`); the row segment itself is `itemLabel`'s.
 */
export const SALES_ORDER_LABELS: Readonly<Record<string, string>> = {
  customerId: 'Customer ID',
  customerName: 'Customer',
  currency: 'Currency',
  status: 'Status',
  customerReference: 'Customer reference',
  orderDate: 'Order date',
  requestedDeliveryDate: 'Requested delivery',
  deliveryNotes: 'Delivery instructions',
  notes: 'Notes',
  lines: 'Lines',
  'lines.productId': 'Product',
  'lines.quantity': 'Quantity',
  'lines.unitPrice': 'Unit price',
  'lines.discount': 'Discount (%)',
};

/** `lines.2.quantity` -> `quantity`; `undefined` for any path that is not one field of one line. */
const lineFieldOf = (path: string): string | undefined => {
  const parts = path.split('.');
  return parts.length === 3 && parts[0] === 'lines' ? parts[2] : undefined;
};

/** `lines.2` -> true: the path of a whole line (an added or removed row, a conflict on the row). */
const isLinePath = (path: string): boolean => {
  const parts = path.split('.');
  return parts.length === 2 && parts[0] === 'lines';
};

/**
 * The editor's own equality, per path (`sameValues` of the Sales orders module): the quantity and the discount of a
 * line are the same whole number (`5` is `05`), the unit price the same amount of the order's currency (`12.5` is
 * `12.50`), and a text the rule refuses (`5.0`) is never "unchanged". Every other field is a string compared with
 * `===`, the engine's default. Hence: the form is dirty if and only if the review has an entry or a reorder.
 */
function isEqualIn(currency: DemoCurrency) {
  return (a: unknown, b: unknown, path: string): boolean | undefined => {
    if (typeof a !== 'string' || typeof b !== 'string') return undefined;
    switch (lineFieldOf(path)) {
      case 'quantity':
      case 'discount':
        return sameInteger(a, b);
      case 'unitPrice':
        return sameAmount(a, b, currency);
      default:
        return undefined;
    }
  };
}

/**
 * A line named by its position and its product, `Line 2 (Threadlocker, medium-strength, 250 ml)`: the product is
 * what a buyer reads, the position tells two lines of the same product apart. The position is the one the engine
 * gives (`context.index`): in the order as it is now, or in the saved order for a removed line. A line with no
 * product (or an unknown one) is `Line 2`. `undefined` (the engine's `Item N`) for any other array. The same
 * function names the rows of the review (#424) and of the conflicts of a server update (#534). Module scope: a
 * stable identity.
 */
export function salesOrderLineLabel(arrayPath: string, item: unknown, { index }: ItemLabelContext): string | undefined {
  if (arrayPath !== 'lines' || typeof item !== 'object' || item === null) return undefined;
  const { productId } = item as { productId?: unknown };
  const product = typeof productId === 'string' ? getProduct(productId) : undefined;
  return product ? `Line ${index + 1} (${product.name})` : `Line ${index + 1}`;
}

const count = new Intl.NumberFormat(REVIEW_LOCALE);

/** One number of a line as it reads: a quantity grouped, a price in the currency, a discount in percent; any other text as typed. */
function lineNumberText(field: string, text: string, currency: DemoCurrency): string | undefined {
  const t = text.trim();
  if (field === 'unitPrice') {
    const minor = textToMinor(t, currency);
    return minor === null ? undefined : formatMoney(minor, currency);
  }
  if ((field === 'quantity' || field === 'discount') && INTEGER.test(t) && Number.isSafeInteger(Number(t))) {
    return field === 'quantity' ? count.format(Number(t)) : `${Number(t)}%`;
  }
  return undefined;
}

/** A product by its name (a discontinued one is still named); an unknown id as it is. */
const productText = (productId: string): string => getProduct(productId)?.name ?? productId;

/**
 * A whole line (an added or removed row, a row in conflict): `Threadlocker, medium-strength, 250 ml, 5 × €88.25` and
 * `, 20% discount` when there is one. `null` if it is not a line of the form.
 */
function lineText(value: unknown, currency: DemoCurrency): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const { productId, quantity, unitPrice, discount } = value as Record<string, unknown>;
  if (typeof productId !== 'string' || typeof quantity !== 'string' || typeof unitPrice !== 'string' || typeof discount !== 'string') return null;
  const part = (field: string, text: string): string => lineNumberText(field, text, currency) ?? (text === '' ? DEFAULT_VALUE_LABELS.empty : text);
  const product = productId === '' ? 'No product' : productText(productId);
  const noDiscount = INTEGER.test(discount.trim()) && Number(discount) === 0;
  return `${product}, ${part('quantity', quantity)} × ${part('unitPrice', unitPrice)}${noDiscount ? '' : `, ${part('discount', discount)} discount`}`;
}

/**
 * The values as the user knows them, in the order's `currency`: the status by its label (`Confirmed`, not
 * `confirmed`), the dates as dates, a product by its name, a unit price as money, a whole line as a sentence. A
 * value these do not recognize (a text the rule refuses, typed in a field in conflict) reads as typed.
 */
export function salesOrderValueText(value: unknown, entry: ChangeEntry, currency: DemoCurrency): string {
  if (value === '' || value === null || value === undefined) return absentText(value, entry);
  if (isLinePath(entry.path)) {
    const line = lineText(value, currency);
    if (line !== null) return line;
  }
  if (typeof value === 'string') {
    const field = lineFieldOf(entry.path);
    if (field === 'productId') return productText(value);
    if (field !== undefined) return lineNumberText(field, value, currency) ?? value;
    if (entry.path === 'status' && Object.hasOwn(SALES_ORDER_STATUS_LABEL, value)) {
      return SALES_ORDER_STATUS_LABEL[value as keyof typeof SALES_ORDER_STATUS_LABEL];
    }
    if ((entry.path === 'orderDate' || entry.path === 'requestedDeliveryDate') && isIsoDate(value)) return formatDate(value);
  }
  return formatChangeValue(value, { locale: REVIEW_LOCALE, timeZone: 'UTC' });
}

/** What the review and the rebase of an order in one currency use: built once per currency, so a stable identity. */
export interface SalesOrderEngine {
  /** The editor's equality of two texts (see {@link isEqualIn}). */
  isEqual: (a: unknown, b: unknown, path: string) => boolean | undefined;
  /**
   * `renderValue` of `ChangeSummary` and `RebaseNotice`: the text of {@link salesOrderValueText} in the wrapper the
   * default rendering uses (wrapping of long values, the muted look of a value that is not there).
   */
  renderValue: (value: unknown, entry: ChangeEntry) => ReactNode;
}

const ENGINES = new Map<DemoCurrency, SalesOrderEngine>();

/** The engine of an order in `currency`: the same object for the same currency (`useFormRebase` compares by identity). */
export function salesOrderEngine(currency: DemoCurrency): SalesOrderEngine {
  let engine = ENGINES.get(currency);
  if (!engine) {
    engine = {
      isEqual: isEqualIn(currency),
      renderValue: (value, entry) => reviewValue(value, salesOrderValueText(value, entry, currency)),
    };
    ENGINES.set(currency, engine);
  }
  return engine;
}

/**
 * The review of a save, from ONE run of the engine against the SAVED order (`baseline`, the record as the server
 * last returned it, never the values the page opened with): the entries, rows named by {@link salesOrderLineLabel},
 * and the reorders (`lines` when the lines present on both sides changed their relative order). The currency is the
 * saved order's (it is the customer's, fixed once the order exists). A field of the order with no value on one side
 * reads as a change from or to that absence (`fieldAsChange`, record-integrity.tsx).
 */
export function salesOrderReview({ values, baseline }: SalesOrderReviewContext): ChangeSummaryResult {
  const result = computeChangeSummaryResult<SalesOrderValues>({
    values,
    baseline,
    arrayIdKeys: SALES_ORDER_ARRAY_ID_KEYS,
    labels: SALES_ORDER_LABELS,
    isEqual: salesOrderEngine(baseline.currency).isEqual,
    itemLabel: salesOrderLineLabel,
  });
  return { ...result, entries: result.entries.map((entry) => fieldAsChange(entry, values, baseline)) };
}

export const ORDER_ONLY_DESCRIPTION = 'Only the order of the lines changed.';
export const ORDER_ALSO_NOTE = 'The order of the lines also changed.';

/** The list of the review: the changes, in the order's currency. */
export function SalesOrderChanges({ entries, currency }: { entries: ChangeEntry[]; currency: DemoCurrency }) {
  return (
    <ChangeSummary
      entries={entries}
      label="Changes to save"
      locale={REVIEW_LOCALE}
      timeZone="UTC"
      renderValue={salesOrderEngine(currency).renderValue}
    />
  );
}

/**
 * The `reviewSave` of the showcase: the "Review changes" dialog, or `null` when there is nothing to review (the
 * editor then saves directly). A dirty form with no entry is a mere reorder of the lines: the dialog still opens,
 * with its own text and no (empty) list, so Save never looks like it did nothing. Computed once, when Save is
 * pressed: the form cannot change under a modal (a server update can: see sales-order-rebase.tsx).
 */
export function salesOrderSaveReview(context: SalesOrderReviewContext): RecordSaveReview | null {
  const { entries, reorders } = salesOrderReview(context);
  const reordered = reorders.length > 0;
  if (entries.length === 0 && !reordered) return null;
  return {
    title: 'Review changes',
    description: entries.length === 0 ? ORDER_ONLY_DESCRIPTION : reviewDescription(entries.length),
    confirmLabel: 'Save changes',
    cancelLabel: 'Keep editing',
    tone: 'default',
    // A review the user must SEE: the focus opens on "Keep editing", so Enter held on Save (auto-repeat) cannot
    // confirm it unread. The confirm button stays the primary one (`tone: 'default'`).
    initialFocus: 'cancel',
    children:
      entries.length === 0 ? undefined : (
        <>
          <SalesOrderChanges entries={entries} currency={context.baseline.currency} />
          {reordered ? <p style={{ marginBlockStart: 12, marginBlockEnd: 0 }}>{ORDER_ALSO_NOTE}</p> : null}
        </>
      ),
  };
}
