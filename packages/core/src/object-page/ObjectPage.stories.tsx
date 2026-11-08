import type { CSSProperties, ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Button } from '../button/Button';
import { Field } from '../field/Field';
import { Input } from '../input/Input';
import { ObjectPage } from './ObjectPage';
import { ObjectPageHeader } from './ObjectPageHeader';
import { ObjectPageSection } from './ObjectPageSection';

interface PlaygroundArgs {
  headingLevel: 1 | 2 | 3 | 4;
  sectionCount: number;
  title: string;
  subtitle: string;
  showActions: boolean;
  showStatus: boolean;
  onApprove: () => void;
  onReject: () => void;
}

const meta: Meta<PlaygroundArgs> = {
  title: 'Floorplans/Object Page/Layout',
  component: ObjectPage,
  parameters: { layout: 'fullscreen' },
  argTypes: {
    headingLevel: { control: 'select', options: [1, 2, 3, 4], description: 'Heading level of the header title; the sections use the next one' },
    sectionCount: { control: { type: 'range', min: 1, max: 8, step: 1 }, description: 'Number of sections' },
    title: { control: 'text' },
    subtitle: { control: 'text' },
    showActions: { control: 'boolean' },
    showStatus: { control: 'boolean' },
    onApprove: { control: false },
    onReject: { control: false },
  },
  args: {
    headingLevel: 1,
    sectionCount: 4,
    title: 'Invoice 2026/0142',
    subtitle: 'ACME srl',
    showActions: true,
    showStatus: true,
    onApprove: fn(),
    onReject: fn(),
  },
};

export default meta;
type Story = StoryObj<PlaygroundArgs>;

// These stories render fixed pages: no meta arg reaches the DOM.
const NO_CONTROLS = { controls: { disable: true } };

// Inline styles: the stories are not scanned by Tailwind, so a class only used here would not exist.
const FRAME: CSSProperties = { height: '100dvh', boxSizing: 'border-box', background: 'var(--color-rop-surface, #fff)' };
const BLOCK_BG = 'var(--color-rop-blue-50, #eef5fc)';

/** Placeholder content with a given height: the sections of a real page differ widely in length. */
function Filler({ height, children }: { height: number; children: ReactNode }) {
  return <div style={{ height, background: BLOCK_BG, borderRadius: 8, padding: 12, boxSizing: 'border-box' }}>{children}</div>;
}

const SECTION_TITLES = ['General data', 'Supplier', 'Lines', 'Amounts', 'Payment', 'Attachments', 'Notes', 'History'];

/** The sections of the demo; the last one always holds a Field, the target of the keyboard scenarios. */
function Sections({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const last = i === count - 1;
        return (
          <ObjectPageSection key={SECTION_TITLES[i]} id={`section-${i + 1}`} title={SECTION_TITLES[i]}>
            <Filler height={80 + (i % 4) * 90}>Content of {SECTION_TITLES[i]}</Filler>
            {last ? (
              <div style={{ marginTop: 12 }}>
                <Field label="Internal notes" help="Visible to the team only.">
                  <Input />
                </Field>
              </div>
            ) : null}
          </ObjectPageSection>
        );
      })}
    </>
  );
}

const statusBadge = (
  <span
    style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 999,
      background: '#fdf0d5',
      color: '#7a4b00',
      fontSize: 12,
      fontWeight: 600,
    }}
  >
    To approve
  </span>
);

/**
 * Controls: heading level, number of sections (1-8), title, subtitle, status and actions. The play
 * function checks the heading hierarchy and the name of every region, focuses the field of the last
 * section and checks that it ends up inside the visible area of the (only) scroller, then clicks an
 * action of the header (Actions panel).
 */
export const Playground: Story = {
  render: ({ headingLevel, sectionCount, title, subtitle, showActions, showStatus, onApprove, onReject }) => (
    <div style={FRAME}>
      <ObjectPage headingLevel={headingLevel}>
        <ObjectPageHeader
          title={title}
          subtitle={subtitle}
          status={showStatus ? statusBadge : undefined}
          actions={
            showActions ? (
              <>
                <Button variant="secondary" onClick={onReject}>
                  Reject
                </Button>
                <Button variant="primary" onClick={onApprove}>
                  Approve
                </Button>
              </>
            ) : undefined
          }
        />
        <Sections count={sectionCount} />
      </ObjectPage>
    </div>
  ),
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { level: args.headingLevel, name: args.title })).toBeInTheDocument();
    for (let i = 0; i < args.sectionCount; i += 1) {
      const name = SECTION_TITLES[i] as string;
      await expect(canvas.getByRole('region', { name })).toBeInTheDocument();
      await expect(canvas.getByRole('heading', { level: args.headingLevel + 1, name })).toBeInTheDocument();
    }

    const scroller = canvasElement.querySelector('[data-object-page-scroller]') as HTMLElement;
    const field = canvas.getByRole('textbox', { name: 'Internal notes' });
    await userEvent.click(field);
    await expect(field).toHaveFocus();
    await waitFor(() => {
      const box = field.getBoundingClientRect();
      const area = scroller.getBoundingClientRect();
      expect(box.top).toBeGreaterThanOrEqual(area.top);
      expect(box.bottom).toBeLessThanOrEqual(area.bottom);
    });

    if (args.showActions) {
      await userEvent.click(canvas.getByRole('button', { name: 'Approve' }));
      await expect(args.onApprove).toHaveBeenCalledTimes(1);
    }
  },
};

