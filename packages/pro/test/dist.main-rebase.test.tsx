// `useFormRebase` of the main entry on the BUILT files (run `npm run build` first; `npm run check` does), ticket
// #489: the wrapper typed for core's form, in `dist/index.*`, passes its `options` to the engine hook it imports
// from `dist/engine.*`. ESM with core's ESM build, CJS with core's CJS build. Same scenario as public-api.test.tsx.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { useObjectPageForm as esmUseObjectPageForm } from '@formrail/core';
import * as esm from '../dist/index.js';
import * as esmEngine from '../dist/engine.js';
import {
  EXPECTED_WITH_OPTIONS,
  EXPECTED_WITH_OTHER_LABELS,
  EXPECTED_WITHOUT_OPTIONS,
  OTHER_LABELS,
  SCENARIO_OPTIONS,
  runOptionsRerenderScenario,
  runOptionsScenario,
} from './rebase-options-scenario';

type Index = typeof import('../src/index');
type Engine = typeof import('../src/engine');
type Core = typeof import('@formrail/core');
// Vitest runs in packages/pro (jsdom, for renderHook: `import.meta.url` is not a file URL here).
const require = createRequire(resolve(process.cwd(), 'package.json'));
const cjs = require('./dist/index.cjs') as Index;
const cjsEngine = require('./dist/engine.cjs') as Engine;
const cjsCore = require('@formrail/core') as Core;

describe.each([
  ['ESM', esm as unknown as Index, esmUseObjectPageForm],
  ['CJS', cjs, cjsCore.useObjectPageForm],
])('dist/index (%s): useFormRebase with options', (_format, api, useObjectPageForm) => {
  it('arrayIdKeys, isEqual and labels reach the engine', () => {
    expect(runOptionsScenario(useObjectPageForm, api.useFormRebase)).toEqual(EXPECTED_WITHOUT_OPTIONS);
    expect(runOptionsScenario(useObjectPageForm, api.useFormRebase, SCENARIO_OPTIONS)).toEqual(EXPECTED_WITH_OPTIONS);
  });

  // #507: the options of a later render, before the rebase, are the ones the built wrapper passes on.
  it('options changed by a rerender before the rebase are the ones used', () => {
    expect(runOptionsRerenderScenario(useObjectPageForm, api.useFormRebase, undefined, SCENARIO_OPTIONS)).toEqual(EXPECTED_WITH_OPTIONS);
    expect(runOptionsRerenderScenario(useObjectPageForm, api.useFormRebase, SCENARIO_OPTIONS, OTHER_LABELS)).toEqual(EXPECTED_WITH_OTHER_LABELS);
  });
});

describe.each([
  ['ESM', esmEngine as unknown as Engine, esmUseObjectPageForm],
  ['CJS', cjsEngine, cjsCore.useObjectPageForm],
])('dist/engine (%s): useFormRebase with options changed by a rerender', (_format, api, useObjectPageForm) => {
  it('the merge uses the options of the last render before the rebase', () => {
    expect(runOptionsRerenderScenario(useObjectPageForm, api.useFormRebase, undefined, SCENARIO_OPTIONS)).toEqual(EXPECTED_WITH_OPTIONS);
    expect(runOptionsRerenderScenario(useObjectPageForm, api.useFormRebase, SCENARIO_OPTIONS, undefined)).toEqual(EXPECTED_WITHOUT_OPTIONS);
    expect(runOptionsRerenderScenario(useObjectPageForm, api.useFormRebase, SCENARIO_OPTIONS, OTHER_LABELS)).toEqual(EXPECTED_WITH_OTHER_LABELS);
  });
});
