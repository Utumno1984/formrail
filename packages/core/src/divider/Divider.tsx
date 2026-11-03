import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../utils/cn';

export type DividerOrientation = 'horizontal' | 'vertical';
export type DividerSpacing = 'none' | 'sm' | 'md' | 'lg';

export interface DividerProps extends Omit<HTMLAttributes<HTMLElement>, 'role' | 'children'> {
  /** `horizontal` (default, an `<hr>`) or `vertical` (a `role="separator"` stretched to the flex row). */
  orientation?: DividerOrientation;
  /**
   * Purely visual line: no role, `aria-hidden="true"`, absent from the accessibility tree. A
   * horizontal decorative divider renders as a `<div>` instead of an `<hr>`.
   */
  decorative?: boolean;
  /** Margin on the perpendicular axis (above/below a horizontal line, beside a vertical one). Default `md`. */
  spacing?: DividerSpacing;
}

// Complete literal classes (Tailwind scans the source). Logical margins: `my-*` is margin-block,
// `mx-*` is margin-inline.
const HORIZONTAL_SPACING: Record<DividerSpacing, string> = {
  none: 'my-0',
  sm: 'my-2',
  md: 'my-4',
  lg: 'my-6',
};
const VERTICAL_SPACING: Record<DividerSpacing, string> = {
  none: 'mx-0',
  sm: 'mx-2',
  md: 'mx-4',
  lg: 'mx-6',
};

// The core ships no CSS reset, so an `<hr>` would keep the browser's auto margins, 2px inset
// border and `overflow: hidden`: each is set explicitly. The line is a 1px border (not a
// background) so it stays visible in forced-colors mode. Boxes are content-box, so the 0-sized
// box plus the 1px border is exactly 1px thick.
const HORIZONTAL_BASE = 'box-content h-0 w-full self-stretch border-0 border-t border-solid border-rop-border p-0';
// `min-h-[1em]`: outside a flex container the line has a real height instead of collapsing to 0.
const VERTICAL_BASE =
  'box-content min-h-[1em] w-0 shrink-0 self-stretch border-0 border-s border-solid border-rop-border p-0';

/**
 * Separator line between blocks of content or inside a toolbar. Horizontal is an `<hr>` (implicit
 * `separator` role); vertical is `role="separator"` with `aria-orientation="vertical"` and takes
 * the height of its flex row (`align-self: stretch`). With `decorative` it is hidden from
 * assistive technology. Not focusable, no interaction.
 */
export const Divider = /* @__PURE__ */ forwardRef<HTMLElement, DividerProps>(function Divider(
  { orientation = 'horizontal', decorative = false, spacing = 'md', className, ...rest },
  ref,
) {
  const vertical = orientation === 'vertical';
  const classes = cn(
    vertical ? VERTICAL_BASE : HORIZONTAL_BASE,
    vertical ? VERTICAL_SPACING[spacing] : HORIZONTAL_SPACING[spacing],
    className,
  );

  if (decorative) {
    return <div {...rest} ref={ref as never} aria-hidden="true" className={classes} />;
  }
  if (vertical) {
    return <div {...rest} ref={ref as never} role="separator" aria-orientation="vertical" className={classes} />;
  }
  return <hr {...rest} ref={ref as never} className={classes} />;
});
