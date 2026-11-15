import { describe, expect, it } from 'vitest';
import { checkLabelDefaults, fillProse, placeholdersOf, proseText, type LabelExample, type LabelRow, type LabelSource } from './label-defaults';

// #549: the generic comparison of `label-defaults.ts`, on synthetic rows (the shape `measureLabels` returns) and
// sources. Each case is one way the prose and the code can disagree, or one way a key could escape the check.

const FILE = 'packages/core/src/x/X.tsx';
const row = (iface: string, key: string, prose: string | undefined, file = FILE): LabelRow => ({ iface, key, file, ...(prose === undefined ? {} : { prose }) });
const inCore = (r: LabelRow) => r.file.startsWith('packages/core/');
const run = (rows: LabelRow[], sources: LabelSource[], exceptions: { iface: string; key: string; reason: string }[] = []) =>
  checkLabelDefaults(rows, { sources, exceptions, inScope: inCore, registry: 'REGISTRY.tsx' });

describe('proseText: the value as the guard reads it, without its one pair of quotes', () => {
  it('strips backticks, double, single and typographic quotes, once', () => {
    expect(proseText('`Next page`')).toBe('Next page');
    expect(proseText('"1 result"')).toBe('1 result');
    expect(proseText("'Yours'")).toBe('Yours');
    expect(proseText('“Done”')).toBe('Done');
    expect(proseText('‘Done’')).toBe('Done');
  });
  it('keeps quotes written inside the backticks (`\'Yours\'` is not `Yours`) and everything else as is', () => {
    expect(proseText("`'Yours'`")).toBe("'Yours'");
    expect(proseText('`Close: <title>`')).toBe('Close: <title>');
    expect(proseText('`Page ${page}`')).toBe('Page ${page}');
    expect(proseText('1')).toBe('1');
    expect(proseText('`')).toBe('`');
  });
});

describe('placeholdersOf / fillProse', () => {
  it('reads `<...>` and `${...}` placeholders in order', () => {
    expect(placeholdersOf('<action label> <row label>')).toEqual(['<action label>', '<row label>']);
    expect(placeholdersOf('Page ${page}')).toEqual(['${page}']);
    expect(placeholdersOf('No files selected')).toEqual([]);
  });
  it('fills whole words only, and throws on a placeholder that is not in the prose', () => {
    expect(fillProse('(n)', { n: '1' })).toBe('(1)');
    expect(fillProse('Close: <title>', { '<title>': 'Unsaved $& changes' })).toBe('Close: Unsaved $& changes');
    expect(fillProse('no items, n', { n: '3' })).toBe('no items, 3');
    expect(() => fillProse('(count)', { n: '1' })).toThrow('the placeholder "n" of `fill` is not in the prose "(count)"');
  });
});

describe('checkLabelDefaults: prose and code agree', () => {
  it('a text, a function by its placeholders, a function by its example, an object by its member, a filled rendering, an inherited key', () => {
    const rows = [
      row('ALabels', 'save', '`Save`'),
      row('ALabels', 'remove', '`Remove <file name>`'),
      row('ALabels', 'page', '`Page ${page}`'),
      row('ALabels', 'pair', '`<action label> <row label>`'),
      row('ALabels', 'count', '`1 item selected`'),
      row('ALabels', 'tones', '`Information`'),
      row('BLabels', 'close', '`Close: <title>`'),
      row('BLabels', 'total', '`(n)`'),
      row('BaseLabels', 'next', '`Next month`'),
    ];
    const result = run(rows, [
      {
        iface: 'ALabels',
        from: 'A',
        values: {
          save: 'Save',
          remove: (name: string) => `Remove ${name}`,
          page: (page: number) => `Page ${page}`,
          pair: (a: string, b: string) => `${a} ${b}`,
          count: (n: number) => (n === 1 ? '1 item selected' : `${n} items selected`),
          tones: { info: 'Information', error: 'Error' },
        },
        examples: { count: { args: [1] }, tones: { args: ['info'] } },
      },
      {
        iface: 'BLabels',
        inherits: ['BaseLabels'],
        from: 'rendering of B',
        values: { close: 'Close: Unsaved changes', total: '(1)', next: 'Next month' },
        examples: { close: { fill: { '<title>': 'Unsaved changes' } }, total: { fill: { n: '1' } } },
      },
    ]);
    expect(result.problems).toEqual([]);
    expect(result.verified).toEqual(['ALabels.count', 'ALabels.page', 'ALabels.pair', 'ALabels.remove', 'ALabels.save', 'ALabels.tones', 'BLabels.close', 'BLabels.total', 'BaseLabels.next']);
    expect(result.excepted).toEqual([]);
  });

  it('an inherited key verified by two sources counts once, under the interface that declares it', () => {
    const rows = [row('CalendarLabels', 'next', '`Next month`'), row('DatePickerLabels', 'choose', '`Choose date`')];
    const result = run(rows, [
      { iface: 'CalendarLabels', from: 'Calendar', values: { next: 'Next month' } },
      { iface: 'DatePickerLabels', inherits: ['CalendarLabels'], from: 'DatePicker', values: { choose: 'Choose date', next: 'Next month' } },
    ]);
    expect(result.problems).toEqual([]);
    expect(result.verified).toEqual(['CalendarLabels.next', 'DatePickerLabels.choose']);
  });

  it('only the rows in scope must be covered; a key out of scope verified through `inherits` is not counted here', () => {
    const rows = [row('ProLabels', 'action', '`Act`', 'packages/pro/src/P.tsx'), row('FrameLabels', 'clear', '`Clear`')];
    const result = run(rows, [{ iface: 'FrameLabels', from: 'Frame', values: { clear: 'Clear' } }]);
    expect(result.problems).toEqual([]);
    expect(result.verified).toEqual(['FrameLabels.clear']);
  });
});

