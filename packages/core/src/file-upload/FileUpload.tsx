import {
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ChangeEvent,
  type DragEvent,
  type MouseEvent,
} from 'react';
import { Button } from '../button/Button';
import { FieldContext } from '../field/FieldContext';
import { useFieldControlProps } from '../field/useFieldControlProps';
import { internalIcons } from '../internal/icons';
import { TruncatedText } from '../truncated-text/TruncatedText';
import { cn } from '../utils/cn';
import { composeRefs } from '../utils/compose-refs';
import { fileIdentity, formatFileSize, resolveSelection, type FileRejection } from './selection';

export type { FileRejection } from './selection';

export interface FileUploadLabels {
  /** Text of the button that opens the file picker. */
  chooseFiles: string;
  /** Hint next to the button about dropping files; hidden on touch devices (coarse pointer). */
  dropHint: string;
  /** Accessible name of the remove button of one file (distinct per file). */
  remove: (name: string) => string;
  /** Announced (polite live region) after the user adds or removes files. */
  selectedCount: (count: number) => string;
  /** Accessible name of the list of selected files. */
  listLabel: string;
  /** Visually hidden text added to the button's description when the Field is required. */
  required: string;
}

const DEFAULT_LABELS: FileUploadLabels = {
  chooseFiles: 'Choose files',
  dropHint: 'or drop files here',
  remove: (name) => `Remove ${name}`,
  selectedCount: (count) => (count === 0 ? 'No files selected' : count === 1 ? '1 file selected' : `${count} files selected`),
  listLabel: 'Selected files',
  required: 'Required',
};

export interface FileUploadProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    'value' | 'defaultValue' | 'onChange' | 'children' | 'type' | 'name' | 'accept' | 'readOnly'
  > {
  /** Controlled list. `undefined` / `null` leave it empty; omit the prop (or pass `undefined`) to leave the control uncontrolled. */
  value?: readonly File[] | null;
  /** Initial list when uncontrolled; also what a native form reset restores. */
  defaultValue?: readonly File[];
  /**
   * Called with the new list **only** for a user gesture that changes it (picker, drop, remove), once
   * per gesture. Removing the last file emits `[]` (never `undefined`: an empty list is the natural
   * empty value). Never called when `value` changes from outside, nor on a form reset, nor for a
   * gesture of only rejected files.
   */
  onValueChange?: (files: File[]) => void;
  /**
   * Called once per gesture that rejected at least one file. The component shows no message: put the
   * text in the `error` of the enclosing `Field`.
   */
  onReject?: (rejections: FileRejection[]) => void;
  /**
   * Allowed types, same syntax as the native attribute: extensions (`.pdf`, case-insensitive), MIME
   * types (`application/pdf`) and wildcards (`image/*`). Applied to the picker **and** to dropped
   * files. Empty: no filter.
   */
  accept?: string;
  /** Allow several files; they are added to the current ones (a file with the same name, size and last-modified date is not added twice). Default `false`: a new file replaces the current one. */
  multiple?: boolean;
  /** Maximum number of files in the list. When it is reached the button stays active and new files are rejected as `count`. */
  maxFiles?: number;
  /** Maximum size of one file, in bytes. */
  maxSize?: number;
  /** Locale of the file sizes (`Intl.NumberFormat`). Default: the runtime's. */
  locale?: string;
  /** Texts, to translate or reword. */
  labels?: Partial<FileUploadLabels>;
  /** Class of the root element (the button takes the other HTML props and the `ref`). */
  className?: string;
}

// Full literals (Tailwind scan). The drop area keeps its box in every state: dragging only changes
// colours (the border is always 2px dashed).
const ROOT = 'flex min-w-0 max-w-full flex-col gap-2 font-rop-sans text-rop-body text-rop-text';
const DROP =
  'flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-rop-md border-2 border-dashed border-rop-border bg-rop-surface p-3 ' +
  'data-[dragging=true]:border-rop-primary data-[dragging=true]:bg-rop-surface-subtle ' +
  'motion-safe:[transition-property:background-color,border-color] motion-safe:duration-[var(--motion-rop-feedback-duration)] ' +
  'motion-safe:ease-[var(--motion-rop-feedback-easing)] ' +
  'forced-colors:data-[dragging=true]:border-[Highlight] ' +
  // forced / locked (`data-readonly`): read-only surface, as the box of Checkbox / Switch / Select.
  'not-forced-colors:data-[readonly=true]:bg-rop-readonly-surface';
// The "Choose files" button in forced / locked: dashed border, read-only surface, no hover / pressed
// feedback (the same convention as the `aria-readonly` controls; a `button` cannot take
// `aria-readonly`, axe `aria-allowed-attr`, so it is driven by `data-readonly`).
const CHOOSE_READONLY =
  'border-dashed cursor-not-allowed not-forced-colors:bg-rop-readonly-surface ' +
  'not-forced-colors:rop-hover:bg-rop-readonly-surface not-forced-colors:active:bg-rop-readonly-surface';
