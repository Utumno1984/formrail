import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createCustomerStore } from '../../customer-store';
import { ACTIVE, ready, retype, save, setupCustomerTests, setupPage, stored, textbox, visibleBar } from './customer-test-kit';

// #523: the identity rule of the contacts (remove + re-add an identical one is a change) must hold ACROSS a remount:
// the counter of new ids restarts from 0 when the page is reopened, so the ids already saved must stay "taken".
setupCustomerTests();

describe('CustomerContacts: new ids after a remount (#523)', () => {
  it('a contact saved as new keeps its id; after reopening, remove + re-add of the same texts gets ANOTHER id: the bar shows', async () => {
    const store = createCustomerStore();
    setupPage(ACTIVE, store);
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Add contact' }));
    await retype(textbox('Contact 3 name'), 'Ilse Visser');
    await retype(textbox('Contact 3 e-mail'), 'ilse.visser@company.example');
    await save();
    const savedId = stored(store, ACTIVE).contacts[2]!.id;
    expect(savedId).toMatch(/^new-contact-/);

    // Reopened: a fresh page, the counter of the ids starts again from 0.
    cleanup();
    setupPage(ACTIVE, store);
    await ready();
    expect(textbox('Contact 3 name').value).toBe('Ilse Visser');
    await userEvent.click(screen.getByRole('button', { name: 'Remove contact 3' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add contact' }));
    await retype(textbox('Contact 3 name'), 'Ilse Visser');
    await retype(textbox('Contact 3 e-mail'), 'ilse.visser@company.example');

    await visibleBar();
    const newId = document.querySelectorAll('[data-contact-id]')[2]!.getAttribute('data-contact-id');
    expect(newId).toMatch(/^new-contact-/);
    expect(newId).not.toBe(savedId);
    // The slowest test of the customers (a Save and a second mount): an explicit budget, as the other long ones.
  }, 30_000);
});
