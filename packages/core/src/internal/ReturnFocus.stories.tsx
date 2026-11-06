/* eslint-disable jsx-a11y/no-noninteractive-element-interactions --
   fixture: Escape closes the panel, as a real overlay would */
// Internal fixture for `useReturnFocus`. Not exported from the package and never to be
// re-exported from it.
import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { useReturnFocus } from '../overlay/use-return-focus';

interface DemoArgs {
  /** Hides the opener button while the overlay is open (the focus must go to the fallback). */
  removeOpenerWhileOpen: boolean;
  /** Passes `fallbackRef` (the "Fallback" button) to the hook. */
  withFallback: boolean;
  onOpenChange: (open: boolean) => void;
}

function ReturnFocusDemo({ removeOpenerWhileOpen, withFallback, onOpenChange }: DemoArgs) {
  const [open, setOpenState] = useState(false);
  const fallbackRef = useRef<HTMLButtonElement>(null);
  useReturnFocus({ open, fallbackRef: withFallback ? fallbackRef : undefined });

  const setOpen = (next: boolean) => {
    setOpenState(next);
    onOpenChange(next);
  };

  // Opening from outside any trigger: the shortcut leaves the focus where it is.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey && event.key.toLowerCase() === 'o') {
        setOpenState(true);
        onOpenChange(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onOpenChange]);

  return (
    <div style={{ fontFamily: 'sans-serif', display: 'grid', gap: 12, justifyItems: 'start' }}>
      {!(open && removeOpenerWhileOpen) && (
        <button type="button" onClick={() => setOpen(true)}>
          Open overlay
        </button>
      )}
      <button type="button">Other control (open it with Alt+O)</button>
      <button type="button" ref={fallbackRef}>
        Fallback
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Return focus demo"
          style={{ border: '2px solid #1a56db', borderRadius: 6, padding: 12, background: '#eef2ff' }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
          }}
        >
          <label>
            {/* eslint-disable-next-line jsx-a11y/no-autofocus -- the autoFocus child is the case under test */}
            Name <input autoFocus />
          </label>{' '}
          <button type="button" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
      )}
    </div>
  );
}

const meta: Meta<DemoArgs> = {
  title: 'Internal/ReturnFocus',
  // Test fixture / state matrix, not a documented component: no Docs page.
  tags: ['!autodocs'],
  parameters: { layout: 'padded' },
  argTypes: {
    removeOpenerWhileOpen: { control: 'boolean' },
    withFallback: { control: 'boolean' },
    onOpenChange: { control: false },
  },
  args: { removeOpenerWhileOpen: false, withFallback: false, onOpenChange: fn() },
  render: (args) => <ReturnFocusDemo {...args} />,
};

export default meta;
type Story = StoryObj<DemoArgs>;

/** Button opens the overlay (the inner field is auto-focused), Escape closes: focus is back on the button. */
export const FromButton: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const opener = canvas.getByRole('button', { name: 'Open overlay' });
    await userEvent.click(opener);
    await waitFor(() => expect(canvas.getByRole('textbox', { name: 'Name' })).toHaveFocus());
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(opener).toHaveFocus());
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(false);
  },
};

/** Opened by the Alt+O shortcut (no trigger): the focus returns to the element that had it before. */
export const FromKeyboardShortcut: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const other = canvas.getByRole('button', { name: /Other control/ });
    other.focus();
    await userEvent.keyboard('{Alt>}o{/Alt}');
    await waitFor(() => expect(canvas.getByRole('textbox', { name: 'Name' })).toHaveFocus());
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(other).toHaveFocus());
  },
};

/** The opener disappears while the overlay is open: the focus goes to the fallback, nothing throws. */
export const OpenerRemoved: Story = {
  args: { removeOpenerWhileOpen: true, withFallback: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Open overlay' }));
    await waitFor(() => expect(canvas.queryByRole('button', { name: 'Open overlay' })).toBeNull());
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Fallback' })).toHaveFocus());
  },
};
