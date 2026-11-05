import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { Field, Input, useObjectPageForm } from '@react-object-page/core';
import { ChangeSummary } from './ChangeSummary';
import { computeChangeSummary, resetChangeSummaryWarnings } from './compute-change-summary';
import { useChangeSummary } from './use-change-summary';

type Loose = Record<string, unknown>;
type Form = { root: Loose };

const MISSING = Symbol('missing');
const put = (key: string, value: unknown): Loose => (value === MISSING ? {} : { [key]: value });
const circular = () => {
  const o: Loose = {};
  o.self = o;
  return o;
};

const SHARED_MAP = new Map([['a', 1]]);

// Factories, not values: the two sides of a pair must never share a reference, or `===` would
// settle the comparison before the rules under test run.
const ATOMS: Record<string, () => unknown> = {
  undefined: () => undefined,
  null: () => null,
  missing: () => MISSING,
  "''": () => '',
  '[]': () => [],
  '{}': () => ({}),
  '{a:undefined}': () => ({ a: undefined }),
  '{a:null}': () => ({ a: null }),
  '[null]': () => [null],
  '[undefined]': () => [undefined],
  "'x'": () => 'x',
  "' '": () => ' ',
  '0': () => 0,
  '-0': () => -0,
  false: () => false,
  NaN: () => NaN,
  date: () => new Date(5),
  'invalid date': () => new Date('nope'),
  'array with id': () => [{ id: 1, a: null }],
  'same id, other field': () => [{ id: 1, a: '' }],
  circular,
  'shared map': () => SHARED_MAP,
  'fresh map': () => new Map(),
};

const SHAPES: Record<string, (value: unknown) => Loose> = {
  'f:': (value) => put('f', value),
  'f.g:': (value) => ({ f: put('g', value) }),
  'f.g.h:': (value) => ({ f: { g: put('h', value) } }),
  'f[0]:': (value) => {
    const list: unknown[] = new Array(1);
    if (value !== MISSING) list[0] = value;
    return { f: list };
  },
  'f[0].g:': (value) => ({ f: [put('g', value)] }),
};

type Case = { name: string; make: () => Loose };

// One React commit per pair: the quadratic corpus does not fit the default per-test timeout.
const CORPUS_TIMEOUT = 60_000;

const CORPUS: Case[] = Object.entries(SHAPES).flatMap(([shapeName, shape]) =>
  Object.entries(ATOMS).map(([atomName, atom]) => ({ name: `${shapeName} ${atomName}`, make: () => shape(atom()) })),
);

// Equal for `isDirty`, but `Object.is` does not match the ids of two fresh copies (0 against -0 aside).
const ID_ATOMS: Record<string, () => unknown> = {
  'array with id 0': () => [{ id: 0 }],
  'array with id -0': () => [{ id: -0 }],
  'array with a date id': () => [{ id: new Date(1) }],
  'array with an object id': () => [{ id: { a: 1 } }],
};

const ID_SHAPES: Record<string, (value: unknown) => Loose> = {
  ...SHAPES,
  'f[id].g:': (value) => ({ f: [{ id: 1, ...put('g', value) }] }),
};

const ID_CORPUS: Case[] = Object.entries(ID_SHAPES).flatMap(([shapeName, shape]) =>
  Object.entries({ ...ATOMS, ...ID_ATOMS }).map(([atomName, atom]) => ({
    name: `${shapeName} ${atomName}`,
    make: () => shape(atom()),
  })),
);

const idOf = (item: unknown): unknown => (item as Loose | null | undefined)?.id;

/** On a clean pair: is an item on the id-keyed levels `keys` left unmatched by `Object.is`? */
function hasUnmatchedItem(baseline: unknown, values: unknown, [key, ...rest]: string[]): boolean {
  if (key === undefined) return false;
  const before = (baseline as Loose | null | undefined)?.[key];
  const after = (values as Loose | null | undefined)?.[key];
  if (!Array.isArray(before) || !Array.isArray(after)) return hasUnmatchedItem(before, after, rest);
  // Array.from: a hole is an item too, `some` would skip it.
  return Array.from(after).some((item, index) => {
    const id = idOf(item);
    if (id === undefined || id === null || !Object.is(id, idOf(before[index]))) return true;
    return hasUnmatchedItem(before[index], item, rest);
  });
}

function useForm() {
  return useObjectPageForm<Form>({ baseline: { root: {} } });
}

