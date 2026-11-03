---
'@react-object-page/core': minor
---

**Breaking (visible default text, no API/type change):** the remaining built-in fallback texts are now English instead of Italian (follow-up of #156). While the package is 0.x this is a minor bump. Consumers who do not pass the label explicitly now see:

- `ListReportTable` / `ListReport` state labels (`labels`): `loading` "Loading…" (was "Caricamento in corso…"), `empty` "No data" ("Nessun dato"), `noResults` "No results for the current filters" ("Nessun risultato per i filtri correnti"), `error` "Unable to load data" ("Impossibile caricare i dati"), `retry` "Retry" ("Riprova"), `clearFilters` "Clear filters" ("Azzera filtri"), `resultCount` "1 result" / "N results" ("1 risultato" / "N risultati").
- `ObjectPageFooter`: `label` "Save actions" (was "Azioni di salvataggio"); `toneLabel` "Error" / "Success" / "Information" (were "Errore" / "Operazione riuscita" / "Informazione").
- `ObjectPage` `labels.anchorBar` (accessible name of the Anchor Bar `<nav>`): "Sections" (was "Sezioni"). Found by the final grep, not in the original list of #164.
- `getErrorSummary` default message: "1 invalid field" / "N invalid fields" (were "1 campo non valido" / "N campi non validi").

Anyone passing these labels/messages explicitly is unaffected. To keep Italian, pass the previous strings. Tests or queries that match the old Italian defaults must be updated.
