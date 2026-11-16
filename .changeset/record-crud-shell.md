---
---

Showcase (#519): the record-editing showcase is a shell (`RecordCrud`, with its list and record page) that receives a module descriptor (`RecordModule`); the invoices are its first module (`modules/invoices/`). The story-only add-ons of the Pro showcase are passed per module (`addons: { invoices: { reviewSave, useAddons } }`). `Showcase/Invoices` and `Pro/Showcase/Invoices with Change Summary` behave and look as before. Story-only; neither published package changes.
