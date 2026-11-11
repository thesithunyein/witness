// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {WebAuthn} from "./libraries/WebAuthn.sol";
import {WitnessAction} from "./libraries/WitnessAction.sol";
import {IWitnessVerifier} from "./interfaces/IWitness.sol";
import {IStabilityPool} from "./interfaces/IStabilityPool.sol";
import {IBorrowerOperations} from "./interfaces/IBorrowerOperations.sol";
import {IERC20} from "./interfaces/IERC20.sol";
import {WitnessIntentRegistry} from "./WitnessIntentRegistry.sol";

/// @notice A minimal counterparty: it holds funds and refuses to move them unless
///         the enrolled human's passkey signed that exact action, and the caller
///         is an allowlisted relayer (the AgentExecutor).
///
/// @dev Outbound paths: ERC-20 transfer, native transfer, Stability Pool deposit,
///      Stability Pool withdraw, and three actions on a Mezo trove the safe owns:
///      open, add collateral, repay. Every path checks the bound key before the
///      verifier runs, so a stranger who registers their own P-256 key cannot
///      drain the safe. A per-approval fee, in bps, is taken from the signed
///      amount when `feeBps` is non-zero. The signed amount is the gross debit.
///      Adding collateral and repaying debt protect the trove, so they carry no fee.
contract DemoSafe {
    uint256 public constant MAX_FEE_BPS = 100;
    uint256 public constant FEE_DENOMINATOR = 10_000;

    IWitnessVerifier public immutable verifier;
    WitnessIntentRegistry public immutable registry;
    IERC20 public immutable token;
    address public owner;

    /// @dev The only human whose intents can move funds, and the passkey they enrolled.
    address public human;
    uint256 public enrolledQx;
    uint256 public enrolledQy;
    bool public keyEnrolled;

    /// @dev Callers allowed to submit an already-signed action. Not an authorizer.
    mapping(address => bool) public isRelayer;

    address public stabilityPool;
    address public borrowerOperations;
    address public feeRecipient;
    uint256 public feeBps;

    /// @dev Ownership exists only to finish setup. It grants no power over funds
    ///      once locked. `enrollKey` stays available to `human` after the lock.
    bool public ownershipLocked;

    /// @dev Local reentrancy guard, so the native path does not depend on an
    ///      external dependency for its safety.
    uint256 private _locked = 1;

    event AuthorizedTransfer(
        uint256 indexed intentId,
        address indexed actor,
        bytes32 indexed actionHash,
        address to,
        uint256 amount
    );
    event AuthorizedNativeTransfer(
        uint256 indexed intentId,
        address indexed actor,
        bytes32 indexed actionHash,
        address to,
        uint256 amount
    );
    event Funded(address indexed from, uint256 amount);
    event OwnershipLocked();
    event HumanSet(address indexed human);
    event HumanKeyEnrolled(address indexed human, uint256 qx, uint256 qy);
    event RelayerSet(address indexed relayer, bool allowed);
    event StabilityPoolSet(address indexed pool);
    event FeeSet(address indexed recipient, uint256 feeBps);
    event FeeCollected(address indexed to, uint256 amount);
    event StabilityDeposited(
        uint256 indexed intentId,
        address indexed actor,
        bytes32 indexed actionHash,
        uint256 net,
        uint256 fee
    );
    event StabilityWithdrawn(
        uint256 indexed intentId,
        address indexed actor,
        bytes32 indexed actionHash,
        uint256 amount,
        uint256 fee
    );
    event BorrowerOperationsSet(address indexed borrowerOperations);
    event TroveOpened(
        uint256 indexed intentId,
        address indexed actor,
        bytes32 indexed actionHash,
        uint256 collateral,
        uint256 debt,
        uint256 fee
    );
    event TroveCollateralAdded(
        uint256 indexed intentId,
        address indexed actor,
        bytes32 indexed actionHash,
        uint256 collateral
    );
    event TroveRepaid(
        uint256 indexed intentId, address indexed actor, bytes32 indexed actionHash, uint256 amount
    );

    error HashMismatch();
    error TransferFailed();
    error NotOwner();
    error Locked();
    error Reentrant();
    error NotBound();
    error NotHuman();
    error AlreadyEnrolled();
    error KeyMismatch();
    error NotRelayer();
    error StabilityPoolUnset();
    error FeeTooHigh();
    error FeeRecipientUnset();
    error BorrowerOperationsUnset();
    error WrongDebtToken();

    modifier nonReentrant() {
        if (_locked != 1) revert Reentrant();
        _locked = 2;
        _;
        _locked = 1;
    }

    constructor(address verifier_, address token_) {
        verifier = IWitnessVerifier(verifier_);
        registry = WitnessIntentRegistry(verifier.intentRegistry());
        token = IERC20(token_);
        owner = msg.sender;
    }

    /// @dev Accepts the native coin (BTC on Mezo): funding, and collateral returned by Mezo.
    receive() external payable {
        emit Funded(msg.sender, msg.value);
    }

    // ---------------------------------------------------------------------
    // Digests
    // ---------------------------------------------------------------------

    /// @notice The exact digest a human must sign to authorize an ERC-20 transfer.
    /// @dev Exposed so the browser can feed it to the passkey as the challenge, and
    ///      so tests and judges can reproduce it independently.
    function actionHash(uint256 intentId, address to, uint256 amount)
        public
        view
        returns (bytes32)
    {
        return WitnessAction.transferHash(
            block.chainid, address(this), intentId, address(token), to, amount
        );
    }

    /// @notice The exact digest a human must sign to authorize a MON transfer.
    function nativeActionHash(uint256 intentId, address to, uint256 amount)
        public
        view
        returns (bytes32)
    {
        return WitnessAction.nativeHash(block.chainid, address(this), intentId, to, amount);
    }

    // ---------------------------------------------------------------------
    // Value movement. Every path is relayer-gated and key-bound.
    // ---------------------------------------------------------------------

    /// @notice Move an ERC-20 out. Only a human-approved action succeeds.
    /// @param expectedActionHash The digest the caller believes was authorized. It is
    ///        recomputed and compared, so a caller cannot smuggle in a digest that
    ///        does not describe the action actually being performed.
    function execute(
        uint256 intentId,
        bytes32 expectedActionHash,
        address to,
        uint256 amount,
        WebAuthn.Assertion calldata assertion
    ) external nonReentrant returns (bytes32 actionHash_) {
        _assertRelayer();
        _assertBoundKey(intentId);
        actionHash_ = actionHash(intentId, to, amount);
        if (actionHash_ != expectedActionHash) revert HashMismatch();

        verifier.authorizeAndConsume(
            intentId, WitnessAction.TRANSFER, actionHash_, amount, msg.sender, assertion
        );

        emit AuthorizedTransfer(intentId, msg.sender, actionHash_, to, amount);
        uint256 net = _collectFee(amount);
        if (!token.transfer(to, net)) revert TransferFailed();
    }

    /// @notice Move native MON out. Only a human-approved action succeeds.
    /// @dev Separate action-type tag from `execute`, so an ERC-20 approval cannot
    ///      be replayed as a native payment. The approval is consumed before the
    ///      external call, and the transfer is guarded, so a hostile recipient
    ///      cannot re-enter and spend a second time.
    function executeNative(
        uint256 intentId,
        bytes32 expectedActionHash,
        address to,
        uint256 amount,
        WebAuthn.Assertion calldata assertion
    ) external nonReentrant returns (bytes32 actionHash_) {
        _assertRelayer();
        _assertBoundKey(intentId);
        actionHash_ = nativeActionHash(intentId, to, amount);
        if (actionHash_ != expectedActionHash) revert HashMismatch();

        verifier.authorizeAndConsume(
            intentId, WitnessAction.TRANSFER_NATIVE, actionHash_, amount, msg.sender, assertion
        );

        emit AuthorizedNativeTransfer(intentId, msg.sender, actionHash_, to, amount);
        uint256 fee = (amount * feeBps) / FEE_DENOMINATOR;
        uint256 net = amount - fee;
        if (fee > 0) {
            if (feeRecipient == address(0)) revert FeeRecipientUnset();
            (bool feeOk,) = feeRecipient.call{value: fee}("");
            if (!feeOk) revert TransferFailed();
            emit FeeCollected(feeRecipient, fee);
        }
        (bool ok,) = to.call{value: net}("");
        if (!ok) revert TransferFailed();
    }

    function stabilityDepositHash(uint256 intentId, uint256 amount) public view returns (bytes32) {
        return WitnessAction.hash(
            block.chainid,
            address(this),
            intentId,
            WitnessAction.SP_DEPOSIT,
            address(token),
            stabilityPool,
            amount
        );
    }

    function stabilityWithdrawHash(uint256 intentId, uint256 amount) public view returns (bytes32) {
        return WitnessAction.hash(
            block.chainid,
            address(this),
            intentId,
            WitnessAction.SP_WITHDRAW,
            address(token),
            stabilityPool,
            amount
        );
    }

    /// @notice Deposit MUSD into the configured Stability Pool.
    /// @dev The signed `amount` is the gross debit. The fee stays out of the pool.
    function depositToStabilityPool(
        uint256 intentId,
        bytes32 expectedActionHash,
        uint256 amount,
        WebAuthn.Assertion calldata assertion
    ) external nonReentrant returns (bytes32 actionHash_) {
        _assertRelayer();
        _assertBoundKey(intentId);
        if (stabilityPool == address(0)) revert StabilityPoolUnset();
        actionHash_ = stabilityDepositHash(intentId, amount);
        if (actionHash_ != expectedActionHash) revert HashMismatch();

        verifier.authorizeAndConsume(
            intentId, WitnessAction.SP_DEPOSIT, actionHash_, amount, msg.sender, assertion
        );

        uint256 net = _collectFee(amount);
        if (net > 0) {
            if (!token.approve(stabilityPool, 0)) revert TransferFailed();
            if (!token.approve(stabilityPool, net)) revert TransferFailed();
            IStabilityPool(stabilityPool).provideToSP(net);
            if (!token.approve(stabilityPool, 0)) revert TransferFailed();
        }
        emit StabilityDeposited(intentId, msg.sender, actionHash_, net, amount - net);
    }

    /// @notice Pull MUSD back from the Stability Pool into this safe.
    /// @dev Fee is taken from what the pool actually returned. The rest stays here.
    function withdrawFromStabilityPool(
        uint256 intentId,
        bytes32 expectedActionHash,
        uint256 amount,
        WebAuthn.Assertion calldata assertion
    ) external nonReentrant returns (bytes32 actionHash_) {
        _assertRelayer();
        _assertBoundKey(intentId);
        if (stabilityPool == address(0)) revert StabilityPoolUnset();
        actionHash_ = stabilityWithdrawHash(intentId, amount);
        if (actionHash_ != expectedActionHash) revert HashMismatch();

        verifier.authorizeAndConsume(
            intentId, WitnessAction.SP_WITHDRAW, actionHash_, amount, msg.sender, assertion
        );

        uint256 beforeBal = token.balanceOf(address(this));
        IStabilityPool(stabilityPool).withdrawFromSP(amount);
        uint256 received = token.balanceOf(address(this)) - beforeBal;
        uint256 net = _collectFee(received);
        emit StabilityWithdrawn(intentId, msg.sender, actionHash_, received, received - net);
    }

    // ---------------------------------------------------------------------
    // Mezo trove owned by this safe
    // ---------------------------------------------------------------------

    /// @notice Digest to open the safe's trove with `collateral` BTC and `debt` MUSD.
    /// @dev The intent ceiling applies to `debt`. Hints are not signed: they only
    ///      position the trove in Mezo's sorted list and cannot change the amounts,
    ///      the owner, or where the MUSD goes.
    function troveOpenHash(uint256 intentId, uint256 collateral, uint256 debt)
        public
        view
        returns (bytes32)
    {
        return WitnessAction.troveHash(
            block.chainid,
            address(this),
            intentId,
            WitnessAction.TROVE_OPEN,
            borrowerOperations,
            collateral,
            debt
        );
    }

    /// @notice Digest to add `collateral` BTC to the safe's trove. Ceiling applies to it.
    function troveAddCollHash(uint256 intentId, uint256 collateral) public view returns (bytes32) {
        return WitnessAction.troveHash(
            block.chainid,
            address(this),
            intentId,
            WitnessAction.TROVE_ADD_COLL,
            borrowerOperations,
            collateral,
            0
        );
    }

    /// @notice Digest to repay `amount` MUSD of the safe's trove debt. Ceiling applies to it.
    function troveRepayHash(uint256 intentId, uint256 amount) public view returns (bytes32) {
        return WitnessAction.troveHash(
            block.chainid,
            address(this),
            intentId,
            WitnessAction.TROVE_REPAY,
            borrowerOperations,
            0,
            amount
        );
    }

    /// @notice Open a trove owned by this safe. BTC collateral leaves the safe into
    ///         the trove; the borrowed MUSD arrives here, less the fee.
    function openTrove(
        uint256 intentId,
        bytes32 expectedActionHash,
        uint256 collateral,
        uint256 debt,
        address upperHint,
        address lowerHint,
        WebAuthn.Assertion calldata assertion
    ) external nonReentrant returns (bytes32 actionHash_) {
        _assertRelayer();
        _assertBoundKey(intentId);
        if (borrowerOperations == address(0)) revert BorrowerOperationsUnset();
        actionHash_ = troveOpenHash(intentId, collateral, debt);
        if (actionHash_ != expectedActionHash) revert HashMismatch();

        verifier.authorizeAndConsume(
            intentId, WitnessAction.TROVE_OPEN, actionHash_, debt, msg.sender, assertion
        );

        uint256 beforeBal = token.balanceOf(address(this));
        IBorrowerOperations(borrowerOperations).openTrove{value: collateral}(
            debt, upperHint, lowerHint
        );
        uint256 received = token.balanceOf(address(this)) - beforeBal;
        uint256 net = _collectFee(received);
        emit TroveOpened(intentId, msg.sender, actionHash_, collateral, debt, received - net);
    }

    /// @notice Add BTC collateral from this safe to its trove. No fee.
    function addTroveCollateral(
        uint256 intentId,
        bytes32 expectedActionHash,
        uint256 collateral,
        address upperHint,
        address lowerHint,
        WebAuthn.Assertion calldata assertion
    ) external nonReentrant returns (bytes32 actionHash_) {
        _assertRelayer();
        _assertBoundKey(intentId);
        if (borrowerOperations == address(0)) revert BorrowerOperationsUnset();
        actionHash_ = troveAddCollHash(intentId, collateral);
        if (actionHash_ != expectedActionHash) revert HashMismatch();

        verifier.authorizeAndConsume(
            intentId, WitnessAction.TROVE_ADD_COLL, actionHash_, collateral, msg.sender, assertion
        );

        IBorrowerOperations(borrowerOperations).addColl{value: collateral}(upperHint, lowerHint);
        emit TroveCollateralAdded(intentId, msg.sender, actionHash_, collateral);
    }

    /// @notice Repay the safe's trove debt with MUSD the safe holds. No fee.
    /// @dev Mezo burns the MUSD from this safe directly, so no approval is needed.
    function repayTroveDebt(
        uint256 intentId,
        bytes32 expectedActionHash,
        uint256 amount,
        address upperHint,
        address lowerHint,
        WebAuthn.Assertion calldata assertion
    ) external nonReentrant returns (bytes32 actionHash_) {
        _assertRelayer();
        _assertBoundKey(intentId);
        if (borrowerOperations == address(0)) revert BorrowerOperationsUnset();
        actionHash_ = troveRepayHash(intentId, amount);
        if (actionHash_ != expectedActionHash) revert HashMismatch();

        verifier.authorizeAndConsume(
            intentId, WitnessAction.TROVE_REPAY, actionHash_, amount, msg.sender, assertion
        );

        IBorrowerOperations(borrowerOperations).repayMUSD(amount, upperHint, lowerHint);
        emit TroveRepaid(intentId, msg.sender, actionHash_, amount);
    }

    function _assertRelayer() internal view {
        if (!isRelayer[msg.sender]) revert NotRelayer();
    }

    /// @dev A missing intent is left for the verifier, which reports `NoSuchIntent`.
    ///      An intent enrolled under any other human or key is refused here.
    function _assertBoundKey(uint256 intentId) internal view {
        if (!keyEnrolled || human == address(0)) revert NotBound();
        WitnessIntentRegistry.Intent memory it = registry.getIntent(intentId);
        if (it.user == address(0)) return;
        if (it.user != human || it.qx != enrolledQx || it.qy != enrolledQy) revert KeyMismatch();
    }

    /// @dev Sends the fee from this contract. Returns the net that remains of `amount`.
    function _collectFee(uint256 amount) internal returns (uint256 net) {
        uint256 fee = (amount * feeBps) / FEE_DENOMINATOR;
        net = amount - fee;
        if (fee == 0) return net;
        if (feeRecipient == address(0)) revert FeeRecipientUnset();
        if (!token.transfer(feeRecipient, fee)) revert TransferFailed();
        emit FeeCollected(feeRecipient, fee);
    }

    // ---------------------------------------------------------------------
    // Funding and views
    // ---------------------------------------------------------------------

    function fund(uint256 amount) external {
        if (!token.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        emit Funded(msg.sender, amount);
    }

    function balance() external view returns (uint256) {
        return token.balanceOf(address(this));
    }

    function nativeBalance() external view returns (uint256) {
        return address(this).balance;
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function transferOwnership(address newOwner) external {
        if (ownershipLocked) revert Locked();
        if (msg.sender != owner) revert NotOwner();
        owner = newOwner;
    }

    /// @notice Permanently give up admin setters. The enrolled human can still
    ///         call `enrollKey` if they have not enrolled yet.
    function lockOwnership() external {
        if (msg.sender != owner) revert NotOwner();
        if (ownershipLocked) revert Locked();
        ownershipLocked = true;
        emit OwnershipLocked();
    }

    function setHuman(address human_) external {
        if (msg.sender != owner) revert NotOwner();
        if (ownershipLocked) revert Locked();
        if (keyEnrolled) revert AlreadyEnrolled();
        if (human_ == address(0)) revert NotHuman();
        human = human_;
        emit HumanSet(human_);
    }

    /// @notice Bind the one passkey allowed to move funds. Callable only by `human`,
    ///         once, including after ownership is locked.
    function enrollKey(uint256 qx, uint256 qy) external {
        if (human == address(0) || msg.sender != human) revert NotHuman();
        if (keyEnrolled) revert AlreadyEnrolled();
        if (qx == 0 || qy == 0) revert KeyMismatch();
        enrolledQx = qx;
        enrolledQy = qy;
        keyEnrolled = true;
        emit HumanKeyEnrolled(human, qx, qy);
    }

    function setRelayer(address relayer, bool allowed) external {
        if (msg.sender != owner) revert NotOwner();
        if (ownershipLocked) revert Locked();
        if (relayer == address(0)) revert NotRelayer();
        isRelayer[relayer] = allowed;
        emit RelayerSet(relayer, allowed);
    }

    function setStabilityPool(address pool) external {
        if (msg.sender != owner) revert NotOwner();
        if (ownershipLocked) revert Locked();
        if (pool == address(0)) revert StabilityPoolUnset();
        stabilityPool = pool;
        emit StabilityPoolSet(pool);
    }

    /// @notice Point the safe at Mezo's BorrowerOperations. Refuses a deployment
    ///         whose debt token is not the token this safe holds.
    function setBorrowerOperations(address borrowerOperations_) external {
        if (msg.sender != owner) revert NotOwner();
        if (ownershipLocked) revert Locked();
        if (borrowerOperations_ == address(0)) revert BorrowerOperationsUnset();
        if (IBorrowerOperations(borrowerOperations_).musd() != address(token)) {
            revert WrongDebtToken();
        }
        borrowerOperations = borrowerOperations_;
        emit BorrowerOperationsSet(borrowerOperations_);
    }

    /// @param bps Fee skimmed from the signed gross amount. 10 = 0.10%. Max 100 (1%).
    function setFee(address recipient, uint256 bps) external {
        if (msg.sender != owner) revert NotOwner();
        if (ownershipLocked) revert Locked();
        if (bps > MAX_FEE_BPS) revert FeeTooHigh();
        if (bps > 0 && recipient == address(0)) revert FeeRecipientUnset();
        feeRecipient = recipient;
        feeBps = bps;
        emit FeeSet(recipient, bps);
    }
}
