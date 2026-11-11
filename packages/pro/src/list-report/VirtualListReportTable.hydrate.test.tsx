import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { useListReport, type ListReportColumn } from '@formrail/core';
import { VirtualListReportTable } from './VirtualListReportTable';
import { mockTableLayout } from '../../test/virtual-table-utils';

interface Item {
  id: string;
  name: string;
}
const ROWS: Item[] = Array.from({ length: 100_000 }, (_, i) => ({ id: `r${i}`, name: `Item ${i}` }));
const COLUMNS: ListReportColumn<Item>[] = [{ id: 'name', header: 'Name', accessor: (r) => r.name }];

function Table() {
  const table = useListReport<Item>({ rows: ROWS, columns: COLUMNS, getRowId: (r) => r.id, selectable: true });
  return <VirtualListReportTable table={table} aria-label="Items" />;
}

// What @testing-library/react sets up: `act` from 'react' needs it.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('VirtualListReportTable hydration', () => {
  it('hydrates the server HTML without a mismatch, then measures and narrows the range', async () => {
    const layout = mockTableLayout();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const recoverable = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    try {
      container.innerHTML = renderToString(<Table />);
      expect(container.querySelectorAll('tbody > tr[aria-rowindex]')).toHaveLength(28);
      let root: ReturnType<typeof hydrateRoot> | undefined;
      await act(async () => {
        root = hydrateRoot(container, <Table />, { onRecoverableError: recoverable });
      });
      expect(recoverable).not.toHaveBeenCalled();
      expect(errors).not.toHaveBeenCalled();
      // measured: 10 visible rows (mocked layout) + 10 overscan
      expect(container.querySelectorAll('tbody > tr[aria-rowindex]')).toHaveLength(20);
      act(() => root!.unmount());
    } finally {
      container.remove();
      layout.restore();
      errors.mockRestore();
    }
  });
});
