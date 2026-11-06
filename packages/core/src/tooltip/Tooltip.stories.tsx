import { forwardRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Button } from '../button/Button';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../dialog/Dialog';
import { internalIcons } from '../internal/icons';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '../sheet/Sheet';
import { Tooltip, TooltipProvider, type TooltipAlign, type TooltipSide } from './Tooltip';

const SIDES: TooltipSide[] = ['top', 'right', 'bottom', 'left'];
const ALIGNS: TooltipAlign[] = ['start', 'center', 'end'];

interface DemoArgs {
  content: string;
  side: TooltipSide;
  align: TooltipAlign;
  delayDuration: number;
  onOpenChange: (open: boolean) => void;
  // Only the Playground has these controls.
  sideOffset?: number;
  disabled?: boolean;
  disabledTriggerFocusable?: boolean;
}

// The meta controls of the props a story does not wire up are hidden there, so no control in the
// panel does nothing.
const ONLY_DELAY = { controls: { exclude: ['content', 'side', 'align'] } };
// `exclude` is ignored for a story whose `render` takes no args, so these use `disable`.
const NO_CONTROLS = { controls: { disable: true } };

const meta: Meta<DemoArgs> = {
  title: 'Overlays/Tooltip',
  // The stories drive the component through a demo wrapper (`Meta<...Args>`): `never` keeps the docs
  // props table of the real component without forcing the wrapper's args to match its props.
  component: Tooltip as never,
  parameters: { layout: 'fullscreen' },
  argTypes: {
    content: { control: 'text' },
    side: { control: 'radio', options: SIDES },
    align: { control: 'radio', options: ALIGNS },
    delayDuration: { control: { type: 'number', min: 0, step: 100 } },
    onOpenChange: { control: false },
  },
  args: { content: 'Elimina riga', side: 'top', align: 'center', delayDuration: 500, onOpenChange: fn() },
  // Optional in the library (a `Tooltip` supplies its own); here it is shared like in an app.
  decorators: [(Story) => <TooltipProvider>{Story()}</TooltipProvider>],
};

export default meta;
type Story = StoryObj<DemoArgs>;

const PAGE: CSSProperties = { padding: 48, fontFamily: 'system-ui, sans-serif', fontSize: 14, minHeight: 360 };

function Page({ children, style }: { children?: ReactNode; style?: CSSProperties }) {
  return <main style={{ ...PAGE, ...style }}>{children}</main>;
}

// Forwards its props and ref: a `Tooltip` trigger (`asChild`) hands its handlers to this component,
// which must put them on the button.
const TrashButton = forwardRef<HTMLButtonElement, { label?: string } & ButtonHTMLAttributes<HTMLButtonElement>>(
  function TrashButton({ label = 'Elimina riga', ...rest }, ref) {
    return <Button {...rest} ref={ref} size="icon-sm" aria-label={label} leadingIcon={internalIcons.error} />;
  },
);

/**
 * Ends a play function that hovered: the pointer leaves the trigger (which also resets Radix's
 * "already opened by this hover" flag), nothing is left open and nothing keeps the focus. Tests
 * that drive the real mouse and keyboard after the play start from this state.
 */
async function settle(trigger: HTMLElement) {
  await userEvent.unhover(trigger);
  await userEvent.hover(document.body);
  (document.activeElement as HTMLElement | null)?.blur();
  await waitFor(() => expect(within(document.body).queryByRole('tooltip')).toBeNull());
}

/**
 * Controls: every prop (`content`, `side`, `align`, `sideOffset`, `delayDuration`, plus `disabled`
 * and `disabledTriggerFocusable` on the trigger); `onOpenChange` appears in Actions. The play
 * function follows what the controls say: it hovers the icon-only button (the tooltip opens after
 * the delay and describes the button) and checks that Escape closes it; with an empty `content`, or a
 * disabled trigger, it checks that nothing opens (or, with `disabledTriggerFocusable`, that Tab does).
 */
