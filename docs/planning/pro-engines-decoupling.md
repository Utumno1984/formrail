# Pro engines without `@formrail/core`: a study of the boundaries (ticket #489)

Origin: maintainer decision 2 of 2026-11-13 (`design-system-spec.md` §8): the **Change Summary** and
**Form Rebase** engines must work without `@formrail/core`, for people who use React Hook Form (RHF)
or TanStack Form. The visual Pro components stay tied to the core. Distribution is unchanged: private
registry, no runtime licensing (§2.4).

Each numbered section answers one of the questions of the ticket. For each it records the chosen
option, the alternatives set aside and the reason. The three choices that were up to the maintainer
(Q1, Q2, Q3) are collected in "Maintainer decisions": they were taken on 2026-11-14 (1a, 2a, 3a) and
recorded on ticket #489.

Verified versions:
- `react-hook-form` 7.92.0: lines cited from `node_modules/react-hook-form/dist/index.esm.mjs`;
- `@tanstack/react-form` / `@tanstack/form-core` 1.33.5: lines cited from
  `node_modules/@tanstack/form-core/dist/esm/FormApi.js` and `utils.js`.

Repository lines refer to the branch `feat/489-pro-engines-without-core`.

## Starting point

- The pure engines import nothing from the core:
  - `packages/pro/src/change-summary/compute-change-summary.ts:1-2`;
  - `packages/pro/src/form-rebase/compute-rebase.ts:1-17`;
  - `packages/pro/src/internal/structural-diff.ts`;
  - `packages/pro/src/change-summary/use-change-summary.ts:1-3`, which imports only `react`.
- The only link between an engine and the core was an `import type`: in `use-form-rebase.ts:3` (on
  main 45f2a59) the type `UseObjectPageFormReturn`, defined in
  `packages/core/src/object-page/use-object-page-form.ts:61`. At runtime the import disappeared, but
  the published `.d.ts` referenced `@formrail/core`.
- The visual components use the core and stay where they are:
  - `packages/pro/src/change-summary/ChangeSummary.tsx:2` (`cn`, `Text`);
  - `packages/pro/src/form-rebase/RebaseNotice.tsx:13` (`Button`, `MessageStrip`, `cn`, `composeRefs`).
- `@formrail/core` was a **required** peer (`packages/pro/package.json:47` on main 45f2a59): npm 7+
  installed it anyway, even for people who only use RHF. With decision 1a it is now optional.

## 1. Boundary

**Choice: (a), subpath `@formrail/pro/engine` in the same package.** Implemented in this PR:
- `packages/pro/src/engine.ts`;
- `exports["./engine"]` in `packages/pro/package.json`;
- a second entry in `packages/pro/tsup.config.ts`.

Alternative set aside, (b): a separate package `@formrail/pro-engine` on which `@formrail/pro`
depends. The technical result is the same, but it changes what the customer receives from the
registry (two packages, two versions to keep aligned, access to grant on two names) with no advantage
for the person installing: with (a), someone who only uses RHF installs one package and imports a
subpath.

**Decided (Q1 = 1a, maintainer decision, 2026-11-14)**: `@formrail/core` is an **optional** peer
(`peerDependenciesMeta` in `packages/pro/package.json`), applied in this PR. Whoever uses only
`@formrail/pro/engine` does not install it: `tests/pro-engine-no-core/no-core.test.ts` runs an
offline `npm install` of the packed package and checks that `npm ls @formrail/core` reports it as
absent. As a negative control, without `peerDependenciesMeta` npm wants it. The Pro README explains
who has to install it.

Whoever imports `@formrail/pro`, the main entry, without the core installed gets an error, but where
it arrives depends on `skipLibCheck`:
- **`skipLibCheck: false`**: `tsc` reports `Cannot find module '@formrail/core'` in the `.d.ts` files
  of `@formrail/pro`.
- **`skipLibCheck: true`**, the default of the Vite and Next templates: `tsc` **passes** and the core
  types become `any`, so even a wrong argument passes. The error comes only from the bundler or at
  load time, and it does not always name a missing package:
  - Vite 8 replaces the absent optional peer with an empty stub, so the build fails on the first
    import: `[MISSING_EXPORT] "cn" is not exported by
    "__vite-optional-peer-dep:@formrail/core:@formrail/pro"` (verified with Vite 8.3.5);
  - esbuild: `Could not resolve "@formrail/core"`;
  - Node: `ERR_MODULE_NOT_FOUND` (`Cannot find package '@formrail/core'`) in ESM,
    `Cannot find module '@formrail/core'` in CJS.

