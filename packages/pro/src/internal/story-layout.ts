import type { CSSProperties } from 'react';

/**
 * Story layout (#610): actions placed beside a `Field` in a row. A Field keeps one caption line plus the 0.5rem
 * gap of its message under the input (its error slot), so `alignItems: 'flex-end'` alone drops the actions below the
 * input by that much. The actions sit on the bottom edge of the INPUT: same box as the Field's slot (the caption line
 * token plus 0.5rem) as a bottom padding. Stories only: a library component never needs it.
 */
export const BESIDE_INPUT: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  paddingBottom: 'calc(var(--text-rop-caption--line-height) + 0.5rem)',
};
