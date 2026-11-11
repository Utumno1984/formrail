---
'@formrail/core': minor
---

`MenuContent` gets a `loop` prop (default `true`, the behaviour it always had): with `loop={false}` the arrow keys stop at the first / last item instead of wrapping. Internally, the touch "outside tap" swallow of `Menu`, the late-dismissal guard of `Dialog` / `Sheet` and the "next tabbable after X" / document-order helpers now live in shared `internal/` modules; no other behaviour change.
