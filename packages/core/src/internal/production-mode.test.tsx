import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DialogTrigger } from "../dialog/Dialog";
import { useFieldControl } from "../field/useFieldControl";
import { MenuTrigger } from "../menu/Menu";
import { useToast } from "../toast/use-toast";

// Ticket #687: invariant errors are thrown in every environment; only the `[formrail] ` prefix is dropped
// in production. Development and test keep the message byte for byte. And the two diagnostics that used to
// have no guard at all (Icon, Select) are silent in production.

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

function Orphan({ use }: { use: () => unknown }) {
  use();
  return null;
}

const thrownBy = (element: React.ReactElement): string => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    render(element);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("expected the render to throw");
};

const CASES: ReadonlyArray<{
  name: string;
  element: () => React.ReactElement;
  message: string;
}> = [
  {
    name: "<MenuTrigger> outside <Menu>",
    element: () => <MenuTrigger>x</MenuTrigger>,
    message: "<MenuTrigger> must be rendered inside <Menu>.",
  },
  {
    name: "useToast() outside <ToastProvider>",
    element: () => <Orphan use={useToast} />,
    message: "useToast() must be used inside <ToastProvider>.",
  },
  {
    name: "useFieldControl() outside <Field>",
    element: () => <Orphan use={useFieldControl} />,
    message: "useFieldControl() must be called inside a <Field>.",
  },
  {
    name: "<DialogTrigger> outside <Dialog>",
    element: () => <DialogTrigger>x</DialogTrigger>,
    message: "<DialogTrigger> must be rendered inside <Dialog>.",
  },
];

describe("invariant errors", () => {
  for (const { name, element, message } of CASES) {
    it(`${name}: the message keeps its [formrail] prefix in development and test`, () => {
      expect(thrownBy(element())).toBe(`[formrail] ${message}`);
    });

    it(`${name}: still thrown in production, without the prefix`, () => {
      vi.stubEnv("NODE_ENV", "production");
      expect(thrownBy(element())).toBe(message);
    });
  }
});

describe("diagnostics that used to be unguarded", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    // `<Icon>` warns once per page load: a fresh module for each case.
    vi.resetModules();
  });

  it("<Icon> with a child that is not an <svg> warns once in development", async () => {
    const { Icon } = await import("../icon/Icon");
    const { rerender } = render(
      <Icon>
        <img alt="" src="x.png" />
      </Icon>,
    );
    rerender(
      <Icon>
        <img alt="" src="y.png" />
      </Icon>,
    );
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).toContain("[formrail] <Icon>");
  });

  it("<Icon> with a child that is not an <svg> is silent in production, and still renders nothing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { Icon } = await import("../icon/Icon");
    const { container } = render(
      <Icon>
        <img alt="" src="x.png" />
      </Icon>,
    );
    expect(container).toBeEmptyDOMElement();
    expect(warn).not.toHaveBeenCalled();
  });

  const DUPLICATES = [
    { value: "a", label: "One" },
    { value: "a", label: "Two" },
  ];

  it("<Select> with duplicate values is silent in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { Select } = await import("../select/Select");
    render(<Select aria-label="Country" options={DUPLICATES} />);
    expect(warn).not.toHaveBeenCalled();
  });

  it("<Select> with duplicate values warns once in development", async () => {
    const { Select } = await import("../select/Select");
    const { rerender } = render(
      <Select aria-label="Country" options={DUPLICATES} />,
    );
    rerender(<Select aria-label="Country" options={DUPLICATES} />);
    expect(
      warn.mock.calls.filter((call: unknown[]) =>
        String(call[0]).includes("unique values"),
      ),
    ).toHaveLength(1);
  });
});
