---
'@react-object-page/core': patch
---

Stories only, no API or default change: the `StateMatrix` stories of Checkbox, Switch and RadioGroup no longer reserve the Field error line (`reserveMessageSpace={false}`) and use a uniform 24px grid gap, so the space between adjacent entries is the same everywhere in the single-column reflow on mobile (an "invalid" entry used to fill the reserved line with its error, leaving a narrower gap before the next group).
