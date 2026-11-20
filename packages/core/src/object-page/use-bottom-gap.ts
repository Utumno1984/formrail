import { useLayoutEffect, useEffect, type RefObject } from 'react';

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
 * Whether the scroller is the container that scrolls its content: a scrollable `overflow-y` and more content than
 * room. Without a height from its parent the page grows with its content and the document scrolls instead: a focused
 * control is then brought above the keyboard by the window, whose bottom edge the keyboard covers whole, so the room
 * under the scroller is not covered first and must not lower the margin.
 */
export function scrollsItself(overflowY: string, scrollHeight: number, clientHeight: number): boolean {
  return (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') && scrollHeight > clientHeight;
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
 * by the scroll margins. The keyboard does not move the layout viewport: this does not depend on it. Only when the
 * scroller scrolls its content itself ({@link scrollsItself}); otherwise 0. A scroller with a height from its parent
 * whose content fits until the keyboard's padding makes it overflow reads 0 when the Field first measures, so the
 * field lands higher than needed, never under the keyboard. Only where there is a visual viewport (the only place
 * the keyboard's height is published).
 */
export function useBottomGap(scrollerRef: RefObject<HTMLElement | null>): void {
  useIsomorphicLayoutEffect(() => {
    const scroller = scrollerRef.current;
    const win = scroller?.ownerDocument.defaultView;
    if (!scroller || !win?.visualViewport) return undefined;
    let written = '';
    const update = () => {
      // The document scrolls (no height from the parent): no gap, whatever the scroll position. Independent of the
      // keyboard's own bottom padding, which grows such a scroller with its content: a Field measuring before this
      // runs again never reads a stale gap (#498, a regression found by QA).
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
    return () => {
      observer?.disconnect();
      win.removeEventListener('resize', update);
      win.removeEventListener('scroll', update);
      scroller.removeEventListener('focusin', update);
      scroller.style.removeProperty(BOTTOM_GAP_VAR);
    };
  }, [scrollerRef]);
}
