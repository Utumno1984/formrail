---
'@react-object-page/core': minor
---

**Breaking (visible default text, no API/type change):** the built-in fallback texts are now English instead of Italian. While the package is 0.x this is a minor bump. Consumers who do not pass the label explicitly now see:

- `useDirtyGuard` `labels`: `title` "Unsaved changes", `description` "You have unsaved changes: leaving now will lose them.", `stay` "Keep editing", `leave` "Leave without saving" (were "Modifiche non salvate", "Ci sono modifiche non salvate: se esci ora andranno perse.", "Continua a modificare", "Esci senza salvare").
- Default close button of `Dialog` / `Sheet` / dirty-guard dialog: accessible name "Close: <title>" (was "Chiudi: <title>"), "Close" when there is no title (was "Chiudi").
- `Select` `emptyLabel`: "No options" (was "Nessuna opzione").
- `Combobox` `emptyLabel`: "No results" (was "Nessun risultato").

Scope: only these four defaults change here. Other Italian defaults (`ListReport` table states, `ObjectPageFooter`, the error-summary message) are still Italian and are tracked in #164.

Anyone passing these labels explicitly is unaffected. To keep Italian, pass the previous strings. Tests or queries that match the old Italian defaults must be updated.
