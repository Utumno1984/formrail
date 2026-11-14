import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { selectionBarClass, selectionClearClass, selectionCountClass } from './list-report-styles';
import { ListReport, type ListReportProps } from './ListReport';
import { useListReport } from './use-list-report';

afterEach(cleanup);

interface Row {
  id: string;
}

function Host(props: Partial<Omit<ListReportProps<Row>, 'table'>>) {
  const table = useListReport<Row>({
    rows: [{ id: 'a' }],
    columns: [{ id: 'id', header: 'Id', accessor: (r) => r.id }],
    getRowId: (r) => r.id,
    selectable: true,
  });
  return <ListReport title="Invoices" table={table} {...props} />;
}

const bar = (): HTMLElement => screen.getByRole('group', { name: /Selection/ });

// #499: the layout variant of the selection bar is decided at render by the PRESENCE of `bulkActions`.
describe('selection bar layout variant (#499)', () => {
  it('without bulkActions the bar says so (one line below 640px)', () => {
    render(<Host />);
    expect(bar().getAttribute('data-rop-bulk-actions')).toBe('false');
  });

  it('with bulkActions the bar keeps the two-line variant', () => {
    render(<Host bulkActions={() => <button type="button">Approve</button>} />);
    expect(bar().getAttribute('data-rop-bulk-actions')).toBe('true');
  });

  it('a bulkActions that renders nothing still counts as "with actions": the prop decides, not the output', () => {
    render(<Host bulkActions={() => null} />);
    expect(bar().getAttribute('data-rop-bulk-actions')).toBe('true');
  });

  it('switching bulkActions on after mount flips the variant without remounting the bar', () => {
    const { rerender } = render(<Host />);
    const node = bar();
    rerender(<Host bulkActions={() => <button type="button">Approve</button>} />);
    expect(bar()).toBe(node);
    expect(node.getAttribute('data-rop-bulk-actions')).toBe('true');
  });

  it('DOM order = visual order: count, then actions, then "Clear selection"', () => {
    render(<Host bulkActions={() => <button type="button">Approve</button>} />);
    const kids = Array.from(bar().children).map((c) => c.textContent);
    expect(kids.indexOf('Approve')).toBeGreaterThan(kids.findIndex((t) => t?.startsWith('No items')));
    expect(kids.indexOf('Clear selection')).toBeGreaterThan(kids.indexOf('Approve'));
  });

  it('the classes: one line without bulkActions below 640px, two lines with them (full literals)', () => {
    expect(selectionBarClass).toContain('data-[rop-bulk-actions=false]:flex-nowrap');
    expect(selectionBarClass).toContain('sm:flex-nowrap');
    expect(selectionCountClass).toContain('group-data-[rop-bulk-actions=false]:flex-1');
    expect(selectionCountClass).toContain('basis-full');
    expect(selectionClearClass).toContain('whitespace-nowrap');
    expect(selectionClearClass).toContain('shrink-0');
  });
});
