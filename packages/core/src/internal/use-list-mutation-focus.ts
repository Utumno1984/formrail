// Internal: where the focus goes after the user adds, removes or moves an item of a list. Not exported
// from the package (see the PR of #417 for why it stays private for now).
import { useCallback, useLayoutEffect, useRef } from 'react';
import { focusFirst } from './focus';
import { isDev } from './is-dev';

export interface ListMutationFocusRequest {
  /**
   * The item keys the list must show (in this order) for the request to apply: the list right
   * after the mutation. Compared element by element (`Object.is`) with the `items` of each commit.
   */
  next: readonly string[];
  /**
   * Keys of `targetRef`, in order of preference: the first one whose element is mounted and really
   * takes the focus wins. The caller chooses the heir **before** the mutation (only it knows whether
   * "the next row" or "the previous row" is the right heir, and what comes after the list); the
   * last entry is usually a control that always exists (an "Add" button).
   */
  targets: readonly string[];
}

export interface ListMutationFocus {
  /**
   * Stable callback ref (one per key, same identity at every render) for a control that a request
   * may name. One element per key; combine with an existing ref through `composeRefs`.
   */
  targetRef: (key: string) => (element: HTMLElement | null) => void;
  /** Asks for the focus on the first focusable `targets` once the list shows `next`. Replaces any pending request. */
  requestFocus: (request: ListMutationFocusRequest) => void;
}

interface Pending extends ListMutationFocusRequest {
  /** The items when the request was made: while the list still shows them, the change has not landed yet. */
  from: readonly string[];
}

const sameItems = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((key, i) => Object.is(key, b[i]));

/**
 * Restores the focus after a mutation of a list that removes, moves or creates the control that had
 * it (a Remove button that disappears, a Move button whose row is re-inserted, a new row).
 *
 * `items` are the keys of the items **as rendered in this commit**. A request waits until a commit
 * shows exactly `next`, then focuses the first of `targets` that takes the focus. The wait matters
 * with a controlled list: the consumer may apply the change later, never, or differently.
 * - A commit with the same items as when the request was made: still waiting (an unrelated
 *   re-render, an announcement, a change not applied yet).
 * - A commit with other items than `next` (the consumer refused or transformed the change and then
 *   something else changed the list): the request is dropped, the focus is never stolen later.
 *
 * No automatic fallback: if none of `targets` is mounted and focusable nothing is focused (and in
 * development one `console.error` says so). Elements are tracked by ref, never looked up with a CSS
 * selector: no escaping of the keys, and a list nested inside another list's item (attachments of a
 * line) cannot answer to the outer list's keys.
 */
export function useListMutationFocus(items: readonly string[]): ListMutationFocus {
  const elements = useRef(new Map<string, HTMLElement>());
  const refs = useRef(new Map<string, (element: HTMLElement | null) => void>());
  const itemsRef = useRef(items);
  const pending = useRef<Pending | null>(null);

  useLayoutEffect(() => {
    itemsRef.current = items;
    const request = pending.current;
    if (!request) return;
    if (!sameItems(items, request.next)) {
      if (!sameItems(items, request.from)) pending.current = null;
      return;
    }
    pending.current = null;
    const candidates = request.targets.flatMap((key) => elements.current.get(key) ?? []);
    if (focusFirst(candidates) === null && isDev()) {
      console.error(
        `[react-object-page] list focus: none of the targets ${JSON.stringify(request.targets)} is mounted and focusable after the change, nothing was focused.`,
      );
    }
  });

  const targetRef = useCallback((key: string) => {
    let ref = refs.current.get(key);
    if (!ref) {
      ref = (element: HTMLElement | null) => {
        if (element) {
          elements.current.set(key, element);
        } else {
          // The element is gone (a removed row): forget its key, the cache does not grow with every key ever seen.
          elements.current.delete(key);
          refs.current.delete(key);
        }
      };
      refs.current.set(key, ref);
    }
    return ref;
  }, []);

  const requestFocus = useCallback((request: ListMutationFocusRequest) => {
    pending.current = { next: [...request.next], targets: [...request.targets], from: itemsRef.current };
  }, []);

  return { targetRef, requestFocus };
}
