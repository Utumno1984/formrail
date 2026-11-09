import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, useState, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DialogClose } from '../dialog/Dialog';
import { ConfirmDialog, type ConfirmDialogProps } from './ConfirmDialog';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const nextFrame = () => act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
const flush = () => act(() => Promise.resolve());

/** A promise controlled from the test. */
function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type HostProps = Partial<ConfirmDialogProps> & { initialOpen?: boolean; extra?: ReactNode };

/** A page with an opener and a ConfirmDialog controlled by state, as a consumer writes it. */
function Host({ initialOpen = false, onOpenChange, extra, ...props }: HostProps) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <button type="button" onClick={() => setOpen(false)}>
        Close from outside
      </button>
      <ConfirmDialog
        title="Delete invoice 2026/0142?"
        description="The invoice and its attachments are deleted for good."
        confirmLabel="Delete invoice"
        onConfirm={() => undefined}
        {...props}
        open={open}
        onOpenChange={(next) => {
          onOpenChange?.(next);
          setOpen(next);
        }}
      >
        {extra}
      </ConfirmDialog>
    </>
  );
}

async function openHost(props: HostProps = {}) {
  const user = userEvent.setup();
  const utils = render(<Host {...props} />);
  const opener = screen.getByRole('button', { name: 'Open' });
  await user.click(opener);
  const dialog = screen.getByRole('dialog', { name: 'Delete invoice 2026/0142?' });
  return { user, opener, dialog, ...utils };
}

const backdrop = () => document.querySelector<HTMLElement>('[data-state="open"].z-rop-overlay')!;

