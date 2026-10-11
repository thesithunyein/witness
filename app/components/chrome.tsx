/*
 * Chrome shared by both pages.
 *
 * The navigation lives in the app bar now, so it has to be one component: the
 * product page puts its tabs in it, the developer page puts a single link back.
 * It is presentation only, no state, no hooks, so either page can render it.
 */
import type { ReactNode } from "react";

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
  children,
}: {
  /** Chain the app is configured against. Undefined while the config loads. */
  chainId?: number;
  /** True once the deployment froze its trust-critical settings. */
  locked?: boolean;
  /** Right-hand controls, before the chain readout. */
  actions?: ReactNode;
  /** The nav row. Omitted, the bar is a single row. */
  children?: ReactNode;
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
          {actions}
          <span className="pill" title="The chain this deployment is configured against">
            <span className="pill__dot" aria-hidden />
            {chain}
          </span>
        </div>
      </div>

      {children ? <div className="appbar__nav">{children}</div> : null}
    </header>
  );
}
