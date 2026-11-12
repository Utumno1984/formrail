import { describe, expect, it } from 'vitest';
import { createExampleLookup, type ExampleSource } from './example-lookup';

// The lookup behind `exampleStory` (tickets #403, #447), fed with what the build's globs would give.

function CoreDemo() {
  return null;
}
function ProDemo() {
  return null;
}

const CORE_PATH = '/packages/core/src/button/Button.example.tsx';
const PRO_PATH = '/packages/pro/src/change-summary/ChangeSummary.example.tsx';
const core: ExampleSource = { root: 'packages/core/src', modules: { [CORE_PATH]: { CoreDemo } }, texts: { [CORE_PATH]: 'core text' } };
const pro: ExampleSource = { root: 'packages/pro/src', modules: { [PRO_PATH]: { ProDemo } }, texts: { [PRO_PATH]: 'pro text' } };

describe('createExampleLookup (#447)', () => {
  it('finds an example of either package by file name: its only component and its own text', () => {
    const lookup = createExampleLookup([core, pro]);
    expect(lookup('Button.example.tsx')).toEqual({ path: CORE_PATH, component: CoreDemo, code: 'core text' });
    expect(lookup('ChangeSummary.example.tsx')).toEqual({ path: PRO_PATH, component: ProDemo, code: 'pro text' });
  });

  it('throws on a missing file, naming the file and both folders searched', () => {
    const lookup = createExampleLookup([core, pro]);
    expect(() => lookup('Gone.example.tsx')).toThrow('Gone.example.tsx: no such example file (expected a *.example.tsx under packages/core/src or packages/pro/src)');
  });

  it('names only the folders of the build: the Free build does not search packages/pro', () => {
    expect(() => createExampleLookup([core])('ChangeSummary.example.tsx')).toThrow(
      'ChangeSummary.example.tsx: no such example file (expected a *.example.tsx under packages/core/src)',
    );
    expect(() => createExampleLookup([])('X.example.tsx')).toThrow('under (no folder in this build)');
  });

  it('throws on two files with the same name, one in core and one in Pro, naming both paths', () => {
    const twin = '/packages/pro/src/button/Button.example.tsx';
    const clash: ExampleSource = { ...pro, modules: { ...pro.modules, [twin]: { ProDemo } }, texts: { ...pro.texts, [twin]: 'twin' } };
    expect(() => createExampleLookup([core, clash])).toThrow(`Two example files named Button.example.tsx (${CORE_PATH}, ${twin}): the lookup would be ambiguous`);
  });

  it('throws on two files with the same name in one package', () => {
    const other = '/packages/core/src/other/Button.example.tsx';
    const clash: ExampleSource = { ...core, modules: { ...core.modules, [other]: { CoreDemo } }, texts: { ...core.texts, [other]: 'other' } };
    expect(() => createExampleLookup([clash])).toThrow('Two example files named Button.example.tsx');
  });

  it('throws on a file without text, and on a file that does not export exactly one component', () => {
    expect(() => createExampleLookup([{ ...core, texts: {} }])('Button.example.tsx')).toThrow('no such example file');
    const two: ExampleSource = { ...core, modules: { [CORE_PATH]: { CoreDemo, ProDemo, label: 'not a component' } } };
    expect(() => createExampleLookup([two])('Button.example.tsx')).toThrow('Button.example.tsx: an example file exports exactly one component, found 2');
    const none: ExampleSource = { ...core, modules: { [CORE_PATH]: { label: 'x' } } };
    expect(() => createExampleLookup([none])('Button.example.tsx')).toThrow('found 0');
  });

  it('accepts an empty text (only a missing one throws)', () => {
    expect(createExampleLookup([{ ...core, texts: { [CORE_PATH]: '' } }])('Button.example.tsx').code).toBe('');
  });
});
