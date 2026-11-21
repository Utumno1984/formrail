import { createRef, useLayoutEffect, useRef, useState } from 'react';
import { renderToString } from 'react-dom/server';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDirtyGuard } from '../object-page/use-dirty-guard';
import { AppLauncher, appLauncherProblems, DEFAULT_LABELS, placeholderCount, type AppLauncherProps } from './AppLauncher';
import type { AppDescriptor } from './types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const icon = <svg data-testid="icon" viewBox="0 0 16 16" />;

const APPS: AppDescriptor[] = [
  { id: 'one', label: 'App one', description: 'First app', href: '/one', icon },
  { id: 'two', label: 'App two', href: '/two' },
  { id: 'three', label: 'App three', description: 'Third app', href: '/three', disabled: true, disabledReason: 'Not enabled for you' },
  { id: 'four', label: 'App four', href: '/four' },
];

const tiles = () => within(screen.getByRole('list')).getAllByRole('link');
const tile = (name: string) => screen.getByRole('link', { name });
const descriptionOf = (el: HTMLElement) =>
  (el.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent)
    .join(' | ');

function setup(props: Partial<AppLauncherProps> = {}) {
  return render(<AppLauncher apps={APPS} {...props} />);
}

describe('AppLauncher: structure', () => {
  it('a navigation region named "Apps" by default, with a list of one item per app', () => {
    setup();
    const nav = screen.getByRole('navigation', { name: 'Apps' });
    expect(nav.tagName).toBe('NAV');
    const list = within(nav).getByRole('list');
    expect(list.tagName).toBe('UL');
    expect(within(list).getAllByRole('listitem')).toHaveLength(4);
  });

  it('the name of the region comes from labels.region, or from aria-labelledby when passed', () => {
    const { unmount } = setup({ labels: { region: 'Applications' } });
    expect(screen.getByRole('navigation', { name: 'Applications' })).toBeInTheDocument();
    unmount();
    render(
      <>
        <h2 id="heading">Choose an app</h2>
        <AppLauncher apps={APPS} aria-labelledby="heading" />
      </>,
    );
    const nav = screen.getByRole('navigation', { name: 'Choose an app' });
    expect(nav).not.toHaveAttribute('aria-label');
  });

  it('an app with an href is a real link; without one it is a button', () => {
    setup({ apps: [{ id: 'a', label: 'With href', href: '/a' }, { id: 'b', label: 'Without href' }], onNavigate: vi.fn() });
    expect(tile('With href')).toHaveAttribute('href', '/a');
    expect(tile('With href').tagName).toBe('A');
    const button = screen.getByRole('button', { name: 'Without href' });
    expect(button).toHaveAttribute('type', 'button');
  });

  it('an empty href counts as no href: a button, not an <a href=""> that would reload the page', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    setup({ apps: [{ id: 'e', label: 'Empty href', href: '' }], onNavigate });
    expect(screen.queryByRole('link')).toBeNull();
    const button = screen.getByRole('button', { name: 'Empty href' });
    expect(button.tagName).toBe('BUTTON');
    expect(button).not.toHaveAttribute('href');
    await user.click(button);
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate.mock.calls[0]![0]).toMatchObject({ id: 'e', href: '' });
  });

  it('an empty href and no onNavigate is reported like a missing href (its tile opens nothing)', () => {
    expect(appLauncherProblems([{ id: 'e', label: 'E', href: '' }], false)).toEqual([
      'the app "e" has no href and there is no onNavigate: its tile opens nothing',
    ]);
  });

  it('the accessible name is the label alone; the description is a description, not part of the name', () => {
    setup();
    const one = tile('App one');
    expect(one).toHaveAccessibleName('App one');
    // Label in name (WCAG 2.5.3): the visible text inside the link is exactly its name.
    expect(one.textContent).toBe('App one');
    // Not read twice: outside the link, hidden from the list content, still the link's description.
    const description = document.getElementById(one.getAttribute('aria-describedby')!)!;
    expect(one.contains(description)).toBe(false);
    expect(description.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(description.closest('[data-rop-app-details]')!.className).toContain('pointer-events-none');
    expect(one).toHaveAccessibleDescription('First app');
    expect(descriptionOf(tile('App two'))).toBe('');
    expect(tile('App two')).not.toHaveAttribute('aria-describedby');
  });

  it('WCAG 1.4.12: minimum heights in lh (the line height in use), never fixed ones; every grid row equally tall', () => {
    setup();
    const one = tile('App one');
    const textBlock = document.getElementById(one.getAttribute('aria-labelledby')!)!.parentElement!;
    expect(textBlock.className.split(' ')).toContain('min-h-[3lh]');
    expect(textBlock.className).not.toMatch(/(^|\s)h-\[/);
    const details = one.closest('li')!.querySelector('[data-rop-app-details]')!;
    expect(details.className).not.toMatch(/(^|\s)h-\[/);
    expect(details.className).toContain('top-[calc(0.75rem+1px+1lh)]');
    expect(screen.getByRole('list').className.split(' ')).toContain('auto-rows-fr');
  });

  it('the icon is hidden from assistive technology', () => {
    setup();
    expect(screen.getByTestId('icon').closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('className is merged on the region (tailwind-merge), other attributes reach it, the ref is the nav', () => {
    const ref = createRef<HTMLElement>();
    setup({ className: 'p-6', id: 'launcher', ref } as Partial<AppLauncherProps> & { ref: typeof ref });
    const nav = screen.getByRole('navigation');
    expect(nav.className.split(' ')).toContain('p-6');
    expect(nav.className.split(' ')).not.toContain('p-1');
    expect(nav).toHaveAttribute('id', 'launcher');
    expect(ref.current).toBe(nav);
  });

  it('no non-DOM prop leaks on the region', () => {
    setup({ onNavigate: vi.fn(), currentAppId: 'one', loadingCount: 3, labels: { empty: 'x' } });
    const nav = screen.getByRole('navigation');
    for (const attr of ['apps', 'onnavigate', 'currentappid', 'loading', 'loadingcount', 'labels']) {
      expect(nav.hasAttribute(attr)).toBe(false);
    }
  });

  it('Tab visits every tile in the order of the list, disabled ones included', async () => {
    const user = userEvent.setup();
    setup();
    const order: string[] = [];
    for (let i = 0; i < 4; i++) {
      await user.tab();
      order.push((document.activeElement as HTMLElement).getAttribute('data-rop-app-id')!);
    }
    expect(order).toEqual(['one', 'two', 'three', 'four']);
  });
});

describe('AppLauncher: navigation rule', () => {
  it('a plain click with onNavigate: native navigation cancelled, onNavigate called once with the app and the event', () => {
    const onNavigate = vi.fn();
    setup({ onNavigate });
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    tile('App two').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate.mock.calls[0]![0]).toBe(APPS[1]);
    expect(onNavigate.mock.calls[0]![1].type).toBe('click');
  });

  it('Enter on a tile calls onNavigate with that app', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    setup({ onNavigate });
    tile('App four').focus();
    await user.keyboard('{Enter}');
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate.mock.calls[0]![0]).toMatchObject({ id: 'four' });
  });

  it('without onNavigate the click is left to the browser (not cancelled)', () => {
    setup();
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    tile('App one').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it.each([
    ['Ctrl', { ctrlKey: true }],
    ['Cmd', { metaKey: true }],
    ['Shift', { shiftKey: true }],
    ['the middle button', { button: 1 }],
  ])('a click with %s: onNavigate not called, native navigation not cancelled, href intact', (_, init) => {
    const onNavigate = vi.fn();
    setup({ onNavigate });
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init });
    tile('App one').dispatchEvent(event);
    expect(onNavigate).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    expect(tile('App one')).toHaveAttribute('href', '/one');
  });

  it('a button tile (no href) calls onNavigate on click, Enter and Space', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    setup({ apps: [{ id: 'b', label: 'Button app' }], onNavigate });
    const button = screen.getByRole('button', { name: 'Button app' });
    await user.click(button);
    button.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onNavigate).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['Ctrl', { ctrlKey: true }],
    ['Cmd', { metaKey: true }],
    ['Shift', { shiftKey: true }],
    ['Alt', { altKey: true }],
  ])('a click with %s on a button tile (no href): like a plain click, onNavigate called once, the tile focused first', (_, init) => {
    let active: Element | null = null;
    const onNavigate = vi.fn(() => (active = document.activeElement));
    setup({ apps: [{ id: 'b', label: 'Button app' }, { id: 'e', label: 'Empty href', href: '' }], onNavigate });
    for (const name of ['Button app', 'Empty href']) {
      onNavigate.mockClear();
      active = null;
      const button = screen.getByRole('button', { name });
      const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init });
      button.dispatchEvent(event);
      expect(onNavigate).toHaveBeenCalledTimes(1);
      expect((onNavigate.mock.calls[0] as unknown[])[0]).toMatchObject({ label: name });
      expect(active).toBe(button);
    }
  });

  it('a modified click on a button tile that another handler already cancelled: onNavigate not called', () => {
    const onNavigate = vi.fn();
    render(
      <div onClickCapture={(e) => e.preventDefault()}>
        <AppLauncher apps={[{ id: 'b', label: 'Button app' }]} onNavigate={onNavigate} />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Button app' }), { ctrlKey: true });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('a modified click on a disabled button tile does nothing', () => {
    const onNavigate = vi.fn();
    setup({ apps: [{ id: 'b', label: 'Locked', disabled: true }], onNavigate });
    fireEvent.click(screen.getByRole('button', { name: 'Locked' }), { shiftKey: true });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('the tile has the focus when onNavigate runs (a click that did not focus it, as in Safari)', () => {
    let active: Element | null = null;
    setup({ onNavigate: () => (active = document.activeElement) });
    fireEvent.click(tile('App two'));
    expect(active).toBe(tile('App two'));
  });

  it('an error thrown by onNavigate propagates', () => {
    setup({
      onNavigate: () => {
        throw new Error('router down');
      },
    });
    const errors: unknown[] = [];
    const onError = (e: ErrorEvent) => {
      errors.push(e.error);
      e.preventDefault();
    };
    window.addEventListener('error', onError);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fireEvent.click(tile('App two'));
    window.removeEventListener('error', onError);
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe('router down');
  });
});

describe('AppLauncher: development errors', () => {
  it('lists duplicate ids, empty labels and apps that open nothing', () => {
    const problems = appLauncherProblems(
      [
        { id: 'a', label: 'A', href: '/a' },
        { id: 'a', label: 'A again', href: '/a2' },
        { id: 'b', label: '   ', href: '/b' },
        { id: 'c', label: 'C' },
        { id: 'd', label: 'D', disabled: true },
      ],
      false,
    );
    expect(problems).toEqual([
      'two apps have the id "a": ids must be unique',
      'the app "b" has an empty label: its tile has no accessible name',
      'the app "c" has no href and there is no onNavigate: its tile opens nothing',
    ]);
    expect(appLauncherProblems([{ id: 'c', label: 'C' }], true)).toEqual([]);
  });

  it('logs each problem once with console.error, not at every render; a valid list logs nothing', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(<AppLauncher apps={[{ id: 'x', label: 'X' }]} />);
    rerender(<AppLauncher apps={[{ id: 'x', label: 'X' }]} currentAppId="x" />);
    const own = error.mock.calls.filter((c) => String(c[0]).startsWith('[formrail] <AppLauncher>'));
    expect(own).toEqual([['[formrail] <AppLauncher>: the app "x" has no href and there is no onNavigate: its tile opens nothing.']]);
    error.mockClear();
    render(<AppLauncher apps={APPS} />);
    expect(error).not.toHaveBeenCalled();
  });

  it('duplicate ids still render every app (React keys stay unique)', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <AppLauncher
        apps={[
          { id: 'a', label: 'First', href: '/1' },
          { id: 'a', label: 'Second', href: '/2' },
        ]}
      />,
    );
    expect(tiles()).toHaveLength(2);
    expect(error.mock.calls.some((c) => String(c[0]).includes('Encountered two children with the same key'))).toBe(false);
    expect(error.mock.calls.some((c) => String(c[0]).includes('two apps have the id "a"'))).toBe(true);
  });
});

