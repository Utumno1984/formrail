import { useEffect, useState, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Button } from '../button/Button';
import { Dialog, DialogBody, DialogClose, DialogContent, DialogHeader, DialogTitle } from '../dialog/Dialog';
import { exampleStory } from '../internal/example-story';
import { CLASS_NAME_ARG, storyControl, withoutControls } from '../internal/story-docs';
import { useDirtyGuard } from '../object-page/use-dirty-guard';
import { AppLauncher, type AppLauncherProps } from './AppLauncher';
import type { AppDescriptor, AppLauncherExtraGroup, AppLauncherExtraItem } from './types';

// Neutral data only: the launcher knows nothing about what the apps are.
const NAMES = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

// Decorative, neutral glyphs (the icon is `aria-hidden`: the name is the label).
const SHAPES: ReactNode[] = [
  <circle key="c" cx="12" cy="12" r="8" />,
  <rect key="s" x="4" y="4" width="16" height="16" rx="2" />,
  <path key="t" d="M12 3 21 20H3z" />,
  <path key="d" d="M12 2 22 12 12 22 2 12z" />,
  <path key="h" d="M7 3h10l5 9-5 9H7l-5-9z" />,
  <path key="p" d="M12 2l3 7h7l-5.5 4.5L18.5 21 12 16.5 5.5 21l2-7.5L2 9h7z" />,
];
const icon = (i: number) => (
  <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
    {SHAPES[i % SHAPES.length]}
  </svg>
);

/** `count` neutral apps, "App one"…; every app has an icon, a description and an href. */
function makeApps(count: number): AppDescriptor[] {
  return Array.from({ length: count }, (_, i) => {
    const name = NAMES[i] ?? String(i + 1);
    return {
      id: name,
      label: `App ${name}`,
      description: `Short description of app ${name}`,
      href: `#app-${name}`,
      icon: icon(i),
    };
  });
}

const DISABLED_REASON = 'You do not have access to this app';

interface DemoArgs extends Omit<AppLauncherProps, 'apps' | 'onNavigate' | 'onExtraItemActivate'> {
  /** Number of apps in the list (story control). */
  count: number;
  /** Position (1-based) of the app shown as disabled, 0 for none (story control). */
  disabledApp: number;
  /** Pass `onNavigate` (story control): off, the tiles are plain links the browser follows. */
  routed: boolean;
  onNavigate: NonNullable<AppLauncherProps['onNavigate']>;
  /** Number of extra groups after the apps (story control). */
  extraGroupCount: 0 | 1 | 2;
  /** Whether the extra items have an `href` (story control): off, they are buttons. */
  extraWithHref: boolean;
  /** `badge` of the first item of each extra group (story control). */
  extraBadge: string;
  onExtraItemActivate: NonNullable<AppLauncherProps['onExtraItemActivate']>;
}

function appsOf({ count, disabledApp }: Pick<DemoArgs, 'count' | 'disabledApp'>): AppDescriptor[] {
  return makeApps(count).map((app, i) => (i + 1 === disabledApp ? { ...app, disabled: true, disabledReason: DISABLED_REASON } : app));
}

// Neutral extra entries: they do not open an app (content of the page, or a page at an href).
const EXTRA_GROUPS: { id: string; label: string; items: { id: string; label: string; description: string }[] }[] = [
  {
    id: 'more',
    label: 'More modules',
    items: [
      { id: 'module-x', label: 'Module X', description: 'Learn what module X adds' },
      { id: 'module-y', label: 'Module Y', description: 'Learn what module Y adds' },
    ],
  },
  {
    id: 'help',
    label: 'Help and information',
    items: [{ id: 'guide', label: 'Getting started', description: 'A short tour of the apps' }],
  },
];

function extraGroupsOf({
  extraGroupCount,
  extraWithHref,
  extraBadge,
}: Pick<DemoArgs, 'extraGroupCount' | 'extraWithHref' | 'extraBadge'>): AppLauncherExtraGroup[] {
  return EXTRA_GROUPS.slice(0, extraGroupCount).map((group) => ({
    ...group,
    items: group.items.map((item, i) => ({
      ...item,
      href: extraWithHref ? `#${item.id}` : undefined,
      badge: i === 0 ? extraBadge : undefined,
      icon: icon(i + 3),
    })),
  }));
}

