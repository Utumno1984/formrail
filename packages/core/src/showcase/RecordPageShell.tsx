// Story-only (#519, from the record page of #150/#151/#363/#365): the record page of a module, part of the
// record-editing shell, composed ONLY from the public Object Page pieces. The module gives the form (its values,
// its validation, its sections as JSX: `RecordModule.form`); this file holds what every record page does the same
// way: loading, not found, the save bar, the dirty-guard and its wording, Save/Discard, Create/Cancel, the
// pessimistic Delete, the story-only add-ons of the Pro showcase. Not exported by the package.
// Spec §1.4: the editor is mounted already hydrated (`key` per record + `baseline` at mount); a fetch in flight is
// a loading state, never an editor that is hydrated afterwards (no render with empty values before the data).
import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { Button } from '../button/Button';
import { useConfirmDialog, type ConfirmOptions } from '../confirm-dialog/use-confirm-dialog';
import { ValidationProvider } from '../field/ValidationContext';
import { getErrorSummary } from '../object-page/error-summary';
import { ObjectPage } from '../object-page/ObjectPage';
import { ObjectPageFooter } from '../object-page/ObjectPageFooter';
import { ObjectPageHeader } from '../object-page/ObjectPageHeader';
import { useDirtyGuard } from '../object-page/use-dirty-guard';
import { useFocusFirstInvalidField } from '../object-page/use-focus-first-invalid-field';
import { useObjectPageForm, type UseObjectPageFormReturn } from '../object-page/use-object-page-form';
import { isDev } from '../internal/is-dev';
import { MessageStrip } from '../message-strip/MessageStrip';
import { NOTICE_CAP_VAR, useNoticeCap } from './notice-cap';
import { capitalize, type RecordModule } from './record-module';
import { RecordNotFoundError, type RecordStore } from './record-store';

/** What `reviewSave` receives: the values about to be saved and the REAL saved baseline (never a default). */
export interface RecordSaveReviewContext<V> {
  values: V;
  baseline: V;
}

/** The review dialog: the options of the editor's `confirm()` (#344) that the reviewer chooses. */
export type RecordSaveReview = Pick<
  ConfirmOptions,
  'title' | 'description' | 'confirmLabel' | 'cancelLabel' | 'tone' | 'initialFocus' | 'children'
>;

/** Builds the review of a save, or `null` to save without one (nothing to review). */
export type RecordSaveReviewer<V> = (context: RecordSaveReviewContext<V>) => RecordSaveReview | null;

/** What the story-only `useAddons` extension (#384) receives at every render of an existing record's editor. */
export interface RecordEditorAddonContext<T extends { id: string }, V extends object, D> {
  form: UseObjectPageFormReturn<V>;
  /** The record the editor was opened with. */
  record: T;
  store: RecordStore<T, D>;
  /** The editor's own conversion of a stored record into its values (the baseline of a save, of a load). */
  toValues: (record: T) => V;
  /** The page's scroll container (the `ObjectPage` scroller), `null` before the first commit. */
  scrollerRef: RefObject<HTMLElement | null>;
}

/** What `useAddons` adds to the editor; every key is optional and absent changes nothing. */
export interface RecordEditorAddons<V> {
  /**
   * Rendered ABOVE the page's scroller, outside it (#384, the "appears above the scroller" option): always in
   * view, its height taken from the top of the scroller. Without it the editor's layout is unchanged.
   */
  notice?: ReactNode;
  /** More header actions, after the editor's own. */
  actions?: ReactNode;
  /** A help text for the Field of a form path (`dueDate`, `lineItems.1.quantity`), linked with `aria-describedby`. */
  fieldHelp?: (path: string) => ReactNode;
  /** Replaces the `reviewSave` prop. */
  reviewSave?: RecordSaveReviewer<V>;
}

/**
 * Story-only extension point (#384, used by the Pro showcase): a hook called at every render of the editor of an
 * EXISTING record (never a creation). The hook is chosen when the editor mounts and kept for its whole life (a
 * different hook later would change the order of the hooks): a later change of the prop is ignored, with a
 * warning in development; remount the editor (`key`) to change it. Absent, nothing changes.
 */
export type UseRecordEditorAddons<T extends { id: string }, V extends object, D> = (
  context: RecordEditorAddonContext<T, V, D>,
) => RecordEditorAddons<V>;

