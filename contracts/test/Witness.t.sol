// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {DemoUSD} from "../src/DemoUSD.sol";
import {DemoSafe} from "../src/DemoSafe.sol";
import {AgentExecutor} from "../src/AgentExecutor.sol";
import {WitnessIntentRegistry} from "../src/WitnessIntentRegistry.sol";
import {WitnessVerifier} from "../src/WitnessVerifier.sol";
import {P256Verifier} from "../src/libraries/P256Verifier.sol";
import {WebAuthn} from "../src/libraries/WebAuthn.sol";
import {WitnessAction} from "../src/libraries/WitnessAction.sol";
import {IWitnessVerifier, Reason} from "../src/interfaces/IWitness.sol";
import {AssertionVector} from "./vectors/AssertionVector.sol";
import {MockERC8004Identity} from "./mocks/MockERC8004Identity.sol";

/// @title WitnessTest
/// @notice End-to-end tests of the Witness protocol.
///
/// @dev These tests are deliberately not mocked at the cryptography layer. Each
///      test computes the real canonical action digest, has a separate Node process
///      produce a genuine P-256 signature over that exact digest (the same bytes a
///      platform authenticator signs), and submits it to contracts that verify it
///      through a real secp256r1 implementation (the deployed P256Verifier, not a
///      mock and not a precompile the target chain does not have). So a passing
///      happy-path test means the whole path is genuinely wired:
///      digest -> passkey -> P-256 verify -> funds.
///
///      The negative tests matter as much as the positive one. A system that says
///      "authorized" in the good case proves little; what matters is that a
///      prompt-injected amount, a forged signature, a replay, an expired or
///      revoked approval, and a different agent ALL fail, each with a distinct
///      reason a wallet can show a human.
contract WitnessTest is Test {
    DemoUSD dusd;
    WitnessIntentRegistry registry;
    P256Verifier p256;
    WitnessVerifier verifier;
    DemoSafe safe;
    AgentExecutor agent;
    AgentExecutor rogueAgent;

    address human = address(0xA11CE);
    address alice = address(0xA11C);
    address attacker = address(0xBAD);

    /// @dev The off-chain key that drives the agent process.
    address operatorKey = address(0x0BE7);

    // Must match the fixture in ./vectors/AssertionVector.sol, which is generated
    // from contracts/deployments/<chain>.json by scripts/gen-assertion.mjs.
    string constant RP_ID = "witness-agent.vercel.app";
    string constant ORIGIN = "https://witness-agent.vercel.app";

    uint256 constant LIMIT = 1e18; // 1 DemoUSD
    uint256 constant SAFE_FUNDING = 100e18;
    bytes32 constant POLICY = keccak256("witness policy v1");
    bytes32 constant CREDENTIAL = keccak256("credential:human-1");
    bytes32 constant OTHER_ORIGIN = keccak256("x");

    uint256 intentId;

    function setUp() public {
        dusd = new DemoUSD();
        registry = new WitnessIntentRegistry();
        // The chain the contracts target has no native P-256 precompile, so the
        // signature check runs through this stateless verifier instead.
        p256 = new P256Verifier();
        verifier = new WitnessVerifier(address(registry), RP_ID, ORIGIN, address(p256));
        registry.setVerifier(address(verifier));

        safe = new DemoSafe(address(verifier), address(dusd));
        agent = new AgentExecutor(payable(address(safe)), operatorKey);

        // A second agent, to prove approvals are bound to one specific agent.
        rogueAgent = new AgentExecutor(payable(address(safe)), operatorKey);

        dusd.mint(address(this), SAFE_FUNDING);
        dusd.approve(address(safe), type(uint256).max);
        safe.fund(SAFE_FUNDING);
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    function _createIntent(uint64 expiry, uint256 agentId) internal returns (uint256) {
        vm.prank(human);
        return registry.createIntent(
            address(agent),
            agentId,
            WitnessAction.TRANSFER,
            LIMIT,
            expiry,
            POLICY,
            CREDENTIAL,
            AssertionVector.QX,
            AssertionVector.QY
        );
    }

    function _defaultExpiry() internal view returns (uint64) {
        return uint64(block.timestamp + 600);
    }

    /// @notice Ask an independent Node process to sign `challenge` as a passkey
    ///         would, returning the parsed assertion.
    function _sign(bytes32 challenge, string memory o1, string memory o2, string memory o3)
        internal
        returns (WebAuthn.Assertion memory a)
    {
        string[] memory opts = new string[](5);
        uint256 n;
        if (bytes(o1).length > 0) opts[n++] = o1;
        if (bytes(o2).length > 0) opts[n++] = o2;
        if (bytes(o3).length > 0) opts[n++] = o3;

        // The signing script defaults its RP identity to whatever the deployment
        // manifest currently says. Tests must assert against their own constants,
        // not against a live deployment, so pin them here unless the caller asked
        // for a different one (the negative tests deliberately do).
        if (!_hasOption(opts, n, "--rpId=")) opts[n++] = string.concat("--rpId=", RP_ID);
        if (!_hasOption(opts, n, "--origin=")) opts[n++] = string.concat("--origin=", ORIGIN);

        string[] memory cmd = new string[](3 + n);
        cmd[0] = "node";
        cmd[1] = "../scripts/sign-action.mjs";
        cmd[2] = vm.toString(challenge);
        for (uint256 i = 0; i < n; ++i) {
            cmd[3 + i] = opts[i];
        }
        return _parseAssertion(vm.ffi(cmd));
    }

    function _sign(bytes32 challenge) internal returns (WebAuthn.Assertion memory) {
        return _sign(challenge, "", "", "");
    }

    /// @dev True when one of the first `n` options already sets `prefix`.
    function _hasOption(string[] memory opts, uint256 n, string memory prefix)
        internal
        pure
        returns (bool)
    {
        bytes memory p = bytes(prefix);
        for (uint256 i = 0; i < n; ++i) {
            bytes memory o = bytes(opts[i]);
            if (o.length < p.length) continue;
            bool hit = true;
            for (uint256 j = 0; j < p.length; ++j) {
                if (o[j] != p[j]) {
                    hit = false;
                    break;
                }
            }
            if (hit) return true;
        }
        return false;
    }

    function _parseAssertion(bytes memory out) internal pure returns (WebAuthn.Assertion memory a) {
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
    // 0. The primitive itself
    // ---------------------------------------------------------------------

    /// @notice Documents the foundation: the deployed P-256 verifier accepts a real
    ///         signature and rejects a tampered one.
    /// @dev This used to call the native precompile at 0x0100, which the target
    ///      chain does not have. Same 160-byte input, same uint256 output shape.
    function test_primitive_p256VerifierAcceptsRealSignatureOnly() public view {
        (bool ok, bytes memory out) = address(p256).staticcall(AssertionVector.PRECOMPILE_INPUT);
        assertTrue(ok, "staticcall should succeed");
        assertEq(out.length, 32, "verifier returns uint256");
        assertEq(abi.decode(out, (uint256)), 1, "valid P-256 signature must verify");

        // flip one bit of r -> must be rejected
        uint256 tamperedR = AssertionVector.R ^ 1;
        (bool ok2, bytes memory out2) = address(p256)
            .staticcall(
                abi.encodePacked(
                    AssertionVector.MESSAGE_HASH,
                    tamperedR,
                    AssertionVector.S,
                    AssertionVector.QX,
                    AssertionVector.QY
                )
            );
        assertTrue(ok2, "call itself succeeds");
        assertEq(out2.length, 32, "verifier answers with a word");
        assertEq(abi.decode(out2, (uint256)), 0, "tampered signature must be rejected");
    }

    // ---------------------------------------------------------------------
    // 1. Happy path
    // ---------------------------------------------------------------------

    function test_happyPath_passkeyApprovedTransferExecutes() public {
        intentId = _createIntent(_defaultExpiry(), 0);

        bytes32 ah = safe.actionHash(intentId, alice, LIMIT);
        WebAuthn.Assertion memory a = _sign(ah);

        vm.prank(operatorKey);
        agent.executeTransfer(intentId, alice, LIMIT, a);

        assertEq(dusd.balanceOf(alice), LIMIT, "recipient gets the approved amount");
        assertEq(safe.balance(), SAFE_FUNDING - LIMIT, "safe releases exactly that amount");
        assertTrue(registry.getIntent(intentId).consumed, "one-time approval is consumed");
        assertFalse(registry.isActive(intentId), "consumed intent is no longer active");
    }

    function test_happyPath_verifierReportsAllowedViaView() public {
        intentId = _createIntent(_defaultExpiry(), 0);
        bytes32 ah = safe.actionHash(intentId, alice, LIMIT);
        WebAuthn.Assertion memory a = _sign(ah);

        Reason r = verifier.check(intentId, WitnessAction.TRANSFER, ah, LIMIT, address(agent), a);
        assertEq(uint256(r), uint256(Reason.Allowed), "preflight should read Allowed");
    }

    // ---------------------------------------------------------------------
    // 2. The prompt-injection scenario
    // ---------------------------------------------------------------------

    /// @notice The centrepiece: the human approved 1 DemoUSD, the agent was
    ///         injected into moving 10, and the transfer cannot happen.
    function test_blocked_injectedAmountExceedsApproval() public {
        intentId = _createIntent(_defaultExpiry(), 0);

        // The human genuinely approves a 1 DemoUSD transfer to this recipient.
        bytes32 approved = safe.actionHash(intentId, attacker, LIMIT);
        WebAuthn.Assertion memory a = _sign(approved);

        // Injected instruction: send 10x the approved amount.
        vm.prank(operatorKey);
        _expectUnauthorized(Reason.OverLimit);
        agent.executeTransfer(intentId, attacker, 10e18, a);

        assertEq(dusd.balanceOf(attacker), 0, "attacker receives nothing");
        assertEq(safe.balance(), SAFE_FUNDING, "safe untouched");
    }

    /// @notice Same approval, different recipient: the signature does not transfer
    ///         to an action the human never saw.
    function test_blocked_approvalDoesNotCoverDifferentRecipient() public {
        intentId = _createIntent(_defaultExpiry(), 0);
        bytes32 approved = safe.actionHash(intentId, alice, LIMIT);
        WebAuthn.Assertion memory a = _sign(approved);

        // Redirect the same amount to the attacker instead of alice.
        vm.prank(operatorKey);
        _expectUnauthorized(Reason.ChallengeMismatch);
        agent.executeTransfer(intentId, attacker, LIMIT, a);
    }

    /// @notice A different amount within the cap is still a different action.
    function test_blocked_differentAmountIsDifferentAction() public {
        intentId = _createIntent(_defaultExpiry(), 0);
        bytes32 approved = safe.actionHash(intentId, alice, 0.5e18);
        WebAuthn.Assertion memory a = _sign(approved);

        vm.prank(operatorKey);
        _expectUnauthorized(Reason.ChallengeMismatch);
        agent.executeTransfer(intentId, alice, LIMIT, a);
    }

    // ---------------------------------------------------------------------
    // 3. Forging the human's approval
    // ---------------------------------------------------------------------

    /// @notice The agent signs with its own key. The challenge matches perfectly;
    ///         the key does not. Because the verifier uses the public key the human
    ///         enrolled — never a caller-supplied one — this cannot pass.
    function test_blocked_agentCannotForgeApprovalWithItsOwnKey() public {
        intentId = _createIntent(_defaultExpiry(), 0);
        bytes32 ah = safe.actionHash(intentId, alice, LIMIT);

        WebAuthn.Assertion memory forged = _sign(ah, "--key=witness:agent:key:9", "", "");

        vm.prank(operatorKey);
        _expectUnauthorized(Reason.BadSignature);
        agent.executeTransfer(intentId, alice, LIMIT, forged);
        assertEq(dusd.balanceOf(alice), 0);
    }

    /// @notice Tampering with a genuine signature invalidates it.
    function test_blocked_tamperedSignatureRejected() public {
        intentId = _createIntent(_defaultExpiry(), 0);
        bytes32 ah = safe.actionHash(intentId, alice, LIMIT);
        WebAuthn.Assertion memory a = _sign(ah);
        a.r = a.r ^ 1;

        vm.prank(operatorKey);
        _expectUnauthorized(Reason.BadSignature);
        agent.executeTransfer(intentId, alice, LIMIT, a);
    }

    // ---------------------------------------------------------------------
    // 4. Binding to one agent, one use, one window
    // ---------------------------------------------------------------------

    /// @notice A different agent, even holding a genuinely human-signed approval
    ///         for the same action, is rejected: consent names one agent.
    function test_blocked_differentAgentCannotUseTheApproval() public {
        intentId = _createIntent(_defaultExpiry(), 0);
        bytes32 ah = safe.actionHash(intentId, alice, LIMIT);
        WebAuthn.Assertion memory a = _sign(ah);

        vm.prank(operatorKey);
        _expectUnauthorized(Reason.WrongAgent);
        rogueAgent.executeTransfer(intentId, alice, LIMIT, a);
    }

    /// @notice Bypassing the agent's own contract and calling the safe directly
    ///         does not help: the safe is the enforcement point.
    function test_blocked_bypassingExecutorIsRejected() public {
        intentId = _createIntent(_defaultExpiry(), 0);
        bytes32 ah = safe.actionHash(intentId, alice, LIMIT);
        WebAuthn.Assertion memory a = _sign(ah);

        vm.prank(attacker);
        _expectUnauthorized(Reason.WrongAgent);
        safe.execute(intentId, ah, alice, LIMIT, a);
        assertEq(dusd.balanceOf(alice), 0, "funds are unreachable from outside");
    }

    function test_blocked_replayAfterConsumption() public {
        intentId = _createIntent(_defaultExpiry(), 0);
        bytes32 ah = safe.actionHash(intentId, alice, LIMIT);
        WebAuthn.Assertion memory a = _sign(ah);

        vm.prank(operatorKey);
        agent.executeTransfer(intentId, alice, LIMIT, a);
        assertEq(dusd.balanceOf(alice), LIMIT);

        // Same approval, second attempt.
        vm.prank(operatorKey);
        _expectUnauthorized(Reason.AlreadyConsumed);
        agent.executeTransfer(intentId, alice, LIMIT, a);
        assertEq(dusd.balanceOf(alice), LIMIT, "no double spend");
    }

    function test_blocked_afterRevocation() public {
        intentId = _createIntent(_defaultExpiry(), 0);
        bytes32 ah = safe.actionHash(intentId, alice, LIMIT);
        WebAuthn.Assertion memory a = _sign(ah);

        vm.prank(human);
        registry.revokeIntent(intentId);

        vm.prank(operatorKey);
        _expectUnauthorized(Reason.Revoked);
        agent.executeTransfer(intentId, alice, LIMIT, a);
        assertEq(dusd.balanceOf(alice), 0, "revoked approval moves nothing");
    }

    function test_blocked_afterExpiry() public {
        intentId = _createIntent(uint64(block.timestamp + 60), 0);
        bytes32 ah = safe.actionHash(intentId, alice, LIMIT);
        WebAuthn.Assertion memory a = _sign(ah);

        skip(120);

        vm.prank(operatorKey);
        _expectUnauthorized(Reason.Expired);
        agent.executeTransfer(intentId, alice, LIMIT, a);
    }

    function test_blocked_unknownIntent() public {
        bytes32 ah = safe.actionHash(999, alice, LIMIT);
        WebAuthn.Assertion memory a = _sign(ah);

        vm.prank(operatorKey);
        _expectUnauthorized(Reason.NoSuchIntent);
        agent.executeTransfer(999, alice, LIMIT, a);
    }

    /// @notice The digest is recomputed from the actual arguments, so a caller
    ///         cannot supply a hash that does not describe the action performed.
    function test_blocked_actionHashMustMatchPerformedAction() public {
        intentId = _createIntent(_defaultExpiry(), 0);
        bytes32 honest = safe.actionHash(intentId, alice, LIMIT);
        WebAuthn.Assertion memory a = _sign(honest);

        bytes32 wrong = keccak256("not-the-action");
        vm.prank(operatorKey);
        vm.expectRevert(DemoSafe.HashMismatch.selector);
        safe.execute(intentId, wrong, alice, LIMIT, a);
    }

    // ---------------------------------------------------------------------
    // 5. WebAuthn semantics (not just "a signature exists")
    // ---------------------------------------------------------------------

    function test_blocked_wrongOrigin() public {
        intentId = _createIntent(_defaultExpiry(), 0);
        bytes32 ah = safe.actionHash(intentId, alice, LIMIT);
        // Genuine key, genuine challenge, but presented from a different origin.
        WebAuthn.Assertion memory a = _sign(ah, "--origin=https://evil.example", "", "");

        vm.prank(operatorKey);
        _expectUnauthorized(Reason.OriginMismatch);
        agent.executeTransfer(intentId, alice, LIMIT, a);
    }

    function test_blocked_wrongRelyingParty() public {
        intentId = _createIntent(_defaultExpiry(), 0);
        bytes32 ah = safe.actionHash(intentId, alice, LIMIT);
        WebAuthn.Assertion memory a = _sign(ah, "--rpId=evil.example", "", "");

        vm.prank(operatorKey);
        _expectUnauthorized(Reason.RpIdMismatch);
        agent.executeTransfer(intentId, alice, LIMIT, a);
    }

    /// @notice A registration ceremony must never authorize an action.
    function test_blocked_registrationCeremonyIsNotAnAssertion() public {
        intentId = _createIntent(_defaultExpiry(), 0);
        bytes32 ah = safe.actionHash(intentId, alice, LIMIT);
        WebAuthn.Assertion memory a = _sign(ah, "--type=webauthn.create", "", "");

        vm.prank(operatorKey);
        _expectUnauthorized(Reason.WrongType);
        agent.executeTransfer(intentId, alice, LIMIT, a);
    }

    /// @notice User presence without user verification is not enough: we require
    ///         the biometric/PIN step, not just "a key was touched".
    function test_blocked_userVerificationRequired() public {
        intentId = _createIntent(_defaultExpiry(), 0);
        bytes32 ah = safe.actionHash(intentId, alice, LIMIT);
        WebAuthn.Assertion memory a = _sign(ah, "--flags=1", "", "");

        vm.prank(operatorKey);
        _expectUnauthorized(Reason.NoUserVerification);
        agent.executeTransfer(intentId, alice, LIMIT, a);
    }

    // ---------------------------------------------------------------------
    // 6. ERC-8004 identity binding
    // ---------------------------------------------------------------------

    /// @notice The agent id is only meaningful if the acting wallet really owns it.
    function test_identity_agentIdOwnershipIsEnforced() public {
        MockERC8004Identity identity = new MockERC8004Identity();
        verifier.setIdentityRegistry(address(identity));

        // 1. Agent owns the identity -> approved action goes through.
        identity.setOwner(1, address(agent));
        intentId = _createIntent(_defaultExpiry(), 1);
        bytes32 ah = safe.actionHash(intentId, alice, LIMIT);
        WebAuthn.Assertion memory a = _sign(ah);

        vm.prank(operatorKey);
        agent.executeTransfer(intentId, alice, LIMIT, a);
        assertEq(dusd.balanceOf(alice), LIMIT, "bound identity authorizes");

        // 2. Identity moves elsewhere -> the same setup must now fail. Without this
        //    check the agentId would be a self-declared label, not an identity.
        identity.setOwner(1, address(0xDEAD));
        intentId = _createIntent(_defaultExpiry(), 1);
        bytes32 ah2 = safe.actionHash(intentId, alice, LIMIT);
        WebAuthn.Assertion memory a2 = _sign(ah2);

        vm.prank(operatorKey);
        _expectUnauthorized(Reason.AgentNotRegistered);
        agent.executeTransfer(intentId, alice, LIMIT, a2);
    }

    /// @notice With no identity registry configured, the agentId check is skipped.
    ///         Stated explicitly so the behaviour is not accidental.
    function test_identity_checkSkippedWhenNoRegistryConfigured() public {
        assertEq(verifier.identityRegistry(), address(0), "default is unset");
        intentId = _createIntent(_defaultExpiry(), 42); // bogus id, unenforced
        bytes32 ah = safe.actionHash(intentId, alice, LIMIT);
        WebAuthn.Assertion memory a = _sign(ah);

        vm.prank(operatorKey);
        agent.executeTransfer(intentId, alice, LIMIT, a);
        assertEq(dusd.balanceOf(alice), LIMIT, "no registry => no identity check");
    }

    // ---------------------------------------------------------------------
    // 7. Registry invariants
    // ---------------------------------------------------------------------

    function test_registry_onlyUserCanRevoke() public {
        intentId = _createIntent(_defaultExpiry(), 0);
        vm.prank(attacker);
        vm.expectRevert(WitnessIntentRegistry.NotUser.selector);
        registry.revokeIntent(intentId);
    }

    function test_registry_onlyVerifierCanConsume() public {
        intentId = _createIntent(_defaultExpiry(), 0);
        vm.prank(attacker);
        vm.expectRevert(WitnessIntentRegistry.NotVerifier.selector);
        registry.markConsumed(intentId, attacker);
    }

    function test_registry_rejectsExpiryInPast() public {
        vm.prank(human);
        vm.expectRevert(WitnessIntentRegistry.ExpiryInPast.selector);
        registry.createIntent(
            address(agent), 0, WitnessAction.TRANSFER, LIMIT, 1, POLICY, CREDENTIAL, 1, 1
        );
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
