// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {WebAuthn} from "./libraries/WebAuthn.sol";
import {DemoSafe} from "./DemoSafe.sol";

/// @title AgentExecutor
/// @notice The on-chain identity of the AI agent, and its entry point for acting.
///
/// @dev Why the agent is a contract rather than an EOA:
///
///      The verifier binds an action to the intent's registered `agentWallet`, and
///      the ERC-8004 identity check requires `ownerOf(agentId) == agentWallet`.
///      Making the executor the agent wallet means the agent's *identity* (the
///      ERC-8004 token) and its *authority* (the human's intent) are both bound to
///      the same address, so neither can be swapped out independently.
///
///      The `operator` is the off-chain key (the agent process) allowed to drive
///      this executor. The operator can trigger an action, but it can never
///      manufacture the human's approval: that requires the passkey.
contract AgentExecutor {
    DemoSafe public immutable demoSafe;
    address public owner;
    address public operator;

    event OperatorSet(address indexed operator);
    event TransferAttempted(
        uint256 indexed intentId, address indexed operator_, bytes32 actionHash, address to, uint256 amount
    );

    error NotAuthorized();
    error NotOwner();

    constructor(address demoSafe_, address operator_) {
        demoSafe = DemoSafe(demoSafe_);
        owner = msg.sender;
        operator = operator_;
    }

    modifier onlyOperator() {
        if (msg.sender != operator && msg.sender != owner) revert NotAuthorized();
        _;
    }

    function setOperator(address operator_) external {
        if (msg.sender != owner) revert NotOwner();
        operator = operator_;
        emit OperatorSet(operator_);
    }

    /// @notice Attempt to move value out of the safe on behalf of the human.
    /// @dev Succeeds only when the assertion is a genuine passkey signature over
    ///      this exact action. There is no privileged path: `msg.sender` here is
    ///      the AgentExecutor itself once DemoSafe is reached, so the Witness check
    ///      is what decides, not this contract's access control.
    function executeTransfer(
        uint256 intentId,
        address to,
        uint256 amount,
        WebAuthn.Assertion calldata assertion
    ) external onlyOperator returns (bytes32 actionHash) {
        actionHash = demoSafe.actionHash(intentId, to, amount);
        emit TransferAttempted(intentId, msg.sender, actionHash, to, amount);
        demoSafe.execute(intentId, actionHash, to, amount, assertion);
    }

    /// @notice Passthrough so this contract (not an operator EOA) can own an
    ///         ERC-8004 agent identity, keeping identity and authority aligned.
    /// @dev Low-level by design: the ERC-8004 registry ABI has variants across
    ///      versions, and hardcoding a signature we have not verified against the
    ///      deployed registry would be worse than forwarding calldata verbatim.
    function forward(address target, bytes calldata callData)
        external
        onlyOperator
        returns (bytes memory)
    {
        (bool ok, bytes memory ret) = target.call(callData);
        require(ok, "AgentExecutor: forward failed");
        return ret;
    }

    /// @notice Controller-level forward, for one-time setup like registering the
    ///         agent identity (which the operator should not be able to redo).
    function forwardAsOwner(address target, bytes calldata callData)
        external
        returns (bytes memory)
    {
        if (msg.sender != owner) revert NotOwner();
        (bool ok, bytes memory ret) = target.call(callData);
        require(ok, "AgentExecutor: forward failed");
        return ret;
    }
}
