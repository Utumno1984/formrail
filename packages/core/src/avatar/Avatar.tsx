import { forwardRef, useEffect, useLayoutEffect, useRef, useState, type HTMLAttributes } from 'react';
import { cn } from '../utils/cn';
import { getInitials } from './initials';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type AvatarShape = 'circle' | 'square';
/** `idle`: no `src`; `loading`: image requested, initials shown; `loaded`; `error`: initials shown. */
export type AvatarLoadingStatus = 'idle' | 'loading' | 'loaded' | 'error';

// Full literals (Tailwind scan). The box is always exactly this square, whatever the state.
// The library ships no box-sizing reset and a guard forbids one: the root has no padding and no
// border (the contour is an inset outline), so the width/height below are the real outer size.
const SIZE_CLASS: Record<AvatarSize, string> = {
  xs: 'size-6 text-rop-caption',
  sm: 'size-8 text-rop-caption',
  md: 'size-10 text-rop-body',
  lg: 'size-12 text-rop-title-sm',
  xl: 'size-16 text-rop-title-md',
};
const SHAPE_CLASS: Record<AvatarShape, string> = {
  circle: 'rounded-full',
  square: 'rounded-rop-md',
};

const useIsomorphicLayoutEffect = typeof document !== 'undefined' ? useLayoutEffect : useEffect;

const isDev = (): boolean => {
  try {
    return process.env.NODE_ENV !== 'production';
  } catch {
    return true;
  }
};

// Once per page load; the flag lives on the function so the module stays tree-shakable.
function warnNoName(): void {
  const self = warnNoName as typeof warnNoName & { done?: boolean };
  if (self.done) return;
  self.done = true;
  console.error('[formrail] <Avatar> needs a non-blank `name` (its accessible name) or `decorative`; rendering it as decorative.');
}

export interface AvatarProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, 'role' | 'children' | 'aria-label' | 'aria-labelledby'> {
  /** Person or entity name: source of the initials fallback and of the accessible name. */
  name?: string;
  /** Image URL. While it loads, after an error, or when absent, the initials (or generic icon) show. */
  src?: string;
  /** Default `md`. A value outside the union (untyped JS) falls back to `md`. */
  size?: AvatarSize;
  /** Default `circle`. */
  shape?: AvatarShape;
  /** The name is written next to the avatar: no accessible name, `aria-hidden="true"`. */
  decorative?: boolean;
  /** Called with the status on mount and every time it changes. */
  onLoadingStatusChange?: (status: AvatarLoadingStatus) => void;
}

/**
 * Image with initials fallback. The box is a fixed square (per `size`) that never changes between
 * no-src, loading, loaded and error, so the swap causes no layout shift; a changed `src` goes back
 * to the fallback until the new image has loaded (the previous photo is never shown for the new
 * one). Presentational and static; `flex-shrink: 0` keeps it round in narrow flex/table cells.
 */
export const Avatar = /* @__PURE__ */ forwardRef<HTMLSpanElement, AvatarProps>(function Avatar(
  { name, src, size = 'md', shape = 'circle', decorative = false, onLoadingStatusChange, className, ...rest },
  ref,
) {
  const imgRef = useRef<HTMLImageElement>(null);
  const hasSrc = typeof src === 'string' && src !== '';
  // Status is tied to the src it was measured for: when `src` changes the very same render already
  // reports 'loading', so the old photo is never shown for the new src.
  const [result, setResult] = useState<{ src: string | undefined; status: 'loaded' | 'error' }>();
  const status: AvatarLoadingStatus = !hasSrc ? 'idle' : result?.src === src ? result.status : 'loading';

  // An image served from cache (or loaded before hydration) has no pending event: read `complete`.
  // `complete` with no width is left to the events (a dimensionless SVG or a failure).
  useIsomorphicLayoutEffect(() => {
    const img = imgRef.current;
    if (img && hasSrc && img.complete && img.naturalWidth > 0) setResult({ src, status: 'loaded' });
  }, [src, hasSrc]);

  const callback = useRef(onLoadingStatusChange);
  callback.current = onLoadingStatusChange;
  useEffect(() => {
    callback.current?.(status);
  }, [status]);

  const initials = getInitials(name);
  const labelled = !decorative && initials !== '';
  if (!decorative && !labelled && isDev()) warnNoName();
  const sizeClass = Object.prototype.hasOwnProperty.call(SIZE_CLASS, size) ? SIZE_CLASS[size] : SIZE_CLASS.md;
  const shapeClass = Object.prototype.hasOwnProperty.call(SHAPE_CLASS, shape) ? SHAPE_CLASS[shape] : SHAPE_CLASS.circle;
  const a11y = labelled ? { role: 'img', 'aria-label': (name as string).trim() } : { 'aria-hidden': true as const };

  return (
    <span
      {...rest}
      {...a11y}
      ref={ref}
      data-rop-avatar-status={status}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-rop-surface-subtle align-middle font-rop-sans leading-none font-[500] text-rop-text outline-rop-border select-none -outline-offset-1 [outline-style:solid] [outline-width:1px]',
        sizeClass,
        shapeClass,
        className,
      )}
    >
      {status === 'loaded' ? null : initials !== '' ? (
        <span aria-hidden="true" data-rop-avatar-initials="" className="leading-none">
          {initials}
        </span>
      ) : (
        <svg
          aria-hidden="true"
          focusable="false"
          data-rop-avatar-icon=""
          viewBox="0 0 24 24"
          fill="currentColor"
          className="size-3/5 text-rop-text-muted"
        >
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z" />
        </svg>
      )}
      {hasSrc ? (
        <img
          ref={imgRef}
          src={src}
          alt=""
          aria-hidden="true"
          draggable={false}
          data-rop-avatar-image=""
          onLoad={() => setResult({ src, status: 'loaded' })}
          onError={() => setResult({ src, status: 'error' })}
          className={cn('absolute inset-0 h-full w-full max-w-none object-cover', status === 'loaded' ? 'visible' : 'invisible')}
        />
      ) : null}
    </span>
  );
});
