import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ObjectPage } from './ObjectPage';
import { ObjectPageSection } from './ObjectPageSection';
import { scrollerClass } from './object-page-styles';
import { clearanceDelta } from './use-focus-not-obscured';

describe('clearanceDelta', () => {
  const scroller = { top: 100, bottom: 700 };
  const margin = { top: 56, bottom: 8 };

  it('is 0 for a target entirely inside the strip', () => {
    expect(clearanceDelta({ top: 156, bottom: 200 }, scroller, margin)).toBe(0);
    expect(clearanceDelta({ top: 600, bottom: 692 }, scroller, margin)).toBe(0);
  });

  it('scrolls up by the least that clears the top margin', () => {
    expect(clearanceDelta({ top: 150, bottom: 190 }, scroller, margin)).toBe(-6);
    expect(clearanceDelta({ top: 20, bottom: 60 }, scroller, margin)).toBe(-136);
  });

  it('scrolls down by the least that clears the bottom margin', () => {
    expect(clearanceDelta({ top: 660, bottom: 700 }, scroller, margin)).toBe(8);
  });

  it('keeps the top of a target taller than the strip in view', () => {
    expect(clearanceDelta({ top: 300, bottom: 1300 }, scroller, margin)).toBe(144);
  });
});

// jsdom has no layout: the scroller spans 0-600, every input is 40 tall at its `data-top` minus the scroll.
let scrollTop: number;
let frames: FrameRequestCallback[];
let cancelFrame: ReturnType<typeof vi.fn>;
const flushFrames = () =>
  act(() => {
    const pending = frames;
    frames = [];
    for (const callback of pending) callback(0);
  });

