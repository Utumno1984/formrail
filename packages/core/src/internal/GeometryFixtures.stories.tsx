// Internal fixtures for the geometry helpers' self-tests (e2e/geometry.spec.ts): each helper
// has a "healthy" fixture that must pass and a "broken" one that must fail. Not exported from
// the package, and deliberately NOT tagged `visual` (several are broken on purpose).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useLayoutEffect, type ReactNode } from 'react';

const meta = {
  title: 'Internal/GeometryFixtures',
  // Test fixture / state matrix, not a documented component: no Docs page.
  tags: ['!autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const box = { width: 240, height: 120, border: '1px solid #888' } as const;
const tall = { height: 400 } as const;

/** One scroller only: the outer box scrolls, the inner content does not. */
export const SingleScrollerHealthy: Story = {
  render: () => (
    <div data-testid="root" style={{ ...box, overflowY: 'auto' }}>
      <div style={tall}>content</div>
    </div>
  ),
};

/** Double scroll: the outer box AND a nested box both scroll vertically. */
export const DoubleScroll: Story = {
  render: () => (
    <div data-testid="root" style={{ ...box, overflowY: 'auto' }}>
      <div style={{ height: 300 }}>
        <div style={{ height: 80, overflowY: 'auto' }}>
          <div style={tall}>inner</div>
        </div>
      </div>
    </div>
  ),
};

/** No horizontal overflow: everything fits in the container. */
export const NoOverflowHealthy: Story = {
  render: () => (
    <div data-testid="root" style={{ ...box, overflow: 'hidden' }}>
      <div style={{ width: '100%' }}>fits</div>
    </div>
  ),
};

/** The container itself has horizontally scrollable content (scrollWidth > clientWidth). */
export const HorizontalScroll: Story = {
  render: () => (
    <div data-testid="root" style={{ ...box, overflowX: 'auto' }}>
      <div style={{ width: 600 }}>too wide</div>
    </div>
  ),
};

/** The container clips nothing, but a descendant sticks out of its bounding box. */
export const DescendantSticksOut: Story = {
  render: () => (
    <div data-testid="root" style={{ ...box, overflow: 'visible' }}>
      <div style={{ position: 'relative', left: 200, width: 100 }}>sticks out</div>
    </div>
  ),
};

const focusCss = `
  .geo-btn:focus-visible { outline: 3px solid #1a56db; outline-offset: 2px; }
`;

/** The focus ring has room: the wrapper pads the button by more than the ring extent. */
export const FocusRingVisible: Story = {
  render: () => (
    <>
      <style>{focusCss}</style>
      <div data-testid="root" style={{ overflow: 'hidden', padding: 12, width: 160 }}>
        <button type="button" className="geo-btn" data-testid="target">
          Focus me
        </button>
      </div>
    </>
  ),
};

/** The focus ring is cut off by an ancestor with overflow: hidden and no padding. */
export const FocusRingClipped: Story = {
  render: () => (
    <>
      <style>{focusCss}</style>
      <div data-testid="root" style={{ overflow: 'hidden', padding: 0, width: 160 }}>
        <button type="button" className="geo-btn" data-testid="target">
          Focus me
        </button>
      </div>
    </>
  ),
};

/** No focus indicator at all (outline: none): the helper must fail, not pass vacuously. */
export const FocusRingMissing: Story = {
  render: () => (
    <div data-testid="root" style={{ overflow: 'hidden', padding: 12, width: 160 }}>
      <button type="button" data-testid="target" style={{ outline: 'none' }}>
        Focus me
      </button>
    </div>
  ),
};

/** Page scroll + inner scroller: a tall page AND a panel with its own overflow:auto (2 scrollers). */
export const PageAndPanelScroll: Story = {
  render: () => (
    <div data-testid="root" style={{ minHeight: 2000 }}>
      <div style={{ ...box, overflowY: 'auto' }}>
        <div style={tall}>panel</div>
      </div>
    </div>
  ),
};

/** Only the page scrolls (tall content, no inner scroller): healthy. */
export const PageScrollOnlyHealthy: Story = {
  render: () => (
    <div data-testid="root" style={{ minHeight: 2000 }}>
      tall page
    </div>
  ),
};

/** Intentional horizontal scroll wrapper (scrollable table): must NOT count as overflow. */
export const ScrollableTableWrapperHealthy: Story = {
  render: () => (
    <div data-testid="root" style={{ ...box, width: 300, overflow: 'visible' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: 800 }}>
          <tbody>
            <tr>
              <td>wide</td>
              <td>table</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  ),
};

/** Ellipsis-truncated cell whose inner span is wider than the cell: must NOT count. */
export const TruncatedCellHealthy: Story = {
  render: () => (
    <div data-testid="root" style={{ ...box, overflow: 'visible' }}>
      <div style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <span style={{ display: 'inline-block' }}>a very long value that does not fit in the cell</span>
      </div>
    </div>
  ),
};

/** Visually hidden text parked off-screen with left:-9999px: must NOT count. */
export const OffscreenTextHealthy: Story = {
  render: () => (
    <div data-testid="root" style={{ ...box, position: 'relative', overflow: 'visible' }}>
      <span style={{ position: 'absolute', left: -9999 }}>skip to content</span>
      visible text
    </div>
  ),
};

/** Wide content in a wrapper that does NOT clip (overflow: visible): a real overflow. */
export const UnclippedWideWrapper: Story = {
  render: () => (
    <div data-testid="root" style={{ ...box, overflow: 'visible' }}>
      <div style={{ overflowX: 'visible' }}>
        <div style={{ width: 600 }}>too wide, nobody clips it</div>
      </div>
    </div>
  ),
};

const transitionCss = `
  .geo-trans { outline: none; transition: box-shadow 5s linear 2s; }
  .geo-trans:focus-visible { box-shadow: 0 0 0 4px #1a56db; }
`;

/** Real focus ring (box-shadow) that fades in via a long CSS transition: must pass. */
export const FocusRingWithTransition: Story = {
  render: () => (
    <>
      <style>{transitionCss}</style>
      <div data-testid="root" style={{ overflow: 'hidden', padding: 12, width: 160 }}>
        <button type="button" className="geo-trans" data-testid="target">
          Focus me
        </button>
      </div>
    </>
  ),
};

/**
 * Real ring that fades in via a transition AND is clipped (no padding, overflow:hidden). Read
 * mid-transition its spread is ~0, so a helper that does not freeze transitions misses the clip.
 */
export const FocusRingClippedWithTransition: Story = {
  render: () => (
    <>
      <style>{transitionCss}</style>
      <div data-testid="root" style={{ overflow: 'hidden', padding: 0, width: 160 }}>
        <button type="button" className="geo-trans" data-testid="target">
          Focus me
        </button>
      </div>
    </>
  ),
};

/** A faint box-shadow that is ALWAYS there (no focus style at all): not an indicator. */
export const FocusRingPermanentShadow: Story = {
  render: () => (
    <div data-testid="root" style={{ overflow: 'hidden', padding: 12, width: 160 }}>
      <button
        type="button"
        data-testid="target"
        style={{ outline: 'none', boxShadow: '0 0 2px 1px rgba(0,0,0,0.2)' }}
      >
        Focus me
      </button>
    </div>
  ),
};

const transparentOutlineCss = `
  .geo-tw:focus-visible { outline: 2px solid transparent; outline-offset: 2px; }
`;

/** Tailwind v3 `outline-none`: a present but fully transparent outline. Invisible. */
export const FocusRingTransparentOutline: Story = {
  render: () => (
    <>
      <style>{transparentOutlineCss}</style>
      <div data-testid="root" style={{ overflow: 'hidden', padding: 12, width: 160 }}>
        <button type="button" className="geo-tw" data-testid="target">
          Focus me
        </button>
      </div>
    </>
  ),
};

const insetClippedCss = `
  .geo-in:focus-visible { outline: 4px solid #1a56db; outline-offset: -1px; }
`;

/** Real inner ring (negative offset) that still pokes 3px out and is cut by overflow:hidden. */
export const FocusRingInsetOffsetClipped: Story = {
  render: () => (
    <>
      <style>{insetClippedCss}</style>
      <div data-testid="root" style={{ overflow: 'hidden', padding: 0, width: 160 }}>
        <button type="button" className="geo-in" data-testid="target">
          Focus me
        </button>
      </div>
    </>
  ),
};

const fullyInsideCss = `
  .geo-ins:focus-visible { outline: 2px solid #1a56db; outline-offset: -2px; }
`;

/**
 * Vertical-only panel (overflow-y:auto => computed overflow-x:auto) holding a row that is too
 * wide: a real, unwanted horizontal overflow. Must FAIL (a scroll wrapper is not a free pass).
 */
export const VerticalPanelWithWideRow: Story = {
  render: () => (
    <div data-testid="root" style={{ ...box, overflow: 'visible' }}>
      <div style={{ height: 80, overflowY: 'auto' }}>
        <div style={{ width: 600 }}>row that is far too wide</div>
        <div style={tall}>and tall content, so the panel scrolls vertically</div>
      </div>
    </div>
  ),
};

/** Negative `left` that still lands on screen (not far enough to leave the page): a real overflow. */
export const NegativeLeftStillVisible: Story = {
  render: () => (
    <div style={{ paddingLeft: 400 }}>
      <div data-testid="root" style={{ ...box, position: 'relative', overflow: 'visible' }}>
        <span style={{ position: 'absolute', left: -300, width: 100 }}>still on screen</span>
        visible text
      </div>
    </div>
  ),
};

/**
 * Absolute box whose containing block (the positioned `C`) sits INSIDE a clipping ancestor `W`:
 * W clips it, so nothing sticks out of the root. Must pass.
 */
export const AbsoluteClippedByAncestorOfContainingBlockHealthy: Story = {
  render: () => (
    <div data-testid="root" style={{ ...box, overflow: 'visible' }}>
      <div style={{ width: 100, overflow: 'hidden' }}>
        <div style={{ position: 'relative', height: 20 }}>
          <div style={{ position: 'absolute', left: 0, width: 300 }}>dropdown clipped by W</div>
        </div>
      </div>
    </div>
  ),
};

/**
 * Absolute box whose containing block is the root (positioned); the static overflow:hidden
 * wrapper `W` between them does NOT clip it (CSS), so it really sticks out. Must FAIL.
 */
export const AbsoluteEscapesStaticClipper: Story = {
  render: () => (
    <div data-testid="root" style={{ ...box, position: 'relative', overflow: 'visible' }}>
      <div style={{ width: 100, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, width: 300 }}>dropdown not clipped by W</div>
      </div>
    </div>
  ),
};

/**
 * Static wide child inside a narrow absolute box `A`; above `A` sits a static overflow:hidden
 * wrapper `W`. `A`'s containing block is the page (W is static), so W does NOT clip the child:
 * its chain is A -> page. Really sticks out of the root. Must FAIL.
 */
export const StaticChildInAbsoluteBoxEscapesStaticWrapper: Story = {
  render: () => (
    <div data-testid="root" style={{ ...box, overflow: 'visible' }}>
      <div style={{ width: 100, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', width: 100 }}>
          <div style={{ width: 400 }}>wide static child</div>
        </div>
      </div>
    </div>
  ),
};

/**
 * Absolute box inside a 0x0 absolute anchor, under a static overflow:hidden wrapper `W`. The
 * anchor is the containing block (a 0x0 box is still one) and W is not on the chain, so the box
 * really sticks out of the root. Must FAIL.
 */
export const AbsoluteInZeroSizeAnchorEscapesStaticWrapper: Story = {
  render: () => (
    <div data-testid="root" style={{ ...box, overflow: 'visible' }}>
      <div style={{ width: 100, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', width: 0, height: 0 }}>
          <div style={{ position: 'absolute', left: 0, width: 400 }}>popup from a 0x0 anchor</div>
        </div>
      </div>
    </div>
  ),
};

function BodyScrollLock({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  return <>{children}</>;
}

/** Dialog-like scroll lock (body overflow:hidden) with ONE inner scroll panel: single scroller. */
export const BodyScrollLockedSinglePanelHealthy: Story = {
  render: () => (
    <BodyScrollLock>
      <div data-testid="root" style={{ minHeight: 2000 }}>
        <div style={{ ...box, overflowY: 'auto' }}>
          <div style={tall}>panel</div>
        </div>
      </div>
    </BodyScrollLock>
  ),
};

/** Real inner ring fully inside the border box (offset <= -width): visible and not clippable. */
export const FocusRingFullyInsideHealthy: Story = {
  render: () => (
    <>
      <style>{fullyInsideCss}</style>
      <div data-testid="root" style={{ overflow: 'hidden', padding: 0, width: 160 }}>
        <button type="button" className="geo-ins" data-testid="target">
          Focus me
        </button>
      </div>
    </>
  ),
};