describe('checkLabelDefaults: a prose that drifted from the code fails, naming interface, key, prose and real value', () => {
  it('a text changed in the code (FileUpload-like: `Choose files` -> `Pick files`)', () => {
    const result = run([row('FileUploadLabels', 'chooseFiles', '`Choose files`')], [{ iface: 'FileUploadLabels', from: 'DEFAULT_LABELS of FileUpload.tsx', values: { chooseFiles: 'Pick files' } }]);
    expect(result.verified).toEqual([]);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain('FileUploadLabels.chooseFiles (packages/core/src/x/X.tsx): the prose states "Choose files", the code has "Pick files" (DEFAULT_LABELS of FileUpload.tsx)');
  });

  it('a function key called with its placeholders (DatePicker-like: `Remove <file name>` vs `Delete <file name>`)', () => {
    const result = run([row('XLabels', 'remove', '`Remove <file name>`')], [{ iface: 'XLabels', from: 'X', values: { remove: (n: string) => `Delete ${n}` } }]);
    expect(result.problems[0]).toContain('XLabels.remove');
    expect(result.problems[0]).toContain('the prose states "Remove <file name>", the code has "Delete <file name>" (X called with ("<file name>"))');
  });

  it('a function key called with the example of the prose (RebaseNotice-like: `1 field was updated.` vs `1 field updated.`)', () => {
    const result = run(
      [row('RebaseNoticeLabels', 'applied', '`1 field was updated.`')],
      [{ iface: 'RebaseNoticeLabels', from: 'DEFAULT_REBASE_NOTICE_LABELS', values: { applied: (n: number) => (n === 1 ? '1 field updated.' : `${n} fields updated.`) }, examples: { applied: { args: [1] } } }],
    );
    expect(result.problems[0]).toContain('RebaseNoticeLabels.applied');
    expect(result.problems[0]).toContain('the prose states "1 field was updated.", the code has "1 field updated." (DEFAULT_REBASE_NOTICE_LABELS called with (1))');
  });

  it("quotes inside the backticks are part of the value: `'Yours'` is not `Yours` (note BASSA 2 of PR #548)", () => {
    const result = run([row('RebaseNoticeLabels', 'mine', "`'Yours'`")], [{ iface: 'RebaseNoticeLabels', from: 'R', values: { mine: 'Yours' } }]);
    expect(result.problems[0]).toContain(`the prose states "'Yours'", the code has "Yours"`);
  });

  it('an object key compared on its member (Toast-like: tones.info)', () => {
    const result = run([row('ToastLabels', 'tones', '`Information`')], [{ iface: 'ToastLabels', from: 'TONE_LABEL', values: { tones: { info: 'Info' } }, examples: { tones: { args: ['info'] } } }]);
    expect(result.problems[0]).toContain('the prose states "Information", the code has "Info" (TONE_LABEL["info"])');
  });

  it('a rendered text compared after the placeholders are filled (DirtyGuard-like: the X of the dialog)', () => {
    const result = run(
      [row('DirtyGuardLabels', 'close', '`Close: <title>`')],
      [{ iface: 'DirtyGuardLabels', from: 'rendering', values: { close: 'Close Unsaved changes' }, examples: { close: { fill: { '<title>': 'Unsaved changes' } } } }],
    );
    expect(result.problems[0]).toContain('the prose states "Close: <title>" (with the placeholders filled: "Close: Unsaved changes"), the code has "Close Unsaved changes" (rendering)');
  });

  it('an inherited key whose copy in a second component drifted (DatePicker-like copy of the calendar texts)', () => {
    const rows = [row('CalendarLabels', 'next', '`Next month`')];
    const result = run(rows, [
      { iface: 'CalendarLabels', from: 'Calendar', values: { next: 'Next month' } },
      { iface: 'DatePickerLabels', inherits: ['CalendarLabels'], from: 'DatePicker', values: { next: 'Following month' } },
    ]);
    expect(result.problems.some((p) => p.includes('CalendarLabels.next') && p.includes('the code has "Following month" (DatePicker)'))).toBe(true);
  });
});

