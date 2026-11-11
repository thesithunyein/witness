// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {DemoSafe} from "../src/DemoSafe.sol";
import {AgentExecutor} from "../src/AgentExecutor.sol";
import {WitnessIntentRegistry} from "../src/WitnessIntentRegistry.sol";
import {WitnessVerifier} from "../src/WitnessVerifier.sol";
import {P256Verifier} from "../src/libraries/P256Verifier.sol";
import {WebAuthn} from "../src/libraries/WebAuthn.sol";
import {WitnessAction} from "../src/libraries/WitnessAction.sol";
import {IWitnessVerifier, Reason} from "../src/interfaces/IWitness.sol";
import {AssertionVector} from "./vectors/AssertionVector.sol";
import {
    MockMUSD,
    MockBorrowerOperations,
    MockWrongDebtBorrowerOperations
} from "./mocks/MockBorrowerOperations.sol";

/// @title WitnessTroveTest
/// @notice The safe owns a Mezo trove. Opening it, adding collateral, and repaying
///         debt each need the enrolled passkey over that exact action.
///
/// @dev Same discipline as the other suites: real P-256 signatures produced by a
///      Node process over the real digest, verified by the real P256Verifier.
contract WitnessTroveTest is Test {
    MockMUSD musd;
    MockBorrowerOperations bo;
    WitnessIntentRegistry registry;
    P256Verifier p256;
    WitnessVerifier verifier;
    DemoSafe safe;
    AgentExecutor agent;

    address human = address(0xA11CE);
    address attacker = address(0xBAD);
    address operatorKey = address(0x0BE7);
    address feeTo = address(0xFEE);

    string constant RP_ID = "witness-agent.vercel.app";
    string constant ORIGIN = "https://witness-agent.vercel.app";

    uint256 constant BTC_FUNDING = 1e18;
    uint256 constant COLL = 3e16; // 0.03 BTC
    uint256 constant DEBT = 2000e18;
    uint256 constant REPAY = 500e18;
    uint256 constant FEE_BPS = 10;
    bytes32 constant POLICY = keccak256("witness policy v1");
    bytes32 constant CREDENTIAL = keccak256("credential:human-1");

    function setUp() public {
        musd = new MockMUSD();
        bo = new MockBorrowerOperations(musd);
        musd.setMinter(address(bo));

        registry = new WitnessIntentRegistry();
        p256 = new P256Verifier();
        verifier = new WitnessVerifier(address(registry), RP_ID, ORIGIN, address(p256));
        registry.setVerifier(address(verifier));

        safe = new DemoSafe(address(verifier), address(musd));
        agent = new AgentExecutor(payable(address(safe)), operatorKey);

        vm.deal(address(safe), BTC_FUNDING);

        safe.setHuman(human);
        vm.prank(human);
        safe.enrollKey(AssertionVector.QX, AssertionVector.QY);
        safe.setRelayer(address(agent), true);
        safe.setBorrowerOperations(address(bo));
        safe.setFee(feeTo, FEE_BPS);
    }

    // ---------------------------------------------------------------------
    // Open
    // ---------------------------------------------------------------------

    function test_trove_openMintsDebtIntoSafeLessFee() public {
        uint256 id = _intent(DEBT, WitnessAction.TROVE_OPEN);
        WebAuthn.Assertion memory a = _sign(safe.troveOpenHash(id, COLL, DEBT));

        vm.prank(operatorKey);
        agent.openTrove(id, COLL, DEBT, address(0x1), address(0x2), a);

        uint256 fee = (DEBT * FEE_BPS) / 10_000;
        assertEq(bo.coll(address(safe)), COLL, "trove holds the signed collateral");
        assertEq(bo.debt(address(safe)), DEBT, "trove owes the signed debt");
        assertEq(musd.balanceOf(address(safe)), DEBT - fee, "safe keeps the MUSD less the fee");
        assertEq(musd.balanceOf(feeTo), fee, "fee recipient gets 10 bps");
        assertEq(address(safe).balance, BTC_FUNDING - COLL, "BTC left the safe into the trove");
        assertTrue(registry.getIntent(id).consumed, "approval consumed");
        assertEq(bo.lastUpperHint(), address(0x1), "hints are forwarded");
        assertEq(bo.lastLowerHint(), address(0x2), "hints are forwarded");
    }

    function test_trove_openAboveCeilingIsRefusedAndNothingMoves() public {
        uint256 id = _intent(DEBT, WitnessAction.TROVE_OPEN);
        WebAuthn.Assertion memory empty;

        _expectUnauthorized(Reason.OverLimit);
        vm.prank(operatorKey);
        agent.openTrove(id, COLL, DEBT + 1, address(0), address(0), empty);

        assertEq(bo.coll(address(safe)), 0, "no trove");
        assertEq(address(safe).balance, BTC_FUNDING, "no BTC moved");
        assertFalse(registry.getIntent(id).consumed, "a refusal does not burn the approval");
    }

    function test_trove_signedCollateralCannotBeChanged() public {
        uint256 id = _intent(DEBT, WitnessAction.TROVE_OPEN);
        WebAuthn.Assertion memory a = _sign(safe.troveOpenHash(id, COLL, DEBT));

        _expectUnauthorized(Reason.ChallengeMismatch);
        vm.prank(operatorKey);
        agent.openTrove(id, COLL * 2, DEBT, address(0), address(0), a);

        assertEq(bo.coll(address(safe)), 0, "no trove");
    }

    // ---------------------------------------------------------------------
    // Add collateral
    // ---------------------------------------------------------------------

    function test_trove_addCollateralTakesNoFee() public {
        _open();
        uint256 feeBefore = musd.balanceOf(feeTo);

        uint256 id = _intent(COLL, WitnessAction.TROVE_ADD_COLL);
        WebAuthn.Assertion memory a = _sign(safe.troveAddCollHash(id, COLL));

        vm.prank(operatorKey);
        agent.addTroveCollateral(id, COLL, address(0), address(0), a);

        assertEq(bo.coll(address(safe)), COLL * 2, "collateral added");
        assertEq(address(safe).balance, BTC_FUNDING - COLL * 2, "BTC left the safe");
        assertEq(musd.balanceOf(feeTo), feeBefore, "protective action carries no fee");
        assertTrue(registry.getIntent(id).consumed, "approval consumed");
    }

    // ---------------------------------------------------------------------
    // Repay
    // ---------------------------------------------------------------------

    function test_trove_repayBurnsFromSafeAndTakesNoFee() public {
        _open();
        uint256 safeBefore = musd.balanceOf(address(safe));
        uint256 feeBefore = musd.balanceOf(feeTo);

        uint256 id = _intent(REPAY, WitnessAction.TROVE_REPAY);
        WebAuthn.Assertion memory a = _sign(safe.troveRepayHash(id, REPAY));

        vm.prank(operatorKey);
        agent.repayTroveDebt(id, REPAY, address(0), address(0), a);

        assertEq(bo.debt(address(safe)), DEBT - REPAY, "debt reduced by the signed amount");
        assertEq(musd.balanceOf(address(safe)), safeBefore - REPAY, "MUSD burned from the safe");
        assertEq(musd.balanceOf(feeTo), feeBefore, "protective action carries no fee");
    }

    function test_trove_repayReplayIsRefused() public {
        _open();
        uint256 id = _intent(REPAY, WitnessAction.TROVE_REPAY);
        WebAuthn.Assertion memory a = _sign(safe.troveRepayHash(id, REPAY));

        vm.prank(operatorKey);
        agent.repayTroveDebt(id, REPAY, address(0), address(0), a);

        _expectUnauthorized(Reason.AlreadyConsumed);
        vm.prank(operatorKey);
        agent.repayTroveDebt(id, REPAY, address(0), address(0), a);

        assertEq(bo.debt(address(safe)), DEBT - REPAY, "repaid once only");
    }

    function test_trove_repayAboveCeilingIsRefused() public {
        _open();
        uint256 id = _intent(REPAY, WitnessAction.TROVE_REPAY);
        WebAuthn.Assertion memory empty;

        _expectUnauthorized(Reason.OverLimit);
        vm.prank(operatorKey);
        agent.repayTroveDebt(id, REPAY + 1, address(0), address(0), empty);

        assertEq(bo.debt(address(safe)), DEBT, "debt unchanged");
    }

    // ---------------------------------------------------------------------
    // Who can act
    // ---------------------------------------------------------------------

    function test_trove_strangerKeyCannotTouchTheTrove() public {
        _open();
        vm.prank(attacker);
        uint256 id = registry.createIntent(
            address(agent),
            0,
            WitnessAction.TROVE_REPAY,
            REPAY,
            uint64(block.timestamp + 600),
            POLICY,
            CREDENTIAL,
            1,
            2
        );
        WebAuthn.Assertion memory empty;

        vm.expectRevert(DemoSafe.KeyMismatch.selector);
        vm.prank(operatorKey);
        agent.repayTroveDebt(id, REPAY, address(0), address(0), empty);
    }

    function test_trove_onlyTheRelayerCanSubmit() public {
        uint256 id = _intent(REPAY, WitnessAction.TROVE_REPAY);
        bytes32 ah = safe.troveRepayHash(id, REPAY);
        WebAuthn.Assertion memory empty;

        vm.expectRevert(DemoSafe.NotRelayer.selector);
        vm.prank(attacker);
        safe.repayTroveDebt(id, ah, REPAY, address(0), address(0), empty);
    }

    function test_trove_poolApprovalCannotRepay() public {
        _open();
        uint256 id = _intent(REPAY, WitnessAction.SP_DEPOSIT);
        WebAuthn.Assertion memory empty;

        _expectUnauthorized(Reason.ActionTypeMismatch);
        vm.prank(operatorKey);
        agent.repayTroveDebt(id, REPAY, address(0), address(0), empty);
    }

    function test_trove_digestsAreDistinctPerAction() public view {
        bytes32 openH = safe.troveOpenHash(7, COLL, 0);
        bytes32 addH = safe.troveAddCollHash(7, COLL);
        bytes32 repayH = safe.troveRepayHash(7, COLL);
        assertTrue(openH != addH && addH != repayH && openH != repayH, "one tag per action");
        assertTrue(repayH != safe.actionHash(7, address(bo), COLL), "not a transfer digest");
    }

    // ---------------------------------------------------------------------
    // Setup guards
    // ---------------------------------------------------------------------

    function test_trove_unsetBorrowerOperationsRevertsBeforeConsume() public {
        DemoSafe bare = new DemoSafe(address(verifier), address(musd));
        bare.setHuman(human);
        vm.prank(human);
        bare.enrollKey(AssertionVector.QX, AssertionVector.QY);
        bare.setRelayer(address(this), true);

        uint256 id = _intent(REPAY, WitnessAction.TROVE_REPAY);
        WebAuthn.Assertion memory empty;

        vm.expectRevert(DemoSafe.BorrowerOperationsUnset.selector);
        bare.repayTroveDebt(id, bytes32(0), REPAY, address(0), address(0), empty);
        assertFalse(registry.getIntent(id).consumed, "approval not consumed");
    }

    function test_trove_setBorrowerOperationsRejectsWrongDebtToken() public {
        MockWrongDebtBorrowerOperations wrong = new MockWrongDebtBorrowerOperations();
        vm.expectRevert(DemoSafe.WrongDebtToken.selector);
        safe.setBorrowerOperations(address(wrong));
    }

    /// @notice Mezo enforces the EIP-170 code size limit, so the deploy would fail
    ///         if the trove paths pushed either contract over it.
    function test_trove_contractsFitUnderTheCodeSizeLimit() public view {
        assertLe(address(safe).code.length, 24_576, "DemoSafe under EIP-170");
        assertLe(address(agent).code.length, 24_576, "AgentExecutor under EIP-170");
    }

    function test_trove_setBorrowerOperationsFrozenAfterLock() public {
        safe.lockOwnership();
        vm.expectRevert(DemoSafe.Locked.selector);
        safe.setBorrowerOperations(address(bo));
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    function _open() internal {
        uint256 id = _intent(DEBT, WitnessAction.TROVE_OPEN);
        WebAuthn.Assertion memory a = _sign(safe.troveOpenHash(id, COLL, DEBT));
        vm.prank(operatorKey);
        agent.openTrove(id, COLL, DEBT, address(0), address(0), a);
    }

    function _intent(uint256 maxAmount, bytes32 actionType) internal returns (uint256) {
        vm.prank(human);
        return registry.createIntent(
            address(agent),
            0,
            actionType,
            maxAmount,
            uint64(block.timestamp + 600),
            POLICY,
            CREDENTIAL,
            AssertionVector.QX,
            AssertionVector.QY
        );
    }

    function _expectUnauthorized(Reason r) internal {
        vm.expectRevert(abi.encodeWithSelector(IWitnessVerifier.Unauthorized.selector, r));
    }

    /// @notice Ask an independent Node process to sign `challenge` as a passkey would.
    function _sign(bytes32 challenge) internal returns (WebAuthn.Assertion memory a) {
        string[] memory cmd = new string[](5);
        cmd[0] = "node";
        cmd[1] = "../scripts/sign-action.mjs";
        cmd[2] = vm.toString(challenge);
        cmd[3] = string.concat("--rpId=", RP_ID);
        cmd[4] = string.concat("--origin=", ORIGIN);

        bytes memory out = vm.ffi(cmd);
        string[] memory L = _splitLines(out);
        require(L.length >= 6, "sign-action: expected 6 output lines");
        a.authenticatorData = _hexToBytes(L[0]);
        a.clientDataJSON = _hexToBytes(L[1]);
        a.r = _toUint(_hexToBytes(L[2]));
        a.s = _toUint(_hexToBytes(L[3]));
    }

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