/**
 * The story-only add-ons of ONE module (#519): `reviewSave` (#377) and `useAddons` (#384). The shell takes them
 * per module (`addons: { <module name>: { reviewSave, useAddons } }`); absent, the module's pages are unchanged.
 */
export interface RecordAddons<T extends { id: string }, V extends object, D> {
  reviewSave?: RecordSaveReviewer<V> | undefined;
  useAddons?: UseRecordEditorAddons<T, V, D> | undefined;
}

const NO_ADDONS = {};
function useNoAddons<V>(): RecordEditorAddons<V> {
  return NO_ADDONS;
}

const VISUALLY_HIDDEN: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
};

const summaryText = (count: number) => (count === 1 ? '1 invalid field' : `${count} invalid fields`);
const errorText = (error: unknown): string | undefined =>
  error === null || error === undefined ? undefined : error instanceof Error ? error.message : String(error);
const hasErrors = (errors: Partial<Record<string, string>>): boolean => Object.values(errors).some((e) => e !== undefined);
const SAVING_HINT = 'Saving… Discard only restores the form: the save still completes.';

export interface RecordPageProps<T extends { id: string }, V extends object, D> extends RecordAddons<T, V, D> {
  module: RecordModule<T, V, D>;
  store: RecordStore<T, D>;
  recordId: string;
  /** Called by "Back to list" (after the dirty-guard confirmation when the form is dirty). */
  onBack: () => void;
  /** Called once per successful save with the record as the server stored it. */
  onSaved?: ((record: T) => void) | undefined;
  /** CRUD only (#365): see `RecordEditorProps.onDelete`. Without it the header has no "Delete". */
  onDelete?: ((record: T) => Promise<void>) | undefined;
  /** CRUD only (#365): see `RecordEditorProps.onDeleteDone`. */
  onDeleteDone?: (() => void) | undefined;
}

type LoadState<T> = { key: string; record: T } | { key: string; error: unknown };

/** Loads the record, then mounts the editor. No editable field exists until the record has arrived. */
export function RecordPage<T extends { id: string }, V extends object, D>({
  module,
  store,
  recordId,
  onBack,
  onSaved,
  onDelete,
  onDeleteDone,
  reviewSave,
  useAddons,
}: RecordPageProps<T, V, D>) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<LoadState<T> | null>(null);
  const key = `${recordId}#${attempt}`;
  const { one } = module.noun;

  useEffect(() => {
    // Tracks the last request: a response for a superseded id/attempt is dropped.
    let current = true;
    store.get(recordId).then(
      (record) => current && setResult({ key, record }),
      (error: unknown) => current && setResult({ key, error }),
    );
    return () => {
      current = false;
    };
  }, [store, recordId, key]);

  // A result that belongs to another request counts as "still loading": no stale editor is ever shown.
  const settled = result && result.key === key ? result : null;

  // One live region, always mounted: its text changes after mount, so the loading and the arrival of
  // the editor are announced (a region inserted already filled may be skipped by a screen reader).
  const announcement = !settled
    ? `Loading ${one}…`
    : 'record' in settled
      ? `${capitalize(one)} ${module.recordName(settled.record)} loaded`
      : '';
  const announcer = (
    <div role="status" style={VISUALLY_HIDDEN}>
      {announcement}
    </div>
  );

  if (!settled) {
    return (
      <>
        {announcer}
        <div style={{ padding: 16 }}>Loading {one}…</div>
      </>
    );
  }
  if ('error' in settled) {
    const notFound = settled.error instanceof RecordNotFoundError;
    return (
      <>
        {announcer}
        <div style={{ display: 'grid', gap: 12, padding: 16, maxWidth: 560 }}>
          <MessageStrip tone="error" title={notFound ? `${capitalize(one)} not found` : `Could not load the ${one}`}>
            {notFound ? `There is no ${one} with id "${recordId}".` : (errorText(settled.error) ?? 'Unknown error')}
          </MessageStrip>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={onBack}>Back to list</Button>
            {notFound ? null : (
              <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
                Retry
              </Button>
            )}
          </div>
        </div>
      </>
    );
  }
  // `key`: a different record is a different editor, mounted hydrated, never a reset of the old one.
  return (
    <>
      {announcer}
      <RecordEditor
        key={settled.record.id}
        module={module}
        store={store}
        record={settled.record}
        onBack={onBack}
        onSaved={onSaved}
        onDelete={onDelete}
        onDeleteDone={onDeleteDone}
        reviewSave={reviewSave}
        useAddons={useAddons}
        focusTitleOnMount={attempt > 0}
      />
    </>
  );
}

