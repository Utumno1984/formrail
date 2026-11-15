// Story-only (#519): what a domain gives the record-editing shell (`RecordCrud`, `RecordListView`,
// `RecordPageShell`). The shell holds the FLOW (list -> record page -> list, creation, deletion, dirty-guard,
// toasts, confirmations, the focus after a mutation, the scroll and the list parameters coming back); a module
// holds what belongs to its record type only (its words, its columns and pills, its form). A plain object
// literal, written once per domain: no runtime registry of fields, no form generated from a schema, the fields
// of the page stay explicit JSX in the module (it is the part a reader copies). Not exported by the package.
import type { ComponentType, ReactNode } from 'react';
import type { ListReportLabels } from '../list-report/ListReport';
import type { ListReportColumn, ListReportFilter } from '../list-report/types';
import type { FieldErrors } from '../object-page/field-errors';
import type { UseObjectPageFormReturn } from '../object-page/use-object-page-form';
import type { RecordStore } from './record-store';

/**
 * The name of one record and of several, lower case (`task` / `tasks`, `person` / `people`): the shell
 * writes every sentence from these two words ("New task", "Delete 3 people?", "Task T-1 deleted"), so an
 * irregular plural is simply given, never derived by adding an `s`. The first letter is capitalized where a
 * sentence starts with it.
 */
export interface RecordNoun {
  one: string;
  many: string;
}

/** What the module's sections receive at every render of the record page (or of the creation page). */
export interface RecordSectionsProps<T extends { id: string }, V extends object> {
  /** The page's form: `values`, `setValue`, `baseline` (the saved values) and the rest of `useObjectPageForm`. */
  form: UseObjectPageFormReturn<V>;
  /** The record the page was opened with, `null` on the creation page. */
  record: T | null;
  /** Story-only (#384): a help text an add-on gives the Field of a form path, `undefined` without one. */
  help: ((path: string) => ReactNode) | undefined;
}

/** The list of a module: what `useListReport` and `ListReport` need that belongs to the record type. */
export interface RecordModuleList<T extends { id: string }> {
  /** Every column is sortable (the URL accepts a sort on any of them). */
  columns: readonly ListReportColumn<T>[];
  /** The pills; the first one is the default (no pill parameter in the URL). */
  filters: readonly ListReportFilter<T>[];
  /** The id of the column whose cell becomes the link to the record page (its text: `recordName`). */
  linkColumn: string;
  /** The texts of the table's states (loading, empty, no results, error, counts). */
  labels: Partial<ListReportLabels>;
}

/** The record page of a module: how a record becomes the values of a form, how they are checked and saved. */
export interface RecordModuleForm<T extends { id: string }, V extends object> {
  /** The form values of a stored record: the baseline of the page, and of every save (what the server returned). */
  toValues: (record: T) => V;
  /** Whether two sets of values are the same (the form is dirty when the values differ from the baseline). */
  isEqual: (a: V, b: V) => boolean;
  /** One message per invalid field, keyed by path (`{}` when valid). Runs on Save, before any server call. */
  validate: (values: V) => FieldErrors;
  /** The record to send on Save: the record the page was opened with, with the values applied. */
  toRecord: (record: T, values: V) => T;
  /** The header's subtitle, from the SAVED values (the baseline), never the unsaved draft. Absent: none. */
  subtitle?: (baseline: V) => ReactNode;
  /** The header's status, from the saved values. Absent: none. */
  status?: (baseline: V) => ReactNode;
  /**
   * The sections of the page (`ObjectPageSection`s with their `Field`s), as explicit JSX. Rendered inside the
   * page's `ObjectPage`, after its header and footer, on the record page and on the creation page.
   */
  Sections: ComponentType<RecordSectionsProps<T, V>>;
}

/** Creation (#363): the page of a new record. Absent, the list has no "New …" button and there is no creation page. */
export interface RecordModuleCreate<V extends object, D> {
  /** The values of a new record. `today`: the default date (yyyy-mm-dd) the story may fix; absent, the local date. */
  defaults: (today: string | undefined) => V;
  /** What the client sends to create a record (the store assigns the identity). */
  toDraft: (values: V) => D;
}

/**
 * Story-only: a record type of the showcase, as the shell sees it. `T`: the record as stored; `V`: the values of
 * its form; `D`: what creating one sends. Every optional part is a feature of the shell the module opts into.
 */
export interface RecordModule<T extends { id: string }, V extends object, D = Omit<T, 'id'>> {
  /** The route name: must be in `SHOWCASE_MODULES` (showcase-modules.ts), or the shell throws when it mounts. */
  name: string;
  noun: RecordNoun;
  /** The in-memory "server" of one mount of the shell: two mounts never share one. */
  createStore: () => RecordStore<T, D>;
  /** How one record is named in titles, links and messages (the document number, a full name). */
  recordName: (record: T) => string;
  list: RecordModuleList<T>;
  form: RecordModuleForm<T, V>;
  create?: RecordModuleCreate<V, D>;
  /** `true`: "Delete" in the row's "…" menu (optimistic) and in the record page header (pessimistic). */
  delete?: boolean;
  /** `true`: the list is selectable, with "Delete selected" in the selection bar (#366). Absent: no selection. */
  deleteMany?: boolean;
}

/** Capitalizes the first letter: `task` -> `Task`. */
export const capitalize = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

/** "1 task", "3 tasks", "3 people". */
export const countOf = (noun: RecordNoun, n: number): string => `${n} ${n === 1 ? noun.one : noun.many}`;
