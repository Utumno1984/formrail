// @vitest-environment node
import { renderToString } from 'react-dom/server';
import { useListReport, type ListReportColumn } from '@formrail/core';
import { VirtualListReportTable } from './VirtualListReportTable';
import { VirtualListReport } from './VirtualListReport';

interface Item {
  id: string;
  name: string;
}
const ROWS: Item[] = Array.from({ length: 100_000 }, (_, i) => ({ id: `r${i}`, name: `Item ${i}` }));
const COLUMNS: ListReportColumn<Item>[] = [{ id: 'name', header: 'Name', accessor: (r) => r.name }];

function Table({ count, floorplan }: { count: number; floorplan?: boolean }) {
  const table = useListReport<Item>({ rows: ROWS.slice(0, count), columns: COLUMNS, getRowId: (r) => r.id, selectable: true });
  return floorplan ? <VirtualListReport title="Items" table={table} /> : <VirtualListReportTable table={table} aria-label="Items" />;
}

const count = (html: string, pattern: RegExp) => (html.match(pattern) ?? []).length;

describe('VirtualListReportTable on the server', () => {
  it('renders without window/document: the first ceil(800 / 47) + overscan rows and a sized bottom spacer', () => {
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
    const html = renderToString(<Table count={100_000} />);
    // ceil(800 / 47) = 18 visible rows + 10 overscan below
    expect(count(html, /<tr aria-rowindex="/g)).toBe(1 + 28); // the header row is aria-rowindex 1
    expect(html).toContain('aria-rowcount="100001"');
    expect(html).toContain('Item 27<');
    expect(html).not.toContain('Item 28<');
    // the bottom spacer is sized in CSS from the row height variable (exact before any measurement)
    expect(html).toContain('data-rop-spacer=""');
    expect(html).toContain(`calc((var(--rop-list-report-row-height) + 3px) * ${100_000 - 28})`);
  });

  it('below the threshold: every row, no spacer (the Free table)', () => {
    const html = renderToString(<Table count={50} />);
    expect(count(html, /<tr( class="[^"]*")?( data-selected="")?>\s*<td/g)).toBeGreaterThan(0);
    expect(html).not.toContain('data-rop-spacer');
    expect(html).toContain('Item 49<');
  });

  it('the floorplan renders on the server too', () => {
    const html = renderToString(<Table count={100_000} floorplan />);
    expect(html).toContain('Select all 100,000 results');
    expect(count(html, /<tr aria-rowindex="/g)).toBe(1 + 28);
  });
});
