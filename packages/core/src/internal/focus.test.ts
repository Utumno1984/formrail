import { afterEach, describe, expect, it, vi } from 'vitest';
import { isLaidOut } from './focus';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isLaidOut', () => {
  it('uses checkVisibility when the environment has it', () => {
    const el = document.createElement('div');
    const original = Object.getOwnPropertyDescriptor(Element.prototype, 'checkVisibility');
    Element.prototype.checkVisibility = () => true;
    expect(isLaidOut(el)).toBe(true);
    Element.prototype.checkVisibility = () => false;
    expect(isLaidOut(el)).toBe(false);
    if (original) Object.defineProperty(Element.prototype, 'checkVisibility', original);
    else delete (Element.prototype as { checkVisibility?: unknown }).checkVisibility;
  });

  it('falls back to the rendered boxes without checkVisibility', () => {
    const el = document.createElement('div');
    const original = Object.getOwnPropertyDescriptor(Element.prototype, 'checkVisibility');
    delete (Element.prototype as { checkVisibility?: unknown }).checkVisibility;
    const rects = vi.spyOn(el, 'getClientRects');
    rects.mockReturnValue([] as unknown as DOMRectList);
    expect(isLaidOut(el)).toBe(false);
    rects.mockReturnValue([{}] as unknown as DOMRectList);
    expect(isLaidOut(el)).toBe(true);
    if (original) Object.defineProperty(Element.prototype, 'checkVisibility', original);
  });
});
