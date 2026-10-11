#!/usr/bin/env bash
#
# Verify the deployed Witness stack so anyone can read the source on a public
# explorer instead of trusting a README.
#
# Two providers, deliberately:
#
#   Sourcify (MonadVision) — needs NO API key. This is the default, then, because
#     "verify the contracts" should not be blocked on a signup. Verified with
#     `exact_match` on 2026-10-11 for all five contracts of the 10143 deployment.
#
#   Monadscan (Etherscan-based) — needs an API key from the explorer. Export
#     MONADSCAN_API_KEY and pass --etherscan as the second argument to also
#     publish there.
#
#   ./verify.sh                 verify on MonadVision (keyless)
#   ./verify.sh --etherscan     also submit to Monadscan (requires MONADSCAN_API_KEY)
#
set -euo pipefail

cd "$(dirname "$0")"

CHAIN="${WITNESS_CHAIN_ID:-10143}"
MANIFEST="deployments/${CHAIN}.json"
SOURCIFY_URL="https://sourcify-api-monad.blockvision.org/"

if [[ ! -f "$MANIFEST" ]]; then
  echo "No manifest at $MANIFEST — deploy first." >&2
  exit 1
fi

if [[ "${1:-}" == "--etherscan" && -z "${MONADSCAN_API_KEY:-}" ]]; then
  echo "MONADSCAN_API_KEY is not set. Get one at https://testnet.monadscan.com (or" >&2
  echo "https://monadscan.com for mainnet) — the Sourcify route needs no key and" >&2
  echo "still makes the source publicly readable, so you can skip this." >&2
  exit 1
fi

# Contract names must be fully qualified: the compiler output is keyed by
# `src/X.sol:X`, and a bare name fails with `contract_not_found_in_compiler_output`.
pairs=$(node -e '
  const m = require("./" + process.argv[1]);
  const c = m.contracts;
  const rows = [
    [c.WitnessIntentRegistry, "src/WitnessIntentRegistry.sol:WitnessIntentRegistry"],
    [c.WitnessVerifier, "src/WitnessVerifier.sol:WitnessVerifier"],
    [c.DemoSafe, "src/DemoSafe.sol:DemoSafe"],
    [c.AgentExecutor, "src/AgentExecutor.sol:AgentExecutor"],
    [c.DemoUSD, "src/DemoUSD.sol:DemoUSD"],
  ];
  process.stdout.write(rows.map((r) => r.join(" ")).join("\n"));
' "$MANIFEST")

while read -r address name; do
  echo "── $name"
  forge verify-contract "$address" "$name" \
    --chain "$CHAIN" \
    --verifier sourcify \
    --verifier-url "$SOURCIFY_URL"

  if [[ "${1:-}" == "--etherscan" ]]; then
    forge verify-contract "$address" "$name" \
      --chain "$CHAIN" \
      --verifier etherscan \
      --etherscan-api-key "$MONADSCAN_API_KEY" \
      --watch
  fi
done <<< "$pairs"

echo
echo "A submitted job is not a verified contract. Check each result:"
echo "  the forge output prints a job URL; it reports exact_match only when the"
echo "  deployed bytecode really matches this source. Do that before saying"
echo "  \"verified\" anywhere."
