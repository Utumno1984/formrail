import { useRef, useState, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Button } from '../button/Button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../dialog/Dialog';
import { Field } from '../field/Field';
import { Input } from '../input/Input';
import { exampleStory } from '../internal/example-story';
import { settleMotion } from '../internal/settle-motion';
import { storyControl, withoutControls } from '../internal/story-docs';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../menu/Menu';
import { MessageStrip } from '../message-strip/MessageStrip';
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from '../sheet/Sheet';
import { ConfirmDialog, type ConfirmDialogTone } from './ConfirmDialog';
import { useConfirmDialog } from './use-confirm-dialog';

const TONES: ConfirmDialogTone[] = ['danger', 'default'];

interface DemoArgs {
  tone: ConfirmDialogTone;
  /** `auto`: the prop is not passed (the focus follows the tone). */
  initialFocus: 'auto' | 'cancel' | 'confirm';
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Milliseconds the simulated server round-trip of `onConfirm` takes (0: synchronous). */
  pendingMs: number;
  onConfirm: () => void;
  onCancel: () => void;
  onOpenChange: (open: boolean) => void;
}

const meta: Meta<DemoArgs> = {
  title: 'Overlays/ConfirmDialog',
  component: ConfirmDialog as never,
  // Overlays opened at mount and focus moves would take over the Docs page if rendered inline.
  parameters: { layout: 'fullscreen', docs: { story: { inline: false, height: '360px' } } },
  argTypes: {
    tone: { control: 'radio', options: TONES },
    // `auto` (story only) leaves the prop out.
    initialFocus: { control: 'radio', options: ['auto', 'cancel', 'confirm'] },
    title: { control: 'text' },
    description: { control: 'text' },
    confirmLabel: { control: 'text' },
    cancelLabel: { control: 'text' },
    onConfirm: { control: false },
    onCancel: { control: false },
    onOpenChange: { control: false },
    // Set by the demo (open state, focus return) or not used by it.
    ...withoutControls('open', 'onError', 'returnFocusRef', 'children'),
    pendingMs: storyControl({
      control: { type: 'number', min: 0, step: 100 },
      description: 'How long the simulated server round-trip of the demo\'s `onConfirm` takes, in ms (0: synchronous).',
    }),
  },
  args: {
    tone: 'danger',
    initialFocus: 'auto',
    title: 'Delete invoice 2026/0142?',
    description: 'The invoice and its 3 attachments are deleted for good. This cannot be undone.',
    confirmLabel: 'Delete invoice',
    cancelLabel: 'Cancel',
    pendingMs: 600,
    onConfirm: fn(),
    onCancel: fn(),
    onOpenChange: fn(),
  },
};

export default meta;
type Story = StoryObj<DemoArgs>;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The `initialFocus` prop for the args (`auto` = not passed). */
const initialFocusOf = (args: DemoArgs) => (args.initialFocus === 'auto' ? undefined : args.initialFocus);

/** The label of the button that must have the focus on open, for these args. */
const focusedLabel = (args: DemoArgs) =>
  (args.initialFocus === 'auto' ? args.tone === 'danger' : args.initialFocus === 'cancel') ? args.cancelLabel : args.confirmLabel;

function Page({ children }: { children?: ReactNode }) {
  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif', fontSize: 14, minHeight: 360, boxSizing: 'border-box' }}>
      <h1 style={{ margin: '0 0 8px', fontSize: 20 }}>Invoices</h1>
      <p style={{ margin: '0 0 16px', maxWidth: 480 }}>Invoice 2026/0142 · Rossi Supplies Ltd · €1,240.00</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{children}</div>
    </main>
  );
}

/** The args wired to a ConfirmDialog opened from a page button, as a consumer writes it. */
function Demo({ args, initialOpen = false, onConfirmOverride }: { args: DemoArgs; initialOpen?: boolean; onConfirmOverride?: () => Promise<void> }) {
  const [open, setOpen] = useState(initialOpen);
  const [deleted, setDeleted] = useState(0);
  return (
    <Page>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Delete…
      </Button>
      <span role="status" style={{ alignSelf: 'center' }}>
        {deleted > 0 ? `Deleted (${deleted})` : ''}
      </span>
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          args.onOpenChange(next);
          setOpen(next);
        }}
        tone={args.tone}
        initialFocus={initialFocusOf(args)}
        title={args.title}
        description={args.description}
        confirmLabel={args.confirmLabel}
        cancelLabel={args.cancelLabel}
        onCancel={args.onCancel}
        onConfirm={() => {
          args.onConfirm();
          if (onConfirmOverride) return onConfirmOverride();
          if (args.pendingMs <= 0) {
            setDeleted((n) => n + 1);
            return undefined;
          }
          return wait(args.pendingMs).then(() => setDeleted((n) => n + 1));
        }}
      />
    </Page>
  );
}

