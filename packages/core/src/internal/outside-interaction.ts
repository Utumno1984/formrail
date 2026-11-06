// Internal: the timing of "outside" interactions on overlays, in one place. Not exported from the package.
// A future fix (a new pointer type, an iOS Safari quirk) is made here and reaches Dialog, Sheet and Menu.
import { useEffect, useLayoutEffect, useRef } from 'react';

/**
 * Radix can deliver a "pointer down outside" late (a touch is dispatched on the following `click`).
 * With an exit animation, a tap on the opener while the panel is leaving reopens it, and the late
 * dismissal of that same tap would close it again: an outside interaction that began before the
 * current opening is not a dismissal of it. Returns the predicate to call from Radix's
 * `onPointerDownOutside` / `onInteractOutside` (it receives their custom event).
 */
export function useBeganBeforeOpening(open: boolean): (event: CustomEvent<{ originalEvent: Event }>) => boolean {
  const openedAt = useRef(0);
  useLayoutEffect(() => {
    if (open) openedAt.current = performance.now();
  }, [open]);
  return (event) => event.detail.originalEvent.timeStamp < openedAt.current;
}

/** How long an armed tap guard waits for its click: a long press, then a click, still counts. */
const TOUCH_CLICK_WINDOW_MS = 3000;

/** The open guards, outermost first. */
const guards: object[] = [];

let disarmSwallow: (() => void) | undefined;

/**
 * Swallows the next click in the capture phase. One at a time for the whole page: arming again
 * (another overlay, another tap) replaces the previous one instead of stacking.
 */
function armSwallow() {
  disarmSwallow?.();
  const swallow = (event: Event) => {
    event.stopPropagation();
    event.preventDefault();
    disarm();
  };
  const disarm = () => {
    document.removeEventListener('click', swallow, true);
    document.removeEventListener('pointercancel', disarm, true);
    clearTimeout(timer);
    if (disarmSwallow === disarm) disarmSwallow = undefined;
  };
  document.addEventListener('click', swallow, true);
  document.addEventListener('pointercancel', disarm, true);
  const timer = setTimeout(disarm, TOUCH_CLICK_WINDOW_MS);
  disarmSwallow = disarm;
}

interface TouchOutsideSwallowOptions {
  /** Inactive when false (the overlay is not modal). */
  enabled: boolean;
  /** The overlay's panel: a tap inside it is not an outside tap. */
  contentRef: { current: HTMLElement | null };
  /** The opener: its own tap is the toggle, not an outside tap. Hit-tested by position. */
  anchorRef: { current: HTMLElement | null };
  /** Closes the overlay; called at the pointerdown of an outside touch. */
  close: () => void;
}

/**
 * Modal overlay without a backdrop, touch: a tap outside closes it and must not reach what is under
 * the finger. Radix closes on the `click` that follows a touch pointerdown (not on the pointerdown
 * itself) and by then the page is interactive again, so that click lands on the element underneath
 * (a button elsewhere would be activated), which `onPointerDownOutside` (also delivered on the
 * click) cannot prevent. The panel closes at the pointerdown instead, and the click that follows is
 * swallowed in the capture phase: once, or until the gesture is cancelled, or (for a press that
 * never clicks) until the window runs out. Dialog and Sheet have a backdrop that takes the tap, and
 * use `useBeganBeforeOpening` instead.
 */
export function useTouchOutsideSwallow({ enabled, contentRef, anchorRef, close }: TouchOutsideSwallowOptions): void {
  useEffect(() => {
    if (!enabled) return undefined;
    const me = {};
    guards.push(me);
    const onPointerDown = (event: PointerEvent) => {
      // Only the innermost open guard acts: with several overlays open at once (one in a Dialog opened
      // over another page) a single tap must not arm several swallows.
      if (guards[guards.length - 1] !== me) return;
      if (event.pointerType !== 'touch') return;
      if (event.target instanceof Node && contentRef.current?.contains(event.target)) return;
      // While the overlay is open the body is `pointer-events: none`, so the event's target is the
      // root element: hit-test the opener by position.
      const r = anchorRef.current?.getBoundingClientRect();
      if (
        r &&
        event.clientX >= r.left &&
        event.clientX <= r.right &&
        event.clientY >= r.top &&
        event.clientY <= r.bottom
      ) {
        return;
      }
      armSwallow();
      close();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      guards.splice(guards.indexOf(me), 1);
      // A swallow already armed outlives the panel on purpose: its click is still to come.
    };
  }, [enabled, contentRef, anchorRef, close]);
}
