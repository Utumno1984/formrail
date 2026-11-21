import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dialog, DialogContent, DialogTitle } from '../dialog/Dialog';
import { overlayLayer } from '../overlay/layers';
import { Menu, MenuContent, MenuItem, MenuLinkItem, MenuTrigger, type MenuLinkItemProps } from './Menu';

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

// jsdom does not navigate: the document listener records whether the browser's navigation was left alone,
// then cancels it so jsdom does not log "not implemented: navigation".
const clicks: { defaultPrevented: boolean }[] = [];
const record = (event: Event) => {
  clicks.push({ defaultPrevented: event.defaultPrevented });
  event.preventDefault();
};
beforeEach(() => {
  clicks.length = 0;
  document.addEventListener('click', record);
});
afterEach(() => {
  document.removeEventListener('click', record);
  cleanup();
  vi.restoreAllMocks();
});

const trigger = () => screen.getByRole('button', { name: 'Apps', hidden: true });

function Demo({ link, onOpenChange }: { link?: Partial<MenuLinkItemProps>; onOpenChange?: (o: boolean) => void }) {
  return (
    <Menu onOpenChange={onOpenChange}>
      <MenuTrigger>Apps</MenuTrigger>
      <MenuContent>
        <MenuItem>First</MenuItem>
        <MenuLinkItem href="/x" {...link}>
          Orders
        </MenuLinkItem>
        <MenuLinkItem href="/y" disabled>
          Billing
        </MenuLinkItem>
        <MenuLinkItem href="/z">Reports</MenuLinkItem>
      </MenuContent>
    </Menu>
  );
}

async function openWithKeyboard(user: ReturnType<typeof userEvent.setup>) {
  trigger().focus();
  await user.keyboard('{Enter}');
  await screen.findByRole('menu');
}

