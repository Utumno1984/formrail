// Grapheme-aware initials: "Élodie Ünal" -> "ÉÜ", "Ada" -> "A", a ZWJ emoji or a combining sequence
// is never split. `Intl.Segmenter` where available, `Array.from` (code points) otherwise.
function firstGrapheme(word: string): string {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const first = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(word)[Symbol.iterator]().next();
    if (!first.done) return first.value.segment;
  }
  return Array.from(word)[0] ?? '';
}

/** Upper-cased first grapheme of each of the first two whitespace-separated words; '' for a blank name. */
export function getInitials(name: string | undefined | null): string {
  if (typeof name !== 'string') return '';
  return name
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => firstGrapheme(word).toLocaleUpperCase())
    .join('');
}
