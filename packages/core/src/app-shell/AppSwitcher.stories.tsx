import { useState, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Field } from '../field/Field';
import { Input } from '../input/Input';
import { exampleStory } from '../internal/example-story';
import { CLASS_NAME_ARG, storyControl, withoutControls } from '../internal/story-docs';
import { useDirtyGuard } from '../object-page/use-dirty-guard';
import { AppSwitcher, type AppSwitcherProps } from './AppSwitcher';
import type { AppDescriptor } from './types';

// Neutral data only: the switcher knows nothing about what the apps are.
const SHAPES: ReactNode[] = [
  <circle key="c" cx="12" cy="12" r="8" />,
  <rect key="s" x="4" y="4" width="16" height="16" rx="2" />,
  <path key="t" d="M12 3 21 20H3z" />,
  <path key="d" d="M12 2 22 12 12 22 2 12z" />,
];
const icon = (i: number) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
    {SHAPES[i % SHAPES.length]}
  </svg>
);

const NAMES = ['one', 'two', 'three', 'four'] as const;
const DISABLED_REASON = 'You do not have access to this app';

/** Four neutral apps, "App one"…; with `disabledTwo`, App two is disabled with a reason. */
function appsOf(disabledTwo: boolean): AppDescriptor[] {
  return NAMES.map((name, i) => ({
    id: name,
    label: `App ${name}`,
    href: `#app-${name}`,
    icon: icon(i),
    ...(disabledTwo && name === 'two' ? { disabled: true, disabledReason: DISABLED_REASON } : {}),
  }));
}

interface DemoArgs extends Omit<AppSwitcherProps, 'apps' | 'onNavigate'> {
  /** Whether App two is disabled, with a `disabledReason` (story control). */
  disabledApp: boolean;
  onNavigate: NonNullable<AppSwitcherProps['onNavigate']>;
}

// A header-like bar, so the trigger is seen where it lives.
const bar = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '8px 12px',
  borderBottom: '1px solid var(--color-rop-border)',
  color: 'var(--color-rop-text)',
} as const;

const meta: Meta<DemoArgs> = {
  title: 'Navigation/AppSwitcher',
  component: AppSwitcher as never,
  parameters: { layout: 'fullscreen' },
  argTypes: {
    presentation: { control: 'radio', options: ['auto', 'menu', 'sheet'] },
    currentAppId: {
      control: 'select',
      options: ['(none)', ...NAMES],
      mapping: { '(none)': undefined },
    },
    labels: { control: 'object' },
    className: CLASS_NAME_ARG,
    ...withoutControls('apps'),
    onNavigate: { control: false },
    disabledApp: storyControl({
      control: 'boolean',
      description: 'Make App two `disabled`, with a `disabledReason`: the arrows and the typeahead skip it.',
    }),
  },
  // `menu` rather than `auto` here: the play function below is about the Menu, whatever the width of the canvas.
  args: { presentation: 'menu', currentAppId: 'one', disabledApp: true, onNavigate: fn() },
  render: ({ disabledApp, ...args }) => (
    <div style={bar}>
      <AppSwitcher {...args} apps={appsOf(disabledApp)} />
    </div>
  ),
};

export default meta;
type Story = StoryObj<DemoArgs>;

export const Example: Story = { tags: ['example', '!visual'], ...exampleStory('AppSwitcher.example.tsx') };

/**
 * Controls: the form, the current app, the disabled app. The play function uses the keyboard only: Tab to the
 * trigger and Enter open the Menu on the current app; ArrowDown skips the disabled App two and lands on App
 * three; Enter closes the Menu, gives the focus back to the trigger and only then calls `onNavigate`.
 */
