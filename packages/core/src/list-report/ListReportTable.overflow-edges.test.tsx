import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { StrictMode, useMemo, useState } from 'react';
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

/**
 * The scroll container, found by its accessible name. `getByRole` walks the accessibility tree of the
 * whole table: with 200 rows a single call costs a few hundred milliseconds of jsdom, so a test that
 * scrolls many times over many rows passes the node it found once to the helpers below (`el`).
 */
const scroller = () => screen.getByRole('table', { name: 'Items' }).parentElement as HTMLElement;
const layer = (el = scroller()) => el.querySelector<HTMLElement>('[data-rop-overflow-edges]');
const edges = (el = scroller()) => ({
  start: el.hasAttribute('data-rop-overflow-start'),
  end: el.hasAttribute('data-rop-overflow-end'),
});
const scrollLeftTo = (value: number, el = scroller()) => {
  act(() => {
    el.scrollLeft = value;
    fireEvent.scroll(el);
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
    // Found once (see `scroller`): the same node all along, checked again at the end.
    const el = scroller();
    renders = 0;
    mock.layout.scrollWidth = 800;
    ro.trigger();
    expect(layer(el)).not.toBeNull();
    for (let left = 0; left <= 500; left += 50) scrollLeftTo(left, el);
    for (let left = 500; left >= 0; left -= 50) scrollLeftTo(left, el);
    expect(renders).toBe(0);
    // A parent render that changes nothing still renders no row (the layer is kept).
    act(() => rerenderHost());
    expect(renders).toBe(0);
    expect(layer(el)).not.toBeNull();
    expect(scroller()).toBe(el);
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

  it('the direction is CSS alone: a `dir` changed after the mount at scrollLeft 0 leaves the layer as it was, with nothing about the direction in it', () => {
    mock = mockLayout(WIDE);
    const { rerender } = render(<Host />);
    const html = layer()!.outerHTML;
    // No direction in the layer's style (no custom property set from a measured direction).
    expect(layer()!.getAttribute('style')).not.toMatch(/to (left|right)|rtl|ltr/);
    for (const edge of ['start', 'end'] as const) {
      const classes = layer()!.querySelector(`[data-rop-overflow-edge="${edge}"]`)!.className.split(' ');
      // A 12px box clipping a `::before` twice as wide, half outside the box on its outer side by a
      // logical inset, with a symmetric gradient: the full colour in its middle, on the outer edge.
      expect(classes).toEqual(expect.arrayContaining(['w-3', 'overflow-hidden', 'before:absolute', 'before:w-6', `before:-${edge}-3`]));
      expect(classes).toContain('before:bg-[linear-gradient(to_right,transparent,var(--rop-list-report-edge-color),transparent)]');
      // No direction selector and no physical side anywhere.
      for (const cls of classes) {
        expect(cls).not.toMatch(/dir\(|lang\(|rtl:|ltr:/);
        expect(cls).not.toMatch(/^(?:[\w-]+:)*-?(?:left|right|[mp][lr]|border-[lr]|rounded-[lr])(?:-|$)/);
      }
    }
    // `dir` changed after the mount, nothing scrolled (no `scroll` event, no resize): the layer is the
    // same node with the same markup, and the start still reads as the start.
    const node = layer();
    rerender(<Host dir="rtl" />);
    expect(scroller().getAttribute('dir')).toBe('rtl');
    expect(layer()).toBe(node);
    expect(layer()!.outerHTML).toBe(html);
    expect(edges()).toEqual({ start: false, end: true });
    scrollLeftTo(-250);
    expect(edges()).toEqual({ start: true, end: true });
    // And back to ltr: a browser clamps -250 into the new range, which is a `scroll` event.
    rerender(<Host dir="ltr" />);
    scrollLeftTo(0);
    expect(edges()).toEqual({ start: false, end: true });
    expect(layer()!.outerHTML).toBe(html);
  });
});

describe('a `dir` changed after the mount (#562)', () => {
  // The `direction` jsdom computes follows the nearest `dir` attribute, as in a browser (each test
  // checks it where it matters).
  afterEach(() => {
    document.documentElement.removeAttribute('dir');
  });

  /**
   * Runs the microtasks left by the render: the container's own child-list observer reports the layer
   * inserted after the table and measures once. A count of reads taken after this is the hook's alone.
   */
  const settle = () => act(async () => {});

  /** A wrapper the test sets `dir` on (an ancestor of the scroller, outside React, like an app shell). */
  function renderInWrapper(props: HostProps = {}) {
    const result = render(
      <div>
        <Host {...props} />
      </div>,
    );
    return { ...result, wrapper: result.container.firstElementChild as HTMLElement };
  }

  /**
   * What Firefox does when the direction changes: `scrollLeft` back to 0 (the start of the new
   * direction) and NO `scroll` event. `change` sets or removes the attributes; the act flushes the
   * microtasks, where a MutationObserver callback runs.
   */
  async function likeFirefox(change: () => void, el: HTMLElement) {
    await act(async () => {
      change();
      el.scrollLeft = 0;
    });
  }
  const setDir = (target: Element, dir: string | null) => () => {
    if (dir === null) target.removeAttribute('dir');
    else target.setAttribute('dir', dir);
  };

  it('scrolled, `dir` changed on an ancestor with no `scroll` event (Firefox): the state follows at once, both ways and when `dir` is removed', async () => {
    mock = mockLayout(WIDE);
    const { wrapper } = renderInWrapper();
    const el = scroller();
    scrollLeftTo(250, el);
    expect(edges(el)).toEqual({ start: true, end: true });

    await likeFirefox(setDir(wrapper, 'rtl'), el);
    expect(getComputedStyle(el).direction).toBe('rtl');
    expect(edges(el)).toEqual({ start: false, end: true });
    scrollLeftTo(-250, el);
    expect(edges(el)).toEqual({ start: true, end: true });

    await likeFirefox(setDir(wrapper, 'ltr'), el);
    expect(getComputedStyle(el).direction).toBe('ltr');
    expect(edges(el)).toEqual({ start: false, end: true });
    scrollLeftTo(500, el);
    expect(edges(el)).toEqual({ start: true, end: false });

    await likeFirefox(setDir(wrapper, 'rtl'), el);
    expect(edges(el)).toEqual({ start: false, end: true });
    scrollLeftTo(-500, el);
    expect(edges(el)).toEqual({ start: true, end: false });
    await likeFirefox(setDir(wrapper, null), el);
    expect(getComputedStyle(el).direction).toBe('ltr');
    expect(edges(el)).toEqual({ start: false, end: true });
  });

  it('on the root element and on the container itself (the `dir` prop) too', async () => {
    mock = mockLayout(WIDE);
    const { rerender } = render(<Host />);
    const el = scroller();
    scrollLeftTo(250, el);
    await likeFirefox(setDir(document.documentElement, 'rtl'), el);
    expect(getComputedStyle(el).direction).toBe('rtl');
    expect(edges(el)).toEqual({ start: false, end: true });
    scrollLeftTo(-250, el);
    expect(edges(el)).toEqual({ start: true, end: true });
    // The `dir` prop of the table is the attribute of the container: the observer sees it as well.
    await likeFirefox(() => rerender(<Host dir="ltr" />), el);
    expect(el.getAttribute('dir')).toBe('ltr');
    expect(getComputedStyle(el).direction).toBe('ltr');
    expect(edges(el)).toEqual({ start: false, end: true });
    scrollLeftTo(250, el);
    expect(edges(el)).toEqual({ start: true, end: true });
  });

  it('changed before any scroll: measured once, no attribute written', async () => {
    mock = mockLayout(WIDE);
    const { wrapper } = renderInWrapper();
    const el = scroller();
    await settle();
    const toggle = vi.spyOn(el, 'toggleAttribute');
    const reads = mock.reads.scrollWidth;
    await likeFirefox(setDir(wrapper, 'rtl'), el);
    expect(mock.reads.scrollWidth).toBe(reads + 1);
    expect(toggle).not.toHaveBeenCalled();
    expect(edges(el)).toEqual({ start: false, end: true });
  });

  it('changed twice in a row: one measure, the state of the last direction', async () => {
    mock = mockLayout(WIDE);
    const { wrapper } = renderInWrapper();
    const el = scroller();
    scrollLeftTo(250, el);
    await settle();
    const reads = mock.reads.scrollWidth;
    await likeFirefox(() => {
      wrapper.setAttribute('dir', 'rtl');
      wrapper.setAttribute('dir', 'ltr');
    }, el);
    expect(mock.reads.scrollWidth).toBe(reads + 1);
    expect(getComputedStyle(el).direction).toBe('ltr');
    expect(edges(el)).toEqual({ start: false, end: true });
  });

  it('the `scroll` event Chromium fires after the change (at the position already measured) measures nothing again', async () => {
    mock = mockLayout(WIDE);
    const { wrapper } = renderInWrapper();
    const el = scroller();
    scrollLeftTo(250, el);
    await settle();
    const reads = mock.reads.scrollWidth;
    await likeFirefox(setDir(wrapper, 'rtl'), el);
    expect(mock.reads.scrollWidth).toBe(reads + 1);
    act(() => {
      fireEvent.scroll(el);
    });
    expect(mock.reads.scrollWidth).toBe(reads + 1);
    expect(edges(el)).toEqual({ start: false, end: true });
  });

  it('a `dir` inside the container (a cell) cannot change its direction: nothing is measured', async () => {
    mock = mockLayout(WIDE);
    render(<Host />);
    const el = scroller();
    scrollLeftTo(250, el);
    await settle();
    const reads = mock.reads.scrollWidth;
    await act(async () => {
      el.querySelector('td')!.setAttribute('dir', 'rtl');
    });
    expect(mock.reads.scrollWidth).toBe(reads);
    expect(edges(el)).toEqual({ start: true, end: true });
  });

  it('no overflow before the change and overflow after it: the layer mounts, with no resize', async () => {
    mock = mockLayout({ ...WIDE, scrollWidth: 300 });
    const { wrapper } = renderInWrapper();
    const el = scroller();
    expect(layer(el)).toBeNull();
    // The columns are wider in the new direction (other glyphs); no ResizeObserver notification is
    // delivered (`ro.trigger` is not called).
    mock.layout.scrollWidth = 800;
    await likeFirefox(setDir(wrapper, 'rtl'), el);
    expect(edges(el)).toEqual({ start: false, end: true });
    expect(layer(el)).not.toBeNull();
    expect(layer(el)!.style.getPropertyValue('--rop-list-report-edge-height')).toBe('400px');
  });

  it('inside a shadow root: a `dir` on a shadow ancestor and on a light-DOM ancestor of the host are both seen', async () => {
    mock = mockLayout(WIDE);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const wrapper = document.createElement('div');
    shadow.appendChild(wrapper);
    const { unmount } = render(<Host />, { container: wrapper });
    try {
      const el = wrapper.querySelector('table')!.parentElement as HTMLElement;
      scrollLeftTo(250, el);
      expect(edges(el)).toEqual({ start: true, end: true });
      await likeFirefox(setDir(wrapper, 'rtl'), el);
      expect(edges(el)).toEqual({ start: false, end: true });
      scrollLeftTo(-250, el);
      expect(edges(el)).toEqual({ start: true, end: true });
      await likeFirefox(setDir(wrapper, null), el);
      expect(edges(el)).toEqual({ start: false, end: true });
      scrollLeftTo(250, el);
      expect(edges(el)).toEqual({ start: true, end: true });
      await likeFirefox(setDir(document.body, 'rtl'), el);
      expect(edges(el)).toEqual({ start: false, end: true });
    } finally {
      unmount();
      host.remove();
      document.body.removeAttribute('dir');
    }
  });

  it('a `dir` on a node that is not an ancestor (a sibling, another branch) measures nothing; one on an ancestor measures exactly once', async () => {
    mock = mockLayout(WIDE);
    const { container } = render(
      <div>
        <div data-testid="branch">
          <Host />
        </div>
        <p data-testid="sibling" />
      </div>,
    );
    const el = scroller();
    await settle();
    const reads = mock.reads.scrollWidth;
    const sibling = container.querySelector('p')!;
    await act(async () => {
      for (const dir of ['rtl', 'ltr', 'rtl']) sibling.setAttribute('dir', dir);
    });
    await act(async () => {
      sibling.removeAttribute('dir');
    });
    expect(mock.reads.scrollWidth).toBe(reads);
    await likeFirefox(setDir(container.querySelector('[data-testid="branch"]')!, 'rtl'), el);
    expect(mock.reads.scrollWidth).toBe(reads + 1);
  });

  it('three tables in distinct branches: a `dir` on the first branch measures only the first', async () => {
    mock = mockLayout(WIDE);
    const { container } = render(
      <div>
        {[0, 1, 2].map((i) => (
          <section key={i} data-branch={i}>
            <Host />
          </section>
        ))}
      </div>,
    );
    await settle();
    const scrollers = Array.from(container.querySelectorAll<HTMLElement>('section')).map((s) => s.querySelector('table')!.parentElement!);
    expect(scrollers).toHaveLength(3);
    // Each table in its own state: scrolled to the middle, so a measure of it would show a change.
    for (const [i, el] of scrollers.entries()) {
      act(() => {
        el.scrollLeft = 250;
        fireEvent.scroll(el);
      });
      expect(edges(el), `table ${i}`).toEqual({ start: true, end: true });
    }
    const reads = mock.reads.scrollWidth;
    // Firefox on the first table only: its scrollLeft goes back to 0, with no event. The others stay at 250.
    await likeFirefox(setDir(container.querySelector('section')!, 'rtl'), scrollers[0]!);
    expect(mock.reads.scrollWidth).toBe(reads + 1);
    expect(edges(scrollers[0]!)).toEqual({ start: false, end: true });
    // Had the others measured, they would have read their scrollLeft (250) as rtl and changed state.
    expect(edges(scrollers[1]!)).toEqual({ start: true, end: true });
    expect(edges(scrollers[2]!)).toEqual({ start: true, end: true });
  });

  it('a change of `class` on an ancestor reads nothing (the observer watches `dir` alone)', async () => {
    mock = mockLayout(WIDE);
    const { wrapper } = renderInWrapper();
    const el = scroller();
    scrollLeftTo(250, el);
    await settle();
    const reads = mock.reads.scrollWidth;
    await act(async () => {
      wrapper.setAttribute('class', 'a');
      wrapper.className = 'b';
      document.documentElement.setAttribute('class', 'c');
      el.setAttribute('class', 'd');
    });
    document.documentElement.removeAttribute('class');
    expect(mock.reads.scrollWidth).toBe(reads);
  });

  describe('shadow roots nested in shadow roots', () => {
    /** host > shadow > wrapper > innerHost > innerShadow > container (the React root). */
    function nested() {
      const outerHost = document.createElement('div');
      document.body.appendChild(outerHost);
      const outerShadow = outerHost.attachShadow({ mode: 'open' });
      const wrapper = document.createElement('div');
      outerShadow.appendChild(wrapper);
      const innerHost = document.createElement('div');
      wrapper.appendChild(innerHost);
      const innerShadow = innerHost.attachShadow({ mode: 'open' });
      const container = document.createElement('div');
      innerShadow.appendChild(container);
      return { outerHost, outerShadow, wrapper, innerHost, innerShadow, container };
    }

    it('a `dir` on the outer host, on a wrapper in the outer shadow and on the inner host: the inner table measures once each', async () => {
      mock = mockLayout(WIDE);
      const n = nested();
      const { unmount } = render(<Host />, { container: n.container });
      try {
        const el = n.container.querySelector('table')!.parentElement as HTMLElement;
        await settle();
        for (const target of [n.outerHost, n.wrapper, n.innerHost]) {
          scrollLeftTo(250, el);
          expect(edges(el)).toEqual({ start: true, end: true });
          const reads = mock.reads.scrollWidth;
          await likeFirefox(setDir(target, 'rtl'), el);
          expect(mock.reads.scrollWidth).toBe(reads + 1);
          expect(edges(el)).toEqual({ start: false, end: true });
          await likeFirefox(setDir(target, null), el);
        }
      } finally {
        unmount();
        n.outerHost.remove();
      }
    });

    it('observes the document and each shadow root outwards, and disconnects them all on unmount', async () => {
      mock = mockLayout(WIDE);
      const Native = globalThis.MutationObserver;
      const instances: { targets: Node[]; disconnected: boolean }[] = [];
      globalThis.MutationObserver = class extends Native {
        private entry = { targets: [] as Node[], disconnected: false };
        override observe(target: Node, options?: MutationObserverInit) {
          if (options?.attributeFilter?.includes('dir')) {
            if (!instances.includes(this.entry)) instances.push(this.entry);
            this.entry.targets.push(target);
          }
          super.observe(target, options);
        }
        override disconnect() {
          this.entry.disconnected = true;
          super.disconnect();
        }
      };
      const n = nested();
      const { unmount } = render(<Host />, { container: n.container });
      try {
        expect(instances).toHaveLength(1);
        expect(instances[0]!.targets).toEqual([document.documentElement, n.innerShadow, n.outerShadow]);
        expect(instances[0]!.disconnected).toBe(false);
        await settle();
        unmount();
        expect(instances[0]!.disconnected).toBe(true);
      } finally {
        globalThis.MutationObserver = Native;
        n.outerHost.remove();
      }
    });

    it('limit, documented: a `dir` set in the shadow tree of a host that slots the container is not seen; the host and its light-DOM ancestors are', async () => {
      mock = mockLayout(WIDE);
      const host = document.createElement('div');
      document.body.appendChild(host);
      const shadow = host.attachShadow({ mode: 'open' });
      const shell = document.createElement('div');
      const slot = document.createElement('slot');
      shell.appendChild(slot);
      shadow.appendChild(shell);
      // The container is a light-DOM child of the host, rendered through the slot.
      const container = document.createElement('div');
      host.appendChild(container);
      const { unmount } = render(<Host />, { container });
      try {
        const el = container.querySelector('table')!.parentElement as HTMLElement;
        await settle();
        scrollLeftTo(250, el);
        const reads = mock.reads.scrollWidth;
        // In the flat tree `shell` is an ancestor; in the DOM tree it is not: not measured (the limit).
        await likeFirefox(setDir(shell, 'rtl'), el);
        expect(mock.reads.scrollWidth).toBe(reads);
        // The host is a DOM ancestor: measured.
        await likeFirefox(setDir(host, 'rtl'), el);
        expect(mock.reads.scrollWidth).toBe(reads + 1);
      } finally {
        unmount();
        host.remove();
      }
    });
  });

  it('the TSDoc of `OverflowEdgesGeometry` no longer says that a `dir` changed after the mount needs no measure', () => {
    const source = readFileSync(resolve(__dirname, 'use-overflow-edges.ts'), 'utf8');
    expect(source).not.toMatch(/needs no measure/);
    expect(source).toMatch(/still measures once/);
  });

  it('a batch with a `dir` on a non-ancestor and on an ancestor, in one task: the table measures (once)', async () => {
    mock = mockLayout(WIDE);
    const { container, wrapper } = renderInWrapper();
    const el = scroller();
    const sibling = document.createElement('p');
    container.appendChild(sibling);
    scrollLeftTo(250, el);
    await settle();
    const reads = mock.reads.scrollWidth;
    await likeFirefox(() => {
      sibling.setAttribute('dir', 'rtl');
      wrapper.setAttribute('dir', 'rtl');
    }, el);
    expect(mock.reads.scrollWidth).toBe(reads + 1);
    expect(edges(el)).toEqual({ start: false, end: true });
  });

  describe('an ancestor that has a `host` property of its own (not a ShadowRoot)', () => {
    /** The table inside `inner`, in an outer `div` that gets the `dir`; errors raised in observer callbacks are collected. */
    async function dirAboveInner(inner: HTMLElement) {
      mock = mockLayout(WIDE);
      const outer = document.createElement('div');
      outer.appendChild(inner);
      document.body.appendChild(outer);
      const container = document.createElement('div');
      inner.appendChild(container);
      const errors: unknown[] = [];
      const onError = (event: ErrorEvent) => {
        errors.push(event.error ?? event.message);
        event.preventDefault();
      };
      window.addEventListener('error', onError);
      const { unmount } = render(<Host />, { container });
      try {
        const el = scroller();
        scrollLeftTo(250, el);
        await settle();
        const reads = mock.reads.scrollWidth;
        await likeFirefox(setDir(outer, 'rtl'), el);
        expect(errors).toEqual([]);
        expect(mock.reads.scrollWidth).toBe(reads + 1);
        expect(edges(el)).toEqual({ start: false, end: true });
      } finally {
        window.removeEventListener('error', onError);
        unmount();
        outer.remove();
      }
    }

    it('a table inside `<a href>` (its `host` is a string): a `dir` above the link measures once, with no error', async () => {
      const link = document.createElement('a');
      link.href = 'https://example.com/x';
      await dirAboveInner(link);
    });

    it('a table inside a `<form>` with an `<input name="host">` (named access): a `dir` above the form measures once, with no error', async () => {
      const form = document.createElement('form');
      const input = document.createElement('input');
      input.name = 'host';
      form.appendChild(input);
      await dirAboveInner(form);
    });
  });

  it('StrictMode (effects run twice): a single observer stays connected', async () => {
    mock = mockLayout(WIDE);
    const live = new Set<unknown>();
    const Native = globalThis.MutationObserver;
    globalThis.MutationObserver = class extends Native {
      override observe(target: Node, options?: MutationObserverInit) {
        if (options?.attributeFilter?.includes('dir')) live.add(this);
        super.observe(target, options);
      }
      override disconnect() {
        live.delete(this);
        super.disconnect();
      }
    };
    try {
      const { unmount } = render(
        <StrictMode>
          <Host />
        </StrictMode>,
      );
      await settle();
      expect(live.size).toBe(1);
      unmount();
      expect(live.size).toBe(0);
    } finally {
      globalThis.MutationObserver = Native;
    }
  });

  it('a table in a shadow root inside an iframe (another realm): a `dir` in the shadow tree and on the host measure', async () => {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument!;
    // The realm of the iframe has its own `ShadowRoot`: `instanceof` with the parent's would say no.
    expect(doc.defaultView!.ShadowRoot).not.toBe(ShadowRoot);
    const host = doc.createElement('div');
    doc.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    expect(shadow instanceof ShadowRoot).toBe(false);
    const wrapper = doc.createElement('div');
    shadow.appendChild(wrapper);
    const container = doc.createElement('div');
    wrapper.appendChild(container);
    const { unmount } = render(<Host />, { container });
    const el = container.querySelector('table')!.parentElement as HTMLElement;
    const measured = vi.spyOn(window, 'getComputedStyle');
    const count = () => measured.mock.calls.filter(([target]) => target === el).length;
    try {
      await settle();
      const before = count();
      await act(async () => {
        wrapper.setAttribute('dir', 'rtl');
      });
      expect(count()).toBe(before + 1);
      await act(async () => {
        host.setAttribute('dir', 'rtl');
      });
      expect(count()).toBe(before + 2);
      const unrelated = doc.createElement('p');
      doc.body.appendChild(unrelated);
      await act(async () => {
        unrelated.setAttribute('dir', 'rtl');
      });
      expect(count()).toBe(before + 2);
    } finally {
      measured.mockRestore();
      unmount();
      iframe.remove();
    }
  });

  describe('the observer is disconnected on unmount', () => {
    /** Every MutationObserver that watches `dir` attributes, with what it observes. */
    let observers: { targets: Node[]; connected: boolean }[];
    let Native: typeof MutationObserver;
    beforeEach(() => {
      observers = [];
      Native = globalThis.MutationObserver;
      globalThis.MutationObserver = class extends Native {
        private entry = { targets: [] as Node[], connected: false };
        override observe(target: Node, options?: MutationObserverInit) {
          if (options?.attributeFilter?.includes('dir')) {
            if (!observers.includes(this.entry)) observers.push(this.entry);
            this.entry.targets.push(target);
            this.entry.connected = true;
          }
          super.observe(target, options);
        }
        override disconnect() {
          this.entry.connected = false;
          super.disconnect();
        }
      };
    });
    afterEach(() => {
      globalThis.MutationObserver = Native;
    });

    const cases = [
      ['with columns hidden (the layer mounted)', WIDE, false],
      ['with every column in view (no layer)', { ...WIDE, scrollWidth: 300 }, true],
    ] as const;
    for (const [label, layout, noLayer] of cases) {
      it(label, async () => {
        mock = mockLayout(layout);
        const { unmount } = render(<Host />);
        expect(layer() === null).toBe(noLayer);
        // One observer, on the whole document, connected while mounted.
        expect(observers).toHaveLength(1);
        expect(observers[0]!.targets).toEqual([document.documentElement]);
        expect(observers[0]!.connected).toBe(true);
        await settle();
        unmount();
        expect(observers[0]!.connected).toBe(false);
        // And nothing is measured any more.
        const reads = mock.reads.scrollWidth;
        await act(async () => {
          document.documentElement.setAttribute('dir', 'rtl');
        });
        expect(mock.reads.scrollWidth).toBe(reads);
      });
    }
  });

  it('without MutationObserver (a stripped environment): no error, scroll still measures, unmount cleans up', () => {
    mock = mockLayout(WIDE);
    const Native = globalThis.MutationObserver;
    (globalThis as { MutationObserver?: unknown }).MutationObserver = undefined;
    try {
      const { unmount } = render(<Host />);
      const el = scroller();
      expect(edges(el)).toEqual({ start: false, end: true });
      scrollLeftTo(250, el);
      expect(edges(el)).toEqual({ start: true, end: true });
      unmount();
      expect(edges(el)).toEqual({ start: false, end: false });
    } finally {
      globalThis.MutationObserver = Native;
    }
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
