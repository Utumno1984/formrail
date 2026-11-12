import { forwardRef, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { exampleStory } from '../internal/example-story';
import { cn } from './cn';
import { composeRefs } from './compose-refs';

const meta: Meta = {
  title: 'Foundations/Utilities',
  parameters: {
    layout: 'padded',
    controls: { disable: true },
    docs: {
      description: {
        component: [
          'Two helpers the components are built with, exported for code that wraps them.',
          '',
          '**`cn(...classes)`** merges class names with the clsx syntax and resolves conflicting Tailwind classes (the last one wins). It knows the library tokens: the list is read from the same `tokens.css` that produces `theme.css`.',
          '',
          '```ts',
          "import { cn } from '@formrail/core';",
          '',
          "cn('px-2', 'px-4'); // 'px-4'",
          "cn('z-rop-modal', 'z-rop-popover'); // 'z-rop-popover'",
          "cn('text-rop-body', 'text-rop-error'); // both kept: a size and a color",
          "cn('hover:px-2', cond && 'hover:px-4', { 'font-rop-mono': isCode }); // clsx syntax",
          '```',
          '',
          '**`composeRefs(...refs)`** merges object refs, callback refs and `undefined` into one callback ref: use it when a component forwards a `ref` and also needs its own on the same node.',
          '',
          '```tsx',
          "import { forwardRef, useRef } from 'react';",
          "import { composeRefs } from '@formrail/core';",
          '',
          'const Measured = forwardRef<HTMLInputElement>(function Measured(props, ref) {',
          '  const own = useRef<HTMLInputElement>(null);',
          '  return <input {...props} ref={composeRefs(own, ref)} />;',
          '});',
          '```',
        ].join('\n'),
      },
    },
  },
};

export default meta;
type Story = StoryObj;

export const Example: Story = { tags: ['example', '!visual'], ...exampleStory('Utilities.example.tsx') };

const cond = false as boolean;
const isCode = true as boolean;

const CASES: Array<[string, string]> = [
  ["cn('px-2', 'px-4')", cn('px-2', 'px-4')],
  ["cn('z-rop-modal', 'z-rop-popover')", cn('z-rop-modal', 'z-rop-popover')],
  ["cn('text-rop-body', 'text-rop-error')", cn('text-rop-body', 'text-rop-error')],
  ["cn('hover:px-2', cond && 'hover:px-4', { 'font-rop-mono': isCode })", cn('hover:px-2', cond && 'hover:px-4', { 'font-rop-mono': isCode })],
];

/** `cn`: each call and the class string it returns. The play function checks the conflicts resolved and the non-conflicting classes kept. */
export const ClassNames: Story = {
  tags: ['playground'],
  render: () => (
    <table>
      <tbody>
        {CASES.map(([call, result]) => (
          <tr key={call}>
            <td>
              <code>{call}</code>
            </td>
            <td>
              <code data-testid={call}>{result}</code>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("cn('px-2', 'px-4')")).toHaveTextContent(/^px-4$/);
    await expect(canvas.getByTestId("cn('z-rop-modal', 'z-rop-popover')")).toHaveTextContent(/^z-rop-popover$/);
    await expect(canvas.getByTestId("cn('text-rop-body', 'text-rop-error')")).toHaveTextContent(/^text-rop-body text-rop-error$/);
  },
};

const Measured = forwardRef<HTMLInputElement>(function Measured(props, ref) {
  const own = useRef<HTMLInputElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  return (
    <div style={{ display: 'grid', gap: 8, justifyItems: 'start' }}>
      <input aria-label="Measured input" {...props} ref={composeRefs(own, ref)} />
      <button type="button" onClick={() => setWidth(own.current?.offsetWidth ?? null)}>
        Measure (own ref)
      </button>
      <output data-testid="width">{width === null ? 'not measured' : `${width > 0 ? 'measured' : 'zero'}`}</output>
    </div>
  );
});

function ComposeRefsDemo() {
  const outer = useRef<HTMLInputElement>(null);
  return (
    <div style={{ display: 'grid', gap: 8, justifyItems: 'start' }}>
      <Measured ref={outer} />
      <button type="button" onClick={() => outer.current?.focus()}>
        Focus (forwarded ref)
      </button>
    </div>
  );
}

/** `composeRefs`: the component reads the node through its own ref and the parent reaches it through the forwarded one. The play function uses both. */
export const ComposingRefs: Story = {
  render: () => <ComposeRefsDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Measure (own ref)' }));
    await expect(canvas.getByTestId('width')).toHaveTextContent('measured');
    await userEvent.click(canvas.getByRole('button', { name: 'Focus (forwarded ref)' }));
    await expect(canvas.getByRole('textbox', { name: 'Measured input' })).toHaveFocus();
  },
};
