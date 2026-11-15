import { StrictMode, useSyncExternalStore } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Field } from '../field/Field';
import { Input } from '../input/Input';
import { ObjectPageSection } from '../object-page/ObjectPageSection';
import type { RecordModule, RecordSectionsProps } from './record-module';
import { createRecordStore } from './record-store';
import { RecordCrud, type RecordCrudProps } from './RecordCrud';
import { isLeaving, openCreate, openRecord, readRoute, recordHref, subscribeRoute } from './showcase-router';

// #519: the shell with two made-up modules, none of them the invoices. The registry is the ONE static list of the
// showcase (`showcase-modules.ts`); this file registers its own two modules there, `people` first (the default
// module: plain `filter`/`q`/`sort`) and `tasks` (its list parameters under `tasks.`).
vi.mock('./showcase-modules', () => ({ SHOWCASE_MODULES: ['people', 'tasks'] }));

/* -------------------------------------------------------------------------- the made-up modules */

interface Task {
  id: string;
  title: string;
  owner: string;
}
type TaskValues = Omit<Task, 'id'>;

const TASK_SEED: readonly Task[] = [
  { id: 'task-1', title: 'Write the brief', owner: 'Ada' },
  { id: 'task-2', title: 'Book the room', owner: 'Ben' },
  { id: 'task-3', title: 'Archive the notes', owner: 'Cleo' },
];

function TaskSections({ form }: RecordSectionsProps<Task, TaskValues>) {
  return (
    <ObjectPageSection id="task" title="Task">
      <Field label="Title" name="title">
        <Input value={form.values.title} onChange={(e) => form.setValue('title', e.target.value)} />
      </Field>
      <Field label="Owner" name="owner">
        <Input value={form.values.owner} onChange={(e) => form.setValue('owner', e.target.value)} />
      </Field>
    </ObjectPageSection>
  );
}

/** The minimal module: two fields, no lines, no creation, no deletion. */
const TASKS: RecordModule<Task, TaskValues> = {
  name: 'tasks',
  noun: { one: 'task', many: 'tasks' },
  createStore: () => createRecordStore<Task>(TASK_SEED, { createId: (n) => `task-${n}`, noun: { one: 'task', many: 'tasks' } }),
  recordName: (task) => task.title,
  list: {
    columns: [
      { id: 'title', header: 'Title', accessor: (t) => t.title },
      { id: 'owner', header: 'Owner', accessor: (t) => t.owner },
    ],
    filters: [{ id: 'all', label: 'All' }],
    linkColumn: 'title',
    labels: {},
  },
  form: {
    toValues: ({ title, owner }) => ({ title, owner }),
    isEqual: (a, b) => a.title === b.title && a.owner === b.owner,
    validate: (v) => (v.title.trim() ? {} : { title: 'Title is required.' }),
    toRecord: (task, v) => ({ ...task, ...v }),
    subtitle: (saved) => saved.owner,
    Sections: TaskSections,
  },
};

interface Person {
  id: string;
  name: string;
  city: string;
}
type PersonValues = Omit<Person, 'id'>;

const PEOPLE_SEED: readonly Person[] = [
  { id: 'p-1', name: 'Ada Rivers', city: 'Lyon' },
  { id: 'p-2', name: 'Ben Okafor', city: 'Porto' },
  { id: 'p-3', name: 'Cleo Hart', city: 'Turin' },
];

function PersonSections({ form }: RecordSectionsProps<Person, PersonValues>) {
  return (
    <ObjectPageSection id="person" title="Person">
      <Field label="Name" name="name">
        <Input value={form.values.name} onChange={(e) => form.setValue('name', e.target.value)} />
      </Field>
      <Field label="City" name="city">
        <Input value={form.values.city} onChange={(e) => form.setValue('city', e.target.value)} />
      </Field>
    </ObjectPageSection>
  );
}

/** An irregular plural, creation, deletion and bulk deletion. */
const PEOPLE: RecordModule<Person, PersonValues> = {
  name: 'people',
  noun: { one: 'person', many: 'people' },
  createStore: () => createRecordStore<Person>(PEOPLE_SEED, { createId: (n) => `p-${n}`, noun: { one: 'person', many: 'people' } }),
  recordName: (person) => person.name,
  list: {
    columns: [
      { id: 'name', header: 'Name', accessor: (p) => p.name },
      { id: 'city', header: 'City', accessor: (p) => p.city },
    ],
    filters: [{ id: 'all', label: 'All' }],
    linkColumn: 'name',
    labels: {},
  },
  form: {
    toValues: ({ name, city }) => ({ name, city }),
    isEqual: (a, b) => a.name === b.name && a.city === b.city,
    validate: (v) => (v.name.trim() ? {} : { name: 'Name is required.' }),
    toRecord: (person, v) => ({ ...person, ...v }),
    Sections: PersonSections,
  },
  create: { defaults: () => ({ name: '', city: '' }), toDraft: (v) => v },
  delete: true,
  deleteMany: true,
};

