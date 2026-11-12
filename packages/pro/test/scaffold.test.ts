import * as pro from '../src/index';
import type { UseObjectPageFormReturn } from '@formrail/core';
import type {
  ChangeEntry,
  ChangeKind,
  ChangeSummaryOptions,
  OpenRebaseConflict,
  RebaseConflict,
  RebaseOptions,
  RebaseResult,
  UseChangeSummaryReturn,
  UseFormRebaseOptions,
  UseFormRebaseReturn,
} from '../src/index';

describe('@formrail/pro scaffold', () => {
  it('loads the public entry', () => {
    expect(pro).toBeTypeOf('object');
  });

  it('exports exactly the change-summary engine, the form rebase (with RebaseNotice, #384) and the virtualized List Report at runtime', () => {
    expect(Object.keys(pro).sort()).toEqual([
      'ChangeSummary',
      'RebaseNotice',
      'VirtualListReport',
      'VirtualListReportTable',
      'computeChangeSummary',
      'computeRebase',
      'formatChangeValue',
      'inferSegmentLabel',
      'useChangeSummary',
      'useFormRebase',
    ]);
  });
});

describe('public types', () => {
  type Invoice = { number: string; lines: { id: number }[] };

  it('values and baseline share the same Values type', () => {
    expectTypeOf<ChangeSummaryOptions<Invoice>['values']>().toEqualTypeOf<Invoice>();
    expectTypeOf<ChangeSummaryOptions<Invoice>['baseline']>().toEqualTypeOf<Invoice>();
    expectTypeOf(pro.computeChangeSummary<Invoice>).parameter(0).toEqualTypeOf<ChangeSummaryOptions<Invoice>>();
    // @ts-expect-error -- baseline must have the same type as values
    pro.computeChangeSummary<Invoice>({ values: { number: 'a', lines: [] }, baseline: { other: 1 } });
  });

  it('describes ChangeEntry, ChangeKind and the hook return', () => {
    expectTypeOf<ChangeKind>().toEqualTypeOf<'added' | 'removed' | 'changed'>();
    expectTypeOf<ChangeEntry>().toEqualTypeOf<{
      path: string;
      labelPath: string[];
      label: string;
      kind: ChangeKind;
      before: unknown;
      after: unknown;
      beforeMissing: boolean;
      afterMissing: boolean;
    }>();
    expectTypeOf<UseChangeSummaryReturn>().toEqualTypeOf<{ entries: ChangeEntry[]; isEmpty: boolean }>();
    expectTypeOf(pro.computeChangeSummary).returns.toEqualTypeOf<ChangeEntry[]>();
    expectTypeOf(pro.useChangeSummary).returns.toEqualTypeOf<UseChangeSummaryReturn>();
    expectTypeOf(pro.inferSegmentLabel).toEqualTypeOf<(segment: string) => string>();
    expectTypeOf<NonNullable<ChangeSummaryOptions<Invoice>['isEqual']>>().toEqualTypeOf<
      (a: unknown, b: unknown, path: string) => boolean | undefined
    >();
  });

  it('describes the form rebase API', () => {
    expectTypeOf<RebaseOptions<Invoice>['baseline']>().toEqualTypeOf<Invoice>();
    expectTypeOf<RebaseOptions<Invoice>['values']>().toEqualTypeOf<Invoice>();
    expectTypeOf<RebaseOptions<Invoice>['incoming']>().toEqualTypeOf<Invoice>();
    expectTypeOf<RebaseOptions<Invoice>['isEqual']>().toEqualTypeOf<ChangeSummaryOptions<Invoice>['isEqual']>();
    expectTypeOf<RebaseConflict>().toEqualTypeOf<{
      path: string;
      label: string;
      base: unknown;
      mine: unknown;
      theirs: unknown;
      baseMissing: boolean;
      mineMissing: boolean;
      theirsMissing: boolean;
    }>();
    expectTypeOf<OpenRebaseConflict>().toEqualTypeOf<{
      path: string;
      label: string;
      base: unknown;
      mine: unknown;
      theirs: unknown;
      baseMissing: boolean;
      mineMissing: boolean;
      theirsMissing: boolean;
      currentPath: string;
      labelPath: string[];
    }>();
    expectTypeOf<RebaseResult<Invoice>>().toEqualTypeOf<{
      values: Invoice;
      baseline: Invoice;
      applied: ChangeEntry[];
      conflicts: RebaseConflict[];
    }>();
    expectTypeOf(pro.computeRebase<Invoice>).toEqualTypeOf<(options: RebaseOptions<Invoice>) => RebaseResult<Invoice>>();
    expectTypeOf(pro.useFormRebase<Invoice>).toEqualTypeOf<
      (form: UseObjectPageFormReturn<Invoice>, options?: UseFormRebaseOptions<Invoice>) => UseFormRebaseReturn<Invoice>
    >();
    expectTypeOf<UseFormRebaseReturn<Invoice>>().toEqualTypeOf<{
      rebase: (incoming: Invoice) => void;
      applied: ChangeEntry[];
      // #384: the open conflicts carry their current position.
      conflicts: OpenRebaseConflict[];
      acceptTheirs: (path: string) => void;
      keepMine: (path: string) => void;
      acceptAllTheirs: () => void;
      isPending: boolean;
    }>();
    // @ts-expect-error -- incoming must have the same type as values
    pro.computeRebase<Invoice>({ baseline: { number: 'a', lines: [] }, values: { number: 'a', lines: [] }, incoming: { other: 1 } });
  });
});
