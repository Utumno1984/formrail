// Landing story of the redirect probe (ticket #516): `internal-legacy-redirect-probe--default` in
// legacy-story-ids.mjs points here. In the Free and complete builds only (`legacyRedirectFixtures` in
// story-globs.mjs): the Pro demo carries no internal fixture, its probe lands on a public Pro story.
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