const HINT = 'text-rop-text-muted pointer-coarse:hidden';
const LIST = 'm-0 flex min-w-0 list-none flex-col gap-1 p-0';
const ITEM = 'flex min-w-0 items-center gap-2';
const NAME = 'min-w-0 flex-1';
const SIZE = 'shrink-0 text-rop-text-muted';

const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files');

/** The files of a drop, without folders and non-file items. */
function droppedFiles(dataTransfer: DataTransfer): File[] {
  const items = Array.from(dataTransfer.items ?? []);
  if (items.length === 0) return Array.from(dataTransfer.files);
  return items.flatMap((item) => {
    if (item.kind !== 'file') return [];
    if (item.webkitGetAsEntry?.()?.isDirectory) return [];
    const file = item.getAsFile();
    return file ? [file] : [];
  });
}

/**
 * File selection: a "Choose files" button plus a drop area, with the list of selected files (name,
 * size, remove). It only manages the selection (`File[]`): uploading, progress and files that already
 * exist on a server are the consumer's. `accept`, `maxSize` and `maxFiles` apply to every channel
 * (picker and drop); rejected files go to `onReject`, which the consumer shows as the `Field`'s error.
 *
 * Inside a `Field` the button takes `id`, `aria-describedby` (merged with its own), `aria-invalid`,
 * `disabled` and `data-rop-name` from it, and is named by the Field's label followed by the button
 * text. `aria-required` and `aria-readonly` are never set on the button, neither from the Field nor
 * from its own props (not allowed on a `button` role, axe `aria-allowed-attr`): a required control
 * adds a visually hidden "Required" (`labels.required`) to the button's description instead, and a
 * read-only one gets `data-readonly` on the button and the area (dashed border, read-only surface).
 * `forced` / `locked` (`interactionBlocked`) keep the button focusable but a click (also on the
 * Field's label), Enter, Space and a drop open nothing and change nothing, and the remove buttons
 * are not rendered; the Field's state reason is the button's description.
 *
 * The native `<input type="file">` is in the DOM but hidden and has no `name`: to send the files with
 * a form, build a `FormData` from `value`. After a remove the focus moves to the Remove button of
 * the next file, else the previous one, else the "Choose files" button.
 */
