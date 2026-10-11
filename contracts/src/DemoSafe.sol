// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {WebAuthn} from "./libraries/WebAuthn.sol";
import {WitnessAction} from "./libraries/WitnessAction.sol";
import {IWitnessVerifier} from "./interfaces/IWitness.sol";
import {IERC20} from "./interfaces/IERC20.sol";

/// @title DemoSafe
/// @notice A minimal counterparty: it holds funds and has exactly TWO outbound
///         paths, both of which require a human passkey signature over the exact
///         action — `execute` for an ERC-20, `executeNative` for MON.
///
/// @dev This contract is where the protocol's central claim stops being a claim.
///
///      "An agent cannot take a high-stakes action unless the human approved that
///      exact action" is only true if the contract holding the value enforces it.
///      A check that lives in the agent's own code proves nothing — the agent
///      could simply not call it. So value can only leave via `execute` /
///      `executeNative`, which require a passkey signature over a digest binding
///      this contract, this chain, this recipient, and this exact amount.
///
///      Note there is no `onlyOwner` or `onlyAgent` gate on either path. That is
///      intentional: authorization IS the access control. Any caller may attempt
///      it, and any caller fails unless they are the intent's registered agent
///      wallet AND hold a signature the human actually produced. A malicious agent
///      that bypasses AgentExecutor entirely still cannot move a single token.
contract DemoSafe {
    IWitnessVerifier public immutable verifier;
    IERC20 public immutable token;
    address public owner;

    /// @dev Ownership exists only to hand the contract to another admin during
    ///      setup; it grants no power over funds. It can be frozen permanently.
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

    error HashMismatch();
    error TransferFailed();
    error NotOwner();
    error Locked();
    error Reentrant();

    modifier nonReentrant() {
        if (_locked != 1) revert Reentrant();
        _locked = 2;
        _;
        _locked = 1;
    }

    constructor(address verifier_, address token_) {
        verifier = IWitnessVerifier(verifier_);
        token = IERC20(token_);
        owner = msg.sender;
    }

    /// @dev Accepts MON, so anyone can fund the safe for the native demo.
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
    // The only two ways value leaves
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
        actionHash_ = actionHash(intentId, to, amount);
        if (actionHash_ != expectedActionHash) revert HashMismatch();

        // Reverts with Unauthorized(reason) when the human did not approve this.
        // This consumes the one-time approval BEFORE value moves.
        verifier.authorizeAndConsume(
            intentId, WitnessAction.TRANSFER, actionHash_, amount, msg.sender, assertion
        );

        emit AuthorizedTransfer(intentId, msg.sender, actionHash_, to, amount);
        if (!token.transfer(to, amount)) revert TransferFailed();
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
        actionHash_ = nativeActionHash(intentId, to, amount);
        if (actionHash_ != expectedActionHash) revert HashMismatch();

        verifier.authorizeAndConsume(
            intentId,
            WitnessAction.TRANSFER_NATIVE,
            actionHash_,
            amount,
            msg.sender,
            assertion
        );

        emit AuthorizedNativeTransfer(intentId, msg.sender, actionHash_, to, amount);
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
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

    /// @notice Permanently give up the ability to change the owner.
    /// @dev Called at the end of deployment. Nothing in this contract's fund path
    ///      consults `owner`, so freezing it removes the last admin surface without
    ///      touching authorization.
    function lockOwnership() external {
        if (msg.sender != owner) revert NotOwner();
        if (ownershipLocked) revert Locked();
        ownershipLocked = true;
        emit OwnershipLocked();
    }
}
