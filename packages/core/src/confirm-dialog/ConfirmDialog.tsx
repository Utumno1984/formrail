import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Button } from '../button/Button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../dialog/Dialog';
import { isDev } from '../internal/is-dev';
import { Spinner } from '../spinner/Spinner';
import { OPTICAL_LABEL_TYPOGRAPHY, OpticalLabel } from '../utils/OpticalLabel';

export type ConfirmDialogTone = 'danger' | 'default';

/** A label that must render something: `undefined`, `null` and booleans are type errors. */
type RequiredLabel = Exclude<ReactNode, null | undefined | boolean>;

export interface ConfirmDialogProps {
  /** Controlled open state (there is no trigger: open it from a button, a menu item, an effect). */
  open: boolean;
  /**
   * Called with `false` when the dialog asks to close: after a confirmation that succeeded, or on
   * Cancel / Escape / a click on the backdrop. Never called while a confirmation is pending.
   * Required: the dialog is controlled, and only this callback lets it close after an async
   * `onConfirm` has succeeded (set `open` to `false` here).
   */
  onOpenChange: (open: boolean) => void;
  /** The question, and the dialog's accessible name ("Delete invoice 2026/0142?"). */
  title: ReactNode;
  /** What happens if the user confirms; the dialog's accessible description. */
  description?: ReactNode;
  /**
   * The confirm button's label. Required: it must name the action ("Delete invoice"), never a
   * generic "OK" / "Confirm". A blank string logs a `console.error` in development.
   */
  confirmLabel: RequiredLabel;
  /** The cancel button's label. Default "Cancel". */
  cancelLabel?: ReactNode;
  /**
   * `danger` (default): the confirm button is a `danger` Button and the initial focus is on Cancel,
   * the safe choice. `default`: a `primary` confirm button, which also receives the initial focus.
   */
  tone?: ConfirmDialogTone;
  /**
   * Runs the action. If it returns a promise the dialog stays open while it is pending: the confirm
   * button is `aria-disabled` with a spinner, further clicks / Enter are ignored (no double
   * submission), and Cancel, Escape and the backdrop do nothing. Resolved: the dialog asks to close.
   * Rejected (or a synchronous throw): the dialog stays open and interactive, the focus stays on the
   * confirm button, and the error goes to `onError` (see there).
   */
  onConfirm: () => void | Promise<unknown>;
  /** Called once when the user cancels: Cancel button, Escape, or a click on the backdrop. */
  onCancel?: () => void;
  /**
   * Receives the error of a failed `onConfirm` (rejected promise or synchronous throw). Without it
   * the error is not swallowed: it is reported as an uncaught error (`reportError`, i.e. a window
   * `error` event and the console), where error trackers see it.
   */
  onError?: (error: unknown) => void;
  /**
   * Receives the focus on close when the opener is gone or is not focusable, e.g. the trigger of the
   * `Menu` whose item opened the dialog (see `DialogContent`).
   */
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** Extra content under the description (a list of the affected items, a note). */
  children?: ReactNode;
}

/** Internal extension used by `useConfirmDialog` (not part of the public props). */
export interface ConfirmDialogBaseProps extends ConfirmDialogProps {
  /** Changes when the same mounted dialog starts a new request: resets the pending state. */
  session?: number;
  /** Called after `onConfirm` succeeded, just before `onOpenChange(false)`. */
  onConfirmed?: () => void;
}

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  (typeof value === 'object' || typeof value === 'function') &&
  value !== null &&
  typeof (value as { then?: unknown }).then === 'function';

const isBlankLabel = (label: unknown): boolean =>
  label === null || label === undefined || typeof label === 'boolean' || (typeof label === 'string' && label.trim() === '');

/** Reports an error as uncaught without interrupting the caller (a window `error` event). */
function reportUncaught(error: unknown): void {
  if (typeof reportError === 'function') reportError(error);
  else
    setTimeout(() => {
      throw error;
    });
}

