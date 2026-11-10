import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { InvoiceValues } from '../../../core/src/showcase/InvoiceRecordPage';
import {
  formatIsoDate,
  invoiceReviewEntries,
  invoiceReviewText,
  invoiceSaveReview,
  reviewDescription,
} from './invoice-review';

const BASELINE: InvoiceValues = {
  supplier: 'Rossi Construction Ltd',
  status: 'pending',
  amount: '120.00',
  date: '2026-02-03',
  dueDate: '2026-03-05',
  notes: 'Payment terms: 30 days from the invoice date.',
};

const edit = (patch: Partial<InvoiceValues>): InvoiceValues => ({ ...BASELINE, ...patch });

/** The same equality as the editor's `sameValues` (the form's `isEqual`), restated as the contract. */
const formIsDirty = (values: InvoiceValues): boolean =>
  !(
    (values.amount === BASELINE.amount ||
      (values.amount.trim() !== '' && BASELINE.amount.trim() !== '' && Number(values.amount) === Number(BASELINE.amount))) &&
    values.supplier === BASELINE.supplier &&
    values.status === BASELINE.status &&
    values.date === BASELINE.date &&
    values.dueDate === BASELINE.dueDate &&
    values.notes === BASELINE.notes
  );

/** Renders the dialog content of a review and returns its items. */
function reviewItems(values: InvoiceValues) {
  const review = invoiceSaveReview({ values, baseline: BASELINE });
  if (!review) throw new Error('no review');
  render(<>{review.children}</>);
  return within(screen.getByRole('list', { name: 'Changes to save' })).getAllByRole('listitem');
}

/** The text of an item as assistive technology reads it: without the decorative (`aria-hidden`) arrow. */
const read = (el: Element | undefined): string => {
  const copy = el!.cloneNode(true) as Element;
  for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
};

const originalTz = process.env.TZ;
afterEach(() => {
  process.env.TZ = originalTz;
});

describe('invoice review (#377): configuration of the change summary', () => {
  it('dirty <=> at least one entry: 120 typed on a baseline of 120.00 is neither', () => {
    for (const values of [
      edit({}),
      edit({ amount: '120' }),
      edit({ amount: '120.0' }),
      edit({ amount: '130' }),
      edit({ amount: '' }),
      edit({ amount: ' 120 ' }),
      edit({ notes: '' }),
      edit({ status: 'approved', supplier: 'Bianchi Supplies' }),
    ]) {
      expect(invoiceReviewEntries({ values, baseline: BASELINE }).length > 0).toBe(formIsDirty(values));
    }
    expect(invoiceReviewEntries({ values: edit({ amount: '120' }), baseline: BASELINE })).toEqual([]);
    expect(invoiceSaveReview({ values: edit({ amount: '120' }), baseline: BASELINE })).toBeNull();
  });

  it('120 -> 130: one "Amount (EUR)" entry, rendered as money', () => {
    const items = reviewItems(edit({ amount: '130' }));
    expect(items).toHaveLength(1);
    expect(read(items[0])).toBe('Amount (EUR), changed, from €120.00 to €130.00');
  });

  it('the status by its label, never its code', () => {
    const [item] = reviewItems(edit({ status: 'approved' }));
    expect(read(item)).toBe('Status, changed, from Open to Approved');
    expect(item).not.toHaveTextContent('approved');
  });

  it('the labels of the Fields', () => {
    const entries = invoiceReviewEntries({
      values: { supplier: 'X', status: 'rejected', amount: '1', date: '2026-01-01', dueDate: '2026-01-02', notes: 'n' },
      baseline: BASELINE,
    });
    expect(entries.map((e) => e.label)).toEqual(['Supplier', 'Status', 'Amount (EUR)', 'Invoice date', 'Due date', 'Notes']);
  });

  it.each(['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Asia/Tokyo'])(
    'dates: a localized date, never the ISO string, the same calendar day with TZ=%s',
    (tz) => {
      process.env.TZ = tz;
      const [item] = reviewItems(edit({ dueDate: '2026-04-05' }));
      expect(read(item)).toBe('Due date, changed, from Mar 5, 2026 to Apr 5, 2026');
      expect(item).not.toHaveTextContent('2026-03-05');
      expect(formatIsoDate('2026-01-01')).toBe('Jan 1, 2026');
      expect(formatIsoDate('2026-12-31')).toBe('Dec 31, 2026');
    },
  );

  it('a string that is not a calendar date falls back to the default text', () => {
    expect(formatIsoDate('2026-02-30')).toBeNull();
    expect(formatIsoDate('')).toBeNull();
    const entry = invoiceReviewEntries({ values: edit({ dueDate: '' }), baseline: BASELINE })[0]!;
    expect(invoiceReviewText('', entry)).toBe('Empty');
  });

  it('Notes emptied: the empty side reads "Empty" (the default text), muted, never blank', () => {
    const [item] = reviewItems(edit({ notes: '' }));
    expect(read(item)).toBe('Notes, changed, from Payment terms: 30 days from the invoice date. to Empty');
    const empty = within(item!).getByText('Empty');
    expect(empty).toHaveClass('rop-pro-change-summary__value--muted');
  });

  it('description: singular and plural', () => {
    expect(reviewDescription(1)).toBe('1 change will be saved.');
    expect(reviewDescription(3)).toBe('3 changes will be saved.');
    expect(invoiceSaveReview({ values: edit({ notes: 'x' }), baseline: BASELINE })?.description).toBe('1 change will be saved.');
  });

  it('the dialog options: title, labels, default tone', () => {
    const review = invoiceSaveReview({ values: edit({ notes: 'x' }), baseline: BASELINE });
    expect(review).toMatchObject({
      title: 'Review changes',
      confirmLabel: 'Save changes',
      cancelLabel: 'Keep editing',
      tone: 'default',
    });
  });
});
