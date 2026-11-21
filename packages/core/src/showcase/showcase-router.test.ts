import { afterEach, describe, expect, it, vi } from 'vitest';
import { updateSearch } from '../list-report/use-list-report-url-state';
import {
  FIRST_MODULE,
  isLeaving,
  isShowcaseModule,
  leaveRoute,
  listParamPrefix,
  openCreate,
  openRecord,
  parseRoute,
  readCreate,
  readRecord,
  readRoute,
  recordHref,
  routeKey,
  routeSearch,
  SHOWCASE_MODULES,
  type Route,
} from './showcase-router';

// #527: no module is special. Every module is written with its own `module` and its own list parameters; a URL with
// no `module` opens the FIRST registered one. The tests use two neutral modules, never the ones of a story.
vi.mock('./showcase-modules', () => ({ SHOWCASE_MODULES: ['alpha', 'beta'] }));
const TWO_MODULES = ['alpha', 'beta'] as const;

describe('parseRoute (#518, #527)', () => {
  it('the first registered module is what a URL with no `module` opens', () => {
    expect(SHOWCASE_MODULES).toEqual(['alpha', 'beta']);
    expect(FIRST_MODULE).toBe('alpha');
  });

  it('a URL with no `module` parses to the first module, `record` winning over `create`', () => {
    expect(parseRoute('')).toEqual({ module: 'alpha', kind: 'list' });
    expect(parseRoute('?filter=paid&q=x&sort=amount.desc')).toEqual({ module: 'alpha', kind: 'list' });
    expect(parseRoute('?filter=paid&record=a-12')).toEqual({ module: 'alpha', kind: 'record', id: 'a-12' });
    expect(parseRoute('?create=1')).toEqual({ module: 'alpha', kind: 'create' });
    expect(parseRoute('?create=1&record=a-3')).toEqual({ module: 'alpha', kind: 'record', id: 'a-3' });
    expect(parseRoute('?create=0')).toEqual({ module: 'alpha', kind: 'list' });
    expect(parseRoute('?record=')).toEqual({ module: 'alpha', kind: 'list' });
  });

  it('a second module: its list, its records and its creation page', () => {
    expect(parseRoute('?module=beta', TWO_MODULES)).toEqual({ module: 'beta', kind: 'list' });
    expect(parseRoute('?q=brief&module=beta&record=b-7', TWO_MODULES)).toEqual({ module: 'beta', kind: 'record', id: 'b-7' });
    expect(parseRoute('?module=beta&create=1', TWO_MODULES)).toEqual({ module: 'beta', kind: 'create' });
    expect(parseRoute('?module=alpha&record=a-1', TWO_MODULES)).toEqual({ module: 'alpha', kind: 'record', id: 'a-1' });
    // No `module` (or an empty one): the first module of the list.
    expect(parseRoute('?record=a-1', TWO_MODULES)).toEqual({ module: 'alpha', kind: 'record', id: 'a-1' });
    expect(parseRoute('?module=&create=1', TWO_MODULES)).toEqual({ module: 'alpha', kind: 'create' });
    expect(parseRoute('?create=1', ['beta', 'alpha'])).toEqual({ module: 'beta', kind: 'create' });
  });

  it('an unknown module is the LIST of the first module, whatever else the URL asks', () => {
    expect(parseRoute('?module=nope', TWO_MODULES)).toEqual({ module: 'alpha', kind: 'list' });
    expect(parseRoute('?module=nope&record=b-7', TWO_MODULES)).toEqual({ module: 'alpha', kind: 'list' });
    expect(parseRoute('?module=nope&create=1', TWO_MODULES)).toEqual({ module: 'alpha', kind: 'list' });
    // A module not registered is unknown: with the registry of this file, `gamma` too.
    expect(parseRoute('?module=gamma&record=a-1')).toEqual({ module: 'alpha', kind: 'list' });
    expect(parseRoute('?module=Alpha&record=a-1')).toEqual({ module: 'alpha', kind: 'list' });
  });

  it('routeKey: one key per route, distinct across modules and between a record named "new" and a creation page', () => {
    const routes: Route[] = [
      { module: 'alpha', kind: 'list' },
      { module: 'beta', kind: 'list' },
      { module: 'alpha', kind: 'record', id: 'new' },
      { module: 'alpha', kind: 'create' },
      { module: 'beta', kind: 'record', id: 'new' },
      { module: 'beta', kind: 'create' },
    ];
    expect(new Set(routes.map(routeKey)).size).toBe(routes.length);
    expect(routeKey({ module: 'beta', kind: 'record', id: 'a' })).toBe(routeKey(parseRoute('?module=beta&record=a', TWO_MODULES)));
  });
});

