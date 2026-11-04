import { forwardRef, type CSSProperties, type HTMLAttributes } from 'react';
import { cn } from '../utils/cn';

export type SkeletonVariant = 'text' | 'rect' | 'circle';

/** Typographic steps a `text` skeleton can stand in for (the `Text` and `Title` scale). */
export type SkeletonTextVariant = 'body' | 'caption' | 'label' | 'title-sm' | 'title-md' | 'title-lg';

// Full literals (Tailwind scan). The line box is exactly the line-height token of the step it
// replaces, so swapping the skeleton for the real text does not move the layout.
const LINE_HEIGHT_CLASS: Record<SkeletonTextVariant, string> = {
  body: 'h-[var(--text-rop-body--line-height)]',
  caption: 'h-[var(--text-rop-caption--line-height)]',
  label: 'h-[var(--text-rop-label--line-height)]',
  'title-sm': 'h-[var(--text-rop-title-sm--line-height)]',
  'title-md': 'h-[var(--text-rop-title-md--line-height)]',
  'title-lg': 'h-[var(--text-rop-title-lg--line-height)]',
};

export interface SkeletonProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'role' | 'tabIndex'> {
  /** Default `text`. */
  variant?: SkeletonVariant;
  /** `text` only: the typographic step whose line height each line takes. Default `body`. */
  textVariant?: SkeletonTextVariant;
  /**
   * `text` only: number of lines (default 1); the last one is shorter. Fractions are rounded down;
   * `0`, a negative or a non-finite value renders nothing (no node, `ref` stays null).
   */
  lines?: number;
  /**
   * Number (px) or CSS length. `text`: width of the block (default 100% of the container, capped by
   * `max-width: 100%`). `rect`: default 100%. `circle`: the diameter (falls back to `height`, then 40px).
   * A percentage never collapses to 0 inside a shrink-to-fit parent: the minimum width is 1rem.
   */
  width?: number | string;
  /** `rect`: default 4rem. `circle`: used as the diameter when `width` is missing. Ignored by `text`. */
  height?: number | string;
}

const toCss = (v: number | string): string => (typeof v === 'number' ? `${v}px` : v);
const isPercent = (v: number | string | undefined): boolean => typeof v === 'string' && v.trim().endsWith('%');

// Colour from an existing token; the contour keeps the shape visible in forced-colors mode.
const BAR =
  'bg-rop-border motion-safe:animate-rop-skeleton-pulse forced-colors:[outline:1px_solid_CanvasText]';

/**
 * Decorative loading placeholder (text, rectangle, circle). It is ALWAYS `aria-hidden="true"`,
 * has no role and is not focusable: it must not carry the loading state. Communicate loading on
 * the container (`aria-busy="true"`) or with a Spinner / visible text, then swap the skeleton for
 * the real content. A `text` skeleton is as tall as the line of text it replaces. The pulse is a
 * single CSS animation driven by `--motion-rop-skeleton-*` tokens, applied only under
 * `motion-safe:` (none with `prefers-reduced-motion`).
 */
export const Skeleton = /* @__PURE__ */ forwardRef<HTMLDivElement, SkeletonProps>(function Skeleton(
  { variant = 'text', textVariant = 'body', lines = 1, width, height, className, style, ...rest },
  ref,
) {
  if (variant === 'text') {
    const count = Number.isFinite(lines) ? Math.floor(lines) : 0;
    if (count < 1) return null;
    const rootStyle: CSSProperties = {
      ...style,
      width: width === undefined ? undefined : toCss(width),
      minWidth: isPercent(width) ? '1rem' : undefined,
    };
    return (
      <div
        {...rest}
        aria-hidden="true"
        ref={ref}
        data-rop-skeleton="text"
        className={cn('flex w-full min-w-0 max-w-full flex-col', className)}
        style={rootStyle}
      >
        {Array.from({ length: count }, (_, i) => (
          <div
            key={i}
            data-rop-skeleton-line=""
            className={cn(
              'flex shrink-0 items-center',
              LINE_HEIGHT_CLASS[textVariant],
              count > 1 && i === count - 1 && 'w-3/5',
            )}
          >
            <div className={cn('h-[0.7em] w-full rounded-[2px] text-rop-body', BAR)} />
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'circle') {
    const size = width ?? height ?? 40;
    return (
      <div
        {...rest}
        aria-hidden="true"
        ref={ref}
        data-rop-skeleton="circle"
        className={cn('inline-block shrink-0 rounded-full align-middle', BAR, className)}
        style={{ ...style, width: toCss(size), height: toCss(size), minWidth: isPercent(size) ? '1rem' : undefined }}
      />
    );
  }

  const rectWidth = width ?? '100%';
  return (
    <div
      {...rest}
      aria-hidden="true"
      ref={ref}
      data-rop-skeleton="rect"
      className={cn('block max-w-full rounded-[4px]', BAR, className)}
      style={{
        ...style,
        width: toCss(rectWidth),
        height: toCss(height ?? '4rem'),
        minWidth: isPercent(rectWidth) ? '1rem' : undefined,
      }}
    />
  );
});
