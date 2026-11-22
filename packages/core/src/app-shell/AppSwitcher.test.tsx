import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '../button/Button';
import { Dialog, DialogContent, DialogTitle } from '../dialog/Dialog';
import { useDirtyGuard } from '../object-page/use-dirty-guard';
import { overlayLayer } from '../overlay/layers';
import {
  AppSwitcher,
  appSwitcherProblems,
  resolveAppSwitcherForm,
  survivingFocusKey,
  type AppSwitcherProps,
} from './AppSwitcher';
import { APP_SHELL_NAV_BREAKPOINT } from './app-shell-styles';
import { APP_SHELL_WIDE_QUERY } from './breakpoint';
import type { AppDescriptor } from './types';

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

// jsdom does not navigate: the document listener records whether the browser's navigation was left alone, then
// cancels it so jsdom does not log "not implemented: navigation".
const clicks: boolean[] = [];
const record = (event: Event) => {
  clicks.push(event.defaultPrevented);
  event.preventDefault();
};

/** Stubs `matchMedia`: `wide` decides whether the app-shell breakpoint query matches. */
function viewport(wide: boolean) {
  const state = { wide };
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === APP_SHELL_WIDE_QUERY ? state.wide : false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
  return state;
}

beforeEach(() => {
  clicks.length = 0;
  document.addEventListener('click', record);
  viewport(true);
});
afterEach(() => {
  document.removeEventListener('click', record);
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const APPS: AppDescriptor[] = [
  { id: 'one', label: 'App one', href: '/one' },
  { id: 'two', label: 'App two', href: '/two' },
  { id: 'three', label: 'App three', href: '/three', disabled: true, disabledReason: 'No access' },
  { id: 'four', label: 'App four', href: '/four' },
];

const trigger = () => screen.getByRole('button', { name: /^Switch app/, hidden: true });

function renderSwitcher(props: Partial<AppSwitcherProps> = {}) {
  return render(<AppSwitcher apps={APPS} currentAppId="one" {...props} />);
}

async function openWithKeyboard(user: ReturnType<typeof userEvent.setup>) {
  act(() => trigger().focus());
  await user.keyboard('{Enter}');
}

describe('helpers', () => {
  it('resolveAppSwitcherForm: a fixed presentation wins, auto follows the viewport', () => {
    expect(resolveAppSwitcherForm('menu', () => false)).toBe('menu');
    expect(resolveAppSwitcherForm('sheet', () => true)).toBe('sheet');
    expect(resolveAppSwitcherForm('auto', () => true)).toBe('menu');
    expect(resolveAppSwitcherForm('auto', () => false)).toBe('sheet');
  });

  it('the breakpoint is the one of the app shell, 64rem', () => {
    expect(APP_SHELL_NAV_BREAKPOINT).toBe('64rem');
    expect(APP_SHELL_WIDE_QUERY).toBe('(min-width: 64rem)');
    expect(APP_SHELL_WIDE_QUERY).toBe(`(min-width: ${APP_SHELL_NAV_BREAKPOINT})`);
  });

  it('survivingFocusKey: the next candidate, else the previous one, else null', () => {
    const before = ['a', 'b', 'c', 'd'];
    expect(survivingFocusKey(before, 'b', (k) => k !== 'b')).toBe('c');
    expect(survivingFocusKey(before, 'b', (k) => k === 'a' || k === 'd')).toBe('d');
    expect(survivingFocusKey(before, 'd', (k) => k !== 'd')).toBe('c');
    expect(survivingFocusKey(before, 'b', () => false)).toBeNull();
    expect(survivingFocusKey(before, 'x', () => true)).toBeNull();
  });

  it('appSwitcherProblems: duplicate ids, empty labels, apps that open nothing', () => {
    expect(appSwitcherProblems(APPS, false)).toEqual([]);
    expect(
      appSwitcherProblems(
        [
          { id: 'a', label: 'A', href: '/a' },
          { id: 'a', label: ' ', href: '/b' },
          { id: 'c', label: 'C' },
          { id: 'd', label: 'D', disabled: true },
        ],
        false,
      ),
    ).toEqual([
      'two apps have the id "a": ids must be unique',
      'the app "a" has an empty label: its item has no accessible name',
      'the app "c" has no href and there is no onNavigate: its item opens nothing',
    ]);
    expect(appSwitcherProblems([{ id: 'c', label: 'C' }], true)).toEqual([]);
  });

  it('reports the problems in development', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<AppSwitcher apps={[{ id: 'c', label: 'C' }]} />);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('[formrail] <AppSwitcher>: the app "c" has no href'));
  });
});

