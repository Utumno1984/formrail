import { useState, type MouseEvent } from 'react';
import { renderToString } from 'react-dom/server';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  AppLauncher,
  appLauncherProblems,
  DEFAULT_LABELS,
  shownExtraGroups,
  type AppLauncherProps,
  type AppLauncherTileElement,
} from './AppLauncher';
import type { AppDescriptor, AppLauncherExtraGroup, AppLauncherExtraItem } from './types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const APPS: AppDescriptor[] = [
  { id: 'one', label: 'App one', description: 'First app', href: '/one' },
  { id: 'two', label: 'App two', href: '/two' },
];

const GROUPS: AppLauncherExtraGroup[] = [
  {
    id: 'more',
    label: 'More modules',
    items: [
      { id: 'x', label: 'Module X', description: 'What module X is for', href: '/x', badge: 'New' },
      { id: 'y', label: 'Module Y', badge: '   ' },
    ],
  },
  { id: 'other', label: 'Other entries', items: [{ id: 'z', label: 'Module Z', href: '/z' }] },
];

const itemTile = (name: string) => screen.getByRole('link', { name }) as HTMLElement;
const listNamed = (name: string) => screen.getByRole('list', { name });

function setup(props: Partial<AppLauncherProps> = {}) {
  return render(<AppLauncher apps={APPS} extraGroups={GROUPS} onExtraItemActivate={vi.fn()} {...props} />);
}

describe('AppLauncher extra groups: public types', () => {
  it('AppDescriptor is unchanged: the same keys as before the extra groups', () => {
    expectTypeOf<keyof AppDescriptor>().toEqualTypeOf<'id' | 'label' | 'description' | 'icon' | 'href' | 'disabled' | 'disabledReason'>();
  });

  it('the extra item and group types, and the callback receives (item, group, event)', () => {
    expectTypeOf<keyof AppLauncherExtraItem>().toEqualTypeOf<'id' | 'label' | 'description' | 'icon' | 'href' | 'badge'>();
    expectTypeOf<keyof AppLauncherExtraGroup>().toEqualTypeOf<'id' | 'label' | 'items'>();
    expectTypeOf<AppLauncherExtraGroup['items']>().toEqualTypeOf<readonly AppLauncherExtraItem[]>();
    expectTypeOf<NonNullable<AppLauncherProps['onExtraItemActivate']>>().parameters.toEqualTypeOf<
      [AppLauncherExtraItem, AppLauncherExtraGroup, MouseEvent<AppLauncherTileElement>]
    >();
    expectTypeOf<AppLauncherProps['extraGroups']>().toEqualTypeOf<readonly AppLauncherExtraGroup[] | undefined>();
  });

  it('no default text speaks of licences, plans, prices, organisations or subscriptions', () => {
    const commercial = /licen[cs]|plan\b|plans|pric|organi[sz]ation|subscri|premium|upgrade|tier|paid|billing/i;
    for (const value of Object.values(DEFAULT_LABELS)) expect(value).not.toMatch(commercial);
    const messages = appLauncherProblems(
      [{ id: 'a', label: '' }],
      false,
      [
        { id: 'g', label: '', items: [{ id: 'a', label: '' }] },
        { id: 'g', label: 'G', items: [] },
      ],
      false,
    );
    expect(messages.length).toBeGreaterThan(0);
    for (const message of messages) expect(message).not.toMatch(commercial);
  });
});

