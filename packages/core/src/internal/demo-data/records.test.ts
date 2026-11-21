// @vitest-environment node
// What is specific to the neutral records (ticket #622): variety, neutrality, nested detail. The
// contract shared with every generator is in generators.test.ts.
import { CURRENCY_MINOR_DIGITS, DEMO_CURRENCIES } from './currency';
import {
  DOMAIN_TERMS,
  findDomainTerm,
  getRecordDetail,
  makeRecords,
  RECORD_CATEGORY_LABEL,
  RECORD_STATUS_LABEL,
  RECORD_STATUS_TONE,
  type DemoRecord,
} from './records';

/** Every text of a value, nested ones included, as `path: text`. */
function textsOf(value: unknown, path: string): [string, string][] {
  if (typeof value === 'string') return [[path, value]];
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => textsOf(child, `${path}.${key}`));
}

describe('makeRecords: shape and labels', () => {
  it('has generic labels for every status and category', () => {
    expect(RECORD_STATUS_LABEL).toEqual({ active: 'Active', pending: 'Pending', 'on-hold': 'On hold', archived: 'Archived' });
    expect(Object.keys(RECORD_STATUS_TONE)).toEqual(Object.keys(RECORD_STATUS_LABEL));
    expect(Object.values(RECORD_CATEGORY_LABEL)).toEqual(['Category A', 'Category B', 'Category C', 'Category D', 'Category E']);
  });

  it('builds ids and codes as documented and keeps amounts whole numbers (JPY without decimals)', () => {
    const rows = makeRecords(1000);
    expect(rows[0]!.id).toBe('rec-1');
    expect(rows[11]!.code).toBe('REC-00012');
    for (const row of rows) {
      expect(Number.isInteger(row.amountMinor) && row.amountMinor > 0, row.id).toBe(true);
      expect(Number.isInteger(row.quantity), row.id).toBe(true);
      if (CURRENCY_MINOR_DIGITS[row.currency] === 0) expect(row.amountMinor % 100, `${row.id} JPY`).toBe(0);
      if (row.dueOn !== null) expect(row.dueOn > row.createdOn, row.id).toBe(true);
    }
  });
});

describe('makeRecords: variety of the first 200 records', () => {
  const rows = makeRecords(200);

  it('has at least 10 names with accented letters', () => {
    expect(rows.filter((r) => /[^\p{ASCII}]/u.test(r.name)).length).toBeGreaterThanOrEqual(10);
  });

  it('has at least 10 descriptions over 120 characters and 10 under 30', () => {
    expect(rows.filter((r) => r.description.length > 120).length).toBeGreaterThanOrEqual(10);
    expect(rows.filter((r) => r.description.length < 30).length).toBeGreaterThanOrEqual(10);
  });

  it('has at least 15% of absent due dates (null, never an empty string)', () => {
    expect(rows.filter((r) => r.dueOn === null).length).toBeGreaterThanOrEqual(rows.length * 0.15);
    expect(rows.some((r) => (r.dueOn as unknown) === '')).toBe(false);
  });

  it('has about one due date in five absent over the first 1,000 records (15% to 30%)', () => {
    const share = makeRecords(1000).filter((r) => r.dueOn === null).length / 1000;
    expect(share).toBeGreaterThanOrEqual(0.15);
    expect(share).toBeLessThanOrEqual(0.3);
  });

  it('uses all four currencies, every status and every category', () => {
    expect(new Set(rows.map((r) => r.currency))).toEqual(new Set(DEMO_CURRENCIES));
    expect(new Set(rows.map((r) => r.status))).toEqual(new Set(Object.keys(RECORD_STATUS_LABEL)));
    expect(new Set(rows.map((r) => r.category))).toEqual(new Set(Object.keys(RECORD_CATEGORY_LABEL).map((k) => k)));
  });
});

