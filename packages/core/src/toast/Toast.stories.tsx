import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Button } from '../button/Button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../dialog/Dialog';
import { Field } from '../field/Field';
import { Input } from '../input/Input';
import { exampleStory } from '../internal/example-story';
import { settleMotion } from '../internal/settle-motion';
import { storyControls, withoutControls } from '../internal/story-docs';
import { Select } from '../select/Select';
import { Sheet,SheetBody, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '../sheet/Sheet';
import { ToastProvider } from './ToastProvider';
import { useToast, type ToastOptions, type ToastTone } from './use-toast';

const TONES: ToastTone[] = ['info', 'success', 'warning', 'error'];
const DURATIONS = [3000, 5000, 10000, 'persistent'] as const;

interface DemoArgs {
  tone: ToastTone;
  duration: (typeof DURATIONS)[number];
  title: string;
  description: string;
  withAction: boolean;
  onDismiss: (reason: string) => void;
  onActionClick: () => void;
}

const meta: Meta<DemoArgs> = {
  title: 'Overlays/Toast',
  component: ToastProvider,
  // Overlays opened at mount, autofocus and history changes would take over the Docs page if the stories
  // were rendered inline: each story gets its own iframe there.
  parameters: { layout: 'fullscreen', docs: { story: { inline: false, height: '360px' } } },
  // The controls are the options of one toast, `useToast().show({ ... })`: not props of `ToastProvider`
  // (whose props are set by the decorator below, and listed in the table without controls).
  argTypes: {
    ...withoutControls('labels', 'hotkey', 'defaultDuration', 'children'),
    ...storyControls({
      tone: { control: 'radio', options: TONES, description: '`useToast().show({ tone })`: the colour and icon of the toast.' },
      duration: {
        control: 'select',
        options: DURATIONS,
        description: '`useToast().show({ duration })`: ms before it closes by itself; `persistent` passes `duration: null` (stays until dismissed).',
      },
      title: { control: 'text', description: '`useToast().show({ title })`: optional first line (empty: none).' },
      description: { control: 'text', description: '`useToast().show({ description })`: the message.' },
      withAction: { control: 'boolean', description: 'Adds `useToast().show({ action: { label: "Undo", onClick } })`: a button inside the toast.' },
      onDismiss: { control: false, description: '`useToast().show({ onDismiss })`: called with the reason when the toast closes.' },
      onActionClick: { control: false, description: "The `onClick` of the demo's `action`." },
    }),
  },
  args: {
    tone: 'success',
    duration: 5000,
    title: '',
    description: 'Saved',
    withAction: false,
    onDismiss: fn(),
    onActionClick: fn(),
  },
};

export default meta;
type Story = StoryObj<DemoArgs>;

// Not on the meta: the Example story brings its own provider (it is the code a reader pastes), and a meta decorator would wrap it too.
const decorators: Decorator[] = [(Story) => <ToastProvider>{Story()}</ToastProvider>];

const PAGE: CSSProperties = {
  padding: 24,
  fontFamily: 'system-ui, sans-serif',
  fontSize: 14,
  minHeight: 360,
  boxSizing: 'border-box',
};

function Page({ children }: { children?: ReactNode }) {
  return (
    <main style={PAGE}>
      <h1 style={{ margin: '0 0 8px', fontSize: 20 }}>Supplier note</h1>
      <p style={{ margin: '0 0 16px', maxWidth: 480 }}>
        Type in the field and save: the toast is announced without taking the focus away from you.
      </p>
      {children}
    </main>
  );
}

function optionsOf(args: DemoArgs): ToastOptions {
  return {
    tone: args.tone,
    title: args.title || undefined,
    description: args.description,
    duration: args.duration === 'persistent' ? null : args.duration,
    action: args.withAction ? { label: 'Undo', onClick: args.onActionClick } : undefined,
    onDismiss: args.onDismiss,
  };
}

function SaveForm({ args }: { args: DemoArgs }) {
  const toast = useToast();
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 360 }}>
      <Field label="Note">
        <Input />
      </Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="primary" onClick={() => toast.show(optionsOf(args))}>
          Save
        </Button>
        <Button variant="secondary" onClick={() => toast.show({ tone: 'info', description: 'Draft saved' })}>
          Save draft
        </Button>
      </div>
    </div>
  );
}

/**
 * Copy-paste example: a button shows a toast, announced without taking the focus; it closes by itself or with its action or close button.
 */
export const Example: Story = {
  tags: ['example', '!visual'],
  ...exampleStory('Toast.example.tsx'),
};

/**
 * Controls: `tone`, `duration`, `title`, `description` and `withAction`; `onDismiss` and the action's
 * `onClick` appear in Actions. The play function types in the field, saves, checks the focus stayed on
 * "Save" and the text arrived in the live region that was already there, then moves the focus into the
 * toast with F8 and closes it with Escape, which returns the focus to "Save".
 */
