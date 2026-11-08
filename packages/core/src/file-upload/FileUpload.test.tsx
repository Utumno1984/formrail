import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, useRef, useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Field } from '../field/Field';
import { useFocusFirstInvalidField } from '../object-page/use-focus-first-invalid-field';
import { FileUpload, type FileUploadProps } from './FileUpload';

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const pdf = (name = 'a.pdf', size = 2000) => new File([new Uint8Array(size)], name, { type: 'application/pdf', lastModified: 1 });
const txt = (name = 'a.txt') => new File(['x'], name, { type: 'text/plain', lastModified: 1 });

const user = () => userEvent.setup({ applyAccept: false });
const nativeInput = (container: HTMLElement) => container.querySelector<HTMLInputElement>('input[type="file"]')!;
const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });

function Controlled(props: FileUploadProps & { initial?: File[] }) {
  const { initial = [], onValueChange, ...rest } = props;
  const [files, setFiles] = useState<File[]>(initial);
  return (
    <FileUpload
      {...rest}
      value={files}
      onValueChange={(next) => {
        setFiles(next);
        onValueChange?.(next);
      }}
    />
  );
}

function dropOn(target: Element, files: File[], types: string[] = ['Files']) {
  const dataTransfer = { types, files, items: [], dropEffect: 'none' };
  fireEvent.drop(target, { dataTransfer });
}
const zoneOf = (container: HTMLElement) => nativeInput(container).parentElement!;

