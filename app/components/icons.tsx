/*
 * Icons.
 *
 * Hand-drawn on a 24 unit grid, stroked with `currentColor`, no dependency.
 * Adding an icon package for fourteen glyphs would put a bundler-facing
 * dependency between the page and a deadline, for shapes that are six lines each.
 *
 * Rules the set follows, so it cannot drift:
 *   one grid        24 by 24, 1.7 stroke, round caps and joins, 2 unit padding
 *   one colour      currentColor only. An icon never carries its own palette.
 *   one meaning     a glyph is used for one idea in this app, everywhere
 *   decorative      every icon here is aria-hidden. The label beside it is the
 *                   text a screen reader reads, never the icon.
 */
import type { ReactNode } from "react";

type IconProps = {
  /** Rendered square size in px. 16 is the body default, 13 to 15 in chips. */
  size?: number;
  className?: string;
};

function Svg({ size = 16, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/* --- decisions ------------------------------------------------------------ */

/** A decision that went through. */
export function CheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m5 12.6 4.3 4.3L19 6.6" />
    </Svg>
  );
}

/** A decision that was refused. */
export function XIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6.2 6.2l11.6 11.6M17.8 6.2L6.2 17.8" />
    </Svg>
  );
}

/** Neither: a state worth knowing, not a verdict. */
export function DotIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3.6" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/* --- the four sections ---------------------------------------------------- */

/** Approvals. */
export function CheckCircleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.6" />
      <path d="m8.3 12.3 2.5 2.5 4.9-5.1" />
    </Svg>
  );
}

/** Activity: a decision trail, not a chart. */
export function PulseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.4 12h3.8l2.3-5.8 3.4 11.6 2.3-5.8h5.4" />
    </Svg>
  );
}

/** Agents: the same mark the agent avatar carries, so the two read as one thing. */
export function TargetIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="7.6" />
      <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
      <path d="M12 2.6v2.6M12 18.8v2.6M2.6 12h2.6M18.8 12h2.6" />
    </Svg>
  );
}

/** Settings. */
export function SlidersIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 7.6h7.4M17.2 7.6H20M4 16.4h3.4M12.6 16.4H20" />
      <circle cx="14.2" cy="7.6" r="2.4" />
      <circle cx="10" cy="16.4" r="2.4" />
    </Svg>
  );
}

/* --- the four facts ------------------------------------------------------- */

/** What may be spent. */
export function CoinIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.4" />
      <circle cx="12" cy="12" r="3.4" />
    </Svg>
  );
}

/** Something waiting to be decided. */
export function InboxIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20.6 13.4v4.8a1.8 1.8 0 0 1-1.8 1.8H5.2a1.8 1.8 0 0 1-1.8-1.8v-4.8" />
      <path d="M3.4 13.4 5.6 5.4h12.8l2.2 8h-5.3l-1 2h-4.6l-1-2H3.4Z" />
    </Svg>
  );
}

/** The agent's identity, checked rather than assumed. */
export function ShieldCheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.2 19 6v5.3c0 4.3-2.8 7.8-7 9.5-4.2-1.7-7-5.2-7-9.5V6l7-2.8Z" />
      <path d="m9 12.1 2.1 2.1 4.1-4.4" />
    </Svg>
  );
}

/** Frozen: nobody can change it now, including the operator. */
export function LockIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4.6" y="10.4" width="14.8" height="10" rx="2.6" />
      <path d="M8.2 10.4V7.9a3.8 3.8 0 0 1 7.6 0v2.5" />
    </Svg>
  );
}

/* --- actions -------------------------------------------------------------- */

/** A passkey: the one thing that approves money. */
export function FingerprintIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.7 11.6a7.3 7.3 0 0 1 14.6 0" />
      <path d="M8.1 12.6a3.9 3.9 0 0 1 7.8 0v3.3" />
      <path d="M12 12.4v7.4" />
      <path d="M17.7 17.6c.2-.9.3-1.8.3-2.8" />
    </Svg>
  );
}

/** The developer surface. */
export function CodeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9.2 7.6 4.4 12l4.8 4.4M14.8 7.6 19.6 12l-4.8 4.4" />
    </Svg>
  );
}

/** The way out of the app and back to the front door. */
export function HomeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.4 10.5 12 4.3l7.6 6.2v8a1.7 1.7 0 0 1-1.7 1.7H6.1a1.7 1.7 0 0 1-1.7-1.7v-8Z" />
      <path d="M9.7 20.2v-5.3h4.6v5.3" />
    </Svg>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.4 12h14.2" />
      <path d="m13 6.4 5.6 5.6-5.6 5.6" />
    </Svg>
  );
}

/** The disclosure caret. Rotated in CSS when its panel is open. */
export function ChevronRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m9.6 5.6 6.4 6.4-6.4 6.4" />
    </Svg>
  );
}

/** Leaves the app: an explorer, a contract. */
export function ExternalLinkIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13.6 5.4h5v5" />
      <path d="M18.6 5.4 11 13" />
      <path d="M17.2 13.8v3.6a1.8 1.8 0 0 1-1.8 1.8H6.6a1.8 1.8 0 0 1-1.8-1.8V8.6a1.8 1.8 0 0 1 1.8-1.8h3.6" />
    </Svg>
  );
}