export interface RecordEditorProps<T extends { id: string }, V extends object, D> extends RecordAddons<T, V, D> {
  module: RecordModule<T, V, D>;
  store: RecordStore<T, D>;
  /**
   * The record to edit, or `null` to CREATE one (#363): same sections, the module's default values,
   * "Create"/"Cancel". Creating needs the module's `create`.
   */
  record: T | null;
  onBack: () => void;
  onSaved?: ((record: T) => void) | undefined;
  /** After "Retry" the button that had the focus is gone: the title takes it (never `<body>`). */
  focusTitleOnMount: boolean;
  /** Creation only. Today's date (yyyy-mm-dd), for the module's defaults. Default: the local date. */
  today?: string | undefined;
  /** Creation only. Called once per successful create with the record as the server stored it, even if the page was left meanwhile. */
  onCreated?: ((record: T) => void) | undefined;
  /**
   * Creation only. Called once after a successful create, when the form is clean again (the dirty-guard no
   * longer intercepts): the consumer navigates away from here, never right after the `await`.
   */
  onCreateDone?: ((record: T) => void) | undefined;
  /**
   * Editing only, CRUD only (#365): adds "Delete" to the header. Deletes the record on the server: the
   * confirmation stays pending until it settles; a rejection keeps it open and interactive (the consumer
   * reports the error). Not called while a save is in flight ("Delete" is `aria-disabled` then).
   */
  onDelete?: ((record: T) => Promise<void>) | undefined;
  /**
   * Called once after a confirmed delete, from an effect once the dirty-guard is disarmed: the consumer
   * navigates away from here (the guard would otherwise intercept the `popstate` of `history.back()`).
   */
  onDeleteDone?: (() => void) | undefined;
  // `reviewSave` (from `RecordAddons`): story-only extension point (#377, used by the Pro showcase); absent,
  // nothing changes. Editing only (a creation saves directly: a diff against defaults reviews nothing). On Save,
  // once the form is VALID (with errors Save behaves as without it: the errors, the summary, the focus on the
  // first invalid field) and no save is in flight, it is called with the values and the saved baseline: what it
  // returns is shown in the editor's confirmation dialog; confirming runs the SAME save as without it (there is
  // no second save path), cancelling saves nothing and leaves the form as it was. `null`: saves directly.
  // `useAddons` (from `RecordAddons`): story-only extension point (#384), editing only: see `UseRecordEditorAddons`.
}

