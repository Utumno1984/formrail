import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, forwardRef, useState, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDirtyGuard } from '../object-page/use-dirty-guard';
import { overlayLayer } from '../overlay/layers';
import {
  AppShell,
  AppShellHeader,
  AppShellMain,
  AppShellNav,
  AppShellNavLink,
  AppShellNavTrigger,
  navFocusTarget,
  watchWideViewport,
  wideViewport,
  type AppShellNavLinkProps,
  type AppShellNavProps,
  type AppShellProps,
} from './AppShell';
import { APP_SHELL_NAV_BREAKPOINT, navTriggerClass } from './app-shell-styles';
import { APP_SHELL_WIDE_QUERY } from './breakpoint';

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

/**
 * A `matchMedia` whose breakpoint query follows `state.wide`, with the `change` listeners kept, so that a test can
 * move the viewport across the breakpoint (`cross`).
 */
function viewport(wide: boolean) {
  const state = { wide };
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return query === APP_SHELL_WIDE_QUERY ? state.wide : false;
    },
    media: query,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
  }));
  return {
    listeners,
    cross(next: boolean) {
      state.wide = next;
      act(() => {
        for (const listener of [...listeners]) listener({ matches: next } as MediaQueryListEvent);
      });
    },
  };
}

/**
 * Gives the modal panels an exit animation that never ends, as in a browser without reduced motion: jsdom has no CSS,
 * so a closed Sheet would leave the DOM at once. Radix's Presence reads `animationName` (an exit that differs from the
 * entry keeps the nodes mounted); the panel's own safety net removes them after the animation's duration (0 here)
 * plus 500ms, the "end of the animation".
 */
function animateModalExit() {
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
    const style = real(element, pseudo);
    const modal = element.matches('[role="dialog"]') || !!element.querySelector(':scope > [role="dialog"]');
    if (!modal) return style;
    return new Proxy(style, {
      get(target, key) {
        if (key === 'animationName') return element.getAttribute('data-state') === 'closed' ? 'rop-out' : 'rop-in';
        const value = Reflect.get(target, key) as unknown;
        return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
      },
    });
  });
}

/**
 * The column as the browser sees it below the breakpoint, at the new size: not displayed (jsdom has no CSS; an inline
 * `display: none` would also keep jsdom from moving the focus out of it).
 */
function hideColumn() {
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
    const style = real(element, pseudo);
    if (!element.matches('[data-rop-app-shell-nav]')) return style;
    return new Proxy(style, {
      get(target, key) {
        if (key === 'display') return 'none';
        const value = Reflect.get(target, key) as unknown;
        return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
      },
    });
  });
}

