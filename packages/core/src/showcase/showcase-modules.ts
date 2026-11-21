// Story-only (#519, B3 of #518): the ONE list of the showcase's modules (record types), the first one is what a URL with no `module` opens.
// A static list, never filled at runtime: the router reads it to parse a URL (`readRoute`) AND to write one
// (`openRecord`, `openCreate`, `recordHref`), so a module that is not here can neither be read nor written. A new
// domain adds its name here, next to its `RecordModule` (see `record-module.ts`). Not exported by the package.

/** The modules the router knows. Every module is written with its own `module` parameter; a URL with none opens the first. */
export const SHOWCASE_MODULES: readonly [string, ...string[]] = ['sales-orders', 'customers'];
