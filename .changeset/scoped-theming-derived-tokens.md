---
'@react-object-page/core': minor
---

Scoped theming now reaches the derived states: redeclaring `--color-rop-primary`, `--color-rop-error`, `--color-rop-surface-subtle` or `--color-rop-text-muted` on a wrapper moves the hover, pressed and read-only shades of the components inside it, instead of only the resting colour. Setting a derived token directly (for example `--color-rop-primary-hover`) keeps working as before.

**Contract change:** `--color-rop-primary-hover`, `--color-rop-primary-active`, `--color-rop-error-hover`, `--color-rop-error-active`, `--color-rop-surface-pressed`, `--color-rop-readonly-surface` and `--color-rop-readonly-indicator` are no longer declared on `:root`. They are optional overrides, unset by default, so `var(--color-rop-primary-hover)` in your own CSS and `getPropertyValue()` no longer return a colour, and an alias such as `--color-rop-primary-active: var(--color-rop-primary-hover)` is now ignored in silence unless the target has a value.

In your own CSS use, on the element, `var(--color-rop-primary-hover, color-mix(in srgb, var(--color-rop-primary) 80%, black))`, or in Tailwind mode the utility (`bg-rop-primary-hover`) or `--theme(--color-rop-primary-hover)`. The same formula declared on `:root` brings the bug back for inner scopes.
