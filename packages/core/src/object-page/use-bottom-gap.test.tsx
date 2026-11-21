import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Field } from '../field/Field';
import { Input } from '../input/Input';
import { KEYBOARD_INSET_EVENT } from '../internal/keyboard-inset';
import { ObjectPage } from './ObjectPage';
import { rootStyle, scrollerStyle } from './object-page-styles';
import { BOTTOM_GAP_VAR, bottomGap, keyboardOverScroller, scrollsItself } from './use-bottom-gap';

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

describe('scrollsItself (#498, QA round 1)', () => {
  it('a scrollable overflow with more content than room: the scroller scrolls its content', () => {
    expect(scrollsItself('auto', 2000, 411)).toBe(true);
    expect(scrollsItself('scroll', 2000, 411)).toBe(true);
    expect(scrollsItself('overlay', 2000, 411)).toBe(true);
  });

  it('`hidden` from the consumer is still a scroll container: `scrollIntoView` scrolls it (QA round 2)', () => {
    expect(scrollsItself('hidden', 2000, 411)).toBe(true);
  });

  it('no height from the parent (it grows with its content, the document scrolls) or nothing to scroll: it does not', () => {
    expect(scrollsItself('auto', 1400, 1400)).toBe(false);
    expect(scrollsItself('auto', 0, 0)).toBe(false);
    expect(scrollsItself('visible', 2000, 411)).toBe(false);
    expect(scrollsItself('clip', 2000, 411)).toBe(false);
  });
});

describe('useBottomGap', () => {
  let sheet: HTMLStyleElement | null = null;
  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as { visualViewport?: unknown }).visualViewport;
    sheet?.remove();
    sheet = null;
  });

  const scrollerOf = (container: HTMLElement) => container.querySelector('[data-object-page-scroller]') as HTMLElement;

  /** jsdom has no layout: the scroller of a page with a height from its parent, scrolling 2000px of content in 411px. */
  const scrollingScroller = () => {
    sheet = document.createElement('style');
    sheet.textContent = '[data-object-page-scroller] { overflow-y: auto; }';
    document.head.append(sheet);
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(2000);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(411);
  };

  it('writes nothing without a visual viewport (no keyboard height is ever published)', () => {
    const { container } = render(<ObjectPage />);
    expect(scrollerOf(container).style.getPropertyValue(BOTTOM_GAP_VAR)).toBe('');
  });

  it('the document scrolls (the scroller grows with its content): 0, though it ends inside the window above a save bar', () => {
    Object.defineProperty(window, 'visualViewport', { value: new EventTarget(), configurable: true });
    sheet = document.createElement('style');
    sheet.textContent = '[data-object-page-scroller] { overflow-y: auto; }';
    document.head.append(sheet);
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1400);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(1400);
    const bottom = window.innerHeight - 89;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      () => ({ top: 0, bottom, left: 0, right: 0, width: 0, height: bottom, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect,
    );
    const { container } = render(<ObjectPage />);
    const scroller = scrollerOf(container);
    expect(scroller.style.getPropertyValue(BOTTOM_GAP_VAR)).toBe('0px');
    // Scrolled to the end, or the keyboard's padding grew it: still 0.
    act(() => {
      window.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('resize'));
    });
    expect(scroller.style.getPropertyValue(BOTTOM_GAP_VAR)).toBe('0px');
  });

  it('writes the room below the scroller, follows a window resize, and removes it on unmount', () => {
    Object.defineProperty(window, 'visualViewport', { value: new EventTarget(), configurable: true });
    scrollingScroller();
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

  describe('a page with a height whose content fits: it overflows only with the keyboard (QA round 2)', () => {
    const KEYBOARD = 225;
    const keyboardOn = () => parseFloat(document.documentElement.style.getPropertyValue('--rop-keyboard-inset')) > 0;
    const original = Element.prototype.scrollIntoView;
    afterEach(() => {
      Element.prototype.scrollIntoView = original;
      document.documentElement.style.removeProperty('--rop-keyboard-inset');
    });

    /** 411px of room above a save bar of 89px; the keyboard's bottom padding makes 528px of content, 411 without. */
    const fittingPage = () => {
      Object.defineProperty(window, 'visualViewport', {
        value: Object.assign(new EventTarget(), { height: window.innerHeight - KEYBOARD, offsetTop: 0, scale: 1 }),
        configurable: true,
      });
      sheet = document.createElement('style');
      sheet.textContent = '[data-object-page-scroller] { overflow-y: auto; }';
      document.head.append(sheet);
      vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => (keyboardOn() ? 528 : 411));
      vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(411);
      const bottom = window.innerHeight - 89;
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
        () => ({ top: bottom - 40, bottom, left: 0, right: 0, width: 0, height: 40, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect,
      );
    };

    it('the Field scrolls itself with the gap of the keyboard it has just published, not the 0 read before it', () => {
      fittingPage();
      const gapAtScroll: string[] = [];
      const { container } = render(
        <ObjectPage>
          <Field label="Notes">
            <Input />
          </Field>
        </ObjectPage>,
      );
      const scroller = scrollerOf(container);
      Element.prototype.scrollIntoView = vi.fn(() => {
        gapAtScroll.push(scroller.style.getPropertyValue(BOTTOM_GAP_VAR));
      });
      // No keyboard yet: the content fits, nothing to scroll.
      expect(scroller.style.getPropertyValue(BOTTOM_GAP_VAR)).toBe('0px');
      act(() => screen.getByRole('textbox').focus());
      expect(document.documentElement.style.getPropertyValue('--rop-keyboard-inset')).toBe(`${KEYBOARD}px`);
      // The Field's scroll (its control under the keyboard) read the gap measured with the keyboard's padding in.
      expect(gapAtScroll).toEqual(['89px']);
      expect(scroller.style.getPropertyValue(BOTTOM_GAP_VAR)).toBe('89px');
    });

    it('on Tab the height is gone when focusin reaches the scroller: the gap measured then is replaced when it is back', () => {
      fittingPage();
      const { container } = render(
        <ObjectPage>
          <div data-testid="field" />
        </ObjectPage>,
      );
      const scroller = scrollerOf(container);
      const field = screen.getByTestId('field');
      document.documentElement.style.setProperty('--rop-keyboard-inset', `${KEYBOARD}px`);
      act(() => {
        field.dispatchEvent(new Event(KEYBOARD_INSET_EVENT, { bubbles: true }));
      });
      expect(scroller.style.getPropertyValue(BOTTOM_GAP_VAR)).toBe('89px');
      // The Field losing the focus removes the height, then focusin reaches the scroller: no overflow, 0.
      document.documentElement.style.removeProperty('--rop-keyboard-inset');
      act(() => {
        field.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      });
      expect(scroller.style.getPropertyValue(BOTTOM_GAP_VAR)).toBe('0px');
      // The Field taking the focus publishes it again: measured again, before that Field scrolls.
      document.documentElement.style.setProperty('--rop-keyboard-inset', `${KEYBOARD}px`);
      act(() => {
        field.dispatchEvent(new Event(KEYBOARD_INSET_EVENT, { bubbles: true }));
      });
      expect(scroller.style.getPropertyValue(BOTTOM_GAP_VAR)).toBe('89px');
    });
  });
});
