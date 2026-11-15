import { useMemo, useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ListReport } from './ListReport';
import { ListReportTable } from './ListReportTable';
import type { ListReportColumn, ListReportRowActions } from './types';
import { useListReport } from './use-list-report';

interface Item {
  id: string;
  name: string;
}

/** The render-count test uses 200 rows (the ticket's figure); every other test 20, enough for the geometry. */
const ROWS_200: Item[] = Array.from({ length: 200 }, (_, i) => ({ id: `r${i}`, name: `Item ${i}` }));
const ROWS = ROWS_200.slice(0, 20);
/** One `cell` call is one render of that row. */
let renders = 0;
const COLUMNS: ListReportColumn<Item>[] = [
  {
    id: 'name',
    header: 'Name',
    accessor: (r) => r.name,
    cell: (r) => {
      renders += 1;
      return r.name;
    },
  },
];

// --- A jsdom layout for the scroll container ------------------------------------------------------

/** The table's scroll container: the focusable element holding the `<table>`. */
const isScroller = (el: Element): boolean => el.getAttribute('tabindex') === '0' && el.firstElementChild?.tagName === 'TABLE';

interface Layout {
  scrollWidth: number;
  clientWidth: number;
  clientHeight: number;
  tableHeight: number;
}

/**
 * jsdom has no layout: give the scroller a `scrollWidth`, a `clientWidth`, a `clientHeight` and a real
 * `scrollLeft` (stored and clamped like a browser: `[0, max]` in ltr, `[-max, 0]` in rtl), and the
 * table a height. `layout` can change mid-test (then trigger the ResizeObserver). Counts the reads of
 * `scrollWidth`.
 */
function mockLayout(initial: Layout) {
  const layout = { ...initial };
  const reads = { scrollWidth: 0 };
  const lefts = new WeakMap<Element, number>();
  const proto = Element.prototype;
  const names = ['scrollWidth', 'clientWidth', 'clientHeight', 'scrollLeft', 'getBoundingClientRect'] as const;
  const saved = names.map((name) => [name, Object.getOwnPropertyDescriptor(proto, name)] as const);
  const rtl = (el: Element) => getComputedStyle(el).direction === 'rtl';
  Object.defineProperty(proto, 'scrollWidth', {
    configurable: true,
    get(this: Element) {
      if (!isScroller(this)) return 0;
      reads.scrollWidth += 1;
      return layout.scrollWidth;
    },
  });
  Object.defineProperty(proto, 'clientWidth', {
    configurable: true,
    get(this: Element) {
      return isScroller(this) ? layout.clientWidth : 0;
    },
  });
  Object.defineProperty(proto, 'clientHeight', {
    configurable: true,
    get(this: Element) {
      return isScroller(this) ? layout.clientHeight : 0;
    },
  });
  Object.defineProperty(proto, 'scrollLeft', {
    configurable: true,
    get(this: Element) {
      return lefts.get(this) ?? 0;
    },
    set(this: Element, value: number) {
      const max = Math.max(0, layout.scrollWidth - layout.clientWidth);
      lefts.set(this, rtl(this) ? Math.min(0, Math.max(-max, value)) : Math.max(0, Math.min(max, value)));
    },
  });
  Object.defineProperty(proto, 'getBoundingClientRect', {
    configurable: true,
    value(this: Element) {
      const height = this.tagName === 'TABLE' ? layout.tableHeight : 0;
      return { top: 0, left: 0, right: 0, bottom: height, width: 0, height, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    },
  });
  return {
    layout,
    reads,
    restore() {
      for (const [name, descriptor] of saved) {
        if (descriptor) Object.defineProperty(proto, name, descriptor);
        else delete (proto as unknown as Record<string, unknown>)[name];
      }
    },
  };
}

/** A ResizeObserver stub that keeps the callbacks, to trigger a resize from the test. */
function installResizeObserverStub() {
  const instances: { callback: ResizeObserverCallback; observed: Element[] }[] = [];
  const previous = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    private entry: { callback: ResizeObserverCallback; observed: Element[] };
    constructor(callback: ResizeObserverCallback) {
      this.entry = { callback, observed: [] };
      instances.push(this.entry);
    }
    observe(el: Element) {
      this.entry.observed.push(el);
    }
    unobserve(el: Element) {
      this.entry.observed = this.entry.observed.filter((e) => e !== el);
    }
    disconnect() {
      this.entry.observed = [];
    }
  };
  return {
    instances,
    trigger() {
      act(() => {
        for (const i of instances) i.callback([], i as unknown as ResizeObserver);
      });
    },
    restore() {
      (globalThis as { ResizeObserver?: unknown }).ResizeObserver = previous;
    },
  };
}

