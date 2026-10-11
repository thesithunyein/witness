import { NextResponse } from "next/server";
import { loadDeployment } from "@/lib/server/deployment";

export const dynamic = "force-dynamic";

/**
 * The browser gets addresses from the server rather than from the query string,
 * so a visitor cannot redirect the app at arbitrary contracts.
 *
 * `rpId`/`origin` are what the passkey is bound to. They MUST match the origin
 * judges actually visit, or every passkey prompt fails — the most common way a
 * WebAuthn demo dies during judging.
 */
export async function GET() {
  try {
    const d = loadDeployment();
    const zero = "0x0000000000000000000000000000000000000000";
    const identityConfigured = d.erc8004IdentityRegistry !== zero;
    const agentId = d.agentId ? BigInt(d.agentId) : 0n;

    return NextResponse.json(
      {
        chainId: d.chainId,
        rpId: d.rpId,
        origin: d.origin,
        contracts: d.contracts,
        erc8004IdentityRegistry: d.erc8004IdentityRegistry,
        /** Where the demo agent's payments settle, from the deployment manifest. */
        payee: d.payee ?? null,
        agentName: d.agentName ?? "Research Agent",
        agentURI: d.agentURI ?? null,
        agentId: agentId.toString(),
        /**
         * Enforcement is only real when a registry is configured AND the intent
         * names a non-zero agent id. Both are surfaced so the UI can state plainly
         * which of those is true rather than implying the stronger case.
         */
        identityEnforced: identityConfigured && agentId !== 0n,
        configurationLocked: d.configurationLocked ?? false,
        explorer:
          d.chainId === 143 ? "https://monadscan.com" : "https://testnet.monadscan.com",
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "deployment manifest unavailable" },
      { status: 503 }
    );
  }
}
