import { useEffect, useState, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Button } from '../button/Button';
import { Field } from '../field/Field';
import { Input } from '../input/Input';
import { settleMotion } from '../internal/settle-motion';
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
  type DialogSize,
} from './Dialog';

const SIZES: DialogSize[] = ['sm', 'md', 'lg', 'xl'];

interface DemoArgs {
  size: DialogSize;
  dismissible: boolean;
  onOpenChange: (open: boolean) => void;
}

const meta: Meta<DemoArgs> = {
  title: 'Overlays/Dialog',
  parameters: { layout: 'fullscreen' },
  argTypes: {
    size: { control: 'radio', options: SIZES },
    dismissible: { control: 'boolean' },
    onOpenChange: { control: false },
  },
  args: { size: 'md', dismissible: true, onOpenChange: fn() },
};

export default meta;
type Story = StoryObj<DemoArgs>;

/** Page content behind the dialog, so that the backdrop and the inert state are visible. */
function Page({ children }: { children?: ReactNode }) {
  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif', fontSize: 14, minHeight: 360 }}>
      <h1 style={{ margin: '0 0 8px', fontSize: 20 }}>Fornitori</h1>
      <p style={{ margin: '0 0 16px', maxWidth: 480 }}>
        La pagina sotto il dialog: mentre è aperto non è raggiungibile da tastiera né dagli screen reader.
      </p>
      {children}
    </main>
  );
}

const LONG = Array.from({ length: 24 }, (_, i) => (
  <p key={i} style={{ margin: '0 0 12px' }}>
    Riga {i + 1}: condizioni di fornitura, termini di pagamento e note interne che occupano abbastanza spazio da
    far scorrere il corpo del dialog mentre intestazione e piè di pagina restano visibili.
  </p>
));

function Panel({
  size,
  dismissible,
  className,
  children,
  footer,
}: {
  size: DialogSize;
  dismissible: boolean;
  className?: string;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <DialogContent size={size} dismissible={dismissible} className={className}>
      <DialogHeader>
        <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
          <DialogTitle>Modifica fornitore</DialogTitle>
          <DialogDescription>Aggiorna i dati anagrafici e salva.</DialogDescription>
        </div>
        <DialogClose />
      </DialogHeader>
      <DialogBody>{children ?? <p style={{ margin: 0 }}>Contenuto del dialog, size {size}.</p>}</DialogBody>
      <DialogFooter>
        {footer ?? (
          <>
            <DialogClose asChild>
              <Button variant="ghost">Annulla</Button>
            </DialogClose>
            <DialogClose asChild>
              <Button variant="primary">Salva</Button>
            </DialogClose>
          </>
        )}
      </DialogFooter>
    </DialogContent>
  );
}

/**
 * Controls: `size` and `dismissible`; `onOpenChange` appears in Actions. The play function opens it
 * from the trigger, checks the modal semantics and the focus trap (Tab cycles inside), closes it with
 * Escape and checks the focus is back on the trigger.
 */
export const Playground: Story = {
  render: ({ size, dismissible, onOpenChange }) => (
    <Page>
      <Dialog onOpenChange={onOpenChange}>
        <DialogTrigger asChild>
          <Button variant="primary">Apri</Button>
        </DialogTrigger>
        <Panel size={size} dismissible={dismissible} />
      </Dialog>
    </Page>
  ),
  play: async ({ args, canvasElement }) => {
    const trigger = within(canvasElement).getByRole('button', { name: 'Apri' });
    await userEvent.click(trigger);
    const body = within(document.body);
    const dialog = await body.findByRole('dialog', { name: 'Modifica fornitore' });
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(true);
    // Tab stays inside: after more presses than there are controls, the focus is still in the dialog.
    for (let i = 0; i < 6; i += 1) {
      await userEvent.tab();
      await expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    if (args.dismissible) {
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(body.queryByRole('dialog')).toBeNull());
      await expect(args.onOpenChange).toHaveBeenLastCalledWith(false);
      await waitFor(() => expect(trigger).toHaveFocus());
    } else {
      await userEvent.keyboard('{Escape}');
      await expect(body.getByRole('dialog')).toBeInTheDocument();
      await expect(args.onOpenChange).toHaveBeenCalledTimes(1);
    }
  },
};