let screenSize: ReturnType<typeof viewport>;
beforeEach(() => {
  clicks.length = 0;
  document.addEventListener('click', record);
  screenSize = viewport(false);
});
afterEach(() => {
  document.removeEventListener('click', record);
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const SECTIONS = ['A', 'B', 'C'];

interface ShellProps extends Partial<AppShellProps> {
  active?: string;
  onNavigate?: (section: string) => void;
  link?: (section: string) => Partial<AppShellNavLinkProps>;
  navProps?: Omit<AppShellNavProps, 'children'>;
  trigger?: ReactNode;
  extra?: ReactNode;
}

/** A shell with a trigger in the header and three links (Section A active by default). */
function Shell({ active = 'A', onNavigate, link, navProps, trigger = <AppShellNavTrigger />, extra, ...shell }: ShellProps) {
  return (
    <AppShell {...shell}>
      <AppShellHeader start={trigger} />
      <AppShellNav {...navProps}>
        {SECTIONS.map((section) => (
          <AppShellNavLink
            key={section}
            id={`link-${section}`}
            href={`/${section.toLowerCase()}`}
            active={section === active}
            onNavigate={onNavigate && (() => onNavigate(section))}
            {...link?.(section)}
          >
            Section {section}
          </AppShellNavLink>
        ))}
      </AppShellNav>
      <AppShellMain>
        <h1 id="page-title" tabIndex={-1}>
          Page
        </h1>
        {extra}
      </AppShellMain>
    </AppShell>
  );
}

const trigger = () => screen.getByRole('button', { name: 'Open navigation', hidden: true });
const column = () => document.querySelector<HTMLElement>('[data-rop-app-shell-nav]')!;
const sheetNav = () => document.querySelector<HTMLElement>('[data-rop-app-shell-nav-sheet-nav]');
const openSheet = () => document.querySelector('[role="dialog"][data-state="open"]');
const linkIn = (container: HTMLElement | null, section: string) =>
  within(container!).getByRole('link', { name: `Section ${section}`, hidden: true });

async function openWithKeyboard(user: ReturnType<typeof userEvent.setup>) {
  act(() => trigger().focus());
  await user.keyboard('{Enter}');
  return screen.findByRole('dialog');
}

describe('helpers', () => {
  it('wideViewport: the breakpoint query; false without a window, without matchMedia or with one that throws', () => {
    expect(wideViewport(window)).toBe(false);
    screenSize.cross(true);
    expect(wideViewport(window)).toBe(true);
    expect(wideViewport(null)).toBe(false);
    expect(wideViewport({} as Window)).toBe(false);
    const throwing = {
      matchMedia: () => {
        throw new Error('restricted');
      },
    } as unknown as Window;
    expect(wideViewport(throwing)).toBe(false);
  });

  it('watchWideViewport: calls back on each crossing, stops when asked; nothing to watch without matchMedia', () => {
    const onChange = vi.fn();
    const stop = watchWideViewport(window, onChange);
    expect(screenSize.listeners.size).toBe(1);
    screenSize.cross(true);
    screenSize.cross(false);
    expect(onChange.mock.calls).toEqual([[true], [false]]);
    stop();
    expect(screenSize.listeners.size).toBe(0);
    for (const view of [null, {} as Window, { matchMedia: () => { throw new Error('restricted'); } } as unknown as Window]) {
      const off = watchWideViewport(view, onChange);
      expect(() => off()).not.toThrow();
    }
  });

  it('navFocusTarget: the current page, else the first link that can be followed, else the first link, else null', () => {
    const box = (html: string) => {
      const el = document.createElement('div');
      el.innerHTML = html;
      return el;
    };
    const link = (name: string, attrs = '') => `<a data-rop-app-shell-nav-link="" ${attrs}>${name}</a>`;
    expect(navFocusTarget(null)).toBeNull();
    expect(navFocusTarget(box('<p>no link</p>'))).toBeNull();
    expect(navFocusTarget(box(link('a') + link('b', 'aria-current="page"')))?.textContent).toBe('b');
    expect(navFocusTarget(box(link('a', 'aria-disabled="true"') + link('b')))?.textContent).toBe('b');
    expect(navFocusTarget(box(link('a', 'aria-disabled="true"') + link('b', 'aria-disabled="true"')))?.textContent).toBe('a');
  });

  it('the trigger is shown below the breakpoint only, with the same value as the column (one source)', () => {
    expect(navTriggerClass).toBe(`min-[${APP_SHELL_NAV_BREAKPOINT}]:hidden`);
  });
});

describe('AppShellNavTrigger', () => {
  it('an icon button named "Open navigation", announcing a dialog, collapsed, with no aria-controls while closed', () => {
    render(<Shell />);
    const button = trigger();
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).not.toHaveAttribute('aria-controls');
    expect(button).toHaveClass('min-[64rem]:hidden');
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('labels.openNav names it; its own aria-label wins; a className is merged', () => {
    const { rerender } = render(<Shell labels={{ openNav: 'Apri navigazione' }} />);
    expect(screen.getByRole('button', { name: 'Apri navigazione' })).toBeInTheDocument();
    rerender(<Shell labels={{ openNav: 'Apri navigazione' }} trigger={<AppShellNavTrigger aria-label="Menu" className="size-11" />} />);
    const button = screen.getByRole('button', { name: 'Menu' });
    expect(button).toHaveClass('size-11', 'min-[64rem]:hidden');
    expect(button).not.toHaveClass('size-9');
  });

  it('must be rendered inside an AppShell', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<AppShellNavTrigger />)).toThrow('[formrail] <AppShellNavTrigger> must be rendered inside <AppShell>.');
  });

  it('forwards the ref to the button, and no prop leaks onto the DOM', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Shell trigger={<AppShellNavTrigger ref={ref} />} />);
    expect(ref.current).toBe(trigger());
    expect(trigger().outerHTML).not.toMatch(/\s(variant|size|labels|navsheet)=/i);
  });

  it('opening: expanded, aria-controls on the Sheet, which is on the modal level and comes from the left edge', async () => {
    const user = userEvent.setup();
    render(<Shell />);
    const sheet = await openWithKeyboard(user);
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(trigger()).toHaveAttribute('aria-controls', sheet.id);
    expect(sheet.id).not.toBe('');
    expect(sheet.className).toContain(overlayLayer.modal);
    expect(sheet).toHaveClass('left-0');
    expect(sheet).not.toHaveAttribute('aria-describedby');
  });

  it('in a right-to-left page the Sheet comes from the right edge (the start edge)', async () => {
    const user = userEvent.setup();
    render(<Shell trigger={<AppShellNavTrigger style={{ direction: 'rtl' }} />} />);
    const sheet = await openWithKeyboard(user);
    expect(sheet).toHaveClass('right-0');
    expect(sheet).not.toHaveClass('left-0');
  });

  it('onClick runs first and can keep the Sheet closed', () => {
    const onClick = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(<Shell trigger={<AppShellNavTrigger onClick={onClick} />} />);
    fireEvent.click(trigger());
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
  });

  it('a press that ends in no click opens nothing (the Sheet opens on the click)', () => {
    render(<Shell />);
    fireEvent.pointerDown(trigger(), { button: 0, pointerType: 'mouse' });
    fireEvent.mouseDown(trigger(), { button: 0 });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(trigger());
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('in a shell without AppShellNav it opens nothing', () => {
    render(
      <AppShell>
        <AppShellHeader start={<AppShellNavTrigger />} />
        <AppShellMain />
      </AppShell>,
    );
    fireEvent.click(trigger());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
  });

  it('a nav that unmounts takes the Sheet away: the trigger opens nothing any more', () => {
    function Page() {
      const [nav, setNav] = useState(true);
      return (
        <AppShell>
          <AppShellHeader start={<AppShellNavTrigger />} end={<button type="button" onClick={() => setNav(false)}>Drop</button>} />
          {nav ? (
            <AppShellNav>
              <AppShellNavLink href="/a">Section A</AppShellNavLink>
            </AppShellNav>
          ) : null}
          <AppShellMain />
        </AppShell>
      );
    }
    render(<Page />);
    fireEvent.click(screen.getByRole('button', { name: 'Drop' }));
    fireEvent.click(trigger());
    expect(screen.queryByRole('dialog')).toBeNull();
    // Nothing was opened, not even a Sheet with nothing to show: the trigger does not announce one.
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(trigger()).not.toHaveAttribute('aria-controls');
  });

  for (const wide of [true, false]) {
    it(`a nav unmounted with the Sheet open closes it; mounted again (${wide ? 'wide' : 'narrow'}) it opens nothing`, async () => {
      const user = userEvent.setup();
      let showNav: (shown: boolean) => void = () => undefined;
      function Page() {
        const [nav, setNav] = useState(true);
        showNav = setNav;
        return (
          <AppShell>
            <AppShellHeader start={<AppShellNavTrigger />} end={<button type="button">Elsewhere</button>} />
            {nav ? (
              <AppShellNav>
                <AppShellNavLink href="/a">Section A</AppShellNavLink>
              </AppShellNav>
            ) : null}
            <AppShellMain />
          </AppShell>
        );
      }
      render(<Page />);
      await openWithKeyboard(user);
      act(() => showNav(false));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(trigger()).toHaveAttribute('aria-expanded', 'false');
      expect(trigger()).not.toHaveAttribute('aria-controls');
      // The page is not inert any more: the user moves on, then the nav comes back.
      const elsewhere = screen.getByRole('button', { name: 'Elsewhere' });
      act(() => elsewhere.focus());
      if (wide) screenSize.cross(true);
      act(() => showNav(true));
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      expect(trigger()).toHaveAttribute('aria-expanded', 'false');
      expect(trigger()).not.toHaveAttribute('aria-controls');
      expect(elsewhere).toHaveFocus();
      // The links are in the column, and the trigger opens the Sheet again.
      expect(linkIn(column(), 'A')).toBeInTheDocument();
      if (wide) screenSize.cross(false);
      await openWithKeyboard(user);
      expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    });
  }

  it('on a wide viewport (a click made in code) it opens nothing: the column is there', () => {
    screenSize.cross(true);
    render(<Shell />);
    fireEvent.click(trigger());
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('without matchMedia, or with one that throws, the click opens the Sheet (the CSS decides what is displayed)', () => {
    vi.stubGlobal('matchMedia', undefined);
    const { unmount } = render(<Shell />);
    fireEvent.click(trigger());
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    unmount();
    vi.stubGlobal('matchMedia', () => {
      throw new Error('restricted');
    });
    render(<Shell />);
    fireEvent.click(trigger());
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('the Sheet', () => {
  it('titled with the navigation name, a nav with that name, the focus on the current link, the links mounted once', async () => {
    const user = userEvent.setup();
    render(<Shell active="B" />);
    const sheet = await openWithKeyboard(user);
    expect(sheet).toHaveAccessibleName('Main');
    expect(within(sheet).getByRole('heading', { name: 'Main' })).toBeInTheDocument();
    // The rest of the page is hidden from assistive technology: one navigation named Main, the Sheet's.
    const navs = screen.getAllByRole('navigation', { name: 'Main' });
    expect(navs).toEqual([sheetNav()]);
    await waitFor(() => expect(linkIn(sheet, 'B')).toHaveFocus());
    // Mounted once: the column is empty, every id is unique.
    expect(column().querySelectorAll('[data-rop-app-shell-nav-link]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-rop-app-shell-nav-link]')).toHaveLength(3);
    const ids = [...document.querySelectorAll('[id]')].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(sheet).toHaveAttribute('aria-modal', 'true');
  });

  it('a trigger mounted again while the Sheet is open (a new key): Escape gives the focus to the new trigger', async () => {
    const user = userEvent.setup();
    let remount: () => void = () => undefined;
    function Page() {
      const [key, setKey] = useState(0);
      remount = () => setKey((k) => k + 1);
      return <Shell trigger={<AppShellNavTrigger key={key} />} />;
    }
    render(<Page />);
    const before = trigger();
    const sheet = await openWithKeyboard(user);
    await waitFor(() => expect(linkIn(sheet, 'A')).toHaveFocus());
    act(() => remount());
    expect(trigger()).not.toBe(before);
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(trigger()).toHaveFocus());
  });

  it('with no current page the focus starts on the first link that can be followed', async () => {
    const user = userEvent.setup();
    render(<Shell active="none" link={(section) => (section === 'A' ? { disabled: true } : {})} />);
    const sheet = await openWithKeyboard(user);
    await waitFor(() => expect(linkIn(sheet, 'B')).toHaveFocus());
  });

  it('Escape closes it, the focus goes back to the trigger and the links back to the column', async () => {
    const user = userEvent.setup();
    render(<Shell />);
    const sheet = await openWithKeyboard(user);
    await waitFor(() => expect(linkIn(sheet, 'A')).toHaveFocus());
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(trigger()).toHaveFocus());
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(trigger()).not.toHaveAttribute('aria-controls');
    expect(column().querySelectorAll('[data-rop-app-shell-nav-link]')).toHaveLength(3);
  });

  it('opened by a click that did not focus the trigger, it still gives the focus back to the trigger', async () => {
    const user = userEvent.setup();
    render(<Shell />);
    act(() => document.getElementById('page-title')!.focus());
    fireEvent.click(trigger());
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(trigger()).toHaveFocus());
  });

  it('the links stay in the Sheet during its exit animation, and go back to the column once it has left', async () => {
    animateModalExit();
    const user = userEvent.setup();
    render(<Shell />);
    await openWithKeyboard(user);
    await user.keyboard('{Escape}');
    expect(document.querySelector('[role="dialog"][data-state="closed"]')).not.toBeNull();
    expect(sheetNav()!.querySelectorAll('[data-rop-app-shell-nav-link]')).toHaveLength(3);
    expect(column().querySelectorAll('[data-rop-app-shell-nav-link]')).toHaveLength(0);
    await waitFor(() => expect(screen.queryByRole('dialog', { hidden: true })).toBeNull(), { timeout: 2000 });
    expect(column().querySelectorAll('[data-rop-app-shell-nav-link]')).toHaveLength(3);
    await waitFor(() => expect(trigger()).toHaveFocus());
  });

  it('the title and the nav follow the aria-label, or the text aria-labelledby points to, of AppShellNav', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Shell navProps={{ 'aria-label': 'Sections' }} labels={{ nav: 'Ignored' }} />);
    let sheet = await openWithKeyboard(user);
    expect(sheet).toHaveAccessibleName('Sections');
    expect(within(sheet).getByRole('navigation', { name: 'Sections' })).toBe(sheetNav());
    unmount();

    function Labelled() {
      const [text, setText] = useState('Pages');
      return (
        <Shell
          navProps={{ 'aria-labelledby': 'nav-title' }}
          extra={
            <>
              <h2 id="nav-title">{text}</h2>
              <button type="button" onClick={() => setText('Sections of the app')}>
                Rename
              </button>
            </>
          }
        />
      );
    }
    render(<Labelled />);
    sheet = await openWithKeyboard(user);
    expect(sheet).toHaveAccessibleName('Pages');
    expect(sheetNav()).toHaveAttribute('aria-labelledby', 'nav-title');
    expect(sheetNav()).not.toHaveAttribute('aria-label');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // Read again at the next opening.
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    sheet = await openWithKeyboard(user);
    expect(sheet).toHaveAccessibleName('Sections of the app');
  });

  it('with aria-labelledby the title reads as the name: the texts trimmed, one space apart, a missing id skipped', async () => {
    const user = userEvent.setup();
    render(
      <Shell
        navProps={{ 'aria-labelledby': 'part-one missing part-two' }}
        extra={
          <p>
            <span id="part-one">{'  Pages  '}</span>
            <span id="part-two">{'\n  of the app \n'}</span>
          </p>
        }
      />,
    );
    const sheet = await openWithKeyboard(user);
    expect(within(sheet).getByRole('heading').textContent).toBe('Pages of the app');
    expect(sheet).toHaveAccessibleName('Pages of the app');
  });

  it('labels.nav names the Sheet and its nav', async () => {
    const user = userEvent.setup();
    render(<Shell labels={{ nav: 'Principale' }} />);
    const sheet = await openWithKeyboard(user);
    expect(sheet).toHaveAccessibleName('Principale');
    expect(within(sheet).getByRole('navigation', { name: 'Principale' })).toBeInTheDocument();
  });

  it("the consumer's id stays on the column, never copied to the Sheet's nav", async () => {
    const user = userEvent.setup();
    render(<Shell navProps={{ id: 'app-nav' }} />);
    await openWithKeyboard(user);
    expect(document.querySelectorAll('#app-nav')).toHaveLength(1);
    expect(column()).toHaveAttribute('id', 'app-nav');
  });
});

describe('a link in the Sheet', () => {
  it('a plain click: the Sheet closed and the focus on the trigger, THEN onNavigate once; the browser navigation cancelled', async () => {
    const user = userEvent.setup();
    const seen: { open: boolean; focused: Element | null; section: string }[] = [];
    render(
      <Shell
        onNavigate={(section) => seen.push({ open: !!openSheet(), focused: document.activeElement, section })}
      />,
    );
    const sheet = await openWithKeyboard(user);
    clicks.length = 0;
    await user.click(linkIn(sheet, 'B'));
    expect(seen).toEqual([{ open: false, focused: trigger(), section: 'B' }]);
    expect(clicks).toEqual([true]);
  });

  it('Enter on a link does the same', async () => {
    const user = userEvent.setup();
    const seen: { open: boolean; focused: Element | null }[] = [];
    render(<Shell onNavigate={() => seen.push({ open: !!openSheet(), focused: document.activeElement })} />);
    const sheet = await openWithKeyboard(user);
    await waitFor(() => expect(linkIn(sheet, 'A')).toHaveFocus());
    await user.tab();
    expect(linkIn(sheet, 'B')).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(seen).toEqual([{ open: false, focused: trigger() }]);
  });

  for (const modifier of ['ctrlKey', 'metaKey', 'shiftKey', 'altKey'] as const) {
    it(`${modifier}+click on a link with an href is the browser's: not cancelled, no onNavigate, the Sheet stays open`, async () => {
      const user = userEvent.setup();
      const onNavigate = vi.fn();
      render(<Shell onNavigate={onNavigate} />);
      const sheet = await openWithKeyboard(user);
      clicks.length = 0;
      fireEvent.click(linkIn(sheet, 'B'), { [modifier]: true });
      expect(clicks).toEqual([false]);
      expect(onNavigate).not.toHaveBeenCalled();
      expect(openSheet()).toBe(sheet);
    });
  }

  it("the middle button (a click with button 1 or an auxclick) is the browser's, and the Sheet stays open", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<Shell onNavigate={onNavigate} />);
    const sheet = await openWithKeyboard(user);
    clicks.length = 0;
    fireEvent.click(linkIn(sheet, 'B'), { button: 1 });
    fireEvent(linkIn(sheet, 'C'), new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }));
    expect(clicks).toEqual([false]);
    expect(onNavigate).not.toHaveBeenCalled();
    expect(openSheet()).toBe(sheet);
  });

  it('a link without an href (a button): every click, Ctrl+click too, closes the Sheet then goes to onNavigate', async () => {
    const user = userEvent.setup();
    const seen: { open: boolean; focused: Element | null }[] = [];
    render(
      <Shell
        link={() => ({ href: undefined })}
        onNavigate={() => seen.push({ open: !!openSheet(), focused: document.activeElement })}
      />,
    );
    const sheet = await openWithKeyboard(user);
    fireEvent.click(within(sheet).getByRole('button', { name: 'Section B' }), { ctrlKey: true });
    expect(seen).toEqual([{ open: false, focused: trigger() }]);
  });

  it('a disabled link, or a click an onClick cancelled, does nothing: no onNavigate, the Sheet stays open', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(
      <Shell
        onNavigate={onNavigate}
        link={(section) =>
          section === 'B' ? { disabled: true } : section === 'C' ? { onClick: (event) => event.preventDefault() } : {}
        }
      />,
    );
    const sheet = await openWithKeyboard(user);
    fireEvent.click(linkIn(sheet, 'B'));
    fireEvent.click(linkIn(sheet, 'C'));
    expect(onNavigate).not.toHaveBeenCalled();
    expect(openSheet()).toBe(sheet);
  });

  it('a plain link without onNavigate: a plain click closes the Sheet and the browser follows it; Ctrl+click keeps it open', async () => {
    const user = userEvent.setup();
    render(<Shell />);
    const sheet = await openWithKeyboard(user);
    clicks.length = 0;
    fireEvent.click(linkIn(sheet, 'B'), { ctrlKey: true });
    expect(openSheet()).toBe(sheet);
    fireEvent.click(linkIn(sheet, 'B'));
    expect(clicks).toEqual([false, false]);
    expect(openSheet()).toBeNull();
    expect(trigger()).toHaveFocus();
  });

  it('a link with no href and no onNavigate (an error in development) opens nothing: the Sheet stays open', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = userEvent.setup();
    render(<Shell link={() => ({ href: undefined })} />);
    const sheet = await openWithKeyboard(user);
    fireEvent.click(within(sheet).getByRole('button', { name: 'Section B' }));
    expect(openSheet()).toBe(sheet);
  });

  const RouterLink = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; go: (to: string) => void }>(
    function RouterLink({ to, go, onClick, children, ...rest }, ref) {
      return (
        <a
          {...rest}
          ref={ref}
          href={to}
          onClick={(event) => {
            onClick?.(event);
            if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
            event.preventDefault();
            go(to);
          }}
        >
          {children}
        </a>
      );
    },
  );

  it("a router's link (asChild): it navigates by itself, a plain click closes the Sheet, Ctrl+click keeps it open", async () => {
    const user = userEvent.setup();
    const go = vi.fn();
    const onClick = vi.fn();
    render(
      <AppShell>
        <AppShellHeader start={<AppShellNavTrigger />} />
        <AppShellNav>
          <AppShellNavLink asChild active onClick={onClick}>
            <RouterLink to="/a" go={go}>
              Section A
            </RouterLink>
          </AppShellNavLink>
        </AppShellNav>
        <AppShellMain />
      </AppShell>,
    );
    const sheet = await openWithKeyboard(user);
    clicks.length = 0;
    fireEvent.click(linkIn(sheet, 'A'), { ctrlKey: true });
    expect(openSheet()).toBe(sheet);
    expect(go).not.toHaveBeenCalled();
    fireEvent.click(linkIn(sheet, 'A'));
    expect(go).toHaveBeenCalledWith('/a');
    expect(onClick).toHaveBeenCalledTimes(2);
    expect(clicks).toEqual([false, true]);
    expect(openSheet()).toBeNull();
    expect(trigger()).toHaveFocus();
  });

  it('a focus onNavigate moves to the heading of the new page stays there, after the Sheet has left', async () => {
    animateModalExit();
    const user = userEvent.setup();
    function Page() {
      const [active, setActive] = useState('A');
      return (
        <Shell
          active={active}
          onNavigate={(section) => {
            setActive(section);
            document.getElementById('page-title')!.focus();
          }}
        />
      );
    }
    render(<Page />);
    const sheet = await openWithKeyboard(user);
    await user.click(linkIn(sheet, 'C'));
    const heading = document.getElementById('page-title');
    expect(heading).toHaveFocus();
    expect(document.querySelector('[role="dialog"][data-state="closed"]')).not.toBeNull();
    await waitFor(() => expect(screen.queryByRole('dialog', { hidden: true })).toBeNull(), { timeout: 2000 });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    expect(heading).toHaveFocus();
    expect(linkIn(column(), 'C')).toHaveAttribute('aria-current', 'page');
  });

  it('through useDirtyGuard: the Sheet is already closed; "Keep editing" returns the focus to the trigger, "Leave" navigates', async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    function Page() {
      const { guard, dialog } = useDirtyGuard({ when: true });
      return (
        <>
          <Shell onNavigate={(section) => guard(() => navigate(section))} />
          {dialog}
        </>
      );
    }
    render(<Page />);
    let sheet = await openWithKeyboard(user);
    await user.click(linkIn(sheet, 'B'));
    const guardDialog = await screen.findByRole('dialog', { name: 'Unsaved changes' });
    expect(document.querySelector('[data-rop-app-shell-nav-sheet][data-state="open"]')).toBeNull();
    await user.click(within(guardDialog).getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(trigger()).toHaveFocus());
    expect(navigate).not.toHaveBeenCalled();

    sheet = await openWithKeyboard(user);
    await user.click(linkIn(sheet, 'B'));
    await user.click(within(await screen.findByRole('dialog', { name: 'Unsaved changes' })).getByRole('button', { name: 'Leave without saving' }));
    expect(navigate).toHaveBeenCalledWith('B');
  });

  it('an onNavigate that unmounts the whole shell (another app): no error, nothing focused', async () => {
    const error = vi.spyOn(console, 'error');
    const user = userEvent.setup();
    function App() {
      const [shown, setShown] = useState(true);
      return shown ? <Shell onNavigate={() => setShown(false)} /> : <p>Another app</p>;
    }
    render(<App />);
    const sheet = await openWithKeyboard(user);
    await user.click(linkIn(sheet, 'B'));
    expect(screen.getByText('Another app')).toBeInTheDocument();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(document.activeElement).toBe(document.body);
    expect(error).not.toHaveBeenCalled();
  });

  it('a trigger unmounted while the Sheet is open (declared limit): closing throws nothing and focuses nothing', async () => {
    const error = vi.spyOn(console, 'error');
    const user = userEvent.setup();
    function Page() {
      const [withTrigger, setWithTrigger] = useState(true);
      return (
        <Shell
          trigger={withTrigger ? <AppShellNavTrigger /> : null}
          onNavigate={() => setWithTrigger(false)}
          link={(section) => (section === 'B' ? { onNavigate: undefined, onClick: () => setWithTrigger(false) } : {})}
        />
      );
    }
    render(<Page />);
    const sheet = await openWithKeyboard(user);
    fireEvent.click(linkIn(sheet, 'B'), { ctrlKey: true });
    expect(screen.queryByRole('button', { name: 'Open navigation', hidden: true })).toBeNull();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(document.activeElement).toBe(document.body);
    expect(error).not.toHaveBeenCalled();
  });

  it('unmounting the shell with the Sheet open throws nothing', async () => {
    const error = vi.spyOn(console, 'error');
    const user = userEvent.setup();
    const { unmount } = render(<Shell />);
    await openWithKeyboard(user);
    unmount();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(error).not.toHaveBeenCalled();
    expect(screenSize.listeners.size).toBe(0);
  });
});

