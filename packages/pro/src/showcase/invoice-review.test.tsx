import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { InvoiceReviewValues as InvoiceValues } from '../../../core/src/showcase/InvoiceRecordPage';
import { sameLines } from '../../../core/src/showcase/invoice-lines';
import {
  INVOICE_REVIEW_ARRAY_ID_KEYS,
  formatIsoDate,
  invoiceReviewEntries,
  invoiceReviewText,
  invoiceSaveReview,
  lineOrderChanged,
  reviewDescription,
} from './invoice-review';

const line = (id: string, description: string, quantity: string, unitPrice: string) => ({ id, description, quantity, unitPrice });
const L1 = line('li-1', 'Consulting (hourly)', '2', '120.00');
const L2 = line('li-2', 'Site inspection', '1', '85.50');
const L3 = line('li-3', 'Materials', '4', '42.90');

const BASELINE: InvoiceValues = {
  supplier: 'Rossi Construction Ltd',
  status: 'pending',
  amount: '120.00',
  date: '2026-02-03',
  dueDate: '2026-03-05',
  notes: 'Payment terms: 30 days from the invoice date.',
  lineItems: [L1, L2, L3],
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
    values.notes === BASELINE.notes &&
    sameLines(values.lineItems, BASELINE.lineItems)
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
      values: { ...BASELINE, supplier: 'X', status: 'rejected', amount: '1', date: '2026-01-01', dueDate: '2026-01-02', notes: 'n' },
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

  it('the dialog options: title, labels, default tone, initial focus on "Keep editing"', () => {
    const review = invoiceSaveReview({ values: edit({ notes: 'x' }), baseline: BASELINE });
    expect(review).toMatchObject({
      title: 'Review changes',
      confirmLabel: 'Save changes',
      cancelLabel: 'Keep editing',
      tone: 'default',
      initialFocus: 'cancel',
    });
  });
});