// The four size stories share render and play. Their `tags` are written out literally in each story:
// Storybook reads them statically, a story built by a function call would not be tagged `visual`.
const renderOpen: Story['render'] = ({ size, dismissible, onOpenChange }) => (
  <Page>
    <Dialog defaultOpen onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="primary">Apri</Button>
      </DialogTrigger>
      <Panel size={size} dismissible={dismissible} />
    </Dialog>
  </Page>
);

const playOpen: Story['play'] = async () => {
  const dialog = await within(document.body).findByRole('dialog', { name: 'Modifica fornitore' });
  await settleMotion(); // measure the final state, not a frame of the entry
  await expect(dialog.getBoundingClientRect().width).toBeLessThanOrEqual(window.innerWidth);
};

/** `sm`: maximum width 400px. Shown open (all four sizes have their own visual story). */
export const SizeSm: Story = { tags: ['visual'], args: { size: 'sm' }, render: renderOpen, play: playOpen };
/** `md` (default): maximum width 560px. */
export const SizeMd: Story = { tags: ['visual'], args: { size: 'md' }, render: renderOpen, play: playOpen };
/** `lg`: maximum width 720px. */
export const SizeLg: Story = { tags: ['visual'], args: { size: 'lg' }, render: renderOpen, play: playOpen };
/** `xl`: maximum width 960px; on a narrower viewport it shrinks to the viewport minus 16px per side. */
export const SizeXl: Story = { tags: ['visual'], args: { size: 'xl' }, render: renderOpen, play: playOpen };

/** Long content: only `DialogBody` scrolls; header and footer stay put and the page is locked. */
export const LongContent: Story = {
  tags: ['visual'],
  render: ({ size, dismissible, onOpenChange }) => (
    <Page>
      <Dialog defaultOpen onOpenChange={onOpenChange}>
        <Panel size={size} dismissible={dismissible}>
          {LONG}
        </Panel>
      </Dialog>
    </Page>
  ),
  play: async () => {
    const dialog = await within(document.body).findByRole('dialog');
    await settleMotion();
    const scroller = dialog.querySelector<HTMLElement>('[tabindex="0"]');
    await expect(scroller).not.toBeNull();
    await expect(scroller!.scrollHeight).toBeGreaterThan(scroller!.clientHeight);
    await expect(dialog.getBoundingClientRect().height).toBeLessThanOrEqual(window.innerHeight);
    scroller!.scrollTop = scroller!.scrollHeight;
    await expect(within(dialog).getByRole('button', { name: 'Salva' })).toBeVisible();
  },
};

