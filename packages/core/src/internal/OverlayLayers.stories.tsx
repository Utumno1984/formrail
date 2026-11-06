/* eslint-disable jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions --
   fixture: the click handlers only prove which panel receives the click */
// Internal fixture for the overlay z-index levels. Not exported from the package and never to be
// re-exported from it. Positions are inline styles; the stacking comes only from `overlayLayer`.
import { createPortal } from 'react-dom';
import * as Popover from '@radix-ui/react-popover';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { overlayLayer } from '../overlay/layers';

interface LayersArgs {
  onPopoverClick: () => void;
  onModalClick: () => void;
}

const box = { position: 'fixed', fontFamily: 'sans-serif', fontSize: 14, padding: 12, borderRadius: 6 } as const;

function OverlayLayersFixture({ onPopoverClick, onModalClick }: LayersArgs) {
  return (
    <>
      {createPortal(
        <div
          data-testid="backdrop"
          className={overlayLayer.backdrop}
          style={{ position: 'fixed', inset: 0, background: 'rgb(0 0 0 / 0.25)' }}
        />,
        document.body,
      )}
      {createPortal(
        <div
          role="dialog"
          aria-label="Modal panel"
          data-testid="modal"
          className={overlayLayer.modal}
          style={{ ...box, top: 40, left: 40, width: 360, height: 220, background: '#fff', border: '2px solid #1a56db' }}
          onClick={onModalClick}
        >
          Modal panel (level modal)
        </div>,
        document.body,
      )}
      <Popover.Root open>
        <Popover.Anchor
          data-testid="popover-anchor"
          style={{ position: 'fixed', top: 150, left: 120, width: 120, height: 1 }}
        />
        <Popover.Portal>
          <Popover.Content
            data-testid="popover"
            className={overlayLayer.popover}
            side="bottom"
            align="start"
            sideOffset={0}
            onOpenAutoFocus={(event) => event.preventDefault()}
            onClick={onPopoverClick}
            style={{ ...box, position: undefined, width: 260, height: 140, background: '#ecfdf5', border: '2px solid #047857' }}
          >
            Popover (level popover), positioned by a Radix wrapper, overlapping the modal
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {createPortal(
        <div
          role="tooltip"
          data-testid="tooltip"
          className={overlayLayer.tooltip}
          style={{ ...box, top: 200, left: 160, width: 180, height: 60, background: '#fffbeb', border: '2px solid #b45309' }}
        >
          Tooltip (level tooltip)
        </div>,
        document.body,
      )}
    </>
  );
}

const meta: Meta<LayersArgs> = {
  title: 'Internal/OverlayLayers',
  // Test fixture / state matrix, not a documented component: no Docs page.
  tags: ['!autodocs'],
  parameters: { layout: 'fullscreen' },
  argTypes: {
    onPopoverClick: { control: false },
    onModalClick: { control: false },
  },
  args: { onPopoverClick: fn(), onModalClick: fn() },
  render: (args) => <OverlayLayersFixture {...args} />,
};

export default meta;
type Story = StoryObj<LayersArgs>;

/**
 * Backdrop < modal < popover < tooltip. Clicking in the area where the popover covers the modal
 * must reach the popover, not the modal below it.
 */
export const Layers: Story = {
  tags: ['visual'],
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const popover = await body.findByTestId('popover');
    await waitFor(() => expect(popover.getBoundingClientRect().height).toBeGreaterThan(0));
    const r = popover.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + 20;
    await expect(document.elementFromPoint(x, y)).toBe(popover);
    await userEvent.click(document.elementFromPoint(x, y) as Element);
    await expect(args.onPopoverClick).toHaveBeenCalledTimes(1);
    await expect(args.onModalClick).not.toHaveBeenCalled();
  },
};
