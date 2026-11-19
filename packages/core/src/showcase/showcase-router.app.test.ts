import { afterEach, describe, expect, it } from 'vitest';
import {
  isLeaving,
  leaveRoute,
  moduleHref,
  openCreate,
  openModule,
  openRecord,
  openRelated,
  readRoute,
  replaceRoute,
  subscribeRoute,
} from './showcase-router';

// #525: the router of the app: the list of another module, a record of another module opened from a page.
afterEach(() => {
  if (isLeaving()) window.dispatchEvent(new PopStateEvent('popstate'));
  window.history.replaceState(null, '', '/');
});

describe('moduleHref (#525)', () => {
  it('is the list of the module with every module\'s own list parameters kept, and no route parameter of a page', () => {
    window.history.replaceState(null, '', '/iframe.html?id=s&sales-orders.filter=confirmed&sales-orders.sort=total.desc&module=customers&record=cus-4');
    expect(moduleHref('sales-orders')).toBe('/iframe.html?id=s&sales-orders.filter=confirmed&sales-orders.sort=total.desc&module=sales-orders');
    expect(moduleHref('customers')).toBe('/iframe.html?id=s&sales-orders.filter=confirmed&sales-orders.sort=total.desc&module=customers');
  });

  it('throws for a module that is not registered, as every other writer of the router', () => {
    expect(() => moduleHref('tasks')).toThrow('unknown module "tasks"');
    expect(() => openModule('tasks')).toThrow('unknown module "tasks"');
    expect(() => openRelated('x', 'tasks')).toThrow('unknown module "tasks"');
  });
});

describe('openModule (#525)', () => {
  it('pushes the list of the module (Back returns to where the user was) and does not push twice for the same list', () => {
    window.history.replaceState(null, '', '/iframe.html?module=sales-orders&sales-orders.q=ab');
    const entries = window.history.length;
    openModule('customers');
    expect(window.location.search).toBe('?module=customers&sales-orders.q=ab');
    expect(readRoute()).toEqual({ module: 'customers', kind: 'list' });
    expect(window.history.length).toBe(entries + 1);
    openModule('customers'); // a double click
    expect(window.history.length).toBe(entries + 1);
  });

  it('from a record page it shows the list of the module', () => {
    window.history.replaceState(null, '', '/iframe.html?module=sales-orders&record=so-1');
    openModule('sales-orders');
    expect(window.location.search).toBe('?module=sales-orders');
    expect(readRoute()).toEqual({ module: 'sales-orders', kind: 'list' });
  });
});

describe('openRelated (#525)', () => {
  it('opens a record of another module, keeping the list parameters of both', () => {
    window.history.replaceState(null, '', '/iframe.html?module=sales-orders&record=so-1&sales-orders.filter=confirmed');
    openRelated('cus-4', 'customers');
    expect(window.location.search).toBe('?module=customers&record=cus-4&sales-orders.filter=confirmed');
    expect(readRoute()).toEqual({ module: 'customers', kind: 'record', id: 'cus-4' });
  });

  it('the page opened from another module leaves to ITS module\'s list: "Back to list" never goes back to the order', () => {
    window.history.replaceState(null, '', '/iframe.html?module=sales-orders');
    openRecord('so-1', 'sales-orders'); // opened by the list
    openRelated('cus-4', 'customers'); // opened by the order
    const entries = window.history.length;
    leaveRoute();
    expect(isLeaving()).toBe(false); // no `history.back()`: the entry is replaced
    expect(window.location.search).toBe('?module=customers');
    expect(readRoute()).toEqual({ module: 'customers', kind: 'list' });
    expect(window.history.length).toBe(entries);
  });

  it('a page opened by its own list still leaves with history.back() (the marker of that entry is not lost)', () => {
    window.history.replaceState(null, '', '/iframe.html?module=customers');
    openRecord('cus-4', 'customers');
    leaveRoute();
    expect(isLeaving()).toBe(true);
  });

  it('a creation page is opened by its list, a module change is not', () => {
    window.history.replaceState(null, '', '/iframe.html?module=sales-orders');
    openCreate('sales-orders');
    leaveRoute();
    expect(isLeaving()).toBe(true);
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.history.replaceState(null, '', '/iframe.html?module=sales-orders');
    openModule('customers');
    leaveRoute(); // the list of a module has no page to leave: it stays on the list of its module
    expect(isLeaving()).toBe(false);
    expect(readRoute()).toEqual({ module: 'customers', kind: 'list' });
  });
});

describe('replaceRoute (#525, round 2)', () => {
  it('replaces the URL of the entry and tells the subscribers, with no popstate and no new entry', () => {
    window.history.replaceState({ other: 1, ropFromList: true }, '', '/iframe.html?id=s&module=customers&record=cus-4');
    const entries = window.history.length;
    let popstates = 0;
    const onPop = () => popstates++;
    window.addEventListener('popstate', onPop, true);
    let told = 0;
    const unsubscribe = subscribeRoute(() => told++);
    try {
      replaceRoute('/iframe.html?id=s&module=sales-orders');
      expect(window.location.search).toBe('?id=s&module=sales-orders');
      expect(readRoute()).toEqual({ module: 'sales-orders', kind: 'list' });
      expect(told).toBe(1);
      expect(popstates).toBe(0);
      expect(window.history.length).toBe(entries);
      // The marker described the page that is gone; the rest of the state (a tool's own data) stays.
      expect(window.history.state).toEqual({ other: 1 });
    } finally {
      unsubscribe();
      window.removeEventListener('popstate', onPop, true);
    }
  });
});
