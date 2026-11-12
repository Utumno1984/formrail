# @formrail/pro

Pro tier of Formrail (commercial license, **to be defined**; see [LICENSE](./LICENSE)).

- `"private": true` on purpose: nothing is published until the private npm org exists (a guard test,
  `scripts/pro-package.test.mjs`, fails if `private` is removed or the license becomes MIT). There is
  no runtime licensing mechanism: no network access, no keys (asserted on the built bundle).
- The source is readable in this public monorepo; the Pro moat is the service/license, not code secrecy.
  The MIT license at the repository root covers `packages/core` only.
- Same toolchain as `packages/core` (tsup, Vitest, shared ESLint/tsconfig) and the same governance:
  per-import bundle budget in [`bundle-budget.json`](./bundle-budget.json) (checked by
  `npm run bundle:check`, regenerated with `npm run bundle:update-baseline -- --package packages/pro`),
  changeset required on every change. Storybook stories live under `Pro/` (included in dev, e2e and
  visual builds; the public GitHub Pages deploy sets `STORYBOOK_EXCLUDE_PRO=1` and publishes Free only).
- The engine (`computeChangeSummary`, `useChangeSummary`) works with any form state that exposes the
  current values and the saved baseline (e.g. core's `useObjectPageForm`). The components
  (`<ChangeSummary />`) use `@formrail/core` (`cn`, design tokens), declared as a
  **peer dependency** and treated as external by the build. The peer range must be revisited when pro
  is published.

## Change Summary engine

A field-by-field diff of the current `values` against the **real saved baseline**, as a
deterministic list of human-readable entries.

```ts
import { computeChangeSummary, useChangeSummary, inferSegmentLabel } from '@formrail/pro';
import type { ChangeEntry, ChangeKind, ChangeSummaryOptions, UseChangeSummaryReturn } from '@formrail/pro';
```

- `computeChangeSummary(options): ChangeEntry[]` — the pure function where all the logic lives.
- `useChangeSummary(options): { entries, isEmpty }` — the memoized hook (SSR-safe). `entries` keeps its
  identity while `values`/`baseline` keep theirs; `arrayIdKeys`/`labels` are compared by content
  (inline literals are fine), `isEqual` by identity (pass a stable function).
- `inferSegmentLabel(segment)` — the label inferred for one object key (`lineItems` → `Line Items`,
  `vatID` → `Vat ID`, `address2` → `Address 2`).

### Example

```tsx
import { useObjectPageForm } from '@formrail/core';
import { useChangeSummary } from '@formrail/pro';

function InvoiceChanges({ invoice }: { invoice: Invoice }) {
  const form = useObjectPageForm<Invoice>({ baseline: invoice });
  const { entries, isEmpty } = useChangeSummary({
    values: form.values,
    baseline: form.baseline, // the real saved baseline: after save() the summary is empty again
    arrayIdKeys: { lineItems: 'id' }, // match rows by id: a mere reorder is not a change
    labels: { 'supplier.vatNumber': 'VAT number' },
  });
  if (isEmpty) return <p>No changes</p>;
  return (
    <ul>
      {entries.map((entry, index) => (
        // kind + path alone can collide (a key containing a dot, `{ 'a.b': 1 }` vs `{ a: { b: 1 } }`):
        // the index makes the key unique within the list.
        <li key={`${index}:${entry.kind}:${entry.path}`}>
          {entry.label}: {entry.kind}
        </li>
      ))}
    </ul>
  );
}
```

With a row changed, one added without id, one removed and two rows swapped, `entries` is e.g.:

```ts
[
  { path: 'supplier.vatNumber', label: 'Supplier > VAT number', kind: 'changed', before: 'IT111', after: 'IT222', labelPath: ['Supplier', 'VAT number'] },
  { path: 'lineItems.0.price', label: 'Line Items > Item 1 > Price', kind: 'changed', before: 100, after: 120, labelPath: [/* ... */] },
  { path: 'lineItems.3', label: 'Line Items > Item 4', kind: 'added', before: undefined, after: { description: 'Cable', price: 5 }, labelPath: [/* ... */] },
  { path: 'lineItems.1', label: 'Line Items > Item 2', kind: 'removed', before: { id: 'b', /* ... */ }, after: undefined, labelPath: [/* ... */] },
]
```

### `ChangeEntry`

| Field | Meaning |
|---|---|
| `path` | Dot notation with numeric indexes, the same as core's `FieldErrors` (`lineItems.2.price`). Index in `values`, or in the baseline for a `removed` item. |
| `labelPath` | One label per segment: inferred, `Item N` (1-based) for array indexes, or the `labels` override. |
| `label` | `labelPath.join(' > ')`. |
| `kind` | `'added' \| 'removed' \| 'changed'`. |
| `before` / `after` | Baseline / current value; `before` is `undefined` for `added`, `after` is `undefined` for `removed` (even when that side was `null`). |
| `beforeMissing` / `afterMissing` | `true` when that side has no own key at this position, or no counterpart for an array item: tells a missing key from a key present with value `undefined`. |

### Rules (full reference in the TSDoc of `ChangeSummaryOptions`)

- `''`, `null`, `undefined` and a missing key are four distinct states, as for `isDirty` in
  `useObjectPageForm`: without `isEqual` and `arrayIdKeys`, `entries` is empty if and only if `isDirty`
  is `false`. Declaring `arrayIdKeys` adds two exceptions: a reorder without changes is dirty but gives no
  entry, and an item whose id is not matched by `Object.is` gives `added` + `removed` even against an equal
  one. The second covers items without id, ids that are objects (compared by reference: a cloned `Date` or
  object is another id) and `0` against `-0`.
- **Absent** = `undefined`, `null`, missing key: it only decides the kind of the entry. Both sides Absent
  → `changed` (`null` → `undefined`). One side Absent → one `added`/`removed` entry on the node, whatever
  the other side holds (`null` → `''` is `added`, `[]` → `null` is `removed`). Anything else is compared
  structurally; no other normalization (`' '` vs `''`, `5` vs `'5'` are changes).
- `NaN` equals `NaN`, `0` equals `-0`, `Date`s by `getTime()`; `Map`, `Set`, class instances and
  functions are leaves compared by reference. Circular structures are supported, and so are very deep
  ones: the visit is iterative (no call-stack overflow, tested at 10 000 levels). The cost is linear in the
  visited nodes, and a subtree shared by several paths is visited once per path, so a graph of shared
  subtrees can cost exponential time in its size.
- **Arrays**: declare an identity key per array path without indexes (`arrayIdKeys`, e.g.
  `{ lineItems: 'id', 'lineItems.taxes': 'code' }`) to get per-field entries for matched rows,
  `added`/`removed` per row and no entry for a reorder; `[]` against an Absent side has no row to report
  and is one entry on the array. Without it, an array is diffed as a block (one `changed` entry, even for
  a reorder). Duplicate ids degrade that array to the block diff with a development warning.
- **`isEqual(a, b, path)`**: custom equality, called before the default rules on every visited pair
  except the root (a missing key is passed as `undefined`). `true` → no entry for that subtree, `false`
  → one atomic entry, `undefined` → default. The subtree of an atomic entry is not visited.
- **Order**: depth-first; keys in the order of `values`, then baseline-only keys; id-matched arrays in
  the order of `values`, then the `removed` items in baseline order.

## `<ChangeSummary />`

An accessible, responsive list of the entries of the engine, to show in an Object Page before saving.

### Styles and import order

```ts
// once, at the root of your app: mode (a) of the core README ("Compiled stylesheet")
import '@formrail/core/styles.css'; // 1. core tokens (--*-rop-*) and utilities
import '@formrail/pro/styles.css'; //  2. pro component styles (consume the tokens, never redefine them)
```

`@formrail/core/theme.css` is not a third import: it is the Tailwind v4 source of the core's mode (b),
an alternative to the core `styles.css`, never loaded together with it (see the core README).

Pro's `styles.css` holds only its own `.rop-pro-*` component classes, never a Tailwind utility also
emitted by core, so it cannot override core's responsive variants: the result does not depend on the
order of the imports. Its rules are in the nested layer `rop.utilities.pro`, below core's utilities:
a core utility passed through `className` (`className="p-0"`) overrides the component's default, and
your un-layered CSS overrides both.

### Usage

```tsx
import { ChangeSummary, useChangeSummary } from '@formrail/pro';

const { entries } = useChangeSummary({ values: form.values, baseline: form.baseline });
<ChangeSummary entries={entries} locale="en-US" />;
```

- Props: `entries`, `renderValue?(value, entry)`, `emptyLabel` (`"No changes"`), `label` (accessible name of
  the list, `"Changes"`), `locale`, `timeZone`, `valueLabels` (`yes`, `no`, `empty`, `noValue`,
  `nullValue`, `undefinedValue`, `missingValue`, `invalidDate`, `added`, `removed`, `changed`, `from`, `to`, `contentsDiffer`, `items`), `className`
  (merged with `tailwind-merge`; a core utility wins over the component's default, see above), `ref`
  and other HTML attributes on the root.
- Text read by assistive technology: `Amount, changed, from 100 to 120`. The kind of change is visible
  text, never only colour. There is no live region: a summary that changes at every keystroke is not
  announced.
- Default formatting (`formatChangeValue`, also exported, pure): booleans `Yes`/`No`; dates with
  `Intl.DateTimeFormat` (`dateStyle: 'medium'`), `Invalid date` for invalid ones; numbers with
  `Intl.NumberFormat`; `''` is `Empty`, `null`/`undefined` is `No value`; arrays `N items`; plain objects
  a compact `Label: value` list. If before and after would look identical, both are re-rendered
  precisely (time, ISO string, full number with `n` for a bigint, quoted string, `Null` / `Undefined` /
  `Missing` for the no-value states, never `from No value to No value`), then with their contents written
  out (`["a", "b"]` / `["a", "c"]`, `{a: {x: 1}}`, `Map {"k" => 1}`, truncated to 120
  characters); if even that matches (two class instances), the after side ends with
  `(contents differ)`. `formatChangeValue` never throws (revoked Proxy, throwing traps or getters give
  `Unsupported value`).
- `renderValue` is called once for each value shown (never for the missing side of `added`/`removed`).
  Returning `null` leaves the value empty. An exception thrown by `renderValue` propagates.
- To delegate the values you do not handle, use `formatChangeValue(value, { precise: true })`: the compact
  rendering gives `No value` for both `null` and `undefined`, so `null` → `undefined` would read
  `from No value to No value`. `precise` also quotes strings and adds the time to dates.
- A missing key reaches `renderValue` as `undefined`. On `undefined` against a missing key both calls get
  the same arguments (`undefined` and the same entry), so `beforeMissing` / `afterMissing` do not tell which
  side is being rendered, and a delegate shows `Undefined` on both. The default rendering has no such
  limit: to keep it, leave `renderValue` unset or build your own list on `useChangeSummary`.