export const Playground: Story = {
  args: { sideOffset: 6, disabled: false, disabledTriggerFocusable: false },
  argTypes: {
    sideOffset: { control: { type: 'number', min: 0, max: 24, step: 2 } },
    disabled: { control: 'boolean' },
    disabledTriggerFocusable: { control: 'boolean' },
  },
  render: ({ content, side, align, sideOffset, delayDuration, disabled, disabledTriggerFocusable, onOpenChange }) => (
    <Page>
      <Tooltip
        content={content}
        side={side}
        align={align}
        sideOffset={sideOffset}
        delayDuration={delayDuration}
        disabledTriggerFocusable={disabledTriggerFocusable}
        onOpenChange={onOpenChange}
      >
        <TrashButton disabled={disabled} />
      </Tooltip>
    </Page>
  ),
  play: async ({ args, canvasElement }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Elimina riga' });
    await expect(within(document.body).queryByRole('tooltip')).toBeNull();
    if (!args.content.trim() || (args.disabled && !args.disabledTriggerFocusable)) {
      await userEvent.hover(button);
      await userEvent.tab();
      await new Promise((resolve) => setTimeout(resolve, args.delayDuration + 150));
      await expect(within(document.body).queryByRole('tooltip')).toBeNull();
      await expect(button).not.toHaveAttribute('aria-describedby');
      await settle(button);
      return;
    }
    if (args.disabled) {
      await userEvent.tab();
      await expect(await within(document.body).findByRole('tooltip')).toHaveTextContent(args.content);
      await settle(button);
      return;
    }
    await userEvent.hover(button);
    const tooltip = await within(document.body).findByRole('tooltip', undefined, { timeout: 3000 });
    await expect(tooltip).toHaveTextContent(args.content);
    await expect(button).toHaveAttribute('aria-describedby', tooltip.id);
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(true);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(within(document.body).queryByRole('tooltip')).toBeNull());
    await expect(button).not.toHaveAttribute('aria-describedby');
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(false);
    await settle(button);
  },
};

/**
 * The four sides at once, held open with the controlled `open` prop so that one screenshot shows
 * them (a consumer using `open` must not open it at mount: here it is a fixture).
 */
export const Sides: Story = {
  tags: ['visual'],
  parameters: NO_CONTROLS,
  render: () => (
    <Page style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 160, minHeight: 320 }}>
      {SIDES.map((side) => (
        <Tooltip key={side} content={`Lato ${side}`} side={side} open>
          <TrashButton label={`Lato ${side}`} />
        </Tooltip>
      ))}
    </Page>
  ),
  play: async () => {
    await waitFor(() => expect(within(document.body).getAllByRole('tooltip')).toHaveLength(4));
  },
};

/** Long text wraps inside a real maximum width (20rem), never on a single line. Opened by hover. */
export const LongText: Story = {
  tags: ['visual'],
  args: {
    content:
      'Questo fornitore ha una o più fatture in attesa di approvazione: aprire la scheda per vedere il dettaglio completo e lo storico delle modifiche.',
    delayDuration: 0,
  },
  render: ({ content, side, align, delayDuration }) => (
    <Page style={{ paddingTop: 160 }}>
      <Tooltip content={content} side={side} align={align} delayDuration={delayDuration}>
        <TrashButton label="Dettaglio" />
      </Tooltip>
    </Page>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.hover(within(canvasElement).getByRole('button', { name: 'Dettaglio' }));
    const tooltip = await within(document.body).findByRole('tooltip');
    await expect(tooltip.getBoundingClientRect().width).toBeLessThanOrEqual(320 + 1);
    await expect(tooltip.getBoundingClientRect().height).toBeGreaterThan(40);
  },
};

/**
 * A trigger flush with the right edge of the viewport: the tooltip (side `right`, then flipped) and
 * its long text stay inside the window (collision detection). Opened by hover.
 */
export const ViewportEdge: Story = {
  tags: ['visual'],
  args: { content: 'Tooltip vicino al bordo destro della finestra, con testo abbastanza lungo da andare a capo.', side: 'right', delayDuration: 0 },
  render: ({ content, side, align, delayDuration }) => (
    <Page style={{ padding: '120px 0 0', display: 'flex', justifyContent: 'flex-end' }}>
      <Tooltip content={content} side={side} align={align} delayDuration={delayDuration}>
        <TrashButton label="Bordo" />
      </Tooltip>
    </Page>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.hover(within(canvasElement).getByRole('button', { name: 'Bordo' }));
    const tooltip = await within(document.body).findByRole('tooltip');
    await waitFor(() => {
      const box = tooltip.getBoundingClientRect();
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(window.innerWidth);
    });
  },
};

