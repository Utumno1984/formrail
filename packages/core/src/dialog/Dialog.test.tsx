import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  type DialogContentProps,
} from './Dialog';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const nextFrame = () => act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

function Panel({ title = 'Modifica fornitore', ...content }: { title?: string } & DialogContentProps) {
  return (
    <DialogContent {...content}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogClose />
      </DialogHeader>
      <DialogDescription>Cambia i dati.</DialogDescription>
      <DialogBody>Corpo</DialogBody>
      <DialogFooter>
        <DialogClose>Annulla</DialogClose>
      </DialogFooter>
    </DialogContent>
  );
}

describe('Dialog', () => {
  it('opens from its trigger as a modal dialog named by the title and described by the description', async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger>Apri</DialogTrigger>
        <Panel />
      </Dialog>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Apri' }));
    const dialog = screen.getByRole('dialog', { name: 'Modifica fornitore' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('Cambia i dati.');
  });

  it('is identical when controlled from outside with no trigger', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Apri</button>
          <Dialog
            open={open}
            onOpenChange={(next) => {
              onOpenChange(next);
              setOpen(next);
            }}
          >
            <Panel />
          </Dialog>
        </>
      );
    }
    render(<Host />);
    await user.click(screen.getByRole('button', { name: 'Apri' }));
    const dialog = screen.getByRole('dialog', { name: 'Modifica fornitore' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('Cambia i dati.');
    // The rest of the page is out of the accessibility tree while open.
    expect(screen.queryByRole('button', { name: 'Apri' })).toBeNull();
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Escape closes and calls onOpenChange(false); dismissible={false} ignores it', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Dialog defaultOpen onOpenChange={onOpenChange}>
        <Panel dismissible={false} />
      </Dialog>,
    );
    await user.keyboard('{Escape}');
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // An explicit button still closes it.
    await user.click(screen.getByRole('button', { name: 'Annulla' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('dismissible={false} keeps the focus inside: a pointerdown on the backdrop is default-prevented; dismissible does not touch it', () => {
    const { unmount } = render(
      <Dialog defaultOpen>
        <Panel dismissible={false} />
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog');
    const backdrop = dialog.previousElementSibling as HTMLElement;
    expect(backdrop).toBeTruthy();
    // fireEvent returns false when the event was default-prevented (the browser would not move the focus).
    expect(fireEvent.pointerDown(backdrop)).toBe(false);
    // Inside the panel the press behaves normally.
    expect(fireEvent.pointerDown(screen.getByText('Corpo'))).toBe(true);
    // Outside the modal layer (e.g. a popover portaled above it) is not touched either.
    expect(fireEvent.pointerDown(document.body)).toBe(true);
    unmount();

    render(
      <Dialog defaultOpen>
        <Panel dismissible />
      </Dialog>,
    );
    const normalBackdrop = screen.getByRole('dialog').previousElementSibling as HTMLElement;
    expect(fireEvent.pointerDown(normalBackdrop)).toBe(true);
  });

  it('dismissible={false} guard is removed when the dialog closes', async () => {
    const user = userEvent.setup();
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    render(
      <Dialog defaultOpen>
        <Panel dismissible={false} />
      </Dialog>,
    );
    const added = add.mock.calls.filter(([type, , capture]) => type === 'pointerdown' && capture === true);
    expect(added.length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Annulla' }));
    // The very same function that was added is removed.
    for (const [, handler] of added) {
      expect(remove.mock.calls.some(([type, fn, capture]) => type === 'pointerdown' && fn === handler && capture === true)).toBe(
        true,
      );
    }
  });

  it('switching dismissible from false to true while open stops guarding the backdrop', () => {
    function Host({ dismissible }: { dismissible: boolean }) {
      return (
        <Dialog defaultOpen>
          <Panel dismissible={dismissible} />
        </Dialog>
      );
    }
    const { rerender } = render(<Host dismissible={false} />);
    const backdrop = () => screen.getByRole('dialog').previousElementSibling as HTMLElement;
    expect(fireEvent.pointerDown(backdrop())).toBe(false);
    rerender(<Host dismissible />);
    expect(fireEvent.pointerDown(backdrop())).toBe(true);
  });

  it('returns the focus to the trigger (and to the external opener) on close, through useReturnFocus', async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger>Apri</DialogTrigger>
        <Panel />
      </Dialog>,
    );
    const trigger = screen.getByRole('button', { name: 'Apri' });
    await user.click(trigger);
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard('{Escape}');
    await nextFrame();
    expect(trigger).toHaveFocus();
  });

  it('returns the focus when the parent closes it without onOpenChange, and uses returnFocusRef as fallback', async () => {
    const fallback = createRef<HTMLButtonElement>();
    function Host() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button onClick={() => setOpen(false)}>Chiudi da fuori</button>
          <button ref={fallback}>Fallback</button>
          <Dialog open={open}>
            <Panel returnFocusRef={fallback} />
          </Dialog>
        </>
      );
    }
    render(<Host />);
    // Mounted open: no opener existed. Closing from state (the page button is aria-hidden: use the DOM).
    act(() => screen.getByText('Chiudi da fuori').click());
    await nextFrame();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fallback.current).toHaveFocus();
  });

  it('sets the size width class, merges a conflicting className, and does not leak control props', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <Dialog defaultOpen>
        <Panel size="xl" dismissible returnFocusRef={createRef()} className="max-w-[300px]" data-extra="yes" />
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('max-w-[300px]');
    expect(dialog).not.toHaveClass('max-w-[60rem]');
    expect(dialog).toHaveAttribute('data-extra', 'yes');
    await nextFrame();
    for (const name of ['size', 'dismissible', 'returnFocusRef', 'returnfocusref']) {
      expect(dialog.hasAttribute(name)).toBe(false);
    }
    expect(errors).not.toHaveBeenCalled();
  });

  it('default size is md', () => {
    render(
      <Dialog defaultOpen>
        <Panel />
      </Dialog>,
    );
    expect(screen.getByRole('dialog')).toHaveClass('max-w-[35rem]');
  });

  it('stacks the backdrop and the content on the overlay layers', () => {
    render(
      <Dialog defaultOpen>
        <Panel />
      </Dialog>,
    );
    expect(screen.getByRole('dialog')).toHaveClass('z-rop-modal');
    expect(document.querySelector('[data-state="open"].z-rop-overlay')).not.toBeNull();
  });

  it('warns when there is no accessible name, and not when a hidden title provides it', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { unmount } = render(
      <Dialog defaultOpen>
        <DialogContent aria-describedby={undefined}>Senza nome</DialogContent>
      </Dialog>,
    );
    await nextFrame();
    expect(errors.mock.calls.some((c) => String(c[0]).includes('[formrail] <DialogContent> has no accessible name'))).toBe(true);
    unmount();
    errors.mockClear();
    render(
      <Dialog defaultOpen>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle visuallyHidden>Nome nascosto</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    await nextFrame();
    expect(screen.getByRole('dialog', { name: 'Nome nascosto' })).toBeInTheDocument();
    expect(screen.getByText('Nome nascosto')).toHaveClass('sr-only');
    expect(errors.mock.calls.some((c) => String(c[0]).includes('has no accessible name'))).toBe(false);
  });

  it('the default close button is a Button icon-xs named "Close: <title>", overridable', async () => {
    render(
      <Dialog defaultOpen>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Modifica fornitore</DialogTitle>
          <DialogClose />
          <DialogClose aria-label="Esci" />
        </DialogContent>
      </Dialog>,
    );
    const close = await screen.findByRole('button', { name: 'Close: Modifica fornitore' });
    expect(close).toHaveClass('size-6');
    expect(close.querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Esci' })).toBeInTheDocument();
  });

  it('removes the scroll lock and the aria-hidden on siblings when unmounted while open', () => {
    const { unmount } = render(
      <>
        <main data-testid="page">Pagina</main>
        <Dialog defaultOpen>
          <Panel />
        </Dialog>
      </>,
    );
    expect(document.body).toHaveAttribute('data-scroll-locked');
    expect(document.querySelector('[data-aria-hidden]')).not.toBeNull();
    unmount();
    expect(document.body.hasAttribute('data-scroll-locked')).toBe(false);
    expect(document.querySelector('[data-aria-hidden]')).toBeNull();
  });

  it('returns the focus to the trigger even when a click never focused it (Safari, Firefox on macOS)', async () => {
    render(
      <Dialog>
        <DialogTrigger>Apri</DialogTrigger>
        <Panel />
      </Dialog>,
    );
    const trigger = screen.getByRole('button', { name: 'Apri' });
    // A bare click event: unlike a user click in Chromium, it does not move the focus to the button.
    act(() => trigger.click());
    expect(trigger).not.toHaveFocus();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    act(() => screen.getByRole('button', { name: 'Annulla' }).click());
    await nextFrame();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('a chain (close one dialog, open another in the same handler) returns the focus with returnFocusRef', async () => {
    const opener = createRef<HTMLButtonElement>();
    function Host() {
      const [a, setA] = useState(false);
      const [b, setB] = useState(false);
      return (
        <>
          <button ref={opener} onClick={() => setA(true)}>
            Elimina riga
          </button>
          <Dialog open={a} onOpenChange={setA}>
            <DialogContent aria-describedby={undefined}>
              <DialogTitle>Primo</DialogTitle>
              <button
                onClick={() => {
                  setA(false);
                  setB(true);
                }}
              >
                Procedi
              </button>
            </DialogContent>
          </Dialog>
          <Dialog open={b} onOpenChange={setB}>
            <DialogContent aria-describedby={undefined} returnFocusRef={opener}>
              <DialogTitle>Conferma</DialogTitle>
              <button onClick={() => setB(false)}>Chiudi conferma</button>
            </DialogContent>
          </Dialog>
        </>
      );
    }
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getByRole('button', { name: 'Elimina riga' }));
    await user.click(await screen.findByRole('button', { name: 'Procedi' }));
    await user.click(await screen.findByRole('button', { name: 'Chiudi conferma' }));
    await nextFrame();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener.current).toHaveFocus();
  });

  it('throws a clear error when a part is used outside Dialog', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<DialogContent>x</DialogContent>)).toThrow(/inside <Dialog>/);
  });
});
