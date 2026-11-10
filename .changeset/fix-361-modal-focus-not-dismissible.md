---
'@react-object-page/core': patch
---

Fix (#361): `Dialog` / `Sheet` with `dismissible={false}` now also keep the focus inside the panel when the backdrop is pressed (the browser no longer moves it to `body`), not just stay open. `ConfirmDialog` reuses this guarantee instead of its own listener.
