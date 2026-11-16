---
'@formrail/core': patch
---

List Report: the observer of a changed `dir` now measures a table only when the attribute changes on its container or on one of its ancestors (a sibling or another branch no longer measures every mounted table), and it follows nested shadow roots outwards to the document. A container slotted into a host whose shadow tree sets `dir` above the `slot` is a documented limit. The TSDoc of `OverflowEdgesGeometry` no longer says a changed `dir` needs no measure.
