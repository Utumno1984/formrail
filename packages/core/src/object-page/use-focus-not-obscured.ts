import { useEffect, type RefObject } from 'react';

/** Marks the Anchor Bar: its links are sticky with it, so they are never "under" it and are left alone. */
export const ANCHOR_BAR_ATTR = 'data-object-page-anchor-bar';

/**
 * Where the focused `target` must sit inside `scroller`: from the scroller's top edge plus the target's
 * `scroll-margin-top` down to its bottom edge minus its `scroll-margin-bottom` (the margins the page
 * declares for the sticky Anchor Bar and the virtual keyboard). Returns how far the scroller has to
 * scroll to bring the target there (negative: up), 0 when it already is. A target taller than the strip
 * keeps its top in view.
 */
export function clearanceDelta(
  target: { top: number; bottom: number },
  scroller: { top: number; bottom: number },
  margin: { top: number; bottom: number },
): number {
  const top = scroller.top + margin.top;
  const bottom = scroller.bottom - margin.bottom;
  if (target.top < top) return target.top - top;
  if (target.bottom > bottom) return Math.min(target.bottom - bottom, target.top - top);
  return 0;
}

const px = (value: string): number => {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};

/**
 * WCAG 2.4.12 Focus Not Obscured (Enhanced): a control reached with Tab / Shift+Tab inside the Object
 * Page scroller ends entirely below the sticky Anchor Bar and above the bottom edge (the save bar sits
 * below the scroller).
 *
 * The page declares it in CSS first: every element of the scroller outside the Anchor Bar has a scroll
 * margin of the bar's height (plus room for the focus indicator) at the top and of the virtual keyboard's
 * height (plus the same room) at the bottom, which the browser's own focus scrolling honours. Firefox
 * scrolls a focused element only when it is entirely out of view, so it leaves one that is partly under
 * the bar (or partly past the bottom edge) where it is: this hook is the fallback for that. After a Tab
 * moved the focus into the scroller, one frame later (the browser has done its own scrolling by then,
 * and nothing has been painted yet) it scrolls the scroller by the least that clears the target, and
 * does nothing where the browser already did it. Only Tab counts: a focus moved by script (which may have
 * asked for `preventScroll`) or by a click is left alone.
 */
export function useFocusNotObscured(scrollerRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const scroller = scrollerRef.current;
    const doc = scroller?.ownerDocument;
    const view = doc?.defaultView;
    if (!scroller || !doc || !view || typeof view.requestAnimationFrame !== 'function') return undefined;
    let tabbing = false;
    let frame = 0;

    const clear = (target: HTMLElement) => {
      frame = 0;
      if (doc.activeElement !== target || !scroller.contains(target)) return;
      const style = view.getComputedStyle(target);
      const delta = clearanceDelta(target.getBoundingClientRect(), scroller.getBoundingClientRect(), {
        top: px(style.scrollMarginTop),
        bottom: px(style.scrollMarginBottom),
      });
      if (Math.abs(delta) >= 1) scroller.scrollTop += delta;
    };

    // Any key decides: the focus that follows a Tab press comes from sequential navigation.
    const onKeyDown = (event: KeyboardEvent) => {
      tabbing = event.key === 'Tab';
    };
    const onKeyUp = () => {
      tabbing = false;
    };
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!tabbing || !(target instanceof view.HTMLElement) || target === scroller) return;
      if (target.closest(`[${ANCHOR_BAR_ATTR}]`)) return;
      if (frame) view.cancelAnimationFrame(frame);
      frame = view.requestAnimationFrame(() => clear(target));
    };

    doc.addEventListener('keydown', onKeyDown, true);
    doc.addEventListener('keyup', onKeyUp, true);
    scroller.addEventListener('focusin', onFocusIn);
    return () => {
      doc.removeEventListener('keydown', onKeyDown, true);
      doc.removeEventListener('keyup', onKeyUp, true);
      scroller.removeEventListener('focusin', onFocusIn);
      if (frame) view.cancelAnimationFrame(frame);
    };
  }, [scrollerRef]);
}
