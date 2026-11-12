import { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { exampleStory } from '../internal/example-story';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Field, type FieldStateProps } from '../field/Field';
import type { FieldState } from '../field/FieldContext';
import { storyControl, withoutControls } from '../internal/story-docs';
import { FileUpload, type FileRejection } from './FileUpload';

const STATES: FieldState[] = ['default', 'disabled', 'forced', 'locked'];

interface DemoArgs {
  fieldState: FieldState;
  multiple: boolean;
  invalid: boolean;
  required: boolean;
  accept: string;
  maxFiles: number;
  maxSize: number;
  fieldLabel: string;
  onValueChange: (files: File[]) => void;
  onReject: (rejections: FileRejection[]) => void;
}

const meta: Meta<DemoArgs> = {
  title: 'Forms/FileUpload',
  component: FileUpload,
  parameters: { layout: 'padded' },
  argTypes: {
    multiple: { control: 'boolean' },
    accept: { control: 'text' },
    maxFiles: { control: { type: 'number', min: 1, step: 1 } },
    maxSize: { control: { type: 'number', min: 0, step: 100_000 } },
    onValueChange: { control: false },
    onReject: { control: false },
    // Set by the demo (a local controlled value, the default texts) or not used by it.
    ...withoutControls('value', 'defaultValue', 'locale', 'labels', 'className'),
    // forced = value decided by a business rule; locked = not editable. Neither opens the picker or accepts a drop.
    fieldState: storyControl({ control: 'radio', options: STATES, description: '`state` of the surrounding `Field` (`forced` / `locked`: no picker, no drop).' }),
    invalid: storyControl({ control: 'boolean', description: 'Gives the surrounding `Field` an `error`.' }),
    required: storyControl({ control: 'boolean', description: '`required` of the surrounding `Field`.' }),
    fieldLabel: storyControl({ control: 'text', description: '`label` of the surrounding `Field`.' }),
  },
  args: {
    fieldState: 'default',
    multiple: true,
    invalid: false,
    required: false,
    accept: '.pdf,image/*',
    maxFiles: 3,
    maxSize: 5_000_000,
    fieldLabel: 'Invoice attachments',
    onValueChange: fn(),
    onReject: fn(),
  },
};

export default meta;
type Story = StoryObj<DemoArgs>;

const column = { display: 'grid', gap: 16, maxWidth: 420 } as const;
const stateProps = (state: FieldState) =>
  ({ state, stateReason: state === 'default' ? undefined : 'Attachments are closed after approval.' }) as FieldStateProps;

const REASON_TEXT: Record<FileRejection['reason'], (name: string) => string> = {
  type: (name) => `"${name}" is not an allowed file type.`,
  size: (name) => `"${name}" is too large.`,
  count: (name) => `"${name}" was not added: too many files.`,
};
/** The consumer's wiring of `onReject`: the messages become the Field's `error`. */
const rejectionMessage = (rejections: FileRejection[]) =>
  rejections.map(({ file, reason }) => REASON_TEXT[reason](file.name)).join(' ');

/** Local list seeded empty; reports every user change to `onValueChange` (Actions) and every rejection to `onReject`, shown as the Field's error. */
function Demo({ fieldState, multiple, invalid, required, accept, maxFiles, maxSize, fieldLabel, onValueChange, onReject, initial }: DemoArgs & { initial?: File[] }) {
  const [files, setFiles] = useState<File[]>(initial ?? []);
  const [error, setError] = useState<string | undefined>(undefined);
  useEffect(() => setError(undefined), [accept, maxFiles, maxSize, multiple]);
  const [calls, setCalls] = useState({ change: 0, reject: 0 });
  return (
    <div style={column}>
      <Field
        label={fieldLabel}
        help="PDF or images, up to 5 MB each."
        error={error ?? (invalid ? 'Attach at least one document.' : undefined)}
        required={required}
        {...stateProps(fieldState)}
      >
        <FileUpload
          value={files}
          accept={accept}
          multiple={multiple}
          maxFiles={maxFiles}
          maxSize={maxSize}
          locale="en"
          onValueChange={(next) => {
            setFiles(next);
            setError(undefined);
            setCalls((c) => ({ ...c, change: c.change + 1 }));
            onValueChange(next);
          }}
          onReject={(rejections) => {
            setError(rejectionMessage(rejections));
            setCalls((c) => ({ ...c, reject: c.reject + 1 }));
            onReject(rejections);
          }}
        />
      </Field>
      <p style={{ margin: 0 }}>
        onValueChange calls: <strong data-testid="change-calls">{calls.change}</strong>, onReject calls:{' '}
        <strong data-testid="reject-calls">{calls.reject}</strong>
      </p>
    </div>
  );
}

const pdf = (name: string, size = 120_000) => new File([new Uint8Array(size)], name, { type: 'application/pdf', lastModified: 1 });
const nativeInput = (root: HTMLElement) => root.querySelector<HTMLInputElement>('input[type="file"]')!;

/** Copy-paste example: PDF attachments with a rejection message in the Field error, no upload. */
export const Example: Story = {
  tags: ['example', '!visual'],
  ...exampleStory('FileUpload.example.tsx'),
};

/** Controls: Field state, `multiple`, `invalid`, `required`, `accept`, `maxFiles`, `maxSize` and the label; `onValueChange` and `onReject` are in Actions. For manual testing and the e2e that drive the real picker and drag & drop. */
export const Playground: Story = {
  tags: ['playground'],
  render: (args) => <Demo {...args} />,
};