/** The args of the story controls taken apart from those passed straight to the launcher. */
function launcherProps({
  count,
  disabledApp,
  routed,
  onNavigate,
  extraGroupCount,
  extraWithHref,
  extraBadge,
  onExtraItemActivate,
  ...args
}: DemoArgs): AppLauncherProps {
  return {
    ...args,
    apps: appsOf({ count, disabledApp }),
    onNavigate: routed ? onNavigate : undefined,
    extraGroups: extraGroupsOf({ extraGroupCount, extraWithHref, extraBadge }),
    onExtraItemActivate,
  };
}

const meta: Meta<DemoArgs> = {
  title: 'Navigation/AppLauncher',
  component: AppLauncher as never,
  parameters: { layout: 'padded' },
  argTypes: {
    currentAppId: {
      control: 'select',
      options: ['(none)', ...NAMES],
      mapping: { '(none)': undefined },
    },
    loading: { control: 'boolean' },
    loadingCount: { control: { type: 'number', min: 0, max: 12 } },
    labels: { control: 'object' },
    className: CLASS_NAME_ARG,
    ...withoutControls('apps'),
    onNavigate: { control: false },
    count: storyControl({ control: { type: 'range', min: 0, max: 12, step: 1 }, description: 'Number of apps in `apps` ("App one"…).' }),
    disabledApp: storyControl({
      control: { type: 'range', min: 0, max: 12, step: 1 },
      description: 'Position (1-based) of the app that is `disabled`, with a `disabledReason`; 0 for none.',
    }),
    routed: storyControl({
      control: 'boolean',
      description: 'Pass `onNavigate` (a router takes over a plain click or Enter). Off: no `onNavigate`, the tiles are plain links the browser follows.',
    }),
    ...withoutControls('extraGroups'),
    onExtraItemActivate: { control: false },
    extraGroupCount: storyControl({
      control: 'select',
      options: [0, 1, 2],
      description: 'Number of groups in `extraGroups` ("More modules", then "Help and information"), shown after the apps.',
    }),
    extraWithHref: storyControl({
      control: 'boolean',
      description: 'Give the extra items an `href` (links: Ctrl/Cmd+click opens a new tab). Off: buttons, every click goes to `onExtraItemActivate`.',
    }),
    extraBadge: storyControl({
      control: 'text',
      description: '`badge` of the first item of each extra group; empty or only spaces: no badge.',
    }),
    // A union of levels: a select; "(none)" leaves the prop out (the labels are plain text).
    groupHeadingLevel: {
      control: 'select',
      options: ['(none)', 2, 3, 4, 5, 6],
      mapping: { '(none)': undefined },
    },
  },
  args: {
    count: 4,
    disabledApp: 3,
    routed: true,
    loading: false,
    onNavigate: fn(),
    extraGroupCount: 0,
    extraWithHref: true,
    extraBadge: 'New',
    onExtraItemActivate: fn(),
  },
  render: (args) => <AppLauncher {...launcherProps(args)} />,
};

export default meta;
type Story = StoryObj<DemoArgs>;

export const Example: Story = { tags: ['example', '!visual'], ...exampleStory('AppLauncher.example.tsx') };

/**
 * Controls: number of apps, the disabled one, the current one, loading. The play function uses the keyboard only:
 * Tab to the third app, which is disabled (it takes the focus and its reason is its description, but Enter opens
 * nothing), then Tab and Enter on the fourth, which reaches `onNavigate` with that app.
 */
