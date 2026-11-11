import type { CSSProperties, ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { Button } from '../button/Button';
import { Field } from '../field/Field';
import { Input } from '../input/Input';
import { Tooltip } from '../tooltip/Tooltip';
import { ObjectPage } from './ObjectPage';
import { ObjectPageHeader } from './ObjectPageHeader';
import { ObjectPageSection } from './ObjectPageSection';

interface PlaygroundArgs {
  sectionNavigation: 'anchors' | 'none';
  sectionCount: number;
  lastSectionHeight: number;
  anchorBarLabel: string;
}

const meta: Meta<PlaygroundArgs> = {
  title: 'Floorplans/Object Page/Anchor Bar',
  component: ObjectPage,
  parameters: { layout: 'fullscreen' },
  argTypes: {
    sectionNavigation: {
      control: 'radio',
      options: ['anchors', 'none'],
      description: 'Sticky anchor bar (with scroll-spy) or no navigation',
    },
    sectionCount: { control: { type: 'range', min: 1, max: 10, step: 1 }, description: 'Number of sections (the bar appears from 2)' },
    lastSectionHeight: {
      control: { type: 'range', min: 40, max: 900, step: 10 },
      description: 'Height of the last section: if it is too short to reach the top, the active entry at the bottom is still the last one',
    },
    anchorBarLabel: { control: 'text', description: 'labels.anchorBar: accessible name of the <nav>' },
  },
  args: { sectionNavigation: 'anchors', sectionCount: 6, lastSectionHeight: 120, anchorBarLabel: 'Sections' },
};

export default meta;
type Story = StoryObj<PlaygroundArgs>;

// Inline styles: the stories are not scanned by Tailwind, so a class only used here would not exist.
const FRAME: CSSProperties = { height: '100dvh', boxSizing: 'border-box', background: 'var(--color-rop-surface, #fff)' };
const BLOCK_BG = 'var(--color-rop-blue-50, #eef5fc)';

function Filler({ height, children }: { height: number; children: ReactNode }) {
  return <div style={{ height, background: BLOCK_BG, borderRadius: 8, padding: 12, boxSizing: 'border-box' }}>{children}</div>;
}

const TITLES = ['General data', 'Supplier', 'Lines', 'Amounts', 'Payments', 'Attachments', 'Notes', 'History', 'Approvals', 'Audit'];
const LONG_TITLES = [
  'General document data',
  'Supplier and bank details',
  'Invoice lines and item codes',
  'Amounts, taxes and withholdings',
  'Payment terms and due dates',
  'Attachments and linked documents',
  'Internal notes for the accounting team',
  'Change history',
  'Required approvals',
  'Full audit log',
];

/** Sections of different heights; the last one has the height given and holds a Field (target of the keyboard scenario). */
function Sections({ count, lastHeight, titles = TITLES }: { count: number; lastHeight: number; titles?: string[] }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const last = i === count - 1;
        return (
          <ObjectPageSection key={titles[i]} id={`section-${i + 1}`} title={titles[i]}>
            <Filler height={last ? lastHeight : 220 + (i % 3) * 120}>Content of {titles[i]}</Filler>
            <div style={{ marginTop: 12 }}>
              <Field label={`Field ${titles[i]}`}>
                <Input />
              </Field>
            </div>
          </ObjectPageSection>
        );
      })}
    </>
  );
}

const scrollerOf = (canvasElement: HTMLElement) => canvasElement.querySelector('[data-object-page-scroller]') as HTMLElement;

/**
 * Controls: navigation mode, number of sections (1-10), height of the short last section and the name of
 * the `<nav>`. The play function clicks the last link, checks `aria-current`, the focus on the section's
 * title and that the URL did not change, then scrolls the scroller back to the top and checks that the
 * first link is active again.
 */