/**
 * The invoice scenario with the default Controls: the play function uploads two PDFs through the
 * input, removes the first one (the focus lands on the Remove button of the next file), then uploads
 * a `.txt`: it does not enter the list and the `onReject` wiring puts the message in the Field's error.
 */
export const InvoiceAttachments: Story = {
  render: (args) => <Demo {...args} />,
  play: async ({ args, canvasElement }) => {
    if (args.fieldState !== 'default' || !args.multiple || args.accept !== '.pdf,image/*' || args.maxFiles < 3) return;
    const canvas = within(canvasElement);
    const user = userEvent.setup({ applyAccept: false });

    await user.upload(nativeInput(canvasElement), [pdf('invoice-1.pdf'), pdf('invoice-2.pdf')]);
    await expect(args.onValueChange).toHaveBeenCalledTimes(1);
    await expect(canvas.getAllByRole('listitem')).toHaveLength(2);
    await expect(canvas.getByRole('status')).toHaveTextContent('2 files selected');

    await user.click(canvas.getByRole('button', { name: 'Remove invoice-1.pdf' }));
    await expect(args.onValueChange).toHaveBeenCalledTimes(2);
    await expect(canvas.getAllByRole('listitem')).toHaveLength(1);
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Remove invoice-2.pdf' })).toHaveFocus());

    await user.upload(nativeInput(canvasElement), new File(['notes'], 'notes.txt', { type: 'text/plain' }));
    await expect(args.onReject).toHaveBeenCalledTimes(1);
    await expect(args.onValueChange).toHaveBeenCalledTimes(2);
    await expect(canvas.getAllByRole('listitem')).toHaveLength(1);
    await expect(canvas.getByText('"notes.txt" is not an allowed file type.')).toBeInTheDocument();
  },
};

/** Single-file mode: a new file replaces the previous one, and a drop of several files keeps only the first. */
export const SingleFile: Story = {
  args: { multiple: false },
  render: (args) => <Demo {...args} />,
  play: async ({ args, canvasElement }) => {
    if (args.multiple || args.accept !== '.pdf,image/*') return;
    const canvas = within(canvasElement);
    const user = userEvent.setup({ applyAccept: false });
    await user.upload(nativeInput(canvasElement), pdf('first.pdf'));
    await user.upload(nativeInput(canvasElement), pdf('second.pdf'));
    await expect(canvas.getAllByRole('listitem')).toHaveLength(1);
    await expect(canvas.getByText('second.pdf')).toBeInTheDocument();
    await expect(args.onValueChange).toHaveBeenCalledTimes(2);
  },
};

/** A locked Field with a file already in the list: the picker and the drop do nothing, there are no Remove buttons. Driven by the e2e. */
export const LockedWithFile: Story = {
  args: { fieldState: 'locked' },
  render: (args) => <Demo {...args} initial={[pdf('invoice-2026-001.pdf', 183_000)]} />,
};

const NO_CONTROLS = { controls: { disable: true } };

const LONG_NAME = 'scanned-supplier-invoice-with-an-extremely-long-file-name-2026-11-final-v3-signed.pdf';
const SEED = [pdf('invoice-2026-001.pdf', 183_000), pdf(LONG_NAME, 2_400_000)];

/** Visual: empty, with files (a long name truncated), invalid with an error, and the dragging state. */
export const States: Story = {
  tags: ['visual'],
  parameters: NO_CONTROLS,
  render: () => (
    <div style={{ display: 'grid', gap: 24, maxWidth: 420 }}>
      <Field label="Empty">
        <FileUpload locale="en" />
      </Field>
      <Field label="With files">
        <FileUpload multiple locale="en" defaultValue={SEED} />
      </Field>
      <Field label="Invalid" error="Attach at least one document." required>
        <FileUpload locale="en" />
      </Field>
      <Field label="Rejected file" error={'"notes.txt" is not an allowed file type.'}>
        <FileUpload multiple locale="en" defaultValue={[pdf('invoice-2026-001.pdf', 183_000)]} />
      </Field>
    </div>
  ),
};

/** Visual: the area while a file is dragged over it (only colour and border change, not the size). */
export const Dragging: Story = {
  tags: ['visual'],
  parameters: NO_CONTROLS,
  render: () => (
    <div style={{ maxWidth: 420 }}>
      <Field label="Dragging">
        <FileUpload locale="en" />
      </Field>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const zone = nativeInput(canvasElement).parentElement!;
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(pdf('invoice.pdf'));
    zone.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer }));
    await waitFor(() => expect(zone).toHaveAttribute('data-dragging', 'true'));
  },
};

/** Visual: the Field states with and without files; forced / locked show the list without Remove buttons. */
export const FieldStates: Story = {
  tags: ['visual'],
  parameters: NO_CONTROLS,
  render: () => (
    <div style={{ display: 'grid', gap: 24, maxWidth: 420 }}>
      {(['disabled', 'forced', 'locked'] as const).map((state) => (
        <div key={state} style={{ display: 'grid', gap: 24 }}>
          <Field label={`${state}, no file`} {...stateProps(state)}>
            <FileUpload locale="en" />
          </Field>
          <Field label={`${state}, one file`} {...stateProps(state)}>
            <FileUpload locale="en" defaultValue={[SEED[0]!]} />
          </Field>
        </div>
      ))}
    </div>
  ),
};
