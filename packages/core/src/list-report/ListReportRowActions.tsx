import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Button } from '../button/Button';
import { moreIcon } from '../internal/icons';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../menu/Menu';
import { rowActionsBodyCellClass, rowActionsItemIconClass, rowActionsItemLabelClass, selectBoxClass } from './list-report-table-styles';
import type { ListReportRowAction, ListReportRowActionContext } from './types';

// Bundlers replace `process.env.NODE_ENV` in consumer builds; without `process` assume development.
const isDev = (): boolean => {
  try {
    return process.env.NODE_ENV !== 'production';
  } catch {
    return true;
  }
};

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
  const context = useMemo<ListReportRowActionContext>(() => ({ returnFocusRef: triggerRef }), []);

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

  // Going away with the focus (the row deleted or filtered out, also by one of its own actions, or its
  // actions becoming empty): the focused trigger or menu item leaves the document and the focus would
  // fall on `body`. A layout cleanup runs before the nodes are removed, so it can still see where the
  // focus is and which table this is; the scroll container gets the focus once the frame is over (the
  // menu's own return of the focus runs in one too), unless something else took it by then.
  useLayoutEffect(
    () => () => {
      const trigger = triggerRef.current;
      const active = document.activeElement;
      const hadFocus = !!active && (trigger?.contains(active) || contentRef.current?.contains(active));
      const container = trigger?.closest('table')?.parentElement;
      if (!hadFocus || !container) return;
      requestAnimationFrame(() => {
        const now = document.activeElement;
        if (container.isConnected && (!now || now === document.body || !now.isConnected)) container.focus({ preventScroll: true });
      });
    },
    [],
  );

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
          <Button ref={triggerRef} variant="ghost" size="icon-sm" aria-label={triggerLabel}>
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
 * descriptor as they are; `onSelect` receives the trigger as `returnFocusRef`.
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
