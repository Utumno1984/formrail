import { createRef, forwardRef, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AppShell,
  AppShellHeader,
  AppShellMain,
  AppShellNav,
  AppShellNavLink,
  DEFAULT_LABELS,
  navLinkProblems,
  type AppShellProps,
} from './AppShell';
import { APP_SHELL_NAV_BREAKPOINT, mainBottomBorderKeys, mainStyle, navClass, rootStyle } from './app-shell-styles';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Shell({ children, ...props }: Partial<AppShellProps> & { children?: ReactNode }) {
  return (
    <AppShell {...props}>
      <AppShellHeader start={<span>App one</span>} end={<span>User one</span>} />
      <AppShellNav>
        <AppShellNavLink href="/a" active>
          Section A
        </AppShellNavLink>
        <AppShellNavLink href="/b">Section B</AppShellNavLink>
      </AppShellNav>
      <AppShellMain>{children ?? <p>Content</p>}</AppShellMain>
    </AppShell>
  );
}

describe('AppShell: landmarks and skip link', () => {
  it('renders a banner, a named navigation and a main landmark', () => {
    render(<Shell />);
    expect(screen.getByRole('banner')).toHaveTextContent('App oneUser one');
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    const main = screen.getByRole('main');
    expect(main.id).not.toBe('');
    expect(main).toHaveAttribute('tabindex', '-1');
  });

  it('the documented defaults are the English texts', () => {
    expect(DEFAULT_LABELS).toEqual({ skipToContent: 'Skip to content', nav: 'Main' });
  });

  it('the skip link is the first element of the shell and the first Tab stop, and points to the main', async () => {
    render(<Shell />);
    const root = document.querySelector('[data-rop-app-shell]')!;
    const skip = screen.getByRole('link', { name: 'Skip to content' });
    expect(root.firstElementChild).toBe(skip);
    expect(skip).toHaveAttribute('href', `#${screen.getByRole('main').id}`);
    await userEvent.tab();
    expect(skip).toHaveFocus();
  });

  it('activating the skip link moves the focus to the main without touching the URL', async () => {
    render(<Shell />);
    const before = window.location.href;
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('main')).toHaveFocus();
    expect(window.location.href).toBe(before);
  });

  it('with no content to focus, the skip link still cancels the navigation to its fragment', () => {
    render(
      <AppShell>
        <AppShellHeader />
      </AppShell>,
    );
    const skip = screen.getByRole('link', { name: 'Skip to content' });
    // fireEvent returns false when a handler cancelled the event.
    expect(fireEvent.click(skip)).toBe(false);
  });

  it('follows an id given to AppShellMain', async () => {
    render(
      <AppShell>
        <AppShellMain id="content">x</AppShellMain>
      </AppShell>,
    );
    const skip = screen.getByRole('link', { name: 'Skip to content' });
    expect(skip).toHaveAttribute('href', '#content');
    await userEvent.click(skip);
    expect(document.getElementById('content')).toHaveFocus();
  });

  it('localizes both texts, and the navigation takes its own aria-label or aria-labelledby', () => {
    const { rerender } = render(<Shell labels={{ skipToContent: 'Vai al contenuto', nav: 'Principale' }} />);
    expect(screen.getByRole('link', { name: 'Vai al contenuto' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Principale' })).toBeInTheDocument();
    rerender(
      <AppShell>
        <AppShellNav aria-label="Sections" />
        <h2 id="nav-title">Pages</h2>
        <AppShellNav aria-labelledby="nav-title" />
      </AppShell>,
    );
    expect(screen.getByRole('navigation', { name: 'Sections' })).toBeInTheDocument();
    const labelled = screen.getByRole('navigation', { name: 'Pages' });
    expect(labelled).not.toHaveAttribute('aria-label');
  });

  it('a part used outside AppShell still renders with the defaults', () => {
    render(
      <>
        <AppShellNav>
          <AppShellNavLink href="/a">Section A</AppShellNavLink>
        </AppShellNav>
        <AppShellMain>x</AppShellMain>
      </>,
    );
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.getByRole('main').id).not.toBe('');
  });
});

describe('AppShell: layout contract', () => {
  it('the page mode (default) takes the dynamic viewport height, the parent mode the parent height', () => {
    const { rerender } = render(<Shell />);
    const root = () => document.querySelector('[data-rop-app-shell]')!;
    expect(root()).toHaveClass('h-dvh');
    expect(root()).not.toHaveClass('h-full');
    rerender(<Shell fill="parent" />);
    expect(root()).toHaveClass('h-full');
    expect(root()).not.toHaveClass('h-dvh');
  });

  it('a className of the consumer wins on a conflict (merged, not concatenated)', () => {
    render(<Shell className="h-[600px]" />);
    const root = document.querySelector('[data-rop-app-shell]')!;
    expect(root).toHaveClass('h-[600px]');
    expect(root).not.toHaveClass('h-dvh');
  });

  it('the breakpoint of the navigation column is one value shared by the CSS and the code', () => {
    expect(APP_SHELL_NAV_BREAKPOINT).toBe('64rem');
    const variants = [...navClass.matchAll(/min-\[([^\]]+)\]:/g)].map((m) => m[1]);
    expect(variants).toEqual([APP_SHELL_NAV_BREAKPOINT]);
    expect(navClass).toContain(`min-[${APP_SHELL_NAV_BREAKPOINT}]:block`);
    expect(navClass.split(' ')).toContain('hidden');
  });

  it('the header has three parts, always there, whatever is empty', () => {
    render(
      <AppShell>
        <AppShellHeader />
      </AppShell>,
    );
    const header = screen.getByRole('banner');
    expect(header.querySelector('[data-rop-app-shell-header-start]')).toBeEmptyDOMElement();
    expect(header.querySelector('[data-rop-app-shell-header-center]')).toBeEmptyDOMElement();
    expect(header.querySelector('[data-rop-app-shell-header-end]')).toBeEmptyDOMElement();
    expect(header.children).toHaveLength(3);
  });

  it('the virtual keyboard is relayed by the root and counted once by the main (reset to zero inside it)', () => {
    expect(rootStyle).toEqual({ '--rop-app-shell-keyboard-inset': 'var(--rop-keyboard-inset, 0px)' });
    // The room of the keyboard is a transparent bottom border (the scrolled area ends above the keyboard), never a
    // padding: the padding is the consumer's.
    expect(mainStyle).toEqual({
      borderBottomWidth: 'var(--rop-app-shell-keyboard-inset, 0px)',
      borderBottomStyle: 'solid',
      borderBottomColor: 'transparent',
      '--rop-keyboard-inset': '0px',
    });
    render(<Shell style={{ color: 'red' }} />);
    const root = document.querySelector<HTMLElement>('[data-rop-app-shell]')!;
    expect(root.style.getPropertyValue('--rop-app-shell-keyboard-inset')).toBe('var(--rop-keyboard-inset, 0px)');
    expect(root.style.color).toBe('red');
    const main = screen.getByRole('main');
    expect(main.style.getPropertyValue('--rop-keyboard-inset')).toBe('0px');
    expect(main.style.getPropertyValue('border-bottom-width')).toBe('var(--rop-app-shell-keyboard-inset, 0px)');
    expect(main.style.borderBottomStyle).toBe('solid');
    expect(main.style.borderBottomColor).toBe('transparent');
    expect(main.style.paddingBottom).toBe('');
  });

  describe("the consumer's padding on AppShellMain composes with the keyboard's room", () => {
    const keyboardRoom = (main: HTMLElement) => ({
      width: main.style.getPropertyValue('border-bottom-width'),
      reset: main.style.getPropertyValue('--rop-keyboard-inset'),
    });
    const KEYBOARD = { width: 'var(--rop-app-shell-keyboard-inset, 0px)', reset: '0px' };

    it('no padding: none inline, the keyboard on the bottom border', () => {
      render(
        <AppShell>
          <AppShellMain />
        </AppShell>,
      );
      const main = screen.getByRole('main');
      expect(main.style.padding).toBe('');
      expect(main.style.paddingBottom).toBe('');
      expect(keyboardRoom(main)).toEqual(KEYBOARD);
    });

    it('padding in style: kept whole, the bottom one too, and the keyboard is still counted', () => {
      render(
        <AppShell>
          <AppShellMain style={{ padding: 24, color: 'red' }} />
        </AppShell>,
      );
      const main = screen.getByRole('main');
      expect(main.style.padding).toBe('24px');
      expect(main.style.paddingBottom).toBe('24px');
      expect(main.style.color).toBe('red');
      expect(keyboardRoom(main)).toEqual(KEYBOARD);
    });

    it('paddingBottom in style: kept, and the keyboard is still counted', () => {
      render(
        <AppShell>
          <AppShellMain style={{ paddingBottom: 40 }} />
        </AppShell>,
      );
      const main = screen.getByRole('main');
      expect(main.style.paddingBottom).toBe('40px');
      expect(keyboardRoom(main)).toEqual(KEYBOARD);
    });

    it('padding in a class: no inline padding overrides it, and the keyboard is still counted', () => {
      render(
        <AppShell>
          <AppShellMain className="p-6" />
        </AppShell>,
      );
      const main = screen.getByRole('main');
      expect(main).toHaveClass('p-6');
      expect(main.style.padding).toBe('');
      expect(main.style.paddingBottom).toBe('');
      expect(keyboardRoom(main)).toEqual(KEYBOARD);
    });

    it('a consumer cannot reset the keyboard to zero for the content: the reset to zero stays the shell\'s', () => {
      render(
        <AppShell>
          <AppShellMain style={{ ['--rop-keyboard-inset' as string]: '120px' }} />
        </AppShell>,
      );
      expect(keyboardRoom(screen.getByRole('main'))).toEqual(KEYBOARD);
    });

    it('a bottom border in style: the keyboard keeps it, and it is an error in development that names the keys', () => {
      expect(mainBottomBorderKeys(undefined)).toEqual([]);
      expect(
        mainBottomBorderKeys({
          border: 0,
          borderWidth: 0,
          borderStyle: 0,
          borderColor: 0,
          borderBottom: 0,
          borderBottomWidth: 0,
          borderBlock: 0,
          borderBlockEnd: 0,
          borderBlockEndWidth: 0,
          borderTop: 0,
          borderLeft: 0,
          borderRight: 0,
          borderRadius: 0,
          borderInlineStart: 0,
          padding: 0,
        }),
      ).toEqual(['border', 'borderWidth', 'borderStyle', 'borderColor', 'borderBottom', 'borderBottomWidth', 'borderBlock', 'borderBlockEnd', 'borderBlockEndWidth']);
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      render(
        <AppShell>
          <AppShellMain style={{ borderBottom: '2px solid red', borderTop: '1px solid red' }} />
        </AppShell>,
      );
      const main = screen.getByRole('main');
      expect(keyboardRoom(main)).toEqual(KEYBOARD);
      expect(main.style.borderBottomColor).toBe('transparent');
      expect(main.style.borderTop).toBe('1px solid red');
      expect(error).toHaveBeenCalledTimes(1);
      expect(String(error.mock.calls[0]![0])).toMatch(/^\[formrail\] <AppShellMain>: .*keyboard.*borderBottom in its style/);
    });

    it('a style with no bottom border is no error', () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      render(
        <AppShell>
          <AppShellMain style={{ padding: 24, borderTop: '1px solid red', borderRadius: 4 }} />
        </AppShell>,
      );
      expect(error).not.toHaveBeenCalled();
    });
  });

  it('header and nav: their size is the whole footprint (inline border-box, never a rule of the shipped CSS)', () => {
    render(
      <AppShell>
        <AppShellHeader style={{ color: 'red' }} />
        <AppShellNav style={{ color: 'blue' }} />
      </AppShell>,
    );
    const header = screen.getByRole('banner');
    const nav = screen.getByRole('navigation');
    expect(header.style.boxSizing).toBe('border-box');
    expect(header.style.color).toBe('red');
    expect(nav.style.boxSizing).toBe('border-box');
    expect(nav.style.color).toBe('blue');
  });

  it("header and nav: the consumer's style wins over the shell's box-sizing", () => {
    render(
      <AppShell>
        <AppShellHeader style={{ boxSizing: 'content-box' }} />
        <AppShellNav style={{ boxSizing: 'content-box' }} />
      </AppShell>,
    );
    expect(screen.getByRole('banner').style.boxSizing).toBe('content-box');
    expect(screen.getByRole('navigation').style.boxSizing).toBe('content-box');
  });

  it('forwards the refs to the root, the header, the nav and the main', () => {
    const root = createRef<HTMLDivElement>();
    const header = createRef<HTMLElement>();
    const nav = createRef<HTMLElement>();
    const main = createRef<HTMLElement>();
    render(
      <AppShell ref={root}>
        <AppShellHeader ref={header} />
        <AppShellNav ref={nav} />
        <AppShellMain ref={main} />
      </AppShell>,
    );
    expect(root.current).toHaveAttribute('data-rop-app-shell');
    expect(header.current?.tagName).toBe('HEADER');
    expect(nav.current?.tagName).toBe('NAV');
    expect(main.current?.tagName).toBe('MAIN');
  });

  it('no prop of the components leaks onto the DOM', () => {
    const icon = <svg data-testid="icon" />;
    render(
      <AppShell fill="parent" labels={{ nav: 'N' }}>
        <AppShellHeader start="s" center="c" end="e" />
        <AppShellNav>
          <AppShellNavLink href="/a" active icon={icon} onNavigate={() => undefined}>
            A
          </AppShellNavLink>
          <AppShellNavLink disabled>B</AppShellNavLink>
          <AppShellNavLink onNavigate={() => undefined}>C</AppShellNavLink>
        </AppShellNav>
        <AppShellMain />
      </AppShell>,
    );
    const html = document.body.innerHTML;
    expect(html).not.toMatch(/\s(fill|labels|start|center|end|active|disabled|icon|aschild|onnavigate)=/i);
  });
});

