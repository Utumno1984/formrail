import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { overlayLayer } from '../overlay/layers';
import { Dialog, DialogContent, DialogTitle } from '../dialog/Dialog';
import { Menu, MenuContent, MenuGroup, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, type MenuProps } from './Menu';

// jsdom lacks what Radix measures and scrolls with.
beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

interface DemoProps extends MenuProps {
  onEdit?: (e: Event) => void;
  onDup?: (e: Event) => void;
  onDelete?: (e: Event) => void;
  disabledDup?: boolean;
}

function Demo({ onEdit, onDup, onDelete, disabledDup, ...menu }: DemoProps) {
  return (
    <Menu {...menu}>
      <MenuTrigger>Actions</MenuTrigger>
      <MenuContent>
        <MenuGroup data-testid="group">
          <MenuLabel>Edit</MenuLabel>
          <MenuItem onSelect={onEdit}>Rename</MenuItem>
          <MenuItem onSelect={onDup} disabled={disabledDup}>
            Duplicate
          </MenuItem>
        </MenuGroup>
        <MenuSeparator />
        <MenuItem tone="danger" onSelect={onDelete}>
          Delete…
        </MenuItem>
        <MenuItem>Archive</MenuItem>
      </MenuContent>
    </Menu>
  );
}

// `hidden`: an open modal menu hides everything outside itself, the trigger included.
const trigger = () => screen.getByRole('button', { name: 'Actions', hidden: true });

