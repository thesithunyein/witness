/*
 * Chrome shared by every screen.
 *
 * Two rules, both learned from operating this thing:
 *
 *   the brand goes home. A mark in the corner that goes to the screen you are
 *   already on is decoration. This one points at /, the same place the browser's
 *   back button should mean, and the explicit Home link beside it exists because
 *   a logo is not a label: on a phone, a reader who has never seen the mark
 *   cannot tell where it goes.
 *
 *   section navigation is not in here. The app's sections are a rail on a
 *   desktop and a bar at the bottom of a phone, so they belong to the app's own
 *   frame, not to a component the developer page also renders. This bar is the
 *   same everywhere: who you are, where you can go back to, what chain you are on.
 */
import type { ReactNode } from "react";
import { HomeIcon } from "@/components/icons";

/**
 * The mark: the logo file itself, not a redrawing of it.
 *
 * public/logo.png is the same file the tab icon (`icons.icon` in layout.tsx),
 * the static bundle and the README all point at, so the tab, the bar and the
 * README cannot drift apart.
 */
export function Mark() {
  return <img className="mark" src="/logo.png" alt="" width={30} height={30} />;
}

export function AppBar({
  chainId,
  locked,
  actions,
}: {
  /** Chain the app is configured against. Undefined while the config loads. */
  chainId?: number;
  /** True once the deployment froze its trust-critical settings. */
  locked?: boolean;
  /** Right-hand controls, after Home and before the chain readout. */
  actions?: ReactNode;
}) {
  const chain = chainId ? (chainId === 143 ? "Monad · 143" : "Testnet · 10143") : "Connecting…";

  return (
    <header className="appbar">
      <div className="appbar__top">
        <a className="brand" href="/">
          <Mark />
          <span>
            <span className="brand-name">Witness</span>
            <span className="brand-sub">
              {locked ? "Configuration frozen" : "Monad testnet"}
            </span>
          </span>
        </a>

        <div className="masthead-right">
          <a className="micro micro--icon home-link" href="/">
            <HomeIcon size={13} />
            <span>Home</span>
          </a>
          {actions}
          <span className="pill" title="The chain this deployment is configured against">
            <span className="pill__dot" aria-hidden />
            {chain}
          </span>
        </div>
      </div>
    </header>
  );
}
