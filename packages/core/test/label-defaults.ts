import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// #549: the documented default of every key of a public `*Labels` interface is the value of the code.
//
// Convention (b) of #540: the default of a label key is written only in the prose of its TSDoc ("Default `Next
// page`."). The guard of `scripts/default-column-measure.mjs` (`measureLabels` + `checkLabels`) checks that the
// prose states a default, not that it is true. This module is the generic comparison: the keys and the defaults the
// prose states are read by the guard's own reader (`measureLabels`, never a second regex), the real values come
// from a SOURCE per interface (its `DEFAULT_LABELS`, or the texts read from a rendering), and every key the guard
// reads in a package must be verified by a source or listed as an exception with a reason. When the prose lists
// several values ("Default `No items`, `1 item`, `N items`."), every one is compared, in order and in number: a
// source that can give only one of them fails, it never passes on the first value alone. Nothing is skipped in
// silence: a key without a source, a function key without an example, a source or an exception that no longer
// matches a key all fail, each with a message that names the interface and the key and says what to do.
//
// It lives in the core's `test/` and imports nothing from `packages/pro`: the Pro test imports it (Pro may read the
// core, never the other way round).

export const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const GUARD = resolve(REPO_ROOT, 'scripts/default-column-measure.mjs');

/** A row of `measureLabels` (`scripts/default-column-measure.mjs`): one key, under the interface that declares it. */
export interface LabelRow {
  iface: string;
  key: string;
  /** The default the prose states, as written (quotes included: `` `Next page` ``, `"1 result"`); absent if none. */
  prose?: string;
  /**
   * Every value of that default, as written, when the prose lists several ("`No items`, `1 item`, `N items`":
   * three); `[prose]` for one, `[]` for none (`proseDefaultsOf` of the guard). Every one is compared.
   */
  proseValues?: string[];
  /** Text of a `@default` / `@defaultValue` tag (the guard reports it: label keys use the prose). */
  tag?: string;
  tagName?: string;
  /** Repository-relative file of the declaration. */
  file: string;
  /** Two different declarations under one interface name (the guard's `label-collision`). */
  collision?: boolean;
  otherFile?: string;
}

/**
 * The rows of the guard, read by `measureLabels` itself in a separate Node process (the same reader `npm run
 * default-column:check` runs in CI; a child process keeps the TypeScript program out of the test's jsdom worker
 * and needs no type declarations for the `.mjs`).
 */
export function readLabelRows(): LabelRow[] {
  const script = `import { measureLabels } from ${JSON.stringify(pathToFileURL(GUARD).href)};\nprocess.stdout.write(JSON.stringify(measureLabels()));`;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(out) as LabelRow[];
}

/** How a function key (or an object key) is turned into the text the prose states. */
export interface LabelExample {
  /**
   * Arguments the function is called with; for an object key (`ToastLabels.tones`), `[member]`: the member whose
   * text the prose states (`['info']`). Default for a function: the placeholders of the prose, in order
   * (`<row label>`, `${page}`), passed as they are written, so that `Select <row label>` is `selectRow('<row label>')`.
   */
  args?: readonly unknown[];
  /**
   * Placeholders of the prose replaced before the comparison, for a value read from a rendering:
   * `{ '<title>': 'Unsaved changes' }` turns "Close: <title>" into "Close: Unsaved changes". Whole words only;
   * a placeholder that is not in the prose is an error (a stale example).
   */
  fill?: Readonly<Record<string, string>>;
}

/** Where the real defaults of one interface come from. */
export interface LabelSource {
  /** The interface, as the guard names it (the one that declares the keys). */
  iface: string;
  /**
   * Interfaces some keys of `values` are declared in (`DatePickerLabels extends CalendarLabels`: the DatePicker's
   * own `previousMonth` is compared with the prose of `CalendarLabels.previousMonth`). Without it a key of `values`
   * that is not a key of `iface` is an error.
   */
  inherits?: readonly string[];
  /** What `values` is, named in the messages: "DEFAULT_LABELS of calendar/Calendar.tsx", "rendering of ListReport". */
  from: string;
  /**
   * The real default of each key, as the component uses it: a text, a function, an object of texts (compared member
   * by member, in order, with the values the prose lists) or, for a rendering, an array of texts (one per value of
   * the prose, each read from the state that shows it). An `object`, not a `Record` (a labels interface has no index
   * signature), read with `Object.entries`.
   */
  values: object;
  /**
   * Per key: the arguments of a function key, the member of an object key, the placeholders of a rendered text. When
   * the prose lists several values ("`1 item selected` / `${n} items selected`"), an ARRAY with one example per value,
   * in the order of the prose (`[{ args: [1] }, { args: ['${n}'] }]`); one example for a list is an error.
   */
  examples?: Readonly<Record<string, LabelExample | readonly LabelExample[]>>;
}

