import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Button } from '../button/Button';
import { Field } from '../field/Field';
import { Input } from '../input/Input';
import { RECORD_STATUS_LABEL, RECORD_STATUS_TONE, getRecordDetail } from '../internal/demo-data';
import { storyControls } from '../internal/story-docs';
import { StatusBadge } from '../status-badge/StatusBadge';
import { ObjectPage } from './ObjectPage';
import { ObjectPageFooter } from './ObjectPageFooter';
import { ObjectPageHeader } from './ObjectPageHeader';
import { ObjectPageSection } from './ObjectPageSection';
import { useObjectPageForm } from './use-object-page-form';

// The happy path of `Floorplans/Object Page/Layout` (ticket #723): the first story of the page after the example
// and the Playground, the normal use end to end (a record, an edit, a save). Its own file, like the use cases of
// ObjectPageLayoutExamples.stories.tsx: its Controls and Actions are the save's, not the layout Playground's.
// The record is the neutral one of every Object Page story (no business domain on the neutral part of a page).

const RECORD = getRecordDetail('rec-42');

interface RecordValues {
  name: string;
  ownerName: string;
  dueOn: string;
  reference: string;
  notes: string;
}

/** The saved record, as the form receives it: mounted already hydrated, so the form is clean on arrival. */
const BASELINE: RecordValues = {
  name: RECORD.name,
  ownerName: RECORD.ownerName,
  dueOn: RECORD.dueOn ?? '',
  reference: RECORD.details.reference,
  notes: RECORD.details.notes ?? '',
};

/** The text of the save error the `error` outcome rejects with, shown in the save bar. */
const SAVE_ERROR = 'The changes could not be saved. Try again.';

interface EditAndSaveArgs {
  saveOutcome: 'success' | 'error';
  saveDelay: number;
  onSave: (values: RecordValues) => void;
  onDiscard: () => void;
}

const meta: Meta<EditAndSaveArgs> = {
  title: 'Floorplans/Object Page/Layout',
  parameters: { layout: 'fullscreen' },
};

export default meta;

const errorText = (error: unknown) => (error === null ? undefined : error instanceof Error ? error.message : String(error));

/**
 * Edit and save: the normal use of an Object Page. The record arrives already saved, so there is no save bar;
 * editing a field shows it (its room was reserved: nothing above moves), typing the original value back hides it
 * again, "Discard changes" returns every field to the saved value, and "Save" sends the values: on success the
 * header shows what was saved and the bar leaves, on error the bar stays with the message and the edit is kept.
 *
 * Controls: `saveOutcome` (how the save answers) and `saveDelay` (how long it takes). Actions: `onSave` (the
 * values sent) and `onDiscard`. The play function goes through every step above and checks the result of the
 * outcome chosen in the Controls.
 */
