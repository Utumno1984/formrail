// `useFormRebase` of the main entry `@formrail/pro`: the engine hook of `./use-form-rebase` typed for core's
// `useObjectPageForm` form, as it was before the engine entry existed (#489), so the public signature of the
// main entry does not change. `@formrail/pro/engine` exports the engine hook itself (any `RebaseFormBinding`).
// Its TSDoc is the same text as the engine hook's (`test/public-api.test.tsx` keeps the two in sync).
import type { UseObjectPageFormReturn } from '@formrail/core';
import type { UseFormRebaseOptions, UseFormRebaseReturn } from './types';
// Through the engine entry, so the build imports it from `dist/engine.*` (see tsup.config.ts).
import { useFormRebase as useBindingRebase } from '../engine';

/**
 * Applies the merge of `computeRebase` to a form of core's `useObjectPageForm`, through its public
 * API only (`baseline`, `values`, `isSaving`, `saveError`, `reset`, `setValues`). The hook of
 * `@formrail/pro` takes that form; the same hook of `@formrail/pro/engine` takes any form that keeps the
 * contract of `RebaseFormBinding` (all this hook reads): core's form as is, or a binding of another form
 * library, with no core package installed.
 *
 * **Applying a rebase**: in a layout effect after the render in which `rebase(incoming)` is called,
 * with the `baseline` and `values` of that render: `form.reset(incoming)` then
 * `form.setValues(merged)`, in one batch, in the same task as that render (a passive effect could run
 * after a keystroke the render did not see, and the merge would drop it), so no render ever shows `values === incoming` in between (`isDirty` and the footer
 * do not flicker). The form is dirty after it only when user edits are left against `incoming`.
 * `reset` clears `fieldErrors`, `formErrors` and `saveError`: validation runs again at the next
 * save. A top-level key cannot be removed through `setValues`; the core API never removes one
 * either, so a merge never needs to.
 *
 * **During a save** (`form.isSaving`): the rebase is queued (only the latest `incoming`),
 * `isPending` is `true`, and it is applied when the save settles, against the baseline the save
 * left (the one returned by the handler on success, the unchanged one on failure). A `reset`
 * during a save would win over the save, so it is never called then.
 *
 * **Conflict lifecycle**: a conflict stays open until `acceptTheirs`/`keepMine`/`acceptAllTheirs`,
 * until a save succeeds (the user's values were saved: conflicts and `applied` are cleared, the
 * save is never blocked), or until the form is reset by the consumer (`reset()` or
 * `reset(newBaseline)`: conflicts and `applied` are cleared). A new rebase recomputes conflicts
 * and `applied` from scratch against its `incoming`. A conflict whose field the user brings back to
 * the incoming value (by hand) closes by itself and does not reopen. A `reset()` on a form that is
 * already clean changes nothing observable and keeps `applied`.
 *
 * `path` and `mine` of a conflict are those computed by the rebase; `acceptTheirs`/`keepMine`
 * take that `path`. Items of id-keyed arrays are found again by id, so a later reorder by the user
 * does not break the resolution. `acceptTheirs` on a top-level key the server removed goes through
 * `reset(baseline)` + `setValues` (the only way to remove a top-level key) and is ignored while
 * the form is saving.
 *
 * `options` are read when a rebase is applied or a conflict is checked: inline literals are fine.
 * SSR-safe: no access to `window`/`document`.
 */
export function useFormRebase<Values extends object>(
  form: UseObjectPageFormReturn<Values>,
  options?: UseFormRebaseOptions<Values>,
): UseFormRebaseReturn<Values> {
  return useBindingRebase(form, options);
}
