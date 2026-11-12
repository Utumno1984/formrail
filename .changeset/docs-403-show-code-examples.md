---
'@formrail/core': patch
'@formrail/pro': patch
---

Docs: every converted Docs page (Data, Floorplans, Patterns, the showcases) opens with a copy-paste example whose "Show code" is a real, type-checked file importing only `@formrail/core` / `@formrail/pro`, followed by the Playground with its Controls. `Data/ListReportTable` shows the complete pattern (`useListReport` → `table`, a flex parent with `min-height: 0`); the showcases list their main source files with links to GitHub. No change to the published code.
