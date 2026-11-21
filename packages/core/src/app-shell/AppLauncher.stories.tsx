import { useEffect, useState, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Button } from '../button/Button';
import { exampleStory } from '../internal/example-story';
import { CLASS_NAME_ARG, storyControl, withoutControls } from '../internal/story-docs';
import { useDirtyGuard } from '../object-page/use-dirty-guard';
import { AppLauncher, type AppLauncherProps } from './AppLauncher';
import type { AppDescriptor } from './types';

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

interface DemoArgs extends Omit<AppLauncherProps, 'apps' | 'onNavigate'> {
  /** Number of apps in the list (story control). */
  count: number;
  /** Position (1-based) of the app shown as disabled, 0 for none (story control). */
  disabledApp: number;
  /** Pass `onNavigate` (story control): off, the tiles are plain links the browser follows. */
  routed: boolean;
  onNavigate: NonNullable<AppLauncherProps['onNavigate']>;
}

function appsOf({ count, disabledApp }: Pick<DemoArgs, 'count' | 'disabledApp'>): AppDescriptor[] {
  return makeApps(count).map((app, i) => (i + 1 === disabledApp ? { ...app, disabled: true, disabledReason: DISABLED_REASON } : app));
}

const meta = {
  title: 'Navigation/AppLauncher',
  component: AppLauncher,
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
  },
  args: { count: 4, disabledApp: 3, routed: true, loading: false, onNavigate: fn() },
  render: ({ count, disabledApp, routed, onNavigate, ...args }) => (
    <AppLauncher {...args} onNavigate={routed ? onNavigate : undefined} apps={appsOf({ count, disabledApp })} />
  ),
} satisfies Meta<DemoArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

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
  render: function Render({ count, disabledApp, routed, onNavigate, ...args }) {
    const [loading, setLoading] = useState(true);
    return (
      <div style={{ ...frame, display: 'grid', gap: 12 }}>
        <div>
          <Button variant="secondary" onClick={() => setLoading((l) => !l)}>
            {loading ? 'Finish loading' : 'Load again'}
          </Button>
        </div>
        <div data-testid="launcher-frame">
          <AppLauncher
            {...args}
            onNavigate={routed ? onNavigate : undefined}
            loading={loading}
            apps={loading ? [] : appsOf({ count, disabledApp })}
          />
        </div>
      </div>
    );
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const nav = canvas.getByRole('navigation', { name: 'Apps' });
    await expect(nav).toHaveAttribute('aria-busy', 'true');
    await expect(canvas.getByRole('status')).toHaveTextContent('Loading apps');
    const before = nav.getBoundingClientRect().height;
    await userEvent.click(canvas.getByRole('button', { name: 'Finish loading' }));
    await expect(canvas.queryAllByRole('link')).toHaveLength(args.count);
    await expect(nav).not.toHaveAttribute('aria-busy');
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
  render: function Render({ count, disabledApp, routed, onNavigate, ...args }) {
    const [apps, setApps] = useState(() => appsOf({ count, disabledApp }));
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
        <AppLauncher {...args} onNavigate={routed ? onNavigate : undefined} apps={apps} />
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
  render: function Render({ count, disabledApp, routed, onNavigate, ...args }) {
    const { guard, dialog } = useDirtyGuard({ when: true });
    return (
      <div style={frame}>
        <AppLauncher
          {...args}
          apps={appsOf({ count, disabledApp })}
          onNavigate={routed ? (app, event) => guard(() => onNavigate(app, event)) : undefined}
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