/** A key that cannot be verified, with the reason written out. Empty by default. */
export interface LabelException {
  iface: string;
  key: string;
  reason: string;
}

export interface LabelDefaultsCheck {
  /** `Interface.key` of the rows in scope whose prose equals the real value (each once, sorted). */
  verified: string[];
  /** `Interface.key` of the rows in scope covered by a valid exception (sorted). */
  excepted: string[];
  /** One message per problem (sorted); empty when every key in scope is verified or excepted. */
  problems: string[];
}

const QUOTES: readonly (readonly [string, string])[] = [
  ['`', '`'],
  ['"', '"'],
  ["'", "'"],
  ['“', '”'],
  ['‘', '’'],
];

/**
 * The text of a prose default as the guard reads it (`` `Next page` ``, `"1 result"`), without its ONE pair of
 * enclosing quotes. Nothing else is normalised: `'Yours'` written inside backticks stays `'Yours'` (and differs
 * from the value `Yours`), a space more or less is a difference.
 */
export function proseText(prose: string): string {
  for (const [open, close] of QUOTES) {
    if (prose.length >= open.length + close.length && prose.startsWith(open) && prose.endsWith(close)) return prose.slice(open.length, -close.length);
  }
  return prose;
}

/** The placeholders of a prose default, in order: `<row label>`, `${page}`. */
export function placeholdersOf(text: string): string[] {
  return [...text.matchAll(/<[^<>\n]+>|\$\{[^{}\n]+\}/g)].map((m) => m[0]);
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `text` with each placeholder of `fill` replaced (whole words); throws on a placeholder that is not in `text`. */
export function fillProse(text: string, fill: Readonly<Record<string, string>>): string {
  let out = text;
  for (const [token, value] of Object.entries(fill)) {
    const re = new RegExp(`(?<!\\w)${escapeRegExp(token)}(?!\\w)`, 'g');
    if (!re.test(out)) throw new Error(`the placeholder ${JSON.stringify(token)} of \`fill\` is not in the prose ${JSON.stringify(text)}`);
    out = out.replace(re, () => value);
  }
  return out;
}

const isExampleList = (e: LabelExample | readonly LabelExample[] | undefined): e is readonly LabelExample[] => Array.isArray(e);
const show = (v: unknown) => (typeof v === 'string' ? JSON.stringify(v) : typeof v === 'function' ? 'a function' : String(v));
const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The real text of `value` for the comparison of the `index`-th of the `count` values the prose lists, or the
 * reason it cannot be computed.
 */
function realText(
  value: unknown,
  example: LabelExample | undefined,
  prose: string,
  index: number,
  count: number,
): { text: string; how: string } | { problem: string } {
  if (typeof value === 'string') {
    if (example?.args) return { problem: 'the source gives a text, but `examples` has `args` for it: `args` is for a function or an object key, remove it' };
    if (count > 1) {
      return {
        problem: `the prose lists ${count} values, the source gives one text: give the ${count} texts in an array, in the order of the prose (one rendered state each), or list the key in LABEL_EXCEPTIONS with the reason`,
      };
    }
    return { text: value, how: '' };
  }
  if (Array.isArray(value)) {
    // A rendered list: one text per value of the prose (each read from the state that shows it).
    if (example?.args) return { problem: 'the source gives a list of texts, but `examples` has `args` for it: `args` is for a function or an object key, remove it' };
    if (value.length !== count) return { problem: `the source gives ${value.length} text${value.length === 1 ? '' : 's'}, the prose lists ${count} values: one text per value, in the order of the prose` };
    const text: unknown = value[index];
    if (typeof text !== 'string') return { problem: `text ${index + 1} of the source is ${show(text)}, not a text` };
    return { text, how: `[${index}]` };
  }
  if (typeof value === 'function') {
    const args = example?.args ?? placeholdersOf(prose);
    if (!args.length && value.length > 0) {
      return {
        problem:
          'a function key whose prose states no placeholder (`<label>`, `${n}`): give the arguments of the example the prose states in `examples.<key>.args` of the source (`[1]` for "1 item selected"; when the prose lists several values, an array with one example per value), or list the key in LABEL_EXCEPTIONS with the reason',
      };
    }
    const how = ` called with (${args.map((a) => JSON.stringify(a)).join(', ')})`;
    let text: unknown;
    try {
      text = (value as (...a: readonly unknown[]) => unknown)(...args);
    } catch (error) {
      return { problem: `the function of the source throws${how}: ${String(error)}` };
    }
    if (typeof text !== 'string') return { problem: `the function of the source returns ${show(text)}${how}, not a text` };
    return { text, how };
  }
  if (isPlainObject(value)) {
    if (!example?.args) {
      // Every member, in order, against every value of the prose ("`Information`, `Success`, `Warning` and `Error`").
      const members = Object.keys(value);
      if (members.length !== count) {
        return {
          problem: `an object of ${members.length} texts (${members.join(', ')}) and a prose that lists ${count} value${count === 1 ? '' : 's'}: list every member's text in the prose, in the order of the members, or name the member of each value in \`examples.<key>\` (\`{ args: ['info'] }\`)`,
        };
      }
      const member = members[index] as string;
      const text = value[member];
      if (typeof text !== 'string') return { problem: `the member ${JSON.stringify(member)} of the source is ${show(text)}, not a text` };
      return { text, how: `[${JSON.stringify(member)}]` };
    }
    const member = example.args[0];
    if (typeof member !== 'string' || example.args.length !== 1) {
      return { problem: 'an object key (texts by member): `examples.<key>.args` names one member (`[\'info\']`)' };
    }
    if (!(member in value)) return { problem: `the object of the source has no member ${JSON.stringify(member)} (members: ${Object.keys(value).join(', ')})` };
    const text = value[member];
    if (typeof text !== 'string') return { problem: `the member ${JSON.stringify(member)} of the source is ${show(text)}, not a text` };
    return { text, how: `[${JSON.stringify(member)}]` };
  }
  return { problem: `the source gives ${show(value)}, neither a text, a function nor an object of texts` };
}

/**
 * Compares the prose default of every row in scope with the real value of its source.
 * - `rows`: every row of the guard (`readLabelRows()`): inherited keys are looked up there;
 * - `inScope`: the rows this package must cover (`(r) => r.file.startsWith('packages/core/')`);
 * - `registry`: the file that holds `sources` and `exceptions`, named in the messages.
 */
export function checkLabelDefaults(
  rows: readonly LabelRow[],
  {
    sources,
    exceptions = [],
    inScope,
    registry,
  }: { sources: readonly LabelSource[]; exceptions?: readonly LabelException[]; inScope: (row: LabelRow) => boolean; registry: string },
): LabelDefaultsCheck {
  const problems: string[] = [];
  const idOf = (r: { iface: string; key: string }) => `${r.iface}.${r.key}`;
  const scoped = rows.filter(inScope);
  const keyed = new Map<string, LabelRow>();
  for (const r of rows) if (!r.collision) keyed.set(idOf(r), r);
  const scopedIds = new Set(scoped.filter((r) => !r.collision).map(idOf));
  const ifacesInScope = new Set(scoped.map((r) => r.iface));
  const ifacesAll = new Set(rows.map((r) => r.iface));

  for (const r of scoped) {
    if (r.collision) {
      problems.push(
        `${idOf(r)}: two different interfaces named ${r.iface} (${r.otherFile} and ${r.file}): the guard reads them as one and the second is not compared; rename one of them`,
      );
    }
  }

  const verified = new Set<string>();
  /** Rows a source tried (verified or not): not reported again as "no source". */
  const tried = new Set<string>();
  const exceptionIds = new Set(exceptions.map(idOf));

  for (const source of sources) {
    const where = `${source.iface} (source: ${source.from}, ${registry})`;
    if (!ifacesInScope.has(source.iface)) problems.push(`${where}: the guard reads no key of ${source.iface} here: remove the source or fix the name of the interface`);
    for (const parent of source.inherits ?? []) {
      if (!ifacesAll.has(parent)) problems.push(`${where}: \`inherits\` names ${parent}, of which the guard reads no key: remove it or fix the name`);
    }
    const owners = [source.iface, ...(source.inherits ?? [])];
    for (const key of Object.keys(source.examples ?? {})) {
      if (!(key in source.values)) problems.push(`${where}: \`examples\` has the key ${key}, which is not in the values of the source: remove it`);
    }
    for (const [key, value] of Object.entries(source.values) as [string, unknown][]) {
      const row = owners.map((iface) => keyed.get(`${iface}.${key}`)).find((r) => r !== undefined);
      if (!row) {
        problems.push(
          `${where}: the source has the key ${key}, which the guard does not read under ${owners.join(' or ')}: a key the interface no longer has (remove it), or an interface it inherits from (add it to \`inherits\`)`,
        );
        continue;
      }
      const id = idOf(row);
      tried.add(id);
      const at = `${id} (${row.file})`;
      if (row.prose === undefined) {
        problems.push(`${at}: the prose states no default ("Default \`x\`."): the guard (\`npm run default-column:check\`) reports it as label-no-default; nothing to compare`);
        continue;
      }
      // Every value the prose lists ("`No items`, `1 item`, `N items`"), not only the first one.
      const statedAll = (row.proseValues?.length ? row.proseValues : [row.prose]).map(proseText);
      const count = statedAll.length;
      const example = source.examples?.[key];
      let perValue: readonly (LabelExample | undefined)[];
      if (isExampleList(example)) {
        if (example.length !== count) {
          problems.push(
            `${at}, source ${source.from}: \`examples.${key}\` has ${example.length} example${example.length === 1 ? '' : 's'}, the prose lists ${count} value${count === 1 ? '' : 's'} (${statedAll.map((s) => JSON.stringify(s)).join(', ')}): one example per value, in the order of the prose`,
          );
          continue;
        }
        perValue = example;
      } else if (example && count > 1) {
        problems.push(
          `${at}, source ${source.from}: the prose lists ${count} values (${statedAll.map((s) => JSON.stringify(s)).join(', ')}) and \`examples.${key}\` is one example: give an array of ${count} examples, one per value, in the order of the prose`,
        );
        continue;
      } else perValue = statedAll.map(() => example);
      let ok = true;
      statedAll.forEach((stated, i) => {
        const which = count > 1 ? `value ${i + 1} of ${count}: ` : '';
        const one = perValue[i];
        const real = realText(value, one, stated, i, count);
        if ('problem' in real) {
          ok = false;
          problems.push(`${at}, source ${source.from}: ${which}${real.problem}`);
          return;
        }
        let expected = stated;
        if (one?.fill) {
          try {
            expected = fillProse(stated, one.fill);
          } catch (error) {
            ok = false;
            problems.push(`${at}, source ${source.from}: ${which}${(error as Error).message}`);
            return;
          }
        }
        if (real.text !== expected) {
          ok = false;
          const filled = expected === stated ? '' : ` (with the placeholders filled: ${JSON.stringify(expected)})`;
          problems.push(
            `${at}: ${which}the prose states ${JSON.stringify(stated)}${filled}, the code has ${JSON.stringify(real.text)} (${source.from}${real.how}). Write the value of the code in the "Default ..." of the TSDoc (or fix the code, if the prose is the intended text)`,
          );
        }
      });
      if (!ok) continue;
      if (exceptionIds.has(id)) problems.push(`${at}: verified by ${source.from} and also listed in LABEL_EXCEPTIONS of ${registry}: remove the exception`);
      verified.add(id);
    }
  }

  const excepted = new Set<string>();
  const seenExceptions = new Set<string>();
  for (const e of exceptions) {
    const id = idOf(e);
    if (seenExceptions.has(id)) problems.push(`${id}: listed twice in LABEL_EXCEPTIONS of ${registry}`);
    seenExceptions.add(id);
    if (!e.reason.trim()) problems.push(`${id}: an exception of LABEL_EXCEPTIONS (${registry}) without a reason: write why the key cannot be verified`);
    else if (!scopedIds.has(id)) problems.push(`${id}: an exception of LABEL_EXCEPTIONS (${registry}) that matches no key the guard reads here (a key renamed or removed): remove it`);
    else if (!verified.has(id)) excepted.add(id);
  }

  for (const id of scopedIds) {
    if (verified.has(id) || excepted.has(id) || tried.has(id)) continue;
    const row = keyed.get(id);
    problems.push(
      `${id} (${row?.file}): no source of the real value. Add a source for ${row?.iface} to \`labelSources()\` of ${registry} (its DEFAULT_LABELS, exported from the module with \`@internal\`, or the texts read from a rendering), or list the key in LABEL_EXCEPTIONS of that file with the reason`,
    );
  }

  return { verified: [...verified].filter((id) => scopedIds.has(id)).sort(), excepted: [...excepted].sort(), problems: problems.sort() };
}
