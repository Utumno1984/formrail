import { forwardRef, memo, useImperativeHandle, useState, type CSSProperties } from 'react';
import {
  edgeLayerClass,
  edgeShadowEndClass,
  edgeShadowStartClass,
  rowActionsInlineTableClass,
} from './list-report-table-styles';
import type { OverflowEdgesGeometry, OverflowEdgesSink } from './use-overflow-edges';

interface ListReportTableEdgesProps {
  /**
   * Width of the sticky row actions column (a CSS length), or `undefined` without one: the end shade
   * is drawn before that column, never over its buttons.
   */
  rowActionsWidth: string | undefined;
  /** `rowActionsInline` as used by the table (0 without inline actions): the column's width follows it. */
  inlineCount: number;
}

/**
 * @internal The shades on the inline edges of the List Report's scroll container that hide columns.
 * A layer placed after the `<table>`, inside the scroller: sticky at the bottom and at the inline start
 * of the scrollport, as wide as the scrollport and 0px tall (so it adds no scrollable size), with the
 * two shades hanging from it, as tall as the scrollport. After the table and on the sticky level, it
 * is painted above the sticky header and the opaque cells; it never takes a click (`pointer-events`)
 * and is hidden from assistive technology. Which shade shows is CSS alone, from the
 * `data-rop-overflow-*` attributes of the scroller (see `useOverflowEdges`); this component only
 * renders the layer while the table overflows sideways (nothing before the first measure, on the
 * server, nor when every column fits) and re-renders on its own, never the rows.
 */
const ListReportTableEdgesImpl = /* @__PURE__ */ forwardRef<OverflowEdgesSink, ListReportTableEdgesProps>(function ListReportTableEdges(
  { rowActionsWidth, inlineCount },
  ref,
) {
  const [geometry, setGeometry] = useState<OverflowEdgesGeometry | null>(null);
  useImperativeHandle(ref, () => ({ setGeometry }), []);
  if (!geometry) return null;
  const style = {
    '--rop-list-report-edge-height': `${geometry.height}px`,
    '--rop-list-report-edge-bottom': `${geometry.bottom}px`,
    '--rop-list-report-edge-end': rowActionsWidth ?? '0px',
    // Each gradient runs from the outer edge inwards: the start one from the left in ltr, from the right in rtl.
    '--rop-list-report-edge-start-to': geometry.rtl ? 'to left' : 'to right',
    '--rop-list-report-edge-end-to': geometry.rtl ? 'to right' : 'to left',
    ...(inlineCount > 0 ? { '--rop-list-report-row-actions-inline': inlineCount } : null),
  } as CSSProperties;
  return (
    <div aria-hidden="true" data-rop-overflow-edges="" className={inlineCount > 0 ? `${edgeLayerClass} ${rowActionsInlineTableClass}` : edgeLayerClass} style={style}>
      <div data-rop-overflow-edge="start" className={edgeShadowStartClass} />
      <div data-rop-overflow-edge="end" className={edgeShadowEndClass} />
    </div>
  );
});

export const ListReportTableEdges = /* @__PURE__ */ memo(ListReportTableEdgesImpl);
