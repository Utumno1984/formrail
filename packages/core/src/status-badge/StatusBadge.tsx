import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { CapIconSlot } from '../internal/CapIconSlot';
import { hasContent } from '../internal/react-nodes';
import { cn } from '../utils/cn';

export type StatusBadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'error';

// Full literals (Tailwind scan). Every tone keeps the same dark text token on a tinted background
// (the tone at 10% opacity, as in MessageStrip), so the contrast does not depend on the tone colour
// itself (checked in styles/tokens.contrast.test.ts); the tone shows in the 1px contour (also what
// keeps the badge visible in forced-colors mode) and in the icon.
// The library ships no box-sizing reset (boxes are content-box) and a guard forbids one, so the
// root has NO padding and NO border: that way `max-w-full` is the real outer width. The contour is
// an inset contour line (it takes no space; written as arbitrary declarations because the width utility
// would add a style default to the global properties layer, which a guard forbids; the scan reads
// comments too, so no bare utility name here) and the horizontal padding sits on the children.
const TONE_CLASS: Record<StatusBadgeTone, string> = {
  neutral: 'outline-rop-border bg-rop-surface-subtle [&_[data-rop-badge-icon]]:text-rop-text-muted',
  info: 'outline-rop-info bg-rop-info/10 [&_[data-rop-badge-icon]]:text-rop-info',
  success: 'outline-rop-success bg-rop-success/10 [&_[data-rop-badge-icon]]:text-rop-success',
  warning: 'outline-rop-warning bg-rop-warning/10 [&_[data-rop-badge-icon]]:text-rop-warning',
  error: 'outline-rop-error bg-rop-error/10 [&_[data-rop-badge-icon]]:text-rop-error',
};

// Optical (not geometric) correction for the `warning` tone, whose conventional icon is an
// apex-up triangle. Like every icon of the system, the badge icon box is centred on the cap height
// (`CapIconSlot`, baseline - 0.5cap); for the round icons of the other tones that box centre is
// also where the eye puts the shape, so they are left exactly there. A triangle is not
// symmetric top to bottom: its weight (the base, plus the exclamation mark) sits low, and its area
// centroid lies 1/6 of the triangle's height below the triangle's centre; on the 24-unit grid the
// centroid is at y=14.5, ~2.5/24 (about 0.10) of the icon size below the box centre. Centred geometrically, it reads as sitting low against
// the text. It is moved up by 4% of its own height, about a third of that gap: a full shift makes
// the base float above the baseline (checked on rendered screenshots, 0.04/0.06 of the icon size
// compared side by side). A percentage of the icon's own box, not a px or em value, so the
// correction stays proportional to the shape whatever the icon size token resolves to.
// Deliberately diverges from the 0.5cap convention; scoped to StatusBadge only, the shared icon
// set and CapIconSlot stay geometric.
const WARNING_ICON_OPTICAL_SHIFT = '[&_svg]:[translate:0_-4%]';

// Bundlers replace `process.env.NODE_ENV` in consumer builds; without `process` assume development.
const isDev = (): boolean => {
  try {
    return process.env.NODE_ENV !== 'production';
  } catch {
    return true;
  }
};

// Library code cannot tell dev from prod reliably, so the misuse warning is emitted once per page
// load. The flag lives on the function (not in a module-level `let`) so that the module stays
// fully tree-shakable: a module-level mutable binding is kept in every bundle that imports it.
function warnEmpty(): void {
  const self = warnEmpty as typeof warnEmpty & { done?: boolean };
  if (self.done) return;
  self.done = true;
  console.warn('[react-object-page] <StatusBadge> needs text children (colour alone does not carry the status); rendering nothing.');
}

export interface StatusBadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'role' | 'children'> {
  /**
   * Default `neutral`. A value outside the union (untyped JS) falls back to `neutral`. `warning`
   * also nudges an `<svg>` icon up by 4% of its height (see `icon`).
   */
  tone?: StatusBadgeTone;
  /**
   * Decorative icon before the text (an SVG, sized to the `xs` step of the icon scale). It is
   * hidden from assistive technology: the status is always carried by the text.
   *
   * With `tone="warning"` the icon is moved up by 4% of its height (optical correction for the
   * apex-up triangle). The shift applies to `<svg>` children only (also nested ones); non-SVG icons
   * (`img`, icon fonts) are not moved, and a round icon with `tone="warning"` is moved by about
   * 0.5px.
   */
  icon?: ReactNode;
  /**
   * The status text. Required: the meaning must not depend on the colour. Without any content
   * (`null`, `false`, blank string, empty fragment) nothing is rendered, and in development a
   * single warning is logged.
   */
  children: ReactNode;
}

/**
 * Record status label: tone + text, presentational and static (no live role, so mounting a list of
 * rows does not make a screen reader announce every badge). It is a one-line inline box no taller
 * than a `body` text line; text too long for its container is cut with an ellipsis (the whole text
 * stays in the DOM). Wrap it in `TruncatedText` if you want a tooltip.
 *
 * Like every box of the library it is `content-box` (no box-sizing reset) and its root has no
 * padding or border, so `max-width: 100%` is its real outer width. A `className` that adds padding
 * or a border to the root pushes it past that limit: also pass a box-sizing utility, or space it
 * with a margin or a wrapper instead.
 */
export const StatusBadge = /* @__PURE__ */ forwardRef<HTMLSpanElement, StatusBadgeProps>(function StatusBadge(
  { tone = 'neutral', icon, className, children, ...rest },
  ref,
) {
  if (!hasContent(children)) {
    if (isDev()) warnEmpty();
    return null;
  }
  const resolvedTone: StatusBadgeTone = Object.prototype.hasOwnProperty.call(TONE_CLASS, tone) ? tone : 'neutral';
  const toneClass = TONE_CLASS[resolvedTone];

  return (
    <span
      {...rest}
      ref={ref}
      className={cn(
        'inline-flex max-w-full min-w-0 items-center rounded-rop-sm py-px align-middle font-rop-sans text-rop-caption font-[500] text-rop-text -outline-offset-1 [outline-style:solid] [outline-width:1px]',
        toneClass,
        className,
      )}
    >
      {/* Centred on the cap height of the text (`CapIconSlot`): the slot is one caption line tall. */}
      {icon ? (
        <CapIconSlot
          aria-hidden="true"
          data-rop-badge-icon=""
          className={cn('ml-1.5 [&_svg]:size-(--icon-rop-xs)', resolvedTone === 'warning' && WARNING_ICON_OPTICAL_SHIFT)}
        >
          {icon}
        </CapIconSlot>
      ) : null}
      <span className={cn('min-w-0 truncate pr-1.5', icon ? 'pl-1' : 'pl-1.5')}>{children}</span>
    </span>
  );
});
