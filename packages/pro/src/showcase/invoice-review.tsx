// Story-only (#377), not part of @react-object-page/pro (`src/index.ts` never reaches `src/showcase/`, and the
// lint forbids it): the "Review changes" step of the Pro story `Pro/Showcase/Invoices with Change Summary`,
// plugged into the Free CRUD showcase through its `reviewSave` extension point. The showcase is imported from
// the core SOURCES (one copy, never duplicated here); see the `no-restricted-imports` rules in eslint.config.js.
import type { ReactNode } from 'react';
import {
  sameAmount,
  type InvoiceReviewValues,
  type InvoiceSaveReview,
  type InvoiceSaveReviewContext,
  type InvoiceValues,
} from '../../../core/src/showcase/InvoiceRecordPage';
import { sameNumberText } from '../../../core/src/showcase/number-text';
import { STATUS_LABEL } from '../../../core/src/showcase/showcase-data';
import { ChangeSummary } from '../change-summary/ChangeSummary';
import { computeChangeSummary } from '../change-summary/compute-change-summary';
import { formatChangeValue } from '../change-summary/format-change-value';
import type { ChangeEntry } from '../change-summary/types';

/** Fixed in the story, so the texts (and the visual baselines) do not depend on the machine. */
export const REVIEW_LOCALE = 'en-US';

/** The labels of the editor's Fields, so an entry reads like the field the user edited. */
export const INVOICE_REVIEW_LABELS: Readonly<Record<keyof InvoiceValues, string>> = {
  supplier: 'Supplier',
  status: 'Status',
  amount: 'Amount (EUR)',
  date: 'Invoice date',
  dueDate: 'Due date',
  notes: 'Notes',
};

/**
 * The review identifies the line items by `id` (never by position), so the entries of a row survive the removal
 * of another one. Labels: `labels` fixes the names that the default inference gets wrong, and `nameLine` adds the
 * description of the row to `Item N` (the bare position is ambiguous between a removed and a changed row).
 */
export const INVOICE_REVIEW_ARRAY_ID_KEYS = { lineItems: 'id' } as const;
export const INVOICE_REVIEW_PATH_LABELS: Readonly<Record<string, string>> = {
  ...INVOICE_REVIEW_LABELS,
  lineItems: 'Line items',
  'lineItems.unitPrice': 'Unit price',
};

const LINE_NUMBER_PATH = /^lineItems\.\d+\.(quantity|unitPrice)$/;
const LINE_PATH = /^lineItems\.\d+$/;

/**
 * The editor's own equality, per path: the form compares the amount numerically (`120` against `120.00` is
 * not dirty), so the summary does too. Every other field is a string compared with `===`, which is the
 * summary's default. The quantity and the unit price of a line are compared numerically too (`2` against
 * `2.00`), like `sameLines`. Hence: the form is dirty if and only if there is at least one entry, with ONE
 * declared exception (#379): a mere reorder of the line items is dirty and gives no entry
 * (see {@link lineOrderChanged}).
 */
export function invoiceReviewIsEqual(a: unknown, b: unknown, path: string): boolean | undefined {
  if (typeof a !== 'string' || typeof b !== 'string') return undefined;
  if (path === 'amount') return sameAmount(a, b);
  if (LINE_NUMBER_PATH.test(path)) return sameNumberText(a, b);
  return undefined;
}

/**
 * True when the lines present on both sides are not in the same relative order: a reorder, whatever else
 * changed (an added or removed line does not count as a reorder).
 */
export function lineOrderChanged(values: InvoiceReviewValues, baseline: InvoiceReviewValues): boolean {
  const before = baseline.lineItems.map((l) => l.id);
  const after = values.lineItems.map((l) => l.id);
  const inAfter = new Set(after);
  const common = new Set(before.filter((id) => inAfter.has(id)));
  const a = before.filter((id) => common.has(id));
  const b = after.filter((id) => common.has(id));
  return a.some((id, i) => id !== b[i]);
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const money = new Intl.NumberFormat(REVIEW_LOCALE, { style: 'currency', currency: 'EUR' });
const count = new Intl.NumberFormat(REVIEW_LOCALE);
// `timeZone: 'UTC'` with a date built in UTC: the calendar day of the ISO string, whatever the time zone of
// the machine (a local midnight would print the day before west of UTC).
const day = new Intl.DateTimeFormat(REVIEW_LOCALE, { dateStyle: 'medium', timeZone: 'UTC' });

/** `2026-03-05` -> `Mar 5, 2026`; anything that is not a real calendar date -> `null`. */
export function formatIsoDate(value: string): string | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  // `Date.UTC` rolls `2026-02-30` over to March: not a date of the calendar.
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return day.format(date);
}

/** A whole line (an added or removed row): `Consulting (hourly), 2 × €120.00`; `null` if it is not a line. */
function lineText(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const { description, quantity, unitPrice } = value as Record<string, unknown>;
  if (typeof description !== 'string' || typeof quantity !== 'string' || typeof unitPrice !== 'string') return null;
  if (!Number.isFinite(Number(quantity)) || !Number.isFinite(Number(unitPrice))) return null;
  return `${description.trim() === '' ? 'No description' : description}, ${count.format(Number(quantity))} × ${money.format(Number(unitPrice))}`;
}

