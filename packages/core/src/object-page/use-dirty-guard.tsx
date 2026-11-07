import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { flushSync } from 'react-dom';
import { Button } from '../button/Button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../dialog/Dialog';

export interface DirtyGuardLabels {
  /** Dialog title (its accessible name). Default "Unsaved changes". */
  title: string;
  /** Dialog description (`aria-describedby`). */
  description: string;
  /** Safe action: closes the dialog and does not run the guarded action. */
  stay: string;
  /** Destructive action: closes the dialog and runs the guarded action. */
  leave: string;
  /**
   * Accessible name of the close button (X) of the dialog, used verbatim (e.g. `Close`).
   * Optional: when absent, empty or whitespace-only the X keeps the default "Close: `<title>`".
   */
  close?: string;
}

const DEFAULT_LABELS: Omit<DirtyGuardLabels, 'close'> = {
  title: 'Unsaved changes',
  description: 'You have unsaved changes: leaving now will lose them.',
  stay: 'Keep editing',
  leave: 'Leave without saving',
};

interface NavigationLike {
  currentEntry?: { index: number } | null;
  traverseTo?: (key: string) => unknown;
  addEventListener?: (type: string, listener: (event: Event) => void) => void;
  removeEventListener?: (type: string, listener: (event: Event) => void) => void;
}

/** Hooks currently intercepting Back/Forward, in activation order; the last one handles it. */
const interceptors: object[] = [];

function getNavigation(): NavigationLike | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { navigation?: NavigationLike }).navigation ?? null;
}

export interface UseDirtyGuardOptions {
  /** `true` while there are unsaved changes (e.g. `useObjectPageForm().isDirty`, or any other state). */
  when: boolean;
  /** Texts of the confirmation dialog; every key falls back to the English default. */
  labels?: Partial<DirtyGuardLabels>;
}

export interface UseDirtyGuardReturn {
  /**
   * Wraps an exit action. With `when === false` it runs `action` immediately (synchronously). With
   * `when === true` it does not, and opens the confirmation dialog instead: `action` runs once, after
   * the dialog has closed, only if the user picks "leave". Stable identity.
   */
  guard: (action: () => void) => void;
  /** The confirmation dialog: render it once anywhere in the tree (`{dialog}`). */
  dialog: ReactElement;
}

/**
 * Unsaved-changes guard for an Object Page, with no router integration.
 *
 * - While `when` is true a native `beforeunload` listener is registered (reload, tab close, address
 *   bar navigation: the browser shows its own prompt). It is removed as soon as `when` turns false
 *   or the component unmounts. Two hooks on one page keep independent listeners.
 * - `guard(action)` wraps the consumer's own exit action (a router navigation, closing the page).
 * - While `when` is true, browser Back/Forward opens the same dialog; "leave" completes the traversal.
 *   With the Navigation API (`window.navigation`, Chromium) the traversal is cancelled outright
 *   (`navigate` event): no `popstate` fires, so any router/`useListReportUrlState` on the browser
 *   History stays untouched, whenever it was registered. The browser only allows that after a user
 *   interaction with the page (always true while the user is editing).
 *   LIMITS of the fallback (no Navigation API, or a non-cancelable traversal): the hook can only undo
 *   the traversal with `history.go(-delta)` (no `pushState`: no entry is added, the forward history is
 *   kept), AFTER it happened. A router listening to `popstate` that registered BEFORE the hook (the usual
 *   case: it mounts first) has already seen it, so its visible state can flip and come back, or the
 *   page can unmount and lose its edits: there the guard is not reliable. Without the Navigation API
 *   every traversal is also assumed to be Back by one entry (a Forward is not told apart).
 *   Not covered at all: an adapter that does not use the browser History (e.g. the in-memory
 *   `ListReportUrlAdapter` of the stories, which has its own Back/Forward), and navigations that do not
 *   traverse the history (link clicks, `pushState`): wrap those in `guard`.
 * - With several hooks active on one page (a page and a nested sheet) only ONE intercepts
 *   Back/Forward, so a traversal never opens two stacked dialogs: the last whose effect activated (for
 *   nested components, the outer one, since effects run children first). `beforeunload` and `guard` stay
 *   independent.
 *
 * Declared behaviour:
 * - A second `guard` call while the dialog is open is ignored: the first action stays pending.
 * - If `when` becomes false while the dialog is open, the dialog stays open until the user chooses;
 *   "leave" still runs the pending action.
 * - Escape, a click on the backdrop and the close button all mean "stay".
 * - If the action throws, the dialog is already closed and the state clean; the error propagates
 *   to the caller of the click handler (it is not swallowed).
 * - If the component unmounts while the dialog is open the pending action is dropped.
 * - The focus returns to the element that had it when `guard` was called, within the limits of the
 *   Dialog (an unmounted or disabled opener gets no focus).
 *
 * @example
 * ```tsx
 * const form = useObjectPageForm({ baseline });
 * const { guard, dialog } = useDirtyGuard({ when: form.isDirty });
 * return (
 *   <>
 *     <Button onClick={() => guard(() => navigate('/suppliers'))}>Back to the list</Button>
 *     {dialog}
 *   </>
 * );
 * ```
 */
