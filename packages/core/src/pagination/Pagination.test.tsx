import { createRef, useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Pagination } from './Pagination';

afterEach(() => vi.restoreAllMocks());

const buttons = () => within(screen.getByRole('navigation')).getAllByRole('button');
const names = () => buttons().map((b) => b.getAttribute('aria-label'));

describe('Pagination structure', () => {
  it('is a named nav with a list of buttons, the current page has aria-current', () => {
    render(<Pagination page={3} pageCount={10} />);
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Page 3' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Page 4' })).not.toHaveAttribute('aria-current');
  });

  it('labels (nav, buttons, page function) and aria-label are configurable', () => {
    const { rerender } = render(
      <Pagination
        page={2}
        pageCount={5}
        labels={{ navigation: 'Paginazione', previous: 'Precedente', next: 'Successiva', page: (n) => `Pagina ${n}` }}
      />,
    );
    expect(screen.getByRole('navigation', { name: 'Paginazione' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Precedente' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Successiva' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pagina 2' })).toHaveAttribute('aria-current', 'page');
    rerender(<Pagination page={2} pageCount={5} aria-label="Results" labels={{ navigation: 'Paginazione' }} />);
    expect(screen.getByRole('navigation', { name: 'Results' })).toBeInTheDocument();
  });

  it('ellipses are decorative: aria-hidden, not focusable, not buttons', () => {
    render(<Pagination page={60} pageCount={120} />);
    const hidden = screen.getByRole('navigation').querySelectorAll('li[aria-hidden="true"]');
    expect(hidden).toHaveLength(2);
    hidden.forEach((li) => expect(li.querySelector('button, a, [tabindex]')).toBeNull());
    expect(screen.getAllByRole('button')).toHaveLength(2 + 5);
  });

  it('the buttons are tab stops in order and the tab sequence is the same for every page', () => {
    render(<Pagination page={60} pageCount={120} />);
    expect(names()).toEqual(['Previous page', 'Page 1', 'Page 59', 'Page 60', 'Page 61', 'Page 120', 'Next page']);
  });
});

describe('Pagination edges', () => {
  it('first page: Previous disabled; last page: Next disabled', () => {
    const { rerender } = render(<Pagination page={1} pageCount={5} />);
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled();
    rerender(<Pagination page={5} pageCount={5} />);
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  it.each([0, 1, -3, Number.NaN, 0.4, Infinity])('pageCount %s renders a single current page "1" with both arrows disabled', (pageCount) => {
    render(<Pagination page={1} pageCount={pageCount} />);
    expect(names()).toEqual(['Previous page', 'Page 1', 'Next page']);
    expect(screen.getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  it('disabled disables every button and keeps the same markup shape', () => {
    const { rerender } = render(<Pagination page={60} pageCount={120} />);
    const before = names();
    rerender(<Pagination page={60} pageCount={120} disabled />);
    expect(names()).toEqual(before);
    buttons().forEach((b) => expect(b).toBeDisabled());
  });

  it('page above pageCount shows the last page, logs an error, and never calls onPageChange', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onPageChange = vi.fn();
    render(<Pagination page={9} pageCount={4} onPageChange={onPageChange} />);
    expect(screen.getByRole('button', { name: 'Page 4' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]![0])).toContain('outside 1..4');
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it.each([0, -2, Number.NaN, 1.7])('invalid page %s is treated as the first page without crashing', (page) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<Pagination page={page} pageCount={10} />);
    expect(screen.getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page');
  });

  it('a valid page does not log', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<Pagination page={3} pageCount={10} />);
    expect(error).not.toHaveBeenCalled();
  });
});

describe('Pagination controlled, no echo', () => {
  it('calls onPageChange on a click with the requested page, never for the current page', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={5} pageCount={10} onPageChange={onPageChange} />);
    await user.click(screen.getByRole('button', { name: 'Page 6' }));
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await user.click(screen.getByRole('button', { name: 'Previous page' }));
    await user.click(screen.getByRole('button', { name: 'Page 5' }));
    expect(onPageChange.mock.calls).toEqual([[6], [6], [4]]);
  });

  it('changing page or pageCount from outside never calls onPageChange', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onPageChange = vi.fn();
    const { rerender } = render(<Pagination page={5} pageCount={10} onPageChange={onPageChange} />);
    rerender(<Pagination page={6} pageCount={10} onPageChange={onPageChange} />);
    rerender(<Pagination page={6} pageCount={3} onPageChange={onPageChange} />);
    rerender(<Pagination page={6} pageCount={0} onPageChange={onPageChange} />);
    rerender(<Pagination page={2} pageCount={50} onPageChange={onPageChange} />);
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('a rapid double click on Next gives values consistent with the controlled page, never past the end', async () => {
    const user = userEvent.setup();
    const calls: number[] = [];
    function Host() {
      const [page, setPage] = useState(8);
      return (
        <Pagination
          page={page}
          pageCount={9}
          onPageChange={(n) => {
            calls.push(n);
            setPage(n);
          }}
        />
      );
    }
    render(<Host />);
    await user.dblClick(screen.getByRole('button', { name: 'Next page' }));
    expect(calls).toEqual([9]);
    expect(screen.getByRole('button', { name: 'Page 9' })).toHaveAttribute('aria-current', 'page');
  });

  it('a parent that does not update keeps asking for the same next page (no stale arithmetic)', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={3} pageCount={10} onPageChange={onPageChange} />);
    await user.dblClick(screen.getByRole('button', { name: 'Next page' }));
    expect(onPageChange.mock.calls).toEqual([[4], [4]]);
  });
});

describe('Pagination focus', () => {
  function Host({ initial, pageCount = 10 }: { initial: number; pageCount?: number }) {
    const [page, setPage] = useState(initial);
    return <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />;
  }

  it('Next disabled by the last page: the focus goes to the current page, not body', async () => {
    const user = userEvent.setup();
    render(<Host initial={9} />);
    screen.getByRole('button', { name: 'Next page' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Page 10' })).toHaveFocus();
  });

  it('Previous disabled at page 1: the focus goes to the current page', async () => {
    const user = userEvent.setup();
    render(<Host initial={2} />);
    screen.getByRole('button', { name: 'Previous page' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Page 1' })).toHaveFocus();
  });

  it('keyboard Enter repeated on Next up to the last page never leaves the focus on body', async () => {
    const user = userEvent.setup();
    render(<Host initial={1} pageCount={30} />);
    screen.getByRole('button', { name: 'Next page' }).focus();
    for (let i = 0; i < 29; i++) {
      await user.keyboard('{Enter}');
      expect(document.body).not.toHaveFocus();
    }
    expect(screen.getByRole('button', { name: 'Page 30' })).toHaveFocus();
  });

  it('a page number that moves in the list keeps the focus (keyed by number, same DOM node)', async () => {
    const user = userEvent.setup();
    render(<Host initial={1} pageCount={120} />);
    const five = screen.getByRole('button', { name: 'Page 5' }); // [1 2 3 4 5 … 120]
    await user.click(five);
    // now [1 … 4 5 6 … 120]: "5" is at another index
    const after = screen.getByRole('button', { name: 'Page 5' });
    expect(after).toBe(five);
    expect(after).toHaveFocus();
  });

  it('the focused button removed by a pageCount change: the focus goes to the current page', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(<Pagination page={2} pageCount={10} />);
    screen.getByRole('button', { name: 'Page 5' }).focus();
    rerender(<Pagination page={2} pageCount={4} />);
    expect(screen.queryByRole('button', { name: 'Page 5' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Page 2' })).toHaveFocus();
  });

  it('does not steal the focus when the user had moved it elsewhere', () => {
    const { rerender } = render(
      <>
        <Pagination page={2} pageCount={10} />
        <button>outside</button>
      </>,
    );
    screen.getByRole('button', { name: 'Page 5' }).focus();
    screen.getByRole('button', { name: 'outside' }).focus();
    rerender(
      <>
        <Pagination page={2} pageCount={4} />
        <button>outside</button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'outside' })).toHaveFocus();
  });

  it('does not steal the focus after the user blurred to nothing and the page later changes', () => {
    const { rerender } = render(<Pagination page={2} pageCount={10} />);
    const eight = screen.getByRole('button', { name: 'Page 5' });
    eight.focus();
    eight.blur();
    rerender(<Pagination page={2} pageCount={4} />);
    expect(document.body).toHaveFocus();
  });
});

describe('Pagination DOM hygiene', () => {
  it('forwards the ref, merges className (consumer wins) and passes the rest to the nav', () => {
    const ref = createRef<HTMLElement>();
    render(<Pagination ref={ref} page={1} pageCount={3} className="inline-flex" data-testid="p" id="pg" />);
    const nav = screen.getByTestId('p');
    expect(ref.current).toBe(nav);
    expect(nav.tagName).toBe('NAV');
    expect(nav).toHaveAttribute('id', 'pg');
    expect(nav.classList.contains('inline-flex')).toBe(true);
    expect(nav.classList.contains('inline-block')).toBe(false);
  });

  it('does not leak non-DOM props as attributes', () => {
    render(
      <Pagination
        data-testid="p"
        page={3}
        pageCount={20}
        siblingCount={2}
        boundaryCount={2}
        disabled
        onPageChange={() => {}}
        labels={{ next: 'Avanti' }}
      />,
    );
    const html = screen.getByTestId('p').outerHTML.toLowerCase();
    for (const leak of ['pagecount', 'siblingcount', 'boundarycount', 'onpagechange', 'labels']) {
      expect(html).not.toContain(leak);
    }
    expect(screen.getByTestId('p')).not.toHaveAttribute('disabled');
  });

  it('numeric slots share a min-width based on the digits of pageCount and use tabular digits', () => {
    render(<Pagination page={1} pageCount={120} />);
    const page = screen.getByRole('button', { name: 'Page 1' });
    expect(page.style.minWidth).toContain('3ch');
    expect(page.className).toContain('tabular-nums');
    expect(screen.getByRole('button', { name: 'Next page' }).style.minWidth).toBe(page.style.minWidth);
  });
});