describe('ConfirmDialog: semantics', () => {
  it('opened from state: a modal dialog named by the title and described by the description', async () => {
    const { dialog } = await openHost();
    expect(dialog).toHaveAttribute('role', 'dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Delete invoice 2026/0142?');
    expect(dialog).toHaveAccessibleDescription('The invoice and its attachments are deleted for good.');
    // The page behind is out of the accessibility tree.
    expect(screen.queryByRole('button', { name: 'Open' })).toBeNull();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  it('the focus trap keeps Tab and Shift+Tab inside', async () => {
    const { user, dialog } = await openHost();
    for (let i = 0; i < 4; i += 1) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    for (let i = 0; i < 4; i += 1) {
      await user.tab({ shift: true });
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it('without a description there is no aria-describedby; children go in the body', async () => {
    const { dialog } = await openHost({ description: undefined, extra: <p>3 attachments</p> });
    expect(dialog).not.toHaveAttribute('aria-describedby');
    expect(dialog).toHaveTextContent('3 attachments');
  });

  it('the buttons: Cancel (secondary) then the confirm button named by confirmLabel', async () => {
    const { dialog } = await openHost();
    const buttons = Array.from(dialog.querySelectorAll('button'));
    expect(buttons.map((b) => b.textContent)).toEqual(['Cancel', 'Delete invoice']);
    expect(screen.getByRole('button', { name: 'Delete invoice' })).toHaveClass('bg-rop-error');
  });

  it('cancelLabel replaces the default Cancel', async () => {
    await openHost({ cancelLabel: 'Keep invoice' });
    expect(screen.getByRole('button', { name: 'Keep invoice' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });

  it('does not leak its control props to the DOM and logs nothing', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { dialog } = await openHost({ tone: 'danger', onCancel: vi.fn(), cancelLabel: 'Cancel', returnFocusRef: createRef() });
    await nextFrame();
    const nodes = [dialog, ...Array.from(dialog.querySelectorAll('*'))];
    const forbidden = ['tone', 'onconfirm', 'oncancel', 'confirmlabel', 'cancellabel', 'onerror', 'session', 'onconfirmed', 'returnfocusref', 'dismissible'];
    for (const node of nodes) {
      for (const name of node.getAttributeNames()) expect(forbidden).not.toContain(name.toLowerCase());
    }
    expect(errors).not.toHaveBeenCalled();
    expect(warnings).not.toHaveBeenCalled();
  });
});

describe('ConfirmDialog: initial focus', () => {
  it('tone="danger" (default): on Cancel, the safe action', async () => {
    await openHost();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('tone="default": on the confirm button, which is primary', async () => {
    await openHost({ tone: 'default', confirmLabel: 'Archive invoice' });
    const confirm = screen.getByRole('button', { name: 'Archive invoice' });
    expect(confirm).toHaveFocus();
    expect(confirm).toHaveClass('bg-rop-primary');
  });

  it('mounted open: the focus is on the safe button, never on the panel', () => {
    render(<Host initialOpen />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(document.activeElement).not.toBe(screen.getByRole('dialog'));
  });

  it('a Dialog-level onOpenAutoFocus is what moves the focus (no autoFocus attribute on the buttons)', async () => {
    const { dialog } = await openHost();
    for (const button of Array.from(dialog.querySelectorAll('button'))) expect(button).not.toHaveAttribute('autofocus');
  });
});

describe('ConfirmDialog: synchronous confirm and cancel', () => {
  it('click on confirm: onConfirm once, closes, the focus returns to the opener', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const onOpenChange = vi.fn();
    const { user, opener } = await openHost({ onConfirm, onCancel, onOpenChange });
    await user.click(screen.getByRole('button', { name: 'Delete invoice' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole('dialog')).toBeNull();
    await nextFrame();
    expect(opener).toHaveFocus();
  });

  it('Enter on the focused confirm button confirms once', async () => {
    const onConfirm = vi.fn();
    const { user } = await openHost({ onConfirm, tone: 'default' });
    await user.keyboard('{Enter}');
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Enter on the initial focus of a danger dialog cancels (it is on Cancel)', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { user } = await openHost({ onConfirm, onCancel });
    await user.keyboard('{Enter}');
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  const cancelWays: [string, (user: ReturnType<typeof userEvent.setup>) => Promise<void>][] = [
    ['the Cancel button', (user) => user.click(screen.getByRole('button', { name: 'Cancel' }))],
    ['Escape', (user) => user.keyboard('{Escape}')],
    ['a click on the backdrop', (user) => user.click(backdrop())],
  ];
  for (const [name, act] of cancelWays) {
    it(`${name}: onCancel once, closes, no onConfirm, focus back on the opener`, async () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();
      const onOpenChange = vi.fn();
      const { user, opener } = await openHost({ onConfirm, onCancel, onOpenChange });
      await act(user);
      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onConfirm).not.toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenLastCalledWith(false);
      expect(screen.queryByRole('dialog')).toBeNull();
      await nextFrame();
      expect(opener).toHaveFocus();
    });
  }

  it('a DialogClose in children is a cancel too', async () => {
    const onCancel = vi.fn();
    const { user } = await openHost({ onCancel, extra: <DialogClose>Not now</DialogClose> });
    await user.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('returnFocusRef receives the focus when the opener is gone', async () => {
    const user = userEvent.setup();
    const fallback = createRef<HTMLButtonElement>();
    function RowHost() {
      const [open, setOpen] = useState(false);
      const [row, setRow] = useState(true);
      return (
        <>
          <button type="button" ref={fallback}>
            Fallback
          </button>
          {row ? (
            <button type="button" onClick={() => setOpen(true)}>
              Delete row
            </button>
          ) : null}
          <ConfirmDialog
            open={open}
            onOpenChange={setOpen}
            title="Delete row?"
            confirmLabel="Delete row"
            returnFocusRef={fallback}
            onConfirm={() => setRow(false)}
          />
        </>
      );
    }
    render(<RowHost />);
    await user.click(screen.getByRole('button', { name: 'Delete row' }));
    await user.click(screen.getByRole('button', { name: 'Delete row' })); // the confirm button now
    expect(screen.queryByRole('dialog')).toBeNull();
    await nextFrame();
    expect(fallback.current).toHaveFocus();
  });

  it('the opener gone and no returnFocusRef: nothing throws, the focus is not moved to an arbitrary node', async () => {
    const user = userEvent.setup();
    function RowHost() {
      const [open, setOpen] = useState(false);
      const [row, setRow] = useState(true);
      return (
        <>
          {row ? (
            <button type="button" onClick={() => setOpen(true)}>
              Delete row
            </button>
          ) : null}
          <button type="button">Elsewhere</button>
          <ConfirmDialog open={open} onOpenChange={setOpen} title="Delete row?" confirmLabel="Remove" onConfirm={() => setRow(false)} />
        </>
      );
    }
    render(<RowHost />);
    await user.click(screen.getByRole('button', { name: 'Delete row' }));
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await nextFrame();
    expect(screen.getByRole('button', { name: 'Elsewhere' })).not.toHaveFocus();
  });
});

describe('ConfirmDialog: pending (onConfirm returns a promise)', () => {
  it('double click and repeated Enter call onConfirm once; aria-disabled + spinner, same name; nothing closes it; the focus stays', async () => {
    const job = deferred();
    const onConfirm = vi.fn(() => job.promise);
    const onCancel = vi.fn();
    const onOpenChange = vi.fn();
    const { user, dialog } = await openHost({ onConfirm, onCancel, onOpenChange });
    const confirm = screen.getByRole('button', { name: 'Delete invoice' });
    await user.dblClick(confirm);
    expect(confirm).toHaveFocus();
    await user.keyboard('{Enter}{Enter}');
    expect(onConfirm).toHaveBeenCalledTimes(1);

    expect(confirm).toHaveAttribute('aria-disabled', 'true');
    expect(confirm).not.toBeDisabled();
    expect(confirm).toHaveAccessibleName('Delete invoice');
    const spinner = confirm.querySelector('svg');
    expect(spinner).not.toBeNull();
    expect(spinner!.closest('[aria-hidden="true"]')).not.toBeNull();
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(cancel).toHaveAttribute('aria-disabled', 'true');

    await user.keyboard('{Escape}');
    expect(confirm).toHaveFocus();
    // A press on the backdrop does not blur the button to `body`.
    await user.click(backdrop());
    expect(confirm).toHaveFocus();
    await user.click(cancel);
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(onCancel).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    await act(async () => job.resolve());
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('rejected: stays open and interactive, focus on confirm, error to onError; a retry is possible', async () => {
    let job = deferred();
    const onConfirm = vi.fn(() => job.promise);
    const onError = vi.fn();
    const onOpenChange = vi.fn();
    const { user } = await openHost({ onConfirm, onError, onOpenChange });
    const confirm = screen.getByRole('button', { name: 'Delete invoice' });
    await user.click(confirm);
    const failure = new Error('server said no');
    await act(async () => job.reject(failure));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(failure);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(confirm).not.toHaveAttribute('aria-disabled');
    expect(confirm.querySelector('svg')).toBeNull();
    expect(confirm).toHaveFocus();
    expect(onOpenChange).not.toHaveBeenCalled();

    // Interactive again: a second attempt runs, and Escape works after it fails too.
    job = deferred();
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(2);
    await act(async () => job.resolve());
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a synchronous throw is a rejection: stays open, error to onError', async () => {
    const failure = new Error('boom');
    const onError = vi.fn();
    const onOpenChange = vi.fn();
    const { user } = await openHost({
      onConfirm: () => {
        throw failure;
      },
      onError,
      onOpenChange,
    });
    await user.click(screen.getByRole('button', { name: 'Delete invoice' }));
    expect(onError).toHaveBeenCalledWith(failure);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('without onError the error is reported as uncaught (reportError), not swallowed', async () => {
    const reported: unknown[] = [];
    const original = globalThis.reportError;
    globalThis.reportError = (error: unknown) => reported.push(error);
    try {
      const failure = new Error('rejected');
      const syncFailure = new Error('thrown');
      let calls = 0;
      const { user } = await openHost({
        onConfirm: () => {
          calls += 1;
          if (calls === 1) return Promise.reject(failure);
          throw syncFailure;
        },
      });
      const confirm = screen.getByRole('button', { name: 'Delete invoice' });
      await user.click(confirm);
      await flush();
      await user.click(confirm);
      expect(reported).toEqual([failure, syncFailure]);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    } finally {
      globalThis.reportError = original;
    }
  });

  it('closed from outside while pending: closes, the late resolution does not reopen nor call back, nothing is logged', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const job = deferred();
    const onOpenChange = vi.fn();
    const { user } = await openHost({ onConfirm: () => job.promise, onOpenChange });
    await user.click(screen.getByRole('button', { name: 'Delete invoice' }));
    // The page is aria-hidden while open: reach the outside button through the DOM.
    const outside = screen.getByText('Close from outside');
    act(() => outside.click());
    expect(screen.queryByRole('dialog')).toBeNull();
    await act(async () => job.resolve());
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();

    // Reopened: a fresh, idle dialog.
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const confirm = screen.getByRole('button', { name: 'Delete invoice' });
    expect(confirm).not.toHaveAttribute('aria-disabled');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(errors).not.toHaveBeenCalled();
  });

  it('closed from outside while pending, then the promise rejects: the error is still reported, the dialog stays closed', async () => {
    const job = deferred();
    const onError = vi.fn();
    const { user } = await openHost({ onConfirm: () => job.promise, onError });
    await user.click(screen.getByRole('button', { name: 'Delete invoice' }));
    act(() => screen.getByText('Close from outside').click());
    await act(async () => job.reject(new Error('late')));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('unmounted while pending: the late resolution calls nothing and logs nothing', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const job = deferred();
    const onOpenChange = vi.fn();
    const { user, unmount } = await openHost({ onConfirm: () => job.promise, onOpenChange });
    await user.click(screen.getByRole('button', { name: 'Delete invoice' }));
    unmount();
    await act(async () => job.resolve());
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
  });

  it('a non-promise return value (e.g. a number) is a synchronous confirm', async () => {
    const onOpenChange = vi.fn();
    const { user } = await openHost({ onConfirm: (() => 42) as unknown as () => void, onOpenChange });
    await user.click(screen.getByRole('button', { name: 'Delete invoice' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('a thenable that is not a native Promise is awaited too', async () => {
    let settle!: () => void;
    const thenable = { then: (ok: () => void) => void (settle = ok) };
    const onOpenChange = vi.fn();
    const { user } = await openHost({ onConfirm: () => thenable as unknown as Promise<void>, onOpenChange });
    await user.click(screen.getByRole('button', { name: 'Delete invoice' }));
    expect(screen.getByRole('button', { name: 'Delete invoice' })).toHaveAttribute('aria-disabled', 'true');
    expect(onOpenChange).not.toHaveBeenCalled();
    act(() => settle());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('ConfirmDialog: confirmLabel', () => {
  it('a blank confirmLabel logs an error in development; a real one does not', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { unmount } = render(<Host initialOpen confirmLabel="   " />);
    expect(errors.mock.calls.some(([m]) => String(m).includes('confirmLabel'))).toBe(true);
    unmount();
    errors.mockClear();
    render(<Host initialOpen confirmLabel="Delete invoice" />);
    await nextFrame();
    expect(errors).not.toHaveBeenCalled();
  });

  it('a missing confirmLabel (JS consumer) logs an error; nothing is logged while closed', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const props = { title: 'Delete?', onConfirm: () => undefined } as unknown as ConfirmDialogProps;
    const { rerender } = render(<ConfirmDialog {...props} open={false} />);
    expect(errors).not.toHaveBeenCalled();
    rerender(<ConfirmDialog {...props} open />);
    expect(errors.mock.calls.some(([m]) => String(m).includes('confirmLabel'))).toBe(true);
  });

  it('is required by the types', () => {
    // @ts-expect-error confirmLabel is required
    const missing = <ConfirmDialog open={false} title="Delete?" onConfirm={() => undefined} />;
    // @ts-expect-error null is not a label
    const empty = <ConfirmDialog open={false} title="Delete?" confirmLabel={null} onConfirm={() => undefined} />;
    expect(missing).toBeTruthy();
    expect(empty).toBeTruthy();
  });
});
