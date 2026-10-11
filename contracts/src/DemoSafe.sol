// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {WebAuthn} from "./libraries/WebAuthn.sol";
import {WitnessAction} from "./libraries/WitnessAction.sol";
import {IWitnessVerifier} from "./interfaces/IWitness.sol";
import {IERC20} from "./interfaces/IERC20.sol";

/// @title DemoSafe
/// @notice A minimal counterparty: it holds funds and has exactly ONE outbound path.
///
/// @dev This contract is where the protocol's central claim stops being a claim.
///
///      "An agent cannot take a high-stakes action unless the human approved that
///      exact action" is only true if the contract holding the value enforces it.
///      A check that lives in the agent's own code proves nothing — the agent
///      could simply not call it. So the funds here can only leave via `execute`,
///      which requires a passkey signature over a digest binding this contract,
///      this chain, this recipient, and this exact amount.
///
///      Note there is no `onlyOwner` or `onlyAgent` gate on `execute`. That is
///      intentional: authorization IS the access control. Any caller may attempt
///      it, and any caller fails unless they are the intent's registered agent
///      wallet AND hold a signature the human actually produced. A malicious agent
///      that bypasses AgentExecutor entirely still cannot move a single token.
contract DemoSafe {
    IWitnessVerifier public immutable verifier;
    IERC20 public immutable token;
    address public owner;

    event AuthorizedTransfer(
        uint256 indexed intentId,
        address indexed actor,
        bytes32 indexed actionHash,
        address to,
        uint256 amount
    );
    event Funded(address indexed from, uint256 amount);

    error HashMismatch();
    error TransferFailed();
    error NotOwner();

    constructor(address verifier_, address token_) {
        verifier = IWitnessVerifier(verifier_);
        token = IERC20(token_);
        owner = msg.sender;
    }

    /// @notice The exact digest a human must sign to authorize a transfer from here.
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

    /// @notice The only way value leaves this contract.
    /// @param expectedActionHash The digest the caller believes was authorized. It is
    ///        recomputed and compared, so a caller cannot smuggle in a digest that
    ///        does not describe the action actually being performed.
    function execute(
        uint256 intentId,
        bytes32 expectedActionHash,
        address to,
        uint256 amount,
        WebAuthn.Assertion calldata assertion
    ) external returns (bytes32 actionHash_) {
        actionHash_ = actionHash(intentId, to, amount);
        if (actionHash_ != expectedActionHash) revert HashMismatch();

        // Reverts with Unauthorized(reason) when the human did not approve this.
        verifier.authorizeAndConsume(
            intentId, WitnessAction.TRANSFER, actionHash_, amount, msg.sender, assertion
        );

        emit AuthorizedTransfer(intentId, msg.sender, actionHash_, to, amount);
        if (!token.transfer(to, amount)) revert TransferFailed();
    }

    function fund(uint256 amount) external {
        if (!token.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        emit Funded(msg.sender, amount);
    }

    function balance() external view returns (uint256) {
        return token.balanceOf(address(this));
    }

    function transferOwnership(address newOwner) external {
        if (msg.sender != owner) revert NotOwner();
        owner = newOwner;
    }
}
