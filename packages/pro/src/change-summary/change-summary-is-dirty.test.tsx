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

  it('holds with a declared id key, but for items without id (never matched, not even when equal)', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    resetChangeSummaryWarnings();
    const { result } = renderHook(useForm);
    const arrayIdKeys = { 'root.f': 'id' };
    const hasItemWithoutId = (root: Loose) =>
      Array.isArray(root.f) && root.f.some((item) => typeof (item as Loose | null | undefined)?.id !== 'number');
    const cases = Object.entries(ATOMS).map(([name, atom]) => ({ name, make: () => put('f', atom()) }));
    const wrong: string[] = [];
    let unmatched = 0;
    for (const baseline of cases) {
      for (const values of cases) {
        act(() => {
          result.current.reset({ root: baseline.make() });
          result.current.setValue('root', values.make());
        });
        const form = result.current;
        const entries = computeChangeSummary({ values: form.values, baseline: form.baseline, arrayIdKeys });
        if (!form.isDirty && hasItemWithoutId(form.values.root)) {
          unmatched += 1;
          if (entries.length === 0) wrong.push(`${baseline.name} → ${values.name}: an item without id was matched`);
        } else if (form.isDirty !== entries.length > 0) {
          wrong.push(`${baseline.name} → ${values.name}: isDirty ${form.isDirty}, ${entries.length} entries`);
        }
      }
    }
    expect(wrong).toEqual([]);
    expect(unmatched).toBe(2); // [null] and [undefined] against a copy of themselves.
  });

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
