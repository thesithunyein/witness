/*
 * Chrome shared by both pages.
 *
 * The navigation lives in the app bar now, so it has to be one component: the
 * product page puts its tabs in it, the developer page puts a single link back.
 * It is presentation only — no state, no hooks — so either page can render it.
 */
import type { ReactNode } from "react";

/** The wordmark's mark: a drawn asterisk, lit by the brand ramp. */
export function Mark() {
  return (
    <svg className="mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="square">
        <line x1="12" y1="2.5" x2="12" y2="21.5" />
        <line x1="2.5" y1="12" x2="21.5" y2="12" />
        <line x1="5.3" y1="5.3" x2="18.7" y2="18.7" />
        <line x1="18.7" y1="5.3" x2="5.3" y2="18.7" />
      </g>
    </svg>
  );
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
