import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { CLASS_NAME_ARG } from '../internal/story-docs';
import { Pagination, type PaginationProps } from './Pagination';

interface DemoArgs extends Omit<PaginationProps, 'onPageChange'> {
  onPageChange: (page: number) => void;
}

/** Local state that follows the controlled `page`; `onPageChange` is the Actions-panel spy. */
function Demo({ page: initial, onPageChange, ...args }: DemoArgs) {
  const [page, setPage] = useState(initial);
  // Follow the Controls panel when `page` is edited there (render-time adjustment, no effect).
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setPage(initial);
  }
  return (
    <div style={{ padding: 8 }}>
      <Pagination
        {...args}
        data-testid="pagination"
        page={page}
        onPageChange={(next) => {
          onPageChange(next);
          setPage(next);
        }}
      />
    </div>
  );
}

const meta = {
  title: 'Navigation/Pagination',
  component: Pagination,
  parameters: { layout: 'padded' },
  argTypes: {
    page: { control: { type: 'number', min: 1 } },
    pageCount: { control: { type: 'number', min: 0 } },
    siblingCount: { control: { type: 'number', min: 0, max: 4 } },
    boundaryCount: { control: { type: 'number', min: 0, max: 4 } },
    disabled: { control: 'boolean' },
    labels: { control: 'object' },
    className: CLASS_NAME_ARG,
    onPageChange: { control: false },
  },
  args: { page: 1, pageCount: 120, siblingCount: 1, boundaryCount: 1, disabled: false, onPageChange: fn() },
  render: (args) => <Demo {...(args as DemoArgs)} />,
} satisfies Meta<typeof Pagination>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Next from page 1 to the last of 120: the focus follows and the width never changes. */
export const Playground: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const nav = canvas.getByRole('navigation', { name: 'Pagination' });
    const width = nav.getBoundingClientRect().width;
    const next = canvas.getByRole('button', { name: 'Next page' });
    await userEvent.click(next);
    const last = args.pageCount;
    for (let page = 2; page <= last; page++) {
      if (page > 2) await userEvent.keyboard('{Enter}');
      // cheap synchronous checks per step: the current page and a constant width
      const current = canvasElement.querySelector('[aria-current="page"]');
      await expect(current?.getAttribute('aria-label')).toBe(`Page ${page}`);
      await expect(Math.abs(nav.getBoundingClientRect().width - width)).toBeLessThanOrEqual(0.5);
    }
    await expect(args.onPageChange).toHaveBeenCalledTimes(last - 1);
    await expect(args.onPageChange).toHaveBeenLastCalledWith(last);
    await expect(canvas.getByRole('button', { name: 'Next page' })).toBeDisabled();
    // the disabled "Next" had the focus: it moved to the current page, not to <body>
    await expect(canvas.getByRole('button', { name: `Page ${last}` })).toHaveFocus();
  },
};

/** The same control without the `play` function: for manual use and for the e2e tests that set `page` via args. */
export const Manual: Story = {};

const stack = { display: 'grid', gap: 16, color: 'var(--color-rop-text)' } as const;

// `tags` are written inline in each story: Storybook reads them statically, a spread is not seen.
const noControls = { controls: { disable: true } };

/** Visual: first page of 120. */
export const FirstPage: Story = { tags: ['visual'], parameters: noControls, args: { page: 1, pageCount: 120 } };
/** Visual: a page in the middle of 120. */
export const MiddlePage: Story = { tags: ['visual'], parameters: noControls, args: { page: 60, pageCount: 120 } };
/** Visual: the last page of 120. */
export const LastPage: Story = { tags: ['visual'], parameters: noControls, args: { page: 120, pageCount: 120 } };
/** Visual: a single page (also what pageCount 0 renders). */
export const SinglePage: Story = { tags: ['visual'], parameters: noControls, args: { page: 1, pageCount: 1 } };
/** Visual: the whole control disabled (e.g. while loading); same size as the enabled one. */
export const Disabled: Story = {
  tags: ['visual'],
  parameters: noControls,
  args: { page: 60, pageCount: 120, disabled: true },
};

/** The parent disables the whole control while the new page "loads" (300 ms): the focus is not lost. */
function LoadingDemo({ onPageChange, ...args }: DemoArgs) {
  const [page, setPage] = useState(args.page);
  const [loading, setLoading] = useState(false);
  return (
    <div style={{ padding: 8 }}>
      <Pagination
        {...args}
        data-testid="pagination"
        page={page}
        disabled={loading}
        onPageChange={(next) => {
          onPageChange(next);
          setPage(next);
          setLoading(true);
          window.setTimeout(() => setLoading(false), 300);
        }}
      />
    </div>
  );
}

/**
 * Click "Next page" (or focus it and press Enter): the control is disabled for 300 ms, as a parent would while
 * fetching the page. When it is enabled again the focus is on the new current page, not lost on `<body>`.
 */
export const LoadingOnChange: Story = {
  parameters: noControls,
  args: { page: 5, pageCount: 10 },
  render: (args) => <LoadingDemo {...(args as DemoArgs)} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const next = canvas.getByRole('button', { name: 'Next page' });
    next.focus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onPageChange).toHaveBeenCalledWith(6);
    // once loading ends the focus is on the current page, not on <body>, and Enter keeps working
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Page 6' })).toBeEnabled(), { timeout: 2000 });
    await waitFor(() => expect(document.activeElement?.getAttribute('aria-label')).toBe('Page 6'));
    await userEvent.keyboard('{Tab}{Enter}');
    await expect(args.onPageChange).toHaveBeenLastCalledWith(7);
  },
};

/** Visual: right-to-left; the arrows are mirrored. */
export const RightToLeft: Story = {
  tags: ['visual'],
  parameters: noControls,
  args: { page: 60, pageCount: 120 },
  render: (args) => (
    <div dir="rtl" style={stack}>
      <Demo {...(args as DemoArgs)} />
    </div>
  ),
};
