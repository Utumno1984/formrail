---
'@formrail/core': patch
'@formrail/pro': patch
---

Docs (#401): the Storybook props tables now come from `react-docgen-typescript`, so composed props types are documented in full (`ListReport`, `Accordion`, `VirtualListReport`, `VirtualListReportTable`, and the union members of `ListReportTable`, `Field` and `Button`). Demo-only controls and hook options shown as Controls are filed under "Story controls"; composed components declare their parts as `subcomponents`. TSDoc added to the props that had none (types only, no runtime change), including the Radix props the overlays pass through (`asChild`, `MenuContent`'s positioning and outside-interaction callbacks, `MenuItem`'s `disabled` / `textValue`), now redeclared with the same types; `Button`'s `aria-label` / `aria-labelledby` are declared by each size branch instead of the HTML base (same accepted types). An e2e guard (`e2e/docs-props.spec.ts`) fails on an empty table, a row that is not a real prop, or a prop without TSDoc.
