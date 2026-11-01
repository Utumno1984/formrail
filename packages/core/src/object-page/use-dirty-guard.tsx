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
  /** Dialog title (its accessible name). Default "Modifiche non salvate". */
  title: string;
  /** Dialog description (`aria-describedby`). */
  description: string;
  /** Safe action: closes the dialog and does not run the guarded action. */
  stay: string;
  /** Destructive action: closes the dialog and runs the guarded action. */
  leave: string;
}

const DEFAULT_LABELS: DirtyGuardLabels = {
  title: 'Modifiche non salvate',
  description: 'Ci sono modifiche non salvate: se esci ora andranno perse.',
  stay: 'Continua a modificare',
  leave: 'Esci senza salvare',
};

export interface UseDirtyGuardOptions {
  /** `true` while there are unsaved changes (e.g. `useObjectPageForm().isDirty`, or any other state). */
  when: boolean;
  /** Texts of the confirmation dialog; every key falls back to the Italian default. */
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
 *   Back/forward navigation of the browser is not intercepted.
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
 *     <Button onClick={() => guard(() => navigate('/suppliers'))}>Torna alla lista</Button>
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
    try {
      action?.();
    } finally {
      setLeaving(false);
    }
  }, []);

  const text = { ...DEFAULT_LABELS };
  for (const key of Object.keys(DEFAULT_LABELS) as (keyof DirtyGuardLabels)[]) {
    const value = labels?.[key];
    if (value !== undefined) text[key] = value;
  }

  const { title, description, stay: stayLabel, leave: leaveLabel } = text;
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
              <DialogClose />
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
    [open, leaving, stay, leave, title, description, stayLabel, leaveLabel],
  );

  return { guard, dialog };
}
