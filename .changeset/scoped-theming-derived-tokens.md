---
'@react-object-page/core': minor
---

Scoped theming now reaches the derived states: redeclaring `--color-rop-primary`, `--color-rop-error`, `--color-rop-surface-subtle` or `--color-rop-text-muted` on a wrapper moves the hover, pressed and read-only shades of the components inside it, instead of only the resting colour. Setting a derived token directly (for example `--color-rop-primary-hover`) keeps working as before.

**Contract change:** `--color-rop-primary-hover`, `--color-rop-primary-active`, `--color-rop-error-hover`, `--color-rop-error-active`, `--color-rop-surface-pressed`, `--color-rop-readonly-surface` and `--color-rop-readonly-indicator` are no longer declared on `:root`. They are optional overrides, unset by default, so `var(--color-rop-primary-hover)` in your own CSS and `getPropertyValue()` no longer return a colour, and an alias such as `--color-rop-primary-active: var(--color-rop-primary-hover)` is now ignored in silence unless the target has a value.

In your own CSS use, on the element, `var(--color-rop-primary-hover, color-mix(in srgb, var(--color-rop-primary) 80%, black))`, or in Tailwind mode the utility (`bg-rop-primary-hover`) or `--theme(--color-rop-primary-hover)`. The same formula declared on `:root` brings the bug back for inner scopes.

**New requirement for Tailwind mode:** importing `theme.css` now requires `tailwindcss` 4.0.9 or later. Tailwind 4.0.0 to 4.0.8 compile it without any error but write a bare `var(--color-rop-primary-hover)`, so the derived states lose their color: a primary `Button` in hover shows white text on a transparent background. The compiled `styles.css` is not affected by the Tailwind version of your app.

`tailwindcss` is now an optional peer dependency, with range `<4.0.0 || >=4.0.9`. npm treats a conflict on it as an error: with Tailwind 4.0.0 to 4.0.8 installed, `npm install` stops with `ERESOLVE` even if you only use `styles.css`, so update Tailwind. An install without Tailwind or with Tailwind 3 goes through.
