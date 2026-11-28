---
'@formrail/pro': minor
---

`RebaseNotice` now says which fields the server changed ("Price and Stock were updated.") instead of only counting them. Up to three fields are named in the sentence (new `labels.appliedFields`); beyond three the notice shows the count and a list of the fields with the value before and after, closed until opened (new `labels.appliedList`, `labels.appliedBefore`, `labels.appliedAfter`). The list shows every field without a scroll of its own up to 12 fields; beyond that it is capped in height (`--rop-pro-rebase-applied-max-height`) and scrolls, with a fade at the bottom (`--rop-pro-rebase-applied-fade`, 4.5rem (72px) by default, almost a full row pitch, so the cut is never mistaken for the end of the list) while rows are hidden, and it is a tab stop only while it scrolls. Replacing `labels.applied` alone keeps the old counting text. The `ChangeSummary` added / removed / changed badges now use the tokens and tones of `StatusBadge` (the tone at 10% on the surface, the dark text token, a contour and an icon in the tone; "changed" uses the info tone).

Theming note: the "Changed" badge now follows `--color-rop-info`, no longer `--color-rop-primary`; redefine `--color-rop-info` to recolour it. A redefined tone token must keep at least 3:1 against the surface and against its own tint (icon and contour), and the text stays the dark text token.

`RebaseNotice` grows by about 0.5 kB gzip for the field list, the cap and the fade; its bundle budget baseline was updated accordingly.
