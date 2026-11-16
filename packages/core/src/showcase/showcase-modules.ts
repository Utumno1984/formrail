// Story-only (#519, B3 of #518): the ONE list of the showcase's modules (record types), the default one first.
// A static list, never filled at runtime: the router reads it to parse a URL (`readRoute`) AND to write one
// (`openRecord`, `openCreate`, `recordHref`), so a module that is not here can neither be read nor written. A new
// domain adds its name here, next to its `RecordModule` (see `record-module.ts`). Not exported by the package.

/** The modules the router knows, the default one first: it is the one whose URLs carry no `module` parameter. */
export const SHOWCASE_MODULES: readonly [string, ...string[]] = ['invoices', 'sales-orders'];