export function RecordEditor<T extends { id: string }, V extends object, D>({
  module,
  store,
  record,
  onBack,
  onSaved,
  focusTitleOnMount,
  today,
  onCreated,
  onCreateDone,
  onDelete,
  onDeleteDone,
  reviewSave: reviewSaveProp,
  useAddons: useAddonsProp,
}: RecordEditorProps<T, V, D>) {
  const creating = record === null;
  const { form: definition, noun } = module;
  const Sections = definition.Sections;
  const HeaderActions = definition.HeaderActions;
  // #365: `deleting` while the confirmed delete waits for the server; `deleted` once the server deleted the
  // record (set in the same callback, so no render ever has both false in between). `deleting` ARMS the guard
  // like a save in flight does (browser Back asks "Delete in progress", also on a clean form); `deleted`
  // disarms it (whatever was unsaved is gone with the record, and the dialog said so) BEFORE the navigation,
  // which starts from an effect (below). Until that navigation lands (`history.back()` is asynchronous) the page
  // is still mounted: from `deleting` on, Save/Discard/Delete do nothing, and from `deleted` on the footer is
  // gone (code review of #372: a Save there reached the store for a record it had just deleted).
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const deleteBusy = deleting || deleted;
  const [confirm, confirmDialog] = useConfirmDialog();
  // Mounted hydrated: the baseline is the record (or the defaults of a creation) at the first render.
  const form = useObjectPageForm<V>({
    baseline: record ? definition.toValues(record) : creationDefaults(module, today),
    isEqual: definition.isEqual,
    validate: definition.validate,
  });
  // #166: while a save is in flight, leaving cannot discard anything (the save still lands in the store), so
  // the guard stays armed (even after a footer "Discard" made the form clean) and the dialog says what really
  // happens (this also covers browser Back, which opens the same dialog). The "save" wording is sticky: it is
  // set as soon as a save starts and cleared only by real unsaved edits once no save runs. So a dialog that is
  // open when the save settles with a clean form keeps saying what it said; if the save fails or edits made
  // meanwhile remain, the form is dirty again and the wording goes back to "unsaved changes" (which is true).
  const [savingWording, setSavingWording] = useState(false);
  // #523: the writes of a module's header action in flight (`saveRecord`, the customers' "Restore"). They arm the
  // guard like a save does (also on a clean form: leaving does not cancel them) and use the same "save" wording.
  const [actionWrites, setActionWrites] = useState(0);
  const writing = form.isSaving || actionWrites > 0;
  useEffect(() => {
    if (writing) setSavingWording(true);
    else if (form.isDirty) setSavingWording(false);
  }, [writing, form.isDirty]);
  // The values the save in flight sends: an edit made after Save is NOT part of it and would be lost on leaving.
  const sentRef = useRef<V | null>(null);
  const editedSinceSave =
    form.isSaving && form.isDirty && !!sentRef.current && !definition.isEqual(form.values, sentRef.current);
  // #523: a save the module locks (`lockWhileSaving`, the customers' archiving): from the render where it starts
  // (`sentRef` is set synchronously by the handler, in the same task as `isSaving`) until it settles, the sections
  // disable their fields with this reason and "Discard" does nothing. Read from what is SENT, not from the draft.
  const savingLock =
    form.isSaving && sentRef.current && definition.lockWhileSaving ? definition.lockWhileSaving(sentRef.current) : undefined;
  // The "delete" wording is sticky like the "save" one: a guard dialog opened during the delete keeps saying
  // what it said if the delete then fails (a clean form disarms the guard, but an open dialog stays until the
  // user chooses); real unsaved edits, once no delete runs, bring back the "unsaved changes" wording.
  const [deleteWording, setDeleteWording] = useState(false);
  useEffect(() => {
    if (deleting) setDeleteWording(true);
    else if (form.isDirty) setDeleteWording(false);
  }, [deleting, form.isDirty]);
  const { guard, dialog } = useDirtyGuard({
    when: !deleted && (form.isDirty || writing || deleting),
    labels: deleting || deleteWording
      ? {
          title: 'Delete in progress',
          description: form.isDirty
            ? `The ${noun.one} is being deleted. Leaving does not cancel it: it will complete in the background. Your unsaved changes will be lost.`
            : `The ${noun.one} is being deleted. Leaving does not cancel it: it will complete in the background.`,
          stay: 'Stay',
          leave: 'Leave anyway',
          close: 'Close',
        }
      : editedSinceSave
      ? {
          title: 'Unsaved changes',
          description:
            'A save is in progress and will complete, but the changes you made after pressing Save are not part of it and will be lost.',
          stay: 'Keep editing',
          leave: 'Discard newer changes',
          close: 'Close',
        }
      : savingWording || writing
      ? {
          title: 'Unsaved changes',
          description: 'A save is still in progress. Leaving does not cancel it: it will complete in the background.',
          stay: 'Keep editing',
          leave: 'Leave anyway',
          close: 'Close',
        }
      : {
          title: 'Unsaved changes',
          description: 'You have unsaved changes: if you leave now they will be lost.',
          stay: 'Keep editing',
          leave: 'Discard changes',
          close: 'Close',
        },
  });
  // #384: ONE hook for the life of the editor, chosen at mount: calling another one later (the prop removed or
  // replaced) would change the order of the hooks. A later change of the prop is ignored, with a warning.
  const [useAddons] = useState<UseRecordEditorAddons<T, V, D>>(() => (record && useAddonsProp) || useNoAddons);
  const mountedAddons = useRef(useAddonsProp);
  useEffect(() => {
    if (useAddonsProp !== mountedAddons.current && isDev()) {
      console.warn('[showcase] RecordEditor: useAddons changed after the mount; the hook of the mount is kept (remount the editor with a `key` to change it).');
    }
  }, [useAddonsProp]);
  // Declared BEFORE the getter below and the addons hook (#470): an addon that reads `scrollerRef.current` during
  // its render gets `null` before the first commit, never a ReferenceError (temporal dead zone of a later `const`).
  const frameRef = useRef<HTMLDivElement>(null);
  // The ObjectPage scroller, read from the DOM (the page does not expose it): a stable ref-like object.
  const [scrollerRef] = useState<RefObject<HTMLElement | null>>(() => ({
    get current() {
      return frameRef.current?.querySelector<HTMLElement>('[data-object-page-scroller]') ?? null;
    },
  }));
  const addons = useAddons({ form, record: record as T, store, toValues: definition.toValues, scrollerRef });
  const reviewSave = addons.reviewSave ?? reviewSaveProp;
  const help = addons.fieldHelp;
  // #470: the notice row's cap follows the room really left to edit (short screens, the virtual keyboard).
  const noticeRef = useRef<HTMLDivElement>(null);
  useNoticeCap(frameRef, noticeRef);
  useFocusFirstInvalidField({ containerRef: frameRef, fieldErrors: form.fieldErrors });
  useEffect(() => {
    if (focusTitleOnMount) frameRef.current?.querySelector('h1')?.focus();
  }, [focusTitleOnMount]);

  // #523: what a module's header action writes on the server (the customers' "Restore"): the page's store, as Save.
  // Counted while in flight: the guard stays armed until the store answers (a setState after unmount is a no-op).
  const saveRecord = async (changed: T): Promise<T> => {
    setActionWrites((n) => n + 1);
    try {
      const stored = await store.save(changed);
      onSaved?.(stored);
      return stored;
    } finally {
      setActionWrites((n) => n - 1);
    }
  };

  // Creation: the record the server created. The way out waits for the CLEAN form that follows (below).
  const [created, setCreated] = useState<T | null>(null);
  const save = () => {
    if (deleteBusy) return; // the record is being (or has been) deleted: nothing left to save
    // Already created (the user kept typing during the save and kept editing at the guard): never a second
    // record; the button only asks to leave again.
    if (created) return guard(() => onCreateDone?.(created));
    if (!record || !reviewSave) return commit();
    // #377: no review while a save is in flight (Save is `aria-disabled`, which does not block a click), and
    // none of an invalid form: `commit` then fails the validation exactly as without a review.
    if (form.isSaving) return;
    if (hasErrors(definition.validate(form.values))) return commit();
    const review = reviewSave({ values: form.values, baseline: form.baseline });
    if (!review) return commit();
    // No `onConfirm`: the dialog closes at once and the save shows its progress in the footer, as without it.
    void confirm(review).then((ok) => {
      if (ok) commit();
    });
  };
  const commit = () => {
    void form.save(async (v) => {
      sentRef.current = v;
      if (!record) {
        const made = await store.create(creation(module).toDraft(v));
        onCreated?.(made);
        setCreated(made);
        // The baseline becomes the created record as the "server" returned it.
        return definition.toValues(made);
      }
      const saved = await store.save(definition.toRecord(record, v));
      onSaved?.(saved);
      // The baseline becomes what the "server" returned (normalized), not what was sent.
      return definition.toValues(saved);
    });
  };

  // The navigation after a Create starts from HERE, after the commit of the clean form, not right after the
  // `await`: while `isDirty`/`isSaving` are true the guard also intercepts the `popstate` of `history.back()`
  // and would open "Unsaved changes" after a successful Create. If the user kept typing during the save the
  // form is dirty again and the guard (rightly) asks about those newer edits.
  const doneRef = useRef(false);
  useEffect(() => {
    if (!created || form.isSaving || doneRef.current) return;
    doneRef.current = true;
    guard(() => onCreateDone?.(created));
  }, [created, form.isSaving, guard, onCreateDone]);

  // #365: pessimistic. The confirmation stays pending (spinner, no second confirm, no Escape) until the server
  // answers: on this page the record must not "go away" before it is known to be gone. A failure keeps the
  // dialog open and interactive (the consumer shows the error toast): retry or Cancel, which gives the focus
  // back to "Delete".
  const remove = () => {
    if (!record || !onDelete || form.isSaving || deleteBusy) return; // `aria-disabled` does not block a click
    void confirm({
      title: `Delete ${noun.one} ${module.recordName(record)}?`,
      description: form.isDirty
        ? `The ${noun.one} is deleted permanently. Unsaved changes will be lost too.`
        : `The ${noun.one} is deleted permanently.`,
      confirmLabel: `Delete ${noun.one}`,
      onConfirm: async () => {
        setDeleting(true);
        try {
          await onDelete(record);
        } catch (error) {
          setDeleting(false); // the dialog stays open: retry or Cancel
          throw error;
        }
        setDeleted(true);
      },
      // Reported by the consumer (a toast); handled, so not an uncaught error.
      onError: () => undefined,
    });
  };
  // The navigation starts after the commit that disarmed the guard (the same reason as for the Create).
  const deleteDoneRef = useRef(false);
  useEffect(() => {
    if (!deleted || deleteDoneRef.current) return;
    deleteDoneRef.current = true;
    onDeleteDone?.();
  }, [deleted, onDeleteDone]);

  // The save error, when there is one, wins over the summary (`||`, not `??`).
  const problem =
    errorText(form.saveError) ||
    getErrorSummary(form.fieldErrors, { formErrors: form.formErrors, message: summaryText });
  // #166: while a save runs, the footer Discard only restores the form (the save still lands): say it BEFORE
  // the click, since the footer hides once the form is clean.
  // #523: during a locked save Discard does nothing, so the hint says why instead.
  const message =
    problem || (form.isSaving ? (creating ? 'Saving…' : savingLock ? `Saving… ${savingLock}` : SAVING_HINT) : undefined);

  return (
    <div
      ref={frameRef}
      style={{
        height: 'var(--rop-demo-viewport-height, 100dvh)',
        boxSizing: 'border-box',
        display: 'grid',
        // #384: a row for the notice of an addon, above the page (none without one: the Free layout as before).
        gridTemplateRows: addons.notice === undefined ? 'minmax(0, 1fr)' : 'auto minmax(0, 1fr)',
      }}
    >
      {addons.notice === undefined ? null : (
        // At most 40% of the visible height, lowered so that the page below keeps room to edit (see notice-cap.ts,
        // #470: short screens and the virtual keyboard); a longer notice scrolls on its own.
        <div ref={noticeRef} data-editor-notice="" style={{ minWidth: 0, maxHeight: `var(${NOTICE_CAP_VAR}, 40vh)`, overflowY: 'auto' }}>
          {addons.notice}
        </div>
      )}
      <ValidationProvider fieldErrors={form.fieldErrors}>
        <ObjectPage labels={{ anchorBar: 'Sections' }}>
          <ObjectPageHeader
            title={record ? module.recordName(record) : `New ${noun.one}`}
            // The identity shows the SAVED record (the baseline), not the unsaved draft. A new record has
            // neither a subtitle nor a status yet.
            subtitle={record ? definition.subtitle?.(form.baseline) : undefined}
            status={record ? definition.status?.(form.baseline) : undefined}
            actions={
              <>
                <Button variant="secondary" onClick={() => guard(onBack)}>
                  Back to list
                </Button>
                {record && onDelete ? (
                  <Button variant="secondary" onClick={remove} aria-disabled={form.isSaving || deleteBusy || undefined}>
                    Delete
                  </Button>
                ) : null}
                {record && HeaderActions ? <HeaderActions form={form} record={record} saveRecord={saveRecord} /> : null}
                {addons.actions}
              </>
            }
          />
          <ObjectPageFooter
            visible={!deleted && (creating || form.isDirty)}
            label="Save actions"
            toneLabel={problem ? 'Error' : 'Information'}
            message={message}
            messageTone={problem ? 'error' : 'info'}
          >
            <Button onClick={save} aria-disabled={form.isSaving || deleteBusy || undefined}>
              {creating ? 'Create' : 'Save'}
            </Button>
            {creating ? (
              // Leaves the page (through the guard); it is not the "Discard" of the Update.
              <Button variant="secondary" onClick={() => guard(onBack)}>
                Cancel
              </Button>
            ) : (
              <Button
                variant="secondary"
                onClick={() => {
                  if (!deleteBusy && !savingLock) form.reset();
                }}
                aria-disabled={deleteBusy || savingLock !== undefined || undefined}
              >
                Discard
              </Button>
            )}
          </ObjectPageFooter>
          <Sections form={form} record={record} help={help} savingLock={savingLock} />
        </ObjectPage>
      </ValidationProvider>
      {dialog}
      {confirmDialog}
    </div>
  );
}

/** The module's creation, or a loud error: the creation page of a module that cannot create is a showcase bug. */
function creation<T extends { id: string }, V extends object, D>(module: RecordModule<T, V, D>) {
  if (!module.create) throw new Error(`[showcase] the "${module.name}" module has no \`create\`: it has no creation page.`);
  return module.create;
}

const creationDefaults = <T extends { id: string }, V extends object, D>(module: RecordModule<T, V, D>, today: string | undefined): V =>
  creation(module).defaults(today);