describe('the viewport crossing the breakpoint', () => {
  it('to wide with the Sheet open: the Sheet closes, the links are in the column at once, the focus on its current link', async () => {
    animateModalExit();
    const user = userEvent.setup();
    render(<Shell active="B" />);
    const sheet = await openWithKeyboard(user);
    await waitFor(() => expect(linkIn(sheet, 'B')).toHaveFocus());
    screenSize.cross(true);
    // Still leaving (its exit animation), without the links: they are in the column already.
    expect(sheet).toHaveAttribute('data-state', 'closed');
    expect(sheetNav()!.querySelectorAll('[data-rop-app-shell-nav-link]')).toHaveLength(0);
    expect(column().querySelectorAll('[data-rop-app-shell-nav-link]')).toHaveLength(3);
    await waitFor(() => expect(linkIn(column(), 'B')).toHaveFocus());
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    // The Sheet's own return of the focus, after its exit, leaves it there.
    await waitFor(() => expect(screen.queryByRole('dialog', { hidden: true })).toBeNull(), { timeout: 2000 });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    expect(linkIn(column(), 'B')).toHaveFocus();
  });

  it('after a crossing to wide has taken the links out of the leaving Sheet, the next one keeps them during its exit', async () => {
    animateModalExit();
    const user = userEvent.setup();
    render(<Shell active="B" />);
    await openWithKeyboard(user);
    screenSize.cross(true);
    await waitFor(() => expect(screen.queryByRole('dialog', { hidden: true })).toBeNull(), { timeout: 2000 });
    screenSize.cross(false);
    const sheet = await openWithKeyboard(user);
    await waitFor(() => expect(linkIn(sheet, 'B')).toHaveFocus());
    await user.keyboard('{Escape}');
    expect(document.querySelector('[role="dialog"][data-state="closed"]')).not.toBeNull();
    expect(sheetNav()!.querySelectorAll('[data-rop-app-shell-nav-link]')).toHaveLength(3);
    expect(column().querySelectorAll('[data-rop-app-shell-nav-link]')).toHaveLength(0);
    await waitFor(() => expect(screen.queryByRole('dialog', { hidden: true })).toBeNull(), { timeout: 2000 });
    expect(column().querySelectorAll('[data-rop-app-shell-nav-link]')).toHaveLength(3);
  });

  it('reopened during the exit a crossing to wide began, the Sheet keeps its links during its next exit', async () => {
    animateModalExit();
    const user = userEvent.setup();
    render(<Shell active="B" />);
    await openWithKeyboard(user);
    screenSize.cross(true);
    // Still in its exit animation (the same panel is reused when it opens again now).
    expect(document.querySelector('[role="dialog"][data-state="closed"]')).not.toBeNull();
    screenSize.cross(false);
    const sheet = await openWithKeyboard(user);
    expect(sheet).toHaveAttribute('data-state', 'open');
    expect(sheetNav()!.querySelectorAll('[data-rop-app-shell-nav-link]')).toHaveLength(3);
    act(() => linkIn(sheet, 'B').focus());
    await user.keyboard('{Escape}');
    // Leaving with its links, the focus still on the one it had, as after any closing.
    expect(sheet).toHaveAttribute('data-state', 'closed');
    expect(sheetNav()!.querySelectorAll('[data-rop-app-shell-nav-link]')).toHaveLength(3);
    expect(column().querySelectorAll('[data-rop-app-shell-nav-link]')).toHaveLength(0);
    expect(linkIn(sheet, 'B')).toHaveFocus();
    await waitFor(() => expect(screen.queryByRole('dialog', { hidden: true })).toBeNull(), { timeout: 2000 });
    expect(column().querySelectorAll('[data-rop-app-shell-nav-link]')).toHaveLength(3);
    await waitFor(() => expect(trigger()).toHaveFocus());
  });

  it('the column takes the focus once after a crossing: a later render leaves it where the user moved it', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Shell active="B" />);
    await openWithKeyboard(user);
    screenSize.cross(true);
    await waitFor(() => expect(linkIn(column(), 'B')).toHaveFocus());
    act(() => document.getElementById('page-title')!.focus());
    rerender(<Shell active="C" />);
    expect(document.getElementById('page-title')).toHaveFocus();
  });

  it('to wide with the Sheet closed: nothing moves', () => {
    render(<Shell />);
    act(() => document.getElementById('page-title')!.focus());
    screenSize.cross(true);
    expect(document.getElementById('page-title')).toHaveFocus();
  });

  it('to narrow with the focus in the column: the focus goes to the trigger; with the focus elsewhere it stays', () => {
    screenSize.cross(true);
    render(<Shell />);
    act(() => linkIn(column(), 'B').focus());
    screenSize.cross(false);
    expect(trigger()).toHaveFocus();
    screenSize.cross(true);
    act(() => document.getElementById('page-title')!.focus());
    screenSize.cross(false);
    expect(document.getElementById('page-title')).toHaveFocus();
  });

  it("in another document (a frame) the nav watches that document's viewport and focus", () => {
    const frame = document.body.appendChild(document.createElement('iframe'));
    const view = frame.contentWindow!;
    const doc = frame.contentDocument!;
    let wide = true;
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    Object.defineProperty(view, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({
        get matches() {
          return query === APP_SHELL_WIDE_QUERY ? wide : false;
        },
        media: query,
        addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
        removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
      }),
    });
    const crossFrame = (next: boolean) => {
      wide = next;
      act(() => {
        for (const listener of [...listeners]) listener({ matches: next } as MediaQueryListEvent);
      });
    };
    const container = doc.body.appendChild(doc.createElement('div'));
    const { unmount } = render(<Shell />, { container, baseElement: doc.body });
    // The frame's viewport is watched, not the main window's.
    expect(listeners.size).toBe(1);
    expect(screenSize.listeners.size).toBe(0);
    const link = within(container).getByRole('link', { name: 'Section B', hidden: true });
    act(() => link.focus());
    expect(doc.activeElement).toBe(link);
    crossFrame(false);
    expect(doc.activeElement).toBe(container.querySelector('[data-rop-app-shell-nav-trigger]'));
    unmount();
    expect(listeners.size).toBe(0);
    frame.remove();
  });

  it('to narrow after the browser has dropped the focus of the column it no longer displays: the trigger takes it, once', () => {
    const onBlur = vi.fn();
    screenSize.cross(true);
    render(<Shell navProps={{ onBlur }} />);
    act(() => linkIn(column(), 'B').focus());
    // The new size is laid out first: the column is not displayed, and the browser drops the focus of its link
    // (Chrome, in a task of its own) before it reports the crossing.
    hideColumn();
    act(() => linkIn(column(), 'B').blur());
    expect(document.body).toHaveFocus();
    expect(onBlur).toHaveBeenCalledTimes(1);
    screenSize.cross(false);
    expect(trigger()).toHaveFocus();
    // Used once: a later crossing with the focus on the page leaves it there.
    act(() => trigger().blur());
    screenSize.cross(true);
    screenSize.cross(false);
    expect(document.body).toHaveFocus();
  });

  it('to narrow after the focus left a column still displayed (a click on the page): it stays where it went', () => {
    screenSize.cross(true);
    render(<Shell />);
    act(() => linkIn(column(), 'B').focus());
    act(() => linkIn(column(), 'B').blur());
    screenSize.cross(false);
    expect(document.body).toHaveFocus();
    // Dropped with the column, then moved by the user before the crossing is reported: it stays there too.
    screenSize.cross(true);
    act(() => linkIn(column(), 'B').focus());
    hideColumn();
    act(() => linkIn(column(), 'B').blur());
    act(() => document.getElementById('page-title')!.focus());
    screenSize.cross(false);
    expect(document.getElementById('page-title')).toHaveFocus();
  });

  it('to narrow with the focus in the column of a shell without a trigger: nothing throws', () => {
    screenSize.cross(true);
    render(<Shell trigger={null} />);
    act(() => linkIn(column(), 'B').focus());
    expect(() => screenSize.cross(false)).not.toThrow();
  });

  it('a nav outside an AppShell has no Sheet and watches nothing', () => {
    render(
      <AppShellNav>
        <AppShellNavLink href="/a">Section A</AppShellNavLink>
      </AppShellNav>,
    );
    expect(screenSize.listeners.size).toBe(0);
    expect(document.querySelectorAll('[data-rop-app-shell-nav-link]')).toHaveLength(1);
  });
});

describe('server rendering and hydration', () => {
  it('the trigger and the links (in the column) are in the server HTML; hydration has no error and the Sheet opens', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const html = renderToString(<Shell />);
    expect(html).toContain('data-rop-app-shell-nav-trigger');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toMatch(/<nav[^>]*data-rop-app-shell-nav=""[^>]*>.*id="link-A"/);
    expect(html).not.toContain('role="dialog"');
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    const root = await act(async () => hydrateRoot(container, <Shell />));
    expect(errors).not.toHaveBeenCalled();
    fireEvent.click(trigger());
    expect(await screen.findByRole('dialog', { name: 'Main' })).toBeInTheDocument();
    act(() => root.unmount());
    container.remove();
  });
});
