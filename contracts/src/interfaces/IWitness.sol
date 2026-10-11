// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {WebAuthn} from "../libraries/WebAuthn.sol";

/// @title Reason
/// @notice Why an action was allowed or rejected.
///
/// @dev This exists deliberately. A bare `require` yields "execution reverted" and
///      throws away the answer the check already computed. Counterparties and
///      wallets need to distinguish "the human never approved this" from
///      "the approval expired" or "this was already spent" — otherwise users are
///      told nothing useful at the exact moment they need it most.
enum Reason {
    Allowed,
    NoSuchIntent,
    Revoked,
    Expired,
    AlreadyConsumed,
    WrongAgent,
    AgentNotRegistered,
    ActionTypeMismatch,
    OverLimit,
    RpIdMismatch,
    NoUserPresence,
    NoUserVerification,
    WrongType,
    ChallengeMismatch,
    OriginMismatch,
    BadSignature
}

/// @title IWitnessVerifier
/// @notice The integration surface. Any contract that wants to accept only
///         human-approved agent actions calls this before acting.
///
/// @dev Two entry points by design:
///        - `check`  is view: preflight from a UI, or a read-only gate.
///        - `authorizeAndConsume` is state-changing: it marks the intent spent so
///          a one-time approval cannot be replayed.
interface IWitnessVerifier {
    error Unauthorized(Reason reason);

    /// @param intentId   The registered permission being exercised.
    /// @param actionType Domain tag, e.g. keccak256("witness.action.transfer").
    /// @param actionHash The canonical digest the human's passkey signed. Binds
    ///                   chain id, the calling contract, the intent, and every
    ///                   action parameter, so an approval cannot be replayed
    ///                   against a different contract, chain, or amount.
    /// @param amount     Value moved, checked against the intent's cap.
    /// @param actor      The agent acting. Must be the intent's registered agent
    ///                   wallet, so one agent cannot spend another's approval.
    function check(
        uint256 intentId,
        bytes32 actionType,
        bytes32 actionHash,
        uint256 amount,
        address actor,
        WebAuthn.Assertion calldata assertion
    ) external view returns (Reason);

    /// @notice Same checks as `check`, but reverts with `Unauthorized(reason)` and
    ///         consumes the intent on success.
    function authorizeAndConsume(
        uint256 intentId,
        bytes32 actionType,
        bytes32 actionHash,
        uint256 amount,
        address actor,
        WebAuthn.Assertion calldata assertion
    ) external returns (Reason);

    function intentRegistry() external view returns (address);
}
