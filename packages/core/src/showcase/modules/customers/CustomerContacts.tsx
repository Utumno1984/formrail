// Story-only (#523): the "Contacts" section of the customer page: an array of contacts with ids (add, remove, edit)
// and the choice of the primary one. Not exported by the package. The contacts are controlled by the form of the page;
// this component only decides which control takes the focus after an action (the control that had it may be gone)
// and keeps the last contact from being removed (with the reason said, never silently).
import { useRef, type CSSProperties, type ReactNode } from 'react';
import { Button } from '../../../button/Button';
import { Field } from '../../../field/Field';
import { Input } from '../../../input/Input';
import { useListMutationFocus } from '../../../internal/use-list-mutation-focus';
import { Select } from '../../../select/Select';
import { helpProps } from '../field-help';
import { nextContactId, type ContactValues } from './customer-form';

export interface CustomerContactsProps {
  contacts: readonly ContactValues[];
  primaryContactId: string;
  /** Ids already used by the saved customer: a new contact never reuses one. */
  baselineIds: ReadonlySet<string>;
  /** One update for both keys, so removing the primary contact also clears the choice in the same change. */
  onChange: (patch: { contacts?: ContactValues[]; primaryContactId?: string }) => void;
  /** Why nothing can be changed (an archived customer): every field disabled with it, no button. Absent: editable. */
  disabledReason?: string | undefined;
  /** The error of the list itself ("at least one contact"), linked to "Add contact". */
  listError?: string | undefined;
  /** Story-only (#384): a help text for the Field of a path (`contacts.1.email`). */
  fieldHelp?: ((path: string) => ReactNode) | undefined;
}

const LIST: CSSProperties = { display: 'grid', gap: 12, listStyle: 'none', margin: 0, padding: 0 };
const CARD: CSSProperties = { display: 'grid', gap: 12, padding: 12, minWidth: 0, border: '1px solid #d0d5dd', borderRadius: 8 };
const CARD_HEADER: CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, justifyContent: 'space-between' };
const CARD_FIELDS: CSSProperties = {
  display: 'grid',
  gap: 12,
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
};

const LAST_CONTACT_NOTE = 'A customer needs at least one contact: add another one before removing this one.';

/** How a contact is named in the "Primary contact" options: its name, or its position while it has none. */
const contactLabel = (contact: ContactValues, index: number): string =>
  contact.name.trim() === '' ? `Contact ${index + 1} (no name yet)` : contact.name;