describe('no entries if and only if isDirty is false', () => {
  afterEach(() => vi.restoreAllMocks());

  it(`holds on every pair of a corpus of ${CORPUS.length} values`, () => {
    const { result } = renderHook(useForm);
    const wrong: string[] = [];
    let dirty = 0;
    let clean = 0;
    for (const baseline of CORPUS) {
      for (const values of CORPUS) {
        act(() => {
          result.current.reset({ root: baseline.make() });
          result.current.setValue('root', values.make());
        });
        const form = result.current;
        const entries = computeChangeSummary({ values: form.values, baseline: form.baseline });
        if (form.isDirty) dirty += 1;
        else clean += 1;
        if (form.isDirty !== entries.length > 0) {
          wrong.push(`${baseline.name} → ${values.name}: isDirty ${form.isDirty}, ${entries.length} entries`);
        }
      }
    }
    expect(wrong).toEqual([]);
    expect(dirty + clean).toBe(CORPUS.length ** 2);
    // The oracle really answers both ways, on the diagonal and off it.
    expect(clean).toBeGreaterThanOrEqual(CORPUS.length - Object.keys(SHAPES).length);
    expect(dirty).toBeGreaterThan(CORPUS.length ** 2 / 2);
  }, CORPUS_TIMEOUT);

  it(`holds with id keys on 3 levels on every pair of ${ID_CORPUS.length} values, but for ids not matched by Object.is`, () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    resetChangeSummaryWarnings();
    const { result } = renderHook(useForm);
    const arrayIdKeys = { 'root.f': 'id', 'root.f.g': 'id', 'root.f.g.h': 'id' };
    const wrong: string[] = [];
    let unmatched = 0;
    let matched = 0;
    for (const baseline of ID_CORPUS) {
      for (const values of ID_CORPUS) {
        act(() => {
          result.current.reset({ root: baseline.make() });
          result.current.setValue('root', values.make());
        });
        const form = result.current;
        const entries = computeChangeSummary({ values: form.values, baseline: form.baseline, arrayIdKeys });
        const exempt = !form.isDirty && hasUnmatchedItem(form.baseline.root, form.values.root, ['f', 'g', 'h']);
        if (exempt) unmatched += 1;
        else if (!form.isDirty) matched += 1;
        if (exempt ? entries.length === 0 : form.isDirty !== entries.length > 0) {
          wrong.push(`${baseline.name} → ${values.name}: isDirty ${form.isDirty}, ${entries.length} entries`);
        }
      }
    }
    expect(wrong).toEqual([]);
    // Pinned: a change in how ids pair moves these counts even when `wrong` stays empty.
    expect({ unmatched, matched }).toEqual({ unmatched: 94, matched: 100 });
  }, CORPUS_TIMEOUT);

  it('a pure reorder with an id key is the declared exception: dirty, no entries', () => {
    const { result } = renderHook(useForm);
    const row = (id: number) => ({ id, note: null, memo: '' });
    act(() => {
      result.current.reset({ root: { f: [row(1), row(2)] } });
      result.current.setValue('root', { f: [row(2), row(1)] });
    });
    const form = result.current;
    expect(form.isDirty).toBe(true);
    expect(computeChangeSummary({ values: form.values, baseline: form.baseline, arrayIdKeys: { 'root.f': 'id' } })).toEqual([]);
    expect(computeChangeSummary({ values: form.values, baseline: form.baseline })).toHaveLength(1);
  });
});

describe('a real Input on a nullable field', () => {
  afterEach(cleanup);

  function Editor<Values extends { note: string | null }>({ initial }: { initial: Values }) {
    const form = useObjectPageForm<Values>({ baseline: initial });
    const { entries } = useChangeSummary({ values: form.values, baseline: form.baseline });
    return (
      <>
        <Field label="Note" name="note">
          <Input
            value={form.values.note ?? ''}
            onChange={(event) => form.setValues({ note: event.target.value } as Partial<Values>)}
          />
        </Field>
        <output aria-label="Dirty">{String(form.isDirty)}</output>
        <ChangeSummary entries={entries} />
      </>
    );
  }

  const typeAndClear = () => {
    const input = screen.getByRole('textbox', { name: 'Note' });
    fireEvent.change(input, { target: { value: 'typed' } });
    fireEvent.change(input, { target: { value: '' } });
  };

  it("baseline null: typing and clearing leaves '', dirty, with an entry on Note", () => {
    render(<Editor initial={{ note: null }} />);
    expect(screen.getByText('No changes')).toBeInTheDocument();
    typeAndClear();
    expect(screen.getByRole('status', { name: 'Dirty' })).toHaveTextContent('true');
    expect(screen.queryByText('No changes')).toBeNull();
    expect(screen.getByRole('listitem')).toHaveTextContent(/^Note.*added.*Empty$/);
  });

  it("baseline '': typing and clearing leaves the form clean, with no changes", () => {
    render(<Editor initial={{ note: '' }} />);
    typeAndClear();
    expect(screen.getByRole('status', { name: 'Dirty' })).toHaveTextContent('false');
    expect(screen.getByText('No changes')).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });
});
