// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {WitnessVerifier} from "../src/WitnessVerifier.sol";

/// @notice Update the relying party (rpId/origin) the verifier enforces, and keep
///         the deployments manifest in agreement — the browser config and the
///         on-chain check MUST match, so one command updates both.
///
///         Use this when the deployed hostname differs from what the stack was
///         first deployed with (which it will: the platform's actual host is not
///         always what you would construct from the project id).
///
/// Env:
///   DEPLOYER_PRIVATE_KEY  required; must be the verifier owner
///   RP_ID                 e.g. site-abc123.freebuff.page
///   ORIGIN                e.g. https://site-abc123.freebuff.page
contract SetRelyingParty is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        string memory rpId = vm.envString("RP_ID");
        string memory origin = vm.envString("ORIGIN");

        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        string memory json = vm.readFile(path);

        address verifierAddr = vm.parseJsonAddress(json, ".contracts.WitnessVerifier");

        vm.startBroadcast(pk);
        WitnessVerifier(verifierAddr).setRelyingParty(rpId, origin);
        vm.stopBroadcast();

        // Rewrite the manifest so the app build reads the same values the chain now
        // enforces. Every other field is preserved from the existing manifest.
        string memory c = "contracts";
        vm.serializeAddress(c, "DemoUSD", vm.parseJsonAddress(json, ".contracts.DemoUSD"));
        vm.serializeAddress(c, "WitnessIntentRegistry", vm.parseJsonAddress(json, ".contracts.WitnessIntentRegistry"));
        vm.serializeAddress(c, "WitnessVerifier", verifierAddr);
        vm.serializeAddress(c, "DemoSafe", vm.parseJsonAddress(json, ".contracts.DemoSafe"));
        string memory contractsJson = vm.serializeAddress(c, "AgentExecutor", vm.parseJsonAddress(json, ".contracts.AgentExecutor"));

        string memory root = "witness";
        vm.serializeUint(root, "chainId", block.chainid);
        vm.serializeAddress(root, "deployer", vm.parseJsonAddress(json, ".deployer"));
        vm.serializeString(root, "rpId", rpId);
        vm.serializeString(root, "origin", origin);
        vm.serializeString(root, "contracts", contractsJson);
        vm.serializeAddress(root, "erc8004IdentityRegistry", vm.parseJsonAddress(json, ".erc8004IdentityRegistry"));
        string memory out = vm.serializeString(root, "safeFunding", vm.parseJsonString(json, ".safeFunding"));

        vm.writeFile(path, out);

        console.log("Relying party updated on chain", block.chainid);
        console.log("  rpId  ", rpId);
        console.log("  origin", origin);
        console.log("manifest:", path);
    }
}
