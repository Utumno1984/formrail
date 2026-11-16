---
---

Test hardening (#559): new tests for mutations that survived (`checkLabelDefaults` list lengths, `createRecordApi` rounds, the double-click guard of `InvoiceCrud`, `null` in the save merge) and a TSDoc line in the internal `keepEditsSince` (cyclic values not supported). The TSDoc is not exported, so it reaches neither the bundle nor the `.d.ts` (only the source maps); no published package changes.
