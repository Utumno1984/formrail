import { StrictMode, createRef } from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ListReport } from './ListReport';
import type { ListReportColumn } from './types';
import { useListReport } from './use-list-report';
import {
  useListReportScrollRestoration,
  type UseListReportScrollRestorationOptions,
} from './use-list-report-scroll-restoration';

type Opts = UseListReportScrollRestorationOptions;

/** A scroller whose `scrollTop`/`scrollLeft` are plain data, clamped to a max like a real one. */
function makeScrollable(el: HTMLElement, max = { top: 5000, left: 0 }) {
  let top = 0;
  let left = 0;
  let scheduled = false;
  // Like a browser: a change of position (whoever makes it) is reported by one `scroll` event, later.
  const report = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      el.dispatchEvent(new Event('scroll'));
    });
  };
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    get: () => top,
    set: (v: number) => {
      const next = Math.min(Math.max(0, v), max.top);
      if (next !== top) report();
      top = next;
    },
  });
  Object.defineProperty(el, 'scrollLeft', {
    configurable: true,
    get: () => left,
    set: (v: number) => {
      const next = Math.min(Math.max(0, v), max.left);
      if (next !== left) report();
      left = next;
    },
  });
}

/** Lets the pending `scroll` events (and effects) land. */
const settle = () => act(async () => void (await Promise.resolve()));

/** What a user's scroll does: moves, then the browser fires `scroll`. */
function userScroll(el: HTMLElement, top: number, left = 0) {
  el.scrollTop = top;
  el.scrollLeft = left;
  fireEvent.scroll(el);
}

function Scroller(props: Omit<Opts, 'key'> & { scrollKey?: string; max?: { top: number; left: number } }) {
  const { max, scrollKey, ...options } = props;
  const scroll = useListReportScrollRestoration({ ...options, key: scrollKey });
  return (
    <div
      data-testid="scroller"
      ref={(el) => {
        if (el && !Object.getOwnPropertyDescriptor(el, 'scrollTop')) makeScrollable(el, max);
        scroll.ref(el);
      }}
    />
  );
}

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: vi.fn((k: string) => data.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => void data.set(k, v)),
    removeItem: vi.fn((k: string) => void data.delete(k)),
  };
}

const KEY = (k: string) => `rop:list-report-scroll:${k}`;
const scroller = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-testid="scroller"]')!;

beforeEach(() => {
  vi.useFakeTimers();
  window.history.replaceState(null, '', '/list?filter=open');
});
afterEach(() => {
  vi.useRealTimers();
  window.history.replaceState(null, '', '/');
});