export function CustomerContacts({
  contacts,
  primaryContactId,
  baselineIds,
  onChange,
  disabledReason,
  listError,
  fieldHelp,
}: CustomerContactsProps) {
  const counterRef = useRef(0);
  // Target keys: `<action>:<contact id>` for the controls of a contact, `add` for the button after the list.
  const focus = useListMutationFocus(contacts.map((c) => c.id));
  const ids = (next: readonly ContactValues[]) => next.map((c) => c.id);
  const state = disabledReason ? ({ state: 'disabled', stateReason: disabledReason } as const) : {};
  const errorId = 'customer-contacts-error';
  const lastNoteId = 'customer-contacts-last';
  const onlyOne = contacts.length === 1;

  const update = (index: number, patch: Partial<ContactValues>) =>
    onChange({ contacts: contacts.map((c, i) => (i === index ? { ...c, ...patch } : c)) });

  const add = () => {
    // The saved ids and the ones on the page: a new id never clashes with either, `counterRef` only grows.
    const taken = new Set([...baselineIds, ...ids(contacts)]);
    const { id, counter } = nextContactId(taken, counterRef.current);
    counterRef.current = counter;
    const next = [...contacts, { id, name: '', role: '', email: '', phone: '' }];
    focus.requestFocus({ next: ids(next), targets: [`name:${id}`] });
    onChange({ contacts: next });
  };

  const remove = (index: number) => {
    // `aria-disabled` does not block a click: the last contact stays, and its button says why (`LAST_CONTACT_NOTE`).
    if (contacts.length <= 1) return;
    const removed = contacts[index]!;
    const next = contacts.filter((_, i) => i !== index);
    // The contact that takes the place of the removed one, else the previous one, else "Add contact".
    const heir = next[index] ?? next[index - 1];
    focus.requestFocus({ next: ids(next), targets: heir ? [`remove:${heir.id}`, 'add'] : ['add'] });
    // The primary contact removed: no contact is the primary one any more, and Save says so (never a silent pick).
    onChange(removed.id === primaryContactId ? { contacts: next, primaryContactId: '' } : { contacts: next });
  };

  const primaryOptions = contacts.map((c, i) => ({ value: c.id, label: contactLabel(c, i) }));

  return (
    // `position: relative`: the visually hidden spans are absolutely positioned and must stay inside the scroller.
    <div style={{ position: 'relative', display: 'grid', gap: 16, maxWidth: 720, minWidth: 0 }}>
      <ol style={LIST}>
        {contacts.map((contact, i) => {
          const n = i + 1;
          const path = (field: keyof ContactValues) => `contacts.${i}.${field}`;
          return (
            <li key={contact.id} style={CARD} data-contact-id={contact.id}>
              <div style={CARD_HEADER}>
                <strong>
                  Contact {n}
                  {contact.id === primaryContactId ? ' (primary)' : ''}
                </strong>
                {disabledReason ? null : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => remove(i)}
                    ref={focus.targetRef(`remove:${contact.id}`)}
                    aria-disabled={onlyOne || undefined}
                    aria-describedby={onlyOne ? lastNoteId : undefined}
                  >
                    <span>
                      Remove <span className="sr-only">{`contact ${n}`}</span>
                    </span>
                  </Button>
                )}
              </div>
              <div style={CARD_FIELDS}>
                <Field label={`Contact ${n} name`} name={path('name')} required {...state} {...helpProps(fieldHelp, path('name'))}>
                  <Input
                    value={contact.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                    ref={focus.targetRef(`name:${contact.id}`)}
                    autoComplete="off"
                  />
                </Field>
                <Field label={`Contact ${n} role`} name={path('role')} {...state} {...helpProps(fieldHelp, path('role'))}>
                  <Input value={contact.role} onChange={(e) => update(i, { role: e.target.value })} autoComplete="off" />
                </Field>
                <Field label={`Contact ${n} e-mail`} name={path('email')} required {...state} {...helpProps(fieldHelp, path('email'))}>
                  <Input type="email" value={contact.email} onChange={(e) => update(i, { email: e.target.value })} autoComplete="off" />
                </Field>
                <Field label={`Contact ${n} phone`} name={path('phone')} {...state} {...helpProps(fieldHelp, path('phone'))}>
                  <Input type="tel" value={contact.phone} onChange={(e) => update(i, { phone: e.target.value })} autoComplete="off" />
                </Field>
              </div>
            </li>
          );
        })}
      </ol>
      {onlyOne && !disabledReason ? (
        <p id={lastNoteId} style={{ margin: 0 }}>
          {LAST_CONTACT_NOTE}
        </p>
      ) : null}
      {listError ? (
        <p id={errorId} className="text-rop-error" style={{ margin: 0 }}>
          {listError}
        </p>
      ) : null}
      {disabledReason ? null : (
        <div>
          <Button
            variant="secondary"
            onClick={add}
            ref={focus.targetRef('add')}
            data-rop-name="contacts"
            aria-invalid={listError ? true : undefined}
            aria-describedby={listError ? errorId : undefined}
          >
            Add contact
          </Button>
        </div>
      )}
      <div style={{ maxWidth: 420 }}>
        <Field label="Primary contact" name="primaryContactId" required {...state} {...helpProps(fieldHelp, 'primaryContactId')}>
          <Select
            options={primaryOptions}
            placeholder="Choose the primary contact"
            emptyLabel="No contacts"
            value={primaryOptions.some((o) => o.value === primaryContactId) ? primaryContactId : undefined}
            onValueChange={(id) => onChange({ primaryContactId: id })}
          />
        </Field>
      </div>
    </div>
  );
}
