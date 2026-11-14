import { createContext, forwardRef, useContext, useMemo, type HTMLAttributes, type ReactNode } from 'react';
import { hasContent } from '../internal/react-nodes';
import { cn } from '../utils/cn';
import { DETAILS, ITEM_CLASS, LIST, SUMMARY_ITEM, TERM } from './description-list-styles';

export type DescriptionListLayout = 'auto' | 'inline' | 'stacked';
export type DescriptionListItemVariant = 'default' | 'summary';

const DEFAULT_EMPTY_LABEL = 'Not specified';
const DEFAULT_EMPTY_PLACEHOLDER = '—';

// Bundlers replace `process.env.NODE_ENV` in consumer builds; without `process` assume development.
const isDev = (): boolean => {
  try {
    return process.env.NODE_ENV !== 'production';
  } catch {
    return true;
  }
};

interface DescriptionListContextValue {
  layout: DescriptionListLayout;
  emptyLabel: string;
  emptyPlaceholder: ReactNode;
}

const DescriptionListContext = /* @__PURE__ */ createContext<DescriptionListContextValue | null>(null);

export interface DescriptionListProps extends HTMLAttributes<HTMLDListElement> {
  /**
   * `inline`: value to the side of the label, in one shared column. `stacked`: value under the
   * label. `auto` (default): decided by a CSS container query on the content width of the `<dl>`
   * itself (so a `className`/`style` that changes its width is taken into account; padding would
   * too, but see the note on padding below),
   * not of the window: inline from `--container-rop-description-list` (24rem) up, stacked below
   * it (a container exactly at the threshold is inline; the query is a plain `min-width`, so
   * there is no flicker around it). No JavaScript measures anything and there is no transition:
   * the switch is instantaneous.
   *
   * The threshold is a Tailwind theme token, but a container query condition cannot use `var()`:
   * Tailwind writes its value into the compiled CSS. Change it by redefining
   * `--container-rop-description-list` in the `@theme` of your own Tailwind build (the `theme.css`
   * mode); overriding the variable at runtime, or on top of the precompiled `styles.css`, has no
   * effect. Use `layout="inline"` / `"stacked"` to decide yourself.
   *
   * This is the only control over the columns: do not pass `grid-cols-*` classes to the list or to
   * an item (a variant-qualified rule of the component, e.g. the `auto` inline one, would still win
   * above the threshold). Inline mode needs CSS subgrid (Chrome 117, Firefox 71, Safari 16); on an
   * older browser the value stays under its label.
   */
  layout?: DescriptionListLayout;
  /** Visually hidden text read in place of an empty value. Default (English): "Not specified". */
  emptyLabel?: string;
  /** Visible stand-in for an empty value (hidden from assistive technology). Default `—`. */
  emptyPlaceholder?: ReactNode;
}

/**
 * Read-only key/value pairs: a semantic `<dl>` of `DescriptionListItem`s. `className`, `style` and
 * `ref` go to the `<dl>`, which is also the size container `auto` measures.
 *
 * Sizing: the list fills the width of its parent. A container-query element has no intrinsic
 * width, so give a shrink-to-fit parent (auto-width table cell, `inline-block`,
 * `width: fit-content`) a real width; without one the list falls back to a minimum of 8rem and is
 * stacked. Below 8rem of available width it overflows rather than shrinks. Like every box of the
 * library it is `content-box` (no box-sizing reset): put padding on a parent, not on the list
 * (`width: 100%` plus padding would stick out of the parent). Empty values (`null`, `undefined`, `false`, `''`, an empty fragment or array) show a
 * placeholder; `0` and `NaN` are values.
 */
export const DescriptionList = /* @__PURE__ */ forwardRef<HTMLDListElement, DescriptionListProps>(
  function DescriptionList(
    {
      layout = 'auto',
      emptyLabel = DEFAULT_EMPTY_LABEL,
      emptyPlaceholder = DEFAULT_EMPTY_PLACEHOLDER,
      className,
      ...rest
    },
    ref,
  ) {
    const context = useMemo(() => ({ layout, emptyLabel, emptyPlaceholder }), [layout, emptyLabel, emptyPlaceholder]);
    return (
      <DescriptionListContext.Provider value={context}>
        <dl {...rest} ref={ref} className={cn(LIST, className)} />
      </DescriptionListContext.Provider>
    );
  },
);

export interface DescriptionListItemProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** The term (`<dt>`). A string or a node (e.g. with an icon). */
  label: ReactNode;
  /** The value (`<dd>`): any node. Empty values render the list's placeholder. */
  children?: ReactNode;
  /** Overrides the list's `emptyLabel` for this item. */
  emptyLabel?: string;
  /**
   * `summary`: a row of totals, emphasised (semibold, tabular figures) with one separator above
   * the first item of each consecutive run of summaries (none if it is the first item of the list).
   * Same value column as the other items. The separator keys on the previous sibling: a hand-written
   * non-item element between an item and a summary removes it, and a `hidden` normal item inside a
   * run of summaries adds one. To drop the separator of one item use the important modifier
   * (`className="border-0! pt-0!"`): the rule is a sibling-dependent variant, which a plain
   * `border-0` does not beat. An unknown value acts as `default`.
   * @default 'default'
   */
  variant?: DescriptionListItemVariant;
}

/** One term/value pair. Must be a child of `DescriptionList` (throws in development otherwise). */
export const DescriptionListItem = /* @__PURE__ */ forwardRef<HTMLDivElement, DescriptionListItemProps>(
  function DescriptionListItem({ label, children, emptyLabel, variant, className, ...rest }, ref) {
    const context = useContext(DescriptionListContext);
    if (!context && isDev()) {
      throw new Error('[formrail] <DescriptionListItem> must be rendered inside a <DescriptionList>.');
    }
    const filled = hasContent(children);
    const summary = variant === 'summary';
    return (
      <div
        {...rest}
        ref={ref}
        {...(summary ? { 'data-rop-summary': '' } : null)}
        className={cn(ITEM_CLASS[context?.layout ?? 'auto'], summary && SUMMARY_ITEM, className)}
      >
        <dt className={TERM}>{label}</dt>
        <dd className={DETAILS}>
          {filled ? (
            children
          ) : (
            <>
              <span aria-hidden="true">{context?.emptyPlaceholder ?? DEFAULT_EMPTY_PLACEHOLDER}</span>
              <span className="sr-only">{emptyLabel ?? context?.emptyLabel ?? DEFAULT_EMPTY_LABEL}</span>
            </>
          )}
        </dd>
      </div>
    );
  },
);