describe('trigger', () => {
  it('a button named after the current app, showing its label, with aria-haspopup and aria-expanded', () => {
    renderSwitcher();
    const button = screen.getByRole('button', { name: 'Switch app, current: App one' });
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveTextContent('App one');
    expect(button).toHaveAttribute('aria-haspopup', 'menu');
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('labels: the trigger name is a function of the label; noCurrent when the current app is unknown', () => {
    const { rerender } = renderSwitcher({ labels: { trigger: (label) => `Change app (${label})` } });
    expect(screen.getByRole('button', { name: 'Change app (App one)' })).toBeInTheDocument();
    rerender(<AppSwitcher apps={APPS} currentAppId="missing" labels={{ noCurrent: 'Apps' }} />);
    const button = screen.getByRole('button', { name: 'Apps' });
    expect(button).toHaveTextContent('Apps');
    rerender(<AppSwitcher apps={APPS} />);
    expect(screen.getByRole('button', { name: 'Switch app' })).toHaveTextContent('Switch app');
  });

  it('closed, auto and menu render the same markup, without reading the viewport (no SSR mismatch)', () => {
    const matchMedia = vi.fn();
    vi.stubGlobal('matchMedia', matchMedia);
    const auto = renderToString(<AppSwitcher apps={APPS} currentAppId="one" presentation="auto" />);
    const menu = renderToString(<AppSwitcher apps={APPS} currentAppId="one" presentation="menu" />);
    expect(auto).toBe(menu);
    expect(matchMedia).not.toHaveBeenCalled();
    renderSwitcher({ presentation: 'auto' });
    expect(matchMedia).not.toHaveBeenCalled();
  });

  it('presentation="sheet" announces a dialog', () => {
    renderSwitcher({ presentation: 'sheet' });
    expect(trigger()).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('no component prop leaks to the DOM', () => {
    renderSwitcher({ presentation: 'menu', labels: { empty: 'x' }, className: 'my-class' });
    const button = trigger();
    for (const name of ['presentation', 'labels', 'apps', 'currentappid', 'onnavigate']) {
      expect(button.hasAttribute(name), name).toBe(false);
    }
    expect(button).toHaveClass('my-class');
  });

  it('forwards the ref to the trigger', () => {
    const ref = { current: null as HTMLButtonElement | null };
    render(<AppSwitcher ref={ref} apps={APPS} />);
    expect(ref.current).toBe(trigger());
  });
});

describe('Menu', () => {
  it('every app is a menu item; the current one has aria-current and a mark, the disabled one its reason', async () => {
    const user = userEvent.setup();
    renderSwitcher();
    await openWithKeyboard(user);
    const menu = await screen.findByRole('menu');
    expect(menu.className).toContain(overlayLayer.popover);
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    const one = within(menu).getByRole('menuitem', { name: 'App one' });
    expect(one).toHaveAttribute('aria-current', 'true');
    expect(one.querySelector('svg')).not.toBeNull();
    expect(one).toHaveAttribute('href', '/one');
    const three = within(menu).getByRole('menuitem', { name: 'App three' });
    expect(three).toHaveAccessibleDescription('No access');
    expect(three).not.toHaveAttribute('href');
    expect(within(menu).getByRole('menuitem', { name: 'App two' })).not.toHaveAttribute('aria-current');
  });

  it('the arrows skip the disabled app; Enter on another: closed, focus on the trigger, then onNavigate once', async () => {
    const user = userEvent.setup();
    const seen: { menuOpen: boolean; focused: Element | null }[] = [];
    const onNavigate = vi.fn(() => {
      seen.push({ menuOpen: !!document.querySelector('[role="menu"]'), focused: document.activeElement });
    });
    renderSwitcher({ onNavigate });
    await openWithKeyboard(user);
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'App one' })).toHaveFocus());
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'App two' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'App four' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ id: 'four' }), expect.anything());
    expect(seen).toEqual([{ menuOpen: false, focused: trigger() }]);
    expect(clicks).toEqual([true]);
  });

  it('typeahead matches the label and skips the disabled app', async () => {
    const user = userEvent.setup();
    renderSwitcher();
    await openWithKeyboard(user);
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'App one' })).toHaveFocus());
    await user.keyboard('App t');
    expect(screen.getByRole('menuitem', { name: 'App two' })).toHaveFocus();
  });

  it('choosing the current app closes the menu and calls nothing, with no browser navigation', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderSwitcher({ onNavigate });
    await openWithKeyboard(user);
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'App one' })).toHaveFocus());
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger()).toHaveFocus();
    expect(onNavigate).not.toHaveBeenCalled();
    expect(clicks).toEqual([true]);
  });

  it('Ctrl+click and the middle button are the browser\'s: onNavigate is not called', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderSwitcher({ onNavigate });
    await user.click(trigger());
    const two = await screen.findByRole('menuitem', { name: 'App two' });
    clicks.length = 0;
    fireEvent.click(two, { ctrlKey: true });
    expect(onNavigate).not.toHaveBeenCalled();
    expect(clicks).toEqual([false]);
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await user.click(trigger());
    fireEvent(
      await screen.findByRole('menuitem', { name: 'App two' }),
      new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }),
    );
    expect(onNavigate).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('an app without href is a menu item whose every click goes to onNavigate', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(
      <AppSwitcher
        apps={[...APPS, { id: 'five', label: 'App five' }]}
        currentAppId="one"
        onNavigate={onNavigate}
      />,
    );
    await user.click(trigger());
    const five = await screen.findByRole('menuitem', { name: 'App five' });
    expect(five.tagName).not.toBe('A');
    await user.click(five);
    expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ id: 'five' }), expect.anything());
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger()).toHaveFocus();
  });

  it('inside an open Dialog the menu is on the popover level, above the modal', async () => {
    const user = userEvent.setup();
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Host</DialogTitle>
          <AppSwitcher apps={APPS} currentAppId="one" />
        </DialogContent>
      </Dialog>,
    );
    await user.click(trigger());
    const menu = await screen.findByRole('menu');
    expect(menu.className).toContain(overlayLayer.popover);
    expect(menu.className).not.toMatch(/(^|\s)z-\d/);
  });
});

