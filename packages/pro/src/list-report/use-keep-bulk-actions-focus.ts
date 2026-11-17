import { useEffect, useState, type RefObject } from 'react';
import { isLaidOut } from '@formrail/core/internal';

/**
 * Whether a control can hold the focus where it is: laid out (`isLaidOut` of the core: not under `display: none`,
 * not detached) and not under `visibility: hidden` or `collapse`. The visibility is the computed one, which is
 * inherited and can be overridden: a `visible` descendant of a hidden node is shown (and keeps its focus).
 */
export function isShown(el: Element): boolean {
  return isLaidOut(el) && getComputedStyle(el).visibility === 'visible';
}

/**
 * Whether the focus of `node` was lost with it: the node is gone or not shown any more, and the focus is on `body`
 * (or nowhere, or still on the hidden node), not somewhere the user moved it on purpose.
 */
function focusLostWith(node: Element): boolean {
  if (node.isConnected && isShown(node)) return false;
  const active = document.activeElement;
  return !active || active === document.body || active === node || !active.isConnected;
}

/**
 * The focus rule of the selection bar of `VirtualListReport` (moved from the core's frame in #571, so the Free
 * `ListReport` does not carry it): a control of the bulk actions that has the focus and stops being shown or is
 * removed hands the focus to the header checkbox of the table (to the table container when it is disabled), as
 * after "Clear selection", never to `body`. A focus the user moved elsewhere in the meantime is left where it is.
 *
 * - `slot`: the element that wraps the bulk actions (the frame's internal `bulkActionsSlotRef`), null while there
 *   is none. Its `focusin`/`focusout` (native listeners, removed with the slot) track which control has the focus.
 * - `container`: the table's container (the scroll container, which holds the header checkbox).
 *
 * What it sees, only while a control of the slot has the focus (no observer at rest): the box of the slot and of
 * the focused control (a `display: none` from a class, an attribute or a media query, e.g. the slot hidden below
 * 640px when the viewport is resized or a tablet rotated across it), and any change of children or of the
 * `hidden`/`class`/`style` attributes anywhere inside the slot, nested controls included (a control removed, a
 * wrapper hidden, a control under `visibility: hidden`). Not seen: a change outside the slot that hides it
 * without changing its box (`visibility: hidden` on an ancestor of the bar); the focus is then left as the
 * browser leaves it. An environment without layout (nothing is laid out when the control takes the focus) never
 * moves the focus.
 */
export function useKeepBulkActionsFocus(slot: HTMLElement | null, container: RefObject<HTMLElement | null>): void {
  const [focused, setFocused] = useState<Element | null>(null);

  useEffect(() => {
    if (!slot) return undefined;
    const onFocusIn = (event: FocusEvent) => setFocused(event.target as Element);
    // Losing the focus with the control still shown is the user moving on; losing it with the control hidden or
    // removed keeps it, because that is the very change the observer reacts to.
    const onFocusOut = (event: FocusEvent) => {
      const node = event.target as Element;
      if (node.isConnected && isShown(node)) setFocused((current) => (current === node ? null : current));
    };
    slot.addEventListener('focusin', onFocusIn);
    slot.addEventListener('focusout', onFocusOut);
    return () => {
      slot.removeEventListener('focusin', onFocusIn);
      slot.removeEventListener('focusout', onFocusOut);
      setFocused(null);
    };
  }, [slot]);

  useEffect(() => {
    const node = focused;
    if (!slot || !node) return undefined;
    // An environment without layout (nothing is ever laid out) never moves the focus.
    const wasShown = isShown(node);
    const update = () => {
      if (!wasShown || !focusLostWith(node)) return;
      setFocused(null);
      const scroller = container.current;
      const header = scroller?.querySelector<HTMLInputElement>('th[data-rop-select] input');
      (header && !header.disabled ? header : scroller)?.focus();
    };
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    resize?.observe(slot);
    resize?.observe(node);
    const mutations = typeof MutationObserver === 'undefined' ? null : new MutationObserver(update);
    mutations?.observe(slot, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class', 'style'] });
    return () => {
      resize?.disconnect();
      mutations?.disconnect();
    };
  }, [slot, focused, container]);
}
