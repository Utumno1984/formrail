import { useRef, useState } from 'react';
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
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '../sheet/Sheet';
import { Menu, MenuContent, MenuGroup, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from './Menu';

type Side = 'top' | 'right' | 'bottom' | 'left';
type Align = 'start' | 'center' | 'end';
type DisabledItem = 'none' | 'rename' | 'duplicate' | 'archive';

interface DemoArgs {
  side: Side;
  align: Align;
  disabledItem: DisabledItem;
  modal: boolean;
  onOpenChange: (open: boolean) => void;
  onRename: (event: Event) => void;
  onDuplicate: (event: Event) => void;
  onArchive: (event: Event) => void;
  onDelete: (event: Event) => void;
}

const meta: Meta<DemoArgs> = {
  title: 'Overlays/Menu',
  parameters: { layout: 'fullscreen' },
  argTypes: {
    side: {
      control: 'radio',
      options: ['top', 'right', 'bottom', 'left'] satisfies Side[],
    },
    align: {
      control: 'radio',
      options: ['start', 'center', 'end'] satisfies Align[],
    },
    disabledItem: {
      control: 'select',
      options: ['none', 'rename', 'duplicate', 'archive'] satisfies DisabledItem[],
    },
    modal: { control: 'boolean' },
    onOpenChange: { control: false },
    onRename: { control: false },
    onDuplicate: { control: false },
    onArchive: { control: false },
    onDelete: { control: false },
  },
  args: {
    side: 'bottom',
    align: 'start',
    disabledItem: 'archive',
    modal: true,
    onOpenChange: fn(),
    onRename: fn(),
    onDuplicate: fn(),
    onArchive: fn(),
    onDelete: fn(),
  },
};

export default meta;
type Story = StoryObj<DemoArgs>;

function Page({ children, end }: { children?: React.ReactNode; end?: boolean }) {
  return (
    <main
      style={{
        padding: 24,
        fontFamily: 'system-ui, sans-serif',
        fontSize: 14,
        minHeight: 420,
        display: 'flex',
        justifyContent: end ? 'flex-end' : 'flex-start',
      }}
    >
      <div>{children}</div>
    </main>
  );
}

function Items({ args }: { args: DemoArgs }) {
  return (
    <>
      <MenuGroup>
        <MenuLabel>Edit</MenuLabel>
        <MenuItem onSelect={args.onRename} disabled={args.disabledItem === 'rename'}>
          Rename
        </MenuItem>
        <MenuItem onSelect={args.onDuplicate} disabled={args.disabledItem === 'duplicate'}>
          Duplicate
        </MenuItem>
      </MenuGroup>
      <MenuSeparator />
      <MenuGroup>
        <MenuLabel>Danger zone</MenuLabel>
        <MenuItem onSelect={args.onArchive} disabled={args.disabledItem === 'archive'}>
          Archive
        </MenuItem>
        <MenuItem tone="danger" onSelect={args.onDelete}>
          Delete…
        </MenuItem>
      </MenuGroup>
    </>
  );
}

function BasicMenu({ args }: { args: DemoArgs }) {
  return (
    <Menu modal={args.modal} onOpenChange={args.onOpenChange}>
      <MenuTrigger asChild>
        <Button variant="secondary">More actions</Button>
      </MenuTrigger>
      <MenuContent side={args.side} align={args.align}>
        <Items args={args} />
      </MenuContent>
    </Menu>
  );
}

/**
 * Controls: `side`, `align`, `modal`, and which item is disabled; every `onSelect` and
 * `onOpenChange` is in Actions. The play function opens the menu with ArrowDown, checks that the
 * disabled item is skipped, picks "Duplicate" with Enter and checks the action, the closing and the
 * focus back on the trigger.
 */
export const Playground: Story = {
  args: { disabledItem: 'rename' },
  render: (args) => (
    <Page>
      <BasicMenu args={args} />
    </Page>
  ),
  play: async ({ args, canvasElement }) => {
    const trigger = within(canvasElement).getByRole('button', {
      name: 'More actions',
    });
    trigger.focus();
    await userEvent.keyboard('{ArrowDown}');
    const body = within(canvasElement.ownerDocument.body);
    // "Rename" is disabled: the focus lands on "Duplicate", the first enabled item.
    const duplicate = await body.findByRole('menuitem', { name: 'Duplicate' });
    await waitFor(() => expect(duplicate).toHaveFocus());
    await expect(body.getByRole('menuitem', { name: 'Rename' })).toHaveAttribute('aria-disabled', 'true');
    await userEvent.keyboard('{Enter}');
    await expect(args.onDuplicate).toHaveBeenCalledTimes(1);
    await expect(args.onRename).not.toHaveBeenCalled();
    await waitFor(() => expect(body.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

/** The open menu with groups, labels, a separator, a disabled and a danger item (visual baseline). */
export const OpenWithGroups: Story = {
  tags: ['visual'],
  render: (args) => (
    <Page>
      <Menu defaultOpen modal={false}>
        <MenuTrigger asChild>
          <Button variant="secondary">More actions</Button>
        </MenuTrigger>
        <MenuContent side={args.side} align={args.align}>
          <Items args={args} />
        </MenuContent>
      </Menu>
    </Page>
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByRole('menu', { name: 'More actions' })).toBeVisible();
    await expect(body.getByRole('menuitem', { name: 'Archive' })).toHaveAttribute('aria-disabled', 'true');
  },
};

/** Near the right edge: at 375px the menu stays inside the viewport (visual baseline). */
export const NearRightEdge: Story = {
  tags: ['visual'],
  render: (args) => (
    <Page end>
      <Menu defaultOpen modal={false}>
        <MenuTrigger asChild>
          <Button variant="secondary">More actions</Button>
        </MenuTrigger>
        <MenuContent side="bottom" align="start">
          <Items args={args} />
        </MenuContent>
      </Menu>
    </Page>
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const menu = await body.findByRole('menu');
    await waitFor(() => {
      const r = menu.getBoundingClientRect();
      expect(r.left).toBeGreaterThanOrEqual(0);
      expect(r.right).toBeLessThanOrEqual(document.documentElement.clientWidth);
    });
  },
};

/** 30 items on a short area: the panel scrolls inside, the item reached with the arrows stays visible. */
export const LongMenu: Story = {
  render: () => (
    <Page>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="secondary">Many actions</Button>
        </MenuTrigger>
        <MenuContent>
          {Array.from({ length: 30 }, (_, i) => (
            <MenuItem key={i}>Action {i + 1}</MenuItem>
          ))}
        </MenuContent>
      </Menu>
    </Page>
  ),
};

function DialogDemo({ args, opensDialog }: { args: DemoArgs; opensDialog: boolean }) {
  const [confirm, setConfirm] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <Page>
      <Menu onOpenChange={args.onOpenChange}>
        <MenuTrigger asChild ref={triggerRef}>
          <Button variant="secondary">More actions</Button>
        </MenuTrigger>
        <MenuContent>
          <MenuItem onSelect={args.onDuplicate}>Duplicate</MenuItem>
          <MenuItem
            tone="danger"
            onSelect={(event) => {
              args.onDelete(event);
              setConfirm(true);
            }}
          >
            Delete…
          </MenuItem>
        </MenuContent>
      </Menu>
      {opensDialog ? (
        <Dialog open={confirm} onOpenChange={setConfirm}>
          <DialogContent size="sm" returnFocusRef={triggerRef}>
            <DialogHeader>
              <DialogTitle>Delete this record?</DialogTitle>
            </DialogHeader>
            <DialogBody>This cannot be undone.</DialogBody>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">Cancel</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </Page>
  );
}

/**
 * "Delete…" opens a controlled Dialog: the Dialog gets the focus, Escape closes it and the focus is
 * back on the menu's trigger, with the page clickable (no stuck `pointer-events: none`).
 */
export const OpensADialog: Story = {
  render: (args) => <DialogDemo args={args} opensDialog />,
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const trigger = within(canvasElement).getByRole('button', {
      name: 'More actions',
    });
    trigger.focus();
    await userEvent.keyboard('{ArrowDown}');
    await body.findByRole('menu');
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await expect(args.onDelete).toHaveBeenCalledTimes(1);
    const dialog = await body.findByRole('dialog', {
      name: 'Delete this record?',
    });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
    await waitFor(() => expect(document.body.style.pointerEvents).not.toBe('none'));
  },
};

/** The menu inside a Dialog: it sits above the panel and Escape closes only the menu. */
export const InsideDialog: Story = {
  render: (args) => (
    <Page>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="primary">Open dialog</Button>
        </DialogTrigger>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Record</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <BasicMenu args={args} />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </Page>
  ),
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Open dialog' }));
    const dialog = await body.findByRole('dialog', { name: 'Record' });
    const trigger = within(dialog).getByRole('button', {
      name: 'More actions',
    });
    trigger.focus();
    await userEvent.keyboard('{ArrowDown}');
    const item = await body.findByRole('menuitem', { name: 'Duplicate' });
    const r = item.getBoundingClientRect();
    await expect(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)).toBe(item);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(body.queryByRole('menu')).toBeNull());
    await expect(body.getByRole('dialog', { name: 'Record' })).toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
    await expect(args.onOpenChange).toHaveBeenCalled();
    // Again: pick "Duplicate" with Enter; the action runs once, the menu closes, the dialog stays.
    await userEvent.keyboard('{ArrowDown}');
    await body.findByRole('menu');
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await expect(args.onDuplicate).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(body.queryByRole('menu')).toBeNull());
    await expect(body.getByRole('dialog', { name: 'Record' })).toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

/** The same, with the menu open inside the Dialog (visual baseline; the play function opens it). */
export const InsideDialogOpen: Story = {
  tags: ['visual'],
  render: (args) => (
    <Page>
      <Dialog defaultOpen>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Record</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <BasicMenu args={args} />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </Page>
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const trigger = await body.findByRole('button', { name: 'More actions' });
    await waitFor(() => expect(body.getByRole('dialog', { name: 'Record' })).toBeVisible());
    await userEvent.click(trigger);
    await expect(await body.findByRole('menu')).toBeVisible();
  },
};

/** The menu inside a Sheet: above the panel; Escape closes only the menu. */
export const InsideSheet: Story = {
  render: (args) => (
    <Page>
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="primary">Open sheet</Button>
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Record</SheetTitle>
          </SheetHeader>
          <SheetBody>
            <BasicMenu args={args} />
          </SheetBody>
        </SheetContent>
      </Sheet>
    </Page>
  ),
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Open sheet' }));
    const sheet = await body.findByRole('dialog', { name: 'Record' });
    const trigger = within(sheet).getByRole('button', { name: 'More actions' });
    trigger.focus();
    await userEvent.keyboard('{ArrowDown}');
    const item = await body.findByRole('menuitem', { name: 'Duplicate' });
    const r = item.getBoundingClientRect();
    await expect(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)).toBe(item);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(body.queryByRole('menu')).toBeNull());
    await expect(body.getByRole('dialog', { name: 'Record' })).toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
    await userEvent.keyboard('{ArrowDown}');
    await body.findByRole('menu');
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await expect(args.onDuplicate).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(body.queryByRole('menu')).toBeNull());
    await expect(body.getByRole('dialog', { name: 'Record' })).toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

