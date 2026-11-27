import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from '../dialog/Dialog';
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  type SheetContentProps,
} from './Sheet';

// #721: a sheet always has a way out by touch. A touch screen has no Escape key, and a panel as wide as the screen
// leaves no backdrop to tap: the close button is the only exit a finger has.

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

/**
 * Gives the modal panels an exit animation that never ends, as in a browser without reduced motion: jsdom has no CSS,
 * so a closed Sheet would leave the DOM at once. Radix's Presence reads `animationName` (an exit that differs from the
 * entry keeps the nodes mounted); the panel's own safety net removes them after the animation's duration (0 here)
 * plus 500ms. Same helper as in `AppShell.compact-nav.test.tsx`.
 */
function animateModalExit() {
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
    const style = real(element, pseudo);
    const modal = element.matches('[role="dialog"]') || !!element.querySelector(':scope > [role="dialog"]');
    if (!modal) return style;
    return new Proxy(style, {
      get(target, key) {
        if (key === 'animationName') return element.getAttribute('data-state') === 'closed' ? 'rop-out' : 'rop-in';
        const value = Reflect.get(target, key) as unknown;
        return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
      },
    });
  });
}

const nextFrame = () => act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
const ownClose = () => document.querySelector<HTMLElement>('[data-rop-default-close]');
const headerOf = (panel: HTMLElement) => panel.firstElementChild as HTMLElement;

