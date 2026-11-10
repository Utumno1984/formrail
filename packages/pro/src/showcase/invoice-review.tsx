// Story-only (#377), not part of @react-object-page/pro (`src/index.ts` never reaches `src/showcase/`, and the
// lint forbids it): the "Review changes" step of the Pro story `Pro/Showcase/Invoices with Change Summary`,
// plugged into the Free CRUD showcase through its `reviewSave` extension point. The showcase is imported from
// the core SOURCES (one copy, never duplicated here); see the `no-restricted-imports` rules in eslint.config.js.
import type { ReactNode } from 'react';
import {
  sameAmount,
  type InvoiceSaveReview,
  type InvoiceSaveReviewContext,
  type InvoiceValues,
} from '../../../core/src/showcase/InvoiceRecordPage';
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
 * The editor's own equality, per path: the form compares the amount numerically (`120` against `120.00` is
 * not dirty), so the summary does too. Every other field is a string compared with `===`, which is the
 * summary's default. Hence: the form is dirty if and only if there is at least one entry.
 */
export function invoiceReviewIsEqual(a: unknown, b: unknown, path: string): boolean | undefined {
  if (path === 'amount' && typeof a === 'string' && typeof b === 'string') return sameAmount(a, b);
  return undefined;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const money = new Intl.NumberFormat(REVIEW_LOCALE, { style: 'currency', currency: 'EUR' });
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

/**
 * The values as the user knows them: the status by its label (`Approved`, not `approved`), the amount as
 * money, the ISO dates as localized dates. Anything else, and any value these do not recognize, gets the
 * summary's default text (`Empty` for `''`).
 */
export function invoiceReviewText(value: unknown, entry: ChangeEntry): string {
  if (typeof value === 'string') {
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
  return computeChangeSummary({
    values,
    baseline,
    labels: INVOICE_REVIEW_LABELS,
    isEqual: invoiceReviewIsEqual,
  });
}

/** `1 change will be saved.`, `3 changes will be saved.` */
export const reviewDescription = (count: number): string =>
  count === 1 ? '1 change will be saved.' : `${count} changes will be saved.`;

/**
 * The `reviewSave` of the showcase: the "Review changes" dialog, or `null` when there is nothing to review
 * (the editor then saves directly; with the equality above it cannot happen on a dirty form, whose footer
 * is the only way to Save). Computed once, when Save is pressed: the form cannot change under a modal.
 */
export function invoiceSaveReview(context: InvoiceSaveReviewContext): InvoiceSaveReview | null {
  const entries = invoiceReviewEntries(context);
  if (entries.length === 0) return null;
  return {
    title: 'Review changes',
    description: reviewDescription(entries.length),
    confirmLabel: 'Save changes',
    cancelLabel: 'Keep editing',
    tone: 'default',
    children: (
      <ChangeSummary
        entries={entries}
        label="Changes to save"
        locale={REVIEW_LOCALE}
        timeZone="UTC"
        renderValue={renderInvoiceReviewValue}
      />
    ),
  };
}
