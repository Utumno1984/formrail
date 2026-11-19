// #583: `confirmDisabledReason`, a confirm button that cannot be used right now. `aria-disabled` (never the native
// `disabled`: the focus stays where it is), described by the reason, and inert to a click, Enter and Space.
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialog, type ConfirmDialogProps } from './ConfirmDialog';
import { useConfirmDialog } from './use-confirm-dialog';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const nextFrame = () => act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

const TITLE = 'Review changes';
const DESCRIPTION = '3 changes will be saved.';
const REASON = 'This sales order was deleted on the server: it can no longer be saved.';

type HostProps = Partial<ConfirmDialogProps> & { initialOpen?: boolean };

/** A page with an opener and a ConfirmDialog controlled by state; a `rerender` keeps the open state. */
function Host({ initialOpen = false, onOpenChange, ...props }: HostProps) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <ConfirmDialog
        title={TITLE}
        description={DESCRIPTION}
        confirmLabel="Save changes"
        cancelLabel="Keep editing"
        tone="default"
        onConfirm={() => undefined}
        {...props}
        open={open}
        onOpenChange={(next) => {
          onOpenChange?.(next);
          setOpen(next);
        }}
      />
    </>
  );
}

async function openHost(props: HostProps = {}) {
  const user = userEvent.setup();
  const utils = render(<Host {...props} />);
  await user.click(screen.getByRole('button', { name: 'Open' }));
  const dialog = screen.getByRole('dialog', { name: TITLE });
  const confirm = () => screen.getByRole('button', { name: 'Save changes' });
  return { user, dialog, confirm, ...utils };
}