export const Playground: Story = {
  tags: ['playground'],
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.tab();
    const trigger = canvas.getByRole('button', { name: 'Switch app, current: App one' });
    await expect(trigger).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    const menu = await body.findByRole('menu');
    await waitFor(() => expect(within(menu).getByRole('menuitem', { name: 'App one' })).toHaveFocus());
    await expect(within(menu).getByRole('menuitem', { name: 'App one' })).toHaveAttribute('aria-current', 'true');
    await expect(within(menu).getByRole('menuitem', { name: 'App two' })).toHaveAccessibleDescription(DISABLED_REASON);
    await userEvent.keyboard('{ArrowDown}');
    await expect(within(menu).getByRole('menuitem', { name: 'App three' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(body.queryByRole('menu')).toBeNull());
    await expect(trigger).toHaveFocus();
    await expect(args.onNavigate).toHaveBeenCalledTimes(1);
    await expect(args.onNavigate).toHaveBeenCalledWith(expect.objectContaining({ id: 'three' }), expect.anything());
  },
};

/** Visual: the trigger, closed, with the current app's icon and label. */
export const Closed: Story = {
  tags: ['visual'],
};

/** Visual: the Menu open (pinned to `menu` on every viewport). */
export const MenuOpen: Story = {
  tags: ['visual'],
  args: { presentation: 'menu' },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(within(canvasElement).getByRole('button', { name: /^Switch app/ }));
    await body.findByRole('menu');
  },
};

/** Visual: the Sheet open (pinned to `sheet` on every viewport), with the focus on the current app. */
export const SheetOpen: Story = {
  tags: ['visual'],
  args: { presentation: 'sheet' },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(within(canvasElement).getByRole('button', { name: /^Switch app/ }));
    const sheet = await body.findByRole('dialog', { name: 'Switch app' });
    await waitFor(() => expect(within(sheet).getByRole('link', { name: 'App one' })).toHaveFocus());
  },
};

/**
 * `auto` at the width of a phone: the list opens as a Sheet (from 64rem it is a Menu). Escape closes it and the
 * focus is back on the trigger. Open this story with the Mobile viewport of the toolbar.
 */
export const Mobile: Story = {
  args: { presentation: 'auto' },
  globals: { viewport: { value: 'mobile', isRotated: false } },
};

/**
 * `onNavigate` goes through `useDirtyGuard`: after a change in the field, choosing another app asks first. "Keep
 * editing" returns the focus to the trigger and nothing happens; "Leave without saving" calls `onNavigate` (the
 * line under the field shows the last app opened).
 */
export const WithDirtyGuard: Story = {
  args: { disabledApp: false },
  parameters: { controls: { disable: true } },
  render: function Render({ disabledApp, onNavigate, ...args }) {
    const [value, setValue] = useState('First value');
    const [opened, setOpened] = useState('none');
    const { guard, dialog } = useDirtyGuard({ when: value !== 'First value' });
    return (
      <>
        <div style={bar}>
          <AppSwitcher
            {...args}
            apps={appsOf(disabledApp)}
            onNavigate={(app, event) =>
              guard(() => {
                setOpened(app.label);
                onNavigate(app, event);
              })
            }
          />
        </div>
        <div style={{ padding: 16, maxWidth: 320 }}>
          <Field label="Name" name="name">
            <Input value={value} onChange={(event) => setValue(event.target.value)} />
          </Field>
          <p style={{ margin: '12px 0 0' }}>Last app opened: {opened}</p>
        </div>
        {dialog}
      </>
    );
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.type(canvas.getByRole('textbox', { name: 'Name' }), ' changed');
    const trigger = canvas.getByRole('button', { name: /^Switch app/ });
    await userEvent.click(trigger);
    // A menu item with `menu`, a link of the Sheet with `sheet` (or `auto` on a narrow canvas).
    const two = await waitFor(() => body.queryByRole('menuitem', { name: 'App two' }) ?? body.getByRole('link', { name: 'App two' }));
    await userEvent.click(two);
    const dialog = await body.findByRole('dialog', { name: 'Unsaved changes' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(trigger).toHaveFocus());
    await expect(args.onNavigate).not.toHaveBeenCalled();
  },
};