describe('AppLauncher: disabled apps', () => {
  it('no href, aria-disabled, still a focusable link with the reason as a description', () => {
    setup();
    const three = tile('App three');
    expect(three).not.toHaveAttribute('href');
    expect(three).toHaveAttribute('aria-disabled', 'true');
    expect(three).toHaveAttribute('role', 'link');
    expect(three.tabIndex).toBe(0);
    expect(three).toHaveAccessibleDescription('Third app Not enabled for you');
    // The reason is visible text on the tile (drawn over it, outside the link), not only an attribute.
    expect(within(three.closest('li')!).getByText('Not enabled for you')).toBeInTheDocument();
  });

  it('click, Enter and Space do nothing (no onNavigate, the click is cancelled)', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    setup({ onNavigate });
    const three = tile('App three');
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    three.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    three.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('a disabled app without href is a focusable button with aria-disabled that does nothing', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    setup({ apps: [{ id: 'x', label: 'Locked', disabled: true, disabledReason: 'Ask an admin' }], onNavigate });
    const button = screen.getByRole('button', { name: 'Locked' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toHaveAttribute('disabled');
    expect(button).toHaveAccessibleDescription('Ask an admin');
    await user.click(button);
    button.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('the reason is shown only on a disabled app', () => {
    setup({ apps: [{ id: 'x', label: 'X', href: '/x', disabledReason: 'Ignored while enabled' }] });
    expect(screen.queryByText('Ignored while enabled')).toBeNull();
    expect(tile('X')).not.toHaveAttribute('aria-describedby');
  });

  it('the disabled tile has a dashed outline (a cue that does not rely on colour)', () => {
    setup();
    expect(tile('App three').className.split(' ')).toContain('border-dashed');
    expect(tile('App two').className.split(' ')).not.toContain('border-dashed');
  });

  it('an app disabled while it has the focus keeps the focus (same element), and Enter no longer navigates', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const { rerender } = setup({ onNavigate });
    const two = tile('App two');
    two.focus();
    const next = APPS.map((a) => (a.id === 'two' ? { ...a, disabled: true } : a));
    rerender(<AppLauncher apps={next} onNavigate={onNavigate} />);
    expect(tile('App two')).toBe(two);
    expect(two).toHaveFocus();
    expect(two).not.toHaveAttribute('href');
    await user.keyboard('{Enter}');
    expect(onNavigate).not.toHaveBeenCalled();
  });
});

describe('AppLauncher: current app', () => {
  it('aria-current="true" and a visible marker on the current app only; it can still be opened', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    setup({ currentAppId: 'two', onNavigate });
    expect(tile('App two')).toHaveAttribute('aria-current', 'true');
    expect(tile('App one')).not.toHaveAttribute('aria-current');
    expect(tile('App two').className).toContain('before:');
    expect(tile('App one').className).not.toContain('before:');
    await user.click(tile('App two'));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('an unknown currentAppId marks nothing', () => {
    setup({ currentAppId: 'nope' });
    expect(document.querySelector('[aria-current]')).toBeNull();
  });
});

describe('AppLauncher: loading and empty', () => {
  it('loading: aria-busy region, placeholders hidden from assistive technology, the loading text, no list', () => {
    setup({ loading: true });
    const nav = screen.getByRole('navigation', { name: 'Apps' });
    expect(nav).toHaveAttribute('aria-busy', 'true');
    expect(within(nav).queryByRole('list')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(DEFAULT_LABELS.loading);
    const placeholders = nav.querySelector('[data-rop-app-launcher-placeholders]')!;
    expect(placeholders).toHaveAttribute('aria-hidden', 'true');
    // As many placeholders as the apps already known.
    expect(placeholders.children).toHaveLength(4);
  });

  it('placeholder count: loadingCount, else the known apps, else 4', () => {
    const count = () => document.querySelector('[data-rop-app-launcher-placeholders]')!.children.length;
    const { rerender } = render(<AppLauncher apps={[]} loading />);
    expect(count()).toBe(4);
    rerender(<AppLauncher apps={APPS.slice(0, 2)} loading />);
    expect(count()).toBe(2);
    rerender(<AppLauncher apps={[]} loading loadingCount={7} />);
    expect(count()).toBe(7);
    rerender(<AppLauncher apps={[]} loading loadingCount={0} />);
    expect(count()).toBe(0);
  });

  it.each([
    ['a fraction', 2.9],
    ['a negative number', -1],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
  ])('loadingCount that is %s: ignored, the default is used (no RangeError)', (_, loadingCount) => {
    const count = () => document.querySelector('[data-rop-app-launcher-placeholders]')!.children.length;
    const { rerender } = render(<AppLauncher apps={[]} loading loadingCount={loadingCount} />);
    expect(count()).toBe(4);
    rerender(<AppLauncher apps={APPS.slice(0, 3)} loading loadingCount={loadingCount} />);
    expect(count()).toBe(3);
  });

  it('placeholderCount: only a finite integer of at least 0 is taken', () => {
    expect(placeholderCount(5, 2)).toBe(5);
    expect(placeholderCount(0, 2)).toBe(0);
    expect(placeholderCount(undefined, 2)).toBe(2);
    expect(placeholderCount(undefined, 0)).toBe(4);
    expect(placeholderCount(1.5, 2)).toBe(2);
    expect(placeholderCount(-3, 0)).toBe(4);
    expect(placeholderCount(Number.NaN, 6)).toBe(6);
    expect(placeholderCount(Number.POSITIVE_INFINITY, 0)).toBe(4);
  });

  it('placeholders use the same grid and the same tile frame as the real tiles', () => {
    const { rerender } = render(<AppLauncher apps={APPS} loading />);
    const placeholders = document.querySelector('[data-rop-app-launcher-placeholders]')!;
    const gridClasses = placeholders.className.split(' ').filter((c) => c.includes('grid-cols') || c === 'gap-3');
    const placeholderTile = placeholders.firstElementChild!.firstElementChild!;
    const frame = (el: Element) => el.className.split(' ').filter((c) => /^(p-3|border|rounded-rop-md|gap-3)$/.test(c));
    rerender(<AppLauncher apps={APPS} />);
    const list = screen.getByRole('list');
    for (const c of gridClasses) expect(list.className.split(' ')).toContain(c);
    expect(frame(placeholderTile)).toEqual(frame(tiles()[0]!));
  });

  it('the loading text is no longer read once loaded; aria-busy goes away', () => {
    const { rerender } = setup({ loading: true });
    rerender(<AppLauncher apps={APPS} />);
    const nav = screen.getByRole('navigation');
    expect(nav).not.toHaveAttribute('aria-busy');
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('the status region is outside the aria-busy region, right after it (its change is not withheld)', () => {
    setup({ loading: true });
    const nav = screen.getByRole('navigation');
    const status = screen.getByRole('status');
    expect(nav.contains(status)).toBe(false);
    expect(status.closest('[aria-busy]')).toBeNull();
    expect(nav.nextElementSibling).toBe(status);
    expect(status.className.split(' ')).toContain('sr-only');
  });

  it('mounted already loading: the status region is mounted empty, then filled after the mount', () => {
    // What the first commit puts in the DOM, read by a layout effect of a sibling rendered after the launcher
    // (it runs after the launcher's own commit, before any passive effect).
    const firstCommit: (string | null)[] = [];
    function Probe() {
      useLayoutEffect(() => {
        firstCommit.push(document.querySelector('[role="status"]')?.textContent ?? null);
      }, []);
      return null;
    }
    render(
      <>
        <AppLauncher apps={[]} loading />
        <Probe />
      </>,
    );
    expect(firstCommit).toEqual(['']);
    expect(screen.getByRole('status')).toHaveTextContent(DEFAULT_LABELS.loading);
    // On the server too it starts empty (no hydration mismatch, the client fills it).
    expect(renderToString(<AppLauncher apps={[]} loading />)).toMatch(/role="status"[^>]*><\/span>/);
  });

  it('the same status element stays mounted across loading, loaded, empty and loading again (labels.loading)', () => {
    const { rerender } = render(<AppLauncher apps={APPS} labels={{ loading: 'Fetching' }} />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('');
    rerender(<AppLauncher apps={APPS} loading labels={{ loading: 'Fetching' }} />);
    expect(screen.getByRole('status')).toBe(status);
    expect(status).toHaveTextContent('Fetching');
    rerender(<AppLauncher apps={[]} labels={{ loading: 'Fetching' }} />);
    expect(screen.getByRole('status')).toBe(status);
    expect(status).toHaveTextContent('');
  });

  it('empty list after loading: the empty text, no list; never a grid in between', () => {
    const { rerender } = render(<AppLauncher apps={[]} loading labels={{ empty: 'Nothing to open' }} />);
    const lists: number[] = [];
    rerender(<AppLauncher apps={[]} labels={{ empty: 'Nothing to open' }} />);
    lists.push(document.querySelectorAll('ul').length);
    expect(lists).toEqual([0]);
    expect(screen.getByText('Nothing to open')).toBeInTheDocument();
    expect(document.querySelector('[data-rop-app-launcher-empty]')!.className).toContain('min-h-');
  });

  it('the empty state default text', () => {
    render(<AppLauncher apps={[]} />);
    expect(screen.getByText(DEFAULT_LABELS.empty)).toBeInTheDocument();
  });
});

describe('AppLauncher: the focus when the list changes', () => {
  function Harness({ initial, onReady }: { initial: AppDescriptor[]; onReady: (set: (apps: AppDescriptor[]) => void) => void }) {
    const [apps, setApps] = useState(initial);
    onReady(setApps);
    return (
      <>
        <button type="button">Outside</button>
        <AppLauncher apps={apps} />
      </>
    );
  }
  function mount(initial = APPS) {
    let set!: (apps: AppDescriptor[]) => void;
    render(<Harness initial={initial} onReady={(s) => (set = s)} />);
    return (apps: AppDescriptor[]) => act(() => set(apps));
  }

  it('the focused app disappears: the focus goes to the next app', () => {
    const update = mount();
    tile('App two').focus();
    update(APPS.filter((a) => a.id !== 'two'));
    expect(document.activeElement).toBe(tile('App three'));
  });

  it('the focused app was the last: the focus goes to the previous one', () => {
    const update = mount();
    tile('App four').focus();
    update(APPS.filter((a) => a.id !== 'four'));
    expect(document.activeElement).toBe(tile('App three'));
  });

  it('the next app disappears together with the focused one: the first survivor after it', () => {
    const update = mount();
    tile('App one').focus();
    update(APPS.filter((a) => a.id !== 'one' && a.id !== 'two'));
    expect(document.activeElement).toBe(tile('App three'));
  });

  it('the list becomes empty: the focus goes to the region, not to the page', () => {
    const update = mount();
    tile('App two').focus();
    update([]);
    expect(document.activeElement).toBe(screen.getByRole('navigation'));
  });

  it('the list starts loading while a tile has the focus: the focus goes to the region', () => {
    let setLoading!: (v: boolean) => void;
    function L() {
      const [loading, set] = useState(false);
      setLoading = set;
      return <AppLauncher apps={APPS} loading={loading} />;
    }
    render(<L />);
    tile('App one').focus();
    act(() => setLoading(true));
    expect(document.activeElement).toBe(screen.getByRole('navigation'));
  });

  it('the same app re-rendered as another element (its href removed): the focus follows it', () => {
    const update = mount([...APPS, { id: 'five', label: 'App five', href: '/five' }]);
    tile('App five').focus();
    // No href and no onNavigate is reported in development: not the point here.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    update([...APPS, { id: 'five', label: 'App five' }]);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'App five' }));
  });

  it('the focus moved elsewhere first: removing the tile never steals it back', async () => {
    const update = mount();
    tile('App two').focus();
    screen.getByRole('button', { name: 'Outside' }).focus();
    await Promise.resolve();
    update(APPS.filter((a) => a.id !== 'two'));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Outside' }));
  });

  it('the tile was blurred to the page (a click on blank space): a later removal does not move the focus', async () => {
    const update = mount();
    tile('App two').focus();
    act(() => tile('App two').blur());
    await Promise.resolve();
    expect(document.activeElement).toBe(document.body);
    update(APPS.filter((a) => a.id !== 'two'));
    expect(document.activeElement).toBe(document.body);
  });

  it('the window loses the focus (blur, the tile stays the active element), then the tile disappears: the focus goes to the next app', async () => {
    const update = mount();
    const two = tile('App two');
    two.focus();
    // What a browser does when the user switches window or tab: `focusout` on the tile, `activeElement` unchanged.
    act(() => {
      two.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    await Promise.resolve();
    expect(document.activeElement).toBe(two);
    update(APPS.filter((a) => a.id !== 'two'));
    expect(document.activeElement).toBe(tile('App three'));
  });

  it('a focusout fired by the removal of the tile from the page is not a real loss of focus: the tile is remembered', async () => {
    // Chromium fires `focusout` on a focused element while removing it from the page. Here the whole launcher is
    // taken off the page (a consumer that detaches a hidden panel instead of unmounting it) and put back later.
    const host = document.createElement('div');
    document.body.append(host);
    let set!: (apps: AppDescriptor[]) => void;
    function Detachable() {
      const [apps, setApps] = useState(APPS);
      set = setApps;
      return <AppLauncher apps={apps} />;
    }
    render(<Detachable />, { container: host });
    const two = tile('App two');
    two.focus();
    act(() => {
      two.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      host.remove();
    });
    // The microtask of the blur handler runs while the tile is off the page.
    await Promise.resolve();
    expect(two.isConnected).toBe(false);
    document.body.append(host);
    expect(document.activeElement).toBe(document.body);
    // The remembered tile then disappears from the list: the focus, lost to the page, goes to the next app.
    act(() => set(APPS.filter((a) => a.id !== 'two')));
    expect(document.activeElement).toBe(tile('App three'));
    host.remove();
  });

  it('the tile disappears in the same commit in which another element takes the focus (a dialog focusing its field): the focus stays there', () => {
    let setStep!: (step: number) => void;
    // Takes the focus at mount, in a layout effect, as a dialog moves the focus to its first field (or `autoFocus`).
    function SearchDialog() {
      const input = useRef<HTMLInputElement>(null);
      useLayoutEffect(() => input.current?.focus(), []);
      return (
        <div role="dialog" aria-label="Search">
          <input ref={input} aria-label="Search" />
        </div>
      );
    }
    function WithSearch() {
      const [step, set] = useState(0);
      setStep = set;
      return (
        <>
          {/* Before the launcher: it takes the focus in the commit before the launcher's layout effect runs. */}
          {step === 1 ? <SearchDialog /> : null}
          <AppLauncher apps={step === 1 ? APPS.filter((a) => a.id !== 'two') : APPS} />
        </>
      );
    }
    render(<WithSearch />);
    tile('App two').focus();
    act(() => setStep(1));
    expect(screen.queryByRole('link', { name: 'App two' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Search' }));
  });

  it('an unrelated change of the list does not move the focus', () => {
    const update = mount();
    tile('App two').focus();
    update(APPS.filter((a) => a.id !== 'four'));
    expect(document.activeElement).toBe(tile('App two'));
  });
});

describe('AppLauncher: with the dirty guard', () => {
  function Guarded({ onLeave }: { onLeave: (id: string) => void }) {
    const { guard, dialog } = useDirtyGuard({ when: true });
    return (
      <>
        <AppLauncher apps={APPS} onNavigate={(app) => guard(() => onLeave(app.id))} />
        {dialog}
      </>
    );
  }

  it('onNavigate opens the guard; "Keep editing" returns the focus to the tile and nothing navigates', async () => {
    const user = userEvent.setup();
    const onLeave = vi.fn();
    render(<Guarded onLeave={onLeave} />);
    tile('App two').focus();
    await user.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await vi.waitFor(() => expect(tile('App two')).toHaveFocus());
    expect(onLeave).not.toHaveBeenCalled();
  });
});

describe('AppLauncher: SSR', () => {
  it('renderToString + hydrateRoot: no hydration error, same markup', async () => {
    const element = <AppLauncher apps={APPS} currentAppId="one" onNavigate={() => {}} />;
    const html = renderToString(element);
    expect(html).toContain('href="/one"');
    expect(html).toContain('aria-current="true"');
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.append(host);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { hydrateRoot } = await import('react-dom/client');
    let root: ReturnType<typeof hydrateRoot> | undefined;
    act(() => {
      root = hydrateRoot(host, element, { onRecoverableError: (e) => console.error(e) });
    });
    expect(error).not.toHaveBeenCalled();
    expect(within(host).getByRole('link', { name: 'App one' })).toHaveAttribute('aria-current', 'true');
    act(() => root?.unmount());
    host.remove();
  });

  it('renderToString while loading and empty: no error', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(renderToString(<AppLauncher apps={[]} loading />)).toContain('aria-busy="true"');
    expect(renderToString(<AppLauncher apps={[]} />)).toContain(DEFAULT_LABELS.empty);
    expect(error).not.toHaveBeenCalled();
  });
});