/**
 * Copy-paste example: a button opens a confirmation; Cancel (or Escape) closes it without running the action, confirming runs it. Focus returns to the button.
 */
export const Example: Story = {
  tags: ['example', '!visual'],
  ...exampleStory('ConfirmDialog.example.tsx'),
};

/**
 * Controls: tone, texts and `pendingMs` (the simulated server round-trip of `onConfirm`);
 * `onConfirm`, `onCancel` and `onOpenChange` appear in Actions. The play function opens it, checks
 * that the focus is on Cancel (the safe choice of a `danger` confirmation), clicks "Delete invoice"
 * twice (one call only), presses Escape while it waits (no effect), then checks that it closed and
 * the focus is back on the opener.
 */
export const DeleteWithServerRoundTrip: Story = {
  tags: ['playground'],
  render: (args) => <Demo args={args} />,
  play: async ({ args, canvasElement }) => {
    const opener = within(canvasElement).getByRole('button', { name: 'Delete…' });
    await userEvent.click(opener);
    const body = within(document.body);
    const dialog = await body.findByRole('dialog', { name: args.title });
    await expect(dialog).toHaveAccessibleDescription(args.description);
    // The safe choice has the focus: Cancel for a danger confirmation, the confirm button otherwise
    // (or the button `initialFocus` names).
    await waitFor(() => expect(within(dialog).getByRole('button', { name: focusedLabel(args) })).toHaveFocus());

    const confirm = within(dialog).getByRole('button', { name: args.confirmLabel });
    await userEvent.dblClick(confirm);
    await expect(args.onConfirm).toHaveBeenCalledTimes(1);
    if (args.pendingMs > 0) {
      await expect(confirm).toHaveAttribute('aria-disabled', 'true');
      await userEvent.keyboard('{Escape}');
      await expect(body.getByRole('dialog', { name: args.title })).toBeInTheDocument();
      await expect(args.onCancel).not.toHaveBeenCalled();
    }
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull(), { timeout: args.pendingMs + 3000 });
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(false);
    await expect(args.onConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(opener).toHaveFocus());
  },
};

/**
 * The server refuses: `onConfirm` rejects, the dialog stays open and interactive, the focus stays on
 * the confirm button, and `onError` puts the message in the dialog (the error is never swallowed).
 */
export const ServerError: Story = {
  args: { pendingMs: 300 },
  render: (args) => {
    function Host() {
      const [open, setOpen] = useState(false);
      const [error, setError] = useState<string | null>(null);
      return (
        <Page>
          <Button variant="danger" onClick={() => setOpen(true)}>
            Delete…
          </Button>
          <ConfirmDialog
            open={open}
            onOpenChange={(next) => {
              args.onOpenChange(next);
              setOpen(next);
              if (!next) setError(null);
            }}
            tone={args.tone}
            initialFocus={initialFocusOf(args)}
            title={args.title}
            description={args.description}
            confirmLabel={args.confirmLabel}
            cancelLabel={args.cancelLabel}
            onCancel={args.onCancel}
            onConfirm={() => {
              args.onConfirm();
              setError(null);
              return wait(args.pendingMs).then(() => Promise.reject(new Error('The invoice is already paid and cannot be deleted.')));
            }}
            onError={(e) => setError(e instanceof Error ? e.message : String(e))}
          >
            {error ? (
              <MessageStrip tone="error" style={{ marginTop: 12 }}>
                {error}
              </MessageStrip>
            ) : null}
          </ConfirmDialog>
        </Page>
      );
    }
    return <Host />;
  },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Delete…' }));
    const body = within(document.body);
    const dialog = await body.findByRole('dialog', { name: args.title });
    const confirm = within(dialog).getByRole('button', { name: args.confirmLabel });
    await userEvent.click(confirm);
    await within(dialog).findByText('The invoice is already paid and cannot be deleted.');
    await expect(confirm).not.toHaveAttribute('aria-disabled');
    await expect(confirm).toHaveFocus();
    await expect(args.onOpenChange).not.toHaveBeenCalled();
    // Still interactive: Cancel closes it.
    await userEvent.click(within(dialog).getByRole('button', { name: args.cancelLabel }));
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull());
    await expect(args.onCancel).toHaveBeenCalledTimes(1);
  },
};

