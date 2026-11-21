import { useLayoutEffect, useEffect, type RefObject } from 'react';
import { KEYBOARD_INSET_EVENT } from '../internal/keyboard-inset';

/** Written on the scroller: the height of the layout viewport below its bottom edge, in px. */
export const BOTTOM_GAP_VAR = '--rop-object-page-bottom-gap';

// SSR: useLayoutEffect warns on the server (React 18).
const useIsomorphicLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;

/**
 * The height of the layout viewport below the scroller's bottom edge: the save bar (and anything else under the
 * page). 0 when the scroller reaches the bottom of the window or goes past it.
 */
export function bottomGap(scrollerBottom: number, viewportHeight: number): number {
  return Math.max(0, viewportHeight - scrollerBottom);
}

/**
 * Whether the scroller is the container that scrolls its content: a scroll container (any `overflow-y` but `visible`
 * or `clip`; `hidden` too, which `scrollIntoView` scrolls like `auto`) with more content than room. Without a height
 * from its parent the page grows with its content and the document scrolls instead: a focused control is then
 * brought above the keyboard by the window, whose bottom edge the keyboard covers whole, so the room under the
 * scroller is not covered first and must not lower the margin.
 *
 * A scroller with a height from its parent whose content fits overflows only once the keyboard's bottom padding is
 * in: the answer depends on the keyboard's height, so it is read again whenever a Field publishes it
 * ({@link useBottomGap}).
 */
export function scrollsItself(overflowY: string, scrollHeight: number, clientHeight: number): boolean {
  return overflowY !== 'visible' && overflowY !== 'clip' && scrollHeight > clientHeight;
}

/**
 * The part of the virtual keyboard (`keyboard` px, measured from the bottom of the layout viewport, as Field
 * publishes it) that covers the scroller: what is left once the `gap` below the scroller is under it. The scroller's
 * inline style computes the same in CSS for its content (the margins a focused control keeps above the keyboard); a
 * unit test pins the two together.
 */
export function keyboardOverScroller(keyboard: number, gap: number): number {
  return Math.max(0, keyboard - gap);
}

/**
 * Keeps {@link BOTTOM_GAP_VAR} on the scroller in step with its position (its size, the window's size and scroll).
 * Inside the scroller, `--rop-keyboard-inset` (the keyboard's height, published on `<html>` by a focused Field) is
 * lowered by this gap, so the save bar under the scroller, itself under the keyboard, is not counted a second time
 * by the scroll margins. Only when the scroller scrolls its content itself ({@link scrollsItself}); otherwise 0.
 *
 * Whether it does depends on the keyboard: the scroller's bottom padding holds the keyboard's height, and a page with
 * a height from its parent whose content fits overflows only with it. Neither the observer nor the window's events
 * see that height change (the scroller keeps its size; on Tab the Field losing the focus removes the height before
 * `focusin` reaches the scroller, and the Field taking the focus publishes it after). So the gap is also measured
 * when a Field publishes the height ({@link KEYBOARD_INSET_EVENT}, dispatched before the Field scrolls itself above
 * the keyboard): the Field's scroll reads the gap of the keyboard it has just published (#498, QA round 2). Only
 * where there is a visual viewport (the only place the keyboard's height is published).
 */
export function useBottomGap(scrollerRef: RefObject<HTMLElement | null>): void {
  useIsomorphicLayoutEffect(() => {
    const scroller = scrollerRef.current;
    const win = scroller?.ownerDocument.defaultView;
    if (!scroller || !win?.visualViewport) return undefined;
    let written = '';
    const update = () => {
      // The document scrolls (no height from the parent): no gap, whatever the scroll position. Such a scroller grows
      // with its content, the keyboard's bottom padding included: it never scrolls itself, keyboard or not.
      const own = scrollsItself(win.getComputedStyle(scroller).overflowY, scroller.scrollHeight, scroller.clientHeight);
      const gap = `${own ? bottomGap(scroller.getBoundingClientRect().bottom, win.innerHeight) : 0}px`;
      if (gap === written) return;
      written = gap;
      scroller.style.setProperty(BOTTOM_GAP_VAR, gap);
    };
    update();
    const observer = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(update) : null;
    observer?.observe(scroller);
    win.addEventListener('resize', update);
    win.addEventListener('scroll', update, { passive: true });
    // Fresh before a focused Field measures (a move the listeners above do not see).
    scroller.addEventListener('focusin', update);
    // A Field inside has just published the keyboard's height, and scrolls itself above the keyboard next.
    scroller.addEventListener(KEYBOARD_INSET_EVENT, update);
    return () => {
      observer?.disconnect();
      win.removeEventListener('resize', update);
      win.removeEventListener('scroll', update);
      scroller.removeEventListener('focusin', update);
      scroller.removeEventListener(KEYBOARD_INSET_EVENT, update);
      scroller.style.removeProperty(BOTTOM_GAP_VAR);
    };
  }, [scrollerRef]);
}
