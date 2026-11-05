// Proof that `@react-object-page/core/internal` resolves and builds end to end for
// @react-object-page/pro (ticket #230, smoke test item 4): Storybook (this file), the Pro build
// (`tsup`'s `external` includes the subpath) and typecheck. Deliberately minimal and temporary:
// #231 (the real virtualized List Report) replaces this file with its own stories.
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useListReport, type ListReportColumn } from '@react-object-page/core';
import {
  ListReportTableHead,
  ListReportTableRow,
  ListReportTableShell,
  type ListReportTableLabels,
} from '@react-object-page/core/internal';

interface Row {
  id: string;
  name: string;
}

const ROWS: Row[] = [
  { id: '1', name: 'Alpha' },
  { id: '2', name: 'Bravo' },
  { id: '3', name: 'Charlie' },
];
const COLUMNS: ListReportColumn<Row>[] = [{ id: 'name', header: 'Name', accessor: (r) => r.name }];

/** A table built the way `ListReportTable` itself is: `ListReportTableShell` + `renderBody`. */
function ShellDemo() {
  const table = useListReport<Row>({ rows: ROWS, columns: COLUMNS, getRowId: (r) => r.id });
  return (
    <ListReportTableShell
      table={table}
      aria-label="Internal entry proof (Shell)"
      renderBody={(ctx) => ctx.table.rows.map((row) => <ListReportTableRow key={ctx.table.getRowId(row)} table={table} row={row} selectable={ctx.selectable} labels={ctx.labels} />)}
    />
  );
}

/** `ListReportTableHead` used on its own, outside the Shell: proves it is independently importable. */
function HeadDemo() {
  const table = useListReport<Row>({ rows: ROWS, columns: COLUMNS, getRowId: (r) => r.id });
  const labels: ListReportTableLabels = {
    loading: 'Loading…',
    empty: 'No data',
    noResults: 'No results',
    error: 'Error',
    retry: 'Retry',
    clearFilters: 'Clear filters',
    resultCount: (count) => `${count} results`,
    selectAllResults: 'Select all results',
    selectRow: (label) => `Select ${label}`,
  };
  return (
    <table aria-label="Internal entry proof (Head only)">
      <ListReportTableHead table={table} selectable={false} labels={labels} />
      <tbody>
        {table.rows.map((row) => (
          <ListReportTableRow key={table.getRowId(row)} table={table} row={row} selectable={false} labels={labels} />
        ))}
      </tbody>
    </table>
  );
}

const meta: Meta = {
  title: 'Pro/Internal/Core internal entry (#230 proof)',
  parameters: { docs: { description: { component: 'Not a documented component: proves `@react-object-page/core/internal` resolves for @react-object-page/pro. Replaced by the real virtualized List Report in #231.' } } },
};

export default meta;
type Story = StoryObj;

export const ViaShell: Story = { render: () => <ShellDemo /> };
export const ViaHeadDirectly: Story = { render: () => <HeadDemo /> };
