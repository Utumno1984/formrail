// Internal fixture of e2e/docs-source.spec.ts (ticket #403), not documentation: a Docs page that still
// opens with a demo wrapper (no `example` or `showcase-source` tag), the shape of the pages not converted
// yet. The guard must reject it without depending on any real (public) page. Hidden by `internal` (#296).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../button/Button';

const meta: Meta<{ label: string }> = { title: 'Internal/DocsAuditWrapper', tags: ['autodocs', 'internal', '!visual'] };
export default meta;

/** An untagged first story rendered through a wrapper. */
export const Playground: StoryObj<{ label: string }> = {
  args: { label: 'Wrapped' },
  render: ({ label }) => <Button>{label}</Button>,
};
