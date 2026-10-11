// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {DemoUSD} from "../src/DemoUSD.sol";
import {DemoSafe} from "../src/DemoSafe.sol";
import {AgentExecutor} from "../src/AgentExecutor.sol";
import {WitnessIntentRegistry} from "../src/WitnessIntentRegistry.sol";
import {WitnessVerifier} from "../src/WitnessVerifier.sol";

/// @notice Deploys the Witness stack, registers the agent's ERC-8004 identity,
///         freezes the trust-critical configuration, and writes the single
///         manifest the SDK and the app both read.
///
/// Env:
///   DEPLOYER_PRIVATE_KEY        required; broadcast key and default operator
///   RP_ID                       default witness.sithunyein.com
///   ORIGIN                      default https://witness.sithunyein.com
///   AGENT_NAME                  default "Research Agent"
///   AGENT_URI                   default <ORIGIN>/agent.json
///   ERC8004_IDENTITY_REGISTRY   optional; defaults to the official registry for
///                               the chain (see _defaultIdentityRegistry)
///   DEMO_SAFE_FUNDING           default 1000e18 DemoUSD units
///   DEMO_PAYEE                  default the deployer; the address the demo agent
///                               pays, recorded in the manifest as `payee`
///
/// The manifest is written to deployments/<chainid>.json so no address is ever
/// hand-copied between the contracts, the SDK, and the app.
///
/// @dev Structured as Config + Deployed rather than a dozen locals, because the
///      flat version ran into "stack too deep" the moment the ERC-8004 fields were
///      added. Structs keep the locals few and the intent readable.
contract Deploy is Script {
    struct Config {
        uint256 chainId;
        address deployer;
        string rpId;
        string origin;
        string agentName;
        string agentURI;
        address identityRegistry;
        uint256 funding;
        /// @dev Where the demo agent's payments settle. Recorded in the manifest
        ///      so the request the agent sends names a real, on-chain-visible
        ///      merchant instead of a placeholder. Defaults to the deployer.
        address payee;
    }

    struct Deployed {
        address dusd;
        address registry;
        address verifier;
        address safe;
        address agent;
        /// @dev The minted ERC-8004 identity. 0 when no registry was configured.
        uint256 agentId;
    }

    /// @dev The official ERC-8004 Identity Registry, verified on-chain before use.
    ///      Testnets share one address, mainnets share another (erc-8004/erc-8004-contracts).
    function _defaultIdentityRegistry(uint256 chainId) internal pure returns (address) {
        if (chainId == 10143) return 0x8004A818BFB912233c491871b3d84c89A494BD9e; // Monad testnet
        if (chainId == 143) return 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432; // Monad mainnet
        return address(0);
    }

    function _config() internal view returns (Config memory c) {
        c.chainId = block.chainid;
        c.rpId = vm.envOr("RP_ID", string("witness.sithunyein.com"));
        c.origin = vm.envOr("ORIGIN", string("https://witness.sithunyein.com"));
        c.agentName = vm.envOr("AGENT_NAME", string("Research Agent"));
        c.agentURI = vm.envOr("AGENT_URI", string.concat(c.origin, "/agent.json"));
        c.identityRegistry =
            vm.envOr("ERC8004_IDENTITY_REGISTRY", _defaultIdentityRegistry(c.chainId));
        c.funding = vm.envOr("DEMO_SAFE_FUNDING", uint256(1000e18));
    }

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        Config memory c = _config();
        c.deployer = vm.addr(pk);
        c.payee = vm.envOr("DEMO_PAYEE", c.deployer);

        Deployed memory d = _deploy(pk, c);
        _writeManifest(c, d);

        console.log("Witness deployed on chain", c.chainId);
        console.log("  DemoUSD              ", d.dusd);
        console.log("  WitnessIntentRegistry", d.registry);
        console.log("  WitnessVerifier      ", d.verifier);
        console.log("  DemoSafe             ", d.safe);
        console.log("  AgentExecutor        ", d.agent);
        console.log("  ERC-8004 registry    ", c.identityRegistry);
        console.log("  ERC-8004 agentId     ", d.agentId);
        console.log("  configuration        ", "LOCKED");
    }

    function _deploy(uint256 pk, Config memory c) private returns (Deployed memory d) {
        vm.startBroadcast(pk);

        DemoUSD dusd = new DemoUSD();
        d.dusd = address(dusd);

        WitnessIntentRegistry registry = new WitnessIntentRegistry();
        d.registry = address(registry);

        // The deployer is the relayer that registers permissions on the human's
        // behalf and pays gas. It has no authority over funds.
        WitnessVerifier verifier = new WitnessVerifier(d.registry, c.rpId, c.origin);
        d.verifier = address(verifier);
        registry.setVerifier(d.verifier);

        // A second contract holds native MON for the native path. It is deployed
        // with the same verifier, so the same approval rules govern both assets.
        DemoSafe safe = new DemoSafe(d.verifier, d.dusd);
        d.safe = address(safe);

        // The agent's authority is bound to a contract, so the ERC-8004 identity and
        // the human's intent both point at the same address (see AgentExecutor docs).
        // The operator key is a separate off-chain key; here it is the deployer for
        // local/dev convenience, and is rotated with setOperator on a real deployment.
        AgentExecutor agent = new AgentExecutor(payable(d.safe), c.deployer);
        d.agent = address(agent);

        // Pre-fund the safe so the demo can move real value immediately.
        dusd.mint(d.safe, c.funding);

        // --- ERC-8004: register the agent's identity, owned by the executor ---
        if (c.identityRegistry != address(0)) {
            bytes memory ret = agent.forwardAsOwner(
                c.identityRegistry, abi.encodeWithSignature("register(string)", c.agentURI)
            );
            // The registry returns the new agent id. A call that returns nothing
            // usable leaves the id at 0, which the verifier treats as "no identity
            // claimed" — never as "identity verified".
            if (ret.length >= 32) {
                d.agentId = abi.decode(ret, (uint256));
            }
            // Enforced from here on: an intent naming an agentId only verifies when
            // this executor actually owns that id.
            verifier.setIdentityRegistry(c.identityRegistry);
        }

        // --- Freeze every trust-critical setting ---
        verifier.lockConfiguration();
        registry.lockConfiguration();
        safe.lockOwnership();

        vm.stopBroadcast();
    }

    function _writeManifest(Config memory c, Deployed memory d) private {
        // Serialize via the cheatcode rather than one giant string.concat, which
        // overflows the stack with this many fields.
        string memory contractsKey = "contracts";
        vm.serializeAddress(contractsKey, "DemoUSD", d.dusd);
        vm.serializeAddress(contractsKey, "WitnessIntentRegistry", d.registry);
        vm.serializeAddress(contractsKey, "WitnessVerifier", d.verifier);
        vm.serializeAddress(contractsKey, "DemoSafe", d.safe);
        string memory contractsJson = vm.serializeAddress(contractsKey, "AgentExecutor", d.agent);

        string memory root = "witness";
        vm.serializeUint(root, "chainId", c.chainId);
        vm.serializeAddress(root, "deployer", c.deployer);
        vm.serializeString(root, "rpId", c.rpId);
        vm.serializeString(root, "origin", c.origin);
        vm.serializeString(root, "agentName", c.agentName);
        vm.serializeString(root, "agentURI", c.agentURI);
        vm.serializeUint(root, "agentId", d.agentId);
        vm.serializeAddress(root, "erc8004IdentityRegistry", c.identityRegistry);
        vm.serializeAddress(root, "payee", c.payee);
        vm.serializeString(root, "contracts", contractsJson);
        vm.serializeString(root, "safeFunding", vm.toString(c.funding));
        string memory json = vm.serializeBool(root, "configurationLocked", true);

        string memory path = string.concat("deployments/", vm.toString(c.chainId), ".json");
        vm.writeFile(path, json);
    }
}