To avoid depending on the core, import **only** `@formrail/pro/engine`. The fixture covers both
cases: the consumer with `skipLibCheck: false` fails at the types; the one with `skipLibCheck: true`
passes `tsc` and fails at load time with the explicit error.

The subpath requires `moduleResolution` `bundler`, `node16` or `nodenext`: with `node`/`node10` the
`exports` map is ignored and `@formrail/pro/engine` does not resolve. This is the same limit as
`@formrail/core/internal`.

Verifiable guarantees of the boundary:
- **Sources**: `packages/pro/test/engine-boundary.test.ts` walks the import graph from
  `src/engine.ts`, using the TypeScript AST: `import`, `import type`, `export … from`, `import()`
  even in type position, `require`, `/// <reference types>`. No reached module names
  `@formrail/core` or one of its subpaths. The 9 negative cases show that the check fires on an
  import added two modules away.
- **Build**: `packages/pro/test/dist.engine.test.ts` reads `dist/engine.{js,cjs,d.ts,d.cts}` and the
  files they reach. None contains the string `@formrail/core`. There are negative cases on a
  synthetic `dist`.
- **Consumer without core**: the fixture `tests/pro-engine-no-core/` builds, outside the monorepo, a
  project with `react`, `react-dom`, `react-hook-form` and the built `@formrail/pro`, but without the
  core. `tsc --noEmit` (with `skipLibCheck: false`) passes and the entry loads in ESM and in CJS. As
  a negative control, in the same project the main entry fails both at the types and at load time.