export const Playground: Story = {
  tags: ['playground'],
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const nav = canvas.getByRole('navigation', { name: 'Apps' });
    await userEvent.tab();
    await expect(canvas.getByRole('link', { name: 'App one' })).toHaveFocus();
    await userEvent.tab();
    await userEvent.tab();
    const third = canvas.getByRole('link', { name: 'App three' });
    await expect(third).toHaveFocus();
    await expect(third).toHaveAttribute('aria-disabled', 'true');
    await expect(third).not.toHaveAttribute('href');
    await expect(third).toHaveAccessibleDescription(`Short description of app three ${DISABLED_REASON}`);
    await userEvent.keyboard('{Enter}');
    await expect(args.onNavigate).not.toHaveBeenCalled();
    await userEvent.tab();
    await expect(canvas.getByRole('link', { name: 'App four' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onNavigate).toHaveBeenCalledTimes(1);
    await expect(args.onNavigate).toHaveBeenCalledWith(expect.objectContaining({ id: 'four' }), expect.anything());
    // `onNavigate` took over: the frame did not follow the href.
    await expect(nav).toBeInTheDocument();
  },
};

const frame = { color: 'var(--color-rop-text)' } as const;

/** Visual: six apps, the second is the current one. */
export const Apps: Story = {
  tags: ['visual'],
  args: { count: 6, disabledApp: 0, currentAppId: 'two' },
};

/** Visual: the disabled app keeps its place, with a dashed outline and its reason. */
export const DisabledApp: Story = {
  tags: ['visual'],
  args: { count: 4, disabledApp: 3 },
};

/** Visual: six placeholders, same size and columns as the six apps of `Apps`. */
export const Loading: Story = {
  tags: ['visual'],
  args: { count: 6, disabledApp: 0, loading: true },
};

/** Visual: the list is empty once loaded. */
export const Empty: Story = {
  tags: ['visual'],
  args: { count: 0, disabledApp: 0 },
};

/** No icon, no description, long names: same height for every tile, names cut with an ellipsis. */
export const LongNamesNoIcons: Story = {
  tags: ['visual'],
  parameters: { controls: { disable: true } },
  render: (args) => (
    <div style={frame}>
      <AppLauncher
        onNavigate={args.onNavigate}
        apps={[
          { id: 'a', label: 'App one with a very long name that cannot fit on one line of the tile', href: '#a' },
          { id: 'b', label: 'App two', href: '#b', description: 'A description long enough to need two lines in a narrow tile, and then some more words' },
          { id: 'c', label: 'App three', href: '#c', icon: icon(2) },
          { id: 'd', label: 'App four with another quite long name', href: '#d', disabled: true, disabledReason: DISABLED_REASON },
        ]}
      />
    </div>
  ),
};

/** The list arrives later: "Finish loading" swaps the placeholders for the apps (or for the empty state). */
export const LoadingToData: Story = {
  args: { count: 6, disabledApp: 0, loadingCount: 6 },
  argTypes: { loading: { table: { disable: true } } },
  render: function Render(args) {
    const [loading, setLoading] = useState(true);
    const props = launcherProps(args);
    return (
      <div style={{ ...frame, display: 'grid', gap: 12 }}>
        <div>
          <Button variant="secondary" onClick={() => setLoading((l) => !l)}>
            {loading ? 'Finish loading' : 'Load again'}
          </Button>
        </div>
        <div data-testid="launcher-frame">
          <AppLauncher {...props} loading={loading} apps={loading ? [] : props.apps} />
        </div>
      </div>
    );
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const nav = canvas.getByRole('navigation', { name: 'Apps' });
    await expect(nav.querySelector('[data-rop-app-launcher-placeholders]')).toHaveAttribute('aria-busy', 'true');
    // The status region is mounted empty and filled just after the mount (so that it is announced).
    await waitFor(() => expect(canvas.getByRole('status')).toHaveTextContent('Loading apps'));
    const before = nav.getBoundingClientRect().height;
    await userEvent.click(canvas.getByRole('button', { name: 'Finish loading' }));
    await expect(canvas.queryAllByRole('link')).toHaveLength(args.count);
    await expect(nav.querySelector('[aria-busy]')).toBeNull();
    // As many placeholders as apps: the launcher keeps its height.
    if (args.count === args.loadingCount) await expect(Math.abs(nav.getBoundingClientRect().height - before)).toBeLessThanOrEqual(0.5);
    if (args.count === 0) await expect(canvas.getByText('No apps available')).toBeVisible();
  },
};

/** Forty apps in a container of the consumer that scrolls: the launcher never scrolls sideways. */
export const ManyApps: Story = {
  args: { count: 0, disabledApp: 0 },
  parameters: { controls: { disable: true } },
  render: (args) => {
    const apps = Array.from({ length: 40 }, (_, i) => ({
      id: `app-${i + 1}`,
      label: `App ${i + 1}`,
      description: `Short description of app ${i + 1}`,
      href: `#app-${i + 1}`,
      icon: icon(i),
    }));
    return (
      <div data-testid="scroll-container" style={{ ...frame, maxHeight: 360, overflowY: 'auto' }}>
        <AppLauncher apps={apps} onNavigate={args.onNavigate} />
      </div>
    );
  },
};

/**
 * The permissions change while the user is on the launcher: "Remove App two in 1 s" takes App two out of the list a
 * second later. If App two has the focus then, the focus moves to the next app, not to the page.
 */
export const ListChanges: Story = {
  args: { count: 4, disabledApp: 0 },
  parameters: { controls: { disable: true } },
  render: function Render(args) {
    const props = launcherProps(args);
    const [apps, setApps] = useState(() => props.apps);
    const [pending, setPending] = useState(false);
    useEffect(() => {
      if (!pending) return undefined;
      const timer = setTimeout(() => {
        setApps((list) => list.filter((app) => app.id !== 'two'));
        setPending(false);
      }, 1000);
      return () => clearTimeout(timer);
    }, [pending]);
    return (
      <div style={{ ...frame, display: 'grid', gap: 12 }}>
        <div>
          <Button variant="secondary" onClick={() => setPending(true)} disabled={pending}>
            Remove App two in 1 s
          </Button>
        </div>
        <AppLauncher {...props} apps={apps} />
      </div>
    );
  },
};

/**
 * `onNavigate` goes through `useDirtyGuard` (a page with unsaved changes): opening an app asks first, and "Keep
 * editing" returns the focus to the tile that was activated.
 */
export const WithDirtyGuard: Story = {
  args: { count: 4, disabledApp: 0 },
  parameters: { controls: { disable: true } },
  render: function Render(args) {
    const { guard, dialog } = useDirtyGuard({ when: true });
    return (
      <div style={frame}>
        <AppLauncher
          {...launcherProps(args)}
          onNavigate={args.routed ? (app, event) => guard(() => args.onNavigate(app, event)) : undefined}
        />
        {dialog}
      </div>
    );
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.tab();
    await userEvent.tab();
    const two = canvas.getByRole('link', { name: 'App two' });
    await expect(two).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    const dialog = await body.findByRole('dialog', { name: 'Unsaved changes' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(two).toHaveFocus());
    await expect(args.onNavigate).not.toHaveBeenCalled();
  },
};

/**
 * One extra group after the apps: "More modules" does not open an app, it opens content of the page (here, the
 * Actions panel shows `onExtraItemActivate`). The play function uses the keyboard only: Tab past the last app into
 * the group, whose list is named by its visible label, then Enter on Module X reaches `onExtraItemActivate` with
 * that item, and never `onNavigate`.
 */
export const WithExtraGroup: Story = {
  tags: ['visual'],
  args: { count: 4, disabledApp: 0, extraGroupCount: 1 },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('list', { name: 'Apps' })).toBeInTheDocument();
    for (let i = 0; i < args.count; i++) await userEvent.tab();
    await expect(canvas.getByRole('link', { name: 'App four' })).toHaveFocus();
    await userEvent.tab();
    const group = canvas.getByRole('list', { name: 'More modules' });
    const x = within(group).getByRole('link', { name: 'Module X' });
    await expect(x).toHaveFocus();
    await expect(x).toHaveAccessibleDescription('Learn what module X adds New');
    await userEvent.keyboard('{Enter}');
    await expect(args.onExtraItemActivate).toHaveBeenCalledTimes(1);
    await expect(args.onExtraItemActivate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'module-x' }),
      expect.objectContaining({ id: 'more' }),
      expect.anything(),
    );
    await expect(args.onNavigate).not.toHaveBeenCalled();
  },
};

