import { useEffect, useState, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Button } from '../button/Button';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '../dialog/Dialog';
import { Field } from '../field/Field';
import { Input } from '../input/Input';
import { exampleStory } from '../internal/example-story';
import { settleMotion } from '../internal/settle-motion';
import { storyControl, withoutControls } from '../internal/story-docs';
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
  type SheetSide,
  type SheetSize,
} from './Sheet';

const SIDES: SheetSide[] = ['right', 'left'];
const SIZES: SheetSize[] = ['sm', 'md', 'lg'];

interface DemoArgs {
  side: SheetSide;
  size: SheetSize;
  dismissible: boolean;
  onOpenChange: (open: boolean) => void;
}

const meta: Meta<DemoArgs> = {
  title: 'Overlays/Sheet',
  component: Sheet,
  subcomponents: { SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetBody, SheetFooter, SheetClose },
  // Overlays opened at mount, autofocus and history changes would take over the Docs page if the stories
  // were rendered inline: each story gets its own iframe there.
  parameters: { layout: 'fullscreen', docs: { story: { inline: false, height: '360px' } } },
  argTypes: {
    onOpenChange: { control: false },
    // Set by the stories (a trigger opens the sheet; the content is the demo).
    ...withoutControls('open', 'defaultOpen', 'children'),
    // Props of `SheetContent` (see its tab), driven from the main table.
    side: storyControl({ control: 'radio', options: SIDES, description: 'Prop of `SheetContent` (see its tab): the edge the panel is attached to.' }),
    size: storyControl({ control: 'radio', options: SIZES, description: 'Prop of `SheetContent` (see its tab): width step.' }),
    dismissible: storyControl({ control: 'boolean', description: 'Prop of `SheetContent` (see its tab): whether Escape and a click on the backdrop close the sheet.' }),
  },
  args: { side: 'right', size: 'md', dismissible: true, onOpenChange: fn() },
};

export default meta;
type Story = StoryObj<DemoArgs>;

/** Page content behind the sheet, so that the backdrop and the inert state are visible. */
function Page({ children }: { children?: ReactNode }) {
  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif', fontSize: 14, minHeight: 360, boxSizing: 'border-box' }}>
      <h1 style={{ margin: '0 0 8px', fontSize: 20 }}>Suppliers</h1>
      <p style={{ margin: '0 0 16px', maxWidth: 480 }}>
        The page under the sheet: while it is open it cannot be reached by keyboard or by screen readers.
      </p>
      {children}
    </main>
  );
}

const LONG = Array.from({ length: 30 }, (_, i) => (
  <p key={i} style={{ margin: '0 0 12px' }}>
    Row {i + 1}: supply conditions, payment terms and internal notes that take up enough space to
    make the sheet body scroll while the header and footer stay visible.
  </p>
));

function Panel({
  side,
  size,
  dismissible,
  children,
}: Pick<DemoArgs, 'side' | 'size' | 'dismissible'> & { children?: ReactNode }) {
  return (
    <SheetContent side={side} size={size} dismissible={dismissible}>
      <SheetHeader>
        <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
          <SheetTitle>Supplier detail</SheetTitle>
          <SheetDescription>View and edit the supplier details.</SheetDescription>
        </div>
        <SheetClose />
      </SheetHeader>
      <SheetBody>{children ?? <p style={{ margin: 0 }}>Sheet content, {side}, size {size}.</p>}</SheetBody>
      <SheetFooter>
        <SheetClose asChild>
          <Button variant="ghost">Cancel</Button>
        </SheetClose>
        <SheetClose asChild>
          <Button variant="primary">Save</Button>
        </SheetClose>
      </SheetFooter>
    </SheetContent>
  );
}

/**
 * Copy-paste example: a button opens a side sheet with a title, a description, a body and Cancel / Save; focus stays inside until it closes and returns to the button.
 */
export const Example: Story = {
  tags: ['example', '!visual'],
  ...exampleStory('Sheet.example.tsx'),
};

/**
 * Controls: `side`, `size` and `dismissible`; `onOpenChange` appears in Actions. The play function
 * opens it from the trigger, checks that it is attached to the chosen edge and as tall as the
 * viewport, that Tab stays inside, and that Escape closes it with the focus back on the trigger.
 */
