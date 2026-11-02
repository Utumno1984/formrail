import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, useState, type ComponentType, type ReactNode, type RefObject } from 'react';
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
} from '../dialog/Dialog';
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  type SheetContentProps,
} from './Sheet';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const nextFrame = () => act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

interface Kit {
  name: string;
  Root: ComponentType<{ open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void; children?: ReactNode }>;
  Trigger: ComponentType<{ children?: ReactNode }>;
  Panel: ComponentType<{ returnFocusRef?: RefObject<HTMLElement | null>; dismissible?: boolean }>;
}

function DialogPanel(props: { returnFocusRef?: RefObject<HTMLElement | null>; dismissible?: boolean }) {
  return (
    <DialogContent {...props}>
      <DialogHeader>
        <DialogTitle>Modifica fornitore</DialogTitle>
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

function SheetPanel({ extra, ...props }: { returnFocusRef?: RefObject<HTMLElement | null>; dismissible?: boolean; extra?: SheetContentProps }) {
  return (
    <SheetContent {...props} {...extra}>
      <SheetHeader>
        <SheetTitle>Modifica fornitore</SheetTitle>
        <SheetClose />
      </SheetHeader>
      <SheetDescription>Cambia i dati.</SheetDescription>
      <SheetBody>Corpo</SheetBody>
      <SheetFooter>
        <SheetClose>Annulla</SheetClose>
      </SheetFooter>
    </SheetContent>
  );
}

const KITS: Kit[] = [
  { name: 'Dialog', Root: Dialog, Trigger: DialogTrigger, Panel: DialogPanel },
  { name: 'Sheet', Root: Sheet, Trigger: SheetTrigger, Panel: SheetPanel },
];

// The guarantees Sheet inherits from the shared modal module: the same tests run on both.
describe.each(KITS)('$name: shared modal behaviour', ({ name, Root, Trigger, Panel }) => {
  it('opens from its trigger as a modal named by the title and described by the description', async () => {
    const user = userEvent.setup();
    render(
      <Root>
        <Trigger>Apri</Trigger>
        <Panel />
      </Root>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Apri' }));
    const panel = screen.getByRole('dialog', { name: 'Modifica fornitore' });
    expect(panel).toHaveAttribute('aria-modal', 'true');
    expect(panel).toHaveAccessibleDescription('Cambia i dati.');
  });

  it('is identical when controlled from outside with no trigger', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Apri</button>
          <Root
            open={open}
            onOpenChange={(next) => {
              onOpenChange(next);
              setOpen(next);
            }}
          >
            <Panel />
          </Root>
        </>
      );
    }
    render(<Host />);
    await user.click(screen.getByRole('button', { name: 'Apri' }));
    const panel = screen.getByRole('dialog', { name: 'Modifica fornitore' });
    expect(panel).toHaveAttribute('aria-modal', 'true');
    expect(panel).toHaveAccessibleDescription('Cambia i dati.');
    // The rest of the page is inert for assistive technology while open.
    expect(screen.queryByRole('button', { name: 'Apri' })).toBeNull();
    expect(document.body).toHaveAttribute('data-scroll-locked');
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByRole('dialog')).toBeNull();
    await nextFrame();
    expect(screen.getByRole('button', { name: 'Apri' })).toHaveFocus();
  });

  it('traps the focus inside while open', async () => {
    const user = userEvent.setup();
    render(
      <Root defaultOpen>
        <Panel />
      </Root>,
    );
    const panel = screen.getByRole('dialog');
    for (let i = 0; i < 6; i += 1) {
      await user.tab();
      expect(panel).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it('dismissible={false} ignores Escape; an explicit button still closes', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Root defaultOpen onOpenChange={onOpenChange}>
        <Panel dismissible={false} />
      </Root>,
    );
    await user.keyboard('{Escape}');
    expect(onOpenChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Annulla' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('returns the focus to the trigger even when a click never focused it', async () => {
    render(
      <Root>
        <Trigger>Apri</Trigger>
        <Panel />
      </Root>,
    );
    const trigger = screen.getByRole('button', { name: 'Apri' });
    act(() => trigger.click());
    expect(trigger).not.toHaveFocus();
    act(() => screen.getByRole('button', { name: 'Annulla' }).click());
    await nextFrame();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('mounted open (no opener): closing from state returns the focus to returnFocusRef', async () => {
    const fallback = createRef<HTMLButtonElement>();
    function Host() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button onClick={() => setOpen(false)}>Chiudi da fuori</button>
          <button ref={fallback}>Fallback</button>
          <Root open={open}>
            <Panel returnFocusRef={fallback} />
          </Root>
        </>
      );
    }
    render(<Host />);
    act(() => screen.getByText('Chiudi da fuori').click());
    await nextFrame();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fallback.current).toHaveFocus();
  });

  it('stacks the content on the modal layer and the backdrop on the overlay layer', () => {
    render(
      <Root defaultOpen>
        <Panel />
      </Root>,
    );
    expect(screen.getByRole('dialog')).toHaveClass('z-rop-modal');
    expect(document.querySelector('[data-state="open"].z-rop-overlay')).not.toBeNull();
  });

  it('the default close button is named "Close: <title>"', async () => {
    render(
      <Root defaultOpen>
        <Panel />
      </Root>,
    );
    const close = await screen.findByRole('button', { name: 'Close: Modifica fornitore' });
    expect(close).toHaveClass('size-6');
    expect(close.querySelector('svg')).not.toBeNull();
  });

  it('releases the scroll lock and the aria-hidden on siblings when unmounted while open', () => {
    const { unmount } = render(
      <>
        <main>Pagina</main>
        <Root defaultOpen>
          <Panel />
        </Root>
      </>,
    );
    expect(document.body).toHaveAttribute('data-scroll-locked');
    unmount();
    expect(document.body.hasAttribute('data-scroll-locked')).toBe(false);
    expect(document.querySelector('[data-aria-hidden]')).toBeNull();
  });

  it('warns about a missing accessible name with the component name, not when a hidden title provides it', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const Content = name === 'Dialog' ? DialogContent : SheetContent;
    const Title = name === 'Dialog' ? DialogTitle : SheetTitle;
    const { unmount } = render(
      <Root defaultOpen>
        <Content aria-describedby={undefined}>Senza nome</Content>
      </Root>,
    );
    await nextFrame();
    expect(errors.mock.calls.some((c) => String(c[0]).includes(`<${name}Content> has no accessible name`))).toBe(true);
    unmount();
    errors.mockClear();
    render(
      <Root defaultOpen>
        <Content aria-describedby={undefined}>
          <Title visuallyHidden>Nome nascosto</Title>
        </Content>
      </Root>,
    );
    await nextFrame();
    expect(screen.getByRole('dialog', { name: 'Nome nascosto' })).toBeInTheDocument();
    expect(screen.getByText('Nome nascosto')).toHaveClass('sr-only');
    expect(errors.mock.calls.some((c) => String(c[0]).includes('has no accessible name'))).toBe(false);
  });

  it('forwards the HTML attributes passed by the consumer (title, part, id, data-*, aria-*) to the panel', () => {
    const Content = name === 'Dialog' ? DialogContent : SheetContent;
    const Title = name === 'Dialog' ? DialogTitle : SheetTitle;
    render(
      <Root defaultOpen>
        <Content title="Suggerimento" part="pannello" id="mio-pannello" data-extra="yes" aria-describedby={undefined}>
          <Title>Nome</Title>
        </Content>
      </Root>,
    );
    const panel = screen.getByRole('dialog', { name: 'Nome' });
    expect(panel).toHaveAttribute('title', 'Suggerimento');
    expect(panel).toHaveAttribute('part', 'pannello');
    expect(panel).toHaveAttribute('id', 'mio-pannello');
    expect(panel).toHaveAttribute('data-extra', 'yes');
  });

  it(`throws a clear error when a part is used outside <${name}>`, () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const Content = name === 'Dialog' ? DialogContent : SheetContent;
    expect(() => render(<Content>x</Content>)).toThrow(new RegExp(`inside <${name}>`));
  });
});

