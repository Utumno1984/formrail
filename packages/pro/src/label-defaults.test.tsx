import { cleanup, render } from '@testing-library/react';
import { useListReport, type ListReportColumn } from '@formrail/core';
import { checkLabelDefaults, readLabelRows, type LabelException, type LabelRow, type LabelSource } from '../../core/test/label-defaults';
import { DEFAULT_VALUE_LABELS } from './change-summary/format-change-value';
import { DEFAULT_REBASE_NOTICE_LABELS } from './form-rebase/RebaseNotice';
import { VirtualListReport } from './list-report/VirtualListReport';
import { mockTableLayout } from '../test/virtual-table-utils';

// #549: the documented default of every `*Labels` key of packages/pro is the value of the code. The generic check
// is the core's `test/label-defaults.ts` (Pro reads the core, never the other way round): the keys and their prose
// come from the guard's `measureLabels`, below is one source per Pro interface. The core keys (those Pro interfaces
// inherit too, `VirtualListReportLabels extends ListReportFrameLabels`) are checked by the core's test.

afterEach(cleanup);

const REGISTRY = 'packages/pro/src/label-defaults.test.tsx';
const inCore = (r: LabelRow) => r.file.startsWith('packages/core/');
const inPro = (r: LabelRow) => r.file.startsWith('packages/pro/');

/** Read once, at collection: the guard's TypeScript program takes a few seconds. */
const ROWS = readLabelRows();

/** Keys that cannot be verified, each with the reason. Empty: every key of Pro has a source. */
const LABEL_EXCEPTIONS: readonly LabelException[] = [];

/**
 * `VirtualListReportLabels.selectAllResultsAction`: its default is not in a constant (it formats the number in the
 * locale of `useListReport`), so it is read from a rendering with the 100,000 results of the prose's example, in
 * `en-US`. The button is rendered (hidden with `visibility`) even with nothing selected.
 */
function virtualListReportRendering(): Record<string, string> {
  interface Item {
    id: string;
    name: string;
  }
  const rows: Item[] = Array.from({ length: 100_000 }, (_, i) => ({ id: `r${i}`, name: `Item ${i}` }));
  const columns: ListReportColumn<Item>[] = [{ id: 'name', header: 'Name', accessor: (r) => r.name }];
  function Report() {
    const table = useListReport<Item>({ rows, columns, getRowId: (r) => r.id, selectable: true, locale: 'en-US' });
    return <VirtualListReport title="Items" table={table} />;
  }
  const layout = mockTableLayout();
  try {
    const { container, unmount } = render(<Report />);
    const action = container.querySelector('[data-rop-select-all-results]')?.textContent;
    if (!action) throw new Error('rendering of VirtualListReport: no "select all results" action');
    unmount();
    return { selectAllResultsAction: action };
  } finally {
    layout.restore();
  }
}

function labelSources(): LabelSource[] {
  return [
    {
      iface: 'ChangeSummaryValueLabels',
      from: 'DEFAULT_VALUE_LABELS of change-summary/format-change-value.ts',
      values: DEFAULT_VALUE_LABELS,
      // "`No items`, `1 item`, `N items`".
      examples: { items: [{ args: [0] }, { args: [1] }, { args: ['N'] }] },
    },
    {
      iface: 'RebaseNoticeLabels',
      from: 'DEFAULT_REBASE_NOTICE_LABELS of form-rebase/RebaseNotice.tsx',
      values: DEFAULT_REBASE_NOTICE_LABELS,
      // "`1 field was updated.` / `N fields were updated.`", and the same two forms for `conflicts`.
      examples: { applied: [{ args: [1] }, { args: ['N'] }], conflicts: [{ args: [1] }, { args: ['N'] }] },
    },
    {
      iface: 'VirtualListReportLabels',
      from: 'rendering of VirtualListReport (100,000 rows, en-US)',
      values: virtualListReportRendering(),
    },
  ];
}

describe('every documented default of a Pro *Labels key is the value of the code (#549)', () => {
  it('the guard reads keys in packages/pro, and every key it reads is in core or pro (none outside both)', () => {
    expect(ROWS.filter(inPro).length).toBeGreaterThan(0);
    expect(ROWS.filter((r) => !inCore(r) && !inPro(r))).toEqual([]);
  });

  it('every key read in packages/pro is verified by a source or excepted, and its prose equals the real value', () => {
    const result = checkLabelDefaults(ROWS, { sources: labelSources(), exceptions: LABEL_EXCEPTIONS, inScope: inPro, registry: REGISTRY });
    expect(result.problems).toEqual([]);
    const all = [...new Set(ROWS.filter((r) => inPro(r) && !r.collision).map((r) => `${r.iface}.${r.key}`))].sort();
    expect([...result.verified, ...result.excepted].sort()).toEqual(all);
  });

  it('every exception has a reason (the list is empty by default)', () => {
    for (const e of LABEL_EXCEPTIONS) expect(e.reason.trim(), `${e.iface}.${e.key}`).not.toBe('');
  });
});
