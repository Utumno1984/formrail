import { useEffect, useRef, useState, type RefObject } from 'react';
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
 * Whether the focus of `node`, gone or not shown any more, was lost with it: the focus is on `body` (or still on the
 * hidden node), not somewhere the user moved it on purpose. Read in the root of the `slot`: its document (another
 * window's included) or its shadow root, then that root's document when the focus is not inside it (never null then:
 * a document with an element always has an active element).
 */
function focusLostWith(node: Element, slot: Element): boolean {
  const active = activeIn(slot);
  return active === slot.ownerDocument.body || active === node;
}

/** The element with the focus as the root of `slot` sees it (see `focusLostWith`): still the same one after a `focusout` that moved nothing. */
function activeIn(slot: Element): Element | null {
  return (slot.getRootNode() as Document | ShadowRoot).activeElement ?? slot.ownerDocument.activeElement;
}

/**
 * The focus rule of the selection bar of `VirtualListReport` (moved from the core's frame in #571, so the Free
 * `ListReport` does not carry it): a control of the bulk actions that has the focus and stops being shown or is
 * removed hands the focus to the header checkbox of the table (to the table container when it is disabled), as
 * after "Clear selection", never to `body`. A focus the user moved elsewhere in the meantime is left where it is.
 *
 * - `slot`: the element that wraps the bulk actions (the frame's internal `bulkActionsSlotRef`), null while there
 *   is none. The `focusin` of its root (document or shadow root) and its own `focusout` (native listeners, removed
 *   with the slot) track which control has the focus. A focus that lands on any element outside the slot (the
 *   user's, or the header checkbox focused by "Select all N results" as it hides itself) ends the tracking at once;
 *   a focus lost to no element (`body`, another window) ends it when the control is still shown, and the first
 *   change seen once the control is hidden or removed ends it in any case.
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
 *
 * The frame may be in another document (an iframe: that document is read) or in a shadow root (its focus and its
 * active element are read there). A focus moved from inside a shadow root to the document outside it is not a
 * `focusin` of the root: a hidden control whose change was not seen stays tracked until the next one. Not
 * handled: a focused control that becomes `disabled` or `inert` while it stays shown (a browser may then drop its
 * focus to `body`, where it is left; that control is not "hidden", and moving the focus away from an action disabled
 * for a moment, e.g. while its request runs, is not this rule's call).
 */
export function useKeepBulkActionsFocus(slot: HTMLElement | null, container: RefObject<HTMLElement | null>): void {
  const [focused, setFocused] = useState<Element | null>(null);
  // The tracked control: `focused` as of its last commit (the second effect), set ahead of it by a `focusin`. A focus
  // that lands outside the slot while nothing is tracked sets no state, so it never renders the hook.
  const tracked = useRef<Element | null>(null);
  // Whether the tracked control was shown when its tracking started (the second effect).
  const shown = useRef(true);

  useEffect(() => {
    if (!slot) return undefined;
    // The slot's document, or its shadow root (open or closed: there the targets are not retargeted to the host).
    const root = slot.getRootNode();
    // A focus that lands anywhere in that root: a control of the slot is tracked, anything else was moved there on
    // purpose (by the user, or by the code: "Select all N results" hides itself and focuses the header checkbox in the
    // same click), so nothing is tracked any more, whatever happens to the control afterwards. On the root, not the
    // slot, to see the latter.
    const onFocusIn = (event: Event) => {
      const target = event.target as Element;
      const next = slot.contains(target) ? target : null;
      if (next || tracked.current) setFocused((tracked.current = next));
    };
    // A focus lost to no element (`body`: no `focusin` follows) with the control still shown is the user moving on;
    // with the control hidden or removed it is kept, because that is the very change the observer reacts to (unless the
    // control was not shown when its tracking started: that one never moves the focus). Read after the change that
    // blurred it (a microtask): a browser that blurs a control while removing it does so with the control still in the
    // document. A `focusout` that leaves the focus on the control (the synthetic one of a `Tooltip` closed by force,
    // another window taking the focus) loses nothing. Only that control is untracked: by then the focus may be on
    // another control of the slot.
    const onFocusOut = (event: FocusEvent) => {
      const node = event.target as Element;
      queueMicrotask(() => {
        if (tracked.current === node && activeIn(slot) !== node && (isShown(node) || !shown.current)) setFocused((tracked.current = null));
      });
    };
    root.addEventListener('focusin', onFocusIn);
    slot.addEventListener('focusout', onFocusOut);
    return () => {
      root.removeEventListener('focusin', onFocusIn);
      slot.removeEventListener('focusout', onFocusOut);
      setFocused(null);
    };
  }, [slot]);

  useEffect(() => {
    const node = (tracked.current = focused);
    if (!slot || !node) return undefined;
    // A control not shown when its tracking starts (an environment without layout, or a control hidden as it takes the
    // focus) never moves the focus: tracked only while it holds it, until the first change seen.
    const wasShown = (shown.current = isShown(node));
    if (!wasShown && activeIn(slot) !== node) {
      setFocused(null);
      return undefined;
    }
    const update = () => {
      if (wasShown && isShown(node)) return;
      // Gone or hidden (`isShown` is false for a node out of the document), or never shown: tracked no more, whatever
      // the focus; recovered only if it was lost with a control that was shown.
      setFocused(null);
      if (!wasShown || !focusLostWith(node, slot)) return;
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