describe('AppLauncher extra groups: structure', () => {
  it('the apps list is named by labels.appsGroup, then each group: its visible label naming its list', () => {
    setup();
    const nav = screen.getByRole('navigation', { name: 'Apps' });
    const lists = within(nav).getAllByRole('list');
    expect(lists).toHaveLength(3);
    expect(lists[0]).toHaveAccessibleName(DEFAULT_LABELS.appsGroup);
    expect(lists[0]).not.toHaveAttribute('aria-labelledby');
    expect(lists[1]).toHaveAccessibleName('More modules');
    expect(lists[2]).toHaveAccessibleName('Other entries');
    // The label is visible text, the element the list points to.
    const label = document.getElementById(lists[1]!.getAttribute('aria-labelledby')!)!;
    expect(label).toHaveTextContent('More modules');
    expect(label.closest('[aria-hidden]')).toBeNull();
    // DOM order: the apps, then the groups in the order given.
    const order = [...nav.querySelectorAll('[data-rop-app-id], [data-rop-app-launcher-item-id]')].map(
      (el) => el.getAttribute('data-rop-app-id') ?? el.getAttribute('data-rop-app-launcher-item-id'),
    );
    expect(order).toEqual(['one', 'two', 'x', 'y', 'z']);
  });

  it('labels.appsGroup names the apps list when groups are shown', () => {
    setup({ labels: { appsGroup: 'Your apps' } });
    expect(listNamed('Your apps')).toBe(screen.getAllByRole('list')[0]);
  });

  it('no visible heading for the apps: the first child of the region is still the apps grid', () => {
    setup();
    const nav = screen.getByRole('navigation');
    expect(nav.firstElementChild).toBe(listNamed('Apps'));
  });

  it('a group without items is not rendered; only empty groups: the markup of a launcher without extra groups', () => {
    const { container, rerender } = render(<AppLauncher apps={APPS} />);
    const plain = container.innerHTML;
    rerender(<AppLauncher apps={APPS} extraGroups={[]} labels={{ appsGroup: 'Unused' }} />);
    expect(container.innerHTML).toBe(plain);
    rerender(<AppLauncher apps={APPS} extraGroups={[{ id: 'e', label: 'Empty group', items: [] }]} labels={{ appsGroup: 'Unused' }} />);
    expect(container.innerHTML).toBe(plain);
    expect(screen.queryByText('Empty group')).toBeNull();
    rerender(<AppLauncher apps={APPS} extraGroups={[{ id: 'e', label: 'Empty group', items: [] }, GROUPS[1]!]} />);
    expect(screen.queryByText('Empty group')).toBeNull();
    expect(screen.getAllByRole('list')).toHaveLength(2);
  });

  it('shownExtraGroups keeps only the groups with items', () => {
    expect(shownExtraGroups(undefined)).toEqual([]);
    expect(shownExtraGroups([{ id: 'e', label: 'E', items: [] }, GROUPS[1]!])).toEqual([GROUPS[1]]);
  });

  it('Tab visits the apps, then the items of each group, in DOM order', async () => {
    const user = userEvent.setup();
    setup();
    const order: string[] = [];
    for (let i = 0; i < 5; i++) {
      await user.tab();
      const el = document.activeElement as HTMLElement;
      order.push(el.getAttribute('data-rop-app-id') ?? el.getAttribute('data-rop-app-launcher-item-id')!);
    }
    expect(order).toEqual(['one', 'two', 'x', 'y', 'z']);
  });

  it('the group label is cut with an ellipsis inside a real max-width', () => {
    setup();
    const label = document.getElementById(listNamed('More modules').getAttribute('aria-labelledby')!)!;
    expect(label.className.split(' ')).toEqual(expect.arrayContaining(['max-w-full', 'overflow-hidden', 'text-ellipsis', 'whitespace-nowrap']));
  });

  it('no non-DOM prop leaks on the region', () => {
    setup();
    const nav = screen.getByRole('navigation');
    for (const attr of ['extragroups', 'onextraitemactivate']) expect(nav.hasAttribute(attr)).toBe(false);
  });
});