/** Open state owned by the application: the focus goes to the first item and closing returns it. */
export const ExternalState: Story = {
  render: (args) => {
    function Controlled() {
      const [open, setOpen] = useState(false);
      return (
        <Page>
          <Button variant="primary" onClick={() => setOpen(true)}>
            Open from outside
          </Button>{' '}
          <Menu
            open={open}
            onOpenChange={(next) => {
              args.onOpenChange(next);
              setOpen(next);
            }}
          >
            <MenuTrigger asChild>
              <Button variant="secondary">More actions</Button>
            </MenuTrigger>
            <MenuContent>
              <Items args={args} />
            </MenuContent>
          </Menu>
        </Page>
      );
    }
    return <Controlled />;
  },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const opener = within(canvasElement).getByRole('button', {
      name: 'Open from outside',
    });
    await userEvent.click(opener);
    const first = await body.findByRole('menuitem', { name: 'Rename' });
    await waitFor(() => expect(first).toHaveFocus());
    // `onOpenChange` reports user closings, not the application's own opening.
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(body.queryByRole('menu')).toBeNull());
    await expect(args.onOpenChange).toHaveBeenCalledWith(false);
    await waitFor(() => expect(opener).toHaveFocus());
  },
};

/** Right-to-left: the panel aligns to the trigger's start edge (the right one) and opens with ArrowDown. */
export const Rtl: Story = {
  render: (args) => (
    <div dir="rtl">
      <Page>
        <Menu dir="rtl">
          <MenuTrigger asChild>
            <Button variant="secondary">More actions</Button>
          </MenuTrigger>
          <MenuContent align="start">
            <Items args={args} />
          </MenuContent>
        </Menu>
      </Page>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const trigger = within(canvasElement).getByRole('button', {
      name: 'More actions',
    });
    trigger.focus();
    await userEvent.keyboard('{ArrowDown}');
    const menu = await body.findByRole('menu');
    await expect(menu).toHaveAttribute('dir', 'rtl');
    await waitFor(() => expect(body.getByRole('menuitem', { name: 'Rename' })).toHaveFocus());
  },
};

