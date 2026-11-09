import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useConfirmDialog, type ConfirmOptions } from './use-confirm-dialog';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const nextFrame = () => act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

const DELETE: ConfirmOptions = { title: 'Delete invoice 2026/0142?', confirmLabel: 'Delete invoice' };

/** Records every answer of `confirm()` in order; `confirm` is exposed for calls from the test. */
function Page({ options = DELETE, answers, expose }: { options?: ConfirmOptions; answers: boolean[]; expose?: (c: (o: ConfirmOptions) => Promise<boolean>) => void }) {
  const [confirm, confirmDialog] = useConfirmDialog();
  expose?.(confirm);
  return (
    <>
      <button type="button" onClick={() => void confirm(options).then((ok) => answers.push(ok))}>
        Delete
      </button>
      {confirmDialog}
    </>
  );
}

async function openPage(options?: ConfirmOptions) {
  const user = userEvent.setup();
  const answers: boolean[] = [];
  let confirm!: (o: ConfirmOptions) => Promise<boolean>;
  const utils = render(<Page options={options} answers={answers} expose={(c) => (confirm = c)} />);
  const opener = screen.getByRole('button', { name: 'Delete' });
  await user.click(opener);
  screen.getByRole('dialog', { name: 'Delete invoice 2026/0142?' });
  return { user, answers, opener, confirm: () => confirm, ...utils };
}

describe('useConfirmDialog', () => {
  it('resolves true on confirm, and the focus returns to the opener', async () => {
    const { user, answers, opener } = await openPage();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Delete invoice' }));
    expect(answers).toEqual([true]);
    expect(screen.queryByRole('dialog')).toBeNull();
    await nextFrame();
    expect(opener).toHaveFocus();
  });

  const cancelWays: [string, (user: ReturnType<typeof userEvent.setup>) => Promise<void>][] = [
    ['Cancel', (user) => user.click(screen.getByRole('button', { name: 'Cancel' }))],
    ['Escape', (user) => user.keyboard('{Escape}')],
    ['the backdrop', (user) => user.click(document.querySelector<HTMLElement>('[data-state="open"].z-rop-overlay')!)],
  ];
  for (const [name, cancel] of cancelWays) {
    it(`resolves false on ${name}`, async () => {
      const { user, answers, opener } = await openPage();
      await cancel(user);
      expect(answers).toEqual([false]);
      expect(screen.queryByRole('dialog')).toBeNull();
      await nextFrame();
      expect(opener).toHaveFocus();
    });
  }

  it('can be asked again after an answer, with the new options', async () => {
    const { user, answers, confirm } = await openPage();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    let second!: Promise<boolean>;
    act(() => {
      second = confirm()({ title: 'Archive invoice?', confirmLabel: 'Archive', tone: 'default' });
    });
    expect(screen.getByRole('dialog', { name: 'Archive invoice?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archive' })).toHaveFocus();
    await user.keyboard('{Enter}');
    await expect(second).resolves.toBe(true);
    expect(answers).toEqual([false]);
  });

  it('a second confirm() while one is open resolves the first with false and shows the second', async () => {
    const { user, answers, confirm } = await openPage();
    let second!: Promise<boolean>;
    act(() => {
      second = confirm()({ title: 'Delete 3 invoices?', confirmLabel: 'Delete 3 invoices' });
    });
    await act(() => Promise.resolve());
    expect(answers).toEqual([false]);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: 'Delete 3 invoices?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete 3 invoices' }));
    await expect(second).resolves.toBe(true);
    expect(answers).toEqual([false]);
  });

  it('a second confirm() during a pending onConfirm: the first resolves false, the new one starts idle', async () => {
    let finish!: () => void;
    const first: ConfirmOptions = { ...DELETE, onConfirm: () => new Promise<void>((resolve) => (finish = resolve)) };
    const { user, answers, confirm } = await openPage(first);
    await user.click(screen.getByRole('button', { name: 'Delete invoice' }));
    expect(screen.getByRole('button', { name: 'Delete invoice' })).toHaveAttribute('aria-disabled', 'true');
    let second!: Promise<boolean>;
    act(() => {
      second = confirm()({ title: 'Delete 3 invoices?', confirmLabel: 'Delete 3 invoices' });
    });
    await act(() => Promise.resolve());
    expect(answers).toEqual([false]);
    const button = screen.getByRole('button', { name: 'Delete 3 invoices' });
    expect(button).not.toHaveAttribute('aria-disabled');
    // A new question: the focus is back on its safe button, not left on the previous confirm button.
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    // The first request's late success must not close or answer the second one.
    await act(async () => finish());
    expect(screen.getByRole('dialog', { name: 'Delete 3 invoices?' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await expect(second).resolves.toBe(false);
    expect(answers).toEqual([false]);
  });

  it('with an async onConfirm: pending until it settles, then true; a rejection keeps it open and goes to onError', async () => {
    let finish!: () => void;
    let fail!: (e: unknown) => void;
    let attempt = 0;
    const onError = vi.fn();
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve, reject) => {
          attempt += 1;
          finish = resolve;
          fail = reject;
        }),
    );
    const { user, answers } = await openPage({ ...DELETE, onConfirm, onError });
    const button = screen.getByRole('button', { name: 'Delete invoice' });
    await user.dblClick(button);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await act(async () => fail(new Error('nope')));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(answers).toEqual([]);
    expect(button).toHaveFocus();
    await user.click(button);
    expect(attempt).toBe(2);
    await act(async () => finish());
    expect(answers).toEqual([true]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('unmounted with a confirmation open: resolves false, nothing is logged', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { answers, unmount } = await openPage();
    unmount();
    await act(() => Promise.resolve());
    expect(answers).toEqual([false]);
    expect(errors).not.toHaveBeenCalled();
  });

  it('unmounted while onConfirm is pending: resolves false, the late success does nothing', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let finish!: () => void;
    const { user, answers, unmount } = await openPage({
      ...DELETE,
      onConfirm: () => new Promise<void>((resolve) => (finish = resolve)),
    });
    await user.click(screen.getByRole('button', { name: 'Delete invoice' }));
    unmount();
    await act(async () => finish());
    expect(answers).toEqual([false]);
    expect(errors).not.toHaveBeenCalled();
  });

  it('confirm() after the unmount resolves false at once', async () => {
    const { confirm, unmount } = await openPage();
    const stale = confirm();
    unmount();
    await expect(stale(DELETE)).resolves.toBe(false);
  });

  it('confirm is stable across renders', () => {
    const seen = new Set<unknown>();
    function Probe() {
      const [n, setN] = useState(0);
      const [confirm, element] = useConfirmDialog();
      seen.add(confirm);
      return (
        <>
          <button type="button" onClick={() => setN(n + 1)}>
            Render {n}
          </button>
          {element}
        </>
      );
    }
    render(<Probe />);
    act(() => screen.getByRole('button').click());
    act(() => screen.getByRole('button').click());
    expect(seen.size).toBe(1);
  });

  it('works under StrictMode (double effects do not answer or break the request)', async () => {
    const user = userEvent.setup();
    const answers: boolean[] = [];
    render(
      <StrictMode>
        <Page answers={answers} />
      </StrictMode>,
    );
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(answers).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Delete invoice' }));
    expect(answers).toEqual([true]);
  });

  it('nothing is rendered and nothing is logged before the first request', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<Page answers={[]} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(errors).not.toHaveBeenCalled();
  });
});
