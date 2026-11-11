// Dedicated regression guard for #230 (splitting ListReport into ListReportFrame, so
// @formrail/pro can reuse it with a different table): the snapshot below was written
// against the code BEFORE that refactor and must stay byte-for-byte identical after it.
import { cleanup, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ListReport } from './ListReport';
import type { ListReportColumn, ListReportFilter } from './types';
import { useListReport } from './use-list-report';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

interface Row {
  id: string;
  number: string;
  open: boolean;
}

const ROWS: Row[] = [
  { id: 'a', number: 'INV-1', open: true },
  { id: 'b', number: 'INV-2', open: false },
];
const COLUMNS: ListReportColumn<Row>[] = [{ id: 'number', header: 'Number', accessor: (r) => r.number }];
const FILTERS: ListReportFilter<Row>[] = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open', predicate: (r) => r.open },
];

function Host({ selectable }: { selectable?: boolean }) {
  const table = useListReport<Row>({
    rows: ROWS,
    columns: COLUMNS,
    getRowId: (r) => r.id,
    filters: FILTERS,
    searchCommitDelay: null,
    selectable,
  });
  return <ListReport table={table} title="Invoices" actions={<button type="button">New</button>} />;
}

describe('ListReport DOM identity (#230: the packaging refactor must not change the DOM)', () => {
  it('not selectable', () => {
    const { container } = render(<Host />);
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('selectable, with a selection', async () => {
    const user = userEvent.setup();
    const { container } = render(<Host selectable />);
    await user.click(container.querySelector('input[aria-label="Select INV-1"]') as HTMLElement);
    expect(container.innerHTML).toMatchSnapshot();
  });
});
