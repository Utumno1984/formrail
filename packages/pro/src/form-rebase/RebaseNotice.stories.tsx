import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { exampleStory } from '../../../core/src/internal/example-story';
import { withoutControls } from '../../../core/src/internal/story-docs';
import type { ChangeEntry } from '../change-summary/types';
import { RebaseNotice, type RebaseNoticeProps } from './RebaseNotice';
import type { RebaseConflict } from './types';

const applied = (path: string, label: string, before: unknown, after: unknown): ChangeEntry => ({
  path,
  label,
  labelPath: label.split(' > '),
  kind: 'changed',
  before,
  after,
  beforeMissing: false,
  afterMissing: false,
});

const conflict = (path: string, label: string, mine: unknown, theirs: unknown, theirsMissing = false): RebaseConflict => ({
  path,
  label,
  base: undefined,
  mine,
  theirs,
  baseMissing: false,
  mineMissing: false,
  theirsMissing,
});

// Noon UTC: the same calendar day in every time zone of the controls.
const APPLIED: ChangeEntry[] = [applied('status', 'Status', 'Open', 'Approved'), applied('supplier', 'Supplier', 'Rossi', 'Rossi Ltd')];
const DUE_DATE = conflict('dueDate', 'Due date', new Date('2026-03-05T12:00:00Z'), new Date('2026-03-12T12:00:00Z'));

/** About 300 characters each: the values wrap inside the notice, never scroll it sideways. */
const LONG_MINE =
  'Approved after the second check by the finance team. The supplier confirmed by email that the amount includes the transport costs agreed in the framework contract, so no credit note is expected and payment goes out with the next batch of transfers.';
const LONG_THEIRS =
  'On hold: the purchase order number on the invoice does not match the one in the contract. Ask the supplier for a corrected copy before approving, and keep the delivery notes attached to this invoice until the yearly audit, as the auditors asked last year.';
const THREE: RebaseConflict[] = [
  DUE_DATE,
  conflict('notes', 'Notes', LONG_MINE, LONG_THEIRS),
  conflict('lineItems.1', 'Line items > Item 2 (Installation of the ventilation units on the third floor)', { description: 'Installation', quantity: 5 }, undefined, true),
];

const meta: Meta<RebaseNoticeProps> = {
  title: 'Pro/RebaseNotice',
  component: RebaseNotice,
  parameters: { layout: 'padded' },
  argTypes: {
    applied: { control: 'object' },
    conflicts: { control: 'object' },
    pending: { control: 'boolean' },
    labels: { control: 'object' },
    locale: { control: 'select', options: ['en-US', 'en-GB', 'de-DE'] },
    timeZone: { control: 'select', options: ['UTC', 'Europe/Rome', 'America/New_York'] },
    // A function: no control can build it (see the `Pro/ChangeSummary` page for a `renderValue` demo).
    ...withoutControls('renderValue'),
  },
  args: {
    applied: APPLIED,
    conflicts: [DUE_DATE, conflict('amount', 'Amount', 1200, 1350)],
    pending: false,
    labels: { title: 'This invoice was updated while you were editing.' },
    locale: 'en-US',
    timeZone: 'UTC',
    onAcceptTheirs: fn(),
    onKeepMine: fn(),
    onAcceptAllTheirs: fn(),
  },
};

export default meta;
type Story = StoryObj<RebaseNoticeProps>;

export const Example: Story = { tags: ['example', '!visual'], ...exampleStory('RebaseNotice.example.tsx') };

/**
 * The notice of a form whose choices close the conflicts, as `useFormRebase` does: every choice also reaches the
 * Actions panel. Edit `applied` and `conflicts` in the Controls. The play function resolves both conflicts: after
 * "Use server value for Due date" the focus moves to the same choice of the conflict that takes its place, then
 * "Keep mine for Amount" leaves only the count of the applied changes.
 */
export const Playground: Story = {
  tags: ['playground'],
  render: function Render(args) {
    const [conflicts, setConflicts] = useState(args.conflicts);
    const close = (path: string) => setConflicts((list) => list.filter((c) => c.path !== path));
    return (
      <RebaseNotice
        {...args}
        conflicts={conflicts}
        onAcceptTheirs={(path) => {
          args.onAcceptTheirs(path);
          close(path);
        }}
        onKeepMine={(path) => {
          args.onKeepMine(path);
          close(path);
        }}
        onAcceptAllTheirs={() => {
          args.onAcceptAllTheirs();
          setConflicts([]);
        }}
      />
    );
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const items = () => within(canvas.getByRole('list', { name: 'Conflicts' })).getAllByRole('listitem');
    await expect(items()).toHaveLength(2);
    await expect(items()[0]).toHaveTextContent('Due date Yours: Mar 5, 2026 Server: Mar 12, 2026');

    await userEvent.click(canvas.getByRole('button', { name: 'Use server value for Due date' }));
    await expect(args.onAcceptTheirs).toHaveBeenCalledWith('dueDate');
    await waitFor(() => expect(items()).toHaveLength(1));
    // The focus never falls on <body>: the same choice of the conflict that took the place of the closed one.
    await expect(canvas.getByRole('button', { name: 'Use server value for Amount' })).toHaveFocus();

    await userEvent.click(canvas.getByRole('button', { name: 'Keep mine for Amount' }));
    await expect(args.onKeepMine).toHaveBeenCalledWith('amount');
    await waitFor(() => expect(canvas.queryByRole('list', { name: 'Conflicts' })).toBeNull());
    await expect(canvasElement.querySelector('.rop-pro-rebase-notice')).toHaveTextContent('2 fields were updated.');
    await expect(canvasElement.querySelector('.rop-pro-rebase-notice')).toHaveFocus();
    await expect(args.onAcceptAllTheirs).not.toHaveBeenCalled();
  },
};

/* ------------------------------------------------------------------------------------------ */
/* Visual regression (3 viewports, via the `visual` tag).                                       */
/* ------------------------------------------------------------------------------------------ */

/** Only server changes applied: the information tone, no list. */
export const AppliedOnly: Story = { tags: ['visual'], args: { conflicts: [] } };

/** One conflict: the warning tone, both values, the two choices. */
export const OneConflict: Story = { tags: ['visual'], args: { applied: [], conflicts: [DUE_DATE] } };

/** Three conflicts with long values and a long label: everything wraps, nothing overflows sideways. */
export const ThreeConflicts: Story = { tags: ['visual'], args: { conflicts: THREE } };
