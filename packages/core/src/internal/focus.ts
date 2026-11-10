// Internal: focus / tab-order helpers shared by the overlays and the form helpers. Not exported from the package.

const TABBABLE =
  'a[href],button,input:not([type="hidden"]),select,textarea,summary,[tabindex],[contenteditable=""],[contenteditable="true"]';

/**
 * Whether the element has a box in the layout: not under `display: none` (a closed tab, the hidden
 * form of a responsive cell), nor detached. Where `checkVisibility` exists it is used (it also sees
 * `content-visibility: hidden` ancestors); elsewhere the rendered boxes say it. An environment without
 * layout (jsdom) has no boxes at all, so everything is "not laid out" there unless a test stubs
 * `checkVisibility`. Shared by `adjacentTabbable`, `Textarea` and the List Report row actions.
 */
export function isLaidOut(el: Element): boolean {
  return typeof el.checkVisibility === 'function' ? el.checkVisibility() : el.getClientRects().length > 0;
}

/**
 * Document order comparator (`Array.prototype.sort`): -1 when `a` comes before `b`. Never the order
 * in which the elements were collected.
 */
export function compareDocumentOrder(a: Node, b: Node): number {
  if (a === b) return 0;
  return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

/**
 * The next (or previous) tabbable element after `from`, outside `exclude`. Inside a modal panel
 * (`aria-modal`) the search stays in it and wraps around, like the panel's own focus trap; on a
 * page it stops at the end (`null`).
 *
 * The scope is `from`'s own `aria-modal` ancestor: `Dialog` and `Sheet` put `aria-modal` on the
 * panel that wraps their content (`internal/modal.tsx`, the Radix portal only moves the whole
 * panel), so an element inside one always has the panel as ancestor. Content in another portal (a
 * menu's panel) is left out with `exclude`.
 *
 * Method: one CSS-selector scan plus a layout read per candidate (`getClientRects`), and a
 * `compareDocumentPosition` per candidate. It reads the real tabbability (inert, disabled, hidden,
 * `tabIndex`) and does not try `focus()`, so it has no side effect. Meant for one-off calls on a
 * key press, not per render; positive `tabindex` ordering is not honoured.
 */
export function adjacentTabbable(
  from: HTMLElement,
  backwards: boolean,
  exclude: HTMLElement | null,
): HTMLElement | null {
  const scope = from.closest<HTMLElement>('[aria-modal="true"]');
  const candidates = [...(scope ?? document).querySelectorAll<HTMLElement>(TABBABLE)].filter(
    (el) =>
      el !== from &&
      !exclude?.contains(el) &&
      !el.hasAttribute('data-radix-focus-guard') &&
      !el.closest('[inert]') &&
      !el.matches(':disabled') &&
      el.tabIndex >= 0 &&
      isLaidOut(el),
  );
  const after = (el: HTMLElement) => !!(from.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
  const next = backwards ? candidates.filter((el) => !after(el)).pop() : candidates.find(after);
  if (next) return next;
  if (!scope) return null;
  // Wrap around inside the panel; if `from` is its only tabbable, the focus stays on it.
  return (backwards ? candidates[candidates.length - 1] : candidates[0]) ?? from;
}
