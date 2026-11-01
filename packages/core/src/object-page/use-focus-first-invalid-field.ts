import { useEffect } from 'react';
import type { RefObject } from 'react';
import { isDev } from '../internal/is-dev';

// A key whose value is `undefined` is "no error", like in `useObjectPageForm`.
const invalidKeys = (fieldErrors: Partial<Record<string, string>>): string[] =>
  Object.keys(fieldErrors).filter((key) => fieldErrors[key] !== undefined);

export interface UseFocusFirstInvalidFieldOptions {
  /** Container of the form controls. Only descendants of `containerRef.current` are considered. */
  containerRef: RefObject<HTMLElement | null>;
  /**
   * Errors keyed by field `name` (for example `useObjectPageForm().fieldErrors`). Only the keys are
   * read; this hook knows nothing about the form hook.
   */
  fieldErrors: Partial<Record<string, string>>;
}

/**
 * Every time a new non-empty `fieldErrors` object arrives, scrolls the first invalid control into
 * view (`block: 'center'`) and focuses it. Controls are looked up inside the container by
 * `data-rop-name="<key>"` (what a `<Field name>` puts on its control, `Select` included) and, for the
 * keys no such control answers to, by the native `name="<key>"`. A render-prop control that does not
 * spread `data-rop-name` falls in the second case. "First" is the **visual (document) order** of the matches, never the order of the
 * keys of `fieldErrors`. A match that cannot take focus (`type="hidden"`, disabled, not rendered,
 * inert) is skipped in favor of the next one. If no key matches a focusable element nothing
 * happens (one `console.error` in development). A key whose value is `undefined` is not an error.
 * Runs in an effect, so it is inert on the server.
 *
 * The trigger is the **identity** of `fieldErrors`, not its content: a second failed attempt with
 * identical errors (`useObjectPageForm` builds a new object per failed `save`) moves the focus
 * again, so the user always gets a reaction. Pass a referentially stable object: one recreated on
 * every render (`{ ...errors }` inline) would re-focus on every render.
 */
export function useFocusFirstInvalidField({ containerRef, fieldErrors }: UseFocusFirstInvalidFieldOptions): void {
  useEffect(() => {
    if (invalidKeys(fieldErrors).length === 0) return;

    const wanted = new Set(invalidKeys(fieldErrors));
    const container = containerRef.current;
    const candidates: HTMLElement[] = [];
    if (container) {
      // Attribute comparison instead of a `[name="..."]` selector: no escaping of exotic names.
      // `data-rop-name` first; `[name]` only for the keys no `data-rop-name` control answers to.
      const found = new Set<string>();
      for (const attr of ['data-rop-name', 'name']) {
        for (const el of container.querySelectorAll<HTMLElement>(`[${attr}]`)) {
          const key = el.getAttribute(attr) as string;
          if (!wanted.has(key) || (attr === 'name' && found.has(key))) continue;
          candidates.push(el);
          found.add(key);
        }
      }
    }
    // Document order, never the order of the keys of `fieldErrors`.
    candidates.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));

    // A candidate that cannot take focus (`type="hidden"`, disabled, `display: none`, inert, a
    // `fieldset`) is skipped: the first one that really receives focus wins.
    for (const el of candidates) {
      el.focus({ preventScroll: true });
      // Compare against the element's own root: `document.activeElement` is the host when
      // the element lives in a ShadowRoot (and the `<iframe>` across a frame boundary).
      const root = el.getRootNode() as Document | ShadowRoot;
      if (root.activeElement !== el) continue;
      el.scrollIntoView({ block: 'center' });
      return;
    }

    if (isDev()) {
      console.error(
        '[react-object-page] useFocusFirstInvalidField: none of the keys of `fieldErrors` matches a mounted, focusable `[data-rop-name]`/`[name]` element inside the container, nothing was focused.',
      );
    }
  }, [fieldErrors, containerRef]);
}