describe('checkLabelDefaults: a key that cannot be verified fails, saying how to give it a source or an exception', () => {
  it('a key with no source (a new interface, or a new key of a rendered one)', () => {
    const result = run([row('NewLabels', 'title', '`Title`'), row('BLabels', 'old', '`Old`'), row('BLabels', 'added', '`Added`')], [{ iface: 'BLabels', from: 'rendering of B', values: { old: 'Old' } }]);
    expect(result.verified).toEqual(['BLabels.old']);
    expect(result.problems).toHaveLength(2);
    expect(result.problems[0]).toContain('BLabels.added (packages/core/src/x/X.tsx): no source of the real value. Add a source for BLabels to `labelSources()` of REGISTRY.tsx');
    expect(result.problems[0]).toContain('or list the key in LABEL_EXCEPTIONS of that file with the reason');
    expect(result.problems[1]).toContain('NewLabels.title (packages/core/src/x/X.tsx): no source of the real value');
  });

  it('a function key whose prose is an example without the arguments of the example (`page: (n) => ...`, prose `2 items`)', () => {
    const result = run([row('XLabels', 'count', '`2 items`')], [{ iface: 'XLabels', from: 'X', values: { count: (n: number) => `${n} items` } }]);
    expect(result.verified).toEqual([]);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain('XLabels.count (packages/core/src/x/X.tsx), source X: a function key whose prose states no placeholder');
    expect(result.problems[0]).toContain('`examples.<key>.args`');
    expect(result.problems[0]).toContain('LABEL_EXCEPTIONS with the reason');
  });

  it('an object key with more members than the prose lists and no member named, a member that is missing, a function that throws or returns no text', () => {
    const rows = [row('XLabels', 'tones', '`Information`'), row('XLabels', 'other', '`Error`'), row('XLabels', 'boom', '`<x>`'), row('XLabels', 'num', '`<x>`')];
    const result = run(rows, [
      {
        iface: 'XLabels',
        from: 'X',
        values: {
          tones: { info: 'Information', error: 'Error' },
          other: { info: 'Information' },
          boom: () => {
            throw new Error('no');
          },
          num: () => 3,
        },
        examples: { other: { args: ['error'] } },
      },
    ]);
    expect(result.verified).toEqual([]);
    expect(result.problems).toEqual([
      'XLabels.boom (packages/core/src/x/X.tsx), source X: the function of the source throws called with ("<x>"): Error: no',
      'XLabels.num (packages/core/src/x/X.tsx), source X: the function of the source returns 3 called with ("<x>"), not a text',
      'XLabels.other (packages/core/src/x/X.tsx), source X: the object of the source has no member "error" (members: info)',
      "XLabels.tones (packages/core/src/x/X.tsx), source X: an object of 2 texts (info, error) and a prose that lists 1 value: list every member's text in the prose, in the order of the members, or name the member of each value in `examples.<key>` (`{ args: ['info'] }`)",
    ]);
  });

  it('a key whose prose states no default, a text key with `args`, a value that is neither text, function nor object', () => {
    const rows = [row('XLabels', 'none', undefined), row('XLabels', 'text', '`A`'), row('XLabels', 'n', '`1`')];
    const result = run(rows, [{ iface: 'XLabels', from: 'X', values: { none: 'x', text: 'A', n: 1 }, examples: { text: { args: [1] } } }]);
    expect(result.problems).toEqual([
      'XLabels.n (packages/core/src/x/X.tsx), source X: the source gives 1, neither a text, a function nor an object of texts',
      'XLabels.none (packages/core/src/x/X.tsx): the prose states no default ("Default `x`."): the guard (`npm run default-column:check`) reports it as label-no-default; nothing to compare',
      'XLabels.text (packages/core/src/x/X.tsx), source X: the source gives a text, but `examples` has `args` for it: `args` is for a function or an object key, remove it',
    ]);
  });

  it('two interfaces of one name (the guard\'s collision row) fail instead of hiding the second one', () => {
    const rows = [row('XLabels', 'a', '`A`'), { iface: 'XLabels', key: 'a', file: 'packages/core/src/y/Y.tsx', collision: true, otherFile: FILE }];
    const result = run(rows, [{ iface: 'XLabels', from: 'X', values: { a: 'A' } }]);
    expect(result.problems).toEqual([
      'XLabels.a: two different interfaces named XLabels (packages/core/src/x/X.tsx and packages/core/src/y/Y.tsx): the guard reads them as one and the second is not compared; rename one of them',
    ]);
  });
});

