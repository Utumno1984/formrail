import type { Meta, StoryObj } from '@storybook/react-vite';
import { forwardRef, type AnchorHTMLAttributes } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, type BreadcrumbProps } from './Breadcrumb';

const SHORT = ['Home', 'Invoices', 'Suppliers', 'Acme', 'Orders', '2026-0142'];
const LONG = [
  'Home of the finance department',
  'Invoices received from suppliers',
  'Suppliers located in northern Italy',
  'Acme Manufacturing S.r.l. unipersonale',
  'Purchase orders waiting for approval',
  'INVOICE-2026-0142-ACME-MANUFACTURING-FINAL',
];

interface DemoArgs extends BreadcrumbProps {
  items: number;
  textLength: 'short' | 'long';
  /** Width of the demo container, px (story-only control). */
  width: number;
  onNavigate: (label: string) => void;
}

const meta = {
  title: 'Navigation/Breadcrumb',
  component: Breadcrumb,
  parameters: { layout: 'padded' },
  argTypes: {
    items: { control: { type: 'range', min: 1, max: 6, step: 1 }, description: 'Number of items (the last is the current page)' },
    textLength: { control: 'select', options: ['short', 'long'] },
    separator: { control: 'select', options: ['chevron', 'slash'] },
    width: { control: { type: 'range', min: 200, max: 800, step: 10 }, description: 'Demo container width (px)' },
    className: { control: false },
    onNavigate: { control: false },
  },
  args: { items: 3, textLength: 'short', separator: 'chevron', width: 480, onNavigate: fn() },
  render: ({ items, textLength, width, onNavigate, ...args }) => {
    const labels = (textLength === 'long' ? LONG : SHORT).slice(-items);
    return (
      <div data-testid="container" style={{ width, maxWidth: '100%', padding: 4 }}>
        <Breadcrumb {...args}>
          {labels.map((label, i) => (
            <BreadcrumbItem key={label}>
              {i === labels.length - 1 ? (
                <BreadcrumbPage>{label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink
                  href={`#${i}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate(label);
                  }}
                >
                  {label}
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          ))}
        </Breadcrumb>
      </div>
    );
  },
} satisfies Meta<DemoArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Controls: number of items, text length, separator, container width. The play function tabs to the
 * second link, activates it with Enter and checks the action, then checks that the last item is the
 * current page (`aria-current`), is not focusable, and that the separators are not announced.
 */
export const Playground: Story = {
  args: { items: 4 },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.tab();
    await userEvent.tab();
    const second = canvas.getAllByRole('link')[1]!;
    await expect(second).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onNavigate).toHaveBeenCalledWith('Acme');
    const current = canvas.getByText('2026-0142');
    await expect(current).toHaveAttribute('aria-current', 'page');
    await expect(current).not.toHaveAttribute('tabindex');
    await expect(canvas.queryByRole('link', { name: '2026-0142' })).toBeNull();
    await userEvent.tab();
    await userEvent.tab();
    await expect(current).not.toHaveFocus();
    await expect(canvasElement.querySelectorAll('[data-rop-breadcrumb-separator][aria-hidden="true"]')).toHaveLength(4);
  },
};

const frame = { padding: 4, color: 'var(--color-rop-text)' } as const;

/** Visual: two items. */
export const TwoItems: Story = {
  tags: ['visual'],
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={{ ...frame, width: 360, maxWidth: '100%' }} data-testid="container">
      <Breadcrumb>
        <BreadcrumbItem>
          <BreadcrumbLink href="#invoices">Invoices</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbItem>
          <BreadcrumbPage>2026-0142</BreadcrumbPage>
        </BreadcrumbItem>
      </Breadcrumb>
    </div>
  ),
};

/** Visual: both separators, a single item, and an icon-only "Home" link with hidden text. */
export const Separators: Story = {
  tags: ['visual'],
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={{ ...frame, display: 'grid', gap: 12, maxWidth: 480 }} data-testid="container">
      {(['chevron', 'slash'] as const).map((separator) => (
        <Breadcrumb key={separator} separator={separator} aria-label={`Breadcrumb ${separator}`}>
          <BreadcrumbItem>
            <BreadcrumbLink href="#home">
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                width="1em"
                height="1em"
                fill="currentColor"
                style={{ verticalAlign: '-0.15em' }}
              >
                <path d="M8 2 1 8h2v6h4v-4h2v4h4V8h2z" />
              </svg>
              <span className="sr-only">Home</span>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbItem>
            <BreadcrumbLink href="#invoices">Invoices</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbItem>
            <BreadcrumbPage>2026-0142</BreadcrumbPage>
          </BreadcrumbItem>
        </Breadcrumb>
      ))}
      <Breadcrumb aria-label="Breadcrumb single">
        <BreadcrumbItem>
          <BreadcrumbPage>Only the current page</BreadcrumbPage>
        </BreadcrumbItem>
      </Breadcrumb>
    </div>
  ),
};

/** Visual: six long entries in a narrow container: ellipsis, no overflow, the current page keeps room. */
export const SixLongTruncated: Story = {
  tags: ['visual'],
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={frame} data-testid="container">
      <Breadcrumb>
        {LONG.map((label, i) => (
          <BreadcrumbItem key={label}>
            {i === LONG.length - 1 ? (
              <BreadcrumbPage>{label}</BreadcrumbPage>
            ) : (
              <BreadcrumbLink href={`#${i}`}>{label}</BreadcrumbLink>
            )}
          </BreadcrumbItem>
        ))}
      </Breadcrumb>
    </div>
  ),
};

/** A 60-character code without spaces truncates instead of overflowing. */
export const UnbrokenCode: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={{ ...frame, width: 280, maxWidth: '100%' }} data-testid="container">
      <Breadcrumb>
        <BreadcrumbItem>
          <BreadcrumbLink href="#docs">{'DOC'.repeat(30)}</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbItem>
          <BreadcrumbPage>{'CODE'.repeat(30)}</BreadcrumbPage>
        </BreadcrumbItem>
      </Breadcrumb>
    </div>
  ),
};

// A fake router link: forwards its ref and spreads the props it does not know.
const RouterLink = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; onNavigate?: (to: string) => void }>(
  function RouterLink({ to, onNavigate, onClick, children, ...rest }, ref) {
    return (
      <a
        {...rest}
        ref={ref}
        href={to}
        onClick={(e) => {
          e.preventDefault();
          onClick?.(e);
          onNavigate?.(to);
        }}
      >
        {children}
      </a>
    );
  },
);

/** Recipe: `asChild` hands the classes, `aria-*` and ref to the router's `Link`; no nested anchor. */
export const AsChildRecipe: Story = {
  args: { onNavigate: fn() },
  argTypes: {
    items: { table: { disable: true } },
    textLength: { table: { disable: true } },
    width: { table: { disable: true } },
  },
  render: ({ separator, onNavigate }) => (
    <Breadcrumb separator={separator}>
      <BreadcrumbItem>
        <BreadcrumbLink asChild>
          <RouterLink to="/invoices" onNavigate={onNavigate}>
            Invoices
          </RouterLink>
        </BreadcrumbLink>
      </BreadcrumbItem>
      <BreadcrumbItem>
        <BreadcrumbPage>2026-0142</BreadcrumbPage>
      </BreadcrumbItem>
    </Breadcrumb>
  ),
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const link = canvas.getByRole('link', { name: 'Invoices' });
    await userEvent.tab();
    await expect(link).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onNavigate).toHaveBeenCalledWith('/invoices');
    await expect(canvasElement.querySelector('a a')).toBeNull();
  },
};
