---
'@react-object-page/core': patch
---

`Button` `size="inline"` is now permanently underlined: inside running text, `text-rop-primary` on `text-rop-text` measures ~2.8:1, under the 3:1 WCAG 1.4.1/technique-G183 bar for relying on color alone to mark a link. Underline is permanent (not hover-only), since the indicator must be visible without interacting. Other sizes are unaffected.