// --- Fixture ----------------------------------------------------------------------------------------

interface HostProps {
  dir?: 'ltr' | 'rtl';
  rowActions?: ListReportRowActions<Item>;
  rowActionsInline?: number;
  columns?: ListReportColumn<Item>[];
  rows?: Item[];
}

let rerenderHost: () => void = () => {};

function Host({ dir, rowActions, rowActionsInline, columns = COLUMNS, rows = ROWS }: HostProps) {
  const [, setTick] = useState(0);
  rerenderHost = () => setTick((t) => t + 1);
  const table = useListReport<Item>({ rows, columns, getRowId: (r) => r.id, selectable: true });
  return (
    <ListReportTable
      table={table}
      aria-label="Items"
      dir={dir}
      // jsdom computes `direction` from a declaration, not from the `dir` attribute.
      style={dir === 'rtl' ? { direction: 'rtl' } : undefined}
      rowActions={rowActions}
      rowActionsInline={rowActionsInline}
    />
  );
}

const scroller = () => screen.getByRole('table', { name: 'Items' }).parentElement as HTMLElement;
const layer = () => scroller().querySelector<HTMLElement>('[data-rop-overflow-edges]');
const edges = () => ({
  start: scroller().hasAttribute('data-rop-overflow-start'),
  end: scroller().hasAttribute('data-rop-overflow-end'),
});
const scrollLeftTo = (value: number) => {
  act(() => {
    scroller().scrollLeft = value;
    fireEvent.scroll(scroller());
  });
};

const WIDE: Layout = { scrollWidth: 800, clientWidth: 300, clientHeight: 400, tableHeight: 2000 };
let mock: ReturnType<typeof mockLayout>;
let ro: ReturnType<typeof installResizeObserverStub>;

beforeEach(() => {
  renders = 0;
  ro = installResizeObserverStub();
});
afterEach(() => {
  mock?.restore();
  ro.restore();
});

