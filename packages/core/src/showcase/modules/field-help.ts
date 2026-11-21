// Story-only (#384): shared by the record-editing modules (sales orders, customers). Not exported by the package.
import type { ReactNode } from 'react';

/**
 * Story-only (#384): the props of a Field for the help an addon gives it. A help takes the room the Field reserves
 * for a one-line error (the same height: the gap and one caption line), so a help appearing or going away moves
 * nothing below the Field; with an error shown as well, the Field grows by the help line. No help: no prop at all
 * (the Field exactly as without an addon).
 */
export function helpProps(
  fieldHelp: ((path: string) => ReactNode) | undefined,
  path: string,
): { help?: ReactNode; reserveMessageSpace?: boolean } {
  const help = fieldHelp?.(path);
  return help === undefined || help === null || help === false ? {} : { help, reserveMessageSpace: false };
}