const playOpen: Story['play'] = async ({ args }) => {
  const dialog = await within(document.body).findByRole('dialog', { name: args.title });
  await settleMotion();
  await waitFor(() => expect(within(dialog).getByRole('button', { name: focusedLabel(args) })).toHaveFocus());
  await expect(dialog.getBoundingClientRect().width).toBeLessThanOrEqual(window.innerWidth);
};

/** `tone="danger"` (default), mounted open: a `danger` confirm button, the focus on Cancel. */
export const Danger: Story = {
  tags: ['visual'],
  render: (args) => <Demo args={args} initialOpen />,
  play: playOpen,
};

/** `tone="default"`: a `primary` confirm button, which receives the initial focus. */
export const DefaultTone: Story = {
  tags: ['visual'],
  args: {
    tone: 'default',
    title: 'Archive invoice 2026/0142?',
    description: 'Archived invoices are hidden from the list. You can restore them at any time.',
    confirmLabel: 'Archive invoice',
  },
  render: (args) => <Demo args={args} initialOpen />,
  play: playOpen,
};

/**
 * A review step (`tone="default"` + `initialFocus="cancel"`): the confirm button stays the primary one, but the
 * focus opens on "Keep editing", so a key still held on the opener (Enter auto-repeat) cannot confirm what the
 * user has not read. The play function opens it from the keyboard, checks the focus, and presses Enter: the
 * dialog closes without confirming.
 */
export const ReviewStep: Story = {
  args: {
    tone: 'default',
    initialFocus: 'cancel',
    title: 'Review changes',
    description: '2 changes will be saved.',
    confirmLabel: 'Save changes',
    cancelLabel: 'Keep editing',
    pendingMs: 0,
  },
  render: (args) => <Demo args={args} />,
  play: async ({ args, canvasElement }) => {
    const opener = within(canvasElement).getByRole('button', { name: 'Delete…' });
    opener.focus();
    await userEvent.keyboard('{Enter}');
    const body = within(document.body);
    const dialog = await body.findByRole('dialog', { name: args.title });
    await waitFor(() => expect(within(dialog).getByRole('button', { name: args.cancelLabel })).toHaveFocus());
    await expect(within(dialog).getByRole('button', { name: args.confirmLabel })).not.toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull());
    await expect(args.onConfirm).not.toHaveBeenCalled();
    await expect(args.onCancel).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(opener).toHaveFocus());
  },
};

/** While `onConfirm` is pending: both buttons `aria-disabled`, a spinner on the confirm button, same name. */
export const Pending: Story = {
  tags: ['visual'],
  render: (args) => <Demo args={args} initialOpen onConfirmOverride={() => new Promise<void>(() => undefined)} />,
  play: async ({ args }) => {
    const dialog = await within(document.body).findByRole('dialog', { name: args.title });
    await settleMotion();
    const confirm = within(dialog).getByRole('button', { name: args.confirmLabel });
    await userEvent.click(confirm);
    await expect(confirm).toHaveAttribute('aria-disabled', 'true');
    await expect(within(dialog).getByRole('button', { name: args.cancelLabel })).toHaveAttribute('aria-disabled', 'true');
    await expect(confirm).toHaveAccessibleName(args.confirmLabel);
    await expect(confirm).toHaveFocus();
    // Left pending on purpose: it is photographed in this state.
  },
};

/** Long title and confirm label: they wrap, the two buttons stay visible, nothing overflows horizontally. */
export const LongLabel: Story = {
  tags: ['visual'],
  args: {
    title: 'Delete invoice 2026/0142 from Rossi Supplies International Trading Ltd and all of its attachments?',
    confirmLabel: 'Delete invoice 2026/0142 and its 3 attachments permanently',
  },
  render: (args) => <Demo args={args} initialOpen />,
  play: async ({ args }) => {
    const dialog = await within(document.body).findByRole('dialog', { name: args.title });
    await settleMotion();
    await expect(dialog.scrollWidth).toBeLessThanOrEqual(dialog.clientWidth);
    for (const name of [args.cancelLabel, args.confirmLabel]) {
      const rect = within(dialog).getByRole('button', { name }).getBoundingClientRect();
      await expect(rect.left).toBeGreaterThanOrEqual(0);
      await expect(rect.right).toBeLessThanOrEqual(window.innerWidth);
      await expect(rect.bottom).toBeLessThanOrEqual(window.innerHeight);
    }
  },
};

