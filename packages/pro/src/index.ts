// Public entry of @formrail/pro.
// The engines come from the engine entry (`@formrail/pro/engine`, #489): in the build they are imported from
// `dist/engine.*`, never bundled a second time here, so an app that imports both entries loads them once.
export { computeChangeSummary, useChangeSummary, inferSegmentLabel, formatChangeValue, computeRebase } from './engine';
export { ChangeSummary } from './change-summary/ChangeSummary';
export type { ChangeSummaryProps } from './change-summary/ChangeSummary';
export type { ChangeSummaryValueLabels, FormatChangeValueOptions } from './engine';
export type {
  ChangeEntry,
  ChangeKind,
  ChangeSummaryOptions,
  UseChangeSummaryReturn,
} from './engine';
// Typed for core's form (unchanged signature); `@formrail/pro/engine` exports the hook for any `RebaseFormBinding`.
export { useFormRebase } from './form-rebase/use-form-rebase-core';
export { RebaseNotice } from './form-rebase/RebaseNotice';
export type { RebaseNoticeLabels, RebaseNoticeProps } from './form-rebase/RebaseNotice';
export type {
  OpenRebaseConflict,
  RebaseConflict,
  RebaseFormBinding,
  RebaseOptions,
  RebaseResult,
  UseFormRebaseOptions,
  UseFormRebaseReturn,
} from './engine';
export { VirtualListReportTable } from './list-report/VirtualListReportTable';
export type { VirtualListReportTableHandle, VirtualListReportTableProps } from './list-report/VirtualListReportTable';
export { VirtualListReport } from './list-report/VirtualListReport';
export type { VirtualListReportLabels, VirtualListReportProps } from './list-report/VirtualListReport';
