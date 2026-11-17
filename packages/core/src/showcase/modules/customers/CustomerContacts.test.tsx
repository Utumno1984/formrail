import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ContactValues } from './customer-form';
import { CustomerContacts } from './CustomerContacts';
import { setupCustomerTests } from './customer-test-kit';

// #523: the contract of the contacts section with the form, seen from its `onChange`: what one gesture changes.
setupCustomerTests();

const CONTACTS: ContactValues[] = [
  { id: 'c-1', name: 'Ada Rivers', role: 'Buyer', email: 'ada@company.example', phone: '' },
  { id: 'c-2', name: 'Ben Okafor', role: '', email: 'ben@company.example', phone: '' },
];

function Harness({ onChange }: { onChange: (patch: { contacts?: ContactValues[]; primaryContactId?: string }) => void }) {
  const [state, setState] = useState({ contacts: CONTACTS, primaryContactId: 'c-1' });
  return (
    <CustomerContacts
      contacts={state.contacts}
      primaryContactId={state.primaryContactId}
      baselineIds={new Set(CONTACTS.map((c) => c.id))}
      onChange={(patch) => {
        onChange(patch);
        setState((s) => ({ ...s, ...patch }));
      }}
    />
  );
}

describe('CustomerContacts: one gesture, one change (#523)', () => {
  it('removing the primary contact clears the choice in the SAME change (never a dangling id)', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove contact 1' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ contacts: [CONTACTS[1]], primaryContactId: '' });
    expect(screen.getByRole('combobox', { name: 'Primary contact' })).toHaveTextContent('Choose the primary contact');
  });

  it('removing another contact leaves the primary choice alone', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove contact 2' }));
    expect(onChange).toHaveBeenCalledWith({ contacts: [CONTACTS[0]] });
  });

  it('editing a text changes that contact only, keeping its id', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Contact 2 role' }), 'X');
    expect(onChange).toHaveBeenLastCalledWith({ contacts: [CONTACTS[0], { ...CONTACTS[1], role: 'X' }] });
  });
});