beforeEach(() => {
  scrollTop = 0;
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
  cancelFrame = vi.fn((id: number) => {
    frames[id - 1] = () => undefined;
  });
  vi.stubGlobal('cancelAnimationFrame', cancelFrame);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const rect = (top: number, height: number) => ({ top, bottom: top + height, height, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) });
    if (this.hasAttribute('data-object-page-scroller')) return rect(0, 600);
    if (this.tagName === 'NAV') return rect(0, 48);
    const top = this.dataset.top;
    return top === undefined ? rect(0, 0) : rect(Number(top) - scrollTop, 40);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Margins as the page's class gives them in a browser (jsdom does not apply the stylesheet): bar 48 + 8, 8.
const MARGINS = { scrollMarginTop: '56px', scrollMarginBottom: '8px' };

function Page() {
  return (
    <ObjectPage>
      <ObjectPageSection id="a" title="Section A">
        <input aria-label="first" data-top="300" style={MARGINS} />
        <input aria-label="second" data-top="900" style={MARGINS} />
      </ObjectPageSection>
      <ObjectPageSection id="b" title="Section B">
        <input aria-label="third" data-top="1500" style={MARGINS} />
      </ObjectPageSection>
    </ObjectPage>
  );
}

function setup() {
  const view = render(<Page />);
  const scroller = view.container.querySelector('[data-object-page-scroller]') as HTMLElement;
  Object.defineProperty(scroller, 'scrollTop', { configurable: true, get: () => scrollTop, set: (v: number) => (scrollTop = v) });
  return { ...view, scroller };
}

const field = (name: string) => screen.getByRole('textbox', { name });
const pressTab = (shift = false) => fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Tab', shiftKey: shift });

describe('useFocusNotObscured (the Tab fallback of ObjectPage)', () => {
  it('after a Tab, scrolls a control partly under the bar clear of it, one frame later', () => {
    setup();
    // "first" sits 10px under the bar's 56px of room.
    scrollTop = 254;
    pressTab(true);
    act(() => field('first').focus());
    expect(scrollTop).toBe(254);
    flushFrames();
    expect(scrollTop).toBe(244);
    expect(field('first').getBoundingClientRect().top).toBe(56);
  });

  it('after a Tab, scrolls a control past the bottom edge above it', () => {
    setup();
    // "second" ends at 900 + 40 - 340 = 600: 8px short of its bottom room.
    scrollTop = 340;
    pressTab();
    act(() => field('second').focus());
    flushFrames();
    expect(scrollTop).toBe(348);
  });

  it('does not write the scroll position when the browser already cleared the control', () => {
    const { scroller } = setup();
    const set = vi.fn();
    Object.defineProperty(scroller, 'scrollTop', { configurable: true, get: () => 0, set });
    pressTab();
    act(() => field('first').focus());
    flushFrames();
    expect(set).not.toHaveBeenCalled();
  });

  it('leaves a focus given by script alone (no Tab: it may have asked for preventScroll)', () => {
    setup();
    scrollTop = 254;
    act(() => field('first').focus({ preventScroll: true }));
    flushFrames();
    expect(scrollTop).toBe(254);
    // Another key before the focus (Enter on a button that moves it) does not count either.
    act(() => field('second').focus());
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
    act(() => field('first').focus());
    flushFrames();
    expect(scrollTop).toBe(254);
    // A Tab whose key was never released (the window lost the focus) is over at the next key.
    pressTab();
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
    act(() => field('second').focus());
    act(() => field('first').focus());
    flushFrames();
    expect(scrollTop).toBe(254);
    // The Tab is over once its key is released.
    pressTab();
    fireEvent.keyUp(document.activeElement!, { key: 'Tab' });
    act(() => field('second').focus());
    act(() => field('first').focus());
    flushFrames();
    expect(scrollTop).toBe(254);
  });

  it('leaves the Anchor Bar links alone (they are stuck at the top with it)', () => {
    setup();
    scrollTop = 254;
    pressTab(true);
    // Given a top margin (the page's class leaves the bar out; a consumer's could not), the link at the top of
    // the scroller would be "under" it: it is still left alone.
    const link = screen.getByRole('link', { name: 'Section A' });
    Object.assign(link.style, MARGINS);
    act(() => link.focus());
    flushFrames();
    expect(scrollTop).toBe(254);
  });

  it('does nothing when the focus has moved on before the frame', () => {
    setup();
    scrollTop = 254;
    pressTab(true);
    act(() => field('first').focus());
    act(() => (document.activeElement as HTMLElement).blur());
    flushFrames();
    expect(scrollTop).toBe(254);
  });

  it('removes its listeners and cancels a pending frame when unmounted', () => {
    const addDoc = vi.spyOn(document, 'addEventListener');
    const removeDoc = vi.spyOn(document, 'removeEventListener');
    const { scroller, unmount } = setup();
    const addScroller = vi.spyOn(scroller, 'addEventListener');
    const removeScroller = vi.spyOn(scroller, 'removeEventListener');
    const added = addDoc.mock.calls.filter(([type]) => type === 'keydown' || type === 'keyup');
    expect(added.map(([type]) => type).sort()).toEqual(['keydown', 'keyup']);
    scrollTop = 254;
    pressTab(true);
    act(() => field('first').focus());
    // The fallback's frame is the last one requested.
    const pending = frames.length;
    unmount();
    expect(cancelFrame).toHaveBeenCalledWith(pending);
    for (const [type, handler, options] of added) {
      expect(removeDoc).toHaveBeenCalledWith(type, handler, options);
    }
    expect(removeScroller.mock.calls.some(([type]) => type === 'focusin')).toBe(true);
    expect(addScroller).not.toHaveBeenCalled();
    flushFrames();
    expect(scrollTop).toBe(254);
  });
});

describe('the scroller declares the room the browser keeps for a focused control', () => {
  it('a top margin of the sticky offset and a bottom margin of the keyboard inset, outside the Anchor Bar', () => {
    expect(scrollerClass).toContain(
      '[&_:not([data-object-page-anchor-bar]):not([data-object-page-anchor-bar]_*)]:scroll-mt-[calc(var(--rop-object-page-sticky-offset,0px)+0.5rem)]',
    );
    expect(scrollerClass).toContain(
      '[&_:not([data-object-page-anchor-bar]):not([data-object-page-anchor-bar]_*)]:scroll-mb-[calc(var(--rop-keyboard-inset,0px)+0.5rem)]',
    );
    render(<Page />);
    expect(screen.getByRole('navigation')).toHaveAttribute('data-object-page-anchor-bar', '');
  });
});

describe('useFocusNotObscured: a Tab is over without its keyup', () => {
  it('at a pointer press: the focus that follows is a click, left alone', () => {
    setup();
    scrollTop = 254;
    pressTab(true);
    fireEvent.pointerDown(field('first'));
    act(() => field('first').focus());
    flushFrames();
    expect(scrollTop).toBe(254);
  });

  it('when the window loses the focus (the keyup goes to another window)', () => {
    setup();
    scrollTop = 254;
    pressTab(true);
    act(() => {
      window.dispatchEvent(new FocusEvent('blur'));
    });
    act(() => field('first').focus());
    flushFrames();
    expect(scrollTop).toBe(254);
    // The next Tab counts again.
    act(() => field('second').focus());
    pressTab(true);
    act(() => field('first').focus());
    flushFrames();
    expect(scrollTop).toBe(244);
  });

  it('removes the pointer and window listeners when unmounted', () => {
    const addDoc = vi.spyOn(document, 'addEventListener');
    const removeDoc = vi.spyOn(document, 'removeEventListener');
    const addWin = vi.spyOn(window, 'addEventListener');
    const removeWin = vi.spyOn(window, 'removeEventListener');
    const { unmount } = setup();
    const pointer = addDoc.mock.calls.filter(([type]) => type === 'pointerdown');
    const blur = addWin.mock.calls.filter(([type]) => type === 'blur');
    expect(pointer).toHaveLength(1);
    expect(blur).toHaveLength(1);
    unmount();
    for (const call of pointer) expect(removeDoc).toHaveBeenCalledWith(...call);
    for (const call of blur) expect(removeWin).toHaveBeenCalledWith(...call);
  });
});