describe('getRecordDetail', () => {
  it('returns the record plus a nested object, an address, rows with ids and tags', () => {
    const detail = getRecordDetail('rec-7');
    expect(detail).toMatchObject({ ...makeRecords(7)[6] });
    expect(detail.details.reference).toMatch(/^REF-\d{6}$/);
    expect(detail.location.line1).toBeTruthy();
    expect(Array.isArray(detail.items)).toBe(true);
    expect(Array.isArray(detail.tags)).toBe(true);
  });

  it('is always the same and deeply frozen', () => {
    expect(getRecordDetail('rec-12')).toEqual(getRecordDetail('rec-12'));
    const detail = getRecordDetail('rec-12');
    const frozen = (value: unknown): void => {
      if (value === null || typeof value !== 'object') return;
      expect(Object.isFrozen(value)).toBe(true);
      Object.values(value).forEach(frozen);
    };
    frozen(detail);
    expect(() => (detail.tags as string[]).push('x')).toThrow(TypeError);
  });

  it('has 0 to 8 items, with at least one record with none in the first 50 and one with 8 in the first 200', () => {
    const counts = makeRecords(200).map((r) => getRecordDetail(r.id).items.length);
    expect(counts.every((c) => c >= 0 && c <= 8)).toBe(true);
    expect(counts.slice(0, 50)).toContain(0);
    expect(counts).toContain(8);
  });

  it('gives each record tags without duplicates (they end up in a change summary)', () => {
    for (const row of makeRecords(1000)) {
      const { tags } = getRecordDetail(row.id);
      expect(new Set(tags).size, row.id).toBe(tags.length);
    }
  });

  it('labels items without logistics or training flavour', () => {
    const flavoured = /\b(delivery|shipping|transport|packaging|storage|training|dock)\b/i;
    const labels = new Set<string>();
    for (const row of makeRecords(1000)) for (const item of getRecordDetail(row.id).items) labels.add(item.label);
    expect([...labels].filter((label) => flavoured.test(label))).toEqual([]);
  });

  it('gives items ids that are unique per record and stable between calls', () => {
    for (const row of makeRecords(100)) {
      const ids = getRecordDetail(row.id).items.map((i) => i.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toEqual(getRecordDetail(row.id).items.map((i) => i.id));
      ids.forEach((id, n) => expect(id).toBe(`${row.id}-item-${n + 1}`));
    }
  });

  it('keeps JPY item amounts without decimals', () => {
    const jpy = makeRecords(200).filter((r) => r.currency === 'JPY');
    expect(jpy.length).toBeGreaterThan(0);
    for (const row of jpy) {
      for (const item of getRecordDetail(row.id).items) expect(item.amountMinor % 100).toBe(0);
    }
  });

  it('shows a null note on some records, never an empty one', () => {
    const notes = makeRecords(200).map((r) => getRecordDetail(r.id).details.notes);
    expect(notes).toContain(null);
    expect(notes).not.toContain('');
  });

  it.each(['rec-0', 'rec-01', 'x-1', '', 'rec-1.5'])('throws an explicit error for the unknown id %j', (id) => {
    expect(() => getRecordDetail(id)).toThrow(/no record/);
  });
});

describe('neutrality: DOMAIN_TERMS', () => {
  it('lists at least the required terms', () => {
    const lower = DOMAIN_TERMS.map((t) => t.toLowerCase());
    for (const term of [
      'invoice', 'supplier', 'customer', 'employee', 'purchase order', 'sales order', 'product', 'sku', 'warehouse',
      'stock', 'course', 'enrolment', 'enrollment', 'learner', 'cart', 'checkout', 'support case', 'ticket', 'payroll', 'vat',
    ]) {
      expect(lower, term).toContain(term);
    }
  });

  it('finds a term as a whole word, in any case, across a line break between two words', () => {
    expect(findDomainTerm('Customer record 4')).toBe('Customer');
    expect(findDomainTerm('paid the INVOICE late')).toBe('INVOICE');
    expect(findDomainTerm('a Purchase\n Order arrived')).toBe('Purchase\n Order');
    expect(findDomainTerm('the vat rate')).toBe('vat');
  });

  it('does not count a term inside another word', () => {
    expect(findDomainTerm('A productive day')).toBeUndefined();
    expect(findDomainTerm('Two tickets left')).toBeUndefined();
    expect(findDomainTerm('Scarte, vatican, discourse')).toBeUndefined();
    expect(findDomainTerm('Nothing to see here')).toBeUndefined();
  });

  it('the check fails, naming the field, on a record built on purpose', () => {
    const tampered: DemoRecord = { ...makeRecords(1)[0]!, description: 'Customer record with a long text' };
    const hits = textsOf(tampered, 'record').filter(([, text]) => findDomainTerm(text) !== undefined);
    expect(hits).toEqual([['record.description', 'Customer record with a long text']]);
  });

  it('no text of the first 1,000 records and of their details contains a domain term', () => {
    const hits: string[] = [];
    for (const row of makeRecords(1000)) {
      for (const [path, text] of textsOf(getRecordDetail(row.id), row.id)) {
        const term = findDomainTerm(text);
        if (term) hits.push(`${path}: "${term}" in "${text}"`);
      }
    }
    expect(hits).toEqual([]);
  });
});
