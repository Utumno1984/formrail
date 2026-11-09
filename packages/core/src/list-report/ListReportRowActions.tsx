import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Button } from '../button/Button';
import { moreIcon } from '../internal/icons';
import { isDev } from '../internal/is-dev';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../menu/Menu';
import { Tooltip } from '../tooltip/Tooltip';
import { cn } from '../utils/cn';
import { keepFocusInTable, tableContainerOf } from './keep-focus-in-table';
import {
  rowActionsBodyCellClass,
  rowActionsInlineDangerClass,
  rowActionsInlineIconClass,
  rowActionsItemIconClass,
  rowActionsItemLabelClass,
  rowActionsNarrowClass,
  rowActionsTriggerSlotClass,
  rowActionsWideClass,
  selectBoxClass,
} from './list-report-table-styles';
import type { ListReportRowAction, ListReportRowActionContext } from './types';

/** @internal Props of {@link ListReportRowActionsCell}. */
export interface ListReportRowActionsCellProps {
  /** What `rowActions(row)` returned for the row. Empty: an empty cell (the column keeps its width). */
  actions: readonly ListReportRowAction[];
  /** Accessible name of the trigger (`labels.rowActions(rowLabel)`). */
  triggerLabel: string;
  /**
   * How many actions with an `icon` are inline buttons in the wide form (`rowActionsInline`, already a
   * whole number ≥ 0). `0` (default): the menu alone, the cell of #362 exactly.
   */
  inline?: number;
  /** Accessible name of the inline button of an action, from its label (`labels.rowAction(label, rowLabel)`). */
  inlineLabel?: (actionLabel: string) => string;
}

/**
 * Whether the element is laid out (not under `display: none`, the hidden form of the cell). Where
 * `checkVisibility` is missing the rendered boxes say it; an environment without layout (no boxes at
 * all) gives `false` for everything, which the callers below treat as "keep what was used".
 */
const isRendered = (el: Element): boolean =>
  typeof el.checkVisibility === 'function' ? el.checkVisibility() : el.getClientRects().length > 0;

/** The first control of the cell that is laid out: the first inline button, or the trigger, of the visible form. */
const firstRenderedControl = (cell: Element | null | undefined): HTMLElement | null =>
  cell ? ([...cell.querySelectorAll<HTMLElement>('button')].find(isRendered) ?? null) : null;

/**
 * The `returnFocusRef` given to `onSelect` by one control of the cell (an inline button or a trigger):
 * the control itself while it is in the document and laid out; the visible control of the same cell
 * when the form changed in the meantime (the control is now under `display: none` and cannot take the
 * focus); the table's scroll container once the control is gone (the action deleted its row, e.g.
 * after `await confirm(…)`). Read when the focus is returned, not when the action runs: dialogs read
 * `returnFocusRef.current` after their exit, which can be well after the row went away.
 */
function useControlReturnFocus() {
  const nodeRef = useRef<HTMLElement | null>(null);
  // The table's scroll container, taken while the control is in the document.
  const containerRef = useRef<HTMLElement | null>(null);
  const setNode = useCallback((node: HTMLElement | null) => {
    nodeRef.current = node;
    if (node) containerRef.current = tableContainerOf(node);
  }, []);
  const context = useMemo<ListReportRowActionContext>(() => {
    const returnFocusRef: RefObject<HTMLElement | null> = {
      get current() {
        const node = nodeRef.current;
        if (!node || !node.isConnected) return containerRef.current;
        if (isRendered(node)) return node;
        return firstRenderedControl(node.closest('td')) ?? node;
      },
    };
    return { returnFocusRef };
  }, []);
  return { nodeRef, containerRef, setNode, context };
}

