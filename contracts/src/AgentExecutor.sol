// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {WebAuthn} from "./libraries/WebAuthn.sol";
import {DemoSafe} from "./DemoSafe.sol";
import {IERC721Receiver} from "./interfaces/IERC721Receiver.sol";

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
///
/// @dev Deliberately absent: any operator-callable arbitrary-call function.
///      An earlier revision exposed `forward(target, data)` for the operator, which
///      would have let a prompt-injected agent process call anything this contract
///      can reach — including transferring away its own ERC-8004 identity. That is
///      precisely the class of unapproved action Witness exists to prevent, so the
///      only remaining entry point is `forwardAsOwner`, usable once at setup before
///      the operator is ever in play.
contract AgentExecutor is IERC721Receiver {
    DemoSafe public immutable demoSafe;
    address public owner;
    address public operator;

    event OperatorSet(address indexed operator);
    event TransferAttempted(
        uint256 indexed intentId, address indexed operator_, bytes32 actionHash, address to, uint256 amount
    );

    error NotAuthorized();
    error NotOwner();

    /// @dev `payable` because DemoSafe now accepts native MON (it has a receive()).
    constructor(address payable demoSafe_, address operator_) {
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

    /// @notice Attempt to move ERC-20 value out of the safe on the human's behalf.
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

    /// @notice Attempt to move native MON out of the safe on the human's behalf.
    /// @dev Same guarantee as `executeTransfer`, against a different action tag, so
    ///      an ERC-20 approval can never be replayed as a native payment.
    function executeTransferNative(
        uint256 intentId,
        address to,
        uint256 amount,
        WebAuthn.Assertion calldata assertion
    ) external onlyOperator returns (bytes32 actionHash) {
        actionHash = demoSafe.nativeActionHash(intentId, to, amount);
        emit TransferAttempted(intentId, msg.sender, actionHash, to, amount);
        demoSafe.executeNative(intentId, actionHash, to, amount, assertion);
    }

    /// @notice Accept the ERC-8004 identity token when the registry mints it.
    ///
    /// @dev Required, and not a formality: the ERC-8004 Identity Registry mints the
    ///      agent identity with `_safeMint`, so a contract that does not implement
    ///      this hook cannot own an agent identity at all — the registration reverts
    ///      after the token has already been minted. That is exactly what happened
    ///      on the first deployment attempt of this revision, and it is why this
    ///      hook is here rather than being left out as an unused surface.
    ///
    ///      Deliberately unrestricted: receiving an NFT grants this contract no
    ///      authority over anything, and every outbound path still requires a
    ///      human passkey signature. Restricting it to one registry address would
    ///      make the agent identity undeletable and the executor un-upgradable for
    ///      no security gain.
    function onERC721Received(address, address, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return IERC721Receiver.onERC721Received.selector;
    }

    /// @notice Controller-level forward, for one-time setup like registering the
    ///         agent identity (which the operator must not be able to redo).
    /// @dev Low-level by design: the ERC-8004 registry ABI has variants across
    ///      versions, and hardcoding a signature we have not verified against the
    ///      deployed registry would be worse than forwarding calldata verbatim.
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