/** Tab from an open menu closes it and moves on to the next control of the page; Shift+Tab to the previous one. */
export const TabOrderPage: Story = {
  render: (args) => (
    <Page>
      <Button variant="ghost">Before</Button> <BasicMenu args={args} /> <Button variant="ghost">After</Button>
    </Page>
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const trigger = within(canvasElement).getByRole('button', {
      name: 'More actions',
    });
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    await body.findByRole('menu');
    await userEvent.keyboard('{Tab}');
    await waitFor(() => expect(body.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(within(canvasElement).getByRole('button', { name: 'After' })).toHaveFocus());
  },
};

/**
 * Two menus and a button in a Dialog: Tab from the last control wraps to the first, Shift+Tab from
 * the first to the last, like the Dialog's own focus trap (the page behind is never reached).
 */
export const TabOrderDialog: Story = {
  render: (args) => (
    <Page>
      <Dialog defaultOpen>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Record</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Menu>
              <MenuTrigger asChild>
                <Button variant="secondary">First menu</Button>
              </MenuTrigger>
              <MenuContent>
                <Items args={args} />
              </MenuContent>
            </Menu>{' '}
            <Button variant="ghost">Middle</Button>{' '}
            <Menu>
              <MenuTrigger asChild>
                <Button variant="secondary">Last menu</Button>
              </MenuTrigger>
              <MenuContent>
                <Items args={args} />
              </MenuContent>
            </Menu>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </Page>
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await body.findByRole('dialog', { name: 'Record' });
    const first = within(dialog).getByRole('button', { name: 'First menu' });
    first.focus();
    await userEvent.keyboard('{Enter}');
    await body.findByRole('menu');
    await userEvent.keyboard('{Tab}');
    await waitFor(() => expect(body.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Middle' })).toHaveFocus());
  },
};