/**
 * The implementation shared by `ConfirmDialog` and `useConfirmDialog`. A composition of `Dialog`,
 * `DialogContent`, `DialogHeader`, `DialogFooter` and `Button`: the focus trap, the return of the
 * focus, the overlay stack and the virtual-keyboard tracking are the Dialog's own.
 */
export function ConfirmDialogBase({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'danger',
  onConfirm,
  onCancel,
  onError,
  returnFocusRef,
  children,
  session,
  onConfirmed,
}: ConfirmDialogBaseProps) {
  const [pending, setPending] = useState(false);
  // The source of truth for the guards: state is only for rendering (two clicks in the same frame
  // both see the state of the render before them).
  const pendingRef = useRef(false);
  // Identifies the current run of `onConfirm`: a promise that settles after the dialog was closed
  // from outside, after a new request, or after the unmount, finds a different value and does nothing.
  const runRef = useRef(0);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  // Latest callbacks, read when a promise settles (the props may have changed meanwhile).
  const callbacks = useRef({ onOpenChange, onError, onConfirmed });
  useLayoutEffect(() => {
    callbacks.current = { onOpenChange, onError, onConfirmed };
  });

  const safeTarget = useCallback(
    () => (tone === 'danger' ? cancelRef.current : confirmRef.current),
    [tone],
  );
  const safeTargetRef = useRef(safeTarget);
  useLayoutEffect(() => {
    safeTargetRef.current = safeTarget;
  });

  // A new opening (or a new request of the hook) starts idle; a close invalidates the running promise.
  // The pending look is kept while the panel animates out, so the button does not flash back to idle.
  // A new request shown in a dialog that was already open is a new question: the focus goes back to
  // its safe button (it may sit on the previous request's confirm button).
  const shown = useRef<{ open: boolean; session: number | undefined }>({ open: false, session });
  useLayoutEffect(() => {
    runRef.current += 1;
    const previous = shown.current;
    shown.current = { open, session };
    if (!open) return;
    pendingRef.current = false;
    setPending(false);
    if (previous.open && previous.session !== session) safeTargetRef.current()?.focus();
  }, [open, session]);
  useEffect(
    () => () => {
      runRef.current += 1;
    },
    [],
  );

  // Checked while open only: a closed dialog shows nothing (and the hook renders a closed placeholder).
  const blankConfirm = open && isBlankLabel(confirmLabel);
  useEffect(() => {
    if (blankConfirm && isDev()) {
      console.error(
        '[react-object-page] <ConfirmDialog> needs a confirmLabel that names the action (e.g. "Delete invoice"), not an empty one.',
      );
    }
  }, [blankConfirm]);

  // Reopened while the previous closing was still animating: the Dialog brings the focus back to
  // the panel node itself (Radix does not run its opening focus again on nodes that never unmounted).
  // That is the "empty panel", never a target here: move it to the safe button. This runs after the
  // Dialog's own layout effect (children first) and before Radix's opening focus (a passive effect),
  // which in the normal path finds the focus outside and calls `onOpenAutoFocus` below.
  useLayoutEffect(() => {
    if (open && contentRef.current && document.activeElement === contentRef.current) safeTarget()?.focus();
  }, [open, safeTarget]);

  // While pending the backdrop does not close the dialog, so a press on it would only take the focus
  // away from the button: the browser moves it to `body` (the backdrop is not focusable) and the
  // focus trap does not bring it back from there. Its default is prevented, the focus stays put.
  // (The Tailwind scan reads comments too: no utility names that emit global defaults here.)
  useEffect(() => {
    if (!pending || !open) return undefined;
    const keepFocus = (event: MouseEvent) => {
      const content = contentRef.current;
      if (content && event.target instanceof Node && !content.contains(event.target)) event.preventDefault();
    };
    document.addEventListener('mousedown', keepFocus, true);
    return () => document.removeEventListener('mousedown', keepFocus, true);
  }, [pending, open]);

  const fail = useCallback((error: unknown) => {
    const handler = callbacks.current.onError;
    if (handler) handler(error);
    else reportUncaught(error);
  }, []);

  const handleConfirm = () => {
    if (pendingRef.current || !open) return;
    const run = runRef.current;
    let result: unknown;
    try {
      result = onConfirm();
    } catch (error) {
      fail(error);
      return;
    }
    if (!isThenable(result)) {
      callbacks.current.onConfirmed?.();
      callbacks.current.onOpenChange?.(false);
      return;
    }
    pendingRef.current = true;
    setPending(true);
    result.then(
      () => {
        if (runRef.current !== run) return;
        callbacks.current.onConfirmed?.();
        callbacks.current.onOpenChange?.(false);
      },
      (error: unknown) => {
        if (runRef.current === run) {
          pendingRef.current = false;
          setPending(false);
        }
        // Reported even when the dialog has been closed meanwhile: a failure is never swallowed.
        fail(error);
      },
    );
  };

  const handleCancel = () => {
    if (pendingRef.current || !open) return;
    onCancel?.();
    onOpenChange?.(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Escape, the backdrop (Radix) or a `DialogClose` in `children`: all of them are a cancel.
        if (!next) handleCancel();
      }}
    >
      <DialogContent
        ref={contentRef}
        size="sm"
        dismissible={!pending}
        returnFocusRef={returnFocusRef}
        onOpenAutoFocus={(event) => {
          const target = safeTarget();
          if (!target) return;
          event.preventDefault();
          target.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {description !== undefined && description !== null ? (
          <DialogBody>
            <DialogDescription>{description}</DialogDescription>
            {children}
          </DialogBody>
        ) : children !== undefined && children !== null ? (
          <DialogBody>{children}</DialogBody>
        ) : null}
        <DialogFooter>
          <Button
            ref={cancelRef as RefObject<HTMLElement | null>}
            variant="secondary"
            aria-disabled={pending || undefined}
            onClick={handleCancel}
          >
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef as RefObject<HTMLElement | null>}
            variant={tone === 'danger' ? 'danger' : 'primary'}
            aria-disabled={pending || undefined}
            className={OPTICAL_LABEL_TYPOGRAPHY}
            onClick={handleConfirm}
          >
            {pending ? <Spinner decorative size="sm" /> : null}
            <OpticalLabel>{confirmLabel}</OpticalLabel>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Asks the user to confirm an action, typically an irreversible one ("Delete invoice"). Built on
 * `Dialog`: opened from state, `role="dialog"` named by `title` and described by `description`,
 * focus trapped, focus returned to the opener (or to `returnFocusRef`) on close.
 *
 * - Initial focus: on Cancel with `tone="danger"` (default), on the confirm button with `"default"`.
 * - `onConfirm` may return a promise: until it settles nothing can submit it again or close the
 *   dialog, and the focus is never lost (the buttons become `aria-disabled`, not `disabled`).
 *   Resolved: `onOpenChange(false)`. Rejected: stays open; the error goes to `onError`, or is
 *   reported as uncaught without it.
 * - The role stays `dialog` (not `alertdialog`).
 *
 * For an imperative `await confirm(...)` use `useConfirmDialog`.
 */
export function ConfirmDialog(props: ConfirmDialogProps) {
  // Only the public props reach the implementation (`session` / `onConfirmed` are the hook's).
  const { open, onOpenChange, title, description, confirmLabel, cancelLabel, tone, onConfirm, onCancel, onError, returnFocusRef, children } =
    props;
  return (
    <ConfirmDialogBase
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      tone={tone}
      onConfirm={onConfirm}
      onCancel={onCancel}
      onError={onError}
      returnFocusRef={returnFocusRef}
    >
      {children}
    </ConfirmDialogBase>
  );
}
