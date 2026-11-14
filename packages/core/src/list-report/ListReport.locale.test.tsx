import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
