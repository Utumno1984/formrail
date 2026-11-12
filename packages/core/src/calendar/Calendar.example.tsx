import { useState } from 'react';
import { Calendar, Field, type IsoDate } from '@formrail/core';

export function DeliveryDateCalendar() {
  const [date, setDate] = useState<IsoDate | null>('2026-03-10');

  return (
    <div style={{ display: 'grid', gap: 8, maxWidth: 320 }}>
      <Field label="Delivery date" help="Pick the day the goods arrive.">
        <Calendar value={date} onValueChange={setDate} locale="en-US" />
      </Field>
      <output>{date ? `Delivery on ${date}` : 'No date picked'}</output>
    </div>
  );
}
