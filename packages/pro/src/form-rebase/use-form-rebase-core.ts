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
 * **Conflict lifecycle**: a conflict stays open until the user's value and the server's agree:
 * until `acceptTheirs`/`keepMine`/`acceptAllTheirs`, until the user brings the field to the server
 * value by hand (it closes by itself and does not reopen), or until a later rebase brings the server
 * to the user's value. A save that succeeds closes them all (the user's values were saved: conflicts
 * and `applied` are cleared, the save is never blocked), and so does a reset of the form by the
 * consumer (`reset()`, `reset(newBaseline)`, a rehydration: conflicts and `applied` are cleared). A
 * `reset()` on a form that is already clean changes nothing observable and keeps `applied`.
 *
 * **Several rebases in a row**: the open conflicts accumulate. A new rebase keeps every open
 * conflict on a field it does not change (Save would still overwrite the server's value there), and
 * merges the fields it changes against the previous version: on a field of an open conflict, still
 * one conflict, with `theirs` the new server value and `base` the value it replaced; none when the
 * server now holds the user's value. A server that goes back to an older value does not close a
 * conflict. There is one conflict per field (items of id-keyed arrays by id), in the order of the
 * form whatever the order in which the rebases arrive; `path` and labels are those of the last
 * rebase, and a conflict on a field covers the conflicts nested in it. `applied` does not
 * accumulate: it lists the changes of the last rebase only.
 *
 * ```ts
 * // The user changed Number from 'A-1' to 'A-2'; `saved` is the record the form was loaded with.
 * rebase({ ...saved, number: 'A-3' });             // conflicts: Number (base 'A-1', theirs 'A-3')
 * rebase({ ...saved, number: 'A-3', amount: 50 }); // conflicts: Number, still open; applied: Amount
 * rebase({ ...saved, number: 'A-4', amount: 50 }); // conflicts: Number (base 'A-3', theirs 'A-4'); applied: none
 * rebase({ ...saved, number: 'A-2', amount: 50 }); // conflicts: none (the server has the user's value)
 * ```
 *
 * `path` and `mine` of a conflict are those computed by the rebase; `acceptTheirs`/`keepMine`
 * take that `path`. Items of id-keyed arrays are found again by id, so a later reorder by the user
 * does not break the resolution. `acceptTheirs` on a top-level key the server removed goes through
 * `reset(baseline)` + `setValues` (the only way to remove a top-level key) and is ignored while
 * the form is saving.
 *
 * `options` are read when a rebase is applied or a conflict is checked: inline literals are fine. Except
 * `itemLabel`, also compared by identity to name the open conflicts (see `UseFormRebaseOptions.itemLabel`): pass a
 * stable function. SSR-safe: no access to `window`/`document`.
 */
export function useFormRebase<Values extends object>(
  form: UseObjectPageFormReturn<Values>,
  options?: UseFormRebaseOptions<Values>,
): UseFormRebaseReturn<Values> {
  return useBindingRebase(form, options);
}
