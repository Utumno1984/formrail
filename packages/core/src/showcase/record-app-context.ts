// Story-only (#525): what the app that hosts the record-editing shell (`RecordApp`) gives to the pages inside it.
// Two things a page cannot do alone: open a record of ANOTHER module (an order's customer) and let the app's
// navigation (the modules bar, outside the page) ask the page's dirty-guard before leaving. Absent (the module
// stories mount the shell with no app), pages have no related links and nothing changes. Not exported by the package.
import { createContext } from 'react';

/** The dirty-guard of the page on screen: runs `action` now if the page is clean, after a confirmation otherwise. */
export type PageGuard = (action: () => void) => void;

export interface RecordAppContextValue {
  /** The href of a record of `module` (the real link: a middle click opens it in a new tab). */
  hrefRelated: (module: string, id: string) => string;
  /** Shows a record of `module` (a `pushState`). The page asks its dirty-guard BEFORE calling it. */
  openRelated: (module: string, id: string) => void;
  /** The page on screen registers its dirty-guard (and removes it when it goes), so the modules bar can ask it. */
  registerGuard: (guard: PageGuard) => () => void;
}

export const RecordAppContext = createContext<RecordAppContextValue | null>(null);

/** What a module's sections get to link a record to a related one (see `RecordSectionsProps.related`). */
export interface RelatedRecords {
  /** The href of the related record. */
  href: (module: string, id: string) => string;
  /** Opens it, behind the page's dirty-guard (a dialog when there are unsaved changes). */
  open: (module: string, id: string) => void;
}
