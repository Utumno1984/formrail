---
'@react-object-page/core': patch
---

Demo-only fix: the `FieldMessage` (Playground, SideBySide) and Typography (AsLabel) stories now pair their text with the real `Input` primitive instead of a bare, unstyled native `<input>` — those stories predate `Input`/`Field` (tickets #8/#9) and were never updated. No change to any shipped component.