export const FileUpload = /* @__PURE__ */ forwardRef<HTMLButtonElement, FileUploadProps>(function FileUpload(props, ref) {
  const {
    value,
    defaultValue,
    onValueChange,
    onReject,
    accept,
    multiple = false,
    maxFiles,
    maxSize,
    locale,
    labels: labelsProp,
    className,
    onClick,
    form,
    // Not valid on a `button` (axe `aria-allowed-attr`): kept out of the spread, only read through
    // `useFieldControlProps` (required -> hidden description, read-only -> `data-readonly` styling).
    'aria-required': ariaRequired,
    'aria-readonly': ariaReadOnly,
    ...rest
  } = props;
  const control = useContext(FieldContext);
  const requiredId = useId();
  const fieldProps = useFieldControlProps({ ...rest, 'aria-required': ariaRequired, 'aria-readonly': ariaReadOnly });
  const blocked = (control?.interactionBlocked ?? false) || !!fieldProps.disabled;
  const labels = useMemo(() => ({ ...DEFAULT_LABELS, ...labelsProp }), [labelsProp]);
  // `'false'` is a valid ARIA value: compare explicitly instead of coercing the string.
  const required = isTrue(fieldProps['aria-required']);
  const readOnly = isTrue(fieldProps['aria-readonly']) && !fieldProps.disabled;
  const describedBy = [fieldProps['aria-describedby'], required ? requiredId : undefined].filter(Boolean).join(' ') || undefined;

  const controlled = value !== undefined;
  const [internal, setInternal] = useState<readonly File[]>(() => defaultValue ?? []);
  const files = (controlled ? value : internal) ?? EMPTY;

  const input = useRef<HTMLInputElement>(null);
  const chooseButton = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const mergedRef = useMemo(() => composeRefs<HTMLButtonElement>(ref, chooseButton), [ref]);

  const [announcement, setAnnouncement] = useState({ text: '', tick: 0 });
  const [dragging, setDragging] = useState(false);
  const enterDepth = useRef(0);

  // Focus after a removal, applied once the list shows the expected files (a controlled consumer may
  // apply the change later, or not at all).
  const pendingFocus = useRef<{ expected: string; focusKey: string | null } | null>(null);
  const keys = useMemo(() => itemKeys(files), [files]);
  useLayoutEffect(() => {
    const pending = pendingFocus.current;
    if (!pending || pending.expected !== keys.join('\n')) return;
    pendingFocus.current = null;
    const item = Array.from(list.current?.children ?? []).find(
      (li) => (li as HTMLElement).dataset.fileKey === pending.focusKey,
    );
    (item?.querySelector('button') ?? chooseButton.current)?.focus();
  }, [keys]);

  const commit = useCallback(
    (next: File[]) => {
      if (!controlled) setInternal(next);
      onValueChange?.(next);
      setAnnouncement((current) => ({ text: labels.selectedCount(next.length), tick: current.tick + 1 }));
    },
    [controlled, onValueChange, labels],
  );

  const receive = (incoming: File[]) => {
    if (blocked || incoming.length === 0) return;
    const result = resolveSelection(files, incoming, { accept, maxSize, maxFiles, multiple });
    if (result.changed) commit(result.next);
    if (result.rejections.length > 0) onReject?.(result.rejections);
  };

  const remove = (index: number) => {
    if (blocked) return;
    const next = files.filter((_, i) => i !== index);
    const neighbour = keys[index + 1] ?? keys[index - 1] ?? null;
    pendingFocus.current = {
      expected: keys.filter((_, i) => i !== index).join('\n'),
      focusKey: neighbour,
    };
    commit(next);
  };

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    if (blocked || event.defaultPrevented) return;
    input.current?.click();
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.currentTarget.files ?? []);
    // Cleared so that choosing the same file again fires `change` again.
    event.currentTarget.value = '';
    receive(picked);
  };

  // A native form reset puts an uncontrolled list back to its default, without any callback.
  const defaultRef = useRef(defaultValue);
  defaultRef.current = defaultValue;
  useEffect(() => {
    const form = input.current?.form;
    if (!form || controlled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onReset = () => {
      timer = setTimeout(() => {
        if (input.current) input.current.value = '';
        setInternal(defaultRef.current ?? []);
      }, 0);
    };
    form.addEventListener('reset', onReset);
    return () => {
      form.removeEventListener('reset', onReset);
      clearTimeout(timer);
    };
    // `form` changes which <form> owns the native input (the `form` attribute) without a remount.
  }, [controlled, form]);

  const onDragEnter = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    enterDepth.current += 1;
    if (!blocked) setDragging(true);
  };
  const onDragOver = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = blocked ? 'none' : 'copy';
    if (!blocked) setDragging(true);
  };
  // Not gated on `hasFiles`: Safari/WebKit reports empty `dataTransfer.types` on `dragleave`, so the
  // area would stay lit. A leave without a matching enter is absorbed by the clamp at 0.
  const onDragLeave = () => {
    enterDepth.current = Math.max(0, enterDepth.current - 1);
    if (enterDepth.current === 0) setDragging(false);
  };
  const onDrop = (event: DragEvent) => {
    enterDepth.current = 0;
    setDragging(false);
    if (!hasFiles(event)) return;
    // Without this the browser would open the file.
    event.preventDefault();
    receive(droppedFiles(event.dataTransfer));
  };

  const labelledBy = [fieldProps['aria-labelledby'], fieldProps['aria-labelledby'] ? fieldProps.id : undefined]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cn(ROOT, className)}>
      <div
        data-dragging={dragging && !blocked ? 'true' : undefined}
        data-readonly={readOnly ? 'true' : undefined}
        className={DROP}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <input
          ref={input}
          type="file"
          hidden
          tabIndex={-1}
          aria-hidden="true"
          accept={accept}
          multiple={multiple}
          disabled={blocked}
          form={form}
          onChange={handleInputChange}
        />
        <Button
          {...rest}
          ref={mergedRef as never}
          variant="secondary"
          id={fieldProps.id}
          disabled={fieldProps.disabled}
          aria-describedby={describedBy}
          aria-labelledby={labelledBy || rest['aria-labelledby']}
          aria-invalid={fieldProps['aria-invalid']}
          data-rop-name={fieldProps['data-rop-name']}
          data-readonly={readOnly ? 'true' : undefined}
          className={readOnly ? CHOOSE_READONLY : undefined}
          form={form}
          onClick={handleClick}
        >
          {labels.chooseFiles}
        </Button>
        {required ? (
          <span id={requiredId} className="sr-only">
            {labels.required}
          </span>
        ) : null}
        <span aria-hidden="true" className={HINT}>
          {labels.dropHint}
        </span>
      </div>
      {files.length > 0 ? (
        <ul ref={list} aria-label={labels.listLabel} className={LIST}>
          {files.map((file, index) => (
            <li key={keys[index]} data-file-key={keys[index]} className={ITEM}>
              <TruncatedText className={NAME} tooltipContent={file.name}>
                <bdi>{file.name}</bdi>
              </TruncatedText>
              <span className={SIZE}>{formatFileSize(file.size, locale)}</span>
              {blocked ? null : (
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={labels.remove(file.name)}
                  leadingIcon={internalIcons.close}
                  onClick={() => remove(index)}
                />
              )}
            </li>
          ))}
        </ul>
      ) : null}
      <div role="status" className="sr-only">
        {announcement.text}
        {announcement.tick % 2 === 1 ? ' ' : ''}
      </div>
    </div>
  );
});

const EMPTY: readonly File[] = [];

const isTrue = (value: boolean | 'true' | 'false' | undefined) => value === true || value === 'true';

/** One stable key per list item: the file identity, numbered when the same identity appears twice. */
function itemKeys(files: readonly File[]): string[] {
  const seen = new Map<string, number>();
  return files.map((file) => {
    const identity = fileIdentity(file);
    const n = seen.get(identity) ?? 0;
    seen.set(identity, n + 1);
    return `${identity}#${n}`;
  });
}
