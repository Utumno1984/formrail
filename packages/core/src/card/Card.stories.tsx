import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Button } from '../button/Button';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../dialog/Dialog';
import { CLASS_NAME_ARG, storyControl } from '../internal/story-docs';
import { Card, CardBody, CardDescription, CardFooter, CardHeader, CardTitle, type CardProps, type CardTitleLevel } from './Card';

const LEVELS: CardTitleLevel[] = [2, 3, 4, 5, 6];
const LONG = 'A'.repeat(200);

interface DemoArgs extends CardProps {
  level: CardTitleLevel;
  showDescription: boolean;
  showFooter: boolean;
  /** Width of the demo container, px (story-only control). */
  width: number;
  onEdit: () => void;
  onCancel: () => void;
}

const meta = {
  title: 'Primitives/Card',
  component: Card,
  subcomponents: { CardHeader, CardTitle, CardDescription, CardBody, CardFooter },
  // Overlays opened at mount, autofocus and history changes would take over the Docs page if the stories
  // were rendered inline: each story gets its own iframe there.
  parameters: { layout: 'padded', docs: { story: { inline: false, height: '360px' } } },
  argTypes: {
    as: { control: 'radio', options: ['div', 'section', 'article'] },
    level: { control: 'select', options: LEVELS, description: "`CardTitle`'s `level`: the heading level of the title (see the CardTitle tab)." },
    className: CLASS_NAME_ARG,
    showDescription: storyControl({ control: 'boolean', description: 'Renders a `CardDescription` under the title.' }),
    showFooter: storyControl({ control: 'boolean', description: 'Renders a `CardFooter` with two buttons.' }),
    width: storyControl({ control: { type: 'range', min: 240, max: 640, step: 10 }, description: 'Width of the demo container (px).' }),
    onEdit: storyControl({ control: false, description: 'The footer\'s "Edit" button.' }),
    onCancel: storyControl({ control: false, description: 'The footer\'s "Cancel" button.' }),
  },
  args: {
    as: 'div',
    level: 3,
    showDescription: true,
    showFooter: true,
    width: 420,
    onEdit: fn(),
    onCancel: fn(),
  },
  render: ({ level, showDescription, showFooter, width, onEdit, onCancel, ...args }) => (
    <div data-testid="container" style={{ width, maxWidth: '100%', padding: 4 }}>
      <Card {...args} data-testid="card">
        <CardHeader>
          <CardTitle level={level}>Invoice 2026-0142</CardTitle>
          {showDescription ? <CardDescription>Acme S.r.l. - due on 30 November</CardDescription> : null}
        </CardHeader>
        <CardBody>
          <a href="#details" onClick={(e) => e.preventDefault()}>
            Open the full details
          </a>
        </CardBody>
        {showFooter ? (
          <CardFooter>
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button variant="primary" onClick={onEdit}>
              Edit
            </Button>
          </CardFooter>
        ) : null}
      </Card>
    </div>
  ),
} satisfies Meta<DemoArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Controls: root element, title level, description, footer, container width. The play function
 * tabs to the footer "Edit" button, checks it has the focus and lies entirely inside the card
 * box (the focus ring is not clipped: the card has no `overflow: hidden`), activates it with Enter
 * and checks the action; then checks that a `section` Card is a region named by its title.
 */
export const Playground: Story = {
  args: { as: 'section' },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const card = canvas.getByTestId('card');
    const edit = canvas.getByRole('button', { name: 'Edit' });
    // Details link, then Cancel, then Edit.
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    await expect(edit).toHaveFocus();
    const c = card.getBoundingClientRect();
    const b = edit.getBoundingClientRect();
    await expect(b.left).toBeGreaterThanOrEqual(c.left);
    await expect(b.right).toBeLessThanOrEqual(c.right);
    await expect(b.top).toBeGreaterThanOrEqual(c.top);
    await expect(b.bottom).toBeLessThanOrEqual(c.bottom);
    await expect(getComputedStyle(card).overflow).toBe('visible');
    await userEvent.keyboard('{Enter}');
    await expect(args.onEdit).toHaveBeenCalledTimes(1);
    await expect(canvas.getByRole('region', { name: 'Invoice 2026-0142' })).toBe(card);
  },
};

