---
'@formrail/core': patch
'@formrail/pro': patch
---

Docs: the `ListReport` and `VirtualListReport` copy-paste examples have a height that follows the viewport
(`clamp(20rem, calc(100dvh - 4rem), 40rem)`, with a `vh` fallback) instead of a fixed 420px / 480px, so a phone shows
more rows and the page can still be scrolled past the example. Documentation and examples only, no API changes.