function Bare({
  content,
  header = true,
  children,
}: {
  content?: Omit<SheetContentProps, 'children'>;
  header?: boolean;
  children?: ReactNode;
}) {
  return (
    <Sheet>
      <SheetTrigger>Open</SheetTrigger>
      <SheetContent {...content}>
        {header ? (
          <SheetHeader>
            <SheetTitle>Edit supplier</SheetTitle>
          </SheetHeader>
        ) : (
          <SheetTitle visuallyHidden>Edit supplier</SheetTitle>
        )}
        <SheetBody>
          <input aria-label="Company name" />
          {children}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

describe('SheetContent closeButton: the sheet draws its own close button when it has no SheetClose', () => {
  it('named after the title, last in the DOM (the opening focus stays on the first field); a click closes and returns the focus', async () => {
    const user = userEvent.setup();
    render(<Bare />);
    const trigger = screen.getByRole('button', { name: 'Open' });
    await user.click(trigger);
    const panel = screen.getByRole('dialog', { name: 'Edit supplier' });
    expect(screen.getByRole('textbox', { name: 'Company name' })).toHaveFocus();
    const close = await screen.findByRole('button', { name: 'Close: Edit supplier' });
    expect(close).toBe(ownClose());
    expect(panel.lastElementChild).toBe(close);
    expect(close).toHaveClass('absolute', 'size-6', 'pointer-coarse:size-11');
    // The header keeps room at its end for it.
    expect(headerOf(panel)).toHaveClass('pe-16');
    await user.click(close);
    expect(screen.queryByRole('dialog')).toBeNull();
    await nextFrame();
    expect(trigger).toHaveFocus();
  });

  it('never two buttons: none next to a SheetClose, whether the default one, asChild or with children', async () => {
    const closes = [
      <SheetClose key="default" />,
      <SheetClose key="as-child" asChild>
        <button>Cancel</button>
      </SheetClose>,
      <SheetClose key="children">Done</SheetClose>,
    ];
    for (const close of closes) {
      const user = userEvent.setup();
      const { unmount } = render(<Bare>{close}</Bare>);
      await user.click(screen.getByRole('button', { name: 'Open' }));
      await nextFrame();
      expect(ownClose()).toBeNull();
      expect(headerOf(screen.getByRole('dialog'))).not.toHaveClass('pe-16');
      unmount();
    }
  });

  it('a SheetClose mounted later (content loaded asynchronously) takes its place; nothing is logged', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const user = userEvent.setup();
    function Late() {
      const [loaded, setLoaded] = useState(false);
      return (
        <Bare>
          <button onClick={() => setLoaded(true)}>Load</button>
          {loaded ? (
            <SheetClose asChild>
              <button>Cancel</button>
            </SheetClose>
          ) : null}
        </Bare>
      );
    }
    render(<Late />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(ownClose()).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Load' }));
    expect(ownClose()).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('a SheetClose unmounted while the sheet is open: its own button comes back (never a panel with no way out)', async () => {
    const user = userEvent.setup();
    function Host() {
      const [shown, setShown] = useState(true);
      return (
        <Bare>
          <button onClick={() => setShown(false)}>Remove close</button>
          {shown ? <SheetClose /> : null}
        </Bare>
      );
    }
    render(<Host />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await nextFrame();
    expect(ownClose()).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Close: Edit supplier' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Remove close' }));
    const close = ownClose();
    expect(close).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Close: Edit supplier' })).toBe(close);
    expect(headerOf(screen.getByRole('dialog'))).toHaveClass('pe-16');
    await user.click(close!);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('labels.close names it', async () => {
    const user = userEvent.setup();
    render(<Bare content={{ labels: { close: 'Chiudi il pannello' } }} />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(await screen.findByRole('button', { name: 'Chiudi il pannello' })).toBe(ownClose());
  });

  it('with no header the panel keeps room above its first part for it', async () => {
    const user = userEvent.setup();
    render(<Bare header={false} />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await screen.findByRole('button', { name: 'Close: Edit supplier' });
    expect(screen.getByRole('dialog')).toHaveClass('pt-8', 'pointer-coarse:pt-10');
  });

  it('in a Sheet opened over a Dialog it closes only the Sheet', async () => {
    const user = userEvent.setup();
    render(
      <Dialog defaultOpen>
        <DialogContent>
          <DialogTitle>Supplier</DialogTitle>
          <Bare />
        </DialogContent>
      </Dialog>,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.click(await screen.findByRole('button', { name: 'Close: Edit supplier' }));
    expect(screen.queryByRole('dialog', { name: 'Edit supplier' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Supplier' })).toBeInTheDocument();
    await nextFrame();
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus();
  });

  it('dismissible={false}: not drawn, and nothing is logged (the way out is an action of the panel, by contract)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    function Host() {
      const [open, setOpen] = useState(true);
      return (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent dismissible={false}>
            <SheetTitle>Confirm</SheetTitle>
            <button onClick={() => setOpen(false)}>Confirm and close</button>
          </SheetContent>
        </Sheet>
      );
    }
    const user = userEvent.setup();
    render(<Host />);
    await nextFrame();
    expect(ownClose()).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Confirm and close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('SheetContent: the development warning for a sheet with no close button', () => {
  it('closeButton={false} and no SheetClose: one console.warn naming the component, when it closes, once per instance', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const user = userEvent.setup();
    render(<Bare content={{ closeButton: false }} />);
    for (let i = 0; i < 2; i += 1) {
      await user.click(screen.getByRole('button', { name: 'Open' }));
      await nextFrame();
      expect(ownClose()).toBeNull();
      expect(warn).toHaveBeenCalledTimes(i);
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
    }
    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toMatch(/^\[formrail\] <SheetContent> was open with no close button: /);
    expect(message).toContain('<SheetClose>');
    expect(message).toContain('dismissible={false}');
  });

  it('closeButton={false} with a SheetClose that arrives later: nothing is logged', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const user = userEvent.setup();
    function Late() {
      const [loaded, setLoaded] = useState(false);
      return (
        <Bare content={{ closeButton: false }}>
          <button onClick={() => setLoaded(true)}>Load</button>
          {loaded ? <SheetClose /> : null}
        </Bare>
      );
    }
    render(<Late />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await nextFrame();
    await user.click(screen.getByRole('button', { name: 'Load' }));
    await user.click(screen.getByRole('button', { name: 'Close: Edit supplier' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('closeButton={false}: a SheetClose at the first opening and none at the second, the warning is logged when the second closes', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const user = userEvent.setup();
    const { rerender } = render(<Bare content={{ closeButton: false }}>{<SheetClose />}</Bare>);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await nextFrame();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    rerender(<Bare content={{ closeButton: false }} />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await nextFrame();
    expect(screen.queryByRole('button', { name: /^Close/ })).toBeNull();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('closeButton={false}: opened again during the exit animation, with its SheetClose still mounted, nothing is logged', async () => {
    animateModalExit();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    function Host({ open }: { open: boolean }) {
      return (
        <Sheet open={open}>
          <SheetContent closeButton={false}>
            <SheetHeader>
              <SheetTitle>Edit supplier</SheetTitle>
              <SheetClose />
            </SheetHeader>
          </SheetContent>
        </Sheet>
      );
    }
    const { rerender } = render(<Host open />);
    await nextFrame();
    const panel = screen.getByRole('dialog');
    rerender(<Host open={false} />);
    // Still mounted: the exit animation runs.
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveAttribute('data-state', 'closed');
    rerender(<Host open />);
    await nextFrame();
    expect(screen.getByRole('dialog')).toBe(panel);
    rerender(<Host open={false} />);
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 600)));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('closeButton={false} and no SheetClose in production: nothing is logged', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const user = userEvent.setup();
    render(<Bare content={{ closeButton: false }} />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await nextFrame();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('asChild with no SheetClose: nothing is added to your element, and the warning is logged', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const user = userEvent.setup();
    render(
      <Sheet>
        <SheetTrigger>Open</SheetTrigger>
        <SheetContent asChild aria-label="Filters">
          <section>
            <input aria-label="Search" />
          </section>
        </SheetContent>
      </Sheet>,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await nextFrame();
    const panel = screen.getByRole('dialog', { name: 'Filters' });
    expect(panel.tagName).toBe('SECTION');
    expect(panel.children).toHaveLength(1);
    await user.keyboard('{Escape}');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('a sheet with its own button (the default) logs nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const user = userEvent.setup();
    render(<Bare />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await nextFrame();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('SheetContent: touch targets and no leak', () => {
  it("the default close button is 44 x 44 px under a coarse pointer in a Sheet, not in a Dialog (that one is #705's)", async () => {
    render(
      <>
        <Sheet defaultOpen>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Sheet</SheetTitle>
              <SheetClose />
            </SheetHeader>
          </SheetContent>
        </Sheet>
        <Dialog defaultOpen>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Dialog</DialogTitle>
              <DialogClose />
            </DialogHeader>
          </DialogContent>
        </Dialog>
      </>,
    );
    await nextFrame();
    const sheet = screen.getByRole('dialog', { name: 'Sheet', hidden: true });
    const dialog = screen.getByRole('dialog', { name: 'Dialog', hidden: true });
    expect(within(sheet).getByRole('button', { hidden: true })).toHaveClass('size-6', 'pointer-coarse:size-11');
    expect(within(dialog).getByRole('button', { hidden: true })).toHaveClass('size-6');
    expect(within(dialog).getByRole('button', { hidden: true })).not.toHaveClass('pointer-coarse:size-11');
  });

  it('closeButton and labels never reach the DOM', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <Sheet defaultOpen>
        <SheetContent closeButton={false} labels={{ close: 'X' }}>
          <SheetTitle>Edit supplier</SheetTitle>
          <SheetClose />
        </SheetContent>
      </Sheet>,
    );
    const panel = screen.getByRole('dialog');
    await nextFrame();
    for (const name of ['closeButton', 'closebutton', 'labels']) expect(panel.hasAttribute(name)).toBe(false);
    expect(errors).not.toHaveBeenCalled();
  });
});
