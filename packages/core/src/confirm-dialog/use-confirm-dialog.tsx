import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { ConfirmDialogBase, type ConfirmDialogProps } from './ConfirmDialog';

/**
 * What `confirm()` shows. The same as `ConfirmDialog`'s props without the open state and its
 * callbacks (the returned promise replaces them); `onConfirm` is optional here: with it, the dialog
 * waits for it (pending state) and the promise resolves `true` only once it has succeeded.
 */
export interface ConfirmOptions
  extends Omit<ConfirmDialogProps, 'open' | 'onOpenChange' | 'onConfirm' | 'onCancel'> {
  /** Optional action run on confirm; a returned promise keeps the dialog pending until it settles. */
  onConfirm?: () => void | Promise<unknown>;
}

interface Request {
  id: number;
  options: ConfirmOptions;
  open: boolean;
}

/**
 * Imperative confirmation: `const [confirm, confirmDialog] = useConfirmDialog()`. Render
 * `{confirmDialog}` once, then `if (await confirm({ title, confirmLabel })) …`.
 *
 * - Resolves `true` when the user confirms (after `onConfirm` succeeded, if given), `false` on
 *   Cancel, Escape or a click on the backdrop.
 * - A second `confirm()` while one is open resolves the first with `false` and shows the new one.
 * - Unmounting the component while a confirmation is open resolves it with `false`: no promise is
 *   left hanging.
 * - No provider: a confirmation belongs to its screen. `confirm` is stable across renders.
 * - The promise never rejects: a failing `onConfirm` keeps the dialog open (see `ConfirmDialog`'s
 *   `onError`).
 */
export function useConfirmDialog(): [
  confirm: (options: ConfirmOptions) => Promise<boolean>,
  confirmDialog: ReactElement,
] {
  const [request, setRequest] = useState<Request | null>(null);
  const resolver = useRef<{ id: number; resolve: (value: boolean) => void } | null>(null);
  const nextId = useRef(0);
  const mounted = useRef(false);

  const settle = useCallback((id: number | null, value: boolean) => {
    const current = resolver.current;
    if (!current || (id !== null && current.id !== id)) return;
    resolver.current = null;
    current.resolve(value);
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      settle(null, false);
    };
  }, [settle]);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        // Called after the unmount (e.g. from a stale async callback): nothing could ever answer.
        if (!mounted.current) {
          resolve(false);
          return;
        }
        settle(null, false);
        nextId.current += 1;
        const id = nextId.current;
        resolver.current = { id, resolve };
        setRequest({ id, options, open: true });
      }),
    [settle],
  );

  const close = useCallback((id: number) => {
    setRequest((current) => (current && current.id === id ? { ...current, open: false } : current));
  }, []);

  // Always rendered, closed until the first request: a Dialog mounted already open has no opener to
  // return the focus to (see `useReturnFocus`), so it must exist before `confirm()` opens it.
  // The options stay rendered after the close so that the panel animates out with its content.
  const { id, options, open } = request ?? IDLE;
  const element = (
    <ConfirmDialogBase
      {...options}
      onConfirm={options.onConfirm ?? noop}
      open={open}
      session={id}
      onConfirmed={() => settle(id, true)}
      onOpenChange={(next) => {
        if (next) return;
        settle(id, false); // no-op after a confirmation: already settled with `true`
        close(id);
      }}
    />
  );
  return [confirm, element];
}

function noop(): void {}

// Placeholder for the closed dialog before the first request (never shown: a closed Dialog renders nothing).
const IDLE: Request = { id: 0, options: { title: '', confirmLabel: 'Confirm' }, open: false };
