import { useState, type CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { exampleStory } from '../internal/example-story';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Button } from '../button/Button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../dialog/Dialog';
import { storyControl, withoutControls } from '../internal/story-docs';
import { ListReportFilterBar } from './ListReportFilterBar';
import type { ListReportColumn, ListReportFilter } from './types';
import { useListReport } from './use-list-report';
import { RECORD_STATUS_LABEL, makeRecords, type DemoRecord, type DemoRecordStatus } from '../internal/demo-data';

// Neutral records (`makeRecords`, a demo universe with no business domain): 4 pending, 6 active, 1 on hold, 1 archived.
const RECORDS: DemoRecord[] = [...makeRecords(12)];

const COLUMNS: ListReportColumn<DemoRecord>[] = [
  { id: 'code', header: 'Code', accessor: (r) => r.code },
  { id: 'name', header: 'Name', accessor: (r) => r.name },
];

const FILTERS: ListReportFilter<DemoRecord>[] = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: RECORD_STATUS_LABEL.pending, predicate: (r) => r.status === 'pending' },
  { id: 'active', label: RECORD_STATUS_LABEL.active, predicate: (r) => r.status === 'active' },
  { id: 'on-hold', label: RECORD_STATUS_LABEL['on-hold'], predicate: (r) => r.status === 'on-hold' },
];

const LONG_FILTERS: ListReportFilter<DemoRecord>[] = [
  { id: 'all', label: 'All records created in the current period across every team and every category' },
  { id: 'pending', label: 'Pending review by the end of the month by the owner and the review team', predicate: (r) => r.status === 'pending' },
  { id: 'active', label: RECORD_STATUS_LABEL.active, predicate: (r) => r.status === 'active' },
];

interface DemoProps {
  filters?: ListReportFilter<DemoRecord>[];
  showSearch?: boolean;
  defaultFilter?: string;
  defaultSearchQuery?: string;
  searchCommitDelay?: number | null;
  filtersLabel?: string;
  searchLabel?: string;
  dir?: 'ltr' | 'rtl';
  onFilterChange?: (filter: string) => void;
  onSearchQueryChange?: (query: string) => void;
  /** Rendered after the bar, inside the same hook scope. */
  withRows?: boolean;
}