describe('Menu', () => {
  it('has the menu button roles and names', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    expect(trigger()).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(trigger()).not.toHaveAttribute('aria-controls');
    await user.click(trigger());
    const menu = await screen.findByRole('menu', { name: 'Actions' });
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(trigger()).toHaveAttribute('aria-controls', menu.id);
    expect(screen.getAllByRole('menuitem')).toHaveLength(4);
    expect(screen.getByRole('separator')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByText('Edit')).not.toHaveAttribute('tabindex');
  });

  it('opens from the keyboard: Enter/Space/ArrowDown on the first enabled item, ArrowUp on the last', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    trigger().focus();
    await user.keyboard('{ArrowDown}');
    expect(await screen.findByRole('menuitem', { name: 'Rename' })).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(trigger()).toHaveFocus());
    await user.keyboard('{ArrowUp}');
    expect(await screen.findByRole('menuitem', { name: 'Archive' })).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(trigger()).toHaveFocus());
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('menuitem', { name: 'Rename' })).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(trigger()).toHaveFocus());
    await user.keyboard(' ');
    expect(await screen.findByRole('menuitem', { name: 'Rename' })).toHaveFocus();
  });

  it('first enabled item gets the focus when the first one is disabled', async () => {
    const user = userEvent.setup();
    render(
      <Menu>
        <MenuTrigger>Actions</MenuTrigger>
        <MenuContent>
          <MenuItem disabled>One</MenuItem>
          <MenuItem>Two</MenuItem>
        </MenuContent>
      </Menu>,
    );
    trigger().focus();
    await user.keyboard('{ArrowDown}');
    expect(await screen.findByRole('menuitem', { name: 'Two' })).toHaveFocus();
  });

  it('loop={false}: arrows stop at the first and last item instead of wrapping', async () => {
    const user = userEvent.setup();
    render(
      <Menu>
        <MenuTrigger>Actions</MenuTrigger>
        <MenuContent loop={false}>
          <MenuItem>One</MenuItem>
          <MenuItem>Two</MenuItem>
        </MenuContent>
      </Menu>,
    );
    trigger().focus();
    await user.keyboard('{ArrowDown}');
    expect(await screen.findByRole('menuitem', { name: 'One' })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: 'One' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Two' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Two' })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: 'One' })).toHaveFocus();
  });

  it('arrows wrap, skip disabled items; Home/End; typeahead', async () => {
    const user = userEvent.setup();
    render(<Demo disabledDup />);
    trigger().focus();
    await user.keyboard('{ArrowDown}');
    await screen.findByRole('menu');
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Delete…' })).toHaveFocus();
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: 'Archive' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('menuitem', { name: 'Archive' })).toHaveFocus();
    await user.keyboard('d');
    expect(screen.getByRole('menuitem', { name: 'Delete…' })).toHaveFocus();
  });

  it('calls onSelect once per click, Enter and Space, then closes and returns the focus', async () => {
    const user = userEvent.setup();
    const onDup = vi.fn();
    render(<Demo onDup={onDup} />);
    await user.click(trigger());
    await user.click(await screen.findByRole('menuitem', { name: 'Duplicate' }));
    expect(onDup).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(trigger()).toHaveFocus());

    await user.keyboard('{Enter}');
    await screen.findByRole('menu');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onDup).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(trigger()).toHaveFocus());

    await user.keyboard('{Enter}');
    await screen.findByRole('menu');
    await user.keyboard('{ArrowDown} ');
    expect(onDup).toHaveBeenCalledTimes(3);
  });

  it('disabled: aria-disabled, no onSelect by click, keyboard or typeahead; respected when it changes while open', async () => {
    const user = userEvent.setup();
    const onDup = vi.fn();
    const { rerender } = render(<Demo onDup={onDup} disabledDup />);
    await user.click(trigger());
    const dup = await screen.findByRole('menuitem', { name: 'Duplicate' });
    expect(dup).toHaveAttribute('aria-disabled', 'true');
    await user.click(dup);
    // Typeahead skips the disabled item (the focus goes to "Delete…", never to "Duplicate").
    await user.keyboard('du');
    expect(dup).not.toHaveFocus();
    expect(onDup).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeInTheDocument();

    // enabled while open, then disabled again while open
    rerender(<Demo onDup={onDup} />);
    await user.click(screen.getByRole('menuitem', { name: 'Duplicate' }));
    expect(onDup).toHaveBeenCalledTimes(1);

    await user.click(trigger());
    const dup2 = await screen.findByRole('menuitem', { name: 'Duplicate' });
    rerender(<Demo onDup={onDup} disabledDup />);
    await user.click(dup2);
    expect(onDup).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('preventDefault in onSelect keeps the menu open', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn((e: Event) => e.preventDefault());
    render(<Demo onEdit={onEdit} />);
    await user.click(trigger());
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('Escape closes and returns the focus; Tab closes the menu', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Demo />
        <button>After</button>
      </>,
    );
    trigger().focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('menu');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(trigger()).toHaveFocus());
    await user.keyboard('{Enter}');
    await screen.findByRole('menu');
    await user.keyboard('{Tab}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('click outside closes it and returns the focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await user.click(trigger());
    await screen.findByRole('menu');
    // The body is `pointer-events: none` while a modal menu is open (that is the point): bypass the check.
    await userEvent.setup({ pointerEventsCheck: 0 }).click(document.body);
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(trigger()).toHaveFocus());
  });

  it('a disabled trigger opens neither by click nor by keyboard', async () => {
    const user = userEvent.setup();
    render(
      <Menu>
        <MenuTrigger disabled>Actions</MenuTrigger>
        <MenuContent>
          <MenuItem>One</MenuItem>
        </MenuContent>
      </Menu>,
    );
    await user.click(trigger());
    expect(screen.queryByRole('menu')).toBeNull();
    trigger().focus();
    await user.keyboard('{Enter}{ArrowDown}{ArrowUp}');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('a menu without enabled items opens on the panel, Escape closes, no loop', async () => {
    const user = userEvent.setup();
    render(
      <Menu>
        <MenuTrigger>Actions</MenuTrigger>
        <MenuContent>
          <MenuItem disabled>One</MenuItem>
        </MenuContent>
      </Menu>,
    );
    trigger().focus();
    await user.keyboard('{ArrowDown}');
    const menu = await screen.findByRole('menu');
    expect(menu).toHaveFocus();
    await user.keyboard('{ArrowDown}{ArrowUp}');
    expect(menu).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('external state: focus on the first item, aria-expanded, and the focus returns to the trigger', async () => {
    const user = userEvent.setup();
    function Controlled() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Open elsewhere</button>
          <Demo open={open} onOpenChange={setOpen} />
        </>
      );
    }
    render(<Controlled />);
    const elsewhere = screen.getByRole('button', { name: 'Open elsewhere' });
    await user.click(elsewhere);
    expect(await screen.findByRole('menuitem', { name: 'Rename' })).toHaveFocus();
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    // The opener was the button elsewhere: the focus goes back to what had it before.
    await waitFor(() => expect(elsewhere).toHaveFocus());
  });

  it('unmounting only the trigger while open closes the menu without moving the focus to an arbitrary node', async () => {
    const onOpenChange = vi.fn();
    function Host({ showTrigger }: { showTrigger: boolean }) {
      return (
        <Menu defaultOpen onOpenChange={onOpenChange}>
          {showTrigger ? <MenuTrigger>Actions</MenuTrigger> : null}
          <MenuContent>
            <MenuItem>One</MenuItem>
          </MenuContent>
        </Menu>
      );
    }
    const { rerender } = render(<Host showTrigger />);
    await screen.findByRole('menu');
    expect(onOpenChange).not.toHaveBeenCalled(); // not closed by the initial ref attach
    rerender(<Host showTrigger={false} />);
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(document.body.style.pointerEvents).not.toBe('none');
  });

  it('rapid open/close leaves no pointer-events: none on the body', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await user.dblClick(trigger());
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(document.body.style.pointerEvents).not.toBe('none'));
  });

  it('sits on the popover layer with no literal z-index, merges className and forwards refs', async () => {
    const user = userEvent.setup();
    const ref = createRef<HTMLDivElement>();
    const tref = createRef<HTMLButtonElement>();
    const iref = createRef<HTMLDivElement>();
    render(
      <Menu>
        <MenuTrigger ref={tref}>Actions</MenuTrigger>
        <MenuContent ref={ref} className="bg-rop-surface-subtle" data-x="1">
          <MenuItem ref={iref} className="font-bold" tone="danger">
            Delete…
          </MenuItem>
        </MenuContent>
      </Menu>,
    );
    await user.click(trigger());
    const menu = await screen.findByRole('menu');
    expect(ref.current).toBe(menu);
    expect(tref.current).toBe(trigger());
    expect(menu.className).toContain(overlayLayer.popover);
    expect(menu.className).not.toMatch(/\bz-\d/);
    expect(menu.className).toContain('bg-rop-surface-subtle');
    expect(menu.className).not.toContain('bg-rop-surface ');
    expect(menu).toHaveAttribute('data-x', '1');
    const item = screen.getByRole('menuitem', { name: 'Delete…' });
    expect(iref.current).toBe(item);
    expect(item.className).toContain('font-bold');
  });

  it('does not leak non-DOM props', async () => {
    const user = userEvent.setup();
    render(<Demo onDelete={() => undefined} />);
    await user.click(trigger());
    const item = await screen.findByRole('menuitem', { name: 'Delete…' });
    expect(item).not.toHaveAttribute('tone');
    expect(item).not.toHaveAttribute('onselect');
    expect(item.getAttributeNames().filter((n) => /^on/i.test(n))).toEqual([]);
    expect(item).toHaveAttribute('data-tone', 'danger');
  });

  it('throws a clear error outside <Menu>', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<MenuTrigger>x</MenuTrigger>)).toThrow(/must be rendered inside <Menu>/);
  });

  it('an item that opens a controlled Dialog: the dialog gets the focus and returns it to the trigger', async () => {
    const user = userEvent.setup();
    function Host() {
      const [dlg, setDlg] = useState(false);
      const tref = createRef<HTMLButtonElement>();
      return (
        <>
          <Menu>
            <MenuTrigger ref={tref}>Actions</MenuTrigger>
            <MenuContent>
              <MenuItem onSelect={() => setDlg(true)}>Delete…</MenuItem>
            </MenuContent>
          </Menu>
          <Dialog open={dlg} onOpenChange={setDlg}>
            <DialogContent returnFocusRef={tref}>
              <DialogTitle>Confirm</DialogTitle>
              <button>Inside</button>
            </DialogContent>
          </Dialog>
        </>
      );
    }
    render(<Host />);
    await user.click(trigger());
    await user.click(await screen.findByRole('menuitem', { name: 'Delete…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Confirm' });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(trigger()).toHaveFocus());
    expect(document.body.style.pointerEvents).not.toBe('none');
  });

  it('a press that opens nothing does not make a later opening from state skip the first item', async () => {
    const user = userEvent.setup();
    function Controlled() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Open elsewhere</button>
          {/* A consumer that refuses the user's opening and only opens from its own button. */}
          <Demo open={open} onOpenChange={(next) => !next && setOpen(false)} />
        </>
      );
    }
    render(<Controlled />);
    await user.click(trigger()); // refused: nothing opens
    expect(screen.queryByRole('menu')).toBeNull();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    await user.click(screen.getByRole('button', { name: 'Open elsewhere' }));
    expect(await screen.findByRole('menuitem', { name: 'Rename' })).toHaveFocus();
  });

  it('a right-button press on the trigger opens nothing', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await user.pointer({ keys: '[MouseRight>]', target: trigger() });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('every MenuLabel of a group names it, each with its own id', async () => {
    render(
      <Menu defaultOpen>
        <MenuTrigger>Actions</MenuTrigger>
        <MenuContent>
          <MenuGroup data-testid="group">
            <MenuLabel>First</MenuLabel>
            <MenuLabel>Second</MenuLabel>
            <MenuItem>One</MenuItem>
          </MenuGroup>
        </MenuContent>
      </Menu>,
    );
    const group = await screen.findByTestId('group');
    const ids = group.getAttribute('aria-labelledby')!.split(' ');
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(group).toHaveAccessibleName('First Second');
  });

  it('a consumer aria-labelledby composes with the MenuLabel ids instead of replacing them', async () => {
    render(
      <>
        <span id="shared-note">Shared note</span>
        <Menu defaultOpen>
          <MenuTrigger>Actions</MenuTrigger>
          <MenuContent>
            <MenuGroup data-testid="group" aria-labelledby="shared-note">
              <MenuLabel>Edit</MenuLabel>
              <MenuItem>One</MenuItem>
            </MenuGroup>
          </MenuContent>
        </Menu>
      </>,
    );
    const group = await screen.findByTestId('group');
    const ids = group.getAttribute('aria-labelledby')!.split(' ');
    expect(ids).toHaveLength(2);
    expect(ids).toContain('shared-note');
    expect(group).toHaveAccessibleName('Edit Shared note');
  });

  it('an unstable (inline) trigger ref does not close an open menu on re-render', async () => {
    const onOpenChange = vi.fn();
    function Host({ tick }: { tick: number }) {
      return (
        <Menu defaultOpen onOpenChange={onOpenChange}>
          <MenuTrigger ref={() => undefined} data-tick={tick}>
            Actions
          </MenuTrigger>
          <MenuContent>
            <MenuItem>One</MenuItem>
          </MenuContent>
        </Menu>
      );
    }
    const { rerender } = render(<Host tick={0} />);
    await screen.findByRole('menu');
    for (let i = 1; i <= 3; i++) rerender(<Host tick={i} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('unmounting the whole open Menu does not report a closing', async () => {
    const onOpenChange = vi.fn();
    const { unmount } = render(<Demo defaultOpen onOpenChange={onOpenChange} />);
    await screen.findByRole('menu');
    unmount();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('reports each user opening and closing once', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<Demo onOpenChange={onOpenChange} />);
    await user.click(trigger());
    await screen.findByRole('menu');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(onOpenChange.mock.calls).toEqual([[true], [false]]);
  });
});