/**
 * The classic bug: a dialog moves the focus to the button that has the tooltip, and the tooltip
 * pops open although nobody asked. Here it does not: nothing opens until the user hovers, or
 * leaves the button with Shift+Tab and comes back with Tab. Hover simulated at the end.
 */
export const InsideDialog: Story = {
  tags: ['visual'],
  args: { delayDuration: 0 },
  render: ({ content, side, align, delayDuration }) => (
    <Page>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="primary">Apri</Button>
        </DialogTrigger>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Elimina riga</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Tooltip content={content} side={side} align={align} delayDuration={delayDuration}>
              <TrashButton label="Elimina riga" />
            </Tooltip>
          </DialogBody>
          <DialogFooter>
            <DialogClose>Annulla</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  ),
  play: async ({ canvasElement }) => {
    const body = within(document.body);
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Apri' }));
    const trash = await body.findByRole('button', { name: 'Elimina riga' });
    await waitFor(() => expect(trash).toHaveFocus());
    await new Promise((resolve) => setTimeout(resolve, 200));
    await expect(body.queryByRole('tooltip')).toBeNull();

    await userEvent.tab({ shift: true });
    await userEvent.tab();
    await expect(trash).toHaveFocus();
    await expect(await body.findByRole('tooltip')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(body.queryByRole('tooltip')).toBeNull());
    await expect(body.getByRole('dialog', { name: 'Elimina riga' })).toBeInTheDocument();

    // The pointer arrives on the button (the modal makes the body itself non-interactive).
    await userEvent.hover(trash);
    await expect(await body.findByRole('tooltip')).toBeInTheDocument();
  },
};

/**
 * The same dialog with no play function: the starting point for end-to-end tests that drive real
 * mouse and keyboard input (a play function would open it and hover on its own).
 */
export const InsideDialogManual: Story = {
  args: { delayDuration: 0 },
  render: InsideDialog.render,
};

/**
 * A panel opened with ArrowDown (the menu-button pattern) that moves the focus to its first item, which
 * has a tooltip: the focus is the app's reaction to the key, not the user's move, so nothing opens.
 * No play function: the starting point for the end-to-end test that presses the real key.
 */
export const OpenedByArrowDown: Story = {
  args: { delayDuration: 0 },
  parameters: ONLY_DELAY,
  render: ({ delayDuration }) => {
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <Page>
          <div style={{ display: 'flex', gap: 8 }}>
            {/* A tooltip already mounted elsewhere on the page, as in any real app. */}
            <Tooltip content="Azione della pagina" delayDuration={delayDuration}>
              <TrashButton label="Azione della pagina" />
            </Tooltip>
            <Button onKeyDown={(event) => event.key === 'ArrowDown' && setOpen(true)}>Menu</Button>
          </div>
          {open && (
            <div
              role="menu"
              aria-label="Menu"
              style={{
                marginTop: 4,
                padding: 4,
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                boxShadow: '0 4px 12px rgb(0 0 0 / 0.1)',
                display: 'inline-block',
              }}
            >
              {/* side="right": a menu panel is vertically dense, there is rarely enough room above or
                  below an item for a "top"/"bottom" tooltip not to cover a neighbour (even the menu's
                  own trigger, as this story caught) — the standard fix is to open tooltips sideways. */}
              <Tooltip content="Dettaglio della voce" side="right" delayDuration={delayDuration}>
                {/* eslint-disable-next-line jsx-a11y/no-autofocus -- the autoFocus item is the case under test */}
                <Button autoFocus>Prima voce</Button>
              </Tooltip>
            </div>
          )}
        </Page>
      );
    }
    return <Host />;
  },
};

/**
 * Disabled trigger. By default a disabled control gets no tooltip (it receives no pointer or focus
 * events, so there is no gesture to react to). With `disabledTriggerFocusable` it is wrapped in a
 * focusable `span` that is the trigger and the tab stop; use it when the reason for the disabled
 * state matters. Hover the second one, or Tab to it.
 */
