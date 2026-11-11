---
'@formrail/core': minor
'@formrail/pro': minor
---

Rebrand (#428): the project is now **Formrail**. `@formrail/core` is renamed from `@react-object-page/core`, and `@formrail/pro` from `@react-object-page/pro`; the repository moves to `github.com/Utumno1984/formrail` and the docs to `utumno1984.github.io/formrail/`. The API, the CSS entries and the design tokens (`--color-rop-*`, `--text-rop-*`, ...) are unchanged: to migrate, replace the package name in your `package.json` and in every import (`@react-object-page/core` → `@formrail/core`, including the `/styles.css` and `/theme.css` subpaths, and `@source '../node_modules/@formrail/core/dist'` on Tailwind v4). Breaking for tooling that matches the development messages: their prefix changes from `[react-object-page]` to `[formrail]` (`[formrail/pro]` in the Pro package). Entries in this changelog before this release were published under the old name.
