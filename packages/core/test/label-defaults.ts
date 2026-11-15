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
// reads in a package must be verified by a source or listed as an exception with a reason. Nothing is skipped in
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
   * The real default of each key, as the component uses it: a text, a function or an object of texts. An object
   * (`object`, not a `Record`: a labels interface has no index signature), read with `Object.entries`.
   */
  values: object;
  /** Per key: the arguments of a function key, the member of an object key, the placeholders of a rendered text. */
  examples?: Readonly<Record<string, LabelExample>>;
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

const show = (v: unknown) => (typeof v === 'string' ? JSON.stringify(v) : typeof v === 'function' ? 'a function' : String(v));
const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The real text of `value` for the comparison, or the reason it cannot be computed. */
function realText(value: unknown, example: LabelExample | undefined, prose: string): { text: string; how: string } | { problem: string } {
  if (typeof value === 'string') {
    if (example?.args) return { problem: 'the source gives a text, but `examples` has `args` for it: `args` is for a function or an object key, remove it' };
    return { text: value, how: '' };
  }
  if (typeof value === 'function') {
    const args = example?.args ?? placeholdersOf(prose);
    if (!args.length && value.length > 0) {
      return {
        problem:
          'a function key whose prose states no placeholder (`<label>`, `${n}`): give the arguments of the example the prose states in `examples.<key>.args` of the source (`[1]` for "1 item selected"), or list the key in LABEL_EXCEPTIONS with the reason',
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
    const member = example?.args?.[0];
    if (typeof member !== 'string' || example?.args?.length !== 1) {
      return { problem: 'an object key (texts by member): name the member whose text the prose states in `examples.<key>.args` (`[\'info\']`)' };
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
      const stated = proseText(row.prose);
      const example = source.examples?.[key];
      const real = realText(value, example, stated);
      if ('problem' in real) {
        problems.push(`${at}, source ${source.from}: ${real.problem}`);
        continue;
      }
      let expected = stated;
      if (example?.fill) {
        try {
          expected = fillProse(stated, example.fill);
        } catch (error) {
          problems.push(`${at}, source ${source.from}: ${(error as Error).message}`);
          continue;
        }
      }
      if (real.text !== expected) {
        const filled = expected === stated ? '' : ` (with the placeholders filled: ${JSON.stringify(expected)})`;
        problems.push(
          `${at}: the prose states ${JSON.stringify(stated)}${filled}, the code has ${JSON.stringify(real.text)} (${source.from}${real.how}). Write the value of the code in the "Default ..." of the TSDoc (or fix the code, if the prose is the intended text)`,
        );
        continue;
      }
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