/* ------------------------------------------------------------------------------------ helpers */

beforeEach(() => {
  // jsdom lacks what Radix measures and scrolls with.
  const proto = Element.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = vi.fn();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  // `leaveRoute` waits for the `popstate` of its `history.back()` before navigating again.
  if (isLeaving()) window.dispatchEvent(new PopStateEvent('popstate'));
});

const props = <T extends { id: string }, V extends object, D>(
  module: RecordModule<T, V, D>,
  over: Partial<RecordCrudProps<T, V, D>> = {},
): RecordCrudProps<T, V, D> => ({
  module,
  history: 'replace',
  listLoadDelayMs: 0,
  recordLoadDelayMs: 0,
  saveDelayMs: 0,
  onNavigate: vi.fn(),
  ...over,
});

// jsdom loads no CSS: a hidden footer is still in the tree, but `inert`.
const footer = () => {
  const el = screen.queryByRole('region', { name: 'Save actions', hidden: true });
  return el && !el.hasAttribute('inert') ? el : null;
};

/** The list title, followed by its count ("Tasks (3)"). */
const listTitle = (name: string) => screen.findByRole('heading', { level: 2, name: new RegExp(`^${name} \\(`) });

/** The scroll container of the list (the one `useListReportScrollRestoration` saves and restores). */
const scroller = (): HTMLElement => {
  const el = document.querySelector('table')?.parentElement;
  if (!el) throw new Error('no table');
  return el;
};

/** jsdom does not scroll: `scrollTop` becomes plain data on every element, so a restoration can be read back. */
function scrollableElements() {
  const tops = new WeakMap<Element, number>();
  const original = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
  Object.defineProperty(Element.prototype, 'scrollTop', {
    configurable: true,
    get(this: Element) {
      return tops.get(this) ?? 0;
    },
    set(this: Element, value: number) {
      tops.set(this, value);
    },
  });
  return () => {
    if (original) Object.defineProperty(Element.prototype, 'scrollTop', original);
  };
}

async function scrollList(top: number) {
  const el = scroller();
  el.scrollTop = top;
  el.dispatchEvent(new Event('scroll'));
}

async function sortBy(column: string) {
  await userEvent.click(within(screen.getByRole('columnheader', { name: column })).getByRole('button'));
}

/** Shows the shell of the module the URL names: two modules in ONE iframe, as a module switch would. */
function TwoModules() {
  const module = useSyncExternalStore(subscribeRoute, () => readRoute().module);
  return module === 'tasks' ? <RecordCrud {...props(TASKS)} /> : <RecordCrud {...props(PEOPLE)} />;
}