describe('MenuLinkItem', () => {
  it('renders a real <a role="menuitem" href>', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await openWithKeyboard(user);
    const item = screen.getByRole('menuitem', { name: 'Orders' });
    expect(item.tagName).toBe('A');
    expect(item).toHaveAttribute('href', '/x');
  });

  it('a click without onNavigate leaves the browser navigation alone and closes the menu', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await openWithKeyboard(user);
    await user.click(screen.getByRole('menuitem', { name: 'Orders' }));
    expect(clicks).toEqual([{ defaultPrevented: false }]);
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('Enter without onNavigate activates the link and closes the menu', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await openWithKeyboard(user);
    await user.keyboard('{ArrowDown}{Enter}');
    expect(clicks).toEqual([{ defaultPrevented: false }]);
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('Space does not navigate and keeps the menu open', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(<Demo link={{ onNavigate }} />);
    await openWithKeyboard(user);
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Orders' })).toHaveFocus();
    await user.keyboard(' ');
    expect(onNavigate).not.toHaveBeenCalled();
    expect(clicks).toEqual([]);
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('onNavigate: a plain click cancels the native navigation, calls it once, closes the menu', async () => {
    const onNavigate = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<Demo link={{ onNavigate }} onOpenChange={onOpenChange} />);
    await openWithKeyboard(user);
    await user.click(screen.getByRole('menuitem', { name: 'Orders' }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(clicks).toEqual([{ defaultPrevented: true }]);
    expect(onOpenChange.mock.calls).toEqual([[true], [false]]);
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('onNavigate: Enter calls it once', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(<Demo link={{ onNavigate }} />);
    await openWithKeyboard(user);
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(clicks).toEqual([{ defaultPrevented: true }]);
  });

  it('onNavigate runs after the menu closed and the focus is on the trigger', async () => {
    let seen: { active: Element | null; menu: boolean } | undefined;
    const onNavigate = vi.fn(() => {
      seen = { active: document.activeElement, menu: !!document.querySelector('[role="menu"]') };
    });
    const user = userEvent.setup();
    render(<Demo link={{ onNavigate }} />);
    await openWithKeyboard(user);
    await user.keyboard('{ArrowDown}{Enter}');
    expect(seen?.menu).toBe(false);
    expect(seen?.active).toBe(trigger());
  });

  it.each([
    ['Ctrl', { ctrlKey: true }],
    ['Meta', { metaKey: true }],
    ['Shift', { shiftKey: true }],
  ])("onNavigate: a %s+click is the browser's: not called, not cancelled, menu closes", async (_name, init) => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(<Demo link={{ onNavigate }} />);
    await openWithKeyboard(user);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Orders' }), init);
    expect(onNavigate).not.toHaveBeenCalled();
    expect(clicks).toEqual([{ defaultPrevented: false }]);
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('onNavigate: a middle or right button click is not handed to the app', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(<Demo link={{ onNavigate }} />);
    await openWithKeyboard(user);
    const item = screen.getByRole('menuitem', { name: 'Orders' });
    fireEvent.click(item, { button: 1 });
    fireEvent.contextMenu(item);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('a disabled item has no href, aria-disabled, and never navigates', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(<Demo link={{ onNavigate, disabled: true }} />);
    await openWithKeyboard(user);
    const item = screen.getByRole('menuitem', { name: 'Orders' });
    expect(item).not.toHaveAttribute('href');
    expect(item).toHaveAttribute('aria-disabled', 'true');
    await user.click(item);
    fireEvent.keyDown(item, { key: 'Enter' });
    expect(onNavigate).not.toHaveBeenCalled();
    expect(clicks.every((c) => c.defaultPrevented)).toBe(true);
  });

  it('a disabled item is skipped by the arrows; the order is kept in a mixed menu', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await openWithKeyboard(user);
    expect(screen.getByRole('menuitem', { name: 'First' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Orders' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Reports' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'First' })).toHaveFocus();
  });

  it('typeahead and Home / End include link items', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await openWithKeyboard(user);
    await user.keyboard('r');
    expect(screen.getByRole('menuitem', { name: 'Reports' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('menuitem', { name: 'First' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('menuitem', { name: 'Reports' })).toHaveFocus();
  });

  it('typeahead does not land on a disabled link item', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await openWithKeyboard(user);
    await user.keyboard('b');
    expect(screen.getByRole('menuitem', { name: 'First' })).toHaveFocus();
  });

  it('disabled becoming true while open applies at once', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<Demo link={{ onNavigate }} />);
    await openWithKeyboard(user);
    rerender(<Demo link={{ onNavigate, disabled: true }} />);
    const item = screen.getByRole('menuitem', { name: 'Orders' });
    expect(item).not.toHaveAttribute('href');
    await user.click(item);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('aria-current arrives on the DOM and no non-DOM prop leaks', async () => {
    const user = userEvent.setup();
    render(<Demo link={{ 'aria-current': 'page', onNavigate: vi.fn(), tone: 'danger', textValue: 'Orders text' }} />);
    await openWithKeyboard(user);
    const item = screen.getByRole('menuitem', { name: 'Orders' });
    expect(item).toHaveAttribute('aria-current', 'page');
    for (const name of ['onnavigate', 'onNavigate', 'tone', 'textvalue', 'textValue']) {
      expect(item.hasAttribute(name)).toBe(false);
    }
    expect(item).toHaveAttribute('data-tone', 'danger');
  });

  it('a missing href on an enabled item is a development error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = userEvent.setup();
    render(<Demo link={{ href: '' }} />);
    await openWithKeyboard(user);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('<MenuLinkItem>'));
  });

  it('an onNavigate that throws: the menu is already closed and the error is not swallowed', async () => {
    const boom = new Error('boom');
    const caught: unknown[] = [];
    const onError = (event: ErrorEvent) => {
      caught.push(event.error);
      event.preventDefault();
    };
    window.addEventListener('error', onError);
    let menuOpenInside = true;
    const user = userEvent.setup();
    render(
      <Demo
        link={{
          onNavigate: () => {
            menuOpenInside = !!document.querySelector('[role="menu"]');
            throw boom;
          },
        }}
      />,
    );
    await openWithKeyboard(user);
    await user.keyboard('{ArrowDown}{Enter}');
    window.removeEventListener('error', onError);
    expect(menuOpenInside).toBe(false);
    expect(caught).toContain(boom);
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('onNavigate opening a Dialog: the focus is left to the dialog, and returns to the trigger on close', async () => {
    function Wrapper() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <Menu>
            <MenuTrigger>Apps</MenuTrigger>
            <MenuContent>
              <MenuLinkItem href="/x" onNavigate={() => setOpen(true)}>
                Orders
              </MenuLinkItem>
            </MenuContent>
          </Menu>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
              <DialogTitle>Unsaved changes</DialogTitle>
              <button type="button">Stay</button>
            </DialogContent>
          </Dialog>
        </>
      );
    }
    const user = userEvent.setup();
    render(<Wrapper />);
    await openWithKeyboard(user);
    await user.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog');
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(trigger()).toHaveFocus());
  });

  it('sits on the popover layer, above a Dialog', async () => {
    const user = userEvent.setup();
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Title</DialogTitle>
          <Menu>
            <MenuTrigger>Apps</MenuTrigger>
            <MenuContent>
              <MenuLinkItem href="/x">Orders</MenuLinkItem>
            </MenuContent>
          </Menu>
        </DialogContent>
      </Dialog>,
    );
    await user.click(screen.getByRole('button', { name: 'Apps' }));
    const menu = await screen.findByRole('menu');
    expect(menu.className).toContain(overlayLayer.popover);
  });
});
