/*
 * Icons.
 *
 * The glyphs come from lucide, the same set the rest of the ecosystem uses, and
 * this file is only the adapter: it fixes one grid (size), one stroke weight and
 * one colour rule so eighteen icons cannot drift into eighteen styles, and it
 * keeps the app's semantic names so a call site says what the icon means, not
 * which drawing it happens to be. Swapping a drawing is a one line change here,
 * not a hunt through the screens.
 *
 * Rules the set follows:
 *   one weight      1.75 stroke, currentColor only. An icon never carries its
 *                   own palette and never sets its own thickness.
 *   one meaning     a name is used for one idea in this app, everywhere. Agents
 *                   is a bot, Settings is a control panel, never a crosshair.
 *   decorative      every icon here is aria-hidden. The label beside it is the
 *                   text a screen reader reads, never the icon.
 */
import type { ComponentType } from "react";
import {
  Activity,
  ArrowRight,
  Bot,
  Check,
  ChevronRight,
  CircleCheck,
  Clock,
  CodeXml,
  Coins,
  ExternalLink,
  Fingerprint,
  House,
  Inbox,
  KeyRound,
  Lock,
  Settings2,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";

type IconProps = {
  /** Rendered square size in px. 16 is the body default, 13 to 15 in chips. */
  size?: number;
  className?: string;
};

/** The subset of lucide's props this adapter sets, so the mapper stays typed. */
type Glyph = ComponentType<{
  size?: number | string;
  strokeWidth?: number | string;
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
  focusable?: boolean | "true" | "false";
}>;

/** One place that decides how every icon is drawn. */
function icon(GlyphComponent: Glyph) {
  return function Icon({ size = 16, className }: IconProps) {
    return (
      <GlyphComponent
        size={size}
        strokeWidth={1.75}
        className={className}
        aria-hidden="true"
        focusable="false"
      />
    );
  };
}

/* --- decisions ------------------------------------------------------------ */

/** A decision that went through. */
export const CheckIcon = icon(Check);

/** A decision that was refused. */
export const XIcon = icon(X);

/* --- the four sections ---------------------------------------------------- */

/** Approvals. */
export const CheckCircleIcon = icon(CircleCheck);

/** Activity: a decision trail. */
export const PulseIcon = icon(Activity);

/** Agents: an autonomous process acting for you. */
export const BotIcon = icon(Bot);

/** Settings: the control panel, not a slider and not a crosshair. */
export const SettingsIcon = icon(Settings2);

/* --- the four facts ------------------------------------------------------- */

/** What may be spent. */
export const CoinIcon = icon(Coins);

/** Something waiting to be decided. */
export const InboxIcon = icon(Inbox);

/** The agent's identity, checked rather than assumed. */
export const ShieldCheckIcon = icon(ShieldCheck);

/** Frozen: nobody can change it now, including the operator. */
export const LockIcon = icon(Lock);

/* --- actions -------------------------------------------------------------- */

/** A passkey: the one thing that approves money. */
export const FingerprintIcon = icon(Fingerprint);

/** The developer surface. */
export const CodeIcon = icon(CodeXml);

/** The way out of the app and back to the front door. */
export const HomeIcon = icon(House);

export const ArrowRightIcon = icon(ArrowRight);

/** The disclosure caret. Rotated in CSS when its panel is open. */
export const ChevronRightIcon = icon(ChevronRight);

/** Leaves the app: an explorer, a contract. */
export const ExternalLinkIcon = icon(ExternalLink);

/** Settings rows: what a passkey is, what is stored, what can be removed. */
export const KeyIcon = icon(KeyRound);
export const TrashIcon = icon(Trash2);
export const ClockIcon = icon(Clock);

/**
 * Neither yes nor no: a state worth knowing, not a verdict.
 *
 * Drawn here rather than taken from the set because it is a filled dot, not a
 * stroked ring, and the difference is what makes a quiet row read as quiet.
 */
export function DotIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="4.2" fill="currentColor" />
    </svg>
  );
}
