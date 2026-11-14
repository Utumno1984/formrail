// Entry of `@formrail/pro/engine` (ticket #489): the Change Summary and Form Rebase engines, usable
// without `@formrail/core` (with React Hook Form, TanStack Form or a form of your own). Nothing reached from
// here imports `@formrail/core`, not even a type: `test/engine-boundary.test.ts` walks the import graph and
// `test/dist.engine.test.ts` reads the built files. The visual components (`ChangeSummary`, `RebaseNotice`)
// use core's tokens and `cn`, so they stay in the main entry `@formrail/pro`, which re-exports all of this.
export { computeChangeSummary } from './change-summary/compute-change-summary';
export { useChangeSummary } from './change-summary/use-change-summary';
export { inferSegmentLabel } from './change-summary/infer-label';
export { formatChangeValue } from './change-summary/format-change-value';
export type { ChangeSummaryValueLabels, FormatChangeValueOptions } from './change-summary/format-change-value';
export type {
  ChangeEntry,
  ChangeKind,
  ChangeSummaryOptions,
  UseChangeSummaryReturn,
} from './change-summary/types';
export { computeRebase } from './form-rebase/compute-rebase';
export { useFormRebase } from './form-rebase/use-form-rebase';
export type {
  OpenRebaseConflict,
  RebaseConflict,
  RebaseFormBinding,
  RebaseOptions,
  RebaseResult,
  UseFormRebaseOptions,
  UseFormRebaseReturn,
} from './form-rebase/types';
