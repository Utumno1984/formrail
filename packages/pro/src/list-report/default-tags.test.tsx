import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useMemo } from 'react';
import { cleanup, render } from '@testing-library/react';
import { useListReport, type ListReportColumn } from '@formrail/core';
import { VirtualListReportTable } from './VirtualListReportTable';
import { mockTableLayout, normalizeIds } from '../../test/virtual-table-utils';

// `@default` of the Pro props (#476), as the core does in `default-tags.test.tsx` / `default-tags.allowlist.test.tsx`:
// the tag is READ from the TSDoc and compared with what the table does when the prop is omitted. Change the tag or
// the behaviour (`DEFAULT_THRESHOLD`, `DEFAULT_OVERSCAN`) and one of them fails.

const SOURCE = readFileSync(join(import.meta.dirname, 'VirtualListReportTable.tsx'), 'utf8');

/** The `@default` of `prop` in the TSDoc that precedes its declaration in `VirtualListReportTableProps`. */
function tagOf(prop: string): string | undefined {
  const re = new RegExp(`/\\*\\*((?:(?!\\*/)[\\s\\S])*?)\\*/\\s*${prop}\\?:`);
  return /@default\s+(\S+)/.exec(re.exec(SOURCE)?.[1] ?? '')?.[1];
}

interface Item {
  id: string;
  n: number;
}
const COLUMNS: ListReportColumn<Item>[] = [{ id: 'n', header: 'Number', accessor: (r) => r.n }];
const rowsOf = (count: number): Item[] => Array.from({ length: count }, (_, i) => ({ id: `r${i}`, n: i }));

function Host({ count, threshold, overscan }: { count: number; threshold?: number; overscan?: number }) {
  const rows = useMemo(() => rowsOf(count), [count]);
  const table = useListReport<Item>({ rows, columns: COLUMNS, getRowId: (r) => r.id });
  return <VirtualListReportTable table={table} aria-label="Items" virtualizeThreshold={threshold} overscan={overscan} />;
}

const html = (props: { count: number; threshold?: number; overscan?: number }) => {
  const out = normalizeIds(render(<Host {...props} />).container.innerHTML);
  cleanup();
  return out;
};
const mountedRows = (props: { count: number; threshold?: number; overscan?: number }) => {
  const { container } = render(<Host {...props} />);
  const n = container.querySelectorAll('tbody > tr[aria-rowindex]').length;
  cleanup();
  return n;
};
const isVirtualized = (h: string) => h.includes('data-rop-spacer');

let layout: ReturnType<typeof mockTableLayout>;
beforeEach(() => {
  layout = mockTableLayout();
});
afterEach(() => {
  cleanup();
  layout.restore();
});

describe('@default of the Pro props (VirtualListReportTable, inherited by VirtualListReport)', () => {
  it('the tags exist and are the numbers the table uses', () => {
    expect(tagOf('virtualizeThreshold')).toBe('200');
    expect(tagOf('overscan')).toBe('10');
  });

  it('virtualizeThreshold: with the prop omitted, 199 results are the Free table and 200 are virtualized, as with the tag value', () => {
    const threshold = Number(tagOf('virtualizeThreshold'));
    expect(isVirtualized(html({ count: threshold - 1 }))).toBe(false);
    expect(isVirtualized(html({ count: threshold }))).toBe(true);
    for (const count of [threshold - 1, threshold]) expect(html({ count })).toBe(html({ count, threshold }));
    // another threshold behaves differently, so the comparison above is not vacuous
    expect(html({ count: threshold, threshold: threshold + 1 })).not.toBe(html({ count: threshold }));
  });

  it('overscan: with the prop omitted, the same rows are mounted as with the tag value, and not as with another', () => {
    const overscan = Number(tagOf('overscan'));
    const count = 100_000;
    const omitted = mountedRows({ count });
    expect(omitted).toBeGreaterThan(0);
    expect(mountedRows({ count, overscan })).toBe(omitted);
    expect(mountedRows({ count, overscan: overscan + 1 })).toBeGreaterThan(omitted);
    expect(mountedRows({ count, overscan: overscan - 1 })).toBeLessThan(omitted);
  });
});