/**
 * An extra item opens a dialog of the consumer (a controlled `Dialog`): it is opened from `onExtraItemActivate`,
 * while the tile has the focus, so closing it (Escape, or its button) returns the focus to the tile.
 */
export const ExtraItemOpensDialog: Story = {
  args: { count: 2, disabledApp: 0, extraGroupCount: 1, extraWithHref: false },
  parameters: { controls: { disable: true } },
  render: function Render(args) {
    const [open, setOpen] = useState<AppLauncherExtraItem | null>(null);
    const [activations, setActivations] = useState(0);
    return (
      <div style={{ ...frame, display: 'grid', gap: 12 }}>
        <AppLauncher
          {...launcherProps(args)}
          onExtraItemActivate={(item, group, event) => {
            args.onExtraItemActivate(item, group, event);
            setActivations((n) => n + 1);
            setOpen(item);
          }}
        />
        <p data-testid="activations" style={{ margin: 0 }}>
          Items activated: {activations}
        </p>
        <Dialog open={open !== null} onOpenChange={(next) => (next ? undefined : setOpen(null))}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{open?.label}</DialogTitle>
              <DialogClose />
            </DialogHeader>
            <DialogBody>{open?.description}</DialogBody>
          </DialogContent>
        </Dialog>
      </div>
    );
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const y = canvas.getByRole(args.extraWithHref ? 'link' : 'button', { name: 'Module Y' });
    y.focus();
    await userEvent.keyboard('{Enter}');
    const dialog = await body.findByRole('dialog', { name: 'Module Y' });
    await expect(dialog).toHaveTextContent('Learn what module Y adds');
    await expect(args.onExtraItemActivate).toHaveBeenCalledTimes(1);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(y).toHaveFocus());
    await expect(args.onNavigate).not.toHaveBeenCalled();
  },
};