How duplication with the main entry is avoided: `src/index.ts` re-exports the engines from
`./engine`, and an esbuild plugin (`tsup.config.ts:32`) turns that import into an external import of
`./engine.js` / `./engine.cjs`. So an app that imports both entries loads the engines only once.
Module state, that is the development warnings emitted once per path (`structural-diff.ts:39`), is
not duplicated: `dist.engine.test.ts` checks it ("a development warning is emitted once for both
entries").

The stateless helpers used by both the engines and the components of the main entry
(`format-change-value`, `infer-label`, `use-isomorphic-layout-effect`) live in a third file,
`dist/shared.js` / `dist/shared.cjs` (build-only entry `src/internal/shared.ts`, listed in
`tsup.config.ts:14`). The same plugin makes every other module import that file, so both entries
import it. It is not a public subpath: it does not appear in `exports` and has no `.d.ts`. The
exception is `is-dev`, three lines that read `process.env.NODE_ENV`: each entry keeps a copy,
because the existing test `dist.smoke.test.ts` ("no runtime licensing") wants that read inside
`dist/index.*`. `dist.engine.test.ts` ("one copy of each module") checks, in ESM and in CJS, that no
other module appears in two files of the `dist`.

Measurement, critic round 3: esbuild with minify and external peers, on a consumer that imports
`ChangeSummary`, `useChangeSummary`, `RebaseNotice`, `useFormRebase`, `computeRebase` and
`formatChangeValue` from `@formrail/pro`:

| Build | raw | gzip |
|---|---|---|
| main before #489 (critic's measurement) | 27,696 B | 10,013 B |
| #489 with duplicated helpers (d0fca20) | 30,595 B | 10,285 B |
| #489 with `dist/shared.*` | 27,732 B | 10,052 B |

The residue against main, +36 B raw and +39 B gzip, comes from the imports between the three files
and from the copy of `is-dev`. A single export changes by a few bytes for the same reason: from -4
to +7 B in `npm run bundle:check` against the versioned baseline, all under the limit.

Automatic splitting into shared chunks (`splitting`) was set aside. It moved the shared component
code out of `dist/index.*`, and the existing test `test/dist.smoke.test.ts` ("no runtime licensing",
which reads `dist/index.*`) would no longer have seen that code. For the same reason the shared file
is only one, with an explicit list of modules.

## 2. What goes into the engines entry

**Choice**:
- functions: `computeChangeSummary`, `useChangeSummary`, `inferSegmentLabel`, `formatChangeValue`,
  `computeRebase`, `useFormRebase`;
- types: all those of the engines, plus the new `RebaseFormBinding`.

See `packages/pro/src/engine.ts`.

- `formatChangeValue` is included. It is pure, returns a string and uses no tokens or `cn`, so it
  serves whoever draws their own summary with RHF.
- `ChangeSummary` and `RebaseNotice` stay out (out of scope in the ticket): they use core tokens and
  `cn`.
- The main entry `@formrail/pro` keeps exactly the same names, plus the type `RebaseFormBinding`.
  `packages/pro/test/public-api.test.tsx` checks this, with the fixed list from main 45f2a59 and an
  `import type` of all the types.

## 3. Generic `useFormRebase`

**Choice: a minimal structural contract**, `RebaseFormBinding<Values>`
(`packages/pro/src/form-rebase/types.ts:165`). Fields: `baseline`, `values`, `isSaving`,
`saveError`, `reset`, `setValues`.

The documented contract:
- `baseline` and `values` are snapshots: a new object when the content changes, never mutated in
  place;
- `reset(b)` makes `baseline === values === b`;
- `setValues` right after `reset` in the same batch is applied on top of the reset.

`UseObjectPageFormReturn` is assignable to the contract without a cast.

- The engines entry exports `useFormRebase(form: RebaseFormBinding<Values>)`
  (`use-form-rebase.ts:185`).
- The main entry exports a wrapper with the **same signature as before**,
  `useFormRebase(form: UseObjectPageFormReturn<Values>)` (`use-form-rebase-core.ts:48`).

Alternative set aside: widening the signature of the main entry. It would be compatible for callers,
but the existing test `packages/pro/test/scaffold.test.ts:103` pins the exact type with
`toEqualTypeOf`, and the ticket asks that existing tests stay unchanged. Moreover it would change the
public shape of an existing API, a decision that does not belong to the developer. The TSDoc of the
two signatures is the same text, kept aligned by a test.

Two constraints of the contract come from the hook's code and are the reason an adapter is not
trivial:
- **Recognising its own reset by identity**: `ownBaselineRef` (`use-form-rebase.ts:204`) and
  `byOwnReset = own.baseline === form.baseline` (`:229`). If the library clones the baseline passed
  to `reset`, the binding must expose the object passed, not the clone, otherwise the hook mistakes
  its own reset for a rehydration and clears the conflicts.
- **Detecting "discarded"**: `form.values === form.baseline` (`:231`). After a `reset()` the binding
  must return as `values` the same object as the baseline, and **only** after a reset: if it returns
  the baseline also when the user manually brings the values back to the baseline's content, the
  hook reads that gesture as a discard and clears `applied` and the open conflicts.
- **Rehydration by identity**: a new baseline not set by the hook (`rehydrated`, `:230`) closes the
  open conflicts. A binding that recreates the baseline with the same content (on every render, or by
  cloning the library's one) would close them immediately.
- The two rules are in the TSDoc of `RebaseFormBinding` and pinned by
  `packages/pro/test/public-api.test.tsx` ("identity rules of RebaseFormBinding"), with a `useState`
  binding that respects them as a control. The field registered after mount with an open conflict
  (critic's observation, round 1) is closed in #507 with an adapter rule, without a channel in the
  contract: the RHF binding's baseline changes only when RHF replaces the defaults object, never for
  a registration, so the conflicts stay open. A field without a default enters only the values and is
  "added" (Pro README, section "React Hook Form"; test with real RHF in
  `use-react-hook-form-binding.edge.test.tsx`).
- In addition, `useChangeSummary` memoizes by identity of `values`/`baseline`
  (`use-change-summary.ts:37-40`): an object mutated in place would produce a stale summary.

## 4. Adapters vs guide

**Decided (Q2 = 2a, maintainer decision, 2026-11-14)**: adapters, implemented in the child tickets
A3 (RHF) and A4 (TanStack), not in this PR. Planned shape: adapters
`useReactHookFormBinding(form)` / `useTanStackFormBinding(form)` in dedicated subpaths
(`@formrail/pro/react-hook-form`, `@formrail/pro/tanstack-form`). The two libraries would come in as
**optional** peers, used only for types: the adapters call only methods of the form object, with no
runtime import from the library.

Reason: sections 5 and 6 show that the correct binding requires three things:
- keeping the identity of the baseline, because RHF clones it;
- producing new snapshots from values mutated in place;
- applying the rebase without echo.

This is exactly the hard part that the Pro sells (§3: "robust dirty-tracking with asynchronous
hydration"). Leaving it to a recipe copied into the customer's code makes it fragile and not
upgradeable.

Alternative set aside (2b): only a guide with a copyable recipe (example file with a story). No
peers are needed, but correctness falls on the customer.

In both cases `react-hook-form` and `@tanstack/react-form` are already `devDependencies` of
`packages/pro`, for examples and tests. `scripts/pro-package.test.mjs` checks that they never appear
in `dependencies` and that, if they become peers, they are optional.

## 5. Baseline

**React Hook Form 7.92**:
- `defaultValues` is **cloned** at startup: `cloneObject` (`index.esm.mjs:57`) applied in
  `:2140-2142`. `reset(values)` also clones it (`_reset`, `:3623-3632`). So
  `formState.defaultValues` is never the object passed, and the binding must keep its own reference
  to the baseline received.
- The current values `_formValues` are **mutated in place** on every change.
  - `getValues()` returns a **shallow** copy, `{ ..._formValues }` (`:3170-3173`): nested objects are
    shared and mutated afterwards.
  - `subscribe`/`watch(callback)` sometimes receive cloned `values` (`:3003`, `:3347`), sometimes the
    shallow copy (`:3276`).
  - The binding must therefore build deep (or per-path) snapshots, otherwise `useChangeSummary`
    stays stale and `useFormRebase` compares histories that were already mutated.
- The `values` prop of `useForm` and asynchronous `reset` are the two ways to hydrate after mount.
  Both go through `_reset`.

**TanStack Form 1.33.5**:
- `reset(values)` **does not clone**: `options.defaultValues = values` and `state.values = values`
  (`FormApi.js:127-137`).
- `setFieldValue` uses `setBy` (`utils.js:16-41`): immutable updates with structural sharing, so the
  identity changes only on the modified path.
- `update({ defaultValues })` realigns the values **only if the form is not touched**
  (`FormApi.js:94`). It is not suitable for the rebase: use `reset`.
- **Verified in #508** (`tanstack-form-internals.test.tsx`): `useForm` calls `formApi.update(opts)` on
  **every** render and `this.options = options` is unconditional (`FormApi.js:93`). The defaults set
  by `reset(values)` therefore last until the next render: `form.reset(data)` with a `defaultValues`
  that does not follow the data is undone (untouched form) and "set the defaults to `incoming`" does
  not hold. The object returned by `useForm` is a copy of the instance: its `options` stays the one
  from the first render. The adapter never writes TanStack's defaults and follows the live ones of
  the instance (Pro README, section "TanStack Form").

## 6. Applying the rebase without false dirty

Requirements, from the same tests as `useObjectPageForm`:
- after the rebase the form is dirty only for the user's changes relative to `incoming`;
- no intermediate render with `values === incoming`;
- no echo treated as a user gesture.

The hook calls `form.reset(incoming)` and then `form.setValues(merged)` in a single
`unstable_batchedUpdates` (`use-form-rebase.ts:254-257`).

- **RHF**: inside the binding, `reset(incoming)` followed by
  `reset(merged, { keepDefaultValues: true })` (`index.esm.mjs:3680`, `keepDefaultValues` branch).
  - The second `reset` recomputes `dirtyFields` against `_defaultValues`, that is `incoming`, and so
    marks as dirty only the user's fields (`:3730-3745`).
  - Avoid `setValue` per path with `shouldDirty`: it generates one event per field and goes through
    validation.
  - RHF's `isDirty` state must in any case be read with the caution of section 7.
- **TanStack**: `reset(incoming)` followed by `setFieldValue` for each changed top-level key, inside
  the store's `batch`. Alternatively `reset(merged, { keepDefaultValues: true })` after setting
  `options.defaultValues = incoming`. To be verified with a render counter in the child ticket.
  - **Verified in #508**: `reset(merged, { keepDefaultValues: true })` clears the meta of all fields;
    `setFieldValue` with `dontUpdateMeta` notifies the store once per field and does not remove keys.
    The adapter writes with a single `form.baseStore.setState` (a method of the form object, no
    runtime import, no `batch`): one update, meta unchanged, no listener or validator.
- **During a save**: the hook queues the rebase while `isSaving`.
  - RHF exposes `formState.isSubmitting`, which for example the binding can map to `isSaving`, and
    TanStack `state.isSubmitting` (`FormApi.js:519-521`).
  - `saveError` must be mapped to `null` on a successful submit, for example `isSubmitSuccessful` in
    RHF. Otherwise the hook does not close the conflicts after the save.

## 7. Semantics of "dirty"

The engines use the Level 1 rules (§1.13.1): `''`, `null`, `undefined` and a missing key are four
distinct values, without changing them. The libraries compute `isDirty` with their own rules. Known
divergences:
- **RHF** compares with its own `deepEqual` and with `dirtyFields` updated per registered field.
  - An unregistered field, or one unmounted with `shouldUnregister`, disappears from the values: for
    the engines it is "missing key", different from `undefined`.
  - An HTML input always returns strings: a numeric field hydrated with `10` and rewritten by the
    user as `"10"` is dirty for the engines (different types) and, depending on how it is registered,
    clean or dirty for RHF.
- **TanStack** uses `isDefaultValue` per field and a "persistent" `isDirty` (it stays true after a
  return to the original value, unlike `isDefaultValue`).
- **What the user sees when they diverge**: a form that is "dirty" for the library with an empty
  summary, or the other way round. The rule for the UI: the footer and the dirty-guard rely on
  `isEmpty && reorders.length === 0` from `useChangeSummary()`, not on the library's `isDirty` and
  not on `isEmpty` alone. A reorder without edits of an array with `arrayIdKeys` is dirty but yields
  no entry: since #424 it appears in `reorders` (`computeChangeSummaryResult`/`useChangeSummary`).
  This way the summary and the "Save" button never contradict each other, even on a pure reorder.
  This must be documented in the adapters guide.
- **Internal keys of the library**: RHF's `useFieldArray` adds an `id` only to the `fields` list
  returned at render, not to the values (`getValues`/`watch`). So it does not appear in the summary
  and does not break `arrayIdKeys`, as long as the binding reads the values and not `fields`. To be
  covered with a test in the child ticket.

## Edge cases of the ticket: status

| Case | Status |
|---|---|
| Values mutated in place | Constraint of the contract (§3); for RHF it requires snapshots in the binding (§5); test in child ticket A3 |
| Baseline cloned by the library | Constraint of the contract (§3: the binding exposes the object passed to `reset`); test in A3 |
| `incoming` during a save | Hook queue unchanged; `isSubmitting` → `isSaving` mapping (§6); test in A3/A4 |
| `useFieldArray` and internal `id`s | §7; test in A3 |
| Top-level key removed by the server | The hook goes through `reset(baseline)` + `setValues` (`use-form-rebase.ts:322-328`); with RHF `reset` removes the key, with TanStack too; test in A3/A4 |
| Unregistered field / `shouldUnregister` | §7 (missing key ≠ `undefined`); test in A3 |
| Double import of the two entries | Done: a single copy of the engines and of the shared helpers (`dist/shared.*`, except `is-dev`), verified in `dist.engine.test.ts` |
| SSR | Done: `renderToString` in a node environment in `dist.engine.test.ts`; the only access to `window` is the `typeof` of `use-isomorphic-layout-effect.ts:4` |

## Proposed child tickets

Decided with Q3 = 3a (maintainer decision, 2026-11-14); the child tickets A3 and A4 are created by
the planner:
- **A1 + A2 (this PR)**: engines entry, source and dist guards, subpath budget
  (`packages/pro/bundle-budget.engine.json`, `scripts/bundle-budget.mjs`), `RebaseFormBinding`
  contract, fixture without core, `@formrail/core` optional peer.
- **A3, RHF integration (#507).** Depends on A1+A2.
  - Adapter `useReactHookFormBinding` in `@formrail/pro/react-hook-form` (RHF optional peer, types
    only) and story `Pro/Integrations/React Hook Form`, with `argTypes`, `fn()` and `play`.
  - E2E and visual baselines for desktop/tablet/mobile.
  - Unit tests with a render counter: two edited fields give two entries, returning to the original
    value removes the entry, a server update on another field, conflict with
    `keepMine`/`acceptTheirs`, asynchronous baseline without echo.
  - The edge cases of the table marked A3.
- **A4, TanStack Form integration (#508).** Depends on A3 (same scheme): the same criteria.

## Maintainer decisions

Taken on 2026-11-14 on the options proposed by the study, recorded on ticket #489.

- **Q1, `@formrail/core` optional peer: decided 1a.**
  - **1a (chosen)**: `peerDependenciesMeta: { "@formrail/core": { optional: true } }`. A single
    package, distribution unchanged. Whoever imports the main entry without the core gets an error:
    from `tsc` only with `skipLibCheck: false`, otherwise from the bundler or at load time (§1). The
    fixture checks both cases.
    Applied in this PR.
  - **1b (discarded)**: separate package `@formrail/pro-engine` (§1, alternative (b)).
- **Q2, integration with the form libraries: decided 2a.**
  - **2a (chosen)**: adapters in dedicated subpaths, with RHF and TanStack as optional peers used
    only for types (§4). Implementation in child tickets A3 and A4.
  - **2b (discarded)**: only a copyable recipe, with no new peers.
- **Q3, split of the work: decided 3a.**
  - **3a (chosen)**: this PR carries the study + A1 + A2 + the optional peer; A3 and A4 become child
    tickets, created by the planner.
  - **3b (discarded)**: everything in a single PR.
