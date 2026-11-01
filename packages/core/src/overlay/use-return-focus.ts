import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

export interface UseReturnFocusOptions {
  /** Whether the overlay is open. */
  open: boolean;
  /** Receives the focus when the opener is gone or disabled at close time. */
  fallbackRef?: RefObject<HTMLElement | null>;
  /**
   * Checked when the focus is about to be returned: when it answers `true` the focus is left where
   * it is. For a caller whose return is delayed (an exit animation) and that knows another overlay
   * can have taken the focus in the meantime. Default: always return, as before.
   */
  skipWhen?: () => boolean;
}

function canTakeFocus(el: HTMLElement | null | undefined): el is HTMLElement {
  return !!el && el.isConnected && !el.matches(':disabled');
}

/**
 * Gives the focus back to the element that had it before an overlay opened, however the overlay
 * was opened (Radix trigger, keyboard shortcut, a button elsewhere: `open` is all it looks at).
 *
 * - The element is remembered by listening to `focusin` on the document **only while `open` is
 *   false**, and confirmed against `document.activeElement` at the moment `open` turns true (a focus
 *   lost to `body` in between is not mistaken for the last focused element). The listener is
 *   attached in a layout effect and detached when `open` turns true,
 *   before the children of the newly opened overlay can focus anything, so an `autoFocus` field
 *   inside the content (children's effects run before the parent's) never overwrites it.
 * - On `open: true -> false` the focus returns in the next animation frame, i.e. after the content
 *   has unmounted. Closing and reopening within that frame cancels the return.
 *
 * Declared limits:
 * - If the remembered element was unmounted or is `disabled` at close time, the focus goes to
 *   `fallbackRef` (same checks); without a usable fallback nothing is focused and nothing throws.
 *   The focus is never moved to an arbitrary node.
 * - If nothing but `body` had the focus before opening, there is nothing to return to (fallback,
 *   else left as is). An overlay mounted already open has no remembered element either.
 * - The focus is returned even if the user moved it elsewhere in the meantime (as Radix does).
 * - The content must be unmounted by the next frame after `open` becomes false; an exit animation
 *   that keeps it mounted longer must delay `open` accordingly (`ModalRoot` passes
 *   "open or still mounted", so the focus returns after the exit animation).
 * - Closing and reopening before that frame fires does not forget the real opener: while a return
 *   is still pending, the listener's cleanup (which runs on the same reopen) does not overwrite
 *   `openerRef` with `document.activeElement` (transiently `body` right after the content
 *   unmounts, not a genuine new focus target) — see `pendingReturnRef` below.
 * - Only the main document is observed: an opener inside an iframe or in an encapsulated DOM tree
 *   (web component) is not supported (the document never sees the inner element as the `focusin`
 *   target).
 *
 * Wrappers use this instead of Radix's own `onCloseAutoFocus` (call `preventDefault()` there).
 */
export function useReturnFocus({ open, fallbackRef, skipWhen }: UseReturnFocusOptions): void {
  const openerRef = useRef<HTMLElement | null>(null);
  const fallbackRefRef = useRef(fallbackRef);
  const skipWhenRef = useRef(skipWhen);
  const wasOpenRef = useRef(open);
  // True from the moment a return-to-opener is scheduled (rAF) until it fires or is cancelled.
  // Guards the race where closing and reopening before that frame makes the layout effect's
  // cleanup (which also runs on reopen, and runs before the rAF's own cancellation) see
  // `document.activeElement === body` — the content just unmounted, nothing has claimed focus yet
  // — and mistake that transient state for "the user focused something else", wiping `openerRef`.
  const pendingReturnRef = useRef(false);

  useLayoutEffect(() => {
    fallbackRefRef.current = fallbackRef;
    skipWhenRef.current = skipWhen;
  });

  useLayoutEffect(() => {
    if (open) return undefined;
    const onFocusIn = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement && event.target !== document.body) {
        openerRef.current = event.target;
      }
    };
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      // Runs in the mutation phase of the commit that opens the overlay, before any child can take
      // the focus. `focusin` never fires when the focus is lost to `body` (click on an empty area),
      // so the truth is read here: whatever has the focus right now is the opener, or nothing.
      // Skipped while a return is pending (see `pendingReturnRef`): `document.activeElement` is
      // transiently `body` right after the previous overlay's content unmounted, not a real signal.
      if (pendingReturnRef.current) return;
      const active = document.activeElement;
      openerRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
    };
  }, [open]);

  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;
    if (open || !wasOpen) return undefined;
    pendingReturnRef.current = true;
    const frame = requestAnimationFrame(() => {
      pendingReturnRef.current = false;
      if (skipWhenRef.current?.()) return;
      const target = [openerRef.current, fallbackRefRef.current?.current].find(canTakeFocus);
      target?.focus();
    });
    return () => {
      pendingReturnRef.current = false;
      cancelAnimationFrame(frame);
    };
  }, [open]);
}
