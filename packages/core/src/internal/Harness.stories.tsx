// Internal fixture for the e2e harness self-tests. Not exported from the package
// (the tsup entry is src/index.ts only) and never to be re-exported from it.
import { createPortal } from 'react-dom';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  title: 'Internal/Harness',
  // Test fixture / state matrix, not a documented component: no Docs page; `internal`: hidden from the public sidebar (#296).
  tags: ['!autodocs', 'internal'],
  parameters: { layout: 'centered' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Visual-regression fixture (tag `visual`): a few elements with explicit paddings, so that a
 * padding change (e.g. 8px -> 12px on the card) visibly changes the screenshot at every viewport.
 * Taller than the viewport on purpose: the default full-page capture must include the bottom block.
 */
export const Visual: Story = {
  tags: ['visual'],
  parameters: { layout: 'padded' },
  render: () => (
    <div style={{ fontFamily: 'sans-serif', width: '100%', maxWidth: 480 }}>
      <div
        data-testid="visual-card"
        style={{
          padding: 8,
          border: '2px solid #1a56db',
          borderRadius: 6,
          background: '#eef2ff',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18 }}>Visual regression fixture</h2>
        <p style={{ margin: '8px 0 0', fontSize: 14 }}>
          Changing the padding of this card must fail the visual check.
        </p>
      </div>
      <button type="button" style={{ marginTop: 16, padding: '8px 16px', fontSize: 14 }}>
        Save
      </button>
      <div
        data-testid="below-the-fold"
        style={{ marginTop: 1200, padding: 12, border: '2px solid #047857', background: '#ecfdf5' }}
      >
        Below the fold: only a full-page capture (the default) photographs this block.
      </div>
    </div>
  ),
};

/** Opt-out of the full-page default (tag `visual-viewport-only`): only the viewport is photographed. */
export const VisualViewportOnly: Story = {
  tags: ['visual', 'visual-viewport-only'],
  parameters: { layout: 'padded' },
  render: () => (
    <div style={{ fontFamily: 'sans-serif', width: '100%', maxWidth: 480 }}>
      <div style={{ padding: 8, border: '2px solid #b45309', background: '#fffbeb' }}>
        Viewport-only fixture
      </div>
      <div style={{ marginTop: 1200 }}>Never photographed: below the viewport.</div>
    </div>
  ),
};

/** Accessible bare component (no landmark/heading): axe must report no violations. */
export const Valid: Story = {
  render: () => <button type="button">Save</button>,
};

/** Deliberately broken fixture: a button with no accessible name. */
export const ButtonWithoutName: Story = {
  render: () => <button type="button" data-testid="nameless" />,
};

/** Deliberately broken fixture: the nameless button lives in a portal on document.body. */
export const PortalButtonWithoutName: Story = {
  render: () => (
    <>
      <button type="button">Open</button>
      {createPortal(<button type="button" data-testid="portal-nameless" />, document.body)}
    </>
  ),
};

/** Fixture: renders nothing, gotoStory must fail explicitly. */
export const RendersNothing: Story = {
  render: () => <></>,
};

/** Fixture: throws while rendering, gotoStory must fail explicitly. */
export const ThrowsOnRender: Story = {
  render: () => {
    throw new Error('harness-boom');
  },
};
