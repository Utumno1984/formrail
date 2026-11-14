// Landing story of the redirect probe (ticket #516): `internal-legacy-redirect-probe--default` in
// legacy-story-ids.mjs points here. Listed in main.ts outside the package globs, so it is in every build
// (Free, Pro demo, complete): the e2e of each build opens the same old URL and must land on this story.
// Not documentation, not a visual baseline; `internal`: hidden from the public sidebars (#296).
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  title: 'Internal/LegacyRedirectTarget',
  tags: ['!autodocs', 'internal'],
  parameters: { layout: 'centered' },
  // Rendered as is: an `args=label:...` carried by the old URL shows up on the page, which proves the
  // redirect kept it.
  args: { label: 'Legacy redirect target' },
  argTypes: { label: { control: 'text' } },
  render: ({ label }) => <p data-testid="legacy-redirect-target">{label}</p>,
} satisfies Meta<{ label: string }>;

export default meta;
type Story = StoryObj<typeof meta>;

/** What the old probe id renders once redirected. */
export const Default: Story = {};
