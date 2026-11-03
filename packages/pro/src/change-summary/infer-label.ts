const UNNAMED = '(unnamed)';

/**
 * Human label for one path segment (an object key).
 *
 * Splits on camelCase boundaries (including acronym → word, `XMLParser` → `XML Parser`), on `_`,
 * `-` and on letter ↔ digit boundaries; leading, trailing and repeated separators collapse. Each
 * word gets its first letter upper-cased and the rest **unchanged**, so acronyms are preserved:
 * `lineItems` → `Line Items`, `LINE_ITEMS` → `LINE ITEMS`, `vatID` → `Vat ID`,
 * `address2` → `Address 2`, `città` → `Città`. A segment that is empty or only separators gives
 * `(unnamed)`. Other characters (dots, spaces, ...) are kept as they are.
 */
export function inferSegmentLabel(segment: string): string {
  const words = segment
    .replace(/(\p{Ll})(\p{Lu})/gu, '$1_$2')
    .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1_$2')
    .replace(/(\p{L})(\p{N})/gu, '$1_$2')
    .replace(/(\p{N})(\p{L})/gu, '$1_$2')
    .split(/[_-]+/)
    .filter((word) => word.length > 0);
  if (words.length === 0) return UNNAMED;
  return words
    .map((word) => {
      const first = String.fromCodePoint(word.codePointAt(0) as number);
      return first.toUpperCase() + word.slice(first.length);
    })
    .join(' ');
}

/** Label of an array index segment: `Item N`, N 1-based. */
export const itemLabel = (index: number): string => `Item ${index + 1}`;
