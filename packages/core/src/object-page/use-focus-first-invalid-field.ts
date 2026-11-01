import { useEffect } from 'react';
import type { RefObject } from 'react';
import { isDev } from '../internal/is-dev';

import { invalidPaths, isClearing } from './field-errors';
import type { FieldErrors } from './field-errors';

export interface UseFocusFirstInvalidFieldOptions {
  /** Container of the form controls. Only descendants of `containerRef.current` are considered. */
  containerRef: RefObject<HTMLElement | null>;
  /**
   * Errors keyed by dot-notation path (`address.city`, `lines.0.qty`; see `FieldErrors`), for
   * example `useObjectPageForm().fieldErrors`. Each path is compared **by exact equality** with the
   * control's `data-rop-name`/`name` (no prefix search: an error on `address` does not reach
   * `address.city`). Only the keys are read; this hook knows nothing about the form hook.
   */
  fieldErrors: FieldErrors;
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
 * again, so the user always gets a reaction. The one exception is the object `useObjectPageForm`
 * produces when an edit removes some errors and others remain (per-path clearing on
 * `setValue`/`setValues`): it is recognized and ignored, so typing in a field never moves the focus
 * to another invalid field. Pass `form.fieldErrors` itself: a copy or a derived object (`{ ...errors }`,
 * a `useMemo` that adds keys) loses that recognition and re-focuses on every change of identity (an
 * inline copy, on every render).
 */
export function useFocusFirstInvalidField({ containerRef, fieldErrors }: UseFocusFirstInvalidFieldOptions): void {
  useEffect(() => {
    // A partial clearing after an edit, not a new validation result: the focus stays with the user.
    if (isClearing(fieldErrors)) return;
    const invalid = invalidPaths(fieldErrors);
    if (invalid.length === 0) return;

    const wanted = new Set(invalid);
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