export const Playground: Story = {
  tags: ['playground'],
  decorators,
  render: (args) => (
    <Page>
      <SaveForm args={args} />
    </Page>
  ),
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    const region = body.getByRole(args.tone === 'error' ? 'alert' : 'status');
    await expect(region).toBeEmptyDOMElement();
    await userEvent.type(canvas.getByLabelText('Note'), 'Net 30');
    const save = canvas.getByRole('button', { name: 'Save' });
    await userEvent.click(save);
    await expect(save).toHaveFocus();
    await waitFor(() => expect(region).toHaveTextContent(args.description));
    await expect(body.getByRole(args.tone === 'error' ? 'alert' : 'status')).toBe(region);
    await userEvent.keyboard('{F8}');
    await expect(region.firstElementChild).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(region).toBeEmptyDOMElement());
    await expect(args.onDismiss).toHaveBeenLastCalledWith('user');
    await expect(save).toHaveFocus();
  },
};

/** Shows one toast as soon as it mounts. Only for the static (visual) stories. */
function ShowOnMount({ id, options }: { id: string; options: ToastOptions }) {
  const toast = useToast();
  const optionsRef = useRef(options);
  useEffect(() => {
    toast.show({ ...optionsRef.current, id, duration: null });
  }, [toast, id]);
  return null;
}

/**
 * The library shows one toast at a time, so a static picture of several uses one provider each,
 * stacked in slots with the provider's `style`. Not a pattern for an app.
 */
function Slots({ items }: { items: ToastOptions[] }) {
  return (
    <Page>
      {/* Below `sm` the toast is full width, so a slot at the top of the viewport would cover the
          page heading: start the slots under the heading and the text instead (with a gap). Desktop
          and tablet keep the top-right slots. A media query needs a stylesheet, not inline `top`. */}
      <style>{`
        .rop-toast-slot { top: calc(var(--rop-slot-index) * 120px + 16px); }
        @media (max-width: 639px) { .rop-toast-slot { top: calc(var(--rop-slot-index) * 120px + 160px); } }
      `}</style>
      {items.map((options, i) => (
        <ToastProvider
          key={i}
          className="rop-toast-slot"
          style={{ ['--rop-slot-index' as string]: i, bottom: 'auto' }}
        >
          <ShowOnMount id={`slot-${i}`} options={options} />
        </ToastProvider>
      ))}
    </Page>
  );
}

const allShown = async () => {
  await waitFor(() => expect(document.querySelectorAll('[data-state="open"]').length).toBeGreaterThan(0));
  await settleMotion();
};

/** The four tones, each in its own slot: icon, border and the hidden tone name differ. */
export const Tones: Story = {
  decorators,
  tags: ['visual'],
  parameters: { controls: { disable: true } },
  render: () => (
    <Slots items={TONES.map((tone) => ({ tone, description: `${tone[0]!.toUpperCase()}${tone.slice(1)} message` }))} />
  ),
  play: async () => {
    await allShown();
    await expect(document.querySelectorAll('[data-state="open"]')).toHaveLength(4);
  },
};

/** Title, action, both, and neither. */
export const Variants: Story = {
  decorators,
  tags: ['visual'],
  parameters: { controls: { disable: true } },
  render: () => (
    <Slots
      items={[
        { tone: 'success', description: 'Plain message' },
        { tone: 'info', title: 'Invoice 2026-0412', description: 'Registered in the ledger.' },
        { tone: 'warning', description: 'Supplier removed.', action: { label: 'Undo', onClick: () => undefined } },
        {
          tone: 'error',
          title: 'Upload failed',
          description: 'The file is larger than 10 MB.',
          action: { label: 'Retry', onClick: () => undefined },
        },
      ]}
    />
  ),
  play: allShown,
};

/**
 * A toast with an action stays until it is closed (WCAG 2.2.1), so the action is always reachable.
 * Press F8 to move the focus to it, Tab to "Undo". The play function saves, presses F8 and Tab,
 * activates "Undo" with Enter and checks the action ran, the toast closed and the focus is back on "Save".
 */
export const WithAction: Story = {
  decorators,
  args: { tone: 'info', description: 'Supplier removed.', withAction: true, duration: 'persistent' },
  render: Playground.render,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    const undo = await body.findByRole('button', { name: 'Undo' });
    await userEvent.keyboard('{F8}');
    await userEvent.tab();
    await expect(undo).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onActionClick).toHaveBeenCalledTimes(1);
    await expect(args.onDismiss).toHaveBeenLastCalledWith('user');
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Save' })).toHaveFocus());
  },
};

/** A long message and an unbroken URL wrap inside the toast; nothing overflows, also at 375px. */
export const LongText: Story = {
  decorators,
  tags: ['visual'],
  parameters: { controls: { disable: true } },
  render: () => (
    <Slots
      items={[
        {
          tone: 'warning',
          title: 'Synchronisation paused for a very long reason that needs more than one line',
          description:
            'The connection to https://example.com/very/long/path/without/spaces/that/keeps/going/and/going/1234567890 dropped and we kept the changes locally. They will be sent when it comes back, there is nothing you need to do now.',
          action: { label: 'Retry now', onClick: () => undefined },
        },
      ]}
    />
  ),
  play: allShown,
};