export const Playground: Story = {
  tags: ['playground'],
  render: ({ side, size, dismissible, onOpenChange }) => (
    <Page>
      <Sheet onOpenChange={onOpenChange}>
        <SheetTrigger asChild>
          <Button variant="primary">Open</Button>
        </SheetTrigger>
        <Panel side={side} size={size} dismissible={dismissible} />
      </Sheet>
    </Page>
  ),
  play: async ({ args, canvasElement }) => {
    const trigger = within(canvasElement).getByRole('button', { name: 'Open' });
    await userEvent.click(trigger);
    const body = within(document.body);
    const sheet = await body.findByRole('dialog', { name: 'Supplier detail' });
    await expect(sheet).toHaveAttribute('aria-modal', 'true');
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(true);
    await settleMotion(); // measure the final state, not a frame of the slide-in
    const box = sheet.getBoundingClientRect();
    await expect(box.top).toBe(0);
    await expect(box.height).toBe(window.innerHeight);
    if (args.side === 'right') await expect(box.right).toBe(window.innerWidth);
    else await expect(box.left).toBe(0);
    for (let i = 0; i < 6; i += 1) {
      await userEvent.tab();
      await expect(sheet).toContainElement(document.activeElement as HTMLElement);
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

// The visual stories share render and play; their `tags` are written out literally in each story
// (Storybook reads them statically).
const renderOpen: Story['render'] = ({ side, size, dismissible, onOpenChange }) => (
  <Page>
    <Sheet defaultOpen onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button variant="primary">Open</Button>
      </SheetTrigger>
      <Panel side={side} size={size} dismissible={dismissible} />
    </Sheet>
  </Page>
);

const playOpen: Story['play'] = async ({ args }) => {
  const sheet = await within(document.body).findByRole('dialog', { name: 'Supplier detail' });
  await settleMotion();
  const box = sheet.getBoundingClientRect();
  await expect(box.width).toBeLessThanOrEqual(window.innerWidth);
  if (args.side === 'right') await expect(box.right).toBe(window.innerWidth);
  else await expect(box.left).toBe(0);
};

/** Attached to the left edge, shown open (the right edge is the default: see the size stories). */
export const Left: Story = { tags: ['visual'], args: { side: 'left' }, render: renderOpen, play: playOpen };
/** `sm`: 352px wide at desktop width. */
export const SizeSm: Story = { tags: ['visual'], args: { size: 'sm' }, render: renderOpen, play: playOpen };
/** `md` (default), on the right edge (default): 480px. */
export const SizeMd: Story = { tags: ['visual'], args: { size: 'md' }, render: renderOpen, play: playOpen };
/** `lg`: 672px; on a narrower viewport it takes the whole width and never overflows. */
export const SizeLg: Story = { tags: ['visual'], args: { size: 'lg' }, render: renderOpen, play: playOpen };

/** Long content: only `SheetBody` scrolls; header and footer stay put and the page is locked. */
export const LongContent: Story = {
  tags: ['visual'],
  render: ({ side, size, dismissible, onOpenChange }) => (
    <Page>
      <Sheet defaultOpen onOpenChange={onOpenChange}>
        <Panel side={side} size={size} dismissible={dismissible}>
          {LONG}
        </Panel>
      </Sheet>
    </Page>
  ),
  play: async () => {
    const sheet = await within(document.body).findByRole('dialog');
    await settleMotion();
    const scroller = sheet.querySelector<HTMLElement>('[tabindex="0"]');
    await expect(scroller).not.toBeNull();
    await expect(scroller!.scrollHeight).toBeGreaterThan(scroller!.clientHeight);
    scroller!.scrollTop = scroller!.scrollHeight;
    await expect(within(sheet).getByRole('button', { name: 'Save' })).toBeVisible();
    await expect(within(sheet).getByRole('heading', { name: 'Supplier detail' })).toBeVisible();
  },
};

/**
 * Opened from application state with no `SheetTrigger`: the same modal semantics, focus trap and
 * focus return as the trigger path.
 */
export const ExternalState: Story = {
  render: ({ side, size, dismissible, onOpenChange }) => {
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
            Open from state
          </Button>
          <Sheet
            open={open}
            onOpenChange={(next) => {
              setOpen(next);
              onOpenChange(next);
            }}
          >
            <Panel side={side} size={size} dismissible={dismissible} />
          </Sheet>
        </Page>
      );
    }
    return <Host />;
  },
  play: async ({ args, canvasElement }) => {
    const opener = within(canvasElement).getByRole('button', { name: 'Open from state' });
    await userEvent.click(opener);
    const body = within(document.body);
    const sheet = await body.findByRole('dialog', { name: 'Supplier detail' });
    await expect(sheet).toHaveAttribute('aria-modal', 'true');
    await expect(body.queryByRole('button', { name: 'Open from state' })).toBeNull();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull());
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(false);
    await waitFor(() => expect(opener).toHaveFocus());
  },
};