describe('AppLauncher extra groups: the item tiles', () => {
  it('with an href a link, without one a button; named by the label, described by the description and the badge', () => {
    setup();
    const x = itemTile('Module X');
    expect(x.tagName).toBe('A');
    expect(x).toHaveAttribute('href', '/x');
    expect(x).toHaveAccessibleName('Module X');
    expect(x.textContent).toBe('Module X');
    expect(x).toHaveAccessibleDescription('What module X is for New');
    const y = screen.getByRole('button', { name: 'Module Y' });
    expect(y).toHaveAttribute('type', 'button');
    // A badge of spaces only is not shown.
    expect(y).not.toHaveAttribute('aria-describedby');
    expect(y.closest('li')!.querySelector('[data-rop-app-launcher-badge]')).toBeNull();
  });

  it('the badge is visible text outside the link, with the neutral tone (no error or warning look)', () => {
    setup();
    const li = itemTile('Module X').closest('li')!;
    const badge = within(li).getByText('New');
    expect(itemTile('Module X').contains(badge)).toBe(false);
    const pill = badge.closest('[id]')!;
    expect(pill.className).toContain('outline-rop-border');
    expect(pill.className).not.toMatch(/rop-(error|warning)/);
  });

  it('never aria-disabled, never aria-current (also when currentAppId is the id of an item), never the disabled look', () => {
    setup({ currentAppId: 'x' });
    for (const el of document.querySelectorAll('[data-rop-app-launcher-item-id]')) {
      expect(el).not.toHaveAttribute('aria-disabled');
      expect(el).not.toHaveAttribute('aria-current');
      expect(el.className.split(' ')).not.toContain('border-dashed');
      expect(el.className).not.toContain('before:');
      expect(el.closest('li')!.querySelector('[data-rop-app-disabled-reason], .italic')).toBeNull();
    }
    expect(document.querySelector('[aria-current]')).toBeNull();
  });

  it('the item tiles have the same frame and minimum height as the apps', () => {
    setup();
    const frame = (el: Element) => el.className;
    expect(frame(itemTile('Module Z'))).toBe(frame(screen.getByRole('link', { name: 'App two' })));
    const block = document.getElementById(itemTile('Module Z').getAttribute('aria-labelledby')!)!.parentElement!;
    expect(block.className.split(' ')).toContain('min-h-[3lh]');
    expect(listNamed('More modules').className).toBe(listNamed('Apps').className);
  });

  it('an item with the id of an app: both rendered, React keys still unique, an error in development', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<AppLauncher apps={APPS} extraGroups={[{ id: 'g', label: 'G', items: [{ id: 'one', label: 'Item one', href: '/i1' }, { id: 'one', label: 'Item one again', href: '/i2' }] }]} />);
    expect(screen.getByRole('link', { name: 'App one' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Item one' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Item one again' })).toBeInTheDocument();
    expect(error.mock.calls.some((c) => String(c[0]).includes('Encountered two children with the same key'))).toBe(false);
    expect(error.mock.calls.some((c) => String(c[0]).includes('the extra item "one" has the id of another app or extra item'))).toBe(true);
  });
});

describe('AppLauncher extra groups: activation', () => {
  it('a plain click on an item with an href: native navigation cancelled, the callback once with (item, group, event), the tile focused', () => {
    let active: Element | null = null;
    const onExtraItemActivate = vi.fn(() => (active = document.activeElement));
    const onNavigate = vi.fn();
    setup({ onExtraItemActivate, onNavigate });
    const event = new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    itemTile('Module X').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(onExtraItemActivate).toHaveBeenCalledTimes(1);
    const [item, group, e] = onExtraItemActivate.mock.calls[0] as unknown as [AppLauncherExtraItem, AppLauncherExtraGroup, { type: string }];
    expect(item).toBe(GROUPS[0]!.items[0]);
    expect(group).toBe(GROUPS[0]);
    expect(e.type).toBe('click');
    expect(active).toBe(itemTile('Module X'));
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('Enter on an item with an href calls the callback, not onNavigate', async () => {
    const user = userEvent.setup();
    const onExtraItemActivate = vi.fn();
    const onNavigate = vi.fn();
    setup({ onExtraItemActivate, onNavigate });
    itemTile('Module Z').focus();
    await user.keyboard('{Enter}');
    expect(onExtraItemActivate).toHaveBeenCalledTimes(1);
    expect(onExtraItemActivate.mock.calls[0]![0]).toMatchObject({ id: 'z' });
    expect(onExtraItemActivate.mock.calls[0]![1]).toMatchObject({ id: 'other' });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it.each([
    ['Ctrl', { ctrlKey: true }],
    ['Cmd', { metaKey: true }],
    ['Shift', { shiftKey: true }],
    ['Alt', { altKey: true }],
    ['the middle button', { button: 1 }],
  ])('a click with %s on an item with an href: left to the browser, the callback not called', (_, init) => {
    const onExtraItemActivate = vi.fn();
    setup({ onExtraItemActivate });
    const event = new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init });
    itemTile('Module X').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(onExtraItemActivate).not.toHaveBeenCalled();
    expect(itemTile('Module X')).toHaveAttribute('href', '/x');
  });

  it.each([
    ['a plain click', {}],
    ['Ctrl', { ctrlKey: true }],
    ['Cmd', { metaKey: true }],
    ['Shift', { shiftKey: true }],
    ['Alt', { altKey: true }],
  ])('%s on an item without an href (a button): the callback once', (_, init) => {
    const onExtraItemActivate = vi.fn();
    setup({ onExtraItemActivate });
    screen.getByRole('button', { name: 'Module Y' }).dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init }));
    expect(onExtraItemActivate).toHaveBeenCalledTimes(1);
    expect(onExtraItemActivate.mock.calls[0]![0]).toMatchObject({ id: 'y' });
  });

  it('Enter and Space on an item without an href call the callback', async () => {
    const user = userEvent.setup();
    const onExtraItemActivate = vi.fn();
    setup({ onExtraItemActivate });
    screen.getByRole('button', { name: 'Module Y' }).focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onExtraItemActivate).toHaveBeenCalledTimes(2);
  });

  it('opening an app never calls onExtraItemActivate', () => {
    const onExtraItemActivate = vi.fn();
    const onNavigate = vi.fn();
    setup({ onExtraItemActivate, onNavigate });
    fireEvent.click(screen.getByRole('link', { name: 'App two' }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onExtraItemActivate).not.toHaveBeenCalled();
  });

  it('without onExtraItemActivate an item with an href is a plain link (the click is not cancelled)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<AppLauncher apps={APPS} extraGroups={GROUPS} />);
    const event = new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    itemTile('Module X').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('an error thrown by onExtraItemActivate propagates, and the next activation still works', () => {
    let fail = true;
    const calls: string[] = [];
    setup({
      onExtraItemActivate: (item) => {
        calls.push(item.id);
        if (fail) throw new Error('consumer down');
      },
    });
    const errors: unknown[] = [];
    const onError = (e: ErrorEvent) => {
      errors.push(e.error);
      e.preventDefault();
    };
    window.addEventListener('error', onError);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fireEvent.click(itemTile('Module X'));
    window.removeEventListener('error', onError);
    expect((errors[0] as Error).message).toBe('consumer down');
    fail = false;
    fireEvent.click(itemTile('Module Z'));
    expect(calls).toEqual(['x', 'z']);
  });
});

