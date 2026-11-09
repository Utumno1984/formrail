import { useEffect, useMemo, useRef } from 'react';
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

/**
 * @internal The trailing, sticky cell of a data row with `rowActions`: a "…" icon button that opens a
 * `Menu` with one item per action. Each item takes `onSelect`, `disabled` and `tone` from its
 * descriptor as they are; `onSelect` receives the trigger as `returnFocusRef`.
 *
 * - One `onSelect` per opening of the menu: a second activation that reaches an item while the menu
 *   is closing (a fast double click) is ignored.
 * - The row going away while its menu is open (deleted elsewhere, filtered out) closes the menu
 *   (`Menu`'s own rule); the focus, which was in the menu, then goes to the table's scroll container
 *   instead of being lost to `body`.
 */
export function ListReportRowActionsCell({ actions, triggerLabel }: ListReportRowActionsCellProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const context = useMemo<ListReportRowActionContext>(() => ({ returnFocusRef: triggerRef }), []);
  const open = useRef(false);
  const selected = useRef(false);
  // The table's scroll container, taken when the menu opens (the row may be gone when it is needed).
  const container = useRef<HTMLElement | null>(null);

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

  // Unmounted with the menu open: the menu and its items go with the row, and the focus they had would
  // fall on `body`. Checked after the frame (the menu's own focus return runs in one too).
  useEffect(
    () => () => {
      if (!open.current) return;
      const target = container.current;
      requestAnimationFrame(() => {
        const active = document.activeElement;
        if (target?.isConnected && (!active || active === document.body || !active.isConnected)) target.focus({ preventScroll: true });
      });
    },
    [],
  );

  if (actions.length === 0) return <td className={rowActionsBodyCellClass} />;
  return (
    <td className={rowActionsBodyCellClass}>
      <div className={selectBoxClass}>
        <Menu
          onOpenChange={(next) => {
            open.current = next;
            if (next) {
              selected.current = false;
              container.current = triggerRef.current?.closest('table')?.parentElement ?? null;
            }
          }}
        >
          <MenuTrigger asChild>
            <Button ref={triggerRef} variant="ghost" size="icon-sm" aria-label={triggerLabel}>
              {moreIcon}
            </Button>
          </MenuTrigger>
          <MenuContent align="end">
            {actions.map((action) => (
              <MenuItem
                key={action.id}
                disabled={action.disabled}
                tone={action.tone}
                onSelect={() => {
                  if (selected.current) return;
                  selected.current = true;
                  action.onSelect(context);
                }}
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
    </td>
  );
}
