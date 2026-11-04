---
'@react-object-page/pro': patch
---

The stylesheet now pulls core's tokens with `@reference` instead of `@import ... theme(reference)`, because core's `theme.css` also carries the `rop-hover` variant (#196). No change to the emitted CSS.