describe('AppLauncher extra groups: development errors', () => {
  it('duplicate ids across apps and items, empty labels of items and groups, duplicate group ids, items that do nothing', () => {
    const problems = appLauncherProblems(
      [{ id: 'a', label: 'A', href: '/a' }],
      false,
      [
        { id: 'g', label: ' ', items: [{ id: 'a', label: 'Same as the app', href: '/1' }, { id: 'b', label: '' , href: '/b' }] },
        { id: 'g', label: 'Again', items: [{ id: 'b', label: 'B again' }] },
      ],
      false,
    );
    expect(problems).toEqual([
      'the extra group "g" has an empty label: its list has no accessible name',
      'the extra item "a" has the id of another app or extra item: ids must be unique',
      'the extra item "b" has an empty label: its tile has no accessible name',
      'two extra groups have the id "g": ids must be unique',
      'the extra item "b" has the id of another app or extra item: ids must be unique',
      'the extra item "b" has no href and there is no onExtraItemActivate: its tile does nothing',
    ]);
    expect(appLauncherProblems([], false, [{ id: 'g', label: 'G', items: [{ id: 'c', label: 'C' }] }], true)).toEqual([]);
    // An empty href counts as no href.
    expect(appLauncherProblems([], false, [{ id: 'g', label: 'G', items: [{ id: 'c', label: 'C', href: '' }] }], false)).toHaveLength(1);
  });

  it('logs each problem once with console.error; a valid launcher with groups logs nothing', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const groups = [{ id: 'g', label: 'G', items: [{ id: 'c', label: 'C' }] }];
    const { rerender } = render(<AppLauncher apps={APPS} extraGroups={groups} />);
    rerender(<AppLauncher apps={APPS} extraGroups={groups} currentAppId="one" />);
    const own = error.mock.calls.filter((c) => String(c[0]).startsWith('[formrail] <AppLauncher>'));
    expect(own).toEqual([['[formrail] <AppLauncher>: the extra item "c" has no href and there is no onExtraItemActivate: its tile does nothing.']]);
    error.mockClear();
    setup();
    expect(error).not.toHaveBeenCalled();
  });
});

