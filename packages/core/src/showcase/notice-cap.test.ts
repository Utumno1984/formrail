import { describe, expect, it } from 'vitest';
import { EDITOR_MIN_REM, NOTICE_MIN_REM, NOTICE_SHARE, noticeCap } from './notice-cap';

// The phone of #470: 390x500, a footer of 89px (the save bar of a narrow screen), the editor filling the window.
const PHONE = { frameTop: 0, frameBottom: 500, footerTop: 411, visibleBottom: 500, viewportHeight: 500, rem: 16 };

describe('noticeCap (#470)', () => {
  it('pins the documented constants', () => {
    expect([NOTICE_SHARE, EDITOR_MIN_REM, NOTICE_MIN_REM]).toEqual([0.4, 10, 3]);
  });

  it('a tall window: 40% of the editor (the room left to edit is not the limit)', () => {
    expect(noticeCap({ ...PHONE, frameBottom: 800, footerTop: 743, visibleBottom: 800, viewportHeight: 800 })).toBe(320);
  });

  it('390x500 without keyboard: 40% of the editor (200px), the scroller keeps 211px >= 10rem', () => {
    const cap = noticeCap(PHONE);
    expect(cap).toBe(200);
    expect(PHONE.footerTop - cap).toBeGreaterThanOrEqual(EDITOR_MIN_REM * 16);
  });

  it('the share counts the editor, not the window: a banner above it (the Pro demo) lowers the cap', () => {
    expect(noticeCap({ ...PHONE, frameTop: 48 })).toBeCloseTo(0.4 * 452);
  });

  it('a short editor: the scroller keeps 10rem, the notice gets what is left', () => {
    // 360px tall: 40% would be 144px, but the scroller (300px above the footer) keeps 160px: 140px for the notice.
    expect(noticeCap({ ...PHONE, frameBottom: 360, footerTop: 300, visibleBottom: 360, viewportHeight: 360 })).toBe(140);
  });

  it('the virtual keyboard (225px of 500): the scroller keeps 10rem above the line a focused Field lands on, else the notice its 3rem', () => {
    // The line is 411 - 225 = 186px: 186 - 160 = 26px left, below the notice's minimum.
    expect(noticeCap({ ...PHONE, visibleBottom: 275 })).toBe(NOTICE_MIN_REM * 16);
  });

  it('a small keyboard leaves the notice more than its minimum, and never more than 40% of what is visible', () => {
    // Keyboard of 60px: the line is 351px, 351 - 160 = 191px; 40% of the 440px visible is 176px.
    expect(noticeCap({ ...PHONE, visibleBottom: 440 })).toBe(176);
  });

  it('never below the minimum, even with no room at all; scales with the root font size', () => {
    expect(noticeCap({ ...PHONE, frameBottom: 100, footerTop: 50, visibleBottom: 100, viewportHeight: 100 })).toBe(48);
    expect(noticeCap({ ...PHONE, frameBottom: 100, footerTop: 50, visibleBottom: 100, viewportHeight: 100, rem: 20 })).toBe(60);
  });
});
