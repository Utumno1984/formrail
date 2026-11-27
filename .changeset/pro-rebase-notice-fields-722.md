---
'@formrail/pro': minor
---

`RebaseNotice` now says which fields the server changed ("Price and Stock were updated.") instead of only counting them. Up to three fields are named in the sentence (new `labels.appliedFields`); beyond three the notice shows the count and a list of the fields with the value before and after, closed until opened (new `labels.appliedList`, `labels.appliedBefore`, `labels.appliedAfter`). Replacing `labels.applied` alone keeps the old counting text. The `ChangeSummary` added / removed / changed badges now use the tokens and tones of `StatusBadge` (the tone at 10% on the surface, the dark text token, a contour and an icon in the tone; "changed" uses the info tone).