const grid = { display: 'grid', gap: 16, color: 'var(--color-rop-text)' } as const;

/** Visual: header + description + body + footer actions. */
export const Complete: Story = {
  tags: ['visual'],
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={{ ...grid, maxWidth: 420 }}>
      <Card as="article" data-testid="card">
        <CardHeader>
          <CardTitle>Invoice 2026-0142</CardTitle>
          <CardDescription>Acme S.r.l. - due on 30 November</CardDescription>
        </CardHeader>
        <CardBody>Total 1,240.00 EUR, 22% VAT included. Approved by the finance team.</CardBody>
        <CardFooter>
          <Button variant="ghost">Cancel</Button>
          <Button variant="primary">Edit</Button>
        </CardFooter>
      </Card>
    </div>
  ),
};

/** Visual: body only. */
export const BodyOnly: Story = {
  tags: ['visual'],
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={{ ...grid, maxWidth: 420 }}>
      <Card data-testid="card">
        <CardBody>A card with just a body: no header, no footer.</CardBody>
      </Card>
    </div>
  ),
};

/** Visual: 200 characters without spaces wrap inside the card, no horizontal overflow. */
export const LongUnbrokenText: Story = {
  tags: ['visual'],
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={grid} data-testid="container">
      <Card data-testid="card">
        <CardHeader>
          <CardTitle>{LONG}</CardTitle>
          <CardDescription>{LONG}</CardDescription>
        </CardHeader>
        <CardBody>{LONG}</CardBody>
        <CardFooter>
          <Button>{LONG.slice(0, 40)}</Button>
        </CardFooter>
      </Card>
    </div>
  ),
};

/** Visual: many actions wrap onto further lines in a 280px container, without overlapping. */
export const ManyActions: Story = {
  tags: ['visual'],
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={{ ...grid, width: 280, maxWidth: '100%' }} data-testid="container">
      <Card data-testid="card">
        <CardHeader>
          <CardTitle>Document actions</CardTitle>
        </CardHeader>
        <CardBody>Choose what to do with the document.</CardBody>
        <CardFooter data-testid="footer">
          {['Archive', 'Duplicate', 'Share', 'Export', 'Print'].map((label) => (
            <Button key={label} variant="secondary">
              {label}
            </Button>
          ))}
          <Button variant="primary">Edit</Button>
        </CardFooter>
      </Card>
    </div>
  ),
};

/** Visual: cards in a CSS grid of narrow columns; a long word stays inside its cell. */
export const CardGrid: Story = {
  tags: ['visual'],
  parameters: { controls: { disable: true } },
  render: () => (
    <div
      data-testid="grid"
      style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(0, 140px))', gap: 12 }}
    >
      {['One', 'Two', 'Three'].map((name) => (
        <Card key={name} as="section" data-testid={`cell-${name}`}>
          <CardHeader>
            <CardTitle level={4}>{name}</CardTitle>
          </CardHeader>
          <CardBody>{name === 'Two' ? LONG : 'Short text'}</CardBody>
          <CardFooter>
            <Button size="sm">Open</Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  ),
};

/** A Card inside an open Dialog: the Dialog body is the only scroller. */
export const InsideDialog: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <Dialog defaultOpen>
      <DialogTrigger asChild>
        <Button>Open details</Button>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined} data-testid="dialog">
        <DialogHeader>
          <DialogTitle>Details</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Card as="section" data-testid="card">
            <CardHeader>
              <CardTitle level={3}>Invoice</CardTitle>
            </CardHeader>
            <CardBody>{LONG}</CardBody>
            <CardFooter>
              <Button variant="primary">Edit</Button>
            </CardFooter>
          </Card>
        </DialogBody>
      </DialogContent>
    </Dialog>
  ),
};
