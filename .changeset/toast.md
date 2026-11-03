---
'@react-object-page/core': minor
---

Add `ToastProvider` and `useToast()`: one transient notification at a time (`show(options)` returns the id, `dismiss(id?)`; a new `show` replaces the visible toast and calls its `onDismiss('replaced')`). The provider mounts two empty live regions (`role="status"` and, for the `error` tone, `role="alert"`) so the message is announced, never takes the focus (F8 moves it to the toast on request, Escape inside it closes it and returns the focus), keeps a toast with an action until it is closed, and works inside a modal `Dialog` / `Sheet`. New z-index level `--z-index-rop-toast: 45` (`overlayLayer.toast`) between popover (40) and tooltip (50), new `--motion-rop-toast-*` motion tokens (no animation under `prefers-reduced-motion`), new direct dependency `@radix-ui/react-dismissable-layer`.