function SaveInOverlay({ label }: { label: string }) {
  const toast = useToast();
  return (
    <Button variant="primary" onClick={() => toast.show({ tone: 'success', description: label, duration: null })}>
      Save
    </Button>
  );
}

/**
 * A toast shown from a button inside a modal Dialog is visible, announced (the live regions are not
 * under `aria-hidden`), clickable (the page has `pointer-events: none`) and closing it does not close
 * the Dialog. Limit: the Dialog's focus trap keeps F8 from reaching the toast while the Dialog is
 * open, which is why a toast with an action stays until closed.
 */
export const InsideDialog: Story = {
  decorators,
  tags: ['visual'],
  parameters: { controls: { disable: true } },
  render: () => (
    <Page>
      <Dialog defaultOpen>
        <DialogTrigger asChild>
          <Button>Open</Button>
        </DialogTrigger>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Edit supplier</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p style={{ margin: 0 }}>Save to see the toast above this dialog.</p>
          </DialogBody>
          <DialogFooter>
            <SaveInOverlay label="Saved from the dialog" />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  ),
  play: async () => {
    const body = within(document.body);
    const dialog = await body.findByRole('dialog', { name: 'Edit supplier' });
    await settleMotion();
    const region = body.getByRole('status');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(region).toHaveTextContent('Saved from the dialog'));
    await expect(region.closest('[aria-hidden="true"]')).toBeNull();
    await settleMotion();
    await expect(document.body.style.pointerEvents).toBe('none');
    await expect(region.firstElementChild).toContainElement(
      document.elementFromPoint(...centerOf(region.firstElementChild as HTMLElement)) as HTMLElement,
    );
  },
};

function centerOf(el: HTMLElement): [number, number] {
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
}

/**
 * The toast viewport is stretched across the middle of the screen, over the open Select list inside
 * the Dialog: the toast must be on top (z-index scale: modal < popover < toast). Fixture for the
 * stacking e2e test; no play (the test opens the Select).
 */
export const OverSelectInsideDialog: Story = {
  decorators,
  parameters: { controls: { disable: true } },
  render: () => (
    <Page>
      <ToastProvider style={{ top: 'calc(50% - 40px)', bottom: 'auto', left: 0, right: 0, width: 'auto', maxWidth: 'none' }}>
        <ShowOnMount id="over" options={{ tone: 'warning', title: 'Heads up', description: 'This toast is above the open list.' }} />
        <Dialog defaultOpen>
          <DialogContent size="sm">
            <DialogHeader>
              <DialogTitle>Edit supplier</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <Field label="Payment terms">
                <Select
                  options={[
                    { value: '30', label: 'Net 30' },
                    { value: '60', label: 'Net 60' },
                    { value: '90', label: 'Net 90' },
                  ]}
                  defaultValue="30"
                />
              </Field>
            </DialogBody>
          </DialogContent>
        </Dialog>
      </ToastProvider>
    </Page>
  ),
};

/**
 * A toast shown by a timer while the focus is in a field: the field keeps it, with or without an
 * action. Fixture for the focus e2e test (`withAction` control); no play.
 */
export const ShownByTimer: Story = {
  decorators,
  args: { withAction: true, duration: 'persistent', description: 'Synced' },
  render: (args) => <TimerDemo args={args} />,
};

function TimerDemo({ args }: { args: DemoArgs }) {
  const toast = useToast();
  useEffect(() => {
    const timer = setTimeout(() => toast.show(optionsOf(args)), 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the toast is shown once, with the args at mount
  }, [toast]);
  return (
    <Page>
      <div style={{ maxWidth: 360 }}>
        <Field label="Note">
          <Input />
        </Field>
      </div>
    </Page>
  );
}

/** The same inside a Sheet. */
export const InsideSheet: Story = {
  decorators,
  parameters: { controls: { disable: true } },
  render: () => (
    <Page>
      <Sheet defaultOpen>
        <SheetTrigger asChild>
          <Button>Open</Button>
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>
          <SheetBody>
            <SaveInOverlay label="Saved from the sheet" />
          </SheetBody>
        </SheetContent>
      </Sheet>
    </Page>
  ),
  play: async () => {
    const body = within(document.body);
    const sheet = await body.findByRole('dialog', { name: 'Filters' });
    await settleMotion();
    const region = body.getByRole('status');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(region).toHaveTextContent('Saved from the sheet'));
    await expect(region.closest('[aria-hidden="true"]')).toBeNull();
    await userEvent.click(body.getByRole('button', { name: 'Dismiss notification' }));
    await waitFor(() => expect(region).toBeEmptyDOMElement());
    await expect(body.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument();
  },
};