describe('Sheet', () => {
  it('auto below the breakpoint opens a Sheet titled sheetTitle, with the focus on the current app', async () => {
    viewport(false);
    const user = userEvent.setup();
    renderSwitcher({ currentAppId: 'two', labels: { sheetTitle: 'Apps' } });
    await openWithKeyboard(user);
    const sheet = await screen.findByRole('dialog', { name: 'Apps' });
    expect(sheet.className).toContain(overlayLayer.modal);
    expect(screen.queryByRole('menu')).toBeNull();
    const two = within(sheet).getByRole('link', { name: 'App two' });
    await waitFor(() => expect(two).toHaveFocus());
    expect(two).toHaveAttribute('aria-current', 'true');
    expect(trigger()).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(trigger()).toHaveAttribute('aria-controls', sheet.id);
    const three = within(sheet).getByRole('link', { name: 'App three' });
    expect(three).toHaveAttribute('aria-disabled', 'true');
    expect(three).not.toHaveAttribute('href');
    expect(three).toHaveAccessibleDescription('No access');
  });

  it('Escape closes the Sheet and the focus returns to the trigger', async () => {
    const user = userEvent.setup();
    renderSwitcher({ presentation: 'sheet' });
    await openWithKeyboard(user);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(trigger()).toHaveFocus());
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
  });

  it('a pointer press opens the Sheet on the click, and its focus returns to the trigger', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Button>Before</Button>
        <AppSwitcher apps={APPS} currentAppId="one" presentation="sheet" />
      </>,
    );
    act(() => screen.getByRole('button', { name: 'Before' }).focus());
    await user.click(trigger());
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(trigger()).toHaveFocus());
  });

  it('a plain click on an app: closed, focus on the trigger, then onNavigate once; the current app only closes', async () => {
    const user = userEvent.setup();
    const seen: { open: boolean; focused: Element | null }[] = [];
    const onNavigate = vi.fn(() => {
      seen.push({ open: !!document.querySelector('[role="dialog"][data-state="open"]'), focused: document.activeElement });
    });
    renderSwitcher({ presentation: 'sheet', onNavigate });
    await user.click(trigger());
    const two = within(await screen.findByRole('dialog')).getByRole('link', { name: 'App two' });
    clicks.length = 0;
    await user.click(two);
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([{ open: false, focused: trigger() }]);
    expect(clicks).toEqual([true]);

    await user.click(trigger());
    await user.click(within(await screen.findByRole('dialog')).getByRole('link', { name: 'App one' }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('Enter on an app navigates; a disabled app does nothing', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderSwitcher({ presentation: 'sheet', onNavigate });
    await openWithKeyboard(user);
    const sheet = await screen.findByRole('dialog');
    await user.click(within(sheet).getByRole('link', { name: 'App three' }));
    expect(onNavigate).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    act(() => within(sheet).getByRole('link', { name: 'App four' }).focus());
    await user.keyboard('{Enter}');
    expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ id: 'four' }), expect.anything());
  });

  it('Ctrl+click is the browser\'s: not cancelled, no onNavigate, the Sheet closes', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderSwitcher({ presentation: 'sheet', onNavigate });
    await user.click(trigger());
    const two = within(await screen.findByRole('dialog')).getByRole('link', { name: 'App two' });
    clicks.length = 0;
    fireEvent.click(two, { ctrlKey: true });
    expect(onNavigate).not.toHaveBeenCalled();
    expect(clicks).toEqual([false]);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('the form chosen at opening is kept while open, even if the viewport crosses the breakpoint', async () => {
    const state = viewport(false);
    const user = userEvent.setup();
    renderSwitcher();
    await openWithKeyboard(user);
    await screen.findByRole('dialog');
    state.wide = true;
    renderSwitcher();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    cleanup();
    renderSwitcher();
    await openWithKeyboard(user);
    expect(await screen.findByRole('menu')).toBeInTheDocument();
  });
});