describe('AppLauncher extra groups: loading and empty', () => {
  it('while loading the groups are not shown (one loading state); they appear with the apps', () => {
    const { rerender } = setup({ loading: true });
    expect(screen.queryByText('More modules')).toBeNull();
    expect(screen.queryAllByRole('list')).toHaveLength(0);
    expect(document.querySelector('[data-rop-app-launcher-placeholders]')!.children).toHaveLength(APPS.length);
    rerender(<AppLauncher apps={APPS} extraGroups={GROUPS} onExtraItemActivate={vi.fn()} />);
    expect(screen.getAllByRole('list')).toHaveLength(3);
  });

  it('no apps and groups: the empty text in place of the apps, the groups under it', () => {
    setup({ apps: [] });
    const nav = screen.getByRole('navigation');
    const empty = nav.querySelector('[data-rop-app-launcher-empty]')!;
    expect(empty).toHaveTextContent(DEFAULT_LABELS.empty);
    expect(nav.firstElementChild).toBe(empty);
    expect(screen.getAllByRole('list')).toHaveLength(2);
    expect(screen.queryByRole('list', { name: 'Apps' })).toBeNull();
  });
});

describe('AppLauncher extra groups: the focus when the lists change', () => {
  function mount(initialApps = APPS, initialGroups = GROUPS) {
    let set!: (next: { apps?: AppDescriptor[]; groups?: AppLauncherExtraGroup[] }) => void;
    function Harness() {
      const [state, setState] = useState({ apps: initialApps, groups: initialGroups });
      set = (next) => setState((s) => ({ ...s, ...next }));
      return <AppLauncher apps={state.apps} extraGroups={state.groups} onExtraItemActivate={() => {}} />;
    }
    render(<Harness />);
    return (next: { apps?: AppDescriptor[]; groups?: AppLauncherExtraGroup[] }) => act(() => set(next));
  }

  it('the focused item disappears: the focus goes to the next item of its group', () => {
    const update = mount();
    itemTile('Module X').focus();
    update({ groups: [{ ...GROUPS[0]!, items: GROUPS[0]!.items.slice(1) }, GROUPS[1]!] });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Module Y' }));
  });

  it('the whole group with the focused item disappears: the focus goes to the first item of the next group', () => {
    const update = mount();
    itemTile('Module X').focus();
    update({ groups: [GROUPS[1]!] });
    expect(document.activeElement).toBe(itemTile('Module Z'));
  });

  it('the last item of the last group disappears: the focus goes to the previous tile', () => {
    const update = mount();
    itemTile('Module Z').focus();
    update({ groups: [GROUPS[0]!] });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Module Y' }));
  });

  it('the only group disappears after the apps: the focus goes to the last app', () => {
    const update = mount(APPS, [GROUPS[1]!]);
    itemTile('Module Z').focus();
    update({ groups: [] });
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'App two' }));
  });

  it('the last app disappears: the focus goes to the first item of the first group', () => {
    const update = mount();
    screen.getByRole('link', { name: 'App two' }).focus();
    update({ apps: APPS.slice(0, 1) });
    expect(document.activeElement).toBe(itemTile('Module X'));
  });

  it('everything disappears: the focus goes to the region, never to the page', () => {
    const update = mount();
    itemTile('Module X').focus();
    update({ apps: [], groups: [] });
    expect(document.activeElement).toBe(screen.getByRole('navigation'));
  });

  it('an item that loses or gains its href while focused keeps the focus (button <-> link)', () => {
    const update = mount();
    itemTile('Module X').focus();
    const withoutHref = { ...GROUPS[0]!.items[0]!, href: undefined };
    update({ groups: [{ ...GROUPS[0]!, items: [withoutHref, GROUPS[0]!.items[1]!] }, GROUPS[1]!] });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Module X' }));
    update({ groups: GROUPS });
    expect(document.activeElement).toBe(itemTile('Module X'));
  });

  it('groups that arrive after the mount do not move the focus on an app', () => {
    const update = mount(APPS, []);
    const two = screen.getByRole('link', { name: 'App two' });
    two.focus();
    update({ groups: GROUPS });
    expect(document.activeElement).toBe(two);
  });
});

describe('AppLauncher extra groups: SSR', () => {
  it('renderToString + hydrateRoot with extra groups: no hydration error', async () => {
    const element = <AppLauncher apps={APPS} extraGroups={GROUPS} onExtraItemActivate={() => {}} onNavigate={() => {}} />;
    const html = renderToString(element);
    expect(html).toContain('href="/x"');
    expect(html).toContain('More modules');
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
    expect(within(host).getByRole('list', { name: 'More modules' })).toBeInTheDocument();
    act(() => root?.unmount());
    host.remove();
  });
});