export const EditAndSave: StoryObj<EditAndSaveArgs> = {
  tags: ['happy-path', 'visual'],
  argTypes: storyControls({
    saveOutcome: { control: 'radio', options: ['success', 'error'], description: 'How the save answers: the values are stored, or the save is rejected with an error.' },
    saveDelay: { control: { type: 'range', min: 0, max: 3000, step: 100 }, description: 'How long the save takes, in milliseconds.' },
    onSave: { control: false, description: 'Called with the values sent, when "Save" is pressed (whatever the outcome).' },
    onDiscard: { control: false, description: 'Called when "Discard changes" returns the fields to the saved values.' },
  }),
  args: { saveOutcome: 'success', saveDelay: 400, onSave: fn(), onDiscard: fn() },
  render: (args) => {
    function EditAndSaveDemo({ saveOutcome, saveDelay, onSave, onDiscard }: EditAndSaveArgs) {
      const form = useObjectPageForm({ baseline: BASELINE });
      const text = (name: keyof RecordValues, label: string) => (
        <Field label={label} name={name}>
          <Input value={form.values[name]} onChange={(event) => form.setValue(name, event.target.value)} />
        </Field>
      );
      const save = () =>
        void form.save(async (values) => {
          onSave(values);
          await new Promise((resolve) => setTimeout(resolve, saveDelay));
          if (saveOutcome === 'error') throw new Error(SAVE_ERROR);
          return values;
        });
      return (
        <div style={{ height: '100dvh' }}>
          <ObjectPage>
            {/* The header reads the baseline: it changes when a save succeeds, not while typing. */}
            <ObjectPageHeader
              title={`Record ${RECORD.code}`}
              subtitle={form.baseline.name}
              status={<StatusBadge tone={RECORD_STATUS_TONE[RECORD.status]}>{RECORD_STATUS_LABEL[RECORD.status]}</StatusBadge>}
            />
            <ObjectPageSection id="general" title="General">
              <div style={{ display: 'grid', gap: 16, maxWidth: 420 }}>
                {text('name', 'Name')}
                {text('ownerName', 'Owner')}
                {text('dueOn', 'Due date')}
              </div>
            </ObjectPageSection>
            <ObjectPageSection id="details" title="Details">
              <div style={{ display: 'grid', gap: 16, maxWidth: 420 }}>
                {text('reference', 'Reference')}
                {text('notes', 'Notes')}
              </div>
            </ObjectPageSection>
            <ObjectPageFooter visible={form.isDirty} label="Save actions" message={errorText(form.saveError)} messageTone="error">
              <Button
                variant="secondary"
                onClick={() => {
                  form.reset();
                  onDiscard();
                }}
              >
                Discard changes
              </Button>
              <Button variant="primary" onClick={save} aria-disabled={form.isSaving || undefined}>
                Save
              </Button>
            </ObjectPageFooter>
          </ObjectPage>
        </div>
      );
    }
    return <EditAndSaveDemo {...args} />;
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const bar = () => canvas.queryByRole('region', { name: 'Save actions' });
    const scroller = canvasElement.querySelector('[data-object-page-scroller]') as HTMLElement;
    const title = canvas.getByRole('heading', { level: 1, name: `Record ${RECORD.code}` });
    // The title's place in the scrolled content and the bottom edge of the scroller: the save bar's room is
    // reserved, so showing or hiding it moves neither.
    const placement = () => [Math.round(title.getBoundingClientRect().top + scroller.scrollTop), Math.round(scroller.getBoundingClientRect().bottom)];
    // The node found once: its accessible name is never looked up again after an edit.
    const name = canvas.getByRole('textbox', { name: 'Name' });
    const added = ' (revised)';
    const edited = `${BASELINE.name}${added}`;

    // 1. Arrival: the record was mounted already hydrated, nothing is dirty, no save bar.
    await expect(bar()).toBeNull();
    await expect(name).toHaveValue(BASELINE.name);
    const before = placement();

    // 2. An edit shows the save bar, and nothing above it moves.
    await userEvent.type(name, added);
    await expect(bar()).toBeVisible();
    await expect(placement()).toEqual(before);

    // 3. Typing the original value back: the form compares with the saved values, so it is clean again.
    await userEvent.type(name, '{Backspace}'.repeat(added.length));
    await expect(name).toHaveValue(BASELINE.name);
    await waitFor(() => expect(bar()).toBeNull());

    // 4. "Discard changes" returns every edited field to the saved value.
    const owner = canvas.getByRole('textbox', { name: 'Owner' });
    await userEvent.type(owner, ' Jr.');
    await userEvent.click(within(bar() as HTMLElement).getByRole('button', { name: 'Discard changes' }));
    await expect(args.onDiscard).toHaveBeenCalledTimes(1);
    await expect(owner).toHaveValue(BASELINE.ownerName);
    await waitFor(() => expect(bar()).toBeNull());
    await expect(args.onSave).not.toHaveBeenCalled();

    // 5. Edit again and save: the handler receives the values typed.
    await userEvent.type(name, added);
    await userEvent.click(within(bar() as HTMLElement).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(args.onSave).toHaveBeenCalledTimes(1));
    await expect(args.onSave).toHaveBeenCalledWith({ ...BASELINE, name: edited });
    const settled = { timeout: args.saveDelay + 2000 };

    if (args.saveOutcome === 'success') {
      // The saved values are the new baseline: clean form, no save bar, the header shows what was saved.
      await waitFor(() => expect(bar()).toBeNull(), settled);
      await expect(name).toHaveValue(edited);
      await expect(canvas.getByText(edited)).toBeVisible();
    } else {
      // Rejected: the bar stays with the message, the edit is kept, the header still shows the saved name.
      await waitFor(() => expect(within(bar() as HTMLElement).getByRole('status')).toHaveTextContent(SAVE_ERROR), settled);
      await expect(bar()).toBeVisible();
      await expect(name).toHaveValue(edited);
      await expect(canvas.queryByText(edited)).toBeNull();
      await expect(canvas.getByText(BASELINE.name)).toBeVisible();
    }
    await expect(placement()).toEqual(before);
  },
};