/** `dismissible={false}`: Escape and a click on the backdrop do nothing; only a button closes it. */
export const NotDismissible: Story = {
  args: { dismissible: false },
  render: renderOpen,
  play: async ({ args }) => {
    const body = within(document.body);
    await body.findByRole('dialog', { name: 'Supplier detail' });
    await userEvent.keyboard('{Escape}');
    await userEvent.click(document.body.querySelector('.z-rop-overlay') as HTMLElement);
    await expect(body.getByRole('dialog')).toBeInTheDocument();
    await expect(args.onOpenChange).not.toHaveBeenCalled();
  },
};

function overADialog(sheetOpen: boolean): Story['render'] {
  return ({ side, size, dismissible }) => (
    <Page>
      <Dialog defaultOpen>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Supplier</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Sheet defaultOpen={sheetOpen}>
              <SheetTrigger asChild>
                <Button>Open the detail</Button>
              </SheetTrigger>
              <Panel side={side} size={size} dismissible={dismissible} />
            </Sheet>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </Page>
  );
}

/**
 * A sheet open above a dialog (both are on the modal level, the later one in the DOM wins): the
 * sheet's panel and backdrop cover the dialog.
 */
export const OverADialog: Story = {
  tags: ['visual'],
  render: overADialog(true),
  play: async () => {
    const sheet = await within(document.body).findByRole('dialog', { name: 'Supplier detail' });
    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]');
    await expect(dialog).not.toBe(sheet);
    // Hit-testing waits for the second layer to settle (Radix sets `pointer-events` after the mount).
    await waitFor(() => {
      const box = sheet.getBoundingClientRect();
      expect(sheet.contains(document.elementFromPoint(box.left + 8, box.top + 8))).toBe(true);
    });
    // Where the dialog is drawn, the topmost element is the sheet's layer, not the dialog.
    const d = dialog!.getBoundingClientRect();
    await expect(dialog!.contains(document.elementFromPoint(d.left + d.width / 2, d.top + 8))).toBe(false);
  },
};

/**
 * The same, opened from a button inside the dialog: Escape closes only the sheet and the focus goes
 * back to that button; a second Escape closes the dialog.
 */
export const OverADialogFromButton: Story = {
  render: overADialog(false),
  play: async () => {
    const body = within(document.body);
    await userEvent.click(await body.findByRole('button', { name: 'Open the detail' }));
    await body.findByRole('dialog', { name: 'Supplier detail' });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(body.queryByRole('dialog', { name: 'Supplier detail' })).toBeNull());
    await expect(body.getByRole('dialog', { name: 'Supplier' })).toBeInTheDocument();
    await waitFor(() => expect(body.getByRole('button', { name: 'Open the detail' })).toHaveFocus());
  },
};

/** A form inside: on a phone the sheet follows the visual viewport, so the keyboard does not cover the field. */
export const WithForm: Story = {
  render: ({ side, size, dismissible }) => (
    <Page>
      <Sheet defaultOpen>
        <Panel side={side} size={size} dismissible={dismissible}>
          <Field label="Company name">
            <Input />
          </Field>
        </Panel>
      </Sheet>
    </Page>
  ),
  play: async () => {
    const field = await within(document.body).findByRole('textbox', { name: 'Company name' });
    await userEvent.type(field, 'Acme Corp');
    await expect(field).toHaveValue('Acme Corp');
  },
};
