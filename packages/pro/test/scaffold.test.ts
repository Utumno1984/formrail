import * as pro from '../src/index';
import type { ChangeEntry, ChangeKind, ChangeSummaryOptions, UseChangeSummaryReturn } from '../src/index';

describe('@react-object-page/pro scaffold', () => {
  it('loads the public entry', () => {
    expect(pro).toBeTypeOf('object');
  });

  it('exports exactly the change-summary engine and the virtualized List Report at runtime', () => {
    expect(Object.keys(pro).sort()).toEqual([
      'ChangeSummary',
      'VirtualListReport',
      'VirtualListReportTable',
      'computeChangeSummary',
      'formatChangeValue',
      'inferSegmentLabel',
      'useChangeSummary',
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
    }>();
    expectTypeOf<UseChangeSummaryReturn>().toEqualTypeOf<{ entries: ChangeEntry[]; isEmpty: boolean }>();
    expectTypeOf(pro.computeChangeSummary).returns.toEqualTypeOf<ChangeEntry[]>();
    expectTypeOf(pro.useChangeSummary).returns.toEqualTypeOf<UseChangeSummaryReturn>();
    expectTypeOf(pro.inferSegmentLabel).toEqualTypeOf<(segment: string) => string>();
    expectTypeOf<NonNullable<ChangeSummaryOptions<Invoice>['isEqual']>>().toEqualTypeOf<
      (a: unknown, b: unknown, path: string) => boolean | undefined
    >();
  });
});
