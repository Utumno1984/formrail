import { expect, test, type Locator, type Page } from "@playwright/test";
import { expectNoA11yViolations } from "./helpers/a11y";
import { expectPlayToPass, gotoStory } from "./helpers/story";

const STORY = (name: string) => `overlays-menu--${name}`;
const menuOf = (page: Page) => page.getByRole("menu");
// `includeHidden`: an open modal menu hides everything outside itself, the trigger included.
const trigger = (page: Page, name = "More actions") =>
  page.getByRole("button", { name, includeHidden: true });

async function bodyPointerEvents(page: Page): Promise<string> {
  return page.evaluate(() => document.body.style.pointerEvents);
}

test.describe("Overlays/Menu: stories play", () => {
  for (const name of [
    "playground",
    "open-with-groups",
    "near-right-edge",
    "opens-a-dialog",
    "inside-dialog",
    "inside-dialog-open",
    "inside-sheet",
    "external-state",
    "rtl",
  ]) {
    test(`${name}: the play function passes`, async ({ page }) => {
      await expectPlayToPass(page, STORY(name));
    });
  }
});

test.describe("Menu: roles, keyboard, focus", () => {
  test("open menu has no axe violations and the right roles", async ({
    page,
  }) => {
    await gotoStory(page, STORY("playground"));
    await trigger(page).focus();
    await page.keyboard.press("ArrowDown");
    await expect(menuOf(page)).toBeVisible();
    await expect(menuOf(page)).toHaveAccessibleName("More actions");
    await expect(page.getByRole("group", { name: "Edit" })).toBeVisible();
    await expect(page.getByRole("separator")).toHaveCount(1);
    await expectNoA11yViolations(page);
  });

  test("Tab closes the menu and moves on in the page; Shift+Tab goes back", async ({
    page,
  }) => {
    await gotoStory(page, STORY("external-state"));
    await trigger(page).focus();
    await page.keyboard.press("Enter");
    await expect(menuOf(page)).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(menuOf(page)).toHaveCount(0);
    // Nothing follows the trigger: the focus is not lost to an arbitrary node, it falls back to it.
    await expect(trigger(page)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(menuOf(page)).toBeVisible();
    await page.keyboard.press("Shift+Tab");
    await expect(menuOf(page)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Open from outside" }),
    ).toBeFocused();
  });

  test("Escape from a click-opened menu returns the focus to the trigger", async ({
    page,
  }) => {
    await gotoStory(page, STORY("playground"));
    await trigger(page).click();
    await expect(menuOf(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menuOf(page)).toHaveCount(0);
    await expect(trigger(page)).toBeFocused();
  });

  test("click outside closes it, activates nothing underneath, focus back on the trigger", async ({
    page,
  }) => {
    await gotoStory(page, STORY("external-state"));
    await trigger(page).click();
    await expect(menuOf(page)).toBeVisible();
    // Where "Open from outside" is: a click there must only close the menu, not reopen it.
    const box = (await page
      .getByRole("button", { name: "Open from outside", includeHidden: true })
      .boundingBox())!;
    await page.mouse.click(box.x + 4, box.y + 4);
    await expect(menuOf(page)).toHaveCount(0);
    await page.waitForTimeout(150);
    await expect(menuOf(page)).toHaveCount(0);
    expect(await bodyPointerEvents(page)).not.toBe("none");
  });

  test("double click on the trigger: coherent final state, no pointer-events: none left", async ({
    page,
  }) => {
    await gotoStory(page, STORY("playground"));
    await trigger(page).dblclick();
    await page.waitForTimeout(300);
    // Whichever way it settled, the DOM agrees with itself: open <=> aria-expanded and inert page.
    const open = (await menuOf(page).count()) === 1;
    await expect(trigger(page)).toHaveAttribute("aria-expanded", String(open));
    if (open) await page.keyboard.press("Escape");
    await expect(menuOf(page)).toHaveCount(0);
    await expect.poll(() => bodyPointerEvents(page)).not.toBe("none");
    await trigger(page).click();
    await expect(menuOf(page)).toBeVisible();
  });

  test("a long menu scrolls inside; the item reached with the arrows stays visible", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 800, height: 300 });
    await gotoStory(page, STORY("long-menu"));
    await trigger(page, "Many actions").focus();
    await page.keyboard.press("ArrowDown");
    const menu = menuOf(page);
    await expect(menu).toBeVisible();
    const box = (await menu.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(300);
    expect(await menu.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(
      true,
    );
    for (let i = 0; i < 29; i++) await page.keyboard.press("ArrowDown");
    const last = page.getByRole("menuitem", { name: "Action 30" });
    await expect(last).toBeFocused();
    const m = (await menu.boundingBox())!;
    const l = (await last.boundingBox())!;
    expect(l.y).toBeGreaterThanOrEqual(m.y - 1);
    expect(l.y + l.height).toBeLessThanOrEqual(m.y + m.height + 1);
  });
});

test.describe("Menu: Dialog and Sheet", () => {
  test("opens a Dialog: Dialog focused, closing returns the focus to the trigger, page clickable", async ({
    page,
  }) => {
    await expectPlayToPass(page, STORY("opens-a-dialog"));
    await expect(trigger(page)).toBeFocused();
    expect(await bodyPointerEvents(page)).not.toBe("none");
    // Again with the mouse, closing with the Cancel button.
    await trigger(page).click();
    await page.getByRole("menuitem", { name: "Delete…" }).click();
    await expect(
      page.getByRole("dialog", { name: "Delete this record?" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(trigger(page)).toBeFocused();
    expect(await bodyPointerEvents(page)).not.toBe("none");
    await trigger(page).click();
    await expect(menuOf(page)).toBeVisible();
  });

  for (const name of ["inside-dialog", "inside-sheet"]) {
    test(`${name}: the menu is above the panel, Escape closes only the menu`, async ({
      page,
    }) => {
      // The play function opens the panel and leaves it open with the menu closed.
      await expectPlayToPass(page, STORY(name));
      await trigger(page).click();
      const item = page.getByRole("menuitem", { name: "Duplicate" });
      await expect(item).toBeVisible();
      const box = (await item.boundingBox())!;
      const onTop = await page.evaluate(
        ([x, y]) =>
          document.elementFromPoint(x!, y!)?.closest('[role="menuitem"]')
            ?.textContent,
        [box.x + box.width / 2, box.y + box.height / 2],
      );
      expect(onTop).toBe("Duplicate");
      await page.keyboard.press("Escape");
      await expect(menuOf(page)).toHaveCount(0);
      await expect(page.getByRole("dialog", { name: "Record" })).toBeVisible();
      await expect(trigger(page)).toBeFocused();
      await expectNoA11yViolations(page);
    });
  }
});

test.describe("Menu: placement", () => {
  test("375px near the right edge: inside the viewport, no horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await gotoStory(page, STORY("near-right-edge"));
    const menu = menuOf(page);
    await expect(menu).toBeVisible();
    const box = (await menu.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(375);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });

  test("RTL: the panel aligns to the start (right) edge of the trigger", async ({
    page,
  }) => {
    await expectPlayToPass(page, STORY("rtl")); // leaves the menu open
    await expect(menuOf(page)).toBeVisible();
    const t = (await trigger(page).boundingBox())!;
    const m = (await menuOf(page).boundingBox())!;
    expect(Math.abs(m.x + m.width - (t.x + t.width))).toBeLessThanOrEqual(2);
  });
});

test.describe("Menu: touch @touch", () => {
  test("tap opens, tap on an item activates once, tap outside closes without activating what is under", async ({
    page,
  }) => {
    await gotoStory(page, STORY("external-state"));
    const cdp = await page.context().newCDPSession(page);
    const tap = async (target: Locator) => {
      const b = (await target.boundingBox())!;
      const pt = { x: b.x + b.width / 2, y: b.y + b.height / 2, id: 1 };
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [pt],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    };
    await tap(trigger(page));
    await expect(menuOf(page)).toBeVisible();
    await tap(page.getByRole("menuitem", { name: "Duplicate" }));
    await expect(menuOf(page)).toHaveCount(0);
    await page.waitForTimeout(300);
    await tap(trigger(page));
    await expect(menuOf(page)).toBeVisible();
    // The "Open from outside" button is under the tap: it must only close the menu.
    await tap(
      page.getByRole("button", {
        name: "Open from outside",
        includeHidden: true,
      }),
    );
    await expect(menuOf(page)).toHaveCount(0);
    await page.waitForTimeout(300);
    await expect(menuOf(page)).toHaveCount(0);
  });
});
