import { act, useState, type ReactElement } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ListReportTableShell } from './ListReportTableShell';
import { ListReportFrame, type ListReportFrameProps } from './ListReportFrame';
import { getNumberFormat, resolveLocales } from './number-format';
import type { ListReportColumn, ListReportFilter } from './types';
import { useListReport } from './use-list-report';

interface Item {
  id: string;
  name: string;
  some: boolean;
}
const ROWS: Item[] = Array.from({ length: 10_000 }, (_, i) => ({ id: `r${i}`, name: `Item ${i}`, some: i % 3 !== 0 }));
const COLUMNS: ListReportColumn<Item>[] = [{ id: 'name', header: 'Name', accessor: (r) => r.name }];
const FILTERS: ListReportFilter<Item>[] = [
  { id: 'all', label: 'All' },
  { id: 'some', label: 'Some', predicate: (r) => r.some },
];

type Locale = string | string[] | undefined;
function Host({ locale, defaultFilter, labels }: { locale?: Locale; defaultFilter?: string; labels?: ListReportFrameProps<Item>['labels'] }) {
  const table = useListReport<Item>({ rows: ROWS, columns: COLUMNS, getRowId: (r) => r.id, filters: FILTERS, defaultFilter, selectable: true, locale });
  // The frame without a table: 10,000 rows are never rendered (jsdom would take seconds), only the count and the bar.
  return <ListReportFrame table={table} title="Invoices" labels={labels} renderTable={() => null} />;
}

const count = () => document.querySelector('[data-rop-count]') as HTMLElement;
const selectionText = () => (document.querySelector('[data-rop-selection-count]') as HTMLElement).textContent;
const runtime = (n: number) => new Intl.NumberFormat(undefined).format(n);

afterEach(cleanup);