describe('Sheet: what differs from Dialog', () => {
  it('is attached to the right edge by default, with the md width, and is not a centred dialog', () => {
    render(
      <Sheet defaultOpen>
        <SheetPanel />
      </Sheet>,
    );
    const panel = screen.getByRole('dialog');
    expect(panel).toHaveClass('right-0', 'w-[30rem]', 'max-w-full', 'h-[var(--rop-vv-h)]');
    expect(panel).not.toHaveClass('left-0');
  });

  it('side="left" and each size set their own classes; a conflicting className wins', () => {
    const { rerender } = render(
      <Sheet defaultOpen>
        <SheetPanel extra={{ side: 'left', size: 'sm' }} />
      </Sheet>,
    );
    let panel = screen.getByRole('dialog');
    expect(panel).toHaveClass('left-0', 'w-[22rem]');
    expect(panel).not.toHaveClass('right-0');
    rerender(
      <Sheet defaultOpen>
        <SheetPanel extra={{ size: 'lg', className: 'w-[300px]' }} />
      </Sheet>,
    );
    panel = screen.getByRole('dialog');
    expect(panel).toHaveClass('w-[300px]');
    expect(panel).not.toHaveClass('w-[42rem]');
  });

  it('changing side while open moves the same node without closing it or losing the focus', async () => {
    const user = userEvent.setup();
    function Host({ side }: { side: 'left' | 'right' }) {
      return (
        <Sheet defaultOpen>
          <SheetPanel extra={{ side }} />
        </Sheet>
      );
    }
    const { rerender } = render(<Host side="right" />);
    const panel = screen.getByRole('dialog');
    await user.tab();
    const focused = document.activeElement;
    expect(panel).toContainElement(focused as HTMLElement);
    rerender(<Host side="left" />);
    expect(screen.getByRole('dialog')).toBe(panel);
    expect(panel).toHaveClass('left-0');
    expect(document.activeElement).toBe(focused);
  });

  it('does not leak side / size / dismissible / returnFocusRef onto the DOM', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <Sheet defaultOpen>
        <SheetPanel extra={{ side: 'left', size: 'lg', dismissible: true, returnFocusRef: createRef(), 'data-extra': 'yes' } as SheetContentProps} />
      </Sheet>,
    );
    const panel = screen.getByRole('dialog');
    expect(panel).toHaveAttribute('data-extra', 'yes');
    await nextFrame();
    for (const name of ['side', 'size', 'dismissible', 'returnFocusRef', 'returnfocusref']) {
      expect(panel.hasAttribute(name)).toBe(false);
    }
    expect(errors).not.toHaveBeenCalled();
  });
});
