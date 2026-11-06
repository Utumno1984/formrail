import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../utils/cn';

export type TitleLevel = 1 | 2 | 3 | 4 | 5 | 6;
export type TitleSize = 'sm' | 'md' | 'lg';

const SIZE_CLASS: Record<TitleSize, string> = {
  sm: 'text-rop-title-sm',
  md: 'text-rop-title-md',
  lg: 'text-rop-title-lg',
};

// Default visual size per heading level; `size` overrides it (the two are independent).
const DEFAULT_SIZE: Record<TitleLevel, TitleSize> = { 1: 'lg', 2: 'md', 3: 'sm', 4: 'sm', 5: 'sm', 6: 'sm' };

export interface TitleProps extends HTMLAttributes<HTMLHeadingElement> {
  /** Semantic heading level (`<h1>`..`<h6>`). Required: it is document structure, not style. */
  level: TitleLevel;
  /** Visual scale step. Default depends on `level` (1: lg, 2: md, 3-6: sm). */
  size?: TitleSize;
}

/**
 * Heading (`h1`..`h6`) in the design-system type scale. The semantic `level` and the visual `size` are
 * independent: pick the level for the document outline, the size for the look.
 */
export const Title = /* @__PURE__ */ forwardRef<HTMLHeadingElement, TitleProps>(function Title(
  { level, size, className, ...rest },
  ref,
) {
  const Tag = `h${level}` as 'h1';
  return (
    <Tag
      {...rest}
      ref={ref}
      className={cn('m-0 font-rop-sans font-[600]',SIZE_CLASS[size ?? DEFAULT_SIZE[level]], className)}
    />
  );
});