const LONG_GROUP_LABEL = 'Help and information about every app of this space, and how to reach the people who run it';
const LONG_DESCRIPTION =
  'Learn what module X adds to the apps you already use, how it is set up, who can turn it on, and where to find its guide';

/**
 * The extra groups change while the user is on the launcher: "Show the extra groups" adds them after the mount (the
 * apps do not move), "Remove More modules in 1 s" takes the first group away a second later, "Remove the last group
 * in 1 s" the last one. If one of its items has the focus then, the focus moves to the next tile, or to the previous
 * one when there is none after it, never to the page. The second group has a long label, cut with an ellipsis; Module X
 * has a long description over its badge, cut to one line so that the badge stays inside the tile.
 */
export const ExtraGroupsChange: Story = {
  args: { count: 4, disabledApp: 0, extraGroupCount: 2 },
  parameters: { controls: { disable: true } },
  render: function Render(args) {
    const props = launcherProps(args);
    // The second group has a long label; the first item (with the badge) a description far longer than its line.
    const all = (props.extraGroups ?? []).map((group, i) =>
      i === 1
        ? { ...group, label: LONG_GROUP_LABEL }
        : { ...group, items: group.items.map((item, j) => (j === 0 ? { ...item, description: LONG_DESCRIPTION } : item)) },
    );
    const [groups, setGroups] = useState<readonly AppLauncherExtraGroup[]>([]);
    // The id of the group to remove a second later.
    const [pending, setPending] = useState<string | null>(null);
    useEffect(() => {
      if (!pending) return undefined;
      const timer = setTimeout(() => {
        setGroups((list) => list.filter((group) => group.id !== pending));
        setPending(null);
      }, 1000);
      return () => clearTimeout(timer);
    }, [pending]);
    return (
      <div style={{ ...frame, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Button variant="secondary" onClick={() => setGroups(all)}>
            Show the extra groups
          </Button>
          <Button variant="secondary" onClick={() => setPending('more')} disabled={pending !== null}>
            Remove More modules in 1 s
          </Button>
          <Button variant="secondary" onClick={() => setPending('help')} disabled={pending !== null}>
            Remove the last group in 1 s
          </Button>
        </div>
        <AppLauncher {...props} extraGroups={groups} />
      </div>
    );
  },
};
