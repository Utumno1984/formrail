import { afterEach, describe, expect, it } from 'vitest';
import { updateSearch } from '../list-report/use-list-report-url-state';
import {
  DEFAULT_MODULE,
  isLeaving,
  leaveRoute,
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

// #518: the route carries a module. The default module (the invoices) keeps the URLs it had before.
const TWO_MODULES = ['invoices', 'tasks'] as const;

describe('parseRoute (#518)', () => {
  it('the default module is the invoices, the only one known so far', () => {
    expect(SHOWCASE_MODULES).toEqual(['invoices']);
    expect(DEFAULT_MODULE).toBe('invoices');
  });

  it('the invoice URLs of before #518 parse to the invoices module, `record` winning over `create`', () => {
    expect(parseRoute('')).toEqual({ module: 'invoices', kind: 'list' });
    expect(parseRoute('?filter=paid&q=x&sort=amount.desc')).toEqual({ module: 'invoices', kind: 'list' });
    expect(parseRoute('?filter=paid&record=inv-12')).toEqual({ module: 'invoices', kind: 'record', id: 'inv-12' });
    expect(parseRoute('?create=1')).toEqual({ module: 'invoices', kind: 'create' });
    expect(parseRoute('?create=1&record=inv-3')).toEqual({ module: 'invoices', kind: 'record', id: 'inv-3' });
    expect(parseRoute('?create=0')).toEqual({ module: 'invoices', kind: 'list' });
    expect(parseRoute('?record=')).toEqual({ module: 'invoices', kind: 'list' });
  });

  it('a second module: its list, its records and its creation page', () => {
    expect(parseRoute('?module=tasks', TWO_MODULES)).toEqual({ module: 'tasks', kind: 'list' });
    expect(parseRoute('?q=brief&module=tasks&record=task-7', TWO_MODULES)).toEqual({ module: 'tasks', kind: 'record', id: 'task-7' });
    expect(parseRoute('?module=tasks&create=1', TWO_MODULES)).toEqual({ module: 'tasks', kind: 'create' });
    expect(parseRoute('?module=invoices&record=inv-1', TWO_MODULES)).toEqual({ module: 'invoices', kind: 'record', id: 'inv-1' });
    // No `module` (or an empty one): the default module, the first of the list.
    expect(parseRoute('?record=inv-1', TWO_MODULES)).toEqual({ module: 'invoices', kind: 'record', id: 'inv-1' });
    expect(parseRoute('?module=&create=1', TWO_MODULES)).toEqual({ module: 'invoices', kind: 'create' });
    expect(parseRoute('?create=1', ['tasks', 'invoices'])).toEqual({ module: 'tasks', kind: 'create' });
  });

  it('an unknown module is the LIST of the default module, whatever else the URL asks', () => {
    expect(parseRoute('?module=nope', TWO_MODULES)).toEqual({ module: 'invoices', kind: 'list' });
    expect(parseRoute('?module=nope&record=task-7', TWO_MODULES)).toEqual({ module: 'invoices', kind: 'list' });
    expect(parseRoute('?module=nope&create=1', TWO_MODULES)).toEqual({ module: 'invoices', kind: 'list' });
    // A module not registered yet is unknown: with the default registry, `tasks` too.
    expect(parseRoute('?module=tasks&record=inv-1')).toEqual({ module: 'invoices', kind: 'list' });
    expect(parseRoute('?module=Invoices&record=inv-1')).toEqual({ module: 'invoices', kind: 'list' });
  });

  it('routeKey: one key per route, distinct across modules and between a record named "new" and a creation page', () => {
    const routes: Route[] = [
      { module: 'invoices', kind: 'list' },
      { module: 'tasks', kind: 'list' },
      { module: 'invoices', kind: 'record', id: 'new' },
      { module: 'invoices', kind: 'create' },
      { module: 'tasks', kind: 'record', id: 'new' },
      { module: 'tasks', kind: 'create' },
    ];
    expect(new Set(routes.map(routeKey)).size).toBe(routes.length);
    expect(routeKey({ module: 'tasks', kind: 'record', id: 'a' })).toBe(routeKey(parseRoute('?module=tasks&record=a', TWO_MODULES)));
  });
});

describe('routeSearch (#518)', () => {
  // What the router wrote before #518: only `record` and `create`, everything else byte for byte.
  const before = (search: string, route: Route) =>
    updateSearch(search, { record: route.kind === 'record' ? route.id : null, create: route.kind === 'create' ? '1' : null });
  const SEARCHES = [
    '',
    '?id=showcase-invoices--crud&viewMode=story',
    '?filter=paid&q=a%20b&sort=amount.desc',
    '?record=inv-3&filter=draft',
    '?create=1&q=x',
    '?q=x&record=inv-1&record=inv-2&create=1',
    '?args=saveDelayMs:2000&sort=date.asc',
  ];
  const INVOICE_ROUTES: Route[] = [
    { module: 'invoices', kind: 'list' },
    { module: 'invoices', kind: 'record', id: 'inv-12' },
    { module: 'invoices', kind: 'record', id: 'a b&c' },
    { module: 'invoices', kind: 'create' },
  ];

  it('the invoice URLs are the same as before #518, byte for byte', () => {
    for (const search of SEARCHES) {
      for (const route of INVOICE_ROUTES) expect(routeSearch(search, route), `${search} -> ${routeKey(route)}`).toBe(before(search, route));
    }
  });

  it('another module adds `module`, keeps it on its list, and drops it going back to the default module', () => {
    expect(routeSearch('?filter=paid', { module: 'tasks', kind: 'record', id: 'task-7' })).toBe('?filter=paid&module=tasks&record=task-7');
    expect(routeSearch('?filter=paid&module=tasks&record=task-7', { module: 'tasks', kind: 'list' })).toBe('?filter=paid&module=tasks');
    expect(routeSearch('?module=tasks&record=task-7', { module: 'tasks', kind: 'create' })).toBe('?module=tasks&create=1');
    expect(routeSearch('?module=tasks&q=x', { module: 'invoices', kind: 'list' })).toBe('?q=x');
    expect(routeSearch('?module=nope&record=x', { module: 'invoices', kind: 'record', id: 'inv-1' })).toBe('?record=inv-1');
    // Each route parses back to itself.
    const route: Route = { module: 'tasks', kind: 'record', id: 'task-7' };
    expect(parseRoute(routeSearch('?q=x', route), TWO_MODULES)).toEqual(route);
  });
});

describe('the router on the window (#518): the invoices keep their URLs', () => {
  afterEach(() => {
    // `leaveRoute` waits for the `popstate` of its `history.back()` before navigating again.
    if (isLeaving()) window.dispatchEvent(new PopStateEvent('popstate'));
    window.history.replaceState(null, '', '/');
  });

  it('opening a record and the creation page writes the same URLs as before', () => {
    window.history.replaceState(null, '', '/iframe.html?filter=paid');
    expect(recordHref('inv-4')).toBe('/iframe.html?filter=paid&record=inv-4');
    openRecord('inv-4');
    expect(window.location.search).toBe('?filter=paid&record=inv-4');
    expect(readRecord()).toBe('inv-4');
    expect(readCreate()).toBe(false);
    window.history.replaceState(null, '', '/iframe.html?filter=paid');
    openCreate();
    expect(window.location.search).toBe('?filter=paid&create=1');
    expect(readCreate()).toBe(true);
    expect(readRecord()).toBeNull();
  });

  it('readRecord/readCreate answer for one module: an unknown module is the default list', () => {
    window.history.replaceState(null, '', '/iframe.html?module=nope&record=inv-4&create=1');
    expect(readRoute()).toEqual({ module: 'invoices', kind: 'list' });
    expect(readRecord()).toBeNull();
    expect(readCreate()).toBe(false);
    window.history.replaceState(null, '', '/iframe.html?record=inv-4');
    expect(readRecord('tasks')).toBeNull();
    expect(readRecord(DEFAULT_MODULE)).toBe('inv-4');
  });

  it('readCreate answers for one module: with `?create=1` only the default module is creating', () => {
    window.history.replaceState(null, '', '/iframe.html?create=1');
    expect(readCreate('tasks')).toBe(false);
    expect(readCreate()).toBe(true);
    expect(readCreate(DEFAULT_MODULE)).toBe(true);
  });

  it('opening a record from an unknown module drops the stray `module`; a deep link leaves to the list URL with no route parameter', () => {
    window.history.replaceState(null, '', '/iframe.html?module=nope&q=x');
    openRecord('inv-2');
    expect(window.location.search).toBe('?q=x&record=inv-2');
    // Deep link: no list entry before this one.
    window.history.replaceState(null, '', '/iframe.html?q=x&record=inv-2#top');
    leaveRoute();
    expect(`${window.location.search}${window.location.hash}`).toBe('?q=x#top');
  });
});