describe('edge cases', () => {
  for (const presentation of ['menu', 'sheet'] as const) {
    it(`${presentation}: no app besides the current one shows the empty text; the trigger stays`, async () => {
      const user = userEvent.setup();
      const { rerender } = render(<AppSwitcher apps={[]} presentation={presentation} />);
      expect(screen.getByRole('button', { name: 'Switch app' })).toBeEnabled();
      await openWithKeyboard(user);
      expect(await screen.findByText('No other apps available')).toBeInTheDocument();
      expect(screen.queryAllByRole(presentation === 'menu' ? 'menuitem' : 'link')).toHaveLength(0);
      rerender(<AppSwitcher apps={[APPS[0]!]} currentAppId="one" presentation={presentation} labels={{ empty: 'Nothing else' }} />);
      expect(screen.getByText('Nothing else')).toBeInTheDocument();
    });

    it(`${presentation}: the focused app leaving the list moves the focus to the next one, the list stays open`, async () => {
      const user = userEvent.setup();
      function Demo() {
        const [apps, setApps] = useState(APPS);
        return (
          <>
            <AppSwitcher apps={apps} currentAppId="one" presentation={presentation} />
            <button type="button" data-testid="remove" onClick={() => setApps((list) => list.filter((a) => a.id !== 'two'))} />
          </>
        );
      }
      render(<Demo />);
      await openWithKeyboard(user);
      const role = presentation === 'menu' ? 'menuitem' : 'link';
      await waitFor(() => expect(screen.getByRole(role, { name: 'App one' })).toHaveFocus());
      act(() => screen.getByRole(role, { name: 'App two' }).focus());
      fireEvent.click(screen.getByTestId('remove'));
      expect(screen.queryByRole(role, { name: 'App two' })).toBeNull();
      // The menu skips the disabled App three; the Sheet keeps its focus stop.
      expect(screen.getByRole(role, { name: presentation === 'menu' ? 'App four' : 'App three' })).toHaveFocus();
      expect(screen.getByRole(presentation === 'menu' ? 'menu' : 'dialog')).toBeInTheDocument();
    });

    it(`${presentation}: unmounting the switcher with the list open throws nothing`, async () => {
      const user = userEvent.setup();
      const error = vi.spyOn(console, 'error');
      const { unmount } = renderSwitcher({ presentation });
      await openWithKeyboard(user);
      await screen.findByRole(presentation === 'menu' ? 'menu' : 'dialog');
      unmount();
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      expect(screen.queryByRole('menu')).toBeNull();
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(error).not.toHaveBeenCalled();
    });

    it(`${presentation}: an onNavigate that throws finds the list closed, and the error propagates`, async () => {
      const boom = new Error('boom');
      const caught: unknown[] = [];
      const onError = (event: ErrorEvent) => {
        caught.push(event.error);
        event.preventDefault();
      };
      window.addEventListener('error', onError);
      let openInside = true;
      const user = userEvent.setup();
      renderSwitcher({
        presentation,
        onNavigate: () => {
          openInside = !!document.querySelector('[role="menu"], [role="dialog"][data-state="open"]');
          throw boom;
        },
      });
      await openWithKeyboard(user);
      const role = presentation === 'menu' ? 'menuitem' : 'link';
      await waitFor(() => expect(screen.getByRole(role, { name: 'App one' })).toHaveFocus());
      act(() => screen.getByRole(role, { name: 'App two' }).focus());
      await user.keyboard('{Enter}');
      window.removeEventListener('error', onError);
      expect(openInside).toBe(false);
      expect(caught).toContain(boom);
    });

    it(`${presentation}: through useDirtyGuard, "Keep editing" returns the focus to the trigger, "Leave" navigates`, async () => {
      const user = userEvent.setup();
      const navigate = vi.fn();
      function Page() {
        const { guard, dialog } = useDirtyGuard({ when: true });
        return (
          <>
            <AppSwitcher
              apps={APPS}
              currentAppId="one"
              presentation={presentation}
              onNavigate={(app) => guard(() => navigate(app.id))}
            />
            {dialog}
          </>
        );
      }
      render(<Page />);
      const role = presentation === 'menu' ? 'menuitem' : 'link';
      await openWithKeyboard(user);
      await waitFor(() => expect(screen.getByRole(role, { name: 'App one' })).toHaveFocus());
      act(() => screen.getByRole(role, { name: 'App two' }).focus());
      await user.keyboard('{Enter}');
      const dialog = await screen.findByRole('dialog', { name: 'Unsaved changes' });
      await user.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
      await waitFor(() => expect(trigger()).toHaveFocus());
      expect(navigate).not.toHaveBeenCalled();

      await openWithKeyboard(user);
      await waitFor(() => expect(screen.getByRole(role, { name: 'App one' })).toHaveFocus());
      act(() => screen.getByRole(role, { name: 'App two' }).focus());
      await user.keyboard('{Enter}');
      await user.click(within(await screen.findByRole('dialog', { name: 'Unsaved changes' })).getByRole('button', { name: 'Leave without saving' }));
      expect(navigate).toHaveBeenCalledTimes(1);
      expect(navigate).toHaveBeenCalledWith('two');
    });
  }
});