export const DisabledTrigger: Story = {
  args: { delayDuration: 0 },
  parameters: ONLY_DELAY,
  render: ({ delayDuration }) => (
    <Page style={{ display: 'flex', gap: 24 }}>
      <Tooltip content="Non visibile: nessun tooltip di default" delayDuration={delayDuration}>
        <Button disabled>Disattivo</Button>
      </Tooltip>
      <Tooltip content="Manca il permesso di modifica" delayDuration={delayDuration} disabledTriggerFocusable>
        <Button disabled>Disattivo con motivo</Button>
      </Tooltip>
    </Page>
  ),
  play: async ({ canvasElement }) => {
    const body = within(document.body);
    const [plain, withReason] = within(canvasElement).getAllByRole('button') as [HTMLElement, HTMLElement];
    await userEvent.hover(plain);
    await new Promise((resolve) => setTimeout(resolve, 150));
    await expect(body.queryByRole('tooltip')).toBeNull();
    await userEvent.tab();
    await expect(withReason.parentElement).toHaveFocus();
    await expect(await body.findByRole('tooltip')).toHaveTextContent('Manca il permesso di modifica');
    await settle(plain);
  },
};

/** An empty `content` renders no tooltip and no `aria-describedby`; useful for a conditional text. */
export const EmptyContent: Story = {
  args: { delayDuration: 0 },
  parameters: ONLY_DELAY,
  render: ({ delayDuration }) => (
    <Page>
      <Tooltip content="" delayDuration={delayDuration}>
        <TrashButton label="Senza testo" />
      </Tooltip>
    </Page>
  ),
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Senza testo' });
    await userEvent.hover(button);
    await userEvent.tab();
    await new Promise((resolve) => setTimeout(resolve, 150));
    await expect(within(document.body).queryByRole('tooltip')).toBeNull();
    await expect(button).not.toHaveAttribute('aria-describedby');
    await settle(button);
  },
};

/** A trigger with `autoFocus`: the page loads with the focus on it and no tooltip. */
export const AutoFocus: Story = {
  args: { delayDuration: 0 },
  render: ({ content, side, align, delayDuration }) => (
    <Page>
      <Tooltip content={content} side={side} align={align} delayDuration={delayDuration}>
        {/* eslint-disable-next-line jsx-a11y/no-autofocus -- the autoFocus trigger is the case under test */}
        <Button autoFocus>Con autofocus</Button>
      </Tooltip>
    </Page>
  ),
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Con autofocus' });
    await expect(button).toHaveFocus();
    await new Promise((resolve) => setTimeout(resolve, 200));
    await expect(within(document.body).queryByRole('tooltip')).toBeNull();
  },
};

/**
 * A toolbar of adjacent icon buttons sharing one provider: moving the pointer from one to the next
 * opens the second at once (`skipDelayDuration`) and closes the first.
 */
