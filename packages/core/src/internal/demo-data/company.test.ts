// @vitest-environment node
import { DEMO_COMPANY, DEMO_LEGAL_ENTITIES } from './company';
import { DEMO_CURRENCIES } from './currency';
import { DEMO_COUNTRIES } from './geo';

describe('DEMO_COMPANY', () => {
  it('has a name, a headquarters, subsidiaries in at least four other countries and its currencies', () => {
    expect(DEMO_COMPANY.name.length).toBeGreaterThan(0);
    expect(DEMO_COMPANY.headquarters.country).toBe('NL');
    expect(DEMO_COMPANY.headquarters.address).toContain(DEMO_COMPANY.headquarters.city);
    const countries = new Set(DEMO_COMPANY.subsidiaries.map((entity) => entity.country));
    expect(countries.size).toBeGreaterThanOrEqual(4);
    expect(countries).toEqual(new Set(['US', 'GB', 'DE', 'JP']));
    expect(countries.has(DEMO_COMPANY.headquarters.country)).toBe(false);
    for (const currency of ['EUR', 'USD', 'GBP', 'JPY'] as const) expect(DEMO_COMPANY.currencies).toContain(currency);
    expect([...DEMO_COMPANY.currencies].sort()).toEqual([...DEMO_CURRENCIES].sort());
  });

  it('derives every legal name and its domain from the one name', () => {
    for (const entity of DEMO_LEGAL_ENTITIES) expect(entity.legalName.startsWith(DEMO_COMPANY.name)).toBe(true);
    expect(DEMO_COMPANY.domain).toMatch(/^[a-z]+\.example$/);
    expect(DEMO_COMPANY.website).toBe(`https://www.${DEMO_COMPANY.domain}`);
  });

  it('gives each entity a known country and the currency of that country', () => {
    const ids = DEMO_LEGAL_ENTITIES.map((entity) => entity.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entity of DEMO_LEGAL_ENTITIES) {
      expect(DEMO_COUNTRIES[entity.country]).toBeDefined();
      expect(entity.currency).toBe(DEMO_COUNTRIES[entity.country].currency);
      // The country table routes the entity's own country to the entity itself.
      expect(DEMO_COUNTRIES[entity.country].entityId).toBe(entity.id);
    }
  });

  it('has warehouses that belong to existing entities, with unique ids', () => {
    const entityIds = new Set(DEMO_LEGAL_ENTITIES.map((entity) => entity.id));
    const ids = DEMO_COMPANY.warehouses.map((warehouse) => warehouse.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const warehouse of DEMO_COMPANY.warehouses) expect(entityIds.has(warehouse.entityId)).toBe(true);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(DEMO_COMPANY)).toBe(true);
    expect(Object.isFrozen(DEMO_COMPANY.subsidiaries)).toBe(true);
    expect(Object.isFrozen(DEMO_COMPANY.subsidiaries[0])).toBe(true);
    expect(Object.isFrozen(DEMO_COMPANY.warehouses[0])).toBe(true);
  });
});