/**
 * Opened from a `MenuItem`: the menu's trigger is passed as `returnFocusRef` (the item unmounts
 * with the menu), so on close the focus returns to "More actions". The play function opens the menu
 * with the keyboard, picks "Delete…", cancels with Escape and checks where the focus went.
 */
export const FromAMenuItem: Story = {
  render: (args) => {
    function Host() {
      const [open, setOpen] = useState(false);
      const [deleted, setDeleted] = useState(false);
      const triggerRef = useRef<HTMLButtonElement>(null);
      return (
        <Page>
          <span role="status" style={{ alignSelf: 'center' }}>
            {deleted ? 'Deleted' : ''}
          </span>
          <Menu>
            <MenuTrigger asChild ref={triggerRef}>
              <Button>More actions</Button>
            </MenuTrigger>
            <MenuContent>
              <MenuItem>Duplicate</MenuItem>
              <MenuItem tone="danger" onSelect={() => setOpen(true)}>
                Delete…
              </MenuItem>
            </MenuContent>
          </Menu>
          <ConfirmDialog
            open={open}
            onOpenChange={(next) => {
              args.onOpenChange(next);
              setOpen(next);
            }}
            returnFocusRef={triggerRef}
            tone={args.tone}
            initialFocus={initialFocusOf(args)}
            title={args.title}
            description={args.description}
            confirmLabel={args.confirmLabel}
            cancelLabel={args.cancelLabel}
            onCancel={args.onCancel}
            onConfirm={() => {
              args.onConfirm();
              setDeleted(true);
            }}
          />
        </Page>
      );
    }
    return <Host />;
  },
  play: async ({ args, canvasElement }) => {
    const trigger = within(canvasElement).getByRole('button', { name: 'More actions' });
    trigger.focus();
    await userEvent.keyboard('{ArrowDown}');
    const body = within(document.body);
    await body.findByRole('menu');
    // Arrow keys only once the menu has focused its first item (an earlier one can be lost).
    await waitFor(() => expect(body.getByRole('menuitem', { name: 'Duplicate' })).toHaveFocus());
    await userEvent.keyboard('{ArrowDown}');
    await waitFor(() => expect(body.getByRole('menuitem', { name: 'Delete…' })).toHaveFocus());
    await userEvent.keyboard('{Enter}');
    const dialog = await body.findByRole('dialog', { name: args.title });
    await waitFor(() => expect(within(dialog).getByRole('button', { name: focusedLabel(args) })).toHaveFocus());
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull());
    await expect(args.onCancel).toHaveBeenCalledTimes(1);
    await expect(args.onConfirm).not.toHaveBeenCalled();
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

/**
 * `useConfirmDialog`: `const [confirm, confirmDialog] = useConfirmDialog()`, render `{confirmDialog}`
 * once and `await confirm({...})` where the action starts. The answer is written on the page.
 */
export const WithUseConfirmDialog: Story = {
  render: (args) => {
    function Host() {
      const [confirm, confirmDialog] = useConfirmDialog();
      const [answer, setAnswer] = useState('No answer yet');
      return (
        <Page>
          <Button
            variant="danger"
            onClick={async () => {
              const ok = await confirm({
                tone: args.tone,
                initialFocus: initialFocusOf(args),
                title: args.title,
                description: args.description,
                confirmLabel: args.confirmLabel,
                cancelLabel: args.cancelLabel,
                onConfirm: () => {
                  args.onConfirm();
                  return args.pendingMs > 0 ? wait(args.pendingMs) : undefined;
                },
              });
              setAnswer(ok ? 'Confirmed: the invoice was deleted' : 'Cancelled: the invoice was kept');
            }}
          >
            Delete…
          </Button>
          <output style={{ alignSelf: 'center' }}>{answer}</output>
          {confirmDialog}
        </Page>
      );
    }
    return <Host />;
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    const opener = canvas.getByRole('button', { name: 'Delete…' });
    await userEvent.click(opener);
    await body.findByRole('dialog', { name: args.title });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(canvas.getByText('Cancelled: the invoice was kept')).toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());

    await userEvent.click(opener);
    const dialog = await body.findByRole('dialog', { name: args.title });
    await userEvent.click(within(dialog).getByRole('button', { name: args.confirmLabel }));
    await waitFor(() => expect(canvas.getByText('Confirmed: the invoice was deleted')).toBeInTheDocument(), {
      timeout: args.pendingMs + 3000,
    });
    await expect(args.onConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(opener).toHaveFocus());
  },
};

