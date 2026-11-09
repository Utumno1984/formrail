import { matchesAccept } from './accept';

export interface FileRejection {
  file: File;
  /** `type`: not allowed by `accept`; `size`: larger than `maxSize`; `count`: no room left (`maxFiles`, or a single-file control). */
  reason: 'type' | 'size' | 'count';
}

export interface SelectionRules {
  accept?: string | undefined;
  maxSize?: number | undefined;
  maxFiles?: number | undefined;
  multiple: boolean;
}

/** Identity of a file for de-duplication: name + size + last modified. */
export const fileIdentity = (file: File): string => `${file.name}\u0000${file.size}\u0000${file.lastModified}`;

export interface SelectionResult {
  next: File[];
  rejections: FileRejection[];
  /** `true` when `next` differs from `current` (a gesture of only rejected or duplicate files does not). */
  changed: boolean;
}

/**
 * Applies one gesture (picker or drop) to the current list. Every incoming file is checked, in
 * order: `accept`, then `maxSize`; the valid ones that are not already present (same identity) are
 * added until the room runs out (`maxFiles`), the rest is rejected as `count`. Without `multiple`
 * the first valid file replaces the current one and the other valid ones are rejected as `count`.
 */
export function resolveSelection(
  current: readonly File[],
  incoming: readonly File[],
  rules: SelectionRules,
): SelectionResult {
  const rejected = new Map<File, FileRejection['reason']>();
  const valid: File[] = [];
  for (const file of incoming) {
    if (!matchesAccept(file, rules.accept)) rejected.set(file, 'type');
    else if (rules.maxSize !== undefined && file.size > rules.maxSize) rejected.set(file, 'size');
    else valid.push(file);
  }

  let next: File[];
  if (!rules.multiple) {
    const [first, ...rest] = valid;
    rest.forEach((file) => rejected.set(file, 'count'));
    next = first ? [first] : [...current];
  } else {
    next = [...current];
    const seen = new Set(next.map(fileIdentity));
    const limit = rules.maxFiles ?? Infinity;
    for (const file of valid) {
      const identity = fileIdentity(file);
      if (seen.has(identity)) continue;
      if (next.length >= limit) rejected.set(file, 'count');
      else {
        next.push(file);
        seen.add(identity);
      }
    }
  }

  const rejections = incoming.flatMap((file) => {
    const reason = rejected.get(file);
    return reason ? [{ file, reason }] : [];
  });
  const changed =
    next.length !== current.length || next.some((file, i) => fileIdentity(file) !== fileIdentity(current[i]!));
  return { next, rejections, changed };
}

/** `1.5 kB` / `2.3 MB` (decimal units, as `Intl`'s `kilobyte` / `megabyte`), in `locale`. */
export function formatFileSize(bytes: number, locale?: string): string {
  // The unit is chosen on the value as displayed (kB rounded to one decimal, half up like `Intl`):
  // 999 950 bytes would otherwise read "1,000 kB" instead of "1 MB".
  const mega = Math.round(bytes / 100) >= 10_000;
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: mega ? 'megabyte' : 'kilobyte',
    maximumFractionDigits: 1,
  }).format(mega ? bytes / 1_000_000 : bytes / 1000);
}
