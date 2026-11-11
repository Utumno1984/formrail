import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Button } from '../button/Button';
import { isLaidOut } from '../internal/focus';
import { moreIcon } from '../internal/icons';
import { isDev } from '../internal/is-dev';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../menu/Menu';
import { Tooltip } from '../tooltip/Tooltip';
import { cn } from '../utils/cn';
import { useResizeAndMutationEffect } from '../utils/use-resize-and-mutation-effect';
import { useKeepFocusInTable } from './keep-focus-in-table';
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
  /** `labels.rowAction`: names the inline button of an action from its label and `rowLabel`. */
  rowActionLabel?: (actionLabel: string, rowLabel: string) => string;
  /** The row's name (`selection.getRowLabel(row)`), for `rowActionLabel`. */
  rowLabel?: string;
}

/** The first control of the cell in the form that is laid out: the first inline button, or the trigger. */
const firstRenderedControl = (cell: Element | null | undefined): HTMLElement | null =>
  [...(cell?.querySelectorAll('[data-rop-row-actions-form]') ?? [])].find(isLaidOut)?.querySelector('button') ?? null;

/**
 * The `returnFocusRef` given to `onSelect` by one control of the cell (an inline button or a trigger):
 * the control itself while it is in the document and laid out; the visible control of the same cell
 * when the form changed in the meantime (the control is now under `display: none` and cannot take the
 * focus); the table's scroll container once the control is gone (the action deleted its row, e.g.
 * after `await confirm(…)`). Read when the focus is returned, not when the action runs: dialogs read
 * `returnFocusRef.current` after their exit, which can be well after the row went away. Also keeps the
 * focus in the table when the control, or `extraOwners` (the portalled menu), go away with the focus.
 */
function useControlReturnFocus(extraOwners?: () => readonly (Element | null | undefined)[]) {
  const nodeRef = useRef<HTMLElement | null>(null);
  const { containerRef, capture } = useKeepFocusInTable(() => [nodeRef.current, ...(extraOwners?.() ?? [])]);
  const setNode = useCallback(
    (node: HTMLElement | null) => {
      nodeRef.current = node;
      capture(node);
    },
    [capture],
  );
  const context = useMemo<ListReportRowActionContext>(() => {
    const returnFocusRef: RefObject<HTMLElement | null> = {
      get current() {
        const node = nodeRef.current;
        if (!node || !node.isConnected) return containerRef.current;
        if (isLaidOut(node)) return node;
        return firstRenderedControl(node.closest('td')) ?? node;
      },
    };
    return { returnFocusRef };
  }, [containerRef]);
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
  const contentRef = useRef<HTMLDivElement | null>(null);
  // The trigger or the (portalled, so outside the row) menu going away with the focus (the row deleted
  // or filtered out, also synchronously by one of its own actions, or its actions becoming empty): the
  // focus goes to the table's scroll container instead of `body` (`useKeepFocusInTable`).
  const { nodeRef: triggerRef, containerRef, setNode: setTrigger, context } = useControlReturnFocus(() => [contentRef.current]);
  const [open, setOpen] = useState(false);

  // A change of form while the menu is open (a tablet rotated, a panel resized across the threshold):
  // the trigger goes under `display: none`, and the menu would stay anchored to nothing, with the focus
  // returning to a control that cannot take it. The only JS of the forms, and only while a menu is
  // open: an observer on the trigger, whose box collapses when it is hidden. The focus goes first to
  // the visible control of the same row (the first inline button or the other trigger), then the menu
  // closes without running anything; its own return of the focus sees the focus already outside the
  // panel and leaves it there. It acts only on a trigger that was laid out when the menu opened (an
  // environment without layout never closes it).
  useResizeAndMutationEffect(() => {
    const trigger = triggerRef.current;
    if (!watchForm || !open || !trigger) return undefined;
    const wasLaidOut = isLaidOut(trigger);
    return {
      target: trigger,
      update: () => {
        if (!wasLaidOut || !trigger.isConnected || isLaidOut(trigger)) return;
        (firstRenderedControl(trigger.closest('td')) ?? containerRef.current)?.focus({ preventScroll: true });
        setOpen(false);
      },
    };
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
        <MenuTrigger
          asChild
          // A press does not focus the trigger (the menu keeps the focus off it while it opens), so the
          // menu would give the focus back, on close, to whatever had it before: e.g. another row's
          // inline button, clicked a moment ago. The trigger takes it first: the focus comes back here.
          onPointerDown={(event) => {
            if (event.button === 0 && !event.ctrlKey) event.currentTarget.focus({ preventScroll: true });
          }}
        >
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
  // A change of form while this button has the focus (a panel resized across the threshold): the wide
  // form goes under `display: none` and the browser drops the focus to `body`. As for a menu left open
  // (`RowActionsMenu`), an observer, only while the button has the focus, hands the focus to the visible
  // control of the row. Losing the focus together with being hidden keeps the observer: it is what
  // reacts to that very change. (Prose here is read by the Tailwind scan: no utility names as bare words.)
  const [focused, setFocused] = useState(false);
  useResizeAndMutationEffect(() => {
    const node = nodeRef.current;
    if (!focused || !node) return undefined;
    const wasLaidOut = isLaidOut(node);
    return {
      target: node,
      update: () => {
        if (!wasLaidOut || !node.isConnected || isLaidOut(node)) return;
        setFocused(false);
        // The focus moved elsewhere on purpose in the meantime: leave it.
        const active = document.activeElement;
        if (active && active !== document.body && active !== node) return;
        (firstRenderedControl(node.closest('td')) ?? containerRef.current)?.focus({ preventScroll: true });
      },
    };
  }, [focused, nodeRef, containerRef]);
  const { disabled, onSelect } = action;
  return (
    <Tooltip content={action.label}>
      <Button
        ref={setNode}
        onFocus={() => setFocused(true)}
        onBlur={(event) => {
          if (isLaidOut(event.currentTarget)) setFocused(false);
        }}
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
 *   `rowActionLabel(label, rowLabel)`, `aria-disabled` when disabled), then the trigger of a menu with the other
 *   actions (no trigger when none is left; its slot stays);
 * - narrow: the trigger of a menu with every action.
 * `returnFocusRef` is the control that was used. A menu open when its form is hidden closes without
 * running anything, and the focus goes to the visible control of the row.
 */
export function ListReportRowActionsCell({ actions, triggerLabel, inline = 0, rowActionLabel, rowLabel = '' }: ListReportRowActionsCellProps) {
  useEffect(() => {
    if (!isDev()) return;
    const seen = new Set<string>();
    for (const action of actions) {
      if (seen.has(action.id)) {
        console.error(`[formrail] rowActions: duplicate action id "${action.id}" in the same row; ids must be unique within a row.`);
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
      <div data-rop-row-actions-form="wide" className={rowActionsWideClass}>
        {inlineActions.map((action) => (
          <InlineRowAction key={action.id} action={action} label={rowActionLabel ? rowActionLabel(action.label, rowLabel) : action.label} />
        ))}
        <div className={rowActionsTriggerSlotClass}>
          {menuActions.length > 0 ? <RowActionsMenu actions={menuActions} triggerLabel={triggerLabel} watchForm /> : null}
        </div>
      </div>
      <div data-rop-row-actions-form="narrow" className={rowActionsNarrowClass}>
        {actions.length > 0 ? <RowActionsMenu actions={actions} triggerLabel={triggerLabel} watchForm /> : null}
      </div>
    </td>
  );
}
