import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stickyLayer } from '../overlay/layers';
import { ObjectPage } from './ObjectPage';
import { ObjectPageSection } from './ObjectPageSection';

const BAR_HEIGHT = 40;

interface Layout {
  /** Document position of the top of each section, with the scroller at scrollTop 0. */
  tops: Record<string, number>;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

let layout: Layout;
let frames: FrameRequestCallback[];

/** Runs the animation frames requested so far (the spy reads layout in one per scroll burst). */
const flushFrames = () =>
  act(() => {
    const pending = frames;
    frames = [];
    for (const callback of pending) callback(0);
  });

/** jsdom has no layout: positions are derived from `layout`, as a browser would give them. */
function installLayout() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const rect = (top: number, height: number) => ({ top, bottom: top + height, height, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) });
    if (this.hasAttribute('data-object-page-scroller')) return rect(0, layout.clientHeight);
    if (this.tagName === 'NAV') return rect(0, BAR_HEIGHT);
    const top = layout.tops[this.id];
    return top === undefined ? rect(0, 0) : rect(top - layout.scrollTop, 100);
  });
}

function scrollerOf(container: HTMLElement): HTMLElement {
  const scroller = container.querySelector('[data-object-page-scroller]') as HTMLElement;
  Object.defineProperty(scroller, 'scrollTop', { configurable: true, get: () => layout.scrollTop, set: (v: number) => (layout.scrollTop = v) });
  Object.defineProperty(scroller, 'scrollHeight', { configurable: true, get: () => layout.scrollHeight });
  Object.defineProperty(scroller, 'clientHeight', { configurable: true, get: () => layout.clientHeight });
  // The scroller is 800 wide with a scrollbar to the right of x = 800 (content width 800).
  Object.defineProperty(scroller, 'clientWidth', { configurable: true, get: () => 800 });
  return scroller;
}

const scrollTo = (scroller: HTMLElement, top: number) => {
  layout.scrollTop = top;
  fireEvent.scroll(scroller);
  flushFrames();
};

const current = () => screen.queryAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'location');
const link = (name: string) => screen.getByRole('link', { name });

function Page({ ids = ['a', 'b', 'c'], ...rest }: { ids?: string[]; sectionNavigation?: 'anchors' | 'none'; labels?: { anchorBar?: string }; extra?: ReactNode }) {
  return (
    <ObjectPage sectionNavigation={rest.sectionNavigation} labels={rest.labels}>
      {ids.map((id) => (
        <ObjectPageSection key={id} id={id} title={`Sezione ${id.toUpperCase()}`}>
          <input aria-label={`campo ${id}`} />
        </ObjectPageSection>
      ))}
      {rest.extra}
    </ObjectPage>
  );
}

