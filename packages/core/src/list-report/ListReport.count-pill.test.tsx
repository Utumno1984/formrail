import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDemoInvoices, type DemoInvoice } from '../internal/demo-invoices';
import { ListReport } from './ListReport';
import { countClass, countFlashClass } from './list-report-styles';
import type { ListReportColumn } from './types';
import { CHANGE_FLASH_MS } from './use-change-flash';
import { useListReport } from './use-list-report';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const COLUMNS: ListReportColumn<DemoInvoice>[] = [{ id: 'number', header: 'Numero', accessor: (r) => r.number }];

function Host({ rows }: { rows: DemoInvoice[] }) {
  const table = useListReport<DemoInvoice>({ rows, columns: COLUMNS, getRowId: (r) => r.id, searchCommitDelay: null });
  return <ListReport table={table} title="Fatture" />;
}

const ROWS = makeDemoInvoices(40);
const pill = () => within(screen.getByRole('heading', { name: /Fatture/ })).getByText(/^\(\d+\)$/);
const flashing = () => pill().hasAttribute('data-changed');

describe('<ListReport> count pill', () => {
  it('is a pill with the token background, border and radius, and a token-driven transition', () => {
    render(<Host rows={ROWS} />);
    for (const name of ['bg-rop-surface-subtle', 'border-rop-border', 'rounded-rop-sm']) {
      expect(pill()).toHaveClass(name);
    }
    // duration and easing come from the motion tokens, never from literals; reduced motion switches it off
    expect(countClass).toContain('duration-[var(--motion-rop-feedback-duration)]');
    expect(countClass).toContain('ease-[var(--motion-rop-feedback-easing)]');
    expect(countClass).toContain('motion-reduce:transition-none');
    expect(countClass).not.toMatch(/duration-\d/);
    // under reduced motion the "changed" tone falls back to the resting one
    expect(countFlashClass).toContain('motion-reduce:bg-rop-surface-subtle');
  });

  it('does not flash at mount', () => {
    render(<Host rows={ROWS} />);
    expect(flashing()).toBe(false);
    expect(pill()).not.toHaveClass('bg-rop-blue-50');
    act(() => {
      vi.advanceTimersByTime(CHANGE_FLASH_MS * 3);
    });
    expect(flashing()).toBe(false);
  });

  it('flashes when the count changes, for CHANGE_FLASH_MS, then goes back to rest', () => {
    const { rerender } = render(<Host rows={ROWS} />);
    rerender(<Host rows={ROWS.slice(0, 10)} />);
    expect(pill()).toHaveTextContent('(10)');
    expect(flashing()).toBe(true);
    expect(pill()).toHaveClass('bg-rop-blue-50');
    act(() => {
      vi.advanceTimersByTime(CHANGE_FLASH_MS - 1);
    });
    expect(flashing()).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(flashing()).toBe(false);
    expect(pill()).not.toHaveClass('bg-rop-blue-50');
    expect(pill()).toHaveClass('bg-rop-surface-subtle');
  });

  it('flashes on the total count too, and does not flash when the numbers stay the same', () => {
    const { rerender } = render(<Host rows={ROWS} />);
    // a new array with the same length: same numbers, nothing changed
    rerender(<Host rows={[...ROWS]} />);
    expect(flashing()).toBe(false);
    rerender(<Host rows={makeDemoInvoices(41)} />);
    expect(flashing()).toBe(true);
  });

  it('restarts the flash when the value changes again while it is on', () => {
    const { rerender } = render(<Host rows={ROWS} />);
    rerender(<Host rows={ROWS.slice(0, 10)} />);
    act(() => {
      vi.advanceTimersByTime(CHANGE_FLASH_MS - 50);
    });
    rerender(<Host rows={ROWS.slice(0, 5)} />);
    act(() => {
      vi.advanceTimersByTime(CHANGE_FLASH_MS - 50);
    });
    expect(flashing()).toBe(true);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(flashing()).toBe(false);
  });

  it('leaves no pending timer behind on unmount', () => {
    const { rerender, unmount } = render(<Host rows={ROWS} />);
    rerender(<Host rows={ROWS.slice(0, 10)} />);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not touch the live region: the count is not in it and its text is unchanged', () => {
    const { container, rerender } = render(<Host rows={ROWS} />);
    const live = container.querySelector('[aria-live]')!;
    expect(live).toHaveTextContent('');
    rerender(<Host rows={ROWS.slice(0, 10)} />);
    expect(live).toHaveTextContent('10 results');
    expect(live.contains(pill())).toBe(false);
  });
});