/** The bar and, next to it, the raw list of the resulting rows (what the table would show). */
function Demo({ filters = FILTERS, withRows = true, dir, showSearch, filtersLabel, searchLabel, ...options }: DemoProps) {
  const table = useListReport<DemoRecord>({ rows: RECORDS, columns: COLUMNS, getRowId: (r) => r.id, filters, ...options });
  return (
    <div dir={dir}>
      <ListReportFilterBar table={table} showSearch={showSearch} filtersLabel={filtersLabel} searchLabel={searchLabel} />
      {withRows ? (
        <ul data-testid="rows" style={{ margin: '16px 0 0', paddingInlineStart: 20 }}>
          {table.rows.map((r) => (
            <li key={r.id}>{r.name}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const PAGE: CSSProperties = { padding: 16, fontFamily: 'system-ui, sans-serif' };
const NO_CONTROLS = { controls: { disable: true } };

type DelayChoice = 0 | 300 | 800 | 'Enter only';

interface PlaygroundArgs {
  searchCommitDelay: DelayChoice;
  showSearch: boolean;
  filtersLabel: string;
  searchLabel: string;
  dir: 'ltr' | 'rtl';
  onFilterChange: (filter: string) => void;
  onSearchQueryChange: (query: string) => void;
}

const meta: Meta<PlaygroundArgs> = {
  title: 'Data/ListReportFilterBar',
  // The stories drive the component through a demo wrapper (`Meta<...Args>`): `never` keeps the docs
  // props table of the real component without forcing the wrapper's args to match its props.
  component: ListReportFilterBar as never,
  parameters: { layout: 'fullscreen' },
  argTypes: {
    showSearch: { control: 'boolean' },
    filtersLabel: { control: 'text' },
    searchLabel: { control: 'text' },
    // Set by the demo (`table` from useListReport, default texts).
    ...withoutControls('table', 'searchPlaceholder', 'clearSearchLabel', 'ref'),
    searchCommitDelay: storyControl({
      control: 'select',
      options: [0, 300, 800, 'Enter only'],
      mapping: { 0: 0, 300: 300, 800: 800, 'Enter only': null },
      description: 'An option of the hook, not a prop of the bar: `useListReport({ searchCommitDelay })` (ms); "Enter only" = `null`: commits only on Enter.',
    }),
    dir: storyControl({ control: 'radio', options: ['ltr', 'rtl'], description: '`dir` of the demo wrapper around the bar (RTL layout).' }),
    onFilterChange: storyControl({ control: false, description: 'An option of the hook: `useListReport({ onFilterChange })`.' }),
    onSearchQueryChange: storyControl({ control: false, description: 'An option of the hook: `useListReport({ onSearchQueryChange })`.' }),
  },
  args: {
    searchCommitDelay: 300,
    showSearch: true,
    filtersLabel: 'Filters',
    searchLabel: 'Search',
    dir: 'ltr',
    onFilterChange: fn(),
    onSearchQueryChange: fn(),
  },
};

export default meta;
type Story = StoryObj<PlaygroundArgs>;

const names = (canvas: ReturnType<typeof within>): string[] =>
  within(canvas.getByTestId('rows'))
    .queryAllByRole('listitem')
    .map((li) => li.textContent ?? '');

/** The names the list must show for a status pill and a search text, computed from the fixture (not copied). */
const matching = (status: DemoRecordStatus | undefined, query = ''): string[] =>
  RECORDS.filter(
    (r) =>
      (status === undefined || r.status === status) &&
      `${r.code} ${r.name}`.toLowerCase().includes(query.toLowerCase()),
  ).map((r) => r.name);

/**
 * Copy-paste example: one `table` from `useListReport({ filters })` drives both the filter bar (filter pills and search) and the `ListReportTable` that shows the result.
 */
export const Example: Story = {
  tags: ['example', '!visual'],
  ...exampleStory('ListReportFilterBar.example.tsx'),
};

/**
 * Demo code: "Show code" prints this story's demo wrapper with the live Controls, not code to paste (see
 * the example at the top of the page).
 *
 * Controls: `searchCommitDelay` (0 / 300 / 800 ms, or "Enter only" = only Enter commits), `showSearch`,
 * the two accessible names and `dir`. `onFilterChange` and `onSearchQueryChange` show up in Actions.
 * The play function moves from "All" to "Pending" with the arrow key, types "indigo" and presses
 * Enter (one `onSearchQueryChange('indigo')`, only the matching pending record left), then Escape
 * clears the search and the whole filter comes back.
 */
export const Playground: Story = {
  tags: ['playground'],
  render: ({ searchCommitDelay, ...rest }) => (
    <div style={PAGE}>
      <Demo searchCommitDelay={searchCommitDelay as number | null} {...rest} />
    </div>
  ),
  play: async ({ args, canvasElement }) => {
    // Written for the default configuration: with another label or without the search box (picked in
    // Controls or by a test) the scenario has nothing to type into.
    if (!args.showSearch || args.filtersLabel !== 'Filters' || args.searchLabel !== 'Search' || args.dir !== 'ltr') return;
    const canvas = within(canvasElement);
    canvas.getByRole('radio', { name: 'All' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(canvas.getByRole('radio', { name: 'Pending' })).toHaveAttribute('aria-checked', 'true');
    await expect(args.onFilterChange).toHaveBeenCalledTimes(1);
    await expect(args.onFilterChange).toHaveBeenCalledWith('pending');
    await expect(names(canvas)).toEqual(matching('pending'));

    const search = canvas.getByRole('searchbox', { name: 'Search' });
    await userEvent.click(search);
    await userEvent.type(search, 'indigo');
    await userEvent.keyboard('{Enter}');
    await expect(args.onSearchQueryChange).toHaveBeenCalledTimes(1);
    await expect(args.onSearchQueryChange).toHaveBeenCalledWith('indigo');
    await expect(names(canvas)).toEqual(matching('pending', 'indigo'));

    await userEvent.keyboard('{Escape}');
    await expect(search).toHaveValue('');
    await expect(search).toHaveFocus();
    await waitFor(() => expect(names(canvas)).toEqual(matching('pending')));
    await expect(args.onSearchQueryChange).toHaveBeenLastCalledWith('');
  },
};

/** Second pill active. */
export const ActiveFilter: Story = {
  tags: ['visual'],
  parameters: NO_CONTROLS,
  render: () => (
    <div style={PAGE}>
      <Demo defaultFilter="active" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('radio', { name: 'Active' })).toHaveAttribute('aria-checked', 'true');
    await expect(names(canvas)).toEqual(matching('active'));
  },
};

/** A search with text: the clear button is there. */
export const SearchWithText: Story = {
  tags: ['visual'],
  parameters: NO_CONTROLS,
  render: () => (
    <div style={PAGE}>
      <Demo defaultSearchQuery="indigo" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('searchbox')).toHaveValue('indigo');
    await expect(canvas.getByRole('button', { name: 'Clear search' })).toBeVisible();
    await expect(names(canvas)).toEqual(matching(undefined, 'indigo'));
  },
};

/** Labels longer than the bar: the pills stay inside it and the text wraps (nothing is cut). */
export const LongLabels: Story = {
  tags: ['visual'],
  parameters: NO_CONTROLS,
  render: () => (
    <div style={PAGE}>
      <div style={{ width: 'min(100%, 420px)' }}>
        <Demo filters={LONG_FILTERS} withRows={false} />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const pill = canvas.getByRole('radio', { name: /Pending review by/ });
    const bar = canvas.getByRole('search');
    await expect(pill.getBoundingClientRect().right).toBeLessThanOrEqual(bar.getBoundingClientRect().right + 1);
    const label = pill.firstElementChild as HTMLElement;
    await expect(label.scrollWidth).toBeLessThanOrEqual(label.clientWidth);
    // wrapped: taller than a one-line pill
    await expect(pill.getBoundingClientRect().height).toBeGreaterThan(canvas.getByRole('radio', { name: 'Active' }).getBoundingClientRect().height * 1.5);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(document.documentElement.clientWidth);
  },
};

/** No filters: only the search box (no empty radiogroup). */
export const SearchOnly: Story = {
  tags: ['visual'],
  parameters: NO_CONTROLS,
  render: () => (
    <div style={PAGE}>
      <Demo filters={[]} withRows={false} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('radiogroup')).toBeNull();
    await expect(canvas.getByRole('searchbox')).toBeVisible();
  },
};

/** `dir="rtl"`: Right and Left swap in the pill group; the clear button sits at the start side. */
export const Rtl: Story = {
  parameters: NO_CONTROLS,
  render: () => (
    <div style={PAGE}>
      <Demo dir="rtl" defaultSearchQuery="indigo" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    canvas.getByRole('radio', { name: 'All' }).focus();
    await userEvent.keyboard('{ArrowLeft}');
    await expect(canvas.getByRole('radio', { name: 'Pending' })).toHaveFocus();
  },
};

/** Fixture of the e2e suite: the search box inside a form that must not be submitted by Enter. */
export const InsideForm: Story = {
  parameters: NO_CONTROLS,
  render: () => {
    function FormDemo() {
      const [submits, setSubmits] = useState(0);
      return (
        <form
          style={PAGE}
          onSubmit={(event) => {
            event.preventDefault();
            setSubmits((n) => n + 1);
          }}
        >
          <Demo searchCommitDelay={null} />
          <output data-testid="submits">{submits}</output>
        </form>
      );
    }
    return <FormDemo />;
  },
};

/** Fixture of the e2e suite: a button outside the bar changes the controlled `searchQuery` while the user types. */
export const ExternalSearchQuery: Story = {
  parameters: NO_CONTROLS,
  render: () => {
    function ControlledDemo() {
      const [query, setQuery] = useState('');
      const table = useListReport<DemoRecord>({
        rows: RECORDS,
        columns: COLUMNS,
        getRowId: (r) => r.id,
        filters: FILTERS,
        searchQuery: query,
        onSearchQueryChange: setQuery,
        searchCommitDelay: null,
      });
      return (
        <div style={PAGE}>
          <ListReportFilterBar table={table} />
          <Button onClick={() => setQuery('kestrel')}>Set “kestrel”</Button>
          <output data-testid="committed">{table.searchQuery}</output>
        </div>
      );
    }
    return <ControlledDemo />;
  },
};

/** Fixture of the e2e suite: the bar in a Dialog; Escape on a non-empty search must not close it. */
export const InsideDialog: Story = {
  parameters: NO_CONTROLS,
  render: () => (
    <div style={PAGE}>
      <Dialog>
        <DialogTrigger asChild>
          <Button>Open filters</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Filter records</DialogTitle>
            <DialogDescription>Search among the records.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Demo />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  ),
};

/** Fixture of the e2e suite: the search box at the bottom of a long page, to be covered by the keyboard. */
export const KeyboardSafe: Story = {
  parameters: NO_CONTROLS,
  render: () => (
    <div style={{ ...PAGE, paddingBottom: 'var(--rop-keyboard-inset, 0px)' }} data-testid="kb-page">
      <div style={{ height: '120dvh' }}>Long content before the bar.</div>
      <Demo withRows={false} />
      <div style={{ height: '100dvh' }} />
    </div>
  ),
};
