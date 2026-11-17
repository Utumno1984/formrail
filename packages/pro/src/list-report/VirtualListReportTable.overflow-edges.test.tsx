import { createRef, useMemo, type Ref } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { useListReport, type ListReportColumn } from '@formrail/core';
import { VirtualListReport } from './VirtualListReport';
import { VirtualListReportTable, type VirtualListReportTableHandle } from './VirtualListReportTable';
import { PITCH, mockTableLayout } from '../../test/virtual-table-utils';

interface Item {
  id: string;
  name: string;
}

const ROWS: Item[] = Array.from({ length: 10_000 }, (_, i) => ({ id: `r${i}`, name: `Item ${i}` }));
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

const isScroller = (el: Element): boolean => el.getAttribute('tabindex') === '0' && el.firstElementChild?.tagName === 'TABLE';

/**
 * The horizontal half of a jsdom layout (`mockTableLayout` gives the vertical one): the scroller is
 * `scrollWidth` wide in a `clientWidth` viewport, with a real, clamped `scrollLeft`.
 */
function mockHorizontalLayout(scrollWidth: number, clientWidth: number) {
  const lefts = new WeakMap<Element, number>();
  const proto = Element.prototype;
  const names = ['scrollWidth', 'clientWidth', 'scrollLeft'] as const;
  const saved = names.map((name) => [name, Object.getOwnPropertyDescriptor(proto, name)] as const);
  Object.defineProperty(proto, 'scrollWidth', {
    configurable: true,
    get(this: Element) {
      return isScroller(this) ? scrollWidth : 0;
    },
  });
  Object.defineProperty(proto, 'clientWidth', {
    configurable: true,
    get(this: Element) {
      return isScroller(this) ? clientWidth : 0;
    },
  });
  Object.defineProperty(proto, 'scrollLeft', {
    configurable: true,
    get(this: Element) {
      return lefts.get(this) ?? 0;
    },
    set(this: Element, value: number) {
      lefts.set(this, Math.max(0, Math.min(scrollWidth - clientWidth, value)));
    },
  });
  return {
    restore() {
      for (const [name, descriptor] of saved) {
        if (descriptor) Object.defineProperty(proto, name, descriptor);
        else delete (proto as unknown as Record<string, unknown>)[name];
      }
    },
  };
}

function Host({ handleRef }: { handleRef?: Ref<VirtualListReportTableHandle> }) {
  const table = useListReport<Item>({ rows: ROWS, columns: COLUMNS, getRowId: (r) => r.id, selectable: true });
  return <VirtualListReportTable table={table} aria-label="Items" handleRef={handleRef} />;
}

const scroller = () => screen.getByRole('table', { name: 'Items' }).parentElement as HTMLElement;
const edges = () => ({
  start: scroller().hasAttribute('data-rop-overflow-start'),
  end: scroller().hasAttribute('data-rop-overflow-end'),
});
const scrollTop = (top: number) => {
  act(() => {
    scroller().scrollTop = top;
    fireEvent.scroll(scroller());
  });
};
const scrollLeft = (left: number) => {
  act(() => {
    scroller().scrollLeft = left;
    fireEvent.scroll(scroller());
  });
};

/** Renders of the rows over a vertical scroll from the top to the bottom and back, in steps. */
function verticalScrollRenders(): number {
  render(<Host />);
  renders = 0;
  for (let row = 0; row <= 10_000; row += 1_000) scrollTop(row * PITCH);
  for (let row = 10_000; row >= 0; row -= 2_500) scrollTop(row * PITCH);
  const count = renders;
  cleanup();
  return count;
}

let layout: ReturnType<typeof mockTableLayout>;
let horizontal: ReturnType<typeof mockHorizontalLayout> | undefined;
beforeEach(() => {
  layout = mockTableLayout();
  renders = 0;
});
afterEach(() => {
  cleanup();
  horizontal?.restore();
  horizontal = undefined;
  layout.restore();
  vi.restoreAllMocks();
});

describe('VirtualListReportTable (10,000 rows): the edge shades of the shared Shell', () => {
  it('columns hidden sideways: a vertical scroll renders exactly the rows it renders when every column fits', () => {
    const fits = verticalScrollRenders();
    horizontal = mockHorizontalLayout(800, 300);
    const hidden = verticalScrollRenders();
    expect(fits).toBeGreaterThan(0);
    expect(hidden).toBe(fits);
    // Two mounts and about thirty range changes of a 10,000-row table in jsdom: CPU-bound.
  }, 30_000);

  it('at the bottom of the dataset: end only, then sideways to the end: start only, and no row renders', () => {
    horizontal = mockHorizontalLayout(800, 300);
    render(<Host />);
    expect(edges()).toEqual({ start: false, end: true });
    expect(scroller().querySelector('[data-rop-overflow-edges]')).not.toBeNull();
    scrollTop(10_000 * PITCH);
    expect(screen.getByText('Item 9999')).toBeInTheDocument();
    expect(edges()).toEqual({ start: false, end: true });
    renders = 0;
    scrollLeft(250);
    expect(edges()).toEqual({ start: true, end: true });
    scrollLeft(500);
    expect(edges()).toEqual({ start: true, end: false });
    scrollLeft(0);
    expect(edges()).toEqual({ start: false, end: true });
    expect(renders).toBe(0);
  });

  it('#562: scrolled down and sideways, a `dir` changed on the root with no `scroll` event (Firefox): the state follows at once, no row renders', async () => {
    horizontal = mockHorizontalLayout(800, 300);
    render(<Host />);
    const el = scroller();
    scrollTop(5_000 * PITCH);
    scrollLeft(250);
    expect(edges()).toEqual({ start: true, end: true });
    // The microtasks the render left (the container's child-list observer measures once for the layer
    // inserted after the table) run now, not inside the change below where they would measure for it.
    await act(async () => {});
    expect(edges()).toEqual({ start: true, end: true });
    renders = 0;
    try {
      // Firefox: back to the start of the new direction (0), and no `scroll` event. The act flushes the
      // microtasks, where the hook's MutationObserver measures.
      await act(async () => {
        document.documentElement.setAttribute('dir', 'rtl');
        el.scrollLeft = 0;
      });
      expect(edges()).toEqual({ start: false, end: true });
      expect(scroller()).toBe(el);
      expect(renders).toBe(0);
    } finally {
      document.documentElement.removeAttribute('dir');
    }
  });

  it('handle.scrollToRowId leaves the horizontal state alone', () => {
    horizontal = mockHorizontalLayout(800, 300);
    const handle = createRef<VirtualListReportTableHandle>();
    render(<Host handleRef={handle} />);
    scrollLeft(250);
    act(() => {
      handle.current!.scrollToRowId('r5000', { align: 'center' });
    });
    act(() => {
      fireEvent.scroll(scroller());
    });
    expect(scroller().scrollLeft).toBe(250);
    expect(edges()).toEqual({ start: true, end: true });
  });
});

describe('VirtualListReport: server rendering', () => {
  function Report() {
    const columns = useMemo(() => COLUMNS, []);
    const table = useListReport<Item>({ rows: ROWS, columns, getRowId: (r) => r.id, selectable: true });
    return <VirtualListReport title="Items" table={table} />;
  }

  it('renderToString measures nothing; hydrateRoot with columns hidden: no mismatch, no warning, the shade after the first measure', async () => {
    const html = renderToString(<Report />);
    expect(html).not.toContain('data-rop-overflow');
    horizontal = mockHorizontalLayout(800, 300);
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
    }
  });
});
