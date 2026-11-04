import { forwardRef, useEffect, useId, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { isDev } from '../internal/is-dev';
import { cn } from '../utils/cn';

export type ProgressBarTone = 'primary' | 'success' | 'error';

// Full literals (Tailwind scan). Only existing colour tokens.
const TONE_CLASS: Record<ProgressBarTone, string> = {
  primary: 'bg-rop-primary',
  success: 'bg-rop-success',
  error: 'bg-rop-error',
};

export interface ProgressBarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'role' | 'children'> {
  /**
   * Current value between `min` and `max`. `null` / `undefined` / `NaN` mean "indeterminate": no
   * `aria-valuenow` is exposed. A value outside the range is clamped (and warned about in development).
   */
  value?: number | null;
  /** Default 0. */
  min?: number;
  /** Default 100. Must be greater than `min` (otherwise the bar is rendered indeterminate and an error is logged in development). */
  max?: number;
  /**
   * Text for `aria-valuetext` (determinate only). Default: the rounded percentage of the range, e.g.
   * "45%". `min` is passed as the third argument.
   */
  getValueLabel?: (value: number, max: number, min: number) => string;
  /** Default `primary`. */
  tone?: ProgressBarTone;
  /**
   * Optional visible label, linked to the bar with `aria-labelledby`. When present the bar is wrapped
   * in a block with the label above it; `className`, `ref` and every other attribute still go to the
   * `progressbar` element itself.
   */
  label?: ReactNode;
}

const defaultValueLabel = (value: number, max: number, min: number): string =>
  `${Math.round(((value - min) / (max - min)) * 100)}%`;

/**
 * Progress bar (`role="progressbar"`), determinate or indeterminate. It is NOT a live region: the
 * value is read by navigating to it, and the consumer announces completion (Toast / MessageStrip).
 * The fill is scaled horizontally with scaleX (no layout), only under `motion-safe:`. A name is
 * required: `aria-label`, `aria-labelledby` or `label`.
 */
export const ProgressBar = /* @__PURE__ */ forwardRef<HTMLDivElement, ProgressBarProps>(function ProgressBar(
  {
    value,
    min = 0,
    max = 100,
    getValueLabel = defaultValueLabel,
    tone = 'primary',
    label,
    className,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
    ...rest
  },
  ref,
) {
  const labelId = useId();
  const validRange = Number.isFinite(min) && Number.isFinite(max) && max > min;
  const hasValue = typeof value === 'number' && !Number.isNaN(value);
  const determinate = validRange && hasValue;
  const clamped = determinate ? Math.min(max, Math.max(min, value)) : null;
  const hasLabel = label !== undefined && label !== null && label !== false;
  const hasName = ariaLabel !== undefined || ariaLabelledby !== undefined || hasLabel;

  useEffect(() => {
    if (isDev() && !hasName) {
      console.error('[react-object-page] <ProgressBar> has no accessible name: pass aria-label, aria-labelledby or label.');
    }
  }, [hasName]);
  useEffect(() => {
    if (isDev() && !validRange) {
      console.error(`[react-object-page] <ProgressBar> needs max > min (got min=${min}, max=${max}): rendered indeterminate.`);
    }
  }, [validRange, min, max]);
  useEffect(() => {
    if (isDev() && determinate && clamped !== value) {
      console.warn(`[react-object-page] <ProgressBar> value ${value} is outside [${min}, ${max}]: clamped to ${clamped}.`);
    }
  }, [determinate, clamped, value, min, max]);

  const bar = (
    <div
      {...rest}
      ref={ref}
      role="progressbar"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby ?? (hasLabel ? labelId : undefined)}
      aria-valuemin={determinate ? min : undefined}
      aria-valuemax={determinate ? max : undefined}
      aria-valuenow={clamped ?? undefined}
      aria-valuetext={clamped === null ? undefined : getValueLabel(clamped, max, min)}
      className={cn(
        // Fixed height in every state; the contour keeps the track visible in forced-colors mode.
        'relative block h-2 w-full min-w-0 overflow-hidden rounded-full bg-rop-border forced-colors:[outline-style:solid] forced-colors:[outline-width:1px] forced-colors:[outline-color:CanvasText]',
        className,
      )}
    >
      {clamped === null ? (
        // A different element from the determinate fill: switching to a value mounts the fill
        // already at its position, so it never animates from a fictitious value.
        <div
          key="indeterminate"
          data-rop-progress-fill="indeterminate"
          className={cn(
            'absolute inset-y-0 start-0 w-2/5 rounded-full forced-colors:bg-[Highlight]',
            TONE_CLASS[tone],
            // Stripes tell the static (reduced-motion) state apart from a determinate 40%.
            '[background-image:repeating-linear-gradient(45deg,transparent_0_4px,var(--color-rop-surface)_4px_6px)]',
            'motion-safe:animate-rop-progress-indeterminate',
          )}
        />
      ) : (
        <div
          key="determinate"
          data-rop-progress-fill="determinate"
          className={cn(
            // No rounded corners: scaleX would squash them (the track clips the outer edge).
            // The scaling origin has no logical form (RTL is not guaranteed, spec 1.13.4): it is the left edge.
            'absolute inset-0 origin-left forced-colors:bg-[Highlight]',
            TONE_CLASS[tone],
            // The fraction is a custom property and the scaling is an arbitrary property: neither the
            // bare utility nor a style key of that name appears in the sources (the Tailwind scan would
            // turn it into a global rule).
            '[transform:scaleX(var(--rop-progress-fraction))] motion-safe:[transition-property:transform] motion-safe:duration-[var(--motion-rop-feedback-duration)] motion-safe:ease-[var(--motion-rop-feedback-easing)]',
          )}
          style={{ '--rop-progress-fraction': (clamped - min) / (max - min) } as CSSProperties}
        />
      )}
    </div>
  );

  if (!hasLabel) return bar;
  return (
    <div className="flex min-w-0 flex-col gap-1 font-rop-sans text-rop-body text-rop-text">
      <span id={labelId}>{label}</span>
      {bar}
    </div>
  );
});