describe('useListReportScrollRestoration', () => {
  it('saves the last scroll on unmount and restores it when ready after a remount (window untouched)', () => {
    const storage = memoryStorage();
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    const first = render(<Scroller ready storage={storage} />);
    userScroll(scroller(first.container), 1200);
    first.unmount(); // flushes the pending value
    expect(storage.data.get(KEY('#/list?filter=open'))).toBe('{"top":1200,"left":0}');

    const second = render(<Scroller ready={false} storage={storage} />);
    expect(scroller(second.container).scrollTop).toBe(0); // not ready: the skeleton is not scrolled
    second.rerender(<Scroller ready storage={storage} />);
    expect(scroller(second.container).scrollTop).toBe(1200);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(window.scrollY).toBe(0);
  });

  it('restores in the first commit where ready is true, not before', () => {
    const storage = memoryStorage({ [KEY('#/list?filter=open')]: '{"top":300,"left":0}' });
    const view = render(<Scroller ready={false} storage={storage} />);
    expect(storage.getItem).not.toHaveBeenCalled();
    view.rerender(<Scroller ready storage={storage} />);
    expect(scroller(view.container).scrollTop).toBe(300);
  });

  it('uses a different key for different list parameters', () => {
    const storage = memoryStorage({ [KEY('#/list?filter=open')]: '{"top":300,"left":0}' });
    window.history.replaceState(null, '', '/list?filter=closed');
    const view = render(<Scroller ready storage={storage} />);
    expect(scroller(view.container).scrollTop).toBe(0);
  });

  it('ignores parameters that are not the report\'s own, and their order', () => {
    const storage = memoryStorage({ [KEY('#/list?filter=open&q=a')]: '{"top":70,"left":0}' });
    window.history.replaceState(null, '', '/list?x=1&q=a&filter=open#h');
    const view = render(<Scroller ready storage={storage} />);
    expect(scroller(view.container).scrollTop).toBe(70);
  });

  it('keeps two reports of a page apart with different prefixes', () => {
    const storage = memoryStorage();
    window.history.replaceState(null, '', '/list?a.filter=open&b.filter=closed');
    const view = render(
      <>
        <Scroller ready prefix="a" storage={storage} />
        <Scroller ready prefix="b" storage={storage} />
      </>,
    );
    const [a, b] = Array.from(view.container.querySelectorAll<HTMLElement>('[data-testid="scroller"]'));
    userScroll(a!, 100);
    userScroll(b!, 900);
    view.unmount();
    const again = render(
      <>
        <Scroller ready prefix="a" storage={storage} />
        <Scroller ready prefix="b" storage={storage} />
      </>,
    );
    const [a2, b2] = Array.from(again.container.querySelectorAll<HTMLElement>('[data-testid="scroller"]'));
    expect([a2!.scrollTop, b2!.scrollTop]).toEqual([100, 900]);
  });

  it('does not override a scroll of the user made before the data arrived', () => {
    const storage = memoryStorage({ [KEY('#/list?filter=open')]: '{"top":1200,"left":0}' });
    const view = render(<Scroller ready={false} storage={storage} />);
    userScroll(scroller(view.container), 40);
    view.rerender(<Scroller ready storage={storage} />);
    expect(scroller(view.container).scrollTop).toBe(40);
  });

  it('restores at most once: a later ready cycle does not scroll again', () => {
    const storage = memoryStorage({ [KEY('#/list?filter=open')]: '{"top":500,"left":0}' });
    const view = render(<Scroller ready storage={storage} />);
    expect(scroller(view.container).scrollTop).toBe(500);
    userScroll(scroller(view.container), 20);
    view.rerender(<Scroller ready={false} storage={storage} />);
    view.rerender(<Scroller ready storage={storage} />);
    expect(scroller(view.container).scrollTop).toBe(20);
  });

  it('stops at the maximum for a shorter dataset, without errors, and saves the clamped value at the next scroll', () => {
    const storage = memoryStorage({ [KEY('#/list?filter=open')]: '{"top":1200,"left":0}' });
    const view = render(<Scroller ready storage={storage} max={{ top: 300, left: 0 }} />);
    expect(scroller(view.container).scrollTop).toBe(300);
    userScroll(scroller(view.container), 250);
    act(() => void vi.advanceTimersByTime(200));
    expect(storage.data.get(KEY('#/list?filter=open'))).toBe('{"top":250,"left":0}');
  });

  it('does not clear the stored value when ready but the user has not scrolled (empty or error views)', () => {
    const stored = '{"top":1200,"left":0}';
    const storage = memoryStorage({ [KEY('#/list?filter=open')]: stored });
    const view = render(<Scroller ready storage={storage} max={{ top: 0, left: 0 }} />);
    view.unmount();
    expect(storage.data.get(KEY('#/list?filter=open'))).toBe(stored);
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('throttles the writes and still saves the last value', () => {
    const storage = memoryStorage();
    const view = render(<Scroller ready storage={storage} />);
    const el = scroller(view.container);
    for (let i = 1; i <= 20; i++) {
      userScroll(el, i * 10);
      act(() => void vi.advanceTimersByTime(10));
    }
    expect(storage.setItem.mock.calls.length).toBeLessThanOrEqual(2);
    userScroll(el, 777);
    view.unmount();
    expect(storage.data.get(KEY('#/list?filter=open'))).toBe('{"top":777,"left":0}');
  });

  it('flushes on pagehide', () => {
    const storage = memoryStorage();
    const view = render(<Scroller ready storage={storage} />);
    userScroll(scroller(view.container), 640);
    expect(storage.setItem).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('pagehide'));
    expect(storage.data.get(KEY('#/list?filter=open'))).toBe('{"top":640,"left":0}');
  });

  it('saves and restores scrollLeft with the same contract', () => {
    const storage = memoryStorage();
    const max = { top: 5000, left: 800 };
    const first = render(<Scroller ready storage={storage} max={max} />);
    userScroll(scroller(first.container), 10, 450);
    first.unmount();
    const second = render(<Scroller ready storage={storage} max={max} />);
    expect(scroller(second.container).scrollLeft).toBe(450);
  });

  it('does not throw when storage throws on read and write', () => {
    const boom = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    const storage = { getItem: boom, setItem: boom, removeItem: boom };
    const view = render(<Scroller ready storage={storage} />);
    userScroll(scroller(view.container), 100);
    expect(() => view.unmount()).not.toThrow();
    expect(scroller(render(<Scroller ready storage={storage} />).container).scrollTop).toBe(0);
  });

  it('does not throw when window.sessionStorage itself throws', () => {
    const spy = vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    const view = render(<Scroller ready />);
    userScroll(scroller(view.container), 100);
    expect(() => view.unmount()).not.toThrow();
    spy.mockRestore();
  });

  it.each(['abc', '{bad json', '-5', '{"top":-1,"left":0}', '{"top":"7","left":0}', 'null', '[]', '{"top":1}'])(
    'ignores a corrupt stored value (%s)',
    (raw) => {
      const storage = memoryStorage({ [KEY('#/list?filter=open')]: raw });
      const view = render(<Scroller ready storage={storage} />);
      expect(scroller(view.container).scrollTop).toBe(0);
    },
  );

  it('uses an explicit key as given, ignoring the URL', () => {
    const storage = memoryStorage({ [KEY('mine')]: '{"top":55,"left":0}' });
    const view = render(<Scroller ready scrollKey="mine" storage={storage} />);
    expect(scroller(view.container).scrollTop).toBe(55);
  });

  it('keeps two reports apart even with no parameter in the URL (default state)', () => {
    const storage = memoryStorage();
    window.history.replaceState(null, '', '/list');
    const pair = () => (
      <>
        <Scroller ready prefix="a" storage={storage} />
        <Scroller ready prefix="b" storage={storage} />
      </>
    );
    const first = render(pair());
    const [a, b] = Array.from(first.container.querySelectorAll<HTMLElement>('[data-testid="scroller"]'));
    userScroll(a!, 100);
    userScroll(b!, 900);
    first.unmount();
    expect(storage.data.size).toBe(2);
    const again = render(pair());
    const [a2, b2] = Array.from(again.container.querySelectorAll<HTMLElement>('[data-testid="scroller"]'));
    expect([a2!.scrollTop, b2!.scrollTop]).toEqual([100, 900]);
  });

  it('does not save the browser echo of its own restoration (a momentarily shorter dataset keeps the good position)', async () => {
    const stored = '{"top":1200,"left":0}';
    const storage = memoryStorage({ [KEY('#/list?filter=open')]: stored });
    const view = render(<Scroller ready storage={storage} max={{ top: 300, left: 0 }} />);
    expect(scroller(view.container).scrollTop).toBe(300);
    await settle(); // the echo `scroll` event lands
    act(() => void vi.advanceTimersByTime(500));
    view.unmount();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.data.get(KEY('#/list?filter=open'))).toBe(stored);
  });

  it('keeps the stored value when ready on an empty list that still scrolls sideways', async () => {
    const stored = '{"top":1200,"left":300}';
    const storage = memoryStorage({ [KEY('#/list?filter=open')]: stored });
    const view = render(<Scroller ready storage={storage} max={{ top: 0, left: 800 }} />);
    expect(scroller(view.container).scrollLeft).toBe(300);
    await settle();
    act(() => void vi.advanceTimersByTime(500));
    view.unmount();
    expect(storage.data.get(KEY('#/list?filter=open'))).toBe(stored);
  });

  it('a gesture right after the echo is saved as usual', async () => {
    const storage = memoryStorage({ [KEY('#/list?filter=open')]: '{"top":500,"left":0}' });
    const view = render(<Scroller ready storage={storage} />);
    await settle();
    userScroll(scroller(view.container), 520);
    view.unmount();
    expect(storage.data.get(KEY('#/list?filter=open'))).toBe('{"top":520,"left":0}');
  });

  it('writes the last position of the previous view when the URL changes inside the throttle window', () => {
    const storage = memoryStorage();
    const view = render(<Scroller ready storage={storage} />);
    const el = scroller(view.container);
    userScroll(el, 1200);
    act(() => void vi.advanceTimersByTime(50));
    window.history.replaceState(null, '', '/list?filter=rejected');
    userScroll(el, 0);
    view.unmount();
    expect(storage.data.get(KEY('#/list?filter=open'))).toBe('{"top":1200,"left":0}');
    expect(storage.data.get(KEY('#/list?filter=rejected'))).toBe('{"top":0,"left":0}');
  });

  it('works in StrictMode: the double mount does not consume the restoration', () => {
    const storage = memoryStorage({ [KEY('#/list?filter=open')]: '{"top":900,"left":0}' });
    const view = render(
      <StrictMode>
        <Scroller ready={false} storage={storage} />
      </StrictMode>,
    );
    view.rerender(
      <StrictMode>
        <Scroller ready storage={storage} />
      </StrictMode>,
    );
    expect(scroller(view.container).scrollTop).toBe(900);
  });
});

