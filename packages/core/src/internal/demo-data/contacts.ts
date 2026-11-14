// Contact people of customers and suppliers. Every contact has its own stable id, so a list of
// contacts can be edited (added, removed, reordered) and compared by identity, not by position.
import { DEMO_COUNTRIES, phoneNumbers, type DemoAddress, type DemoLanguageArea } from './geo';
import { personName, PERSON_NAME_SLOTS } from './people';
import type { Rng } from './rng';

export interface DemoContact {
  /** Stable, globally unique id: `<owner id>-con-<n>`, e.g. `cus-12-con-1`. */
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly fullName: string;
  /** Job role at the customer or supplier. */
  readonly role: string;
  /** `<first>.<last>@<company domain>` on a reserved `.example` domain. */
  readonly email: string;
  readonly phone: string;
  /** Exactly one contact of a record is the primary one. */
  readonly primary: boolean;
}

/** Most contacts share the language area of the company's country; a few come from elsewhere. */
const OTHER_AREAS: readonly DemoLanguageArea[] = ['en', 'de', 'nl', 'fr', 'es', 'it', 'nordic', 'pl', 'ja'];

/**
 * 1 to `max` contacts (the first is the primary one) with distinct names, hence distinct e-mail
 * addresses within the company.
 */
export function makeContacts(
  rng: Rng,
  ownerId: string,
  domain: string,
  address: DemoAddress,
  roles: readonly string[],
  counts: readonly (readonly [number, number])[],
): readonly DemoContact[] {
  const count = rng.weighted(counts);
  const area = rng.chance(0.9) ? DEMO_COUNTRIES[address.country].area : rng.pick(OTHER_AREAS);
  // Consecutive slots with a stride coprime with the slot count: distinct names for up to 400 contacts.
  const base = rng.int(0, PERSON_NAME_SLOTS - 1);
  const firstRole = rng.int(0, roles.length - 1);
  const phone = phoneNumbers(address);
  const contacts: DemoContact[] = [];
  for (let k = 0; k < count; k++) {
    const person = personName(area, base + k * 157);
    contacts.push(
      Object.freeze({
        id: `${ownerId}-con-${k + 1}`,
        firstName: person.firstName,
        lastName: person.lastName,
        fullName: person.fullName,
        role: roles[(firstRole + k) % roles.length]!,
        email: `${person.emailLocal}@${domain}`,
        phone: phone(rng),
        primary: k === 0,
      }),
    );
  }
  return Object.freeze(contacts);
}
