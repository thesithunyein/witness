// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {DemoUSD} from "../src/DemoUSD.sol";
import {DemoSafe} from "../src/DemoSafe.sol";
import {AgentExecutor} from "../src/AgentExecutor.sol";
import {WitnessIntentRegistry} from "../src/WitnessIntentRegistry.sol";
import {WitnessVerifier} from "../src/WitnessVerifier.sol";

/// @notice Deploys the Witness stack and writes a manifest the frontend consumes.
///
/// Env:
///   DEPLOYER_PRIVATE_KEY        required; broadcast key and default operator
///   RP_ID                       default witness.sithunyein.com
///   ORIGIN                      default https://witness.sithunyein.com
///   ERC8004_IDENTITY_REGISTRY   optional; when set, agent-id ownership is enforced
///   DEMO_SAFE_FUNDING           default 1000e18 (DemoUSD units)
///
/// The manifest is written to deployments/<chainid>.json so no address is ever
/// hand-copied between the contracts and the app.
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);

        string memory rpId = vm.envOr("RP_ID", string("witness.sithunyein.com"));
        string memory origin = vm.envOr("ORIGIN", string("https://witness.sithunyein.com"));
        address identityRegistry = vm.envOr("ERC8004_IDENTITY_REGISTRY", address(0));
        uint256 funding = vm.envOr("DEMO_SAFE_FUNDING", uint256(1000e18));

        vm.startBroadcast(pk);

        DemoUSD dusd = new DemoUSD();

        WitnessIntentRegistry registry = new WitnessIntentRegistry();
        WitnessVerifier verifier = new WitnessVerifier(address(registry), rpId, origin);
        registry.setVerifier(address(verifier));
        if (identityRegistry != address(0)) {
            verifier.setIdentityRegistry(identityRegistry);
        }

        DemoSafe safe = new DemoSafe(address(verifier), address(dusd));

        // The agent's authority is bound to a contract, so the ERC-8004 identity and
        // the human's intent both point at the same address (see AgentExecutor docs).
        AgentExecutor agent = new AgentExecutor(address(safe), deployer);

        // Pre-fund the safe so the demo can move real value immediately.
        dusd.mint(address(safe), funding);

        vm.stopBroadcast();

        // Serialize via the cheatcode rather than one giant string.concat, which
        // overflows the stack with this many locals.
        string memory c = "contracts";
        vm.serializeAddress(c, "DemoUSD", address(dusd));
        vm.serializeAddress(c, "WitnessIntentRegistry", address(registry));
        vm.serializeAddress(c, "WitnessVerifier", address(verifier));
        vm.serializeAddress(c, "DemoSafe", address(safe));
        string memory contractsJson = vm.serializeAddress(c, "AgentExecutor", address(agent));

        string memory root = "witness";
        vm.serializeUint(root, "chainId", block.chainid);
        vm.serializeAddress(root, "deployer", deployer);
        vm.serializeString(root, "rpId", rpId);
        vm.serializeString(root, "origin", origin);
        vm.serializeString(root, "contracts", contractsJson);
        vm.serializeAddress(root, "erc8004IdentityRegistry", identityRegistry);
        string memory json = vm.serializeString(root, "safeFunding", vm.toString(funding));

        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        vm.writeFile(path, json);

        console.log("Witness deployed on chain", block.chainid);
        console.log("  DemoUSD              ", address(dusd));
        console.log("  WitnessIntentRegistry", address(registry));
        console.log("  WitnessVerifier      ", address(verifier));
        console.log("  DemoSafe             ", address(safe));
        console.log("  AgentExecutor        ", address(agent));
        console.log("manifest:", path);
    }
}