describe('number formatting of the default texts', () => {
  it('en-US: "(10,000)" and, with a filter, "(6,666 of 10,000)"', () => {
    render(<Host locale="en-US" />);
    expect(count()).toHaveTextContent('(10,000)');
    cleanup();
    render(<Host locale="en-US" defaultFilter="some" />);
    expect(count()).toHaveTextContent('(6,666 of 10,000)');
  });

  it('de-DE: "(10.000)"; fr-FR: whatever Intl says', () => {
    render(<Host locale="de-DE" />);
    expect(count()).toHaveTextContent('(10.000)');
    cleanup();
    render(<Host locale="fr-FR" />);
    expect(count().textContent).toBe(`(${new Intl.NumberFormat('fr-FR').format(10_000)})`);
  });

  it('no locale: Intl.NumberFormat(undefined), the library never reads navigator.language', () => {
    const lang = vi.spyOn(navigator, 'language', 'get').mockReturnValue('de-DE');
    const langs = vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['de-DE']);
    try {
      render(<Host />);
      expect(count().textContent).toBe(`(${runtime(10_000)})`);
      expect(lang).not.toHaveBeenCalled();
      expect(langs).not.toHaveBeenCalled();
    } finally {
      lang.mockRestore();
      langs.mockRestore();
    }
  });

  it.each([['en_US'], [''], [['!!']], [[]]])('invalid locale %j: no exception, the runtime default', (locale) => {
    render(<Host locale={locale as Locale} />);
    expect(count().textContent).toBe(`(${runtime(10_000)})`);
  });

  it.each([
    ['absent', undefined],
    ['en_US', 'en_US'],
    ['empty string', ''],
    ['["!!"]', ['!!']],
    ['[]', []],
  ])('%s: Intl.NumberFormat receives undefined, the runtime default (not a fixed locale)', (_name, locale) => {
    const spy = vi.spyOn(Intl, 'NumberFormat');
    try {
      render(<Host locale={locale as Locale} />);
      expect(spy).toHaveBeenCalled();
      for (const call of spy.mock.calls) expect(call[0]).toBeUndefined();
    } finally {
      spy.mockRestore();
    }
  });

  it('an array uses the first supported locale, as Intl does', () => {
    render(<Host locale={['de-DE', 'en-US']} />);
    expect(count()).toHaveTextContent('(10.000)');
    cleanup();
    render(<Host locale={['!!', 'de-DE']} />);
    expect(count()).toHaveTextContent('(10.000)');
  });

  it("ar-EG: no exception, the digits are Intl's", () => {
    render(<Host locale="ar-EG" />);
    expect(count().textContent).toBe(`(${new Intl.NumberFormat('ar-EG').format(10_000)})`);
  });

  it('selection text: "1,234 selected (56 hidden by filters)"; "No items selected" unchanged', async () => {
    const rows = ROWS.slice(0, 1290);
    const all = new Set(rows.map((r) => r.id));
    function Sel() {
      const table = useListReport<Item>({
        rows,
        columns: COLUMNS,
        getRowId: (r) => r.id,
        filters: [{ id: 'all', label: 'All' }, { id: 'lt', label: 'Low', predicate: (r) => Number(r.id.slice(1)) < 1234 }],
        selectable: true,
        locale: 'en-US',
        defaultSelectedIds: all,
        defaultFilter: 'lt',
      });
      return <ListReportFrame table={table} title="Invoices" renderTable={() => null} />;
    }
    render(<Sel />);
    expect(selectionText()).toBe('1,234 selected (56 hidden by filters)');
    cleanup();
    render(<Host locale="en-US" />);
    expect(selectionText()).toBe('No items selected');
  });

  it.each([
    ['en-US', '1,234 selected (1,056 hidden by filters)'],
    ['de-DE', '1.234 selected (1.056 hidden by filters)'],
  ])('selection text with 1,000+ rows hidden by the filter (%s): the hidden number is formatted too', (locale, expected) => {
    const rows = ROWS.slice(0, 2290);
    function Sel() {
      const table = useListReport<Item>({
        rows,
        columns: COLUMNS,
        getRowId: (r) => r.id,
        filters: [{ id: 'all', label: 'All' }, { id: 'lt', label: 'Low', predicate: (r) => Number(r.id.slice(1)) < 1234 }],
        selectable: true,
        locale,
        defaultSelectedIds: new Set(rows.slice(0, 2290).map((r) => r.id)),
        defaultFilter: 'lt',
      });
      return <ListReportFrame table={table} title="Invoices" renderTable={() => null} />;
    }
    render(<Sel />);
    expect(selectionText()).toBe(expected);
  });

  it('custom labels receive raw numbers; partial labels keep the formatted defaults', () => {
    const custom = vi.fn((r: number, t: number) => `[${r}/${t}]`);
    render(<Host locale="de-DE" labels={{ count: custom }} />);
    expect(count()).toHaveTextContent('[10000/10000]');
    expect(custom).toHaveBeenCalledWith(10_000, 10_000);
    cleanup();
    render(<Host locale="de-DE" labels={{ clearSelection: 'Reset' }} />);
    expect(count()).toHaveTextContent('(10.000)');
  });

  it('a locale change re-formats the count without a flash', () => {
    const { rerender } = render(<Host locale="en-US" />);
    expect(count()).toHaveTextContent('(10,000)');
    rerender(<Host locale="de-DE" />);
    expect(count()).toHaveTextContent('(10.000)');
    expect(count()).not.toHaveAttribute('data-changed');
  });

  it('the count never wraps inside the number (nowrap)', () => {
    render(<Host locale="fr-FR" />);
    expect(count()).toHaveClass('whitespace-nowrap');
  });

  it('a custom labels.count wraps (no nowrap): a long text never widens the page', () => {
    render(<Host locale="de-DE" labels={{ count: () => 'a long custom count text' }} />);
    expect(count()).toHaveClass('whitespace-normal');
    expect(count()).not.toHaveClass('whitespace-nowrap');
  });

  it('table.locale hands the option back', () => {
    let seen: unknown = 'unset';
    function Probe({ locale }: { locale?: Locale }) {
      seen = useListReport<Item>({ rows: [], columns: COLUMNS, getRowId: (r) => r.id, locale }).locale;
      return null;
    }
    render(<Probe locale={['de-DE', 'en-US']} />);
    expect(seen).toEqual(['de-DE', 'en-US']);
    cleanup();
    render(<Probe />);
    expect(seen).toBeUndefined();
  });
});

// The live region of the table: filled on a change of state, never at mount. Loading -> ready announces the count.
function LiveHost({ locale, labels, rows = ROWS }: { locale?: Locale; labels?: ListReportFrameProps<Item>['labels']; rows?: Item[] }) {
  const table = useListReport<Item>({ rows, columns: COLUMNS, getRowId: (r) => r.id, locale });
  const [status, setStatus] = useState<'loading' | 'ready'>('loading');
  return (
    <>
      <button onClick={() => setStatus('ready')}>ready</button>
      <span data-rop-count>{`(${getNumberFormat(table.locale).format(table.resultCount)})`}</span>
      <ListReportTableShell caption="Invoices" table={table} status={status} labels={labels} renderBody={() => null} />
    </>
  );
}
const live = () => document.querySelector('[aria-live="polite"]') as HTMLElement;
const announceReady = (ui: ReactElement) => {
  render(ui);
  expect(live().textContent).toBe('');
  fireEvent.click(screen.getByText('ready'));
  return live().textContent;
};

