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
    return NextResponse.json(
      {
        chainId: d.chainId,
        rpId: d.rpId,
        origin: d.origin,
        contracts: d.contracts,
        erc8004IdentityRegistry: d.erc8004IdentityRegistry,
        // Surfaced so the UI can state plainly whether it is wired to real
        // passkey verification or running without an identity registry.
        identityEnforced: d.erc8004IdentityRegistry !== "0x0000000000000000000000000000000000000000",
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