describe('invoice review (#379): line items, by id', () => {
  const withLines = (lineItems: InvoiceValues['lineItems']) => edit({ lineItems });
  const texts = (values: InvoiceValues) => {
    cleanup();
    return reviewItems(values).map((item) => read(item));
  };

  it('is configured with arrayIdKeys { lineItems: "id" }', () => {
    expect(INVOICE_REVIEW_ARRAY_ID_KEYS).toEqual({ lineItems: 'id' });
  });

  it('a quantity changed: ONE "changed" entry for that field of that row, as a number', () => {
    const values = withLines([L1, { ...L2, quantity: '3' }, L3]);
    const entries = invoiceReviewEntries({ values, baseline: BASELINE });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: 'changed', path: 'lineItems.1.quantity', before: '1', after: '3' });
    expect(texts(values)).toEqual(['Line items > Item 2 (Site inspection) > Quantity, changed, from 1 to 3']);
  });

  it('a unit price changed: rendered as money, labelled "Unit price"', () => {
    expect(texts(withLines([{ ...L1, unitPrice: '1234.5' }, L2, L3]))).toEqual([
      'Line items > Item 1 (Consulting [hourly]) > Unit price, changed, from €120.00 to €1,234.50',
    ]);
  });

  it('a description with parentheses never nests them in the label: "(urgent)" becomes "[urgent]" inside the disambiguation', () => {
    const repair = line('li-9', 'Repair (urgent)', '1', '50');
    const baseline = { ...BASELINE, lineItems: [repair] };
    const values = { ...BASELINE, lineItems: [{ ...repair, quantity: '2' }] };
    const entries = invoiceReviewEntries({ values, baseline });
    expect(entries.map((e) => e.label)).toEqual(['Line items > Item 1 (Repair [urgent]) > Quantity']);
    expect(entries[0]!.labelPath[1]).toBe('Item 1 (Repair [urgent])');
  });

  it('quantities are rendered as numbers: 1000 -> "1,000", 007 -> "7", for a changed field and for a whole row', () => {
    expect(texts(withLines([L1, L2, { ...L3, quantity: '1000' }]))).toEqual([
      'Line items > Item 3 (Materials) > Quantity, changed, from 4 to 1,000',
    ]);
    expect(texts(withLines([L1, L2, { ...L3, quantity: '007' }]))).toEqual([
      'Line items > Item 3 (Materials) > Quantity, changed, from 4 to 7',
    ]);
    expect(texts(withLines([L1, L2, L3, line('new-1', 'Bulk', '1000', '1')]))).toEqual([
      'Line items > Item 4, added, Bulk, 1,000 × €1.00',
    ]);
  });

  it('"Item N" is never ambiguous: removed row 1 and changed quantity of the row that moved up name their rows', () => {
    // Row 2 (Site inspection) becomes row 1 after row 1 goes away: both entries would read "Item 1" without a name.
    const values = withLines([{ ...L2, quantity: '7' }, L3]);
    expect(texts(values)).toEqual([
      'Line items > Item 1 (Site inspection) > Quantity, changed, from 1 to 7',
      'Line items > Item 1, removed, Consulting (hourly), 2 × €120.00',
    ]);
  });

  it('a new row moved to the top is not a reorder of the existing rows: no note', () => {
    const values = withLines([line('new-1', 'Permit', '1', '99'), L1, L2, L3]);
    expect(lineOrderChanged(values, BASELINE)).toBe(false);
    const review = invoiceSaveReview({ values, baseline: BASELINE });
    expect(review?.description).toBe('1 change will be saved.');
    render(<>{review?.children}</>);
    expect(screen.queryByText('The order of the line items also changed.')).toBeNull();
  });

  it('a quantity written differently but numerically equal is not a change (like sameLines)', () => {
    const values = withLines([{ ...L1, quantity: '2.0', unitPrice: '120' }, L2, L3]);
    expect(invoiceReviewEntries({ values, baseline: BASELINE })).toEqual([]);
    expect(formIsDirty(values)).toBe(false);
  });

  it('a line added: an "added" entry with what it holds; a line removed: "removed" with the values it had', () => {
    const added = line('new-1', 'Transport', '2', '60');
    expect(texts(withLines([L1, L2, L3, added]))).toEqual(['Line items > Item 4, added, Transport, 2 × €60.00']);
    expect(texts(withLines([L1, L3]))).toEqual(['Line items > Item 2, removed, Site inspection, 1 × €85.50']);
  });

  it('removing row 1 and changing row 3: row 3 is the SAME row (by id), not a moved row with every field changed', () => {
    const values = withLines([L2, { ...L3, quantity: '9' }]);
    const entries = invoiceReviewEntries({ values, baseline: BASELINE });
    expect(entries.map((e) => [e.kind, e.path])).toEqual([
      ['changed', 'lineItems.1.quantity'],
      ['removed', 'lineItems.0'],
    ]);
    expect(entries[0]).toMatchObject({ before: '4', after: '9' });
    expect(lineOrderChanged(values, BASELINE)).toBe(false);
  });

  it('only a reorder: dirty, no entry, its own description and no list', () => {
    const values = withLines([L3, L1, L2]);
    expect(formIsDirty(values)).toBe(true);
    expect(invoiceReviewEntries({ values, baseline: BASELINE })).toEqual([]);
    expect(lineOrderChanged(values, BASELINE)).toBe(true);
    const review = invoiceSaveReview({ values, baseline: BASELINE });
    expect(review?.description).toBe('Only the order of the line items changed.');
    expect(review?.children).toBeUndefined();
  });

  it('a reorder AND a change: "1 change will be saved." plus the note about the order', () => {
    const review = invoiceSaveReview({ values: withLines([L3, L1, { ...L2, quantity: '5' }]), baseline: BASELINE });
    expect(review?.description).toBe('1 change will be saved.');
    render(<>{review?.children}</>);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('The order of the line items also changed.')).toBeInTheDocument();
  });

  it('no note when the order did not change', () => {
    const review = invoiceSaveReview({ values: withLines([L1, L2, { ...L3, quantity: '5' }]), baseline: BASELINE });
    render(<>{review?.children}</>);
    expect(screen.queryByText('The order of the line items also changed.')).toBeNull();
  });

  it('removed and re-added with the same content: a new id, so "removed" + "added" (declared behaviour)', () => {
    const values = withLines([L1, L2, { ...L3, id: 'new-1' }]);
    expect(invoiceReviewEntries({ values, baseline: BASELINE }).map((e) => e.kind).sort()).toEqual(['added', 'removed']);
  });

  it('added then removed before saving: the values equal the baseline, no entry, not dirty, no review', () => {
    expect(formIsDirty(withLines([L1, L2, L3]))).toBe(false);
    expect(invoiceSaveReview({ values: withLines([L1, L2, L3]), baseline: BASELINE })).toBeNull();
  });

  // The coherence rule: whatever the combination, a dirty form always gets a review, with at least one entry
  // unless it is the one declared exception (a mere reorder).
  const combos = Array.from({ length: 32 }, (_, n) => ({
    add: (n & 1) !== 0,
    remove: (n & 2) !== 0,
    change: (n & 4) !== 0,
    reorder: (n & 8) !== 0,
    addAtTop: (n & 16) !== 0,
  }));
  it.each(combos)('coherence: %o', ({ add, remove, change, reorder, addAtTop }) => {
    let lines = [L1, L2, L3];
    if (change) lines = lines.map((l) => (l.id === 'li-3' ? { ...l, quantity: '9' } : l));
    if (reorder) {
      const [a, b] = [lines.findIndex((l) => l.id === 'li-2'), lines.findIndex((l) => l.id === 'li-3')];
      [lines[a], lines[b]] = [lines[b]!, lines[a]!];
    }
    if (remove) lines = lines.filter((l) => l.id !== 'li-1');
    if (add) lines = addAtTop ? [line('new-1', 'Transport', '1', '60'), ...lines] : [...lines, line('new-1', 'Transport', '1', '60')];
    const values = withLines(lines);
    const entries = invoiceReviewEntries({ values, baseline: BASELINE });
    const review = invoiceSaveReview({ values, baseline: BASELINE });
    const dirty = formIsDirty(values);
    expect(dirty).toBe(add || remove || change || reorder);
    expect(review !== null).toBe(dirty);
    expect(entries).toHaveLength(Number(add) + Number(remove) + Number(change));
    if (dirty && entries.length === 0) {
      // The one declared exception.
      expect(reorder).toBe(true);
      expect(review?.description).toBe('Only the order of the line items changed.');
    }
    expect(lineOrderChanged(values, BASELINE)).toBe(reorder);
  });
});
