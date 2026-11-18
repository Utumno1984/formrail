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

describe('CustomerContacts: what it says (#523)', () => {
  const noop = () => undefined;

  it('the only contact: the note why it cannot be removed, but not when the whole section is disabled (archived)', () => {
    const one = [CONTACTS[0]!];
    const note = 'A customer needs at least one contact: add another one before removing this one.';
    const { rerender } = render(
      <CustomerContacts contacts={one} primaryContactId="c-1" baselineIds={new Set(['c-1'])} onChange={noop} />,
    );
    expect(screen.getByText(note)).toBeInTheDocument();
    rerender(
      <CustomerContacts
        contacts={one}
        primaryContactId="c-1"
        baselineIds={new Set(['c-1'])}
        onChange={noop}
        disabledReason="An archived customer cannot be edited: restore it first."
      />,
    );
    // Nothing can be removed nor added then: the reason of the section says why, the note would be wrong.
    expect(screen.queryByText(note)).toBeNull();
    expect(screen.queryByRole('button', { name: /^Remove contact/ })).toBeNull();
  });

  it('a contact whose name is spaces only is named by its position among the primary options', async () => {
    const contacts = [CONTACTS[0]!, { ...CONTACTS[1]!, name: '   ' }];
    render(<CustomerContacts contacts={contacts} primaryContactId="c-2" baselineIds={new Set(['c-1', 'c-2'])} onChange={noop} />);
    const primary = screen.getByRole('combobox', { name: 'Primary contact' });
    expect(primary).toHaveTextContent('Contact 2 (no name yet)');
    await userEvent.click(primary);
    expect(screen.getByRole('option', { name: 'Contact 2 (no name yet)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Ada Rivers' })).toBeInTheDocument();
  });
});