export const Playground: Story = {
  render: ({ sectionNavigation, sectionCount, lastSectionHeight, anchorBarLabel }) => (
    <div style={FRAME}>
      <ObjectPage sectionNavigation={sectionNavigation} labels={{ anchorBar: anchorBarLabel }}>
        <ObjectPageHeader title="Invoice 2026/0142" subtitle="ACME srl" />
        <Sections count={sectionCount} lastHeight={lastSectionHeight} />
      </ObjectPage>
    </div>
  ),
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    if (args.sectionNavigation === 'none' || args.sectionCount < 2) {
      await expect(canvas.queryByRole('navigation')).toBeNull();
      return;
    }
    const nav = await canvas.findByRole('navigation', { name: args.anchorBarLabel });
    const links = within(nav).getAllByRole('link');
    await expect(links).toHaveLength(args.sectionCount);
    const hash = window.location.hash;
    const lastTitle = TITLES[args.sectionCount - 1] as string;

    await userEvent.click(links[links.length - 1] as HTMLElement);
    await expect(links[links.length - 1]).toHaveAttribute('aria-current', 'location');
    await expect(canvas.getByRole('heading', { name: lastTitle })).toHaveFocus();
    await expect(window.location.hash).toBe(hash);
    await expect(links.filter((a) => a.hasAttribute('aria-current'))).toHaveLength(1);

    const scroller = scrollerOf(canvasElement);
    await waitFor(() => expect(scroller.scrollTop).toBeGreaterThan(0));
    // The user scrolls by hand to the top: the first link takes over.
    await userEvent.pointer({ keys: '[MouseLeft]', target: scroller });
    scroller.scrollTop = 0;
    await waitFor(() => expect(links[0]).toHaveAttribute('aria-current', 'location'));
    await expect(links.filter((a) => a.hasAttribute('aria-current'))).toHaveLength(1);
  },
};

/**
 * The Playground without a `play` function: what `e2e/object-page-anchor-bar.spec.ts` drives with real
 * input (a play function scrolling the page in the background would race with those tests).
 */
export const Scrollable: Story = {
  render: Playground.render,
};

/** The page scrolled to the middle: the active link is the section that has passed the bar. */
export const MidPage: Story = {
  tags: ['visual'],
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={FRAME}>
      <ObjectPage>
        <ObjectPageHeader title="Invoice 2026/0142" subtitle="ACME srl" />
        <Sections count={6} lastHeight={300} />
      </ObjectPage>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const scroller = scrollerOf(canvasElement);
    const second = within(canvasElement).getByRole('region', { name: 'Supplier' });
    scroller.scrollTop = second.offsetTop - 40 + 200;
    await waitFor(() => expect(within(canvasElement).getByRole('link', { name: 'Supplier' })).toHaveAttribute('aria-current', 'location'));
  },
};

/** Ten sections with long titles: on a narrow screen the bar scrolls inside itself and the active link is brought into view. */
export const ManySections: Story = {
  tags: ['visual'],
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={FRAME}>
      <ObjectPage>
        <ObjectPageHeader title="Invoice 2026/0142" subtitle="ACME srl" />
        <Sections count={10} lastHeight={200} titles={LONG_TITLES} />
      </ObjectPage>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const link = await within(canvasElement).findByRole('link', { name: 'Payment terms and due dates' });
    await userEvent.click(link);
    await waitFor(() => expect(link).toHaveAttribute('aria-current', 'location'));
    // Wait for the smooth scroll to arrive (the section's top at the bar's bottom edge) so the picture is
    // steady, however slow the machine is: a "stopped moving" check could fire before it has started.
    const scroller = scrollerOf(canvasElement);
    const bar = within(canvasElement).getByRole('navigation');
    const section = within(canvasElement).getByRole('region', { name: 'Payment terms and due dates' });
    await waitFor(
      () => {
        const gap = section.getBoundingClientRect().top - scroller.getBoundingClientRect().top - bar.getBoundingClientRect().height;
        // The section stops 4px below the bar: room for the focus indicator of its title.
        expect(Math.abs(gap - 4)).toBeLessThanOrEqual(1);
      },
      { timeout: 8000 },
    );
  },
};

/**
 * Fixture for the e2e on stacking: a button with a tooltip in the first section. Scrolled so that the
 * button sits right under the bar, its tooltip (above it) overlaps the bar and must stay on top.
 */
export const TooltipOverBar: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={FRAME}>
      <ObjectPage>
        <ObjectPageHeader title="Invoice 2026/0142" />
        <ObjectPageSection id="info" title="Information">
          <Tooltip content="Hint that overlaps the bar" delayDuration={0}>
            <Button variant="secondary">Details</Button>
          </Tooltip>
          <div style={{ marginTop: 12 }}>
            <Filler height={900}>Long content</Filler>
          </div>
        </ObjectPageSection>
        <ObjectPageSection id="other" title="Other">
          <Filler height={700}>More content</Filler>
        </ObjectPageSection>
      </ObjectPage>
    </div>
  ),
};

/** Sections that fit entirely in the scroller: nothing to scroll; the first link is active, clicking the last one activates it. */
export const NothingToScroll: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={FRAME}>
      <ObjectPage>
        <ObjectPageSection id="one" title="One">
          Short
        </ObjectPageSection>
        <ObjectPageSection id="two" title="Two">
          Short
        </ObjectPageSection>
        <ObjectPageSection id="three" title="Three">
          Short
        </ObjectPageSection>
      </ObjectPage>
    </div>
  ),
};
