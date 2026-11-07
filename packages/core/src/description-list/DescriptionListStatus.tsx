import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { hasContent } from '../internal/react-nodes';
import { TruncatedText } from '../truncated-text/TruncatedText';
import { cn } from '../utils/cn';
import { STATUS_DETAIL, STATUS_ROOT, STATUS_SLOT } from './description-list-styles';

export interface DescriptionListStatusProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Usually a `StatusBadge`; any node works. `undefined`/`null`/empty: no badge. */
  status?: ReactNode;
  /**
   * Audit line next to the badge (e.g. "Archived on 12/10/2026 by M. Rossi"): one line, cut with
   * an ellipsis (`TruncatedText`, full text in the DOM and in a tooltip on real hover/focus).
   * `undefined`/`null`/`''`: no detail, and no orphan gap.
   */
  detail?: ReactNode;
}

/**
 * Status row of a record preview, rendered ABOVE a `DescriptionList` (a sibling, not a child of
 * the `<dl>`, where it would be invalid markup): badge, then an optional audit detail, on one line.
 *
 * The space is reserved for as long as the component is mounted, whatever it holds: with no status
 * and no detail it is an empty box of the same height (`min-height` = one `body` text line, which a
 * `StatusBadge` never exceeds), so switching between records does not move the list below it. An
 * empty row exposes nothing to assistive technology; a filled one is static (no `aria-live`:
 * changing record announces nothing) and reads badge, then detail. There is no transition.
 *
 * Status and audit are optional PER ENTITY, not uniform: mount it always for the kinds of entity
 * that MAY have a status, and not at all for kinds that never do.
 *
 * ```tsx
 * <DescriptionListStatus
 *   status={invoice.archivedAt ? <StatusBadge tone="warning">Archived</StatusBadge> : undefined}
 *   detail={invoice.archivedAt ? `Archived on ${date} by ${invoice.archivedBy}` : undefined}
 * />
 * <DescriptionList>…</DescriptionList>
 * ```
 */
export const DescriptionListStatus = /* @__PURE__ */ forwardRef<HTMLDivElement, DescriptionListStatusProps>(
  function DescriptionListStatus({ status, detail, className, ...rest }, ref) {
    const hasStatus = hasContent(status);
    const hasDetail = hasContent(detail);
    return (
      <div {...rest} ref={ref} className={cn(STATUS_ROOT, className)}>
        {hasStatus ? <span className={STATUS_SLOT}>{status}</span> : null}
        {hasDetail ? <TruncatedText className={STATUS_DETAIL}>{detail}</TruncatedText> : null}
      </div>
    );
  },
);
