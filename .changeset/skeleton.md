---
'@react-object-page/core': minor
---

Add `Skeleton`: a decorative (`aria-hidden`, never focusable) loading placeholder with `text` / `rect` / `circle` variants. A `text` line is exactly as tall as the `Text` / `Title` step it replaces (`textVariant`), `lines` renders several with a shorter last one, and the pulse is a single CSS animation driven by new `--motion-rop-skeleton-*` tokens, applied only under `motion-safe:`. Forced-colors keeps the shape visible.
