import { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Button } from '../button/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../dialog/Dialog';
import { useDirtyGuard } from './use-dirty-guard';

interface DemoArgs {
  when: boolean;
  title: string;
  description: string;
  stay: string;
  leave: string;
  close: string;
  /** The guarded exit action: it shows up in Actions only when the exit is confirmed. */
  action: () => void;
}

const meta: Meta<DemoArgs> = {
  title: 'Patterns/DirtyGuard',
  parameters: {
    layout: 'fullscreen',
    docs: { story: { inline: false, height: '360px' }, description: { component: "`useDirtyGuard({ when, labels })` protects a page with unsaved changes. `guard(action)` runs `action` right away when nothing is dirty, otherwise opens a confirmation dialog first (focus on \"Keep editing\", focus back on the opener when closed). The same dialog also intercepts the browser's Back/Forward, and a reload or tab close asks the browser for its own confirmation. Render the `dialog` the hook returns anywhere in the page." } },
  },
  argTypes: {
    when: { control: 'boolean' },
    title: { control: 'text' },
    description: { control: 'text' },
    stay: { control: 'text' },
    leave: { control: 'text' },
    close: { control: 'text' },
    action: { control: false },
  },
  args: {
    when: true,
    title: 'Unsaved changes',
    description: 'You have unsaved changes: leaving now will lose them.',
    stay: 'Keep editing',
    leave: 'Leave without saving',
    close: '',
    action: fn(),
  },
};

export default meta;
type Story = StoryObj<DemoArgs>;

function Demo({ when, title, description, stay, leave, close, action }: DemoArgs) {
  const { guard, dialog } = useDirtyGuard({ when, labels: { title, description, stay, leave, close } });
  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif', fontSize: 14, minHeight: 360 }}>
      <h1 style={{ margin: '0 0 8px', fontSize: 20 }}>Fornitore ACME</h1>
      <p style={{ margin: '0 0 16px', maxWidth: 480 }}>
        {when
          ? 'Ci sono modifiche non salvate: ricaricare la pagina chiede conferma al browser.'
          : 'Nessuna modifica: uscire è immediato e il browser non chiede conferma.'}
      </p>
      <Button variant="secondary" onClick={() => guard(action)}>
        Torna alla lista
      </Button>
      {dialog}
    </main>
  );
}

/**
 * Controls: `when` (unsaved changes), the four texts of the dialog. `action` is wired to Actions and
 * is called only when the exit is confirmed. The play function opens the dialog, checks the focus on
 * "Keep editing", stays (nothing in Actions, the focus back on the opener), then opens it
 * again and leaves: exactly one call.
 */
export const Playground: Story = {
  render: (args) => <Demo {...args} />,
  play: async ({ args, canvasElement }) => {
    if (!args.when) return;
    const opener = within(canvasElement).getByRole('button', { name: 'Torna alla lista' });
    const body = within(document.body);
    await userEvent.click(opener);
    const dialog = await body.findByRole('dialog', { name: args.title });
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toHaveAccessibleDescription(args.description);
    await waitFor(() => expect(body.getByRole('button', { name: args.stay })).toHaveFocus());
    // The X is named by the `close` control when set, else by the default "Close: <title>".
    await expect(
      body.getByRole('button', { name: args.close.trim() ? args.close : `Close: ${args.title}` }),
    ).toBeInTheDocument();

    await userEvent.click(body.getByRole('button', { name: args.stay }));
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull());
    await expect(args.action).not.toHaveBeenCalled();
    await waitFor(() => expect(opener).toHaveFocus());

    await userEvent.click(opener);
    await userEvent.click(await body.findByRole('button', { name: args.leave }));
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull());
    await expect(args.action).toHaveBeenCalledTimes(1);
  },
};

/** The confirmation dialog open, for the visual snapshot (mobile, tablet and desktop). */
export const DialogOpen: Story = {
  tags: ['visual'],
  render: (args) => <Demo {...args} />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Torna alla lista' }));
    await within(document.body).findByRole('dialog', { name: 'Unsaved changes' });
  },
};

/**
 * The guarded action unmounts the whole page. To try it: click "Torna alla lista", then "Leave without
 * saving": the page is replaced by "Pagina chiusa" and nothing is left behind (scroll lock, `aria-hidden`,
 * `inert`). The story records how many dialogs were in the DOM when the action ran (the confirmation
 * must already be closed); the e2e suite reads that number.
 */
export const UnmountsPage: Story = {
  render: (args) => {
    function Root() {
      const [mounted, setMounted] = useState(true);
      if (!mounted) return <p>Pagina chiusa</p>;
      return (
        <Demo
          {...args}
          action={() => {
            (window as unknown as { __dialogsAtAction: number }).__dialogsAtAction =
              document.querySelectorAll('[role=dialog]').length;
            setMounted(false);
          }}
        />
      );
    }
    return <Root />;
  },
};

/**
 * `guard` called from inside another open Dialog. To try it: click "Apri la scheda", then "Chiudi scheda": the
 * confirmation opens above the first dialog (and gets the focus), and "Keep editing" returns to it.
 */
export const InsideDialog: Story = {
  // `when` is fixed and `close` is not passed to the hook in this render.
  parameters: { controls: { exclude: ['when', 'close'] } },
  render: ({ title, description, stay, leave }) => {
    function Root() {
      const [open, setOpen] = useState(false);
      const { guard, dialog } = useDirtyGuard({ when: true, labels: { title, description, stay, leave } });
      return (
        <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif', fontSize: 14, minHeight: 360 }}>
          <Button onClick={() => setOpen(true)}>Apri la scheda</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Scheda fornitore</DialogTitle>
                <DialogDescription>Modifiche in corso.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button onClick={() => guard(() => setOpen(false))}>Chiudi scheda</Button>
              </DialogFooter>
              {dialog}
            </DialogContent>
          </Dialog>
        </main>
      );
    }
    return <Root />;
  },
};

/**
 * Browser Back/Forward with a modified field. **To try it:** type something in "Supplier name", then press
 * the browser's Back button (or Alt+Left): `useDirtyGuard` intercepts the `popstate` and opens the
 * "Unsaved changes" dialog instead of letting the route change. "Keep editing" stays on `#step-3`;
 * "Leave without saving" goes back. With the field empty, Back is immediate and no dialog appears.
 *
 * There is no automatic play function: a real history navigation cannot be scripted reliably inside the
 * Storybook iframe, so the e2e suite covers it. The story pushes three history entries (`#step-1`,
 * `#step-2`, `#step-3`, the last one current) and the small "router" below only reads `location.hash`
 * on `popstate`.
 */
export const BrowserHistory: Story = {
  // `when` follows the typed field and `close` is not passed to the hook in this render.
  parameters: { controls: { exclude: ['when', 'close'] } },
  render: ({ title, description, stay, leave }) => {
    function Root() {
      const [hash, setHash] = useState(() => window.location.hash);
      const [value, setValue] = useState('');
      useEffect(() => {
        for (const h of ['#step-1', '#step-2', '#step-3']) window.history.pushState(null, '', h);
        setHash(window.location.hash);
        const onPop = () => setHash(window.location.hash);
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
      }, []);
      const { dialog } = useDirtyGuard({ when: value !== '', labels: { title, description, stay, leave } });
      return (
        <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif', fontSize: 14, minHeight: 360 }}>
          <p data-testid="route">Route: {hash || '(none)'}</p>
          <label>
            Supplier name
            <input value={value} onChange={(e) => setValue(e.target.value)} style={{ marginLeft: 8 }} />
          </label>
          {dialog}
        </main>
      );
    }
    return <Root />;
  },
};