describe('FileUpload: Field wiring', () => {
  it('the button takes id, description, invalid, required and data-rop-name from the Field; named by label + button text', () => {
    render(
      <Field label="Attachments" name="attachments" help="PDF only" error="Wrong type" required>
        <FileUpload />
      </Field>,
    );
    // Label first, then the button itself (its own text): jsdom's name computation does not resolve
    // a self-reference, so the combined name is asserted in the e2e on a real browser.
    const button = screen.getByRole('button', { name: 'Attachments' });
    expect(button.getAttribute('aria-labelledby')).toMatch(/-label \S+$/);
    expect(button.getAttribute('aria-labelledby')!.split(' ')[1]).toBe(button.id);
    expect(button).toHaveAttribute('data-rop-name', 'attachments');
    expect(button).toHaveAttribute('aria-invalid', 'true');
    expect(button).toHaveAttribute('aria-required', 'true');
    expect(button).toHaveAccessibleDescription('Wrong type PDF only');
    expect(button.id).not.toBe('');
    expect(button).not.toHaveAttribute('name');
    expect(button).not.toHaveAttribute('readonly');
    expect(button).not.toHaveAttribute('aria-readonly');
  });

  it('outside a Field the button text names it and its own aria-describedby is kept', () => {
    render(
      <>
        <p id="own">Own</p>
        <FileUpload aria-describedby="own" />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Choose files' })).toHaveAccessibleDescription('Own');
  });

  it('useFocusFirstInvalidField finds the button through data-rop-name', () => {
    function Form() {
      const ref = useRef<HTMLDivElement>(null);
      useFocusFirstInvalidField({ containerRef: ref, fieldErrors: { docs: 'required' } });
      return (
        <div ref={ref}>
          <Field label="Docs" name="docs" error="required">
            <FileUpload />
          </Field>
        </div>
      );
    }
    render(<Form />);
    expect(screen.getByRole('button', { name: 'Docs' })).toHaveFocus();
  });

  it('forwards ref to the button, merges className on the root, leaks no non-DOM prop', () => {
    const ref = createRef<HTMLButtonElement>();
    const { container } = render(
      <FileUpload ref={ref} className="custom-root" accept=".pdf" maxFiles={2} maxSize={1} locale="en" multiple data-x="1" />,
    );
    expect(ref.current).toBe(screen.getByRole('button', { name: 'Choose files' }));
    expect(container.firstElementChild).toHaveClass('custom-root');
    expect(ref.current).toHaveAttribute('data-x', '1');
    for (const attr of ['maxfiles', 'maxsize', 'locale', 'labels', 'value', 'multiple', 'accept']) {
      expect(ref.current!.hasAttribute(attr)).toBe(false);
    }
  });

  it('the native input is hidden, out of the tab order and has no name', () => {
    const { container } = render(<FileUpload accept=".pdf" multiple />);
    const input = nativeInput(container);
    expect(input).not.toBeVisible();
    expect(input).toHaveAttribute('tabindex', '-1');
    expect(input).not.toHaveAttribute('name');
    expect(input).toHaveAttribute('accept', '.pdf');
    expect(input).toHaveAttribute('multiple');
  });
});

describe('FileUpload: picker', () => {
  it('opens the native picker on click, Enter and Space', async () => {
    const { container } = render(<FileUpload />);
    const click = vi.spyOn(nativeInput(container), 'click');
    const u = user();
    await u.click(screen.getByRole('button', { name: 'Choose files' }));
    await u.keyboard('{Enter}');
    await u.keyboard(' ');
    expect(click).toHaveBeenCalledTimes(3);
  });

  it('reports the chosen files once per gesture and lists name and size', async () => {
    const onValueChange = vi.fn();
    const { container } = render(<FileUpload multiple locale="en" onValueChange={onValueChange} />);
    const files = [pdf('a.pdf', 1500), pdf('b.pdf', 2_500_000)];
    await user().upload(nativeInput(container), files);
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith(files);
    const list = screen.getByRole('list', { name: 'Selected files' });
    expect(list).toHaveTextContent('a.pdf');
    expect(list).toHaveTextContent('1.5 kB');
    expect(list).toHaveTextContent('2.5 MB');
  });

  it('clears the native input after each change so the same file can be chosen again', async () => {
    const onValueChange = vi.fn();
    const { container } = render(<Controlled initial={[]} onValueChange={onValueChange} />);
    const input = nativeInput(container);
    const file = pdf();
    const u = user();
    await u.upload(input, file);
    expect(input.value).toBe('');
    await u.click(screen.getByRole('button', { name: 'Remove a.pdf' }));
    await u.upload(input, file);
    expect(onValueChange).toHaveBeenCalledTimes(3);
    expect(screen.getByText('a.pdf')).toBeInTheDocument();
  });

  it('validates the picker too: a rejected file goes to onReject, valid ones of the gesture still enter', async () => {
    const onValueChange = vi.fn();
    const onReject = vi.fn();
    const { container } = render(
      <FileUpload multiple accept=".pdf" onValueChange={onValueChange} onReject={onReject} />,
    );
    const good = pdf();
    const bad = txt();
    await user().upload(nativeInput(container), [bad, good]);
    expect(onValueChange).toHaveBeenCalledWith([good]);
    expect(onReject).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledWith([{ file: bad, reason: 'type' }]);
  });

  it('a gesture of only rejected files calls onReject and not onValueChange', async () => {
    const onValueChange = vi.fn();
    const onReject = vi.fn();
    const { container } = render(<FileUpload accept=".pdf" maxSize={10} onValueChange={onValueChange} onReject={onReject} />);
    await user().upload(nativeInput(container), [txt()]);
    expect(onValueChange).not.toHaveBeenCalled();
    expect(onReject).toHaveBeenCalledWith([{ file: expect.any(File), reason: 'type' }]);
    await user().upload(nativeInput(container), [pdf('big.pdf', 100)]);
    expect(onReject).toHaveBeenLastCalledWith([{ file: expect.any(File), reason: 'size' }]);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('without multiple a new file replaces the previous one', async () => {
    const { container } = render(<FileUpload />);
    const u = user();
    await u.upload(nativeInput(container), pdf('a.pdf'));
    await u.upload(nativeInput(container), pdf('b.pdf'));
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('b.pdf')).toBeInTheDocument();
  });

  it('a 0-byte file is accepted and shown as 0 kB', async () => {
    const { container } = render(<FileUpload locale="en" />);
    await user().upload(nativeInput(container), new File([], 'empty.pdf', { type: 'application/pdf' }));
    expect(screen.getByRole('listitem')).toHaveTextContent('0 kB');
  });
});

describe('FileUpload: drop', () => {
  it('reports the dropped files once and validates them against accept', () => {
    const onValueChange = vi.fn();
    const onReject = vi.fn();
    const { container } = render(
      <FileUpload multiple accept=".pdf" onValueChange={onValueChange} onReject={onReject} />,
    );
    const good = pdf();
    const bad = txt('virus.exe');
    dropOn(zoneOf(container), [good, bad]);
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith([good]);
    expect(onReject).toHaveBeenCalledWith([{ file: bad, reason: 'type' }]);
  });

  it('prevents the default of dragover and drop so the browser does not open the file', () => {
    const { container } = render(<FileUpload />);
    const zone = zoneOf(container);
    const dataTransfer = { types: ['Files'], files: [], items: [] };
    expect(fireEvent.dragOver(zone, { dataTransfer })).toBe(false);
    expect(fireEvent.drop(zone, { dataTransfer })).toBe(false);
  });

  it('ignores a drag of something that is not a file (no state, no callback, default not prevented)', () => {
    const onValueChange = vi.fn();
    const onReject = vi.fn();
    const { container } = render(<FileUpload onValueChange={onValueChange} onReject={onReject} />);
    const zone = zoneOf(container);
    const dataTransfer = { types: ['text/plain'], files: [], items: [] };
    fireEvent.dragEnter(zone, { dataTransfer });
    expect(zone).not.toHaveAttribute('data-dragging');
    expect(fireEvent.dragOver(zone, { dataTransfer })).toBe(true);
    fireEvent.drop(zone, { dataTransfer });
    expect(onValueChange).not.toHaveBeenCalled();
    expect(onReject).not.toHaveBeenCalled();
  });

  it('skips folders and non-file items of a drop', () => {
    const onValueChange = vi.fn();
    const { container } = render(<FileUpload multiple onValueChange={onValueChange} />);
    const file = pdf();
    const folder = pdf('folder');
    const items = [
      { kind: 'file', getAsFile: () => file, webkitGetAsEntry: () => ({ isDirectory: false }) },
      { kind: 'file', getAsFile: () => folder, webkitGetAsEntry: () => ({ isDirectory: true }) },
      { kind: 'string', getAsFile: () => null },
    ];
    fireEvent.drop(zoneOf(container), { dataTransfer: { types: ['Files'], files: [file, folder], items } });
    expect(onValueChange).toHaveBeenCalledWith([file]);
  });

  it('data-dragging does not flicker over children (enter/leave counter) and clears on leave and on drop', () => {
    const { container } = render(<FileUpload />);
    const zone = zoneOf(container);
    const child = screen.getByRole('button', { name: 'Choose files' });
    const dataTransfer = { types: ['Files'], files: [], items: [] };
    fireEvent.dragEnter(zone, { dataTransfer });
    expect(zone).toHaveAttribute('data-dragging', 'true');
    fireEvent.dragEnter(child, { dataTransfer });
    fireEvent.dragLeave(zone, { dataTransfer });
    expect(zone).toHaveAttribute('data-dragging', 'true');
    fireEvent.dragLeave(child, { dataTransfer });
    expect(zone).not.toHaveAttribute('data-dragging');
    fireEvent.dragEnter(zone, { dataTransfer });
    dropOn(zone, []);
    expect(zone).not.toHaveAttribute('data-dragging');
  });

  it('disabled: no drag state, the drop is ignored', () => {
    const onValueChange = vi.fn();
    const { container } = render(<FileUpload disabled onValueChange={onValueChange} />);
    const zone = zoneOf(container);
    fireEvent.dragEnter(zone, { dataTransfer: { types: ['Files'], files: [], items: [] } });
    expect(zone).not.toHaveAttribute('data-dragging');
    dropOn(zone, [pdf()]);
    expect(onValueChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Choose files' })).toBeDisabled();
  });
});

describe('FileUpload: remove, focus and announcement', () => {
  it('remove buttons have distinct names; removing reports the new list once', async () => {
    const onValueChange = vi.fn();
    const a = pdf('a.pdf');
    const b = pdf('b.pdf');
    render(<Controlled initial={[a, b]} multiple onValueChange={onValueChange} />);
    expect(screen.getByRole('button', { name: 'Remove a.pdf' })).toBeInTheDocument();
    await user().click(screen.getByRole('button', { name: 'Remove a.pdf' }));
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith([b]);
  });

  it('removing the last file emits [] (not undefined)', async () => {
    const onValueChange = vi.fn();
    render(<Controlled initial={[pdf()]} onValueChange={onValueChange} />);
    await user().click(screen.getByRole('button', { name: 'Remove a.pdf' }));
    expect(onValueChange).toHaveBeenCalledWith([]);
  });

  it('moves the focus to the next Remove button, else the previous, else Choose files', async () => {
    render(<Controlled initial={[pdf('a.pdf'), pdf('b.pdf'), pdf('c.pdf')]} multiple />);
    const u = user();
    await u.click(screen.getByRole('button', { name: 'Remove b.pdf' }));
    expect(screen.getByRole('button', { name: 'Remove c.pdf' })).toHaveFocus();
    await u.click(screen.getByRole('button', { name: 'Remove c.pdf' }));
    expect(screen.getByRole('button', { name: 'Remove a.pdf' })).toHaveFocus();
    await u.click(screen.getByRole('button', { name: 'Remove a.pdf' }));
    expect(screen.getByRole('button', { name: 'Choose files' })).toHaveFocus();
  });

  it('keyboard removal keeps the focus inside the control', async () => {
    render(<Controlled initial={[pdf('a.pdf'), pdf('b.pdf')]} multiple />);
    const u = user();
    screen.getByRole('button', { name: 'Remove a.pdf' }).focus();
    await u.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Remove b.pdf' })).toHaveFocus();
    expect(document.body).not.toHaveFocus();
  });

  it('announces the count in a live region that is already mounted, only after user changes', async () => {
    const { container, rerender } = render(<FileUpload multiple value={[]} />);
    const status = screen.getByRole('status');
    expect(status).toBeEmptyDOMElement();
    // external change: nothing announced
    rerender(<FileUpload multiple value={[pdf('a.pdf')]} />);
    expect(status.textContent).toBe('');
    rerender(<FileUpload multiple />);
    await user().upload(nativeInput(container), [pdf('b.pdf'), pdf('c.pdf')]);
    expect(screen.getByRole('status')).toBe(status);
    expect(status.textContent?.trim()).toBe('2 files selected');
    await user().click(screen.getByRole('button', { name: 'Remove b.pdf' }));
    expect(status.textContent?.trim()).toBe('1 file selected');
    await user().click(screen.getByRole('button', { name: 'Remove c.pdf' }));
    expect(status.textContent?.trim()).toBe('No files selected');
  });

  it('the announcement text changes even when the count does not (replace in single mode)', async () => {
    const { container } = render(<FileUpload />);
    const status = screen.getByRole('status');
    const u = user();
    await u.upload(nativeInput(container), pdf('a.pdf'));
    const first = status.textContent;
    await u.upload(nativeInput(container), pdf('b.pdf'));
    expect(status.textContent).not.toBe(first);
    expect(status.textContent?.trim()).toBe('1 file selected');
  });

  it('labels are customisable', async () => {
    const { container } = render(
      <FileUpload
        labels={{ chooseFiles: 'Scegli', remove: (n) => `Togli ${n}`, selectedCount: (n) => `${n} file`, listLabel: 'File' }}
      />,
    );
    await user().upload(nativeInput(container), pdf());
    expect(screen.getByRole('button', { name: 'Scegli' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Togli a.pdf' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('1 file');
  });
});

describe('FileUpload: forced / locked / disabled', () => {
  const blockedField = (state: 'forced' | 'locked', children: ReactNode) => (
    <Field label="Docs" state={state} stateReason="Closed by contract">
      {children}
    </Field>
  );

  it.each(['forced', 'locked'] as const)('%s: focusable, opens nothing, ignores drop, no remove buttons, reason described', async (state) => {
    const onValueChange = vi.fn();
    const onReject = vi.fn();
    const { container } = render(
      blockedField(state, <FileUpload defaultValue={[pdf()]} onValueChange={onValueChange} onReject={onReject} />),
    );
    const button = screen.getByRole('button', { name: 'Docs' });
    const click = vi.spyOn(nativeInput(container), 'click');
    const u = user();
    await u.click(button);
    expect(button).toHaveFocus();
    await u.keyboard('{Enter}');
    await u.keyboard(' ');
    await u.click(screen.getByText('Docs'));
    expect(click).not.toHaveBeenCalled();
    dropOn(zoneOf(container), [pdf('new.pdf')]);
    expect(onValueChange).not.toHaveBeenCalled();
    expect(onReject).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull();
    expect(screen.getByRole('listitem')).toHaveTextContent('a.pdf');
    expect(button).toHaveAccessibleDescription('Closed by contract');
    expect(button).not.toBeDisabled();
  });

  it('a change event while blocked (e.g. a stray input) changes nothing', () => {
    const onValueChange = vi.fn();
    const { container } = render(blockedField('locked', <FileUpload onValueChange={onValueChange} />));
    const input = nativeInput(container);
    Object.defineProperty(input, 'files', { configurable: true, value: [pdf()] });
    fireEvent.change(input);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('a Field that becomes locked after mount blocks the next click and drop', async () => {
    const onValueChange = vi.fn();
    const { container, rerender } = render(
      <Field label="Docs">
        <FileUpload onValueChange={onValueChange} />
      </Field>,
    );
    rerender(blockedField('locked', <FileUpload onValueChange={onValueChange} />));
    const click = vi.spyOn(nativeInput(container), 'click');
    await user().click(screen.getByRole('button', { name: 'Docs' }));
    dropOn(zoneOf(container), [pdf()]);
    expect(click).not.toHaveBeenCalled();
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('disabled (Field state): the button is disabled and out of the tab order, no remove buttons', () => {
    render(
      <Field label="Docs" state="disabled" stateReason="Off">
        <FileUpload defaultValue={[pdf()]} />
      </Field>,
    );
    expect(screen.getByRole('button', { name: 'Docs' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull();
  });
});

describe('FileUpload: no echo, controlled and uncontrolled', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['an empty array', [] as File[]],
  ])('value %s: no callback at mount nor when it changes afterwards', (_name, initial) => {
    const onValueChange = vi.fn();
    const onReject = vi.fn();
    const { rerender } = render(<FileUpload value={initial} onValueChange={onValueChange} onReject={onReject} />);
    rerender(<FileUpload value={[pdf()]} onValueChange={onValueChange} onReject={onReject} />);
    expect(screen.getByRole('listitem')).toHaveTextContent('a.pdf');
    rerender(<FileUpload value={initial} onValueChange={onValueChange} onReject={onReject} />);
    rerender(<FileUpload value={[]} onValueChange={onValueChange} onReject={onReject} />);
    expect(onValueChange).not.toHaveBeenCalled();
    expect(onReject).not.toHaveBeenCalled();
  });

  it('value prop missing: no callback at mount, defaultValue is shown', () => {
    const onValueChange = vi.fn();
    render(<FileUpload defaultValue={[pdf()]} onValueChange={onValueChange} />);
    expect(screen.getByRole('listitem')).toHaveTextContent('a.pdf');
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('a controlled value the consumer does not update keeps the list of value', async () => {
    const onValueChange = vi.fn();
    const { container } = render(<FileUpload value={[]} onValueChange={onValueChange} />);
    await user().upload(nativeInput(container), pdf());
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('listitem')).toBeNull();
  });

  it('a stale focus request does not steal the focus when the consumer ignores a removal', async () => {
    render(<FileUpload value={[pdf('a.pdf'), pdf('b.pdf')]} multiple />);
    await user().click(screen.getByRole('button', { name: 'Remove a.pdf' }));
    expect(screen.getByRole('button', { name: 'Remove a.pdf' })).toHaveFocus();
  });
});

describe('FileUpload: native form reset', () => {
  it('an uncontrolled list returns to defaultValue without callbacks and clears the native input', async () => {
    const onValueChange = vi.fn();
    const initial = pdf('initial.pdf');
    const { container } = render(
      <form>
        <FileUpload multiple defaultValue={[initial]} onValueChange={onValueChange} />
        <button type="reset">Reset</button>
      </form>,
    );
    await user().upload(nativeInput(container), pdf('extra.pdf'));
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    onValueChange.mockClear();
    await user().click(screen.getByRole('button', { name: 'Reset' }));
    await settle();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('initial.pdf')).toBeInTheDocument();
    expect(onValueChange).not.toHaveBeenCalled();
    expect(nativeInput(container).value).toBe('');
  });

  it('without defaultValue a reset empties the list', async () => {
    const { container } = render(
      <form>
        <FileUpload multiple />
        <button type="reset">Reset</button>
      </form>,
    );
    await user().upload(nativeInput(container), pdf());
    await user().click(screen.getByRole('button', { name: 'Reset' }));
    await settle();
    expect(screen.queryByRole('listitem')).toBeNull();
  });

  it('a controlled list is not touched by a reset', async () => {
    const onValueChange = vi.fn();
    render(
      <form>
        <FileUpload value={[pdf()]} onValueChange={onValueChange} />
        <button type="reset">Reset</button>
      </form>,
    );
    await user().click(screen.getByRole('button', { name: 'Reset' }));
    await settle();
    expect(screen.getByRole('listitem')).toHaveTextContent('a.pdf');
    expect(onValueChange).not.toHaveBeenCalled();
  });
});