beforeEach(() => {
  layout = { tops: { a: 0, b: 500, c: 1000 }, scrollTop: 0, scrollHeight: 1500, clientHeight: 600 };
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal('cancelAnimationFrame', () => {
    frames = [];
  });
  installLayout();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Anchor Bar rendering', () => {
  it('lists the sections in DOM order as real links inside a named nav', () => {
    render(<Page />);
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((a) => a.textContent)).toEqual(['Sezione A', 'Sezione B', 'Sezione C']);
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['#a', '#b', '#c']);
    expect(within(nav).getAllByRole('listitem')).toHaveLength(3);
  });

  it('takes the name of the nav from labels.anchorBar', () => {
    render(<Page labels={{ anchorBar: 'Vai a' }} />);
    expect(screen.getByRole('navigation', { name: 'Vai a' })).toBeInTheDocument();
  });

  it('renders nothing with one section, or with sectionNavigation="none"', () => {
    const { unmount } = render(<Page ids={['a']} />);
    expect(screen.queryByRole('navigation')).toBeNull();
    unmount();
    render(<Page sectionNavigation="none" />);
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('pins the bar at the top of the scroller on the sticky level of the z-index scale', () => {
    const { container } = render(<Page />);
    const nav = screen.getByRole('navigation');
    expect(container.querySelector('[data-object-page-scroller]')?.firstElementChild).toBe(nav);
    expect(nav).toHaveClass('sticky', '-top-4', stickyLayer);
  });

  it('follows sections added, removed and renamed; a removed active section is recomputed without a crash', async () => {
    const { rerender, container } = render(<Page />);
    scrollerOf(container);
    rerender(<Page ids={['a', 'b', 'c', 'd']} />);
    expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual(['Sezione A', 'Sezione B', 'Sezione C', 'Sezione D']);
    layout.tops.d = 1500;
    rerender(<Page ids={['d', 'a', 'b', 'c']} />);
    // A keyed reorder is seen by the page's MutationObserver, so asynchronously.
    await waitFor(() => expect(screen.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['#d', '#a', '#b', '#c']));

    scrollTo(scrollerOf(container), 500);
    expect(current().map((a) => a.textContent)).toEqual(['Sezione B']);
    rerender(<Page ids={['a', 'c']} />);
    flushFrames();
    expect(current()).toHaveLength(1);
    expect(screen.getAllByRole('link')).toHaveLength(2);

    rerender(<Page ids={['a']} />);
    expect(screen.queryByRole('navigation')).toBeNull();
  });
});

describe('Anchor Bar scroll-spy', () => {
  it('marks the first section at the top and exactly one link at any time', () => {
    const { container } = render(<Page />);
    const scroller = scrollerOf(container);
    scrollTo(scroller, 0);
    expect(current().map((a) => a.textContent)).toEqual(['Sezione A']);
    // The active link is also visually distinct.
    expect(link('Sezione A')).toHaveClass('text-rop-primary');
    expect(link('Sezione B')).not.toHaveClass('text-rop-primary');
  });

  it('activates the last section whose top has passed the bottom edge of the bar', () => {
    const { container } = render(<Page />);
    const scroller = scrollerOf(container);
    scrollTo(scroller, 400); // B's top is at 100, below the bar (40)
    expect(current().map((a) => a.textContent)).toEqual(['Sezione A']);
    scrollTo(scroller, 461); // B's top is at 39, above the bar's bottom
    expect(current().map((a) => a.textContent)).toEqual(['Sezione B']);
    scrollTo(scroller, 700);
    expect(current().map((a) => a.textContent)).toEqual(['Sezione B']);
    scrollTo(scroller, 960);
    expect(current().map((a) => a.textContent)).toEqual(['Sezione C']);
  });

  it('activates the last section at the end of the scroller even if it is too short to reach the top', () => {
    layout.tops = { a: 0, b: 500, c: 1200 };
    layout.scrollHeight = 1400; // max scrollTop 800: C's top stays at 400
    const { container } = render(<Page />);
    const scroller = scrollerOf(container);
    scrollTo(scroller, 600);
    expect(current().map((a) => a.textContent)).toEqual(['Sezione B']);
    scrollTo(scroller, 800);
    expect(current().map((a) => a.textContent)).toEqual(['Sezione C']);
  });

  it('keeps the first section active when nothing can scroll', () => {
    layout.scrollHeight = 600;
    const { container } = render(<Page />);
    scrollTo(scrollerOf(container), 0);
    expect(current().map((a) => a.textContent)).toEqual(['Sezione A']);
  });

  it('reads layout in animation frames: a burst of scroll events costs one read', () => {
    const { container } = render(<Page />);
    const scroller = scrollerOf(container);
    flushFrames();
    const rects = vi.mocked(HTMLElement.prototype.getBoundingClientRect);
    rects.mockClear();
    layout.scrollTop = 100;
    for (let i = 0; i < 20; i += 1) fireEvent.scroll(scroller);
    expect(rects).not.toHaveBeenCalled();
    expect(frames).toHaveLength(1);
    flushFrames();
    // One pass: the scroller, the bar and the three sections.
    expect(rects.mock.calls.length).toBeLessThanOrEqual(5);
  });
});