const LONG_TITLE =
  'Invoice 2026/0142 issued by Rossi Construction and Special Precision Installations Single-Member Limited Liability Company';

/**
 * Visual matrix: a header with status and actions, a very long title that wraps (never truncated), six
 * sections of different heights. Photographed at mobile, tablet and desktop widths.
 */
export const Overview: Story = {
  tags: ['visual'],
  parameters: NO_CONTROLS,
  render: () => (
    <div style={FRAME}>
      <ObjectPage>
        <ObjectPageHeader
          title={LONG_TITLE}
          subtitle="Supplier: Rossi Construction · Due 30/11/2026"
          status={statusBadge}
          actions={
            <>
              <Button variant="secondary">Reject</Button>
              <Button variant="primary">Approve</Button>
            </>
          }
        />
        <Sections count={6} />
      </ObjectPage>
    </div>
  ),
};

/** Many and long action labels: the actions wrap below the title instead of being clipped (e2e covers 640-900px). */
export const ManyActions: Story = {
  parameters: NO_CONTROLS,
  render: () => (
    <div style={FRAME}>
      <ObjectPage>
        <ObjectPageHeader
          title={LONG_TITLE}
          subtitle="Supplier: Rossi Construction · Due 30/11/2026"
          status={statusBadge}
          actions={
            <>
              <Button variant="secondary">Request more information</Button>
              <Button variant="secondary">Put on hold</Button>
              <Button variant="secondary">Reject</Button>
              <Button variant="primary">Approve and schedule payment</Button>
            </>
          }
        />
        <Sections count={2} />
      </ObjectPage>
    </div>
  ),
};

/** The same page scrolled to the end: the last section and its field, under the header that has scrolled away. */
export const ScrolledToEnd: Story = {
  tags: ['visual'],
  parameters: NO_CONTROLS,
  render: Overview.render,
  play: async ({ canvasElement }) => {
    const scroller = canvasElement.querySelector('[data-object-page-scroller]') as HTMLElement;
    scroller.scrollTop = scroller.scrollHeight;
    await expect(scroller.scrollTop).toBeGreaterThan(0);
  },
};

/** The field of the last section with the keyboard focus: its ring must not be cut by the section body (visual regression). */
export const FocusedField: Story = {
  tags: ['visual'],
  parameters: NO_CONTROLS,
  render: Overview.render,
  play: async ({ canvasElement }) => {
    const scroller = canvasElement.querySelector('[data-object-page-scroller]') as HTMLElement;
    const field = within(canvasElement).getByRole('textbox', { name: 'Internal notes' });
    scroller.scrollTop = scroller.scrollHeight;
    field.focus();
    await expect(field).toHaveFocus();
  },
};

/** Header only: no sections, no crash, still one scroller. */
export const HeaderOnly: Story = {
  parameters: NO_CONTROLS,
  render: () => (
    <div style={FRAME}>
      <ObjectPage>
        <ObjectPageHeader title="Invoice 2026/0142" subtitle="ACME srl" />
      </ObjectPage>
    </div>
  ),
};

/**
 * Keyboard-safe fixture (spec §1.10): the field is in the last section of a tall page. Exercised by
 * `e2e/object-page-layout.spec.ts` with a simulated visualViewport: the inner scroller, padded with
 * `--rop-keyboard-inset`, scrolls the focused field above the keyboard.
 */
export const KeyboardSafe: Story = {
  parameters: NO_CONTROLS,
  render: () => (
    <div style={FRAME}>
      <ObjectPage>
        <ObjectPageHeader title="Invoice 2026/0142" />
        <ObjectPageSection id="long" title="Long section">
          <Filler height={900}>Long content before the field.</Filler>
        </ObjectPageSection>
        <ObjectPageSection id="last" title="Last section">
          <Field label="Billing address">
            <Input />
          </Field>
        </ObjectPageSection>
      </ObjectPage>
    </div>
  ),
};

/** A section of text only (the scroller is reached with Tab) and a table wider than the page (it scrolls inside its section). */
export const TextAndWideContent: Story = {
  parameters: NO_CONTROLS,
  render: () => (
    <div style={FRAME}>
      <ObjectPage>
        <ObjectPageHeader title="Invoice 2026/0142" />
        <ObjectPageSection id="text" title="Text only">
          {Array.from({ length: 24 }, (_, i) => (
            <p key={i} style={{ margin: '0 0 12px' }}>
              Paragraph {i + 1}: text with no interactive control, to check keyboard scrolling.
            </p>
          ))}
        </ObjectPageSection>
        <ObjectPageSection id="table" title="Wide table">
          <div style={{ width: 1400, background: BLOCK_BG, padding: 12, boxSizing: 'border-box' }} data-testid="wide">
            A table wider than the page.
          </div>
        </ObjectPageSection>
      </ObjectPage>
    </div>
  ),
};

/** No height on the parent: the page grows with its content and the document is the only scroller. */
export const NoParentHeight: Story = {
  parameters: NO_CONTROLS,
  render: () => (
    <ObjectPage>
      <ObjectPageHeader title="Invoice 2026/0142" />
      <Sections count={5} />
    </ObjectPage>
  ),
};