/** The URL of another module's list, the way a module switch would write it (out of scope here: #523). */
function switchTo(search: string) {
  act(() => {
    window.history.pushState(null, '', `/${search}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
}

/* -------------------------------------------------------------------------------------- tests */

describe('RecordCrud (#519): the shell holds no word of a domain', () => {
  it('the source of the shell files names no invoice and no supplier', () => {
    for (const file of ['RecordCrud.tsx', 'RecordListView.tsx', 'RecordPageShell.tsx', 'record-module.ts']) {
      const source = readFileSync(join(import.meta.dirname, file), 'utf8');
      expect(source, file).not.toMatch(/invoice|supplier/i);
    }
  });
});

describe('RecordCrud (#519): a minimal module (two fields, no lines, no creation)', () => {
  it('open a record, edit (save bar), leave (dirty-guard), save, back: the focus on the saved row link', async () => {
    const onNavigate = vi.fn();
    const onSaved = vi.fn();
    render(
      <StrictMode>
        <RecordCrud {...props(TASKS, { onNavigate, onSaved })} />
      </StrictMode>,
    );
    await listTitle('Tasks');
    // No creation in the module: no "New task" (nor any "New …").
    expect(screen.queryByRole('button', { name: /^New/ })).toBeNull();

    await userEvent.click(await screen.findByRole('link', { name: 'Book the room' }));
    expect(onNavigate).toHaveBeenLastCalledWith({ to: 'record', id: 'task-2' });
    expect(await screen.findByRole('heading', { level: 1, name: /Book the room/ })).toBeTruthy();
    // The page's live region (the footer has one of its own).
    expect(screen.getAllByRole('status').map((s) => s.textContent)).toContain('Task Book the room loaded');
    // Mounted hydrated: the fields hold the record at once, the form is clean (no save bar).
    const title = screen.getByRole('textbox', { name: 'Title' });
    expect(title).toHaveValue('Book the room');
    expect(screen.getByRole('textbox', { name: 'Owner' })).toHaveValue('Ben');
    expect(footer()).toBeNull();
    // No deletion in the module: no "Delete" in the header.
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();

    await userEvent.type(title, ' 4B');
    await waitFor(() => expect(footer()).not.toBeNull());

    await userEvent.click(screen.getByRole('button', { name: 'Back to list' }));
    const guard = await screen.findByRole('dialog', { name: 'Unsaved changes' });
    expect(guard).toHaveTextContent('You have unsaved changes');
    await userEvent.click(within(guard).getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(window.location.search).toContain('record=task-2');

    await userEvent.click(within(footer()!).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onSaved).toHaveBeenCalledWith({ id: 'task-2', title: 'Book the room 4B', owner: 'Ben' });
    await waitFor(() => expect(footer()).toBeNull());

    await userEvent.click(screen.getByRole('button', { name: 'Back to list' }));
    await waitFor(() => expect(window.location.search).not.toContain('record='));
    expect(onNavigate).toHaveBeenLastCalledWith({ to: 'list' });
    // The list shows the saved value, and the focus is on the link of the saved row.
    await waitFor(() => expect(screen.getByRole('link', { name: 'Book the room 4B' })).toBe(document.activeElement));
  }, 20_000);

  it('a module without bulk deletion has no selection: no checkbox, no selection bar', async () => {
    render(<RecordCrud {...props(TASKS)} />);
    await screen.findByRole('link', { name: 'Write the brief' });
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(document.querySelector('[data-rop-selection-bar]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete selected' })).toBeNull();
    // Nor a row menu: the module has no deletion either.
    expect(screen.queryByRole('button', { name: /^Actions for / })).toBeNull();
  });

  it('a module with no toast to show mounts no toast live regions (only the shell it needs)', async () => {
    render(<RecordCrud {...props(TASKS)} />);
    await screen.findByRole('link', { name: 'Write the brief' });
    expect(screen.queryAllByRole('status')).toHaveLength(0);
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
  });

  it('`?create=1` of a module without creation shows its list, never an editor', async () => {
    window.history.replaceState(null, '', '/?module=tasks&create=1');
    render(<RecordCrud {...props(TASKS)} />);
    await listTitle('Tasks');
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });
});

describe('RecordCrud (#519): the module words, with an irregular plural', () => {
  it('"New person", "People", the creation toast and title come from the nouns', async () => {
    const onCreated = vi.fn();
    render(<RecordCrud {...props(PEOPLE, { onCreated })} />);
    await listTitle('People');
    await userEvent.click(screen.getByRole('button', { name: 'New person' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'New person' })).toBeTruthy();
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Dora Lind');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ id: 'p-4', name: 'Dora Lind', city: '' }));
    await listTitle('People');
    expect(await screen.findByText('Person Dora Lind created')).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('link', { name: 'Dora Lind' })).toBe(document.activeElement));
  }, 20_000);

  it('bulk delete says "people" for several and "person" for one', async () => {
    render(<RecordCrud {...props(PEOPLE)} />);
    await screen.findByRole('link', { name: 'Ada Rivers' });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Ada Rivers' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Ben Okafor' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete selected' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete 2 people?' });
    expect(dialog).toHaveTextContent('The people are deleted permanently.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete 2 people' }));
    expect(await screen.findByText('2 people deleted')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Ada Rivers' })).toBeNull());

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Cleo Hart' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete selected' }));
    const one = await screen.findByRole('dialog', { name: 'Delete 1 person?' });
    expect(one).toHaveTextContent('The person is deleted permanently.');
  }, 20_000);

  it('row delete and page delete name the person with the singular', async () => {
    render(<RecordCrud {...props(PEOPLE)} />);
    await screen.findByRole('link', { name: 'Ben Okafor' });
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Ben Okafor' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete person Ben Okafor?' });
    expect(dialog).toHaveTextContent('The person is deleted permanently.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete person' }));
    expect(await screen.findByText('Person Ben Okafor deleted')).toBeTruthy();

    await userEvent.click(screen.getByRole('link', { name: 'Cleo Hart' }));
    await screen.findByRole('heading', { level: 1, name: /Cleo Hart/ });
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('dialog', { name: 'Delete person Cleo Hart?' })).toBeTruthy();
  }, 20_000);
});

describe('RecordCrud (#519): list parameters and scroll per module, never shared', () => {
  it('two modules in one iframe each come back to their own sort and scroll', async () => {
    const restore = scrollableElements();
    try {
      render(<TwoModules />);
      // People (the default module): sort by name, descending, then scroll.
      await screen.findByRole('link', { name: 'Ada Rivers' });
      await sortBy('Name');
      await sortBy('Name');
      expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute('aria-sort', 'descending');
      expect(window.location.search).toBe('?sort=name.desc');
      await scrollList(120);
      await userEvent.click(screen.getByRole('link', { name: 'Ben Okafor' }));
      await screen.findByRole('heading', { level: 1, name: /Ben Okafor/ });
      await userEvent.click(screen.getByRole('button', { name: 'Back to list' }));
      await screen.findByRole('link', { name: 'Ada Rivers' });
      expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute('aria-sort', 'descending');
      expect(scroller().scrollTop).toBe(120);

      // Tasks, in the same iframe: neither the sort nor the scroll of the people.
      switchTo('?sort=name.desc&module=tasks');
      await screen.findByRole('link', { name: 'Write the brief' });
      expect(screen.getByRole('columnheader', { name: 'Title' })).not.toHaveAttribute('aria-sort', 'descending');
      expect(screen.getByRole('columnheader', { name: 'Title' })).not.toHaveAttribute('aria-sort', 'ascending');
      expect(scroller().scrollTop).toBe(0);
      await sortBy('Title');
      expect(screen.getByRole('columnheader', { name: 'Title' })).toHaveAttribute('aria-sort', 'ascending');
      // Its own parameter: the people's is kept byte for byte.
      expect(window.location.search).toBe('?sort=name.desc&module=tasks&tasks.sort=title.asc');
      await scrollList(40);
      await userEvent.click(screen.getByRole('link', { name: 'Archive the notes' }));
      await screen.findByRole('heading', { level: 1, name: /Archive the notes/ });
      expect(window.location.search).toBe('?sort=name.desc&module=tasks&tasks.sort=title.asc&record=task-3');
      await userEvent.click(screen.getByRole('button', { name: 'Back to list' }));
      await screen.findByRole('link', { name: 'Archive the notes' });
      expect(screen.getByRole('columnheader', { name: 'Title' })).toHaveAttribute('aria-sort', 'ascending');
      expect(scroller().scrollTop).toBe(40);

      // Back to the people: their own sort and scroll, not the tasks'.
      switchTo('?sort=name.desc&tasks.sort=title.asc');
      await screen.findByRole('link', { name: 'Ada Rivers' });
      expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute('aria-sort', 'descending');
      expect(scroller().scrollTop).toBe(120);
      const names = screen.getAllByRole('link').map((a) => a.textContent);
      expect(names).toEqual(['Cleo Hart', 'Ben Okafor', 'Ada Rivers']);
    } finally {
      restore();
    }
  }, 30_000);
});

describe('RecordCrud (#519, B3 of #518): one registry for reading and writing', () => {
  it('a registered module writes a URL that reads back as itself; the default module carries no `module`', () => {
    window.history.replaceState(null, '', '/?q=x');
    openRecord('task-2', 'tasks');
    expect(window.location.search).toBe('?q=x&module=tasks&record=task-2');
    expect(readRoute()).toEqual({ module: 'tasks', kind: 'record', id: 'task-2' });
    window.history.replaceState(null, '', '/?q=x');
    openCreate('people');
    expect(window.location.search).toBe('?q=x&create=1');
    expect(readRoute()).toEqual({ module: 'people', kind: 'create' });
  });

  it('an unregistered module throws before writing anything: no URL, no history entry, no href', () => {
    window.history.replaceState(null, '', '/?q=x');
    const entries = window.history.length;
    expect(() => openRecord('x-1', 'contacts')).toThrow('unknown module "contacts"');
    expect(() => openCreate('contacts')).toThrow('unknown module "contacts"');
    expect(() => recordHref('x-1', 'contacts')).toThrow('unknown module "contacts"');
    expect(window.location.search).toBe('?q=x');
    expect(window.history.length).toBe(entries);
  });

  it('the shell refuses a module that is not registered, at mount', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<RecordCrud {...props({ ...TASKS, name: 'contacts' })} />)).toThrow('unknown module "contacts"');
    expect(window.location.search).toBe('');
  });
});