describe('Anchor Bar navigation', () => {
  it('scrolls the scroller (not the document) below the bar, keeps the URL, focuses the title', () => {
    const { container } = render(<Page />);
    const scroller = scrollerOf(container);
    const scrollToSpy = vi.fn();
    scroller.scrollTo = scrollToSpy as unknown as typeof scroller.scrollTo;
    const windowScroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    const hash = window.location.hash;
    const historyLength = window.history.length;

    const notPrevented = fireEvent.click(link('Sezione C'));
    expect(notPrevented).toBe(false);
    // C's top minus the bar would be 960, but the scroller ends at 900 (1500 - 600).
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 900, behavior: 'smooth' });
    expect(windowScroll).not.toHaveBeenCalled();
    expect(window.location.hash).toBe(hash);
    expect(window.history.length).toBe(historyLength);
    expect(screen.getByRole('heading', { name: 'Sezione C' })).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Sezione C' })).toHaveAttribute('tabindex', '-1');
    expect(current().map((a) => a.textContent)).toEqual(['Sezione C']);
  });

  it('scrolls instantly under prefers-reduced-motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const { container } = render(<Page />);
    const scroller = scrollerOf(container);
    const scrollToSpy = vi.fn();
    scroller.scrollTo = scrollToSpy as unknown as typeof scroller.scrollTo;
    fireEvent.click(link('Sezione B'));
    // 4px of room above the title for its focus indicator.
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 500 - BAR_HEIGHT - 4, behavior: 'auto' });
  });

  it('leaves modified clicks to the browser (open in a new tab)', () => {
    render(<Page />);
    expect(fireEvent.click(link('Sezione B'), { ctrlKey: true })).toBe(true);
    expect(fireEvent.click(link('Sezione B'), { metaKey: true })).toBe(true);
    expect(fireEvent.click(link('Sezione B'), { shiftKey: true })).toBe(true);
  });

  it('keeps the clicked link active during the animated scroll, without passing through the intermediate ones', () => {
    const { container } = render(<Page />);
    const scroller = scrollerOf(container);
    scroller.scrollTo = vi.fn() as unknown as typeof scroller.scrollTo;
    fireEvent.click(link('Sezione C'));
    for (const top of [0, 150, 320, 480, 700, 900]) {
      scrollTo(scroller, top);
      expect(current().map((a) => a.textContent)).toEqual(['Sezione C']);
    }
    // Arrived and still there: the pin holds, and a short section that cannot reach the top stays active.
    scrollTo(scroller, 900);
    expect(current().map((a) => a.textContent)).toEqual(['Sezione C']);
  });

  it('drops the pin when the scroller is moved away after arriving (a scroll that is not the user\'s input)', () => {
    const { container } = render(<Page />);
    const scroller = scrollerOf(container);
    scroller.scrollTo = vi.fn() as unknown as typeof scroller.scrollTo;
    fireEvent.click(link('Sezione C'));
    scrollTo(scroller, 900);
    scrollTo(scroller, 0);
    expect(current().map((a) => a.textContent)).toEqual(['Sezione A']);
  });

  it('drops the pin when content above the pinned section grows after the jump (layout moved, scroller did not)', () => {
    const observers: (() => void)[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          observers.push(callback);
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const { container } = render(<Page />);
    const scroller = scrollerOf(container);
    scroller.scrollTo = vi.fn() as unknown as typeof scroller.scrollTo;
    fireEvent.click(link('Sezione B'));
    scrollTo(scroller, 456); // B's top minus the bar and the 4px gap
    expect(current().map((a) => a.textContent)).toEqual(['Sezione B']);
    // A section above grew by 1500px: B is now far below, the scroller has not moved.
    layout.tops = { a: 0, b: 2000, c: 2500 };
    layout.scrollHeight = 3000;
    act(() => observers.forEach((notify) => notify()));
    flushFrames();
    expect(current().map((a) => a.textContent)).toEqual(['Sezione A']);
  });

  it('drops the pin when the animated scroll stalls before arriving', () => {
    vi.useFakeTimers();
    try {
      const { container } = render(<Page />);
      const scroller = scrollerOf(container);
      scroller.scrollTo = vi.fn() as unknown as typeof scroller.scrollTo;
      fireEvent.click(link('Sezione C'));
      scrollTo(scroller, 300); // on its way, then nothing moves it any more
      expect(current().map((a) => a.textContent)).toEqual(['Sezione C']);
      act(() => {
        vi.advanceTimersByTime(400);
      });
      flushFrames();
      expect(current().map((a) => a.textContent)).toEqual(['Sezione A']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('hands the active link back to the spy when the user scrolls (wheel, scroll key, press)', () => {
    for (const release of [
      (scroller: HTMLElement) => fireEvent.wheel(scroller),
      (scroller: HTMLElement) => fireEvent.keyDown(scroller, { key: 'PageUp' }),
      // A press on the scrollbar (to the right of the content), not on the content.
      (scroller: HTMLElement) => fireEvent.pointerDown(scroller, { clientX: 810, clientY: 100 }),
      (scroller: HTMLElement) => fireEvent.touchStart(scroller),
    ]) {
      layout.scrollTop = 0;
      const { container, unmount } = render(<Page />);
      const scroller = scrollerOf(container);
      scroller.scrollTo = vi.fn() as unknown as typeof scroller.scrollTo;
      fireEvent.click(link('Sezione C'));
      layout.scrollTop = 0;
      release(scroller);
      flushFrames();
      expect(current().map((a) => a.textContent)).toEqual(['Sezione A']);
      unmount();
    }
  });

  it('keeps the pin for what does not scroll: presses and keys in a field, a press on the content, gestures on the bar', () => {
    const { container } = render(<Page />);
    const scroller = scrollerOf(container);
    scroller.scrollTo = vi.fn() as unknown as typeof scroller.scrollTo;
    fireEvent.click(link('Sezione C'));
    scrollTo(scroller, 900);
    const field = screen.getByRole('textbox', { name: 'campo c' });
    fireEvent.pointerDown(field, { clientX: 10, clientY: 10 });
    fireEvent.keyDown(field, { key: ' ' });
    fireEvent.keyDown(field, { key: 'Home' });
    fireEvent.pointerDown(scroller, { clientX: 10, clientY: 100 });
    fireEvent.touchStart(link('Sezione B'));
    fireEvent.wheel(screen.getByRole('navigation'));
    flushFrames();
    expect(current().map((a) => a.textContent)).toEqual(['Sezione C']);
    // A scroll key that does not come from a field is the user scrolling.
    fireEvent.keyDown(scroller, { key: ' ' });
    layout.scrollTop = 0;
    flushFrames();
    expect(current().map((a) => a.textContent)).toEqual(['Sezione A']);
  });

  it('keeps the pin when the section it landed on grows after arriving, the scroller stopped short at its end', () => {
    const observers: (() => void)[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          observers.push(callback);
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const { container } = render(<Page />);
    const scroller = scrollerOf(container);
    scroller.scrollTo = vi.fn() as unknown as typeof scroller.scrollTo;
    fireEvent.click(link('Sezione C'));
    scrollTo(scroller, 900); // C wanted 956 but the scroller ends at 900: C sits 60px below the bar
    expect(current().map((a) => a.textContent)).toEqual(['Sezione C']);
    // C grows by 30px (an error message appears): the scroller's end moves, C has not moved at all.
    layout.scrollHeight = 1530;
    act(() => observers.forEach((notify) => notify()));
    flushFrames();
    expect(current().map((a) => a.textContent)).toEqual(['Sezione C']);
    // And the pin is still a pin: C now could be scrolled further, yet it stays the active one.
    scrollTo(scroller, 900);
    expect(current().map((a) => a.textContent)).toEqual(['Sezione C']);
  });

  it('re-aims an animation under way when the layout moves (content that grew meanwhile)', () => {
    const observers: (() => void)[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          observers.push(callback);
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const { container } = render(<Page />);
    const scroller = scrollerOf(container);
    const scrollToSpy = vi.fn();
    scroller.scrollTo = scrollToSpy as unknown as typeof scroller.scrollTo;
    fireEvent.click(link('Sezione C'));
    expect(scrollToSpy).toHaveBeenLastCalledWith({ top: 900, behavior: 'smooth' });
    scrollTo(scroller, 300); // on its way
    // The section in the middle grew by 400px while it scrolled: C is lower now.
    layout.tops = { a: 0, b: 500, c: 1400 };
    layout.scrollHeight = 2200;
    act(() => observers.forEach((notify) => notify()));
    flushFrames();
    expect(scrollToSpy).toHaveBeenLastCalledWith({ top: 1400 - BAR_HEIGHT - 4, behavior: 'smooth' });
    expect(current().map((a) => a.textContent)).toEqual(['Sezione C']);
  });

  it('clicking the last link with nothing to scroll makes it active; clicking the active one again keeps it', () => {
    layout.scrollHeight = 600;
    const { container } = render(<Page />);
    const scroller = scrollerOf(container);
    const scrollToSpy = vi.fn();
    scroller.scrollTo = scrollToSpy as unknown as typeof scroller.scrollTo;
    fireEvent.click(link('Sezione C'));
    expect(current().map((a) => a.textContent)).toEqual(['Sezione C']);
    fireEvent.click(link('Sezione C'));
    expect(scrollToSpy).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('heading', { name: 'Sezione C' })).toHaveFocus();
    expect(current().map((a) => a.textContent)).toEqual(['Sezione C']);
  });

  it('Tab after a jump enters the content of the section', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const { container } = render(<Page />);
    scrollerOf(container).scrollTo = vi.fn() as unknown as HTMLElement['scrollTo'];
    fireEvent.click(link('Sezione B'));
    await user.tab();
    expect(screen.getByRole('textbox', { name: 'campo b' })).toHaveFocus();
  });
});

describe('Anchor Bar sticky offset and cleanup', () => {
  it('publishes the measured height of the bar and removes it with the bar', () => {
    const { container, rerender } = render(<Page />);
    const scroller = scrollerOf(container);
    expect(scroller.style.getPropertyValue('--rop-object-page-sticky-offset')).toBe(`${BAR_HEIGHT}px`);
    rerender(<Page ids={['a']} />);
    expect(scroller.style.getPropertyValue('--rop-object-page-sticky-offset')).toBe('');
  });

  it('removes every listener it added on the scroller and cancels a pending frame when unmounted', () => {
    const add = vi.spyOn(HTMLElement.prototype, 'addEventListener');
    const remove = vi.spyOn(HTMLElement.prototype, 'removeEventListener');
    const { container, unmount } = render(<Page />);
    const scroller = scrollerOf(container);
    fireEvent.scroll(scroller);
    const scrollerAdds = add.mock.calls.filter((_, i) => add.mock.contexts[i] === scroller);
    expect(scrollerAdds.map((c) => c[0])).toEqual(expect.arrayContaining(['scroll', 'wheel', 'touchstart', 'pointerdown', 'keydown']));
    expect(frames).toHaveLength(1);
    unmount();
    const scrollerRemoves = remove.mock.calls.filter((_, i) => remove.mock.contexts[i] === scroller);
    for (const [type, handler] of scrollerAdds) {
      expect(scrollerRemoves.some(([t, h]) => t === type && h === handler), `${String(type)} listener removed`).toBe(true);
    }
    // The pending frame is cancelled (the stub drops the queue), so nothing runs on a gone tree.
    expect(frames).toHaveLength(0);
  });
});
