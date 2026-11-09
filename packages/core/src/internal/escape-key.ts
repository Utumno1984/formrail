// `aria-activedescendant` is an ID reference list (split on whitespace): keys with spaces or any
// other unsafe character are escaped injectively (`_` itself too, so two keys never collide).
export const escapeKey = (key: string): string =>
  key.replace(/[^A-Za-z0-9-]/gu, (char) => `_${char.codePointAt(0)!.toString(16)}_`);
