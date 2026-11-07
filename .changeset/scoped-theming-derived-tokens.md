---
'@react-object-page/core': minor
---

Scoped theming now reaches the derived states: redeclaring `--color-rop-primary`, `--color-rop-error`, `--color-rop-surface-subtle` or `--color-rop-text-muted` on a wrapper moves the hover, pressed and read-only shades of the components inside it, instead of only the resting colour. Setting a derived token directly (for example `--color-rop-primary-hover`) still wins, now at any scope.

**Contract change:** `--color-rop-primary-hover`, `--color-rop-primary-active`, `--color-rop-error-hover`, `--color-rop-error-active`, `--color-rop-surface-pressed`, `--color-rop-readonly-surface` and `--color-rop-readonly-indicator` are no longer declared on `:root`. They are optional override slots, unset by default, so `var(--color-rop-primary-hover)` in your own CSS and `getPropertyValue()` no longer return a colour. Use the utility (`bg-rop-primary-hover`) in Tailwind mode, or copy the formula documented in the README.
