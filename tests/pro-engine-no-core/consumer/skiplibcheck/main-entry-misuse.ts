// What the README documents for the MAIN entry without @formrail/core and `skipLibCheck: true`: `tsc` passes,
// because the core types in the declaration files of @formrail/pro silently become `any`, so even a wrong
// argument to the core-typed `useFormRebase` type-checks. The error only comes when the module loads.
// (With the core installed, or with `skipLibCheck: false`, this file fails to typecheck.)
import { useFormRebase } from '@formrail/pro';

export const misuse = () => useFormRebase('not a form');