// --- ListReport: the new `scrollerRef` prop ------------------------------------------------------

interface Row {
  id: string;
}
const COLUMNS: ListReportColumn<Row>[] = [{ id: 'id', header: 'Id', accessor: (r) => r.id }];
const ROWS: Row[] = [{ id: 'a' }, { id: 'b' }];

function Report({ scrollerRef }: { scrollerRef?: React.Ref<HTMLDivElement> }) {
  const table = useListReport<Row>({ rows: ROWS, columns: COLUMNS, getRowId: (r) => r.id });
  return <ListReport title="Rows" table={table} scrollerRef={scrollerRef} data-testid="root" />;
}

describe('ListReport scrollerRef', () => {
  it('points at the table container (overflow: auto) and never shows up as an attribute', () => {
    const ref = createRef<HTMLDivElement>();
    const { container } = render(<Report scrollerRef={ref} />);
    const el = ref.current!;
    expect(el).toBeInstanceOf(HTMLDivElement);
    expect(el).toBe(container.querySelector('table')!.parentElement);
    expect(el.className).toMatch(/overflow-auto/);
    expect(container.innerHTML).not.toMatch(/scrollerref/i);
    expect(container.querySelector('[data-testid="root"]')!.getAttributeNames().join()).not.toMatch(/scroller/i);
  });

  it('works with the hook ref (callback)', () => {
    const storage = memoryStorage({ [KEY('#/list?filter=open')]: '{"top":10,"left":0}' });
    function Wired() {
      const scroll = useListReportScrollRestoration({ ready: true, storage });
      return <Report scrollerRef={(el) => { if (el) makeScrollable(el); scroll.ref(el); }} />;
    }
    expect(() => render(<Wired />)).not.toThrow();
  });
});
