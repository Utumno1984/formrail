import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn, Text } from '@formrail/core';
import {
  DEFAULT_VALUE_LABELS,
  distinctValueTexts,
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
   *
   * Delegate with `formatChangeValue(value, { precise: true })` for the values you do not handle:
   * the compact rendering gives `No value` for both `null` and `undefined`, so `null` → `undefined`
   * would read `from No value to No value`. `precise` also quotes strings and adds the time to dates.
   *
   * A missing key arrives as `undefined`. On `undefined` against a missing key both calls get the
   * same arguments (`undefined` and the same entry), so `entry.beforeMissing` /
   * `entry.afterMissing` do not tell which side is being rendered, and a delegate shows `Undefined`
   * on both. The default rendering has no such limit: to keep it, leave `renderValue` unset or
   * build your own list on `useChangeSummary`.
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

// Component classes of pro's styles.css (src/styles/index.css), never Tailwind utilities: a utility
// emitted by both pro and core collides by source order (see the header of that file). Nothing here
// is animated. Plain literals at module level (a template literal there is not tree-shaken).
const CS = 'rop-pro-change-summary';
const KIND_CLASS: Record<ChangeKind, string> = {
  added: 'rop-pro-change-summary__kind--added',
  removed: 'rop-pro-change-summary__kind--removed',
  changed: 'rop-pro-change-summary__kind--changed',
};

/**
 * A comma for assistive technology only, in the middle of a line of text. It stays `display:
 * inline` (an absolutely positioned `sr-only` box is a block for the accessibility tree, which
 * would split `Amount` and `,`) and takes no room (`font-size: 0`).
 */
function Pause() {
  return <span className={`${CS}__pause`}>{', '}</span>;
}

/** Text that carries meaning for assistive technology only. */
function Hidden({ children }: { children: ReactNode }) {
  return <span className={`${CS}__hidden`}>{children}</span>;
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

  const side = (value: unknown, missing: boolean, level: FormatLevel): string =>
    missing && level > 0 ? labels.missingValue : text(value, level);

  const show = (value: unknown, entry: ChangeEntry, shown?: string): ReactNode => {
    if (renderValue) return renderValue(value, entry);
    return (
      <span
        className={cn(`${CS}__value`, isMutedValue(value) && `${CS}__value--muted`)}
      >
        {shown ?? text(value, 0)}
      </span>
    );
  };

  /**
   * Default texts of both sides of a `changed`, more and more precise while they would look the
   * same: precise (`null`, `undefined` and a missing key get their own texts), ISO dates, then the
   * contents written out (`["a", "b"]` / `["a", "c"]`). If even that matches (two class instances,
   * a difference past the truncation), the after side says so.
   */
  const pair = (entry: ChangeEntry): [string, string] =>
    distinctValueTexts(
      (which, level) => (which === 0 ? side(entry.before, entry.beforeMissing, level) : side(entry.after, entry.afterMissing, level)),
      labels.contentsDiffer,
    );

  return (
    <div
      {...rest}
      ref={ref}
      // A core utility in `className` (`p-0`) wins over the component's default, whatever the import
      // order: core's utilities sit directly in `rop.utilities`, pro's rules in `rop.utilities.pro`.
      className={cn(CS, className)}
    >
      {entries.length === 0 ? (
        <Text className={`${CS}__empty`}>{emptyLabel}</Text>
      ) : (
        <ul aria-label={label} className={`${CS}__list`}>
          {entries.map((entry) => {
            const [beforeText, afterText] = entry.kind === 'changed' && !renderValue ? pair(entry) : [undefined, undefined];
            return (
              <li
                // path + kind: an `added` and a `removed` array item can share one path (the index
                // in `values` against the index in the baseline), the path alone is not unique.
                key={`${entry.kind}:${entry.path}`}
                className={`${CS}__item`}
              >
                {/* One inline flow (no flex): the hidden commas stay glued to the words they follow in
                    the text read by assistive technology (`Amount, changed, from ...`). */}
                <span className={`${CS}__head`}>
                  <span className={`${CS}__label`}>{entry.label}</span>
                  <Pause />
                  <span className={`${CS}__kind ${KIND_CLASS[entry.kind]}`}>
                    {labels[entry.kind]}
                  </span>
                  <Pause />
                </span>
                {entry.kind === 'changed' ? (
                  // Stacked on a narrow container, one row from `@md` up (`__values` in the CSS).
                  <span className={`${CS}__values`}>
                    <Hidden>{`${labels.from} `}</Hidden>
                    <span className={`${CS}__before`}>{show(entry.before, entry, beforeText)}</span>
                    <span aria-hidden="true" className={`${CS}__arrow`}>
                      ↓
                    </span>
                    <Hidden>{` ${labels.to} `}</Hidden>
                    <span className={`${CS}__after`}>{show(entry.after, entry, afterText)}</span>
                  </span>
                ) : (
                  <span className={`${CS}__single`}>
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

function definedOnly(labels: Partial<ChangeSummaryValueLabels> | undefined): Partial<ChangeSummaryValueLabels> {
  const out: Partial<ChangeSummaryValueLabels> = {};
  if (!labels) return out;
  for (const key of Object.keys(labels) as (keyof ChangeSummaryValueLabels)[]) {
    if (labels[key] !== undefined) (out as Record<string, unknown>)[key] = labels[key];
  }
  return out;
}
