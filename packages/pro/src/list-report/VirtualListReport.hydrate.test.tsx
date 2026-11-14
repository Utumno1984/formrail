import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { useListReport, type ListReportColumn } from '@formrail/core';
import { VirtualListReport } from './VirtualListReport';
import { mockTableLayout } from '../../test/virtual-table-utils';

interface Item {
  id: string;
  name: string;
}
const ROWS: Item[] = Array.from({ length: 12_345 }, (_, i) => ({ id: `r${i}`, name: `Item ${i}` }));
const COLUMNS: ListReportColumn<Item>[] = [{ id: 'name', header: 'Name', accessor: (r) => r.name }];

function Report() {
  const table = useListReport<Item>({ rows: ROWS, columns: COLUMNS, getRowId: (r) => r.id, selectable: true, locale: 'de-DE' });
  return <VirtualListReport title="Items" table={table} />;
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('VirtualListReport hydration with an explicit locale', () => {
  it('renderToString + hydrateRoot (de-DE): the formatted count, no mismatch, no warning', async () => {
    const layout = mockTableLayout();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const recoverable = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    try {
      const html = renderToString(<Report />);
      expect(html).toContain('(12.345)');
      container.innerHTML = html;
      let root: ReturnType<typeof hydrateRoot> | undefined;
      await act(async () => {
        root = hydrateRoot(container, <Report />, { onRecoverableError: recoverable });
      });
      expect(recoverable).not.toHaveBeenCalled();
      expect(errors).not.toHaveBeenCalled();
      expect(container.querySelector('[data-rop-count]')).toHaveTextContent('(12.345)');
      act(() => root!.unmount());
    } finally {
      container.remove();
      layout.restore();
      errors.mockRestore();
    }
  });
});
