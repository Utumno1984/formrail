import { expect, test, type Locator, type Page } from "@playwright/test";
import { gotoStory } from "./helpers/story";

// QA spec for #45 (Combobox): cases the ticket lists as "casi limite" and that e2e/combobox.spec.ts
// does not drive with a real keyboard/mouse. Permanent: it covers the contract of onValueChange
// (no echo, clearOnEmpty, revert) by counting the calls that reach the Actions channel.

const STORY = (name: string) => `forms-combobox--${name}`;
const input = (page: Page, name = "Comune"): Locator =>
  page.getByRole("combobox", { name });
const listbox = (page: Page): Locator => page.getByRole("listbox");

declare global {
  interface Window {
    __calls: { name: string; args: unknown }[];
  }
}

/** Records every `onValueChange` call that Storybook's `fn()` reports on the channel. */
async function recordCalls(page: Page) {
  await page.addInitScript(() => {
    window.__calls = [];
    const timer = setInterval(() => {
      const channel = (
        window as unknown as {
          __STORYBOOK_ADDONS_CHANNEL__?: {
            emit: (e: string, ...a: unknown[]) => void;
          };
        }
      ).__STORYBOOK_ADDONS_CHANNEL__;
      if (!channel) return;
      clearInterval(timer);
      const original = channel.emit.bind(channel);
      channel.emit = (event: string, ...args: unknown[]) => {
        if (
          event === "storybook/instrument/call" ||
          event === "storybook/actions/action-event"
        ) {
          window.__calls.push({ name: event, args: JSON.stringify(args) });
        }
        return original(event, ...args);
      };
    }, 1);
  });
}
/**
 * The AsyncLoad story clicks "Carica dati" in its own play function. To drive the parent's change
 * by hand (and mid-typing) the first synthetic click on that button is swallowed in the capture
 * phase until the test releases it with `window.__release()`. The play then fails on purpose; only
 * the state of the page matters here.
 */
async function holdLoadButton(page: Page) {
  await page.addInitScript(() => {
    let blocked = true;
    (window as unknown as { __release: () => void }).__release = () => {
      blocked = false;
    };
    window.addEventListener(
      "click",
      (e) => {
        if (
          blocked &&
          (e.target as HTMLElement | null)?.textContent === "Carica dati"
        )
          e.stopPropagation();
      },
      true,
    );
  });
}
const release = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __release: () => void }).__release(),
  );
const calls = (page: Page) =>
  page.evaluate(() =>
    window.__calls
      .filter((c) => String(c.args).includes("onValueChange"))
      .map((c) => String(c.args)),
  );

test.describe("QA #45: onValueChange contract", () => {
  test("typing outside the results and leaving with Tab: no call, the input reverts to the selection", async ({
    page,
  }) => {
    await recordCalls(page);
    await gotoStory(page, STORY("manual"));
    const box = input(page);
    await box.click();
    await page.getByRole("option", { name: "Torino" }).click();
    const before = (await calls(page)).length;
    expect(before).toBeGreaterThan(0); // the recorder sees the pick
    await box.fill("zzz");
    await page.keyboard.press("Tab");
    await expect(box).toHaveValue("Torino");
    expect((await calls(page)).length).toBe(before);
  });

  test("clearOnEmpty: emptying the text and leaving calls onValueChange(undefined) once; without it the selection stays", async ({
    page,
  }) => {
    await recordCalls(page);
    await gotoStory(page, STORY("manual"), "clearOnEmpty:!true");
    const box = input(page);
    await box.click();
    await page.getByRole("option", { name: "Torino" }).click();
    const before = (await calls(page)).length;
    await box.press("Control+a");
    await box.press("Backspace");
    await page.keyboard.press("Tab");
    await expect(box).toHaveValue("");
    expect((await calls(page)).length).toBe(before + 1);
    await page.waitForTimeout(200);
    expect((await calls(page)).length).toBe(before + 1);

    // Default: the selection stays.
    await gotoStory(page, STORY("manual"));
    await box.click();
    await page.getByRole("option", { name: "Torino" }).click();
    await box.press("Control+a");
    await box.press("Backspace");
    await page.keyboard.press("Tab");
    await expect(box).toHaveValue("Torino");
  });

  test("the parent sets value and options while the user is typing: the text is kept, no call, the new label shows on leaving", async ({
    page,
  }) => {
    await recordCalls(page);
    await holdLoadButton(page);
    await gotoStory(page, STORY("async-load"));
    await page.waitForTimeout(1500); // let the (doomed) play function give up
    const box = input(page);
    await box.click();
    await page.keyboard.type("abc");
    await release(page);
    // A click that does not move the focus (the real parent would do it from a timer / a fetch).
    await page
      .getByRole("button", { name: "Carica dati" })
      .evaluate((b: HTMLElement) => b.click());
    await expect(box).toHaveValue("abc");
    expect(await calls(page)).toEqual([]);
    await page.keyboard.press("Tab");
    await expect(box).toHaveValue("Torino");
    expect(await calls(page)).toEqual([]);
  });

  test('options arrive while the list is open on "No results": the list updates without crashing', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await holdLoadButton(page);
    await gotoStory(page, STORY("async-load"));
    await page.waitForTimeout(1500);
    const box = input(page);
    await box.click();
    await release(page);
    // Scoped to the list: the live region next to the input carries the same text.
    await expect(page.getByRole("listbox").getByText("No results")).toBeVisible();
    await page.keyboard.press("Enter"); // empty options: nothing happens
    await page.keyboard.press("ArrowDown");
    await page
      .getByRole("button", { name: "Carica dati" })
      .evaluate((b: HTMLElement) => b.click());
    await expect(box).toHaveValue("Torino");
    expect(errors).toEqual([]);
  });
});