function RowActionsMenu({
  actions,
  triggerLabel,
  watchForm = false,
}: {
  actions: readonly ListReportRowAction[];
  triggerLabel: string;
  /** One of the two forms of an inline cell: close the menu when its trigger is hidden by a change of form. */
  watchForm?: boolean;
}) {
  const { nodeRef: triggerRef, containerRef, setNode: setTrigger, context } = useControlReturnFocus();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  // Going away while the trigger or the (portalled, so outside the row) menu has the focus: the row
  // deleted or filtered out, also synchronously by one of its own actions, or its actions becoming
  // empty. The focus would fall on `body`; it goes to the table's scroll container instead.
  useLayoutEffect(() => () => keepFocusInTable(containerRef.current, [triggerRef.current, contentRef.current]), [containerRef, triggerRef]);

  // A change of form while the menu is open (a tablet rotated, a panel resized across the threshold):
  // the trigger goes under `display: none`, and the menu would stay anchored to nothing, with the focus
  // returning to a control that cannot take it. The only JS of the forms, and only while a menu is
  // open: an observer on the trigger, whose box collapses when it is hidden. The focus goes first to
  // the visible control of the same row (the first inline button or the other trigger), then the menu
  // closes without running anything; its own return of the focus sees the focus already outside the
  // panel and leaves it there.
  useEffect(() => {
    const trigger = triggerRef.current;
    if (!watchForm || !open || !trigger || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      if (!trigger.isConnected || isRendered(trigger)) return;
      const target = firstRenderedControl(trigger.closest('td')) ?? containerRef.current;
      target?.focus({ preventScroll: true });
      setOpen(false);
    });
    observer.observe(trigger);
    return () => observer.disconnect();
  }, [watchForm, open, triggerRef, containerRef]);

  return (
    <div className={selectBoxClass}>
      <Menu
        open={open}
        onOpenChange={setOpen}
        // Not modal: a modal menu hides the rest of the page with `aria-hidden`, and a report is full of
        // focusable controls (search, pills, links, the other rows' triggers): an accessibility tree with
        // hidden focusable content. Non-modal, the page stays as it is; a click outside closes the menu
        // and reaches its target (e.g. another row's trigger opens that menu).
        modal={false}
      >
        <MenuTrigger asChild>
          <Button ref={setTrigger} variant="ghost" size="icon-sm" aria-label={triggerLabel}>
            {moreIcon}
          </Button>
        </MenuTrigger>
        <MenuContent ref={contentRef} align="end">
          {actions.map((action) => (
            <MenuItem
              key={action.id}
              disabled={action.disabled}
              tone={action.tone}
              // Direct assignment from the descriptor; `MenuItem` never calls it while `disabled`.
              onSelect={() => action.onSelect(context)}
            >
              {action.icon ? (
                <span aria-hidden="true" className={rowActionsItemIconClass}>
                  {action.icon}
                </span>
              ) : null}
              <span className={rowActionsItemLabelClass}>{action.label}</span>
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>
    </div>
  );
}

/**
 * An action as an inline icon button (wide form). From the same descriptor as its menu item: `onSelect`
 * and `disabled` are read from the action of this render, never from a copy. Disabled, it stays
 * focusable (`aria-disabled`, so the tooltip still explains it) and a click, Enter or Space does nothing.
 */
function InlineRowAction({ action, label }: { action: ListReportRowAction; label: string }) {
  const { nodeRef, containerRef, setNode, context } = useControlReturnFocus();
  // Going away while focused (the action no longer inline, or gone): as for the trigger.
  useLayoutEffect(() => () => keepFocusInTable(containerRef.current, [nodeRef.current]), [containerRef, nodeRef]);
  const { disabled, onSelect } = action;
  return (
    <Tooltip content={action.label}>
      <Button
        ref={setNode}
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        aria-disabled={disabled ? true : undefined}
        className={cn(action.tone === 'danger' && rowActionsInlineDangerClass)}
        // Enter and Space on a `<button>` are a click: one path for pointer and keyboard.
        onClick={() => {
          if (!disabled) onSelect(context);
        }}
      >
        <span aria-hidden="true" className={rowActionsInlineIconClass}>
          {action.icon}
        </span>
      </Button>
    </Tooltip>
  );
}

/**
 * @internal The trailing, sticky cell of a data row with `rowActions`: a "…" icon button that opens a
 * `Menu` with one item per action. Each item takes `onSelect`, `disabled` and `tone` from its
 * descriptor as they are; `onSelect` receives `returnFocusRef`: the trigger, or the table's scroll
 * container once the trigger is gone (an overlay opened by the action, e.g. a confirmation, that
 * closes after the action deleted its row gives the focus to the container, never `body`).
 *
 * - The menu is not modal: the rest of the page keeps its accessibility tree and stays interactive;
 *   Escape, Tab and a click outside close it.
 * - One `onSelect` per activation: the menu closes and its panel unmounts with the first one (it has
 *   no exit animation), so the second click of a fast double click never reaches an item.
 * - The trigger or the menu going away while it has the focus (the row deleted elsewhere or by one of
 *   its own actions, filtered out, or its actions becoming empty) closes the menu (`Menu`'s own rule);
 *   the focus then goes to the table's scroll container instead of being lost to `body`.
 *
 * With `inline` > 0 the cell holds two forms of the same descriptors, only one of them displayed (a
 * container query on the table's scroll container, see `rowActionsWideClass`):
 * - wide: the first `inline` actions with an `icon` as icon buttons (`Tooltip` = label, name =
 *   `inlineLabel(label)`, `aria-disabled` when disabled), then the trigger of a menu with the other
 *   actions (no trigger when none is left; its slot stays);
 * - narrow: the trigger of a menu with every action.
 * `returnFocusRef` is the control that was used. A menu open when its form is hidden closes without
 * running anything, and the focus goes to the visible control of the row.
 */
export function ListReportRowActionsCell({ actions, triggerLabel, inline = 0, inlineLabel }: ListReportRowActionsCellProps) {
  useEffect(() => {
    if (!isDev()) return;
    const seen = new Set<string>();
    for (const action of actions) {
      if (seen.has(action.id)) {
        console.error(`[react-object-page] rowActions: duplicate action id "${action.id}" in the same row; ids must be unique within a row.`);
      }
      seen.add(action.id);
    }
  }, [actions]);

  if (inline <= 0) {
    return <td className={rowActionsBodyCellClass}>{actions.length > 0 ? <RowActionsMenu actions={actions} triggerLabel={triggerLabel} /> : null}</td>;
  }

  const inlineActions: ListReportRowAction[] = [];
  const menuActions: ListReportRowAction[] = [];
  for (const action of actions) {
    if (action.icon && inlineActions.length < inline) inlineActions.push(action);
    else menuActions.push(action);
  }
  return (
    <td className={rowActionsBodyCellClass}>
      <div className={rowActionsWideClass}>
        {inlineActions.map((action) => (
          <InlineRowAction key={action.id} action={action} label={inlineLabel ? inlineLabel(action.label) : action.label} />
        ))}
        <div className={rowActionsTriggerSlotClass}>
          {menuActions.length > 0 ? <RowActionsMenu actions={menuActions} triggerLabel={triggerLabel} watchForm /> : null}
        </div>
      </div>
      <div className={rowActionsNarrowClass}>
        {actions.length > 0 ? <RowActionsMenu actions={actions} triggerLabel={triggerLabel} watchForm /> : null}
      </div>
    </td>
  );
}