describe('AppShellNavLink', () => {
  function nav(link: ReactNode) {
    return render(
      <AppShell>
        <AppShellNav>{link}</AppShellNav>
      </AppShell>,
    );
  }

  it('a plain click or Enter on a link with an href goes to onNavigate, and the browser navigation is cancelled', async () => {
    const onNavigate = vi.fn((event: { defaultPrevented: boolean }) => event.defaultPrevented);
    nav(
      <AppShellNavLink href="/a" onNavigate={onNavigate}>
        Section A
      </AppShellNavLink>,
    );
    const link = screen.getByRole('link', { name: 'Section A' });
    expect(link).toHaveAttribute('href', '/a');
    await userEvent.click(link);
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate.mock.results[0]!.value).toBe(true);
    expect(link).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onNavigate).toHaveBeenCalledTimes(2);
  });

  it('the link has the focus when onNavigate is called, also after a click that does not focus it (Safari)', () => {
    // fireEvent.click dispatches the click alone, with no mousedown: the link is not focused by it, as in Safari.
    let active: Element | null = null;
    const onNavigate = vi.fn(() => (active = document.activeElement));
    nav(
      <>
        <AppShellNavLink href="/a" onNavigate={onNavigate}>
          Section A
        </AppShellNavLink>
        <AppShellNavLink onNavigate={onNavigate}>Section B</AppShellNavLink>
      </>,
    );
    for (const link of [screen.getByRole('link', { name: 'Section A' }), screen.getByRole('button', { name: 'Section B' })]) {
      active = null;
      expect(link).not.toHaveFocus();
      fireEvent.click(link);
      expect(active).toBe(link);
      (document.activeElement as HTMLElement | null)?.blur();
    }
    expect(onNavigate).toHaveBeenCalledTimes(2);
  });

  it('a modified click or the middle button on a link with an href is left to the browser', () => {
    const onNavigate = vi.fn();
    nav(
      <AppShellNavLink href="/a" onNavigate={onNavigate}>
        Section A
      </AppShellNavLink>,
    );
    const link = screen.getByRole('link', { name: 'Section A' });
    for (const init of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...init });
      link.dispatchEvent(event);
      expect(event.defaultPrevented, JSON.stringify(init)).toBe(false);
    }
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('without an href (or with an empty one) it is a button, and every click goes to onNavigate, modifiers included', () => {
    const onNavigate = vi.fn();
    nav(
      <>
        <AppShellNavLink onNavigate={onNavigate}>Section A</AppShellNavLink>
        <AppShellNavLink href="" onNavigate={onNavigate}>
          Section B
        </AppShellNavLink>
      </>,
    );
    const a = screen.getByRole('button', { name: 'Section A' });
    expect(a).toHaveAttribute('type', 'button');
    fireEvent.click(a, { ctrlKey: true });
    fireEvent.click(screen.getByRole('button', { name: 'Section B' }));
    expect(onNavigate).toHaveBeenCalledTimes(2);
  });

  it('active marks the current page with aria-current="page" and a marker that is not only a colour', () => {
    nav(
      <>
        <AppShellNavLink href="/a" active>
          Section A
        </AppShellNavLink>
        <AppShellNavLink href="/b">Section B</AppShellNavLink>
      </>,
    );
    const a = screen.getByRole('link', { name: 'Section A' });
    expect(a).toHaveAttribute('aria-current', 'page');
    expect(a.className).toContain('before:w-1');
    expect(a).toHaveClass('font-semibold');
    expect(screen.getByRole('link', { name: 'Section B' })).not.toHaveAttribute('aria-current');
  });

  it('disabled: no href, aria-disabled, still a focusable link, and a click does nothing', async () => {
    const onNavigate = vi.fn();
    nav(
      <AppShellNavLink href="/a" disabled onNavigate={onNavigate}>
        Section A
      </AppShellNavLink>,
    );
    const link = screen.getByRole('link', { name: 'Section A' });
    expect(link).not.toHaveAttribute('href');
    expect(link).toHaveAttribute('aria-disabled', 'true');
    await userEvent.tab();
    await userEvent.tab();
    expect(link).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('onClick runs first and can cancel the navigation', () => {
    const onNavigate = vi.fn();
    const onClick = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    nav(
      <AppShellNavLink href="/a" onClick={onClick} onNavigate={onNavigate}>
        Section A
      </AppShellNavLink>,
    );
    fireEvent.click(screen.getByRole('link', { name: 'Section A' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('the icon is decorative and the text is the name', () => {
    nav(
      <AppShellNavLink href="/a" icon={<svg data-testid="icon" />}>
        Section A
      </AppShellNavLink>,
    );
    expect(screen.getByTestId('icon').parentElement).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('link', { name: 'Section A' })).toBeInTheDocument();
  });

  it('each link is a list item of the navigation list', () => {
    nav(
      <>
        <AppShellNavLink href="/a">Section A</AppShellNavLink>
        <AppShellNavLink href="/b">Section B</AppShellNavLink>
      </>,
    );
    const list = within(screen.getByRole('navigation')).getByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
  });

  // A router's link: forwards its ref, spreads unknown props, and cancels the plain click it handles.
  const RouterLink = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }>(function RouterLink(
    { to, onClick, children, ...rest },
    ref,
  ) {
    return (
      <a
        {...rest}
        ref={ref}
        href={to}
        data-router=""
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented && !event.metaKey && !event.ctrlKey) event.preventDefault();
        }}
      >
        {children}
      </a>
    );
  });

  it('asChild renders the router link with the classes, aria-current, onClick and the ref; the router navigates', async () => {
    const onClick = vi.fn();
    const ref = createRef<HTMLAnchorElement | HTMLButtonElement>();
    nav(
      <AppShellNavLink asChild active ref={ref} className="px-6" onClick={onClick}>
        <RouterLink to="/a" className="text-rop-error">
          Section A
        </RouterLink>
      </AppShellNavLink>,
    );
    const link = screen.getByRole('link', { name: 'Section A' });
    expect(link).toHaveAttribute('data-router');
    expect(link).toHaveAttribute('href', '/a');
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(link).toHaveClass('px-6', 'text-rop-error');
    expect(link).not.toHaveClass('px-3');
    expect(ref.current).toBe(link);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    expect(onClick).toHaveBeenCalledTimes(1);
    // The router's own handler cancelled the browser navigation (it navigates itself).
    expect(event.defaultPrevented).toBe(true);
  });

  it('asChild with onNavigate: onNavigate is not called (the child navigates) and it is an error in development', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onNavigate = vi.fn();
    nav(
      <AppShellNavLink asChild onNavigate={onNavigate}>
        <a href="/a">Section A</a>
      </AppShellNavLink>,
    );
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    screen.getByRole('link', { name: 'Section A' }).dispatchEvent(event);
    expect(onNavigate).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('onNavigate is not used with asChild'));
  });

  it('asChild and disabled: the router link is not rendered (it would navigate), its text is, with no href', () => {
    nav(
      <AppShellNavLink asChild disabled>
        <RouterLink to="/a">Section A</RouterLink>
      </AppShellNavLink>,
    );
    const link = screen.getByRole('link', { name: 'Section A' });
    expect(link).not.toHaveAttribute('data-router');
    expect(link).not.toHaveAttribute('href');
    expect(link).toHaveAttribute('aria-disabled', 'true');
  });

  it('asChild without a single element child throws a clear error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => nav(<AppShellNavLink asChild>text</AppShellNavLink>)).toThrow(/expects exactly one React element/);
  });

  it('a link that opens nothing is an error in development', () => {
    expect(navLinkProblems({ hasOnNavigate: false })).toHaveLength(1);
    expect(navLinkProblems({ href: '', hasOnNavigate: false })).toHaveLength(1);
    expect(navLinkProblems({ href: '/a', hasOnNavigate: false })).toEqual([]);
    expect(navLinkProblems({ hasOnNavigate: true })).toEqual([]);
    expect(navLinkProblems({ disabled: true, hasOnNavigate: false })).toEqual([]);
    expect(navLinkProblems({ asChild: true, hasOnNavigate: false })).toEqual([]);
    expect(navLinkProblems({ asChild: true, hasOnNavigate: true })).toHaveLength(1);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    nav(<AppShellNavLink>Section A</AppShellNavLink>);
    expect(error).toHaveBeenCalledWith('[formrail] <AppShellNavLink>: a link with no href and no onNavigate opens nothing.');
  });
});

describe('AppShell: server rendering and hydration', () => {
  function Page() {
    return (
      <AppShell>
        <AppShellHeader start={<span>App one</span>} />
        <AppShellNav>
          <AppShellNavLink href="/a" active>
            Section A
          </AppShellNavLink>
          <AppShellNavLink disabled>Section B</AppShellNavLink>
        </AppShellNav>
        <AppShellMain id="content">
          <p>Content</p>
        </AppShellMain>
      </AppShell>
    );
  }

  it('hydrates the server HTML with no error and no mismatch, then the skip link reaches the main', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const html = renderToString(<Page />);
    expect(html).toContain('<header');
    expect(html).toContain('<main');
    expect(html).toContain('Skip to content');
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    const root = await act(async () => hydrateRoot(container, <Page />));
    expect(errors).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#content');
    fireEvent.click(screen.getByRole('link', { name: 'Skip to content' }));
    expect(screen.getByRole('main')).toHaveFocus();
    act(() => root.unmount());
    container.remove();
  });
});