/**
 * The values as the user knows them: the status by its label (`Approved`, not `approved`), the amount as
 * money, the ISO dates as localized dates. Anything else, and any value these do not recognize, gets the
 * summary's default text (`Empty` for `''`).
 */
export function invoiceReviewText(value: unknown, entry: ChangeEntry): string {
  if (LINE_PATH.test(entry.path)) {
    const line = lineText(value);
    if (line !== null) return line;
  }
  if (typeof value === 'string') {
    if (LINE_NUMBER_PATH.test(entry.path) && value.trim() !== '' && Number.isFinite(Number(value))) {
      return entry.path.endsWith('.unitPrice') ? money.format(Number(value)) : count.format(Number(value));
    }
    if (entry.path === 'status' && Object.hasOwn(STATUS_LABEL, value)) {
      return STATUS_LABEL[value as keyof typeof STATUS_LABEL];
    }
    if (entry.path === 'amount' && value.trim() !== '' && Number.isFinite(Number(value))) {
      return money.format(Number(value));
    }
    if (entry.path === 'date' || entry.path === 'dueDate') {
      const shown = formatIsoDate(value);
      if (shown !== null) return shown;
    }
  }
  return formatChangeValue(value, { locale: REVIEW_LOCALE, timeZone: 'UTC' });
}

/**
 * `renderValue` replaces the whole default rendering of a value, its wrapper included: the text above goes
 * back into the same wrapper the default uses (wrapping of long values, the muted look of `Empty`).
 */
export function renderInvoiceReviewValue(value: unknown, entry: ChangeEntry): ReactNode {
  const muted = value === '' || value === null || value === undefined;
  return (
    <span className={muted ? 'rop-pro-change-summary__value rop-pro-change-summary__value--muted' : 'rop-pro-change-summary__value'}>
      {invoiceReviewText(value, entry)}
    </span>
  );
}

/** The entries of a review: the changes between the saved baseline and the values about to be saved. */
export function invoiceReviewEntries({ values, baseline }: InvoiceSaveReviewContext): ChangeEntry[] {
  const entries = computeChangeSummary<InvoiceReviewValues>({
    values,
    baseline,
    arrayIdKeys: INVOICE_REVIEW_ARRAY_ID_KEYS,
    labels: INVOICE_REVIEW_PATH_LABELS,
    isEqual: invoiceReviewIsEqual,
  });
  return entries.map((entry) => nameLine(entry, values, baseline));
}

// Only the entries of one field of a row: an added/removed row already shows its description as its value.
const LINE_INDEX = /^lineItems\.(\d+)\./;

/**
 * `Item N` alone is ambiguous: the index is the row's position in the new list, except for a removed row (its
 * position in the saved one), so "Item 1" can be two different rows in the same review. The description of the
 * row (from the baseline for a removed one, else from the new values) makes it unmistakable:
 * `Line items > Item 1 (Transport) > Quantity`.
 */
function nameLine(entry: ChangeEntry, values: InvoiceReviewValues, baseline: InvoiceReviewValues): ChangeEntry {
  const match = LINE_INDEX.exec(entry.path);
  if (!match) return entry;
  const index = Number(match[1]);
  const row = (entry.kind === 'removed' ? baseline : values).lineItems[index];
  const description = row?.description.trim();
  if (!description || entry.labelPath[1] === undefined) return entry;
  const labelPath = entry.labelPath.map((segment, i) => (i === 1 ? `${segment} (${description})` : segment));
  return { ...entry, labelPath, label: labelPath.join(' > ') };
}

/** `1 change will be saved.`, `3 changes will be saved.` */
export const reviewDescription = (count: number): string =>
  count === 1 ? '1 change will be saved.' : `${count} changes will be saved.`;

export const ORDER_ONLY_DESCRIPTION = 'Only the order of the line items changed.';
export const ORDER_ALSO_NOTE = 'The order of the line items also changed.';

/**
 * The `reviewSave` of the showcase: the "Review changes" dialog, or `null` when there is nothing to review
 * (the editor then saves directly). A dirty form with no entry is a mere reorder of the line items (#379): the
 * dialog is still opened, with its own text and no (empty) list, so Save never looks like it did nothing.
 * Computed once, when Save is pressed: the form cannot change under a modal.
 */
export function invoiceSaveReview(context: InvoiceSaveReviewContext): InvoiceSaveReview | null {
  const entries = invoiceReviewEntries(context);
  const reordered = lineOrderChanged(context.values, context.baseline);
  if (entries.length === 0 && !reordered) return null;
  return {
    title: 'Review changes',
    description: entries.length === 0 ? ORDER_ONLY_DESCRIPTION : reviewDescription(entries.length),
    confirmLabel: 'Save changes',
    cancelLabel: 'Keep editing',
    tone: 'default',
    // A review the user must SEE: the focus opens on "Keep editing", so Enter held on Save (auto-repeat)
    // cannot confirm it unread. The confirm button stays the primary one (`tone: 'default'`).
    initialFocus: 'cancel',
    children:
      entries.length === 0 ? undefined : (
        <>
          <ChangeSummary
            entries={entries}
            label="Changes to save"
            locale={REVIEW_LOCALE}
            timeZone="UTC"
            renderValue={renderInvoiceReviewValue}
          />
          {reordered ? <p style={{ marginBlockStart: 12, marginBlockEnd: 0 }}>{ORDER_ALSO_NOTE}</p> : null}
        </>
      ),
  };
}
