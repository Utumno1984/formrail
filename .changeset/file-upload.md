---
'@react-object-page/core': minor
---

Add `FileUpload` (#338): a "Choose files" button plus a drop area with the list of selected files (name, size, remove). It only manages the selection (`File[]`); uploading is the consumer's. `accept` (extensions, MIME types, `image/*`), `maxSize` and `maxFiles` are enforced on the picker and on drops alike, and rejected files are reported to `onReject` (the consumer shows the message as the `Field` error). Inside a `Field` it takes id, description, invalid/required and `data-rop-name`; `forced`/`locked` keep the button focusable but open nothing and accept no drop. Emptying the list emits `[]`, never `undefined`. Exports `FileUpload`, `FileUploadProps`, `FileUploadLabels` and `FileRejection`.
