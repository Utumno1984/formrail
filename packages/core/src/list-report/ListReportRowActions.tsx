import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Button } from '../button/Button';
import { moreIcon } from '../internal/icons';
import { isDev } from '../internal/is-dev';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../menu/Menu';
import { keepFocusInTable, tableContainerOf } from './keep-focus-in-table';
import { rowActionsBodyCellClass, rowActionsItemIconClass, rowActionsItemLabelClass, selectBoxClass } from './list-report-table-styles';
import type { ListReportRowAction, ListReportRowActionContext } from './types';

/** @internal Props of {@link ListReportRowActionsCell}. */
export interface ListReportRowActionsCellProps {
  /** What `rowActions(row)` returned for the row. Empty: an empty cell (the column keeps its width). */
  actions: readonly ListReportRowAction[];
  /** Accessible name of the trigger (`labels.rowActions(rowLabel)`). */
  triggerLabel: string;
}

function RowActionsMenu({ actions, triggerLabel }: ListReportRowActionsCellProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  // The table's scroll container, taken while the trigger is in the document.
  const containerRef = useRef<HTMLElement | null>(null);
  // What an overlay opened by an action gives the focus back to: the trigger while it is there, the
  // table's scroll container once it is gone. Dialogs read `returnFocusRef.current` when they return
  // the focus (after their exit), which can be well after the row went away: e.g. an action that awaits
  // `useConfirmDialog`'s `confirm()` and then deletes its row, whose continuation runs before the
  // dialog has finished closing. Pointing the ref at a node that is still there covers every such
  // timing, without guessing when the overlay will be done.
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const context = useMemo<ListReportRowActionContext>(() => ({ returnFocusRef }), []);
  const setTrigger = useCallback((node: HTMLButtonElement | null) => {
    triggerRef.current = node;
    if (node) containerRef.current = tableContainerOf(node);
    returnFocusRef.current = node ?? containerRef.current;
  }, []);

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

  // Going away while the trigger or the (portalled, so outside the row) menu has the focus: the row
  // deleted or filtered out, also synchronously by one of its own actions, or its actions becoming
  // empty. The focus would fall on `body`; it goes to the table's scroll container instead.
  useLayoutEffect(() => () => keepFocusInTable(containerRef.current, [triggerRef.current, contentRef.current]), []);

  return (
    <div className={selectBoxClass}>
      <Menu
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
 */
export function ListReportRowActionsCell({ actions, triggerLabel }: ListReportRowActionsCellProps) {
  return <td className={rowActionsBodyCellClass}>{actions.length > 0 ? <RowActionsMenu actions={actions} triggerLabel={triggerLabel} /> : null}</td>;
}
