import { createRef, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ListReportFilterBar, type ListReportFilterBarProps } from './ListReportFilterBar';
import type { ListReportColumn, ListReportFilter, UseListReportOptions } from './types';
import { useListReport } from './use-list-report';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

interface Row {
  id: string;
  name: string;
  open: boolean;
}

const ROWS: Row[] = [
  { id: 'a', name: 'Rossi Mario', open: true },
  { id: 'b', name: 'Bianchi Anna', open: false },
  { id: 'c', name: 'Rossi Luca', open: true },
  { id: 'd', name: 'Verdi', open: false },
];
const COLUMNS: ListReportColumn<Row>[] = [{ id: 'name', header: 'Name', accessor: (r) => r.name }];
const FILTERS: ListReportFilter<Row>[] = [
  { id: 'all', label: 'Tutte' },
  { id: 'open', label: 'Aperte', predicate: (r) => r.open },
  { id: 'closed', label: 'Chiuse', predicate: (r) => !r.open },
];

type Extra = Partial<UseListReportOptions<Row>>;
type BarProps = Partial<Omit<ListReportFilterBarProps<Row>, 'table'>> & { 'data-testid'?: string };

function Harness({ options, bar, onRows }: { options?: Extra; bar?: BarProps; onRows?: (ids: string[]) => void }) {
  const table = useListReport<Row>({ rows: ROWS, columns: COLUMNS, getRowId: (r) => r.id, filters: FILTERS, ...options });
  onRows?.(table.rows.map((r) => r.id));
  return (
    <>
      <ListReportFilterBar table={table} {...bar} />
      <ul>
        {table.rows.map((r) => (
          <li key={r.id}>{r.name}</li>
        ))}
      </ul>
    </>
  );
}

const pills = () => screen.getAllByRole('radio');
const listed = () => within(screen.getByRole('list')).queryAllByRole('listitem').map((li) => li.textContent);

