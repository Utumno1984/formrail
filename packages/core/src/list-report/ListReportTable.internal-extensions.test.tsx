import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ListReportTableRow } from './ListReportTableRow';
import { ListReportTableShell } from './ListReportTableShell';
import type { ListReportColumn, UseListReportReturn } from './types';
import { useListReport } from './use-list-report';

// The three optional, non-breaking extensions of the `/internal` building blocks used by the Pro
// virtualized table (#231): `onToggle` and `renderCellOptions` on the Row, `headRowProps` on the Shell.

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

interface Item {
  id: string;
  name: string;
}

const ROWS: Item[] = [
  { id: 'a', name: 'Alpha' },
  { id: 'b', name: 'Bravo' },
];
const COLUMNS: ListReportColumn<Item>[] = [{ id: 'name', header: 'Name', accessor: (r) => r.name, truncate: false }];

function Host({
  onToggle,
  forceTruncate,
  headRowProps,
  onSelectedIdsChange,
}: {
  onToggle?: (table: UseListReportReturn<Item>) => (id: string, event: React.MouseEvent<HTMLInputElement>) => void;
  forceTruncate?: boolean;
  headRowProps?: React.HTMLAttributes<HTMLTableRowElement>;
  onSelectedIdsChange?: (ids: ReadonlySet<string>) => void;
}) {
  const table = useListReport<Item>({ rows: ROWS, columns: COLUMNS, getRowId: (r) => r.id, selectable: true, onSelectedIdsChange });
  return (
    <ListReportTableShell
      table={table}
      aria-label="Items"
      headRowProps={headRowProps}
      renderBody={(ctx) =>
        ctx.table.rows.map((row) => (
          <ListReportTableRow
            key={ctx.table.getRowId(row)}
            table={ctx.table}
            row={row}
            selectable={ctx.selectable}
            labels={ctx.labels}
            onToggle={onToggle?.(ctx.table)}
            renderCellOptions={forceTruncate ? { forceTruncate: true } : undefined}
          />
        ))
      }
    />
  );
}

describe('ListReportTableRow: onToggle', () => {
  it('without it the checkbox toggles the row (unchanged behaviour)', async () => {
    const onSelectedIdsChange = vi.fn();
    render(<Host onSelectedIdsChange={onSelectedIdsChange} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Alpha' }));
    expect(onSelectedIdsChange).toHaveBeenCalledTimes(1);
    expect([...onSelectedIdsChange.mock.calls[0]![0]]).toEqual(['a']);
    expect(screen.getByRole('checkbox', { name: 'Select Alpha' })).toBeChecked();
  });

  it('replaces selection.toggle: called once with the id and the click event (modifiers included)', async () => {
    const onSelectedIdsChange = vi.fn();
    const calls: { id: string; shift: boolean }[] = [];
    render(
      <Host
        onSelectedIdsChange={onSelectedIdsChange}
        onToggle={(table) => (id, event) => {
          calls.push({ id, shift: event.shiftKey });
          table.selection.setSelectedIds(new Set(['a', 'b']));
        }}
      />,
    );
    const user = userEvent.setup();
    await user.keyboard('{Shift>}');
    await user.click(screen.getByRole('checkbox', { name: 'Select Bravo' }));
    await user.keyboard('{/Shift}');
    expect(calls).toEqual([{ id: 'b', shift: true }]);
    // The handler decided the effect: both rows, in one gesture, and no extra `toggle`.
    expect(onSelectedIdsChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('checkbox', { name: 'Select Alpha' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Bravo' })).toBeChecked();
  });
});

describe('ListReportTableRow: renderCellOptions', () => {
  it('forceTruncate truncates a `truncate: false` column; without it the cell is not truncated', () => {
    const { container, unmount } = render(<Host />);
    const plain = container.querySelector('tbody td:last-child')!.innerHTML;
    unmount();
    const forced = render(<Host forceTruncate />).container.querySelector('tbody td:last-child')!.innerHTML;
    expect(plain).not.toBe(forced);
    expect(plain).toContain('min-w-0 overflow-hidden');
    expect(forced).not.toContain('min-w-0 overflow-hidden');
  });
});

describe('ListReportTableShell: headRowProps', () => {
  it('merges attributes onto the header row; without it the header row has none', () => {
    const { container, unmount } = render(<Host />);
    expect(container.querySelector('thead tr')!.attributes).toHaveLength(0);
    unmount();
    const withProps = render(<Host headRowProps={{ 'aria-rowindex': 1 }} />).container;
    expect(withProps.querySelector('thead tr')).toHaveAttribute('aria-rowindex', '1');
  });
});