/** A wide table scrolls horizontally inside `DialogBody`; the dialog does not widen. */
export const WideTable: Story = {
  tags: ['visual'],
  args: { size: 'sm' },
  render: ({ size, dismissible, onOpenChange }) => (
    <Page>
      <Dialog defaultOpen onOpenChange={onOpenChange}>
        <Panel size={size} dismissible={dismissible}>
          <table style={{ borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
            <tbody>
              {Array.from({ length: 4 }, (_, r) => (
                <tr key={r}>
                  {Array.from({ length: 12 }, (_, c) => (
                    <td key={c} style={{ border: '1px solid #c4cdd6', padding: '4px 12px' }}>
                      R{r + 1}C{c + 1}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </Dialog>
    </Page>
  ),
  play: async ({ args }) => {
    const dialog = await within(document.body).findByRole('dialog');
    await settleMotion();
    await expect(args.size).toBe('sm');
    await expect(dialog.getBoundingClientRect().width).toBeLessThanOrEqual(400);
  },
};

/**
 * Opened from application state with no `DialogTrigger`: the same modal semantics, focus trap and
 * focus return as the trigger path. The page button here (or the `o` key) opens it; closing returns
 * the focus to whatever had it before.
 */
export const ExternalState: Story = {
  render: ({ size, dismissible, onOpenChange }) => {
    function Host() {
      const [open, setOpen] = useState(false);
      useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
          if (event.key === 'o' && !(event.target instanceof HTMLInputElement)) setOpen(true);
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
      }, []);
      return (
        <Page>
          <Button variant="primary" onClick={() => setOpen(true)}>
            Apri da stato
          </Button>
          <Dialog
            open={open}
            onOpenChange={(next) => {
              setOpen(next);
              onOpenChange(next);
            }}
          >
            <Panel size={size} dismissible={dismissible} />
          </Dialog>
        </Page>
      );
    }
    return <Host />;
  },
  play: async ({ args, canvasElement }) => {
    const opener = within(canvasElement).getByRole('button', { name: 'Apri da stato' });
    await userEvent.click(opener);
    const body = within(document.body);
    const dialog = await body.findByRole('dialog', { name: 'Modifica fornitore' });
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    // The rest of the page is out of the accessibility tree while it is open.
    await expect(body.queryByRole('button', { name: 'Apri da stato' })).toBeNull();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull());
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(false);
    await waitFor(() => expect(opener).toHaveFocus());
  },
};

/** Same as the external-state story, but mounted open (no opener existed): shown for the screenshot. */
export const ExternalStateOpen: Story = {
  tags: ['visual'],
  render: ({ size, dismissible, onOpenChange }) => (
    <Page>
      <Button variant="primary">Apri da stato</Button>
      <Dialog open onOpenChange={onOpenChange}>
        <Panel size={size} dismissible={dismissible} />
      </Dialog>
    </Page>
  ),
};

/**
 * `dismissible={false}`: Escape and a click on the backdrop do nothing; only an explicit button
 * closes it. For dialogs that require a choice. The play function proves both: the dialog is still open.
 */
export const NotDismissible: Story = {
  tags: ['visual'],
  args: { dismissible: false },
  render: ({ size, dismissible, onOpenChange }) => (
    <Page>
      <Dialog defaultOpen onOpenChange={onOpenChange}>
        <DialogContent size={size} dismissible={dismissible}>
          <DialogHeader>
            <DialogTitle>Eliminare il fornitore?</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <DialogDescription>Devi scegliere: Escape e clic fuori non chiudono questo dialog.</DialogDescription>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Annulla</Button>
            </DialogClose>
            <DialogClose asChild>
              <Button variant="danger">Elimina</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  ),
  play: async ({ args }) => {
    const body = within(document.body);
    await body.findByRole('dialog', { name: 'Eliminare il fornitore?' });
    await userEvent.keyboard('{Escape}');
    await userEvent.click(document.body.querySelector('.z-rop-overlay') as HTMLElement);
    await expect(body.getByRole('dialog')).toBeInTheDocument();
    await expect(args.onOpenChange).not.toHaveBeenCalled();
    // Left open on purpose (it is also photographed); `e2e/dialog.spec.ts` closes it with a button.
  },
};

/** Nested dialogs: Escape closes only the top one and the focus goes back to the button inside the first. */
export const Nested: Story = {
  render: ({ size, dismissible }) => (
    <Page>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="primary">Apri</Button>
        </DialogTrigger>
        <DialogContent size={size} dismissible={dismissible}>
          <DialogHeader>
            <DialogTitle>Primo dialog</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Dialog>
              <DialogTrigger asChild>
                <Button>Apri il secondo</Button>
              </DialogTrigger>
              <DialogContent size="sm">
                <DialogHeader>
                  <DialogTitle>Secondo dialog</DialogTitle>
                </DialogHeader>
                <DialogBody>Sopra il primo.</DialogBody>
              </DialogContent>
            </Dialog>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </Page>
  ),
  play: async ({ canvasElement }) => {
    const body = within(document.body);
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Apri' }));
    await body.findByRole('dialog', { name: 'Primo dialog' });
    const second = await (async () => {
      await userEvent.click(body.getByRole('button', { name: 'Apri il secondo' }));
      return body.findByRole('dialog', { name: 'Secondo dialog' });
    })();
    await expect(second).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(body.queryByRole('dialog', { name: 'Secondo dialog' })).toBeNull());
    await expect(body.getByRole('dialog', { name: 'Primo dialog' })).toBeInTheDocument();
    await waitFor(() => expect(body.getByRole('button', { name: 'Apri il secondo' })).toHaveFocus());
  },
};

/**
 * A `className` that conflicts with the width of the `size` wins (`max-w-[25rem]` over `lg`). The
 * class is one the stylesheet already generates: this story file is not scanned for utilities.
 */
export const ClassOverride: Story = {
  args: { size: 'lg' },
  render: ({ size, dismissible }) => (
    <Page>
      <Dialog defaultOpen>
        <Panel size={size} dismissible={dismissible} className="max-w-[25rem]" />
      </Dialog>
    </Page>
  ),
  play: async () => {
    const dialog = await within(document.body).findByRole('dialog');
    await settleMotion();
    await expect(Math.round(dialog.getBoundingClientRect().width)).toBeLessThanOrEqual(400);
  },
};

/**
 * Unmounted while open (press `u`): the scroll lock and the `aria-hidden` on the page are removed,
 * no inert page is left behind. No play function: the interaction destroys the state it starts
 * from, so `e2e/dialog.spec.ts` drives it (and asserts the cleanup) instead.
 */
export const UnmountWhileOpen: Story = {
  render: ({ size, dismissible }) => {
    function Host() {
      const [mounted, setMounted] = useState(true);
      useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
          if (event.key === 'u') setMounted(false);
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
      }, []);
      return (
        <Page>
          <Button>Pulsante della pagina</Button>
          {mounted && (
            <Dialog defaultOpen>
              <Panel size={size} dismissible={dismissible} />
            </Dialog>
          )}
        </Page>
      );
    }
    return <Host />;
  },
};

/** A form inside: on a phone the dialog follows the visual viewport, so the keyboard does not cover the field. */
export const WithForm: Story = {
  render: ({ size, dismissible }) => (
    <Page>
      <Dialog defaultOpen>
        <Panel size={size} dismissible={dismissible}>
          <Field label="Ragione sociale">
            <Input />
          </Field>
        </Panel>
      </Dialog>
    </Page>
  ),
  play: async () => {
    const field = await within(document.body).findByRole('textbox', { name: 'Ragione sociale' });
    await userEvent.type(field, 'Rossi S.r.l.');
    await expect(field).toHaveValue('Rossi S.r.l.');
  },
};

/**
 * A chain: "Continua" closes the first dialog and opens a second one in the same handler, and the
 * second has a field that takes the focus at once. The first one animates out while the second is
 * already open: its delayed focus return must not pull the focus away from the second (it would
 * select the text typed in the field). The play function types straight after the click.
 */
export const Chained: Story = {
  render: ({ size, dismissible }) => {
    function Host() {
      const [first, setFirst] = useState(false);
      const [second, setSecond] = useState(false);
      return (
        <Page>
          <Button variant="primary" onClick={() => setFirst(true)}>
            Apri la procedura
          </Button>
          <Dialog open={first} onOpenChange={setFirst}>
            <DialogContent size={size} dismissible={dismissible}>
              <DialogHeader>
                <DialogTitle>Passo uno</DialogTitle>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="primary"
                  onClick={() => {
                    setFirst(false);
                    setSecond(true);
                  }}
                >
                  Continua
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={second} onOpenChange={setSecond}>
            <DialogContent size={size} dismissible={dismissible}>
              <DialogHeader>
                <DialogTitle>Passo due</DialogTitle>
              </DialogHeader>
              <DialogBody>
                <Field label="Nome">
                  {/* eslint-disable-next-line jsx-a11y/no-autofocus -- the autoFocus field is the case under test */}
                  <Input autoFocus />
                </Field>
              </DialogBody>
            </DialogContent>
          </Dialog>
        </Page>
      );
    }
    return <Host />;
  },
  play: async ({ canvasElement }) => {
    const opener = within(canvasElement).getByRole('button', { name: 'Apri la procedura' });
    await userEvent.click(opener);
    const body = within(document.body);
    await userEvent.click(await body.findByRole('button', { name: 'Continua' }));
    // From here on the first dialog's opener must never get the focus back: the second one has it.
    let bounced = false;
    opener.addEventListener('focus', () => {
      bounced = true;
    });
    const field = await body.findByRole('textbox', { name: 'Nome' });
    await expect(field).toHaveFocus();
    await userEvent.keyboard('Mario');
    await waitFor(() => expect(body.queryByRole('dialog', { name: 'Passo uno' })).toBeNull(), { timeout: 5000 });
    await settleMotion();
    // One more frame: the (skipped) focus return of the first dialog is scheduled after its unmount.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await expect(bounced).toBe(false);
    await expect(field).toHaveFocus();
    await userEvent.keyboard('X');
    await expect(field).toHaveValue('MarioX');
  },
};
