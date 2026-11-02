import type { ReactNode } from 'react';
import { cn } from './cn';

/** Label typography for a plain-text label wrapped in `OpticalLabel`: size from the token, line-height 1. */
export const OPTICAL_LABEL_TYPOGRAPHY = 'text-[length:var(--text-rop-label)] leading-none';

/**
 * Optical correction shared by Button and the filter-bar pill: the system font stack sits ~1px low
 * in its line box, so only the text node moves up 1px (`-top-px`). `line-height: 1` is compensated
 * by `min-h-5`, which restores the 20px line box the host's height is tuned for, so the host's
 * box never changes. Never apply it to the host box or to icons.
 */
export function OpticalLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('relative -top-px grid min-h-5 min-w-0 content-center', className)}>{children}</span>;
}