describe('ListReportTable: shades on the inline edges that hide columns', () => {
  it('every column in view: no attribute and no layer (the DOM is the same as without the feature)', () => {
    mock = mockLayout({ ...WIDE, scrollWidth: 300 });
    render(<Host />);
    expect(edges()).toEqual({ start: false, end: false });
    expect(layer()).toBeNull();
    expect(scroller().innerHTML).not.toContain('data-rop-overflow');
    // The table is the only child of the scroller.
    expect(scroller().children).toHaveLength(1);
  });

  it('overflow by 1px (a rounding): no shade', () => {
    mock = mockLayout({ ...WIDE, scrollWidth: 301 });
    render(<Host />);
    expect(edges()).toEqual({ start: false, end: false });
    expect(layer()).toBeNull();
  });

  it('wider than the container, at the start: only the end, on the first render after the mount', () => {
    mock = mockLayout(WIDE);
    render(<Host />);
    expect(edges()).toEqual({ start: false, end: true });
    const el = layer()!;
    expect(el).not.toBeNull();
    // After the table, hidden from assistive technology, never focusable, never a pointer target.
    expect(scroller().lastElementChild).toBe(el);
    expect(scroller().firstElementChild?.tagName).toBe('TABLE');
    expect(el).toHaveAttribute('aria-hidden', 'true');
    expect(el.className).toContain('pointer-events-none');
    expect(el.querySelectorAll('[tabindex], button, input, a')).toHaveLength(0);
    expect([...el.children].map((c) => c.getAttribute('data-rop-overflow-edge'))).toEqual(['start', 'end']);
  });

  it('scrolled to the middle: both; to the end (within 1px): only the start; back: only the end', () => {
    mock = mockLayout(WIDE);
    render(<Host />);
    scrollLeftTo(250);
    expect(edges()).toEqual({ start: true, end: true });
    scrollLeftTo(499.5);
    expect(edges()).toEqual({ start: true, end: false });
    scrollLeftTo(500);
    expect(edges()).toEqual({ start: true, end: false });
    scrollLeftTo(498);
    expect(edges()).toEqual({ start: true, end: true });
    scrollLeftTo(0);
    expect(edges()).toEqual({ start: false, end: true });
  });

  it('rtl: scrollLeft is 0 at the start and negative towards the end', () => {
    mock = mockLayout(WIDE);
    render(<Host dir="rtl" />);
    expect(edges()).toEqual({ start: false, end: true });
    scrollLeftTo(-250);
    expect(edges()).toEqual({ start: true, end: true });
    scrollLeftTo(-500);
    expect(edges()).toEqual({ start: true, end: false });
    scrollLeftTo(0);
    expect(edges()).toEqual({ start: false, end: true });
  });

  it('a resize updates the state with no scroll: the columns fit (no layer), then no longer fit', () => {
    mock = mockLayout(WIDE);
    render(<Host />);
    scrollLeftTo(250);
    // The container grows (a rotated tablet): every column fits, the browser resets the scroll.
    mock.layout.clientWidth = 800;
    act(() => {
      scroller().scrollLeft = 0;
    });
    ro.trigger();
    expect(edges()).toEqual({ start: false, end: false });
    expect(layer()).toBeNull();
    // A column is added (the table grows): the end hides content again.
    mock.layout.scrollWidth = 1000;
    ro.trigger();
    expect(edges()).toEqual({ start: false, end: true });
    expect(layer()).not.toBeNull();
  });

  it('the container and the table are both observed', () => {
    mock = mockLayout(WIDE);
    render(<Host />);
    const observed = ro.instances.flatMap((i) => i.observed);
    expect(observed).toContain(scroller());
    expect(observed).toContain(scroller().querySelector('table'));
  });

  it('a vertical scroll reads no width and writes no attribute', () => {
    mock = mockLayout(WIDE);
    render(<Host />);
    scrollLeftTo(250);
    const reads = mock.reads.scrollWidth;
    const toggle = vi.spyOn(scroller(), 'toggleAttribute');
    for (let i = 0; i < 20; i += 1) fireEvent.scroll(scroller());
    expect(mock.reads.scrollWidth).toBe(reads);
    expect(toggle).not.toHaveBeenCalled();
    expect(edges()).toEqual({ start: true, end: true });
  });

  it('an attribute is written only when its boolean changes', () => {
    mock = mockLayout(WIDE);
    render(<Host />);
    const toggle = vi.spyOn(scroller(), 'toggleAttribute');
    for (let left = 10; left <= 490; left += 40) scrollLeftTo(left);
    // start appears once (at 10); end stays.
    expect(toggle.mock.calls).toEqual([['data-rop-overflow-start', true]]);
  });

  it('200 rows: scrolling sideways back and forth renders no row; the layer appearing renders no row either', () => {
    mock = mockLayout({ ...WIDE, scrollWidth: 300 });
    render(<Host rows={ROWS_200} />);
    expect(renders).toBe(200);
    renders = 0;
    mock.layout.scrollWidth = 800;
    ro.trigger();
    expect(layer()).not.toBeNull();
    for (let left = 0; left <= 500; left += 50) scrollLeftTo(left);
    for (let left = 500; left >= 0; left -= 50) scrollLeftTo(left);
    expect(renders).toBe(0);
    // A parent render that changes nothing still renders no row (the layer is kept).
    act(() => rerenderHost());
    expect(renders).toBe(0);
    expect(layer()).not.toBeNull();
  });

  it('geometry: as tall as the scrollport; a table shorter than it moves the shades down to its bottom', () => {
    mock = mockLayout(WIDE);
    render(<Host />);
    expect(layer()!.style.getPropertyValue('--rop-list-report-edge-height')).toBe('400px');
    expect(layer()!.style.getPropertyValue('--rop-list-report-edge-bottom')).toBe('0px');
    mock.layout.tableHeight = 282.6;
    ro.trigger();
    // Floored: the shades never reach past the scrollport.
    expect(layer()!.style.getPropertyValue('--rop-list-report-edge-bottom')).toBe('-117px');
    mock.layout.clientHeight = 350;
    ro.trigger();
    expect(layer()!.style.getPropertyValue('--rop-list-report-edge-height')).toBe('350px');
    expect(layer()!.style.getPropertyValue('--rop-list-report-edge-bottom')).toBe('-67px');
  });

  it('without row actions the end shade reaches the edge; with them it stops at the actions column (both forms)', () => {
    mock = mockLayout(WIDE);
    const actions: ListReportRowActions<Item> = () => [{ id: 'edit', label: 'Edit', icon: <svg />, onSelect: () => {} }];
    const { rerender } = render(<Host />);
    expect(layer()!.style.getPropertyValue('--rop-list-report-edge-end')).toBe('0px');
    rerender(<Host rowActions={actions} />);
    expect(layer()!.style.getPropertyValue('--rop-list-report-edge-end')).toBe('var(--rop-list-report-row-height)');
    expect(layer()!.className).not.toMatch(/row-actions/);
    rerender(<Host rowActions={actions} rowActionsInline={1} />);
    // The width of the inline form is the custom property the container query sets: the layer gets
    // the same declarations as the table, so it follows the form at 40rem.
    expect(layer()!.style.getPropertyValue('--rop-list-report-edge-end')).toBe('var(--rop-list-report-row-actions-width)');
    expect(layer()!.style.getPropertyValue('--rop-list-report-row-actions-inline')).toBe('1');
    const table = scroller().querySelector('table')!;
    for (const cls of table.className.split(' ').filter((c) => c.includes('row-actions'))) expect(layer()!.classList).toContain(cls);
  });

  it('unmount: the scroll listener goes, and so do both attributes', () => {
    mock = mockLayout(WIDE);
    const { unmount } = render(<Host />);
    scrollLeftTo(250);
    expect(edges()).toEqual({ start: true, end: true });
    const el = scroller();
    const remove = vi.spyOn(el, 'removeEventListener');
    unmount();
    expect(remove.mock.calls.some(([type]) => type === 'scroll')).toBe(true);
    expect(el.hasAttribute('data-rop-overflow-start')).toBe(false);
    expect(el.hasAttribute('data-rop-overflow-end')).toBe(false);
  });

  it('the direction of each gradient is a custom property of the layer, from the measured direction', () => {
    mock = mockLayout(WIDE);
    const { unmount } = render(<Host />);
    expect(layer()!.style.getPropertyValue('--rop-list-report-edge-start-to')).toBe('to right');
    expect(layer()!.style.getPropertyValue('--rop-list-report-edge-end-to')).toBe('to left');
    unmount();
    render(<Host dir="rtl" />);
    expect(layer()!.style.getPropertyValue('--rop-list-report-edge-start-to')).toBe('to left');
    expect(layer()!.style.getPropertyValue('--rop-list-report-edge-end-to')).toBe('to right');
    // No direction selector anywhere in the classes of the shades.
    for (const shade of layer()!.children) expect(shade.className).not.toMatch(/dir\(|rtl:/);
  });
});

describe('server rendering', () => {
  function Report() {
    const columns = useMemo(() => COLUMNS, []);
    const table = useListReport<Item>({ rows: ROWS.slice(0, 20), columns, getRowId: (r) => r.id, selectable: true });
    return <ListReport title="Items" table={table} />;
  }

  it('renderToString measures nothing; hydrateRoot with columns hidden: no mismatch, no warning, the shade after the first measure', async () => {
    const html = renderToString(<Report />);
    expect(html).not.toContain('data-rop-overflow');
    mock = mockLayout(WIDE);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const recoverable = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    container.innerHTML = html;
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(container, <Report />, { onRecoverableError: recoverable });
      });
      expect(recoverable).not.toHaveBeenCalled();
      expect(errors).not.toHaveBeenCalled();
      const el = container.querySelector('table')!.parentElement!;
      expect(el).toHaveAttribute('data-rop-overflow-end');
      expect(el.querySelector('[data-rop-overflow-edges]')).not.toBeNull();
    } finally {
      act(() => root?.unmount());
      container.remove();
      errors.mockRestore();
    }
  });
});
