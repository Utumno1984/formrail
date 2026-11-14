// Text helpers for the demo universe: turning display names (with accents, `ß`, `ø`, apostrophes)
// into the ASCII pieces of e-mail addresses and host names.

// Letters that Unicode decomposition does not reduce to a base letter plus a mark.
const SPECIAL_LETTERS: Readonly<Record<string, string>> = {
  ß: 'ss',
  ẞ: 'ss',
  ø: 'o',
  Ø: 'o',
  æ: 'ae',
  Æ: 'ae',
  œ: 'oe',
  Œ: 'oe',
  ł: 'l',
  Ł: 'l',
  đ: 'd',
  Đ: 'd',
  þ: 'th',
  Þ: 'th',
};

/**
 * Lower-case ASCII letters and digits only, the other characters dropped and the words joined with
 * `separator`: `toAsciiSlug("Jørgen O'Brien-Weiß", '.')` is `jorgen.obrien.weiss`.
 */
export function toAsciiSlug(text: string, separator = ''): string {
  const ascii = text
    .replace(/[ßẞøØæÆœŒłŁđĐþÞ]/g, (letter) => SPECIAL_LETTERS[letter]!)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
  return ascii
    .replace(/['’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join(separator);
}
