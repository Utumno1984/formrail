import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ObjectPage } from './ObjectPage';
import { rootStyle, scrollerStyle } from './object-page-styles';
import { BOTTOM_GAP_VAR, bottomGap, keyboardOverScroller } from './use-bottom-gap';

// The phone of #498: 390x500, a save bar of 89px under the scroller, a keyboard of 225px.
describe('bottomGap and keyboardOverScroller (#498)', () => {
  it('without a footer the scroller reaches the bottom of the window: the whole keyboard covers it', () => {
    const gap = bottomGap(500, 500);
    expect(gap).toBe(0);
    expect(keyboardOverScroller(225, gap)).toBe(225);
  });

  it('with a footer of 89px the keyboard covers it first: 225 - 89 = 136px of the scroller, the footer counted once', () => {
    const gap = bottomGap(411, 500);
    expect(gap).toBe(89);
    expect(keyboardOverScroller(225, gap)).toBe(136);
  });

  it('a keyboard shorter than the footer covers nothing of the scroller; no keyboard, nothing', () => {
    expect(keyboardOverScroller(60, bottomGap(411, 500))).toBe(0);
    expect(keyboardOverScroller(0, bottomGap(411, 500))).toBe(0);
  });

  it('a scroller past the bottom of the window (the document scrolls) has no gap: the whole keyboard', () => {
    expect(bottomGap(1400, 500)).toBe(0);
    expect(keyboardOverScroller(225, bottomGap(1400, 500))).toBe(225);
  });

  it('the scroller computes the same in CSS for its content, from the window value relayed by the root', () => {
    expect(rootStyle).toEqual({ '--rop-object-page-keyboard-inset': 'var(--rop-keyboard-inset, 0px)' });
    expect(scrollerStyle['--rop-keyboard-inset']).toBe(
      `max(0px, var(--rop-object-page-keyboard-inset, 0px) - var(${BOTTOM_GAP_VAR}, 0px))`,
    );
    // The scroller's own bottom padding keeps the window's value (the relay).
    expect(scrollerStyle.paddingBottom).toBe('calc(var(--rop-object-page-keyboard-inset, var(--rop-keyboard-inset, 0px)) + 1rem)');
  });

  it('the root keeps a style of its own next to the relay', () => {
    const { container } = render(<ObjectPage style={{ color: 'red' }} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.getPropertyValue('--rop-object-page-keyboard-inset')).toBe('var(--rop-keyboard-inset, 0px)');
    expect(root.style.color).toBe('red');
  });
});

describe('useBottomGap', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as { visualViewport?: unknown }).visualViewport;
  });

  const scrollerOf = (container: HTMLElement) => container.querySelector('[data-object-page-scroller]') as HTMLElement;

  it('writes nothing without a visual viewport (no keyboard height is ever published)', () => {
    const { container } = render(<ObjectPage />);
    expect(scrollerOf(container).style.getPropertyValue(BOTTOM_GAP_VAR)).toBe('');
  });

  it('writes the room below the scroller, follows a window resize, and removes it on unmount', () => {
    Object.defineProperty(window, 'visualViewport', { value: new EventTarget(), configurable: true });
    let bottom = window.innerHeight - 89;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      () => ({ top: 0, bottom, left: 0, right: 0, width: 0, height: bottom, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect,
    );
    const { container, unmount } = render(<ObjectPage />);
    const scroller = scrollerOf(container);
    expect(scroller.style.getPropertyValue(BOTTOM_GAP_VAR)).toBe('89px');

    bottom = window.innerHeight - 57;
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(scroller.style.getPropertyValue(BOTTOM_GAP_VAR)).toBe('57px');

    bottom = window.innerHeight + 300;
    act(() => {
      scroller.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    });
    expect(scroller.style.getPropertyValue(BOTTOM_GAP_VAR)).toBe('0px');

    unmount();
    expect(scroller.style.getPropertyValue(BOTTOM_GAP_VAR)).toBe('');
  });
});
