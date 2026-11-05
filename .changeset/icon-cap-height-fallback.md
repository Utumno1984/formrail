---
'@react-object-page/core': patch
---

Icons next to a line of text (Checkbox, Switch, Radio, Toast, footer message, sort arrow, Select/Combobox check, `Text` with a direct-child icon) keep their cap-height centring in browsers without the `cap` unit (Safari < 17.2): a fixed `-0.1em` offset replaces the dropped `calc(0.5ex - 0.5cap)`, which left the icon on the x-height middle (~1px too low).
