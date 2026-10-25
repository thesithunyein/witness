/*
 * Chrome shared by both pages.
 *
 * The navigation lives in the app bar now, so it has to be one component: the
 * product page puts its tabs in it, the developer page puts a single link back.
 * It is presentation only, no state, no hooks, so either page can render it.
 *
 * The bar is one row: brand, the sections, the readouts. The previous version
 * put the nav on a second row, which made the header two rows tall and left the
 * middle of the first one empty at desktop widths. On narrow screens the nav
 * drops to its own row deliberately, which is a layout decision, not a leftover.
 */
import type { ReactNode } from "react";
import { chainFor } from "@/lib/witness";

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
  // Read from the chain table rather than a ternary: this bar was written when
  // every deployment was Monad, and shipped "Testnet · 10143" over a Mezo stack.
  const chainInfo = chainId ? chainFor(chainId) : null;
  const chain = chainInfo ? `${chainInfo.name} · ${chainInfo.id}` : "Connecting…";
  /** Same readout, split so a phone can drop the number and keep the network. */
  const chainName = chainInfo ? chainInfo.name : "Connecting…";
  const chainNumber = chainInfo ? String(chainInfo.id) : null;

  return (
    <header className="appbar">
      <div className="appbar__top">
        <a className="brand" href="/app">
          <Mark />
          <span>
            <span className="brand-name">Witness</span>
            <span className="brand-sub">
              {locked ? "Configuration frozen" : (chainInfo?.name ?? "Testnet")}
            </span>
          </span>
        </a>

        {children ? <div className="appbar__nav">{children}</div> : null}

        <div className="masthead-right">
          {actions}
          <span className="pill" title={`The chain this deployment is configured against: ${chain}`}>
            <span className="pill__dot" aria-hidden />
            {chainName}
            {chainNumber ? <span className="pill__id"> · {chainNumber}</span> : null}
          </span>
        </div>
      </div>
    </header>
  );
}