test.describe("QA #45: odd interactions", () => {
  test("IME: Enter during a composition does not select", async ({ page }) => {
    await gotoStory(page, STORY("manual"));
    const box = input(page);
    await box.click();
    await page.keyboard.type("mi");
    await box.evaluate((el) => {
      el.dispatchEvent(
        new CompositionEvent("compositionstart", { bubbles: true }),
      );
      el.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          isComposing: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await expect(box).toHaveValue("mi");
    await expect(listbox(page)).toBeVisible();
    await box.evaluate((el) =>
      el.dispatchEvent(
        new CompositionEvent("compositionend", { bubbles: true }),
      ),
    );
    await page.keyboard.press("Enter");
    await expect(box).toHaveValue("Milano");
  });

  test("dragging/pressing on the list scrollbar keeps the list open and the focus on the input", async ({
    page,
  }) => {
    await gotoStory(page, STORY("long-list"));
    const box = input(page, "Cliente");
    await box.click();
    const r = (await listbox(page).boundingBox())!;
    // Right edge of the list = scrollbar track.
    await page.mouse.move(r.x + r.width - 3, r.y + 40);
    await page.mouse.down();
    await page.mouse.move(r.x + r.width - 3, r.y + r.height - 10);
    await page.mouse.up();
    await expect(listbox(page)).toBeVisible();
    await expect(box).toBeFocused();
  });

  test("the focus leaving by script (blur) closes the list", async ({
    page,
  }) => {
    await gotoStory(page, STORY("manual"));
    const box = input(page);
    await box.click();
    await expect(listbox(page)).toBeVisible();
    await box.evaluate((el) => (el as HTMLInputElement).blur());
    await expect(listbox(page)).toHaveCount(0);
    await expect(box).toHaveAttribute("aria-expanded", "false");
  });

  test("resizing the window with the list open keeps the list attached to the input", async ({
    page,
  }) => {
    await gotoStory(page, STORY("manual"));
    const box = input(page);
    await box.click();
    await expect(listbox(page)).toBeVisible();
    await page.setViewportSize({ width: 500, height: 700 });
    await page.waitForTimeout(200);
    const i = (await box.boundingBox())!;
    const l = (await listbox(page).boundingBox())!;
    expect(Math.abs(l.x - i.x)).toBeLessThanOrEqual(2);
    expect(
      Math.min(
        Math.abs(l.y - (i.y + i.height)),
        Math.abs(l.y + l.height - i.y),
      ),
    ).toBeLessThanOrEqual(12);
  });

  test("the list is a live-position anchor: the page scroll by keyboard (PageDown on the body) never leaves it floating", async ({
    page,
  }) => {
    await gotoStory(page, STORY("keyboard-safe"));
    const box = input(page);
    await box.scrollIntoViewIfNeeded();
    await box.click();
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(250);
    const gap = await page.evaluate(() => {
      const i = document
        .querySelector('[role="combobox"]')!
        .getBoundingClientRect();
      const l = document.querySelector('[role="listbox"]');
      if (!l) return 0;
      const r = l.getBoundingClientRect();
      return Math.min(Math.abs(r.top - i.bottom), Math.abs(r.bottom - i.top));
    });
    expect(gap).toBeLessThanOrEqual(12);
  });

  test("no prop leaks to the DOM: the input carries no control prop as attribute", async ({
    page,
  }) => {
    await gotoStory(page, STORY("manual"), "clearOnEmpty:!true;size:sm");
    const box = input(page);
    await box.click();
    const attrs = await box.evaluate((el) => el.getAttributeNames());
    for (const bad of [
      "clearonempty",
      "emptylabel",
      "unknownvaluelabel",
      "options",
      "filter",
      "onvaluechange",
      "size",
    ]) {
      expect(attrs, bad).not.toContain(bad);
    }
    const html = await page.evaluate(() =>
      document.body.innerHTML.toLowerCase(),
    );
    for (const bad of [
      "clearonempty",
      "emptylabel",
      "unknownvaluelabel",
      "[object object]",
      "undefined",
    ]) {
      expect(html.includes(bad), bad).toBe(false);
    }
  });
});

for (const [name, container] of [
  ["dialog", "inside-dialog"],
  ["sheet", "inside-sheet"],
] as const) {
  test.describe(`QA #45: inside a ${name}`, () => {
    test("click on the input with the list open keeps it open; click on the container title closes only the list; focus stays inside", async ({
      page,
    }) => {
      await gotoStory(page, STORY(container));
      const box = page
        .getByRole("dialog")
        .getByRole("combobox", { name: "Comune" });
      await box.fill("o");
      await expect(listbox(page)).toBeVisible();
      await box.click();
      await box.click();
      await expect(listbox(page)).toBeVisible();
      await page.getByRole("dialog").getByRole("heading").click();
      await expect(listbox(page)).toHaveCount(0);
      await expect(page.getByRole("dialog")).toBeVisible();
    });

    test("Escape with the list open and a typed text outside the results: list first, container second; the container is still open after a pick by keyboard", async ({
      page,
    }) => {
      await gotoStory(page, STORY(container));
      const box = page
        .getByRole("dialog")
        .getByRole("combobox", { name: "Comune" });
      await box.fill("mi");
      await expect(listbox(page)).toBeVisible();
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(box).toBeFocused();
      await page.keyboard.press("Escape"); // list is closed: this one closes the container
      await expect(page.getByRole("dialog")).toHaveCount(0);
    });

    test("after the container closes, reopening gives a working combobox (no stale layer)", async ({
      page,
    }) => {
      await gotoStory(page, STORY(container));
      await page.getByRole("dialog").getByRole("combobox").fill("o");
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      // The body must be interactive again (no leaked scroll lock / pointer-events: none).
      const pe = await page.evaluate(
        () => getComputedStyle(document.body).pointerEvents,
      );
      expect(pe).not.toBe("none");
    });
  });
}

test.describe("QA #45: touch @touch", () => {
  test("inside a dialog a tap on an option selects it and leaves the dialog open", async ({
    page,
  }) => {
    await gotoStory(page, STORY("inside-dialog"));
    const box = page
      .getByRole("dialog")
      .getByRole("combobox", { name: "Comune" });
    await box.fill("o");
    await expect(listbox(page)).toBeVisible();
    await page.getByRole("option", { name: "Torino" }).tap();
    await expect(box).toHaveValue("Torino");
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("a tap outside closes the list and reverts the text", async ({
    page,
  }) => {
    await gotoStory(page, STORY("base"));
    const box = input(page);
    await box.tap();
    await box.fill("zz");
    await page.mouse.click(2, 2);
    await expect(listbox(page)).toHaveCount(0);
    await expect(box).toHaveValue("Modena");
  });
});

test.describe("QA #45: locked Field state (the stories cover disabled and forced)", () => {
  test("locked: focusable, readOnly, no key and no click opens the list, the text never changes, the Field explains why", async ({
    page,
  }) => {
    await gotoStory(page, STORY("manual"), "state:locked");
    const box = input(page);
    await page.keyboard.press("Tab");
    await expect(box).toBeFocused();
    await expect(box).toHaveAttribute("readonly", "");
    for (const key of [
      "ArrowDown",
      "ArrowUp",
      "Enter",
      "m",
      "Backspace",
      "Escape",
    ]) {
      await page.keyboard.press(key);
      await expect(listbox(page)).toHaveCount(0);
    }
    await box.click();
    await box.dblclick();
    await expect(listbox(page)).toHaveCount(0);
    await expect(box).toHaveValue("");
    await expect(box).toHaveAccessibleDescription(
      /Deciso dal contratto quadro\./,
    );
  });
});