export function useDirtyGuard(options: UseDirtyGuardOptions): UseDirtyGuardReturn {
  const { when, labels } = options;
  const [open, setOpen] = useState(false);
  // True only while "leave" commits and runs the action: the dialog content is not rendered at all.
  const [leaving, setLeaving] = useState(false);
  const whenRef = useRef(when);
  const pendingRef = useRef<(() => void) | null>(null);
  const stayRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    whenRef.current = when;
  }, [when]);

  useEffect(() => {
    if (!when) return undefined;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [when]);

  const guard = useCallback((action: () => void) => {
    if (!whenRef.current) {
      action();
      return;
    }
    if (pendingRef.current) return;
    pendingRef.current = action;
    setOpen(true);
  }, []);

  // Back/Forward (`popstate`). The browser cannot cancel a traversal that already happened, so the
  // hook undoes it with `history.go(-delta)` (no `pushState`: no entry is added and the forward
  // history survives) and, if the user confirms, repeats it with `history.go(delta)`.
  const passUntilRef = useRef(0);
  const guardRef = useRef(guard);
  useEffect(() => {
    guardRef.current = guard;
  }, [guard]);
  useEffect(() => {
    if (!when) return undefined;
    const nav = getNavigation();
    // Only the most recently activated hook intercepts Back/Forward (e.g. a nested sheet over its
    // page): the others let it through, so one traversal never opens two stacked dialogs.
    const token = {};
    interceptors.push(token);
    const isTop = () => interceptors[interceptors.length - 1] === token;
    let traverseDelta: number | null = null;
    let reverting = false;
    let revertTimer: ReturnType<typeof setTimeout> | undefined;
    let allow = false;
    const onEntryChange = (event: Event) => {
      const from = (event as unknown as { from?: { index: number } }).from;
      const to = nav?.currentEntry?.index;
      if (from && typeof to === 'number') traverseDelta = to - from.index;
    };
    nav?.addEventListener?.('currententrychange', onEntryChange);
    // Preferred path (Navigation API): cancel the traversal itself. No `popstate` ever fires, so a
    // router registered before this hook (which a capture listener cannot outrun: `window` listeners
    // run in registration order) never sees it either.
    const onNavigate = (event: Event) => {
      const e = event as unknown as {
        navigationType?: string;
        cancelable?: boolean;
        destination?: { index: number; key?: string; sameDocument?: boolean };
        preventDefault: () => void;
      };
      if (!isTop()) return;
      if (e.navigationType !== 'traverse' || !e.cancelable || !e.destination?.sameDocument) return;
      const current = nav?.currentEntry?.index;
      if (typeof current !== 'number') return;
      // Confirmed traversal (or one started by the confirmed action): its `popstate` clears the flags.
      if (allow || reverting || Date.now() < passUntilRef.current) return;
      const delta = e.destination.index - current;
      if (delta === 0) return;
      e.preventDefault();
      const key = e.destination.key;
      guardRef.current(() => {
        allow = true;
        // `traverseTo(key)` names the exact entry; `history.go(delta)` is the fallback.
        if (key && nav?.traverseTo) nav.traverseTo(key);
        else window.history.go(delta);
      });
    };
    nav?.addEventListener?.('navigate', onNavigate);
    const onPopState = (event: PopStateEvent) => {
      if (!isTop()) return;
      if (allow || Date.now() < passUntilRef.current) {
        // The traversal the user confirmed (or one started by the confirmed action): let it through.
        allow = false;
        passUntilRef.current = 0;
        return;
      }
      // Capture phase + stopImmediatePropagation: the app's router never sees a traversal we undo.
      event.stopImmediatePropagation();
      if (reverting) {
        reverting = false;
        clearTimeout(revertTimer);
        return;
      }
      // Without the Navigation API the direction is unknown: assume Back by one entry.
      const delta = nav && traverseDelta ? traverseDelta : -1;
      traverseDelta = null;
      reverting = true;
      // The undo may be a no-op (no entry to go to): never leave the flag stuck.
      clearTimeout(revertTimer);
      revertTimer = setTimeout(() => (reverting = false), 500);
      window.history.go(-delta);
      guardRef.current(() => {
        allow = true;
        window.history.go(delta);
      });
    };
    window.addEventListener('popstate', onPopState, true);
    return () => {
      interceptors.splice(interceptors.indexOf(token), 1);
      clearTimeout(revertTimer);
      window.removeEventListener('popstate', onPopState, true);
      nav?.removeEventListener?.('currententrychange', onEntryChange);
      nav?.removeEventListener?.('navigate', onNavigate);
    };
  }, [when]);

  const stay = useCallback(() => {
    pendingRef.current = null;
    setOpen(false);
  }, []);

  const leave = useCallback(() => {
    const action = pendingRef.current;
    pendingRef.current = null;
    // Commit the closing first: the action may unmount the page, which must not find an open modal
    // (scroll lock, inert siblings) to leave behind, nor a dialog still mounted for its exit
    // animation (#76): on this path the panel is removed outright (`leaving`), with no exit, because
    // the page is about to change anyway. The other ways out ("stay", Escape, the X) do animate out.
    flushSync(() => {
      setOpen(false);
      setLeaving(true);
    });
    // The confirmed action may itself navigate (`history.back()`): its `popstate`, asynchronous, must
    // not be intercepted again. The window closes at the first `popstate` or after 500 ms.
    passUntilRef.current = Date.now() + 500;
    try {
      action?.();
    } finally {
      setLeaving(false);
    }
  }, []);

  const text = { ...DEFAULT_LABELS };
  for (const key of Object.keys(DEFAULT_LABELS) as (keyof typeof DEFAULT_LABELS)[]) {
    const value = labels?.[key];
    if (value !== undefined) text[key] = value;
  }

  const { title, description, stay: stayLabel, leave: leaveLabel } = text;
  const closeLabel = labels?.close?.trim() ? labels.close : undefined;
  const dialog = useMemo(
    () => (
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) stay();
        }}
      >
        {!leaving && (
          <DialogContent
            size="sm"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              stayRef.current?.focus();
            }}
          >
            <DialogHeader>
              <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                <DialogTitle>{title}</DialogTitle>
                <DialogDescription>{description}</DialogDescription>
              </div>
              {/* No `aria-label` key when unset: an explicit undefined would override the default name. */}
              <DialogClose {...(closeLabel ? { 'aria-label': closeLabel } : {})} />
            </DialogHeader>
            <DialogFooter>
              <Button ref={stayRef} variant="primary" onClick={stay}>
                {stayLabel}
              </Button>
              <Button variant="ghost" onClick={leave}>
                {leaveLabel}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    ),
    [open, leaving, stay, leave, title, description, stayLabel, leaveLabel, closeLabel],
  );

  return { guard, dialog };
}