/**
 * An editor in a `Sheet` asks "Discard changes?" before closing: the confirmation is above the
 * sheet, Escape closes only the confirmation, and the focus goes back into the sheet.
 */
export const InsideASheet: Story = {
  args: {
    title: 'Discard changes?',
    description: 'Your edits to this supplier are lost.',
    confirmLabel: 'Discard changes',
    cancelLabel: 'Keep editing',
  },
  render: (args) => {
    function Host() {
      const [sheet, setSheet] = useState(false);
      const [ask, setAsk] = useState(false);
      return (
        <Page>
          <Sheet open={sheet} onOpenChange={setSheet}>
            <SheetTrigger asChild>
              <Button variant="primary">Edit supplier</Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Edit supplier</SheetTitle>
              </SheetHeader>
              <SheetBody>
                <Field label="Company name">
                  <Input defaultValue="Rossi Supplies Ltd" />
                </Field>
              </SheetBody>
              <SheetFooter>
                <Button onClick={() => setAsk(true)}>Close editor</Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
          <ConfirmDialog
            open={ask}
            onOpenChange={(next) => {
              args.onOpenChange(next);
              setAsk(next);
            }}
            tone={args.tone}
            initialFocus={initialFocusOf(args)}
            title={args.title}
            description={args.description}
            confirmLabel={args.confirmLabel}
            cancelLabel={args.cancelLabel}
            onCancel={args.onCancel}
            onConfirm={() => {
              args.onConfirm();
              setSheet(false);
            }}
          />
        </Page>
      );
    }
    return <Host />;
  },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Edit supplier' }));
    const body = within(document.body);
    const sheet = await body.findByRole('dialog', { name: 'Edit supplier' });
    const close = within(sheet).getByRole('button', { name: 'Close editor' });
    await userEvent.click(close);
    await body.findByRole('dialog', { name: args.title });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(body.queryByRole('dialog', { name: args.title })).toBeNull());
    await expect(body.getByRole('dialog', { name: 'Edit supplier' })).toBeInTheDocument();
    await waitFor(() => expect(close).toHaveFocus());
  },
};

/** The same above a `Dialog` (the editor is a dialog): confirming discards and closes both. */
export const OverADialog: Story = {
  args: {
    title: 'Discard changes?',
    description: 'Your edits to this supplier are lost.',
    confirmLabel: 'Discard changes',
    cancelLabel: 'Keep editing',
  },
  render: (args) => {
    function Host() {
      const [editor, setEditor] = useState(false);
      const [ask, setAsk] = useState(false);
      return (
        <Page>
          <Dialog open={editor} onOpenChange={setEditor}>
            <DialogTrigger asChild>
              <Button variant="primary">Edit supplier</Button>
            </DialogTrigger>
            <DialogContent dismissible={false}>
              <DialogHeader>
                <DialogTitle>Edit supplier</DialogTitle>
              </DialogHeader>
              <DialogBody>
                <Field label="Company name">
                  <Input defaultValue="Rossi Supplies Ltd" />
                </Field>
              </DialogBody>
              <DialogFooter>
                <Button onClick={() => setAsk(true)}>Discard</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <ConfirmDialog
            open={ask}
            onOpenChange={(next) => {
              args.onOpenChange(next);
              setAsk(next);
            }}
            tone={args.tone}
            initialFocus={initialFocusOf(args)}
            title={args.title}
            description={args.description}
            confirmLabel={args.confirmLabel}
            cancelLabel={args.cancelLabel}
            onCancel={args.onCancel}
            onConfirm={() => {
              args.onConfirm();
              setEditor(false);
            }}
          />
        </Page>
      );
    }
    return <Host />;
  },
  play: async ({ args, canvasElement }) => {
    const opener = within(canvasElement).getByRole('button', { name: 'Edit supplier' });
    await userEvent.click(opener);
    const body = within(document.body);
    const editor = await body.findByRole('dialog', { name: 'Edit supplier' });
    await userEvent.click(within(editor).getByRole('button', { name: 'Discard' }));
    const confirm = await body.findByRole('dialog', { name: args.title });
    await userEvent.click(within(confirm).getByRole('button', { name: args.confirmLabel }));
    await waitFor(() => expect(body.queryAllByRole('dialog')).toHaveLength(0));
    await expect(args.onConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(opener).toHaveFocus());
  },
};
