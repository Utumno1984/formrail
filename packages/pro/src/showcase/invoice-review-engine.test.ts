// Ticket #424: the review step of the showcase reads its row labels and its reorder from the engine
// (`itemLabel`, `reorders`) instead of rebuilding them. Same results as the code it replaced, restated here.
import type { InvoiceReviewValues as InvoiceValues } from '../../../core/src/showcase/InvoiceRecordPage';
import { invoiceReview, invoiceReviewItemLabel, lineOrderChanged } from './invoice-review';

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
const withLines = (lineItems: InvoiceValues['lineItems']): InvoiceValues => ({ ...BASELINE, lineItems });

/** The id comparison `lineOrderChanged` made before #424, restated as the oracle. */
function previousLineOrderChanged(values: InvoiceValues, baseline: InvoiceValues): boolean {
  const before = baseline.lineItems.map((l) => l.id);
  const after = values.lineItems.map((l) => l.id);
  const inAfter = new Set(after);
  const common = new Set(before.filter((id) => inAfter.has(id)));
  const a = before.filter((id) => common.has(id));
  const b = after.filter((id) => common.has(id));
  return a.some((id, i) => id !== b[i]);
}

// The 32 combinations of the coherence test of #379.
const combos = Array.from({ length: 32 }, (_, n) => ({
  add: (n & 1) !== 0,
  remove: (n & 2) !== 0,
  change: (n & 4) !== 0,
  reorder: (n & 8) !== 0,
  addAtTop: (n & 16) !== 0,
}));

describe('invoice review from the engine (#424)', () => {
  it.each(combos)('reorders: the semantics of the previous lineOrderChanged, %o', ({ add, remove, change, reorder, addAtTop }) => {
    let lines = [L1, L2, L3];
    if (change) lines = lines.map((l) => (l.id === 'li-3' ? { ...l, quantity: '9' } : l));
    if (reorder) {
      const [a, b] = [lines.findIndex((l) => l.id === 'li-2'), lines.findIndex((l) => l.id === 'li-3')];
      [lines[a], lines[b]] = [lines[b]!, lines[a]!];
    }
    if (remove) lines = lines.filter((l) => l.id !== 'li-1');
    if (add) lines = addAtTop ? [line('new-1', 'Transport', '1', '60'), ...lines] : [...lines, line('new-1', 'Transport', '1', '60')];
    const values = withLines(lines);
    const { reorders } = invoiceReview({ values, baseline: BASELINE });
    expect(reorders.length > 0).toBe(previousLineOrderChanged(values, BASELINE));
    expect(reorders.length > 0).toBe(reorder);
    expect(reorders.map((r) => r.label)).toEqual(reorder ? ['Line items'] : []);
    expect(lineOrderChanged(values, BASELINE)).toBe(reorder);
  });

  it('itemLabel: the description on an enclosing row segment only, brackets for its parentheses, trimmed', () => {
    const context = (isLastSegment: boolean) => ({ path: 'lineItems.0', index: 0, side: 'values' as const, isLastSegment, defaultLabel: 'Item 1' });
    expect(invoiceReviewItemLabel('lineItems', L1, context(false))).toBe('Item 1 (Consulting [hourly])');
    expect(invoiceReviewItemLabel('lineItems', { ...L1, description: '  Repair (urgent)  ' }, context(false))).toBe('Item 1 (Repair [urgent])');
    // The whole row (added / removed) already shows its description as its value.
    expect(invoiceReviewItemLabel('lineItems', L1, context(true))).toBeUndefined();
    expect(invoiceReviewItemLabel('lineItems', { ...L1, description: '   ' }, context(false))).toBeUndefined();
    expect(invoiceReviewItemLabel('other', L1, context(false))).toBeUndefined();
    expect(invoiceReviewItemLabel('lineItems', 'not a row', context(false))).toBeUndefined();
  });

  it('entries and reorders from one call: a reorder plus a changed quantity of the moved row', () => {
    const values = withLines([L3, L1, { ...L2, quantity: '5' }]);
    expect(invoiceReview({ values, baseline: BASELINE })).toMatchObject({
      entries: [{ path: 'lineItems.2.quantity', label: 'Line items > Item 3 (Site inspection) > Quantity' }],
      reorders: [{ path: 'lineItems', labelPath: ['Line items'], label: 'Line items' }],
    });
  });
});
