import { useLayoutEffect, useEffect, type RefObject } from 'react';

/** Written on the scroller: the height of the layout viewport below its bottom edge, in px. */
export const BOTTOM_GAP_VAR = '--rop-object-page-bottom-gap';

// SSR: useLayoutEffect warns on the server (React 18).
const useIsomorphicLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;

/**
 * The height of the layout viewport below the scroller's bottom edge: the save bar (and anything else under the
 * page). 0 when the scroller reaches the bottom of the window or goes past it (the document scrolls).
 */
export function bottomGap(scrollerBottom: number, viewportHeight: number): number {
  return Math.max(0, viewportHeight - scrollerBottom);
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
 * by the scroll margins. The keyboard does not move the layout viewport: this does not depend on it. Only where
 * there is a visual viewport (the only place the keyboard's height is published).
 */
export function useBottomGap(scrollerRef: RefObject<HTMLElement | null>): void {
  useIsomorphicLayoutEffect(() => {
    const scroller = scrollerRef.current;
    const win = scroller?.ownerDocument.defaultView;
    if (!scroller || !win?.visualViewport) return undefined;
    let written = '';
    const update = () => {
      const gap = `${bottomGap(scroller.getBoundingClientRect().bottom, win.innerHeight)}px`;
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
