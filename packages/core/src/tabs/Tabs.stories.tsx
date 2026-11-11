import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Input } from '../input/Input';
import { Tabs, TabsContent, TabsList, TabsTrigger, type TabsProps } from './Tabs';

interface DemoArgs extends Omit<TabsProps, 'children'> {
  /** Story-only: how many tabs to render (raise it to try the overflow). */
  tabCount: number;
  /** Story-only: which tab is disabled. */
  disabledTab: string;
}

const LABELS = [
  'Overview',
  'Details',
  'Attachments',
  'History',
  'Approvals',
  'Notes',
  'Payments',
  'Contacts',
  'Taxes',
  'Audit log',
  'Settings',
  'Archive',
];

const tabsFor = (count: number) => LABELS.slice(0, count).map((label, i) => ({ value: `tab-${i + 1}`, label }));

function Demo({ tabCount, disabledTab, ...rest }: DemoArgs) {
  const tabs = tabsFor(tabCount);
  return (
    <div style={{ maxWidth: 560, color: 'var(--color-rop-text)' }}>
      <Tabs defaultValue="tab-1" {...rest}>
        <TabsList aria-label="Invoice sections" data-testid="list">
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value} disabled={t.value === disabledTab}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((t, i) => (
          <TabsContent key={t.value} value={t.value} style={{ padding: 16 }}>
            {i === 0 ? (
              <Input aria-label="Reference" placeholder="Reference" />
            ) : (
              <p style={{ margin: 0 }}>{t.label} panel</p>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

const meta = {
  title: 'Navigation/Tabs',
  component: Tabs,
  subcomponents: { TabsList, TabsTrigger, TabsContent },
  parameters: { layout: 'padded' },
  argTypes: {
    activationMode: { control: 'radio', options: ['automatic', 'manual'] },
    orientation: { control: 'radio', options: ['horizontal', 'vertical'] },
    dir: { control: 'radio', options: ['ltr', 'rtl'] },
    keepMounted: { control: 'boolean' },
    tabCount: { control: { type: 'range', min: 2, max: 12, step: 1 } },
    disabledTab: { control: 'select', options: ['', 'tab-2', 'tab-3', 'tab-4'] },
    value: { control: false },
    defaultValue: { control: false },
    className: { control: false },
    onValueChange: { control: false },
  },
  args: {
    activationMode: 'automatic',
    orientation: 'horizontal',
    dir: 'ltr',
    keepMounted: true,
    tabCount: 4,
    disabledTab: '',
    onValueChange: fn(),
  },
  render: (args) => <Demo {...(args as DemoArgs)} />,
} satisfies Meta<DemoArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Controls: activation mode, orientation, direction, keepMounted, number of tabs, disabled tab.
 * The play function types in the first panel, moves to the third tab with the arrow keys (the
 * Actions panel logs `onValueChange`), checks the selected tab and the visible panel, goes back
 * to the first tab and checks that the typed value is still there (`keepMounted`).
 */
export const Playground: Story = {
  args: { tabCount: 4 },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('textbox', { name: 'Reference' }), 'Draft');
    await userEvent.click(canvas.getByRole('tab', { name: 'Overview' }));
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    const third = canvas.getByRole('tab', { name: 'Attachments' });
    await expect(third).toHaveAttribute('aria-selected', 'true');
    await expect(third).toHaveFocus();
    await expect(canvas.getByRole('tabpanel')).toHaveTextContent('Attachments panel');
    await expect(args.onValueChange).toHaveBeenLastCalledWith('tab-3');
    await userEvent.keyboard('{Home}');
    await expect(canvas.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    await expect(canvas.getByRole('textbox', { name: 'Reference' })).toHaveValue('Draft');
  },
};

/** Vertical list: up/down arrows. */
export const Vertical: Story = {
  tags: ['visual'],
  args: { orientation: 'vertical', tabCount: 4 },
  render: (args) => (
    <div style={{ maxWidth: 480, color: 'var(--color-rop-text)' }}>
      <Demo {...(args as DemoArgs)} />
    </div>
  ),
};

/** Manual activation: the arrows only move focus, Enter or Space select. */
export const Manual: Story = {
  args: { activationMode: 'manual', tabCount: 4 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('tab', { name: 'Overview' }));
    await userEvent.keyboard('{ArrowRight}');
    await expect(canvas.getByRole('tab', { name: 'Details' })).toHaveFocus();
    await expect(canvas.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'false');
    await userEvent.keyboard('{Enter}');
    await expect(canvas.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true');
  },
};

/**
 * 12 tabs: the list scrolls on its own, the page does not. Each side that hides tabs shows an
 * indicator (a fade ending in a chevron); clicking it scrolls one view towards that side. The arrow
 * keys bring the focused tab into view, clear of the indicators.
 */
export const ManyTabs: Story = {
  tags: ['visual'],
  args: { tabCount: 12 },
};

/**
 * The play function walks the overflowing list with the keyboard: after the first arrow presses
 * the list has scrolled (the start indicator appears), and End reaches the last tab, shown whole,
 * with no end indicator left. The picture is that final state.
 */
export const ManyTabsKeyboard: Story = {
  tags: ['visual'],
  args: { tabCount: 12 },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const edge = (side: 'start' | 'end') => canvasElement.querySelector(`[data-rop-tabs-edge="${side}"]`);
    await expect(edge('end')).not.toBeNull();
    await expect(edge('start')).toBeNull();
    await userEvent.click(canvas.getByRole('tab', { name: 'Overview' }));
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}');
    await expect(canvas.getByRole('tab', { name: 'Contacts' })).toHaveFocus();
    await expect(args.onValueChange).toHaveBeenLastCalledWith('tab-8');
    await waitFor(() => expect(edge('start')).not.toBeNull());
    await userEvent.keyboard('{End}');
    const last = canvas.getByRole('tab', { name: 'Archive' });
    await expect(last).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(edge('end')).toBeNull());
    await expect(canvas.getByRole('tabpanel')).toHaveTextContent('Archive panel');
  },
};

/** Visual: horizontal. */
export const Horizontal: Story = {
  tags: ['visual'],
  args: { tabCount: 4 },
};

/** Visual: a disabled tab. */
export const DisabledTab: Story = {
  tags: ['visual'],
  args: { tabCount: 4, disabledTab: 'tab-2' },
};

/** `keepMounted`: what is typed in the first panel survives a tab change. Unmounted panels lose it. */
export const KeepMounted: Story = {
  args: { keepMounted: true, tabCount: 3 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('textbox', { name: 'Reference' }), 'Draft');
    await userEvent.click(canvas.getByRole('tab', { name: 'Details' }));
    await userEvent.click(canvas.getByRole('tab', { name: 'Overview' }));
    await expect(canvas.getByRole('textbox', { name: 'Reference' })).toHaveValue('Draft');
  },
};

/** Controlled from outside: the buttons change the tab without any `onValueChange`. */
export const Controlled: Story = {
  tags: ['visual'],
  args: { tabCount: 3 },
  render: (args) => <ControlledDemo {...(args as DemoArgs)} />,
};

function ControlledDemo({ tabCount, ...props }: DemoArgs) {
  const { disabledTab, ...rest } = props;
  void disabledTab;
  const [value, setValue] = useState('tab-1');
  const tabs = tabsFor(tabCount);
  return (
    <div style={{ maxWidth: 560, color: 'var(--color-rop-text)' }}>
      <button type="button" onClick={() => setValue('tab-3')}>
        Go to {tabs[2]?.label}
      </button>
      <Tabs {...rest} value={value}>
        <TabsList aria-label="Invoice sections">
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((t) => (
          <TabsContent key={t.value} value={t.value} style={{ padding: 16 }}>
            {t.label} panel
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