describe('ListReportFilterBar', () => {
  it('renders a named search landmark with a named radiogroup and one radio per filter, checked like lr.filter', () => {
    render(<Harness options={{ defaultFilter: 'open' }} />);
    const landmark = screen.getByRole('search', { name: 'Filters and search' });
    const group = within(landmark).getByRole('radiogroup', { name: 'Filters' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((r) => r.textContent)).toEqual(['Tutte', 'Aperte', 'Chiuse']);
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
    expect(within(landmark).getByRole('searchbox', { name: 'Search' })).toHaveAttribute('type', 'search');
  });

  it('defaults the search placeholder to "Search" and the clear button to "Clear search"', async () => {
    render(<Harness />);
    const box = screen.getByRole('searchbox', { name: 'Search' });
    expect(box).toHaveAttribute('placeholder', 'Search');
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
    await userEvent.type(box, 'x');
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeInTheDocument();
  });

  it('an explicit searchPlaceholder differs from the searchLabel, which stays the accessible name', () => {
    render(<Harness bar={{ searchPlaceholder: 'Find an invoice...' }} />);
    const box = screen.getByRole('searchbox', { name: 'Search' });
    expect(box).toHaveAttribute('placeholder', 'Find an invoice...');
  });

  it('with aria-labelledby the landmark gets no default aria-label', () => {
    render(
      <>
        <h2 id="bar-title">Invoices</h2>
        <Harness bar={{ 'aria-labelledby': 'bar-title' }} />
      </>,
    );
    const landmark = screen.getByRole('search', { name: 'Invoices' });
    expect(landmark).not.toHaveAttribute('aria-label');
    expect(screen.queryByRole('search', { name: 'Filters and search' })).toBeNull();
  });

  it('the labels and the landmark name can be overridden', () => {
    render(<Harness bar={{ filtersLabel: 'Stato', searchLabel: 'Cerca fatture', 'aria-label': 'Elenco fatture' }} />);
    expect(screen.getByRole('search', { name: 'Elenco fatture' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Stato' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Cerca fatture' })).toBeInTheDocument();
  });

  it('a click selects the pill: setFilter, a single checked radio, the rows follow', async () => {
    const onFilterChange = vi.fn();
    render(<Harness options={{ onFilterChange }} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Chiuse' }));
    expect(onFilterChange).toHaveBeenCalledOnce();
    expect(onFilterChange).toHaveBeenCalledWith('closed');
    expect(pills().map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true']);
    expect(listed()).toEqual(['Bianchi Anna', 'Verdi']);
  });

  describe('keyboard (radio group)', () => {
    it('has a single tab stop, the checked pill', () => {
      render(<Harness options={{ defaultFilter: 'open' }} />);
      expect(pills().map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
    });

    it('arrows move the focus and the selection, with wrap-around; up/down too', async () => {
      render(<Harness />);
      const [all, open, closed] = pills();
      all!.focus();
      await userEvent.keyboard('{ArrowRight}');
      expect(open).toHaveFocus();
      expect(open).toHaveAttribute('aria-checked', 'true');
      await userEvent.keyboard('{ArrowDown}');
      expect(closed).toHaveFocus();
      await userEvent.keyboard('{ArrowRight}');
      expect(all).toHaveFocus();
      expect(all).toHaveAttribute('aria-checked', 'true');
      await userEvent.keyboard('{ArrowLeft}');
      expect(closed).toHaveFocus();
      await userEvent.keyboard('{ArrowUp}');
      expect(open).toHaveFocus();
      expect(pills().map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
    });

    it('Home and End go to the first and the last pill', async () => {
      render(<Harness options={{ defaultFilter: 'open' }} />);
      pills()[1]!.focus();
      await userEvent.keyboard('{End}');
      expect(pills()[2]).toHaveFocus();
      expect(pills()[2]).toHaveAttribute('aria-checked', 'true');
      await userEvent.keyboard('{Home}');
      expect(pills()[0]).toHaveFocus();
      expect(pills()[0]).toHaveAttribute('aria-checked', 'true');
    });

    it('in dir="rtl" Right and Left are swapped', async () => {
      render(
        <div dir="rtl">
          <Harness options={{ defaultFilter: 'open' }} />
        </div>,
      );
      pills()[1]!.focus();
      await userEvent.keyboard('{ArrowRight}');
      expect(pills()[0]).toHaveFocus();
      await userEvent.keyboard('{ArrowLeft}');
      expect(pills()[1]).toHaveFocus();
    });

    it('a single filter: one checked pill, the arrows do nothing', async () => {
      const onFilterChange = vi.fn();
      render(<Harness options={{ filters: [FILTERS[0]!], onFilterChange }} />);
      expect(pills()).toHaveLength(1);
      pills()[0]!.focus();
      await userEvent.keyboard('{ArrowRight}{ArrowLeft}{Home}{End}');
      expect(pills()[0]).toHaveFocus();
      expect(pills()[0]).toHaveAttribute('aria-checked', 'true');
      expect(onFilterChange).not.toHaveBeenCalled();
    });

    it('when the active filter disappears from `filters` the first pill becomes the tab stop', () => {
      const { rerender } = render(<Harness options={{ filter: 'closed' }} />);
      expect(pills().map((r) => r.tabIndex)).toEqual([-1, -1, 0]);
      rerender(<Harness options={{ filter: 'closed', filters: FILTERS.slice(0, 2) }} />);
      expect(pills().map((r) => r.tabIndex)).toEqual([0, -1]);
      expect(pills().every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true);
    });
  });

  describe('without filters / without search', () => {
    it('no filters: only the search box, no empty radiogroup', () => {
      render(<Harness options={{ filters: [] }} />);
      expect(screen.queryByRole('radiogroup')).toBeNull();
      expect(screen.getByRole('searchbox')).toBeInTheDocument();
    });

    it('showSearch={false}: only the pills', () => {
      render(<Harness bar={{ showSearch: false }} />);
      expect(screen.queryByRole('searchbox')).toBeNull();
      expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    });
  });

  describe('search', () => {
    it('typing edits the draft and the rows change only after the delay', () => {
      vi.useFakeTimers();
      const onSearchQueryChange = vi.fn();
      render(<Harness options={{ onSearchQueryChange, searchCommitDelay: 500 }} />);
      const input = screen.getByRole('searchbox');
      fireEvent.change(input, { target: { value: 'ross' } });
      expect(input).toHaveValue('ross');
      expect(listed()).toHaveLength(4);
      act(() => void vi.advanceTimersByTime(499));
      expect(listed()).toHaveLength(4);
      act(() => void vi.advanceTimersByTime(1));
      expect(listed()).toEqual(['Rossi Mario', 'Rossi Luca']);
      expect(onSearchQueryChange).toHaveBeenCalledOnce();
    });

    it('Enter commits at once, a double Enter reports once, and an enclosing form is not submitted', async () => {
      const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
      const onSearchQueryChange = vi.fn();
      render(
        <form onSubmit={onSubmit}>
          <Harness options={{ onSearchQueryChange, searchCommitDelay: null }} />
        </form>,
      );
      await userEvent.type(screen.getByRole('searchbox'), 'rossi');
      expect(listed()).toHaveLength(4);
      await userEvent.keyboard('{Enter}{Enter}');
      expect(listed()).toEqual(['Rossi Mario', 'Rossi Luca']);
      expect(onSearchQueryChange).toHaveBeenCalledOnce();
      expect(onSearchQueryChange).toHaveBeenCalledWith('rossi');
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('Enter during an IME composition does not commit', () => {
      const onSearchQueryChange = vi.fn();
      render(<Harness options={{ onSearchQueryChange, searchCommitDelay: null }} />);
      const input = screen.getByRole('searchbox');
      fireEvent.change(input, { target: { value: 'ろ' } });
      fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
      fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
      expect(onSearchQueryChange).not.toHaveBeenCalled();
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(onSearchQueryChange).toHaveBeenCalledOnce();
    });

    it('shows defaultSearchQuery at mount without notifying', () => {
      const onSearchQueryChange = vi.fn();
      render(<Harness options={{ defaultSearchQuery: 'verdi', onSearchQueryChange }} />);
      expect(screen.getByRole('searchbox')).toHaveValue('verdi');
      expect(listed()).toEqual(['Verdi']);
      expect(onSearchQueryChange).not.toHaveBeenCalled();
    });

    it('pasted text with line breaks becomes spaces', () => {
      render(<Harness options={{ searchCommitDelay: null }} />);
      const input = screen.getByRole('searchbox') as HTMLInputElement;
      input.focus();
      fireEvent.paste(input, { clipboardData: { getData: () => 'rossi\r\nmario' } });
      expect(input).toHaveValue('rossi mario');
    });
  });

  describe('clear button and Escape', () => {
    it('the button exists only with a non-empty draft; clicking empties draft and committed at once and refocuses the input', async () => {
      const onSearchQueryChange = vi.fn();
      render(<Harness options={{ defaultSearchQuery: 'verdi', onSearchQueryChange }} />);
      expect(listed()).toEqual(['Verdi']);
      await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));
      expect(screen.getByRole('searchbox')).toHaveValue('');
      expect(screen.getByRole('searchbox')).toHaveFocus();
      expect(listed()).toHaveLength(4);
      expect(onSearchQueryChange).toHaveBeenCalledExactlyOnceWith('');
      expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
    });

    it('the button is not there for an empty draft, and is named by clearSearchLabel', () => {
      const { unmount } = render(<Harness />);
      expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
      unmount();
      render(<Harness options={{ defaultSearchQuery: 'x' }} bar={{ clearSearchLabel: 'Clear' }} />);
      expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
    });

    it('Escape with a draft clears it and is consumed (it does not reach the outside)', async () => {
      const outside = vi.fn();
      document.addEventListener('keydown', outside);
      render(<Harness options={{ defaultSearchQuery: 'verdi' }} />);
      screen.getByRole('searchbox').focus();
      await userEvent.keyboard('{Escape}');
      document.removeEventListener('keydown', outside);
      expect(screen.getByRole('searchbox')).toHaveValue('');
      expect(listed()).toHaveLength(4);
      expect(outside).not.toHaveBeenCalled();
    });

    it('Escape with an empty draft does nothing and is not stopped', async () => {
      const outside = vi.fn();
      document.addEventListener('keydown', outside);
      const onSearchQueryChange = vi.fn();
      render(<Harness options={{ onSearchQueryChange }} />);
      screen.getByRole('searchbox').focus();
      await userEvent.keyboard('{Escape}');
      document.removeEventListener('keydown', outside);
      expect(outside).toHaveBeenCalledOnce();
      expect(onSearchQueryChange).not.toHaveBeenCalled();
    });

    it('Escape typed elsewhere (a pill) is left alone, and the window listener is removed on unmount', async () => {
      const add = vi.spyOn(window, 'addEventListener');
      const remove = vi.spyOn(window, 'removeEventListener');
      const outside = vi.fn();
      document.addEventListener('keydown', outside);
      const { unmount } = render(<Harness options={{ defaultSearchQuery: 'verdi' }} />);
      pills()[0]!.focus();
      await userEvent.keyboard('{Escape}');
      document.removeEventListener('keydown', outside);
      expect(outside).toHaveBeenCalledOnce();
      expect(screen.getByRole('searchbox')).toHaveValue('verdi');
      const registered = add.mock.calls.filter(([type]) => type === 'keydown');
      unmount();
      expect(remove.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(registered.length);
    });

    it('Escape during an IME composition is left to the IME', () => {
      render(<Harness options={{ defaultSearchQuery: 'verdi' }} />);
      const input = screen.getByRole('searchbox');
      input.focus();
      fireEvent.keyDown(input, { key: 'Escape', isComposing: true });
      expect(input).toHaveValue('verdi');
    });
  });

  it('a controlled searchQuery changed from outside never takes back what is being typed', async () => {
    function Controlled() {
      const [query, setQuery] = useState('');
      const table = useListReport<Row>({
        rows: ROWS,
        columns: COLUMNS,
        getRowId: (r) => r.id,
        searchQuery: query,
        onSearchQueryChange: setQuery,
        searchCommitDelay: null,
      });
      return (
        <>
          <ListReportFilterBar table={table} />
          <button type="button" onClick={() => setQuery('verdi')}>
            esterno
          </button>
        </>
      );
    }
    render(<Controlled />);
    const input = screen.getByRole('searchbox') as HTMLInputElement;
    await userEvent.type(input, 'ross');
    await userEvent.click(screen.getByRole('button', { name: 'esterno' }));
    expect(input).toHaveValue('ross');
  });

  it('forwards the ref and the container props; className wins over the defaults', () => {
    const ref = createRef<HTMLDivElement>();
    render(<Harness bar={{ className: 'gap-0 custom', id: 'bar', 'data-testid': 'bar' }} />);
    const bar = screen.getByTestId('bar');
    expect(bar.id).toBe('bar');
    expect(bar.className).toContain('custom');
    expect(bar.className).toContain('gap-0');
    expect(bar.className).not.toContain('gap-y-2 ');
    // ref
    function WithRef() {
      const table = useListReport<Row>({ rows: ROWS, columns: COLUMNS, getRowId: (r) => r.id });
      return <ListReportFilterBar table={table} ref={ref} />;
    }
    render(<WithRef />);
    expect(ref.current).toHaveAttribute('role', 'search');
  });

  it('does not leak its own props onto the DOM', () => {
    render(
      <Harness
        bar={{ filtersLabel: 'F', searchLabel: 'S', searchPlaceholder: 'p', clearSearchLabel: 'C', showSearch: true, 'data-testid': 'bar' }}
        options={{ defaultSearchQuery: 'x' }}
      />,
    );
    const html = screen.getByTestId('bar').outerHTML;
    for (const name of ['table', 'filterslabel', 'searchlabel', 'searchplaceholder', 'clearsearchlabel', 'showsearch']) {
      expect(html.toLowerCase()).not.toMatch(new RegExp(`\\s${name}=`));
    }
    expect(screen.getByTestId('bar').attributes).not.toHaveProperty('table');
  });
});
