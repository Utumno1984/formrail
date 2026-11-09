// Icons the system itself uses (close button, chevrons, Message Strip...). Drawn from scratch for
// this project on a 24x24 grid with `currentColor`; NOT exported from src/index.ts and not part
// of the public API. Feed them to <Icon>, which sizes them and handles the ARIA semantics.
import type { ReactElement, SVGProps } from 'react';

type SvgElement = ReactElement<SVGProps<SVGSVGElement>>;

const stroke = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

// Built by a call marked pure: the `...stroke` spreads are not provably side-effect free for the
// bundler, so a bare object literal would stay in every bundle that includes this module.
export const internalIcons = /* @__PURE__ */ (() => ({
  close: (
    <svg {...stroke}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  'chevron-down': (
    <svg {...stroke}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  ),
  check: (
    <svg {...stroke}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  ),
  info: (
    <svg {...stroke}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.01" />
    </svg>
  ),
  success: (
    <svg {...stroke}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l3 3 5-6" />
    </svg>
  ),
  warning: (
    <svg {...stroke}>
      <path d="M12 3.5L2.5 20h19L12 3.5z" />
      <path d="M12 10v5M12 17.5v.01" />
    </svg>
  ),
  error: (
    <svg {...stroke}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </svg>
  ),
}) satisfies Record<string, SvgElement>)();

export type InternalIconName = keyof typeof internalIcons;

// Kept out of `internalIcons`: that object is bundled whole by every control that uses one of its
// icons, so the NumberInput steppers would grow all of them (bundle budget).
export const stepperIcons = /* @__PURE__ */ (() => ({
  plus: (
    <svg {...stroke}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  minus: (
    <svg {...stroke}>
      <path d="M5 12h14" />
    </svg>
  ),
}) satisfies Record<string, SvgElement>)();
