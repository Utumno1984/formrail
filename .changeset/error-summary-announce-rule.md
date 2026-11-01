---
'@react-object-page/core': minor
---

New `getErrorSummary(fieldErrors, options?)` (and its `GetErrorSummaryOptions` type): the one-line validation summary for `ObjectPageFooter`'s `message`, or `undefined` when there is no error. It counts the invalid paths of `fieldErrors` (keys whose value is not `undefined`, also paths with no control on the page and fields that are `forced`/`locked`/`disabled`) plus, when passed, `options.formErrors`. Default text in Italian ("1 campo non valido" / "N campi non validi"); `options.message: (count) => string` replaces it (the library does not translate: pass your own text). A pure function: the footer keeps its API and does not read the form.

The error announcement rule is now written in the JSDoc of `useObjectPageForm` and `ObjectPageFooter`: field errors are not live (`aria-invalid` + `aria-describedby`, read when `useFocusFirstInvalidField` moves the focus there); the validation summary and the `saveError` go to the footer's polite `role="status"`, and the `saveError`, when present, takes the place of the summary; a blocking page error is a `MessageStrip` (`role="alert"`). The doc of the footer's `message` prop now says that the summary with the count belongs there and the single field messages do not. No ARIA role changes.
