---
'@react-object-page/core': patch
---

Derived color tokens: the README "Tokens" section is now the single description of their contract, and it adds the opacity-modifier limit (`bg-rop-primary-hover/50` ignores an override of the derived token in browsers without `color-mix(in oklab)`); the comment in `theme.css` only describes the mechanism and points to it. No change to any token or compiled style.
