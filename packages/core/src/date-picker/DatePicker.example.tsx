import { useState } from 'react';
import { DatePicker, Field, type IsoDate } from '@formrail/core';

export function DueDatePicker() {
  const [dueDate, setDueDate] = useState<IsoDate | null>('2026-03-15');

  return (
    <div style={{ display: 'grid', gap: 8, maxWidth: 320 }}>
      <Field label="Due date" help="The day the invoice must be paid.">
        <DatePicker value={dueDate} onValueChange={setDueDate} locale="en-US" />
      </Field>
      <output>{dueDate ? `Due on ${dueDate}` : 'No due date'}</output>
    </div>
  );
}