describe('checkLabelDefaults: stale sources, examples and exceptions fail', () => {
  it('a source of an interface the guard does not read, a key it does not read, an example of no key, an unknown `inherits`', () => {
    const rows = [row('XLabels', 'a', '`A`')];
    const result = run(rows, [
      { iface: 'XLabels', inherits: ['GoneLabels'], from: 'X', values: { a: 'A', b: 'B' }, examples: { c: { args: [1] } } },
      { iface: 'OldLabels', from: 'Old', values: {} },
    ]);
    expect(result.verified).toEqual(['XLabels.a']);
    expect(result.problems).toEqual([
      'OldLabels (source: Old, REGISTRY.tsx): the guard reads no key of OldLabels here: remove the source or fix the name of the interface',
      'XLabels (source: X, REGISTRY.tsx): `examples` has the key c, which is not in the values of the source: remove it',
      'XLabels (source: X, REGISTRY.tsx): `inherits` names GoneLabels, of which the guard reads no key: remove it or fix the name',
      'XLabels (source: X, REGISTRY.tsx): the source has the key b, which the guard does not read under XLabels or GoneLabels: a key the interface no longer has (remove it), or an interface it inherits from (add it to `inherits`)',
    ]);
  });

  it('a fill placeholder that is not in the prose any more', () => {
    const result = run([row('XLabels', 'count', '`(count)`')], [{ iface: 'XLabels', from: 'X', values: { count: '(1)' }, examples: { count: { fill: { n: '1' } } } }]);
    expect(result.problems).toEqual(['XLabels.count (packages/core/src/x/X.tsx), source X: the placeholder "n" of `fill` is not in the prose "(count)"']);
  });

  it('exceptions: a valid one covers its key; without a reason, matching no key in scope, duplicated, or on a verified key, it fails', () => {
    const rows = [row('XLabels', 'a', '`A`'), row('XLabels', 'b', '`B`'), row('ProLabels', 'p', '`P`', 'packages/pro/src/P.tsx')];
    const valid = run(rows, [], [
      { iface: 'XLabels', key: 'a', reason: 'rendered only by a portal the test cannot open' },
      { iface: 'XLabels', key: 'b', reason: 'same' },
    ]);
    expect(valid.problems).toEqual([]);
    expect(valid.excepted).toEqual(['XLabels.a', 'XLabels.b']);

    const result = run(rows, [{ iface: 'XLabels', from: 'X', values: { a: 'A' } }], [
      { iface: 'XLabels', key: 'a', reason: 'not needed' },
      { iface: 'XLabels', key: 'b', reason: '  ' },
      { iface: 'XLabels', key: 'gone', reason: 'renamed' },
      { iface: 'ProLabels', key: 'p', reason: 'a Pro key listed in the core registry' },
      { iface: 'XLabels', key: 'gone', reason: 'renamed' },
    ]);
    expect(result.verified).toEqual(['XLabels.a']);
    expect(result.excepted).toEqual([]);
    expect(result.problems).toEqual([
      'ProLabels.p: an exception of LABEL_EXCEPTIONS (REGISTRY.tsx) that matches no key the guard reads here (a key renamed or removed): remove it',
      'XLabels.a (packages/core/src/x/X.tsx): verified by X and also listed in LABEL_EXCEPTIONS of REGISTRY.tsx: remove the exception',
      'XLabels.b (packages/core/src/x/X.tsx): no source of the real value. Add a source for XLabels to `labelSources()` of REGISTRY.tsx (its DEFAULT_LABELS, exported from the module with `@internal`, or the texts read from a rendering), or list the key in LABEL_EXCEPTIONS of that file with the reason',
      'XLabels.b: an exception of LABEL_EXCEPTIONS (REGISTRY.tsx) without a reason: write why the key cannot be verified',
      'XLabels.gone: an exception of LABEL_EXCEPTIONS (REGISTRY.tsx) that matches no key the guard reads here (a key renamed or removed): remove it',
      'XLabels.gone: an exception of LABEL_EXCEPTIONS (REGISTRY.tsx) that matches no key the guard reads here (a key renamed or removed): remove it',
      'XLabels.gone: listed twice in LABEL_EXCEPTIONS of REGISTRY.tsx',
    ]);
  });
});

