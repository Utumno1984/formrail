---
'@formrail/core': patch
---

`FileUpload`: the focus after removing a file is now handled by a shared internal hook (#417), also used by the invoice showcase's line items. Same behaviour (the Remove button of the file that takes the place of the removed one, else of the previous one, else "Choose files"), plus two edge fixes for a controlled `value`: a removal the consumer refuses and then follows with a different list no longer moves the focus later, and with two identical files the heir is computed on the list after the removal. The `data-file-key` attribute on the list items is gone (it was never documented). No new public API.
