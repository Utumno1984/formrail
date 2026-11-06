/**
 * Lower-cases and strips diacritics: "Café" and "CAFE" compare equal. Shared by the combobox
 * filter and the List Report search so both match text the same way. It does not trim.
 */
export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}