describe('the default announcement of the results (live region)', () => {
  it('en-US "10,000 results"; de-DE "10.000 results"; fr-FR the characters of Intl, unnormalized', () => {
    expect(announceReady(<LiveHost locale="en-US" />)).toBe('10,000 results');
    cleanup();
    expect(announceReady(<LiveHost locale="de-DE" />)).toBe('10.000 results');
    cleanup();
    expect(announceReady(<LiveHost locale="fr-FR" />)).toBe(`${new Intl.NumberFormat('fr-FR').format(10_000)} results`);
    expect(live().textContent).toContain('\u202f');
  });

  it('one result stays "1 result"; 0 results announces the no-data state, unchanged', () => {
    expect(announceReady(<LiveHost locale="de-DE" rows={ROWS.slice(0, 1)} />)).toBe('1 result');
    cleanup();
    expect(announceReady(<LiveHost locale="de-DE" rows={[]} />)).toBe('No data');
  });

  it.each([
    ['absent', undefined],
    ['en_US', 'en_US'],
    ['empty string', ''],
    ['["!!"]', ['!!']],
  ])('%s: Intl.NumberFormat receives undefined, the runtime default; navigator.language is not read', (_name, locale) => {
    const lang = vi.spyOn(navigator, 'language', 'get').mockReturnValue('de-DE');
    const spy = vi.spyOn(Intl, 'NumberFormat');
    try {
      expect(announceReady(<LiveHost locale={locale as Locale} />)).toBe(`${runtime(10_000)} results`);
      expect(spy).toHaveBeenCalled();
      for (const call of spy.mock.calls) expect(call[0]).toBeUndefined();
      expect(lang).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
      lang.mockRestore();
    }
  });

  it('an array uses the first supported locale', () => {
    expect(announceReady(<LiveHost locale={['de-DE', 'en-US']} />)).toBe('10.000 results');
  });

  it('ar-EG and one million: no exception, the number of Intl', () => {
    const rows = Array.from({ length: 1_000_000 }, (_, i) => ({ id: `r${i}`, name: '', some: true }));
    expect(announceReady(<LiveHost locale="ar-EG" rows={rows} />)).toBe(`${new Intl.NumberFormat('ar-EG').format(1_000_000)} results`);
  });

  it('a custom labels.resultCount receives the raw number and its text is announced as is', () => {
    const custom = vi.fn((n: number) => `found ${n}`);
    expect(announceReady(<LiveHost locale="de-DE" labels={{ resultCount: custom }} />)).toBe('found 10000');
    expect(custom).toHaveBeenCalledWith(10_000);
  });

  it('partial labels (no resultCount) keep the formatted default', () => {
    expect(announceReady(<LiveHost locale="de-DE" labels={{ retry: 'Again' }} />)).toBe('10.000 results');
  });

  it('same formatted number as the visible count', () => {
    const text = announceReady(<LiveHost locale="fr-FR" />);
    expect(`(${text!.replace(' results', '')})`).toBe(count().textContent);
  });

  it('a locale change with the same results announces nothing new', () => {
    const { rerender } = render(<LiveHost locale="en-US" />);
    fireEvent.click(screen.getByText('ready'));
    expect(live().textContent).toBe('10,000 results');
    rerender(<LiveHost locale="de-DE" />);
    expect(live().textContent).toBe('10,000 results');
  });
});

describe('default selection text without hidden rows', () => {
  it('"n selected" is formatted (en-US, de-DE)', () => {
    const rows = ROWS.slice(0, 1500);
    function Sel({ locale }: { locale: string }) {
      const table = useListReport<Item>({
        rows,
        columns: COLUMNS,
        getRowId: (r) => r.id,
        selectable: true,
        locale,
        defaultSelectedIds: new Set(rows.slice(0, 1234).map((r) => r.id)),
      });
      return <ListReportFrame table={table} title="Invoices" renderTable={() => null} />;
    }
    render(<Sel locale="en-US" />);
    expect(selectionText()).toBe('1,234 selected');
    cleanup();
    render(<Sel locale="de-DE" />);
    expect(selectionText()).toBe('1.234 selected');
  });
});

describe('number-format helpers', () => {
  it('resolveLocales drops invalid tags and falls back to undefined', () => {
    expect(resolveLocales('de-DE')).toEqual(['de-DE']);
    expect(resolveLocales(['!!', 'en-US'])).toEqual(['en-US']);
    expect(resolveLocales(['!!'])).toBeUndefined();
    expect(resolveLocales('')).toBeUndefined();
    expect(resolveLocales(undefined)).toBeUndefined();
  });
  it('getNumberFormat is memoized per locale list', () => {
    expect(getNumberFormat('de-DE')).toBe(getNumberFormat(['de-DE']));
    expect(getNumberFormat('de-DE')).not.toBe(getNumberFormat('en-US'));
  });
});

describe('ListReport hydration with an explicit locale', () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  it('renderToString + hydrateRoot (de-DE): no mismatch, no warning', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warns = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const recoverable = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    try {
      const html = renderToString(<Host locale="de-DE" />);
      expect(html).toContain('(10.000)');
      container.innerHTML = html;
      let root: ReturnType<typeof hydrateRoot> | undefined;
      await act(async () => {
        root = hydrateRoot(container, <Host locale="de-DE" />, { onRecoverableError: recoverable });
      });
      expect(recoverable).not.toHaveBeenCalled();
      expect(errors).not.toHaveBeenCalled();
      expect(warns).not.toHaveBeenCalled();
      act(() => root!.unmount());
    } finally {
      container.remove();
      errors.mockRestore();
      warns.mockRestore();
    }
  });
});