describe('ConfirmDialog: confirmDisabledReason (#583)', () => {
  it('given: the confirm button is aria-disabled (not disabled) and described by the reason, shown in the footer', async () => {
    const { dialog, confirm } = await openHost({ confirmDisabledReason: REASON });
    expect(confirm()).toHaveAttribute('aria-disabled', 'true');
    expect(confirm()).not.toBeDisabled();
    expect(confirm()).toHaveAccessibleDescription(REASON);
    const reason = document.getElementById(confirm().getAttribute('aria-describedby')!)!;
    expect(reason.nodeType).toBe(Node.ELEMENT_NODE);
    expect(reason).toHaveTextContent(REASON);
    expect(dialog).toContainElement(reason);
    // Next to the buttons it explains (the footer never scrolls away), not in the body.
    expect(reason.parentElement).toBe(confirm().parentElement);
    // The dialog's own description is still the description alone; Cancel is untouched.
    expect(dialog).toHaveAccessibleDescription(DESCRIPTION);
    expect(screen.getByRole('button', { name: 'Keep editing' })).not.toHaveAttribute('aria-disabled');
    expect(screen.getByRole('button', { name: 'Keep editing' })).not.toHaveAttribute('aria-describedby');
  });

  it('a click, Enter and Space on it call nothing and close nothing; the focus stays on it', async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    const onCancel = vi.fn();
    const { user, dialog, confirm } = await openHost({ confirmDisabledReason: REASON, onConfirm, onOpenChange, onCancel, initialFocus: 'confirm' });
    expect(confirm()).toHaveFocus();
    await user.click(confirm());
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    await user.dblClick(confirm());
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(dialog).toBeInTheDocument();
    expect(confirm()).toHaveFocus();
  });

  it('Tab reaches it (still focusable), and Cancel and Escape still cancel', async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const { user, confirm } = await openHost({ confirmDisabledReason: REASON, initialFocus: 'cancel', onCancel, onConfirm });
    expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus();
    await user.tab();
    expect(confirm()).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('appearing while the dialog is open, with the focus on the button: the focus does not move; going away, the button works again', async () => {
    const onConfirm = vi.fn();
    const { user, confirm, rerender } = await openHost({ initialFocus: 'confirm', onConfirm });
    const button = confirm();
    expect(button).toHaveFocus();
    expect(button).not.toHaveAttribute('aria-disabled');
    rerender(<Host initialFocus="confirm" onConfirm={onConfirm} confirmDisabledReason={REASON} />);
    await nextFrame();
    // The same node, still focused: no remount, no focus moved to the panel or to Cancel.
    expect(confirm()).toBe(button);
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleDescription(REASON);
    await user.keyboard('{Enter}');
    expect(onConfirm).not.toHaveBeenCalled();
    rerender(<Host initialFocus="confirm" onConfirm={onConfirm} confirmDisabledReason={undefined} />);
    expect(button).toHaveFocus();
    expect(button).not.toHaveAttribute('aria-disabled');
    expect(button).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByText(REASON)).toBeNull();
    await user.keyboard('{Enter}');
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it.each([
    ['absent', undefined],
    ['null', null],
    ['false', false],
    ['true', true],
    ['an empty string', ''],
    ['a blank string', '   '],
  ] as const)('%s: no reason, the button works as without the prop', async (_, value) => {
    const onConfirm = vi.fn();
    const { user, dialog, confirm } = await openHost({ onConfirm, confirmDisabledReason: value as ReactNode });
    expect(confirm()).not.toHaveAttribute('aria-disabled');
    expect(confirm()).not.toHaveAttribute('aria-describedby');
    // Nothing more in the footer than the two buttons.
    expect(Array.from(confirm().parentElement!.children).map((child) => child.tagName)).toEqual(['BUTTON', 'BUTTON']);
    expect(dialog).toHaveAccessibleDescription(DESCRIPTION);
    await user.click(confirm());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a reason that is an element: its text is the description of the button', async () => {
    const { confirm } = await openHost({
      confirmDisabledReason: (
        <>
          Deleted on the server. <a href="#list">Back to the list</a>
        </>
      ),
    });
    expect(confirm()).toHaveAttribute('aria-disabled', 'true');
    expect(confirm()).toHaveAccessibleDescription('Deleted on the server. Back to the list');
  });

  it('appearing while a confirmation is pending: the pending one is not interrupted, and closes the dialog when it succeeds', async () => {
    let resolve!: () => void;
    const pending = new Promise<void>((r) => {
      resolve = r;
    });
    const onConfirm = vi.fn(() => pending);
    const onOpenChange = vi.fn();
    const { user, confirm, rerender } = await openHost({ initialFocus: 'confirm', onConfirm, onOpenChange });
    await user.click(confirm());
    expect(confirm()).toHaveAttribute('aria-disabled', 'true');
    rerender(<Host initialFocus="confirm" onConfirm={onConfirm} onOpenChange={onOpenChange} confirmDisabledReason={REASON} />);
    expect(confirm()).toHaveAccessibleDescription(REASON);
    await act(async () => {
      resolve();
      await pending;
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('two dialogs with a reason each: two different ids, each button described by its own reason', async () => {
    render(
      <>
        <ConfirmDialog open={false} onOpenChange={() => undefined} title="First" confirmLabel="Save" onConfirm={() => undefined} confirmDisabledReason="First reason" />
        <ConfirmDialog open onOpenChange={() => undefined} title="Second" confirmLabel="Send" onConfirm={() => undefined} confirmDisabledReason="Second reason" />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Send' })).toHaveAccessibleDescription('Second reason');
    expect(screen.queryByText('First reason')).toBeNull();
  });

  it('is never an attribute in the DOM, and logs nothing', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { dialog } = await openHost({ confirmDisabledReason: REASON });
    await nextFrame();
    for (const node of [dialog, ...Array.from(dialog.querySelectorAll('*'))]) {
      for (const name of node.getAttributeNames()) {
        expect(name.toLowerCase()).not.toBe('confirmdisabledreason');
        expect(node.getAttribute(name)).not.toBe(REASON);
      }
    }
    expect(errors).not.toHaveBeenCalled();
    expect(warnings).not.toHaveBeenCalled();
  });
});

describe('useConfirmDialog: confirmDisabledReason is one of the options (#583)', () => {
  function HookHost({ onResult, reason }: { onResult: (ok: boolean) => void; reason: ReactNode }) {
    const [confirm, element] = useConfirmDialog();
    return (
      <>
        <button
          type="button"
          onClick={() => {
            void confirm({ title: TITLE, confirmLabel: 'Save changes', tone: 'default', confirmDisabledReason: reason }).then(onResult);
          }}
        >
          Save
        </button>
        {element}
      </>
    );
  }

  it('the confirm button cannot resolve the promise; Cancel resolves it with false', async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    render(<HookHost onResult={onResult} reason={REASON} />);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const confirm = screen.getByRole('button', { name: 'Save changes' });
    expect(confirm).toHaveAttribute('aria-disabled', 'true');
    expect(confirm).toHaveAccessibleDescription(REASON);
    await user.click(confirm);
    await act(() => Promise.resolve());
    expect(onResult).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: TITLE })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await act(() => Promise.resolve());
    expect(onResult).toHaveBeenCalledExactlyOnceWith(false);
  });
});

describe('ConfirmDialog: confirmDisabledReason, hydrated from the server HTML (#583)', () => {
  it('no hydration mismatch; once open on the client, the button is described by the reason', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function Page() {
      return (
        <main>
          <ConfirmDialog open onOpenChange={() => undefined} title={TITLE} confirmLabel="Save changes" onConfirm={() => undefined} confirmDisabledReason={REASON} />
        </main>
      );
    }
    const container = document.createElement('div');
    container.innerHTML = renderToString(<Page />);
    document.body.appendChild(container);
    const root = await act(async () => hydrateRoot(container, <Page />));
    await nextFrame();
    const confirm = screen.getByRole('button', { name: 'Save changes' });
    expect(confirm).toHaveAttribute('aria-disabled', 'true');
    expect(confirm).toHaveAccessibleDescription(REASON);
    expect(errors).not.toHaveBeenCalled();
    act(() => root.unmount());
    container.remove();
  });
});