export const Toolbar: Story = {
  parameters: NO_CONTROLS,
  render: () => (
    <Page>
      <TooltipProvider delayDuration={600} skipDelayDuration={400}>
        <div style={{ display: 'flex', gap: 4 }}>
          {['Modifica', 'Duplica', 'Archivia'].map((label) => (
            <Tooltip key={label} content={label}>
              <TrashButton label={label} />
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>
    </Page>
  ),
  play: async ({ canvasElement }) => {
    const body = within(document.body);
    const canvas = within(canvasElement);
    await userEvent.hover(canvas.getByRole('button', { name: 'Modifica' }));
    await expect(await body.findByRole('tooltip', undefined, { timeout: 3000 })).toHaveTextContent('Modifica');
    await userEvent.unhover(canvas.getByRole('button', { name: 'Modifica' }));
    const next = canvas.getByRole('button', { name: 'Duplica' });
    await userEvent.hover(next);
    // Radix ignores the first move while the pointer is "in transit" between the two triggers: a
    // person's hand makes several, so does this.
    const box = next.getBoundingClientRect();
    await userEvent.pointer({ target: next, coords: { clientX: box.left + 6, clientY: box.top + 6 } });
    await waitFor(() => expect(body.getByRole('tooltip')).toHaveTextContent('Duplica'), { timeout: 400 });
    await expect(body.getAllByRole('tooltip')).toHaveLength(1);
    await settle(canvas.getByRole('button', { name: 'Duplica' }));
  },
};

/**
 * Inside a container with `overflow: hidden` and inside a `Sheet`: the tooltip is rendered in a
 * portal on `document.body`, so neither clips it.
 */
export const ClippedAndInSheet: Story = {
  args: { delayDuration: 0 },
  parameters: ONLY_DELAY,
  render: ({ delayDuration }) => (
    <Page>
      <div style={{ overflow: 'hidden', width: 80, height: 40, border: '1px solid var(--color-rop-border)', marginBottom: 24 }}>
        <Tooltip content="Non tagliato dal contenitore" delayDuration={delayDuration} side="right">
          <TrashButton label="Nel contenitore" />
        </Tooltip>
      </div>
      <Sheet>
        <SheetTrigger asChild>
          <Button>Apri sheet</Button>
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Pannello</SheetTitle>
          </SheetHeader>
          <SheetBody>
            <Tooltip content="Sopra lo sheet" delayDuration={delayDuration} side="left">
              <TrashButton label="Nello sheet" />
            </Tooltip>
          </SheetBody>
        </SheetContent>
      </Sheet>
    </Page>
  ),
  play: async ({ canvasElement }) => {
    const body = within(document.body);
    await userEvent.hover(within(canvasElement).getByRole('button', { name: 'Nel contenitore' }));
    await expect(await body.findByRole('tooltip')).toHaveTextContent('Non tagliato dal contenitore');
    await settle(within(canvasElement).getByRole('button', { name: 'Nel contenitore' }));
  },
};

/**
 * Content that changes while the tooltip is open: the text follows and the position is recomputed
 * (the tooltip stays centred on the trigger as it gets wider). Tab to the button (the tooltip opens),
 * then press `+` (long text) or `-` (short text).
 */
export const ContentChangesWhileOpen: Story = {
  args: { delayDuration: 0 },
  parameters: ONLY_DELAY,
  render: ({ delayDuration }) => {
    function Host() {
      const [long, setLong] = useState(false);
      return (
        <Page style={{ paddingTop: 120, paddingLeft: 280 }}>
          <Tooltip
            content={long ? 'Un testo molto più lungo, che cambia la larghezza del tooltip mentre è aperto' : 'Breve'}
            delayDuration={delayDuration}
          >
            <Button onKeyDown={(event) => (event.key === '+' || event.key === '-') && setLong(event.key === '+')}>
              Premi + o -
            </Button>
          </Tooltip>
        </Page>
      );
    }
    return <Host />;
  },
  play: async ({ canvasElement }) => {
    const body = within(document.body);
    const trigger = within(canvasElement).getByRole('button', { name: 'Premi + o -' });
    await userEvent.tab();
    await expect(trigger).toHaveFocus();
    await expect(await body.findByRole('tooltip')).toHaveTextContent('Breve');
    const narrow = body.getByRole('tooltip').getBoundingClientRect().width;
    await userEvent.keyboard('+');
    await waitFor(() => {
      const tooltip = body.getByRole('tooltip');
      expect(tooltip).toHaveTextContent('Un testo molto più lungo');
      const box = tooltip.getBoundingClientRect();
      const anchor = trigger.getBoundingClientRect();
      expect(box.width).toBeGreaterThan(narrow + 40);
      // Still centred on the trigger: the position was recomputed for the new size.
      expect(Math.abs(box.left + box.width / 2 - (anchor.left + anchor.width / 2))).toBeLessThan(2);
    });
    await settle(trigger);
  },
};

/** A click (or a tap) runs the button's action and closes the tooltip; the label shows the count. */
export const ClickAction: Story = {
  args: { delayDuration: 0 },
  parameters: ONLY_DELAY,
  render: ({ delayDuration }) => {
    function Host() {
      const [count, setCount] = useState(0);
      return (
        <Page>
          <Tooltip content={`Cliccato ${count} volte`} delayDuration={delayDuration}>
            <Button onClick={() => setCount((c) => c + 1)}>Conta</Button>
          </Tooltip>
          <p data-testid="count">{count}</p>
        </Page>
      );
    }
    return <Host />;
  },
  play: async ({ canvasElement }) => {
    const body = within(document.body);
    const button = within(canvasElement).getByRole('button', { name: 'Conta' });
    await userEvent.hover(button);
    await expect(await body.findByRole('tooltip')).toHaveTextContent('Cliccato 0 volte');
    await settle(button);
  },
};
