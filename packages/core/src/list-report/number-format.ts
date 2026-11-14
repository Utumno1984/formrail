import { resolveLocale } from '../calendar/locale';

/**
 * Locales for `Intl.NumberFormat` from the `locale` option of `useListReport` (spec §1.13.3): each
 * structurally invalid tag is dropped (same rule as `resolveLocale`), none left means the runtime
 * default (`undefined`). The library never reads `navigator.language`.
 */
export function resolveLocales(locale: string | readonly string[] | undefined): string[] | undefined {
  const list: readonly unknown[] = typeof locale === 'string' ? [locale] : Array.isArray(locale) ? locale : [];
  const valid = list
    .map((l) => (typeof l === 'string' ? resolveLocale(l) : undefined))
    .filter((l): l is string => l !== undefined);
  return valid.length > 0 ? valid : undefined;
}

const cache = new Map<string, Intl.NumberFormat>();

/**
 * `Intl.NumberFormat` of `locale`, memoized per resolved locale list (not one per render). Without a
 * usable locale it is the runtime default, which is not cached: the default can differ per call on a server.
 */
export function getNumberFormat(locale: string | readonly string[] | undefined): Intl.NumberFormat {
  const locales = resolveLocales(locale);
  if (!locales) return new Intl.NumberFormat(undefined);
  const key = locales.join(',');
  let format = cache.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locales);
    cache.set(key, format);
  }
  return format;
}
