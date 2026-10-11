// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {DemoUSD} from "../src/DemoUSD.sol";
import {DemoSafe} from "../src/DemoSafe.sol";
import {AgentExecutor} from "../src/AgentExecutor.sol";
import {WitnessIntentRegistry} from "../src/WitnessIntentRegistry.sol";
import {WitnessVerifier} from "../src/WitnessVerifier.sol";
import {WebAuthn} from "../src/libraries/WebAuthn.sol";
import {WitnessAction} from "../src/libraries/WitnessAction.sol";
import {IWitnessVerifier, Reason} from "../src/interfaces/IWitness.sol";
import {AssertionVector} from "./vectors/AssertionVector.sol";
import {MockERC8004Identity} from "./mocks/MockERC8004Identity.sol";

/// @title WitnessHardeningTest
/// @notice Tests for the deployment-hardening changes: the native MON path, the
///         one-way configuration locks, and the absence of an operator-callable
///         arbitrary-call escape hatch.
///
/// @dev Same discipline as the main suite: real P-256 signatures produced by a Node
///      process over the real canonical digest, verified through the real precompile.
contract WitnessHardeningTest is Test {
    DemoUSD dusd;
    WitnessIntentRegistry registry;
    WitnessVerifier verifier;
    DemoSafe safe;
    AgentExecutor agent;

    address human = address(0xA11CE);
    address alice = address(0xA11C);
    address attacker = address(0xBAD);
    address operatorKey = address(0x0BE7);

    string constant RP_ID = "witness.sithunyein.com";
    string constant ORIGIN = "https://witness.sithunyein.com";

    uint256 constant LIMIT = 1e18;
    uint256 constant NATIVE_FUNDING = 10e18;
    bytes32 constant POLICY = keccak256("witness policy v1");
    bytes32 constant CREDENTIAL = keccak256("credential:human-1");

    uint256 intentId;

    function setUp() public {
        dusd = new DemoUSD();
        registry = new WitnessIntentRegistry();
        verifier = new WitnessVerifier(address(registry), RP_ID, ORIGIN);
        registry.setVerifier(address(verifier));

        safe = new DemoSafe(address(verifier), address(dusd));
        agent = new AgentExecutor(payable(address(safe)), operatorKey);

        dusd.mint(address(this), 100e18);
        dusd.approve(address(safe), type(uint256).max);
        safe.fund(100e18);

        vm.deal(address(safe), NATIVE_FUNDING);
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    function _createIntent(uint256 maxAmount, bytes32 actionType, uint64 expiry)
        internal
        returns (uint256)
    {
        vm.prank(human);
        return registry.createIntent(
            address(agent),
            0,
            actionType,
            maxAmount,
            expiry,
            POLICY,
            CREDENTIAL,
            AssertionVector.QX,
            AssertionVector.QY
        );
    }

    /// @notice Ask an independent Node process to sign `challenge` as a passkey would.
    function _sign(bytes32 challenge) internal returns (WebAuthn.Assertion memory a) {
        string[] memory cmd = new string[](3);
        cmd[0] = "node";
        cmd[1] = "../scripts/sign-action.mjs";
        cmd[2] = vm.toString(challenge);

        bytes memory out = vm.ffi(cmd);
        string[] memory L = _splitLines(out);
        require(L.length >= 6, "sign-action: expected 6 output lines");
        a.authenticatorData = _hexToBytes(L[0]);
        a.clientDataJSON = _hexToBytes(L[1]);
        a.r = _toUint(_hexToBytes(L[2]));
        a.s = _toUint(_hexToBytes(L[3]));
    }

    function _expectUnauthorized(Reason r) internal {
        vm.expectRevert(abi.encodeWithSelector(IWitnessVerifier.Unauthorized.selector, r));
    }

    // ---------------------------------------------------------------------
    // 1. Native MON path
    // ---------------------------------------------------------------------

    function test_native_happyPath_passkeyApprovedMonTransferExecutes() public {
        intentId = _createIntent(LIMIT, WitnessAction.TRANSFER_NATIVE, uint64(block.timestamp + 600));

        bytes32 ah = safe.nativeActionHash(intentId, alice, LIMIT);
        WebAuthn.Assertion memory a = _sign(ah);

        uint256 before = alice.balance;

        vm.prank(operatorKey);
        agent.executeTransferNative(intentId, alice, LIMIT, a);

        assertEq(alice.balance, before + LIMIT, "recipient receives the approved MON");
        assertEq(address(safe).balance, NATIVE_FUNDING - LIMIT, "safe releases exactly that");
        assertTrue(registry.getIntent(intentId).consumed, "one-time approval consumed");
    }

    /// @notice The centring scenario, native: the human approved 0.5 MON, the agent
    ///         was injected into moving 5, and the payment cannot happen.
    function test_native_blocked_injectedAmountExceedsApproval() public {
        intentId = _createIntent(
            0.5e18, WitnessAction.TRANSFER_NATIVE, uint64(block.timestamp + 600)
        );

        bytes32 approved = safe.nativeActionHash(intentId, attacker, 0.5e18);
        WebAuthn.Assertion memory a = _sign(approved);

        vm.prank(operatorKey);
        _expectUnauthorized(Reason.OverLimit);
        agent.executeTransferNative(intentId, attacker, 5e18, a);

        assertEq(attacker.balance, 0, "attacker receives nothing");
        assertEq(address(safe).balance, NATIVE_FUNDING, "safe untouched");
    }

    /// @notice An ERC-20 approval must not be replayable as a native payment. Both
    ///         actions can have identical recipient and amount; the tag differs.
    function test_native_erc20ApprovalCannotBeReplayedAsNative() public {
        intentId = _createIntent(10e18, WitnessAction.TRANSFER_NATIVE, uint64(block.timestamp + 600));

        // The human genuinely approved an ERC-20 transfer of the same size.
        bytes32 erc20Hash = safe.actionHash(intentId, alice, LIMIT);
        WebAuthn.Assertion memory a = _sign(erc20Hash);

        vm.prank(operatorKey);
        _expectUnauthorized(Reason.ChallengeMismatch);
        agent.executeTransferNative(intentId, alice, LIMIT, a);

        assertEq(address(safe).balance, NATIVE_FUNDING, "no MON moved");
    }

    /// @notice Native intents and ERC-20 intents are different action types, so a
    ///         native intent cannot be spent through the ERC-20 path either.
    function test_native_nativeIntentRejectedOnErc20Path() public {
        intentId = _createIntent(
            LIMIT, WitnessAction.TRANSFER_NATIVE, uint64(block.timestamp + 600)
        );
        bytes32 ah = safe.actionHash(intentId, alice, LIMIT);
        WebAuthn.Assertion memory a = _sign(ah);

        vm.prank(operatorKey);
        _expectUnauthorized(Reason.ActionTypeMismatch);
        agent.executeTransfer(intentId, alice, LIMIT, a);
    }

    /// @notice A genuine approval is still required: no signature, no MON.
    function test_native_blocked_withoutApprovalSignature() public {
        intentId = _createIntent(LIMIT, WitnessAction.TRANSFER_NATIVE, uint64(block.timestamp + 600));

        bytes32 ah = safe.nativeActionHash(intentId, alice, LIMIT);
        // The agent signs with its own key: right digest, wrong key.
        WebAuthn.Assertion memory forged = _sign_withKey(ah);

        vm.prank(operatorKey);
        _expectUnauthorized(Reason.BadSignature);
        agent.executeTransferNative(intentId, alice, LIMIT, forged);
        assertEq(alice.balance, 0);
    }

    function _sign_withKey(bytes32 challenge) internal returns (WebAuthn.Assertion memory a) {
        string[] memory cmd = new string[](4);
        cmd[0] = "node";
        cmd[1] = "../scripts/sign-action.mjs";
        cmd[2] = vm.toString(challenge);
        cmd[3] = "--key=witness:agent:key:9";

        string[] memory L = _splitLines(vm.ffi(cmd));
        require(L.length >= 6, "sign-action: expected 6 output lines");
        a.authenticatorData = _hexToBytes(L[0]);
        a.clientDataJSON = _hexToBytes(L[1]);
        a.r = _toUint(_hexToBytes(L[2]));
        a.s = _toUint(_hexToBytes(L[3]));
    }

    // ---------------------------------------------------------------------
    // 2. One-way configuration locks
    // ---------------------------------------------------------------------

    /// @notice The executor must be able to RECEIVE the ERC-8004 identity token.
    ///
    /// @dev This is a regression test for a real deployment failure: the registry
    ///      mints with `_safeMint`, so the first broadcast of this revision reverted
    ///      at registration after the token was minted, because AgentExecutor had no
    ///      `onERC721Received`. Nothing else in the suite would have caught it short
    ///      of running the deploy, which is precisely why it is asserted here.
    function test_identity_executorCanReceiveTheIdentityMint() public {
        MockERC8004Identity identity = new MockERC8004Identity();

        vm.prank(address(agent));
        uint256 agentId = identity.register("https://witness.sithunyein.com/agent.json");

        assertEq(agentId, 1);
        assertEq(identity.ownerOf(agentId), address(agent));
    }

    /// @notice A contract with no receiver hook cannot own an identity — the mock
    ///         reproduces the real revert, so the test above is not vacuous.
    ///
    /// @dev Asserted through a low-level call because the real revert has no data:
    ///      the registry's hook call cannot be dispatched at all against a contract
    ///      that lacks the function, so it fails before the registry can even return
    ///      its own error. That is the exact failure the first live deploy hit.
    function test_identity_receiverHookIsRequired() public {
        MockERC8004Identity identity = new MockERC8004Identity();
        NoReceiver bad = new NoReceiver();

        (bool ok,) = address(bad).call(abi.encodeCall(NoReceiver.register, (identity)));
        assertFalse(ok, "a contract without the receiver hook must not receive an identity");
        assertEq(identity.ownerOf(1), address(0), "the mint was rolled back");
    }

    /// @notice After the lock, the identity binding can never be switched off.
    function test_lock_identityRegistryCanNoLongerChange() public {
        address registryAddr = address(0x8004);

        verifier.setIdentityRegistry(registryAddr);
        verifier.lockConfiguration();

        vm.expectRevert(WitnessVerifier.Locked.selector);
        verifier.setIdentityRegistry(address(0));
        assertEq(verifier.identityRegistry(), registryAddr, "binding survives the attempt");
    }

    /// @notice After the lock, the accepted relying party can never change.
    function test_lock_relyingPartyCanNoLongerChange() public {
        verifier.lockConfiguration();

        vm.expectRevert(WitnessVerifier.Locked.selector);
        verifier.setRelyingParty("evil.example", "https://evil.example");
        assertEq(verifier.rpId(), RP_ID);
        assertEq(verifier.origin(), ORIGIN);
    }

    /// @notice The lock is one-way: it cannot be unlocked, and cannot be re-run.
    function test_lock_cannotBeUnlockedOrReplayed() public {
        verifier.lockConfiguration();
        assertTrue(verifier.configurationLocked());

        vm.expectRevert(WitnessVerifier.Locked.selector);
        verifier.lockConfiguration();
    }

    function test_lock_onlyOwnerMayLock() public {
        vm.prank(attacker);
        vm.expectRevert(WitnessVerifier.NotOwner.selector);
        verifier.lockConfiguration();

        vm.prank(attacker);
        vm.expectRevert(WitnessIntentRegistry.NotOwner.selector);
        registry.lockConfiguration();

        vm.prank(attacker);
        vm.expectRevert(DemoSafe.NotOwner.selector);
        safe.lockOwnership();
    }

    /// @notice The verifier pointer is the only address that can consume a
    ///         permission, so freezing it removes a denial-of-service surface.
    function test_lock_verifierPointerFrozen() public {
        registry.lockConfiguration();

        vm.expectRevert(WitnessIntentRegistry.Locked.selector);
        registry.setVerifier(attacker);
        assertEq(registry.verifier(), address(verifier));

        vm.expectRevert(WitnessIntentRegistry.Locked.selector);
        registry.transferOwnership(attacker);
    }

    function test_lock_safeOwnershipFrozen() public {
        safe.lockOwnership();

        vm.expectRevert(DemoSafe.Locked.selector);
        safe.transferOwnership(attacker);
        assertEq(safe.owner(), address(this));
    }

    /// @notice Freezing config must not take away the human's own powers. Revocation
    ///         is gated on the intent's author, not on the owner.
    function test_lock_humanCanStillRevokeAfterLock() public {
        registry.lockConfiguration();
        intentId = _createIntent(LIMIT, WitnessAction.TRANSFER, uint64(block.timestamp + 600));

        vm.prank(human);
        registry.revokeIntent(intentId);
        assertTrue(registry.getIntent(intentId).revoked, "human keeps the final word");
    }

    // ---------------------------------------------------------------------
    // 3. No operator escape hatch
    // ---------------------------------------------------------------------

    /// @notice The agent process must have exactly one capability: attempting an
    ///         action the human approved. There is no arbitrary-call entry point it
    ///         can reach, so a prompt-injected agent cannot do anything else with
    ///         this contract's authority — not even move its own ERC-8004 identity.
    function test_noOperatorArbitraryCallSurface() public {
        // The old selector must now hit no function at all.
        bytes memory payload = abi.encodeWithSignature("forward(address,bytes)", attacker, "");

        vm.prank(operatorKey);
        (bool ok, bytes memory ret) = address(agent).call(payload);
        assertFalse(ok, "operator-callable forward must not exist");

        // A contract with no matching function and no fallback returns empty data.
        assertEq(ret.length, 0, "no fallback should swallow the call");
    }

    /// @notice Only the owner may do one-time setup calls on the agent's behalf.
    function test_setupForwardIsOwnerOnly() public {
        vm.prank(operatorKey);
        vm.expectRevert(AgentExecutor.NotOwner.selector);
        agent.forwardAsOwner(address(safe), "");

        vm.prank(attacker);
        vm.expectRevert(AgentExecutor.NotOwner.selector);
        agent.forwardAsOwner(address(safe), "");
    }

    // ---------------------------------------------------------------------
    // Parsing helpers (line and hex decoding, dependency-free on purpose)
    // ---------------------------------------------------------------------

    function _splitLines(bytes memory out) internal pure returns (string[] memory) {
        string[] memory tmp = new string[](8);
        uint256 n;
        uint256 start = 0;
        for (uint256 i = 0; i <= out.length; ++i) {
            if (i == out.length || out[i] == 0x0a) {
                uint256 end = i;
                if (end > start && out[end - 1] == 0x0d) --end;
                if (end > start) {
                    bytes memory slice = new bytes(end - start);
                    for (uint256 j = 0; j < slice.length; ++j) {
                        slice[j] = out[start + j];
                    }
                    tmp[n++] = string(slice);
                }
                start = i + 1;
            }
        }
        string[] memory parts = new string[](n);
        for (uint256 k = 0; k < n; ++k) {
            parts[k] = tmp[k];
        }
        return parts;
    }

    function _hexToBytes(string memory s) internal pure returns (bytes memory) {
        bytes memory b = bytes(s);
        uint256 start = 0;
        if (b.length >= 2 && b[0] == 0x30 && (b[1] == 0x78 || b[1] == 0x58)) start = 2;
        require((b.length - start) % 2 == 0, "hex: odd length");
        uint256 len = (b.length - start) / 2;
        bytes memory outBytes = new bytes(len);
        for (uint256 i = 0; i < len; ++i) {
            outBytes[i] = bytes1(_hexVal(b[start + i * 2]) * 16 + _hexVal(b[start + i * 2 + 1]));
        }
        return outBytes;
    }

    function _hexVal(bytes1 c) internal pure returns (uint8) {
        uint8 v = uint8(c);
        if (v >= 48 && v <= 57) return v - 48;
        if (v >= 97 && v <= 102) return v - 87;
        if (v >= 65 && v <= 70) return v - 55;
        revert("hex: bad char");
    }

    function _toUint(bytes memory b) internal pure returns (uint256 v) {
        require(b.length == 32, "expected 32 bytes");
        assembly {
            v := mload(add(b, 32))
        }
    }
}

/// @notice A contract that tries to register an agent identity without
///         implementing the receiver hook — the shape that made the first deploy
///         of this revision revert.
contract NoReceiver {
    function register(MockERC8004Identity identity) external returns (uint256) {
        return identity.register("https://example.com/agent.json");
    }
}
