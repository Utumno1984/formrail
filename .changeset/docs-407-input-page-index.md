---
'@formrail/core': patch
'@formrail/pro': patch
---

Docs (#407): `Forms/Input` and `Foundations/Utilities` pages, explicit sections for `useFieldControl`, `useCombobox`/`defaultComboboxFilter`, `TooltipProvider`, `DescriptionListStatus` and, in Pro, `inferSegmentLabel` and `computeRebase`; `Overlays/Menu` gets its props tables. The Introduction index lists every public page, and a guard (`scripts/docs-coverage.test.mjs`) fails when a runtime export has no Docs page or a Docs page is missing from its Introduction.