// Round 2 (critic of PR #551): a prose that lists several values is compared value by value, in order and in number,
// never on its first value alone.
describe('checkLabelDefaults: a prose that lists several values', () => {
  const listRow = (iface: string, key: string, values: string[]): LabelRow => ({ ...row(iface, key, values[0]), proseValues: values });
  const tones = () => listRow('ToastLabels', 'tones', ['`Information`', '`Success`', '`Warning`', '`Error`']);
  const TONES = { info: 'Information', success: 'Success', warning: 'Warning', error: 'Error' };

  it('an object of texts: every member, in order, against every value (Toast-like tones)', () => {
    const result = run([tones()], [{ iface: 'ToastLabels', from: 'TONE_LABEL', values: { tones: TONES } }]);
    expect(result.problems).toEqual([]);
    expect(result.verified).toEqual(['ToastLabels.tones']);
  });

  it('a member that is not the first one changed in the code (`success` -> `Done`) fails, naming the value', () => {
    const result = run([tones()], [{ iface: 'ToastLabels', from: 'TONE_LABEL', values: { tones: { ...TONES, success: 'Done' } } }]);
    expect(result.verified).toEqual([]);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain('ToastLabels.tones (packages/core/src/x/X.tsx): value 2 of 4: the prose states "Success", the code has "Done" (TONE_LABEL["success"])');
  });

  it('an object with a member the prose does not list, or a value the object does not have, fails', () => {
    const extra = run([tones()], [{ iface: 'ToastLabels', from: 'T', values: { tones: { ...TONES, neutral: 'Neutral' } } }]);
    expect(extra.verified).toEqual([]);
    expect(extra.problems[0]).toContain('an object of 5 texts (info, success, warning, error, neutral) and a prose that lists 4 values');
    const fewer = run([listRow('ToastLabels', 'tones', ['`Information`', '`Success`'])], [{ iface: 'ToastLabels', from: 'T', values: { tones: TONES } }]);
    expect(fewer.verified).toEqual([]);
    expect(fewer.problems[0]).toContain('an object of 4 texts (info, success, warning, error) and a prose that lists 2 values');
  });

  it('a list of rendered texts (ListReportFrame-like selection count): a change of the third value fails, naming it', () => {
    const prose = ['"No items selected"', '"3 selected"', '"1,234 selected (2 hidden by filters)"'];
    const ok = run([listRow('FrameLabels', 'selectionCount', prose)], [{ iface: 'FrameLabels', from: 'renderings', values: { selectionCount: ['No items selected', '3 selected', '1,234 selected (2 hidden by filters)'] } }]);
    expect(ok.problems).toEqual([]);
    const drifted = run([listRow('FrameLabels', 'selectionCount', prose)], [{ iface: 'FrameLabels', from: 'renderings', values: { selectionCount: ['No items selected', '3 selected', '1,234 selected (2 filtered out)'] } }]);
    expect(drifted.verified).toEqual([]);
    expect(drifted.problems).toEqual([
      'FrameLabels.selectionCount (packages/core/src/x/X.tsx): value 3 of 3: the prose states "1,234 selected (2 hidden by filters)", the code has "1,234 selected (2 filtered out)" (renderings[2]). Write the value of the code in the "Default ..." of the TSDoc (or fix the code, if the prose is the intended text)',
    ]);
  });

  it('a list of rendered texts with one fill per value (ListReportFrame-like count `(n)`, `(n of m)`)', () => {
    const r = listRow('FrameLabels', 'count', ['`(n)`', '`(n of m)`']);
    const examples = { count: [{ fill: { n: '1' } }, { fill: { n: '1,234', m: '1,236' } }] as LabelExample[] };
    expect(run([r], [{ iface: 'FrameLabels', from: 'renderings', values: { count: ['(1)', '(1,234 of 1,236)'] }, examples }]).problems).toEqual([]);
    const drifted = run([r], [{ iface: 'FrameLabels', from: 'renderings', values: { count: ['(1)', '(1,234 / 1,236)'] }, examples }]);
    expect(drifted.problems[0]).toContain('value 2 of 2: the prose states "(n of m)" (with the placeholders filled: "(1,234 of 1,236)"), the code has "(1,234 / 1,236)"');
  });

  it('a function with one example per value (FileUpload-like selected count): a change of a value that is not the first fails', () => {
    const r = listRow('FileUploadLabels', 'selectedCount', ['`No files selected`', '`1 file selected`', '`N files selected`']);
    const examples = { selectedCount: [{ args: [0] }, { args: [1] }, { args: ['N'] }] };
    const fn = (c: number | string) => (c === 0 ? 'No files selected' : c === 1 ? '1 file selected' : `${c} files selected`);
    expect(run([r], [{ iface: 'FileUploadLabels', from: 'F', values: { selectedCount: fn }, examples }]).problems).toEqual([]);
    const drifted = (c: number | string) => (c === 0 ? 'No files selected' : c === 1 ? 'One file selected' : `${c} files selected`);
    const result = run([r], [{ iface: 'FileUploadLabels', from: 'F', values: { selectedCount: drifted }, examples }]);
    expect(result.verified).toEqual([]);
    expect(result.problems).toEqual([
      'FileUploadLabels.selectedCount (packages/core/src/x/X.tsx): value 2 of 3: the prose states "1 file selected", the code has "One file selected" (F called with (1)). Write the value of the code in the "Default ..." of the TSDoc (or fix the code, if the prose is the intended text)',
    ]);
  });

  it('a list the source cannot compare in full fails: one text, one example, an array of the wrong length, a value with no example', () => {
    const r = listRow('XLabels', 'count', ['`1 item`', '`N items`']);
    const fn = (c: number | string) => (c === 1 ? '1 item' : `${c} items`);
    const oneText = run([r], [{ iface: 'XLabels', from: 'X', values: { count: '1 item' } }]);
    expect(oneText.problems).toEqual([
      'XLabels.count (packages/core/src/x/X.tsx), source X: value 1 of 2: the prose lists 2 values, the source gives one text: give the 2 texts in an array, in the order of the prose (one rendered state each), or list the key in LABEL_EXCEPTIONS with the reason',
      'XLabels.count (packages/core/src/x/X.tsx), source X: value 2 of 2: the prose lists 2 values, the source gives one text: give the 2 texts in an array, in the order of the prose (one rendered state each), or list the key in LABEL_EXCEPTIONS with the reason',
    ]);
    const oneExample = run([r], [{ iface: 'XLabels', from: 'X', values: { count: fn }, examples: { count: { args: [1] } } }]);
    expect(oneExample.problems).toEqual([
      'XLabels.count (packages/core/src/x/X.tsx), source X: the prose lists 2 values ("1 item", "N items") and `examples.count` is one example: give an array of 2 examples, one per value, in the order of the prose',
    ]);
    const short = run([r], [{ iface: 'XLabels', from: 'X', values: { count: fn }, examples: { count: [{ args: [1] }] } }]);
    expect(short.problems).toEqual([
      'XLabels.count (packages/core/src/x/X.tsx), source X: `examples.count` has 1 example, the prose lists 2 values ("1 item", "N items"): one example per value, in the order of the prose',
    ]);
    const shortTexts = run([r], [{ iface: 'XLabels', from: 'X', values: { count: ['1 item'] } }]);
    expect(shortTexts.problems[0]).toContain('value 1 of 2: the source gives 1 text, the prose lists 2 values: one text per value, in the order of the prose');
    // No example at all: the second value has a placeholder-free text, so it cannot be called.
    const none = run([listRow('XLabels', 'count', ['`1 item`', '`${n} items`'])], [{ iface: 'XLabels', from: 'X', values: { count: fn } }]);
    expect(none.verified).toEqual([]);
    expect(none.problems).toEqual([
      expect.stringContaining('XLabels.count (packages/core/src/x/X.tsx), source X: value 1 of 2: a function key whose prose states no placeholder'),
    ]);
    for (const result of [oneText, oneExample, short, shortTexts, none]) expect(result.verified).toEqual([]);
  });

  it('a row read without `proseValues` is compared on its `prose`, as a single value', () => {
    expect(run([row('XLabels', 'a', '`A`')], [{ iface: 'XLabels', from: 'X', values: { a: 'A' } }]).verified).toEqual(['XLabels.a']);
  });
});
