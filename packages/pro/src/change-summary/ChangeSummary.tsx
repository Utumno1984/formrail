import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn, Text } from '@react-object-page/core';
import {
  DEFAULT_VALUE_LABELS,
  formatChangeValueAt,
  isMutedValue,
  type ChangeSummaryValueLabels,
  type FormatChangeValueOptions,
  type FormatLevel,
} from './format-change-value';
import type { ChangeEntry, ChangeKind } from './types';

export interface ChangeSummaryProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** The changes to show, typically `useChangeSummary().entries`. Shown in this order. */
  entries: ChangeEntry[];
  /**
   * Replaces the default text of a value. Called once for every value that is shown, with the
   * value and its entry; never for the absent side of an `added` / `removed` entry. Returning
   * `null` leaves the value empty (the label and the kind of change stay). An exception thrown
   * here propagates to the caller (it is not caught): wrap the call if it can fail.
   * Delegate to `formatChangeValue` for the values you do not handle.
   */
  renderValue?: (value: unknown, entry: ChangeEntry) => ReactNode;
  /** Text shown when `entries` is empty. Default `No changes`. */
  emptyLabel?: string;
  /** Accessible name of the list. Default `Changes`. */
  label?: string;
  /** BCP 47 locale of the default number and date formatting. Default: the runtime locale. */
  locale?: string;
  /** IANA time zone of the default date formatting. Default: the runtime time zone. */
  timeZone?: string;
  /** Overrides of the default texts (`Yes`, `No`, `Added`, ...). */
  valueLabels?: Partial<ChangeSummaryValueLabels>;
}

// Full literals (Tailwind scan). Nothing here is animated.
const KIND_CLASS: Record<ChangeKind, string> = {
  added: 'text-rop-success',
  removed: 'text-rop-error',
  changed: 'text-rop-primary',
};

/** Text that carries meaning for assistive technology only. */
function Hidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}

/**
 * "What changed" summary of an Object Page before saving: an accessible list of `ChangeEntry`
 * (from `useChangeSummary`). Each item reads like `Amount, changed, from 100 to 120`: the kind of
 * change is visible text (never only a colour), the old value is also struck through. It is
 * static: no live region, a summary that changes at every keystroke is not announced.
 *
 * Presentation is opinionated but replaceable: pass `renderValue` for a custom value rendering, or
 * build your own list on top of `useChangeSummary`.
 */
export const ChangeSummary = /* @__PURE__ */ forwardRef<HTMLDivElement, ChangeSummaryProps>(function ChangeSummary(
  { entries, renderValue, emptyLabel = 'No changes', label = 'Changes', locale, timeZone, valueLabels, className, ...rest },
  ref,
) {
  const format: FormatChangeValueOptions = { locale, timeZone, labels: valueLabels };
  const labels = { ...DEFAULT_VALUE_LABELS, ...definedOnly(valueLabels) };

  const text = (value: unknown, level: FormatLevel): string => formatChangeValueAt(value, format, level);

  const show = (value: unknown, entry: ChangeEntry, shown?: string): ReactNode => {
    if (renderValue) return renderValue(value, entry);
    return (
      <span
        className={cn(
          'min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]',
          isMutedValue(value) && 'text-rop-text-muted italic',
        )}
      >
        {shown ?? text(value, 0)}
      </span>
    );
  };

  /** Default texts of both sides of a `changed`; precise when they would look the same. */
  const pair = (entry: ChangeEntry): [string, string] => {
    for (const level of [0, 1, 2] as const) {
      const before = text(entry.before, level);
      const after = text(entry.after, level);
      // Whitespace-insensitive: 'abc ' and 'abc' print differently but look the same.
      if (looks(before) !== looks(after) || level === 2) return [before, after];
    }
    return ['', ''];
  };

  return (
    <div
      {...rest}
      ref={ref}
      className={cn(
        '@container min-w-0 rounded-rop-md bg-rop-surface p-4 font-rop-sans text-rop-body text-rop-text [border:1px_solid_var(--color-rop-border)]',
        className,
      )}
    >
      {entries.length === 0 ? (
        <Text className="text-rop-text-muted">{emptyLabel}</Text>
      ) : (
        <ul aria-label={label} className="m-0 flex list-none flex-col gap-3 p-0">
          {entries.map((entry) => {
            const [beforeText, afterText] = entry.kind === 'changed' && !renderValue ? pair(entry) : [undefined, undefined];
            return (
              <li
                key={entry.path}
                className="flex min-w-0 flex-col gap-1 [&:not(:first-child)]:pt-3 [&:not(:first-child)]:[border-top:1px_solid_var(--color-rop-border)]"
              >
                <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                  <span className="min-w-0 font-[500] [overflow-wrap:anywhere]">{entry.label}</span>
                  <Hidden>{', '}</Hidden>
                  <span
                    className={cn(
                      'text-rop-caption px-1 first-letter:uppercase [outline:1px_solid_currentColor] [outline-offset:-1px]',
                      KIND_CLASS[entry.kind],
                    )}
                  >
                    {labels[entry.kind]}
                  </span>
                  <Hidden>{', '}</Hidden>
                </span>
                {entry.kind === 'changed' ? (
                  <span className="flex min-w-0 flex-col gap-1 @md:flex-row @md:items-baseline @md:gap-2">
                    <Hidden>{`${labels.from} `}</Hidden>
                    <span className="min-w-0 text-rop-text-muted line-through">{show(entry.before, entry, beforeText)}</span>
                    <span aria-hidden="true" className="text-rop-text-muted @md:-rotate-90">
                      ↓
                    </span>
                    <Hidden>{` ${labels.to} `}</Hidden>
                    <span className="min-w-0">{show(entry.after, entry, afterText)}</span>
                  </span>
                ) : (
                  <span className="flex min-w-0 flex-col">
                    {entry.kind === 'added' ? show(entry.after, entry) : show(entry.before, entry)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
});

/** What a reader sees: leading, trailing and repeated white space is not noticeable. */
const looks = (text: string): string => text.replace(/\s+/g, ' ').trim();

function definedOnly(labels: Partial<ChangeSummaryValueLabels> | undefined): Partial<ChangeSummaryValueLabels> {
  const out: Partial<ChangeSummaryValueLabels> = {};
  if (!labels) return out;
  for (const key of Object.keys(labels) as (keyof ChangeSummaryValueLabels)[]) {
    if (labels[key] !== undefined) (out as Record<string, unknown>)[key] = labels[key];
  }
  return out;
}