describe('routeSearch (#518, #527)', () => {
  const SEARCHES = [
    '',
    '?id=showcase-alpha--crud&viewMode=story',
    '?filter=paid&q=a%20b&sort=amount.desc',
    '?record=a-3&filter=draft',
    '?create=1&q=x',
    '?q=x&record=a-1&record=a-2&create=1',
    '?args=saveDelayMs:2000&sort=date.asc',
  ];
  const ROUTES: Route[] = [
    { module: 'alpha', kind: 'list' },
    { module: 'alpha', kind: 'record', id: 'a-12' },
    { module: 'alpha', kind: 'record', id: 'a b&c' },
    { module: 'alpha', kind: 'create' },
    { module: 'beta', kind: 'list' },
    { module: 'beta', kind: 'record', id: 'b-7' },
  ];

  it('every module is written with its `module`, and every other parameter is kept byte for byte', () => {
    for (const search of SEARCHES) {
      for (const route of ROUTES) {
        // Whatever is not a route parameter is untouched: with the three removed, both sides are the same string.
        const written = routeSearch(search, route);
        expect(updateSearch(written, { module: null, record: null, create: null }), `${search} -> ${routeKey(route)}`).toBe(
          updateSearch(search, { module: null, record: null, create: null }),
        );
        expect(new URLSearchParams(written).get('module')).toBe(route.module);
        expect(parseRoute(routeSearch(search, route), TWO_MODULES), `${search} -> ${routeKey(route)}`).toEqual(route);
      }
    }
  });

  it('a module adds `module`, keeps it on its list, and the first module has no special treatment', () => {
    expect(routeSearch('?filter=paid', { module: 'beta', kind: 'record', id: 'b-7' })).toBe('?filter=paid&module=beta&record=b-7');
    expect(routeSearch('?filter=paid&module=beta&record=b-7', { module: 'beta', kind: 'list' })).toBe('?filter=paid&module=beta');
    expect(routeSearch('?module=beta&record=b-7', { module: 'beta', kind: 'create' })).toBe('?module=beta&create=1');
    expect(routeSearch('?module=beta&q=x', { module: 'alpha', kind: 'list' })).toBe('?module=alpha&q=x');
    expect(routeSearch('?module=nope&record=x', { module: 'alpha', kind: 'record', id: 'a-1' })).toBe('?module=alpha&record=a-1');
    // Each route parses back to itself.
    const route: Route = { module: 'beta', kind: 'record', id: 'b-7' };
    expect(parseRoute(routeSearch('?q=x', route), TWO_MODULES)).toEqual(route);
  });
});

describe('the router on the window (#518, #527): every module writes its `module`', () => {
  afterEach(() => {
    // `leaveRoute` waits for the `popstate` of its `history.back()` before navigating again.
    if (isLeaving()) window.dispatchEvent(new PopStateEvent('popstate'));
    window.history.replaceState(null, '', '/');
  });

  it('opening a record and the creation page writes the module and the route', () => {
    window.history.replaceState(null, '', '/iframe.html?filter=paid');
    expect(recordHref('a-4', 'alpha')).toBe('/iframe.html?filter=paid&module=alpha&record=a-4');
    openRecord('a-4', 'alpha');
    expect(window.location.search).toBe('?filter=paid&module=alpha&record=a-4');
    expect(readRecord('alpha')).toBe('a-4');
    expect(readCreate('alpha')).toBe(false);
    window.history.replaceState(null, '', '/iframe.html?filter=paid');
    openCreate('alpha');
    expect(window.location.search).toBe('?filter=paid&module=alpha&create=1');
    expect(readCreate('alpha')).toBe(true);
    expect(readRecord('alpha')).toBeNull();
  });

  it('readRecord/readCreate answer for one module: an unknown module is the first list', () => {
    window.history.replaceState(null, '', '/iframe.html?module=nope&record=a-4&create=1');
    expect(readRoute()).toEqual({ module: 'alpha', kind: 'list' });
    expect(readRecord('alpha')).toBeNull();
    expect(readCreate('alpha')).toBe(false);
    window.history.replaceState(null, '', '/iframe.html?record=a-4');
    expect(readRecord('beta')).toBeNull();
    expect(readRecord(FIRST_MODULE)).toBe('a-4');
  });

  it('readCreate answers for one module: with `?create=1` and no `module` only the first module is creating', () => {
    window.history.replaceState(null, '', '/iframe.html?create=1');
    expect(readCreate('beta')).toBe(false);
    expect(readCreate('alpha')).toBe(true);
    expect(readCreate(FIRST_MODULE)).toBe(true);
  });

  it('opening a record from an unknown module replaces the stray `module`; a deep link leaves to the list URL of its module', () => {
    window.history.replaceState(null, '', '/iframe.html?module=nope&q=x');
    openRecord('a-2', 'alpha');
    expect(window.location.search).toBe('?module=alpha&q=x&record=a-2');
    // Deep link: no list entry before this one.
    window.history.replaceState(null, '', '/iframe.html?q=x&module=alpha&record=a-2#top');
    leaveRoute();
    expect(`${window.location.search}${window.location.hash}`).toBe('?q=x&module=alpha#top');
  });
});

describe('the module registry (#519, B3 of #518, #527)', () => {
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('reading and writing use the same list: an unregistered module is never written', () => {
    expect(isShowcaseModule('alpha')).toBe(true);
    expect(isShowcaseModule('gamma')).toBe(false);
    window.history.replaceState(null, '', '/iframe.html?q=x');
    const entries = window.history.length;
    expect(() => openRecord('g-7', 'gamma')).toThrow('unknown module "gamma"');
    expect(() => openCreate('gamma')).toThrow('unknown module "gamma"');
    expect(() => recordHref('g-7', 'gamma')).toThrow('unknown module "gamma"');
    expect(window.location.search).toBe('?q=x');
    expect(window.history.length).toBe(entries);
  });

  it('the list parameters of every module have its name as a prefix, the first one included', () => {
    expect(listParamPrefix(FIRST_MODULE)).toBe('alpha');
    expect(listParamPrefix('beta')).toBe('beta');
  });
});
