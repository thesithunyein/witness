// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {WebAuthn} from "./libraries/WebAuthn.sol";
import {IWitnessVerifier, Reason} from "./interfaces/IWitness.sol";
import {WitnessIntentRegistry} from "./WitnessIntentRegistry.sol";

/// @title WitnessVerifier
/// @notice Decides whether a specific agent action was approved by the human who
///         holds the passkey — and says exactly why when it was not.
///
/// @dev Verification order is deliberate: cheap semantic checks first, the
///      P-256 signature last. Every rejection path maps to a distinct Reason so a
///      wallet can tell the user "this expired" rather than "transaction failed".
///
///      The `actionHash` handed to the passkey binds, by construction:
///          chain id, the calling contract, the intent id, the action type,
///          the token, the recipient, and the amount.
///      So an approval for "swap 1 USDC on this contract" cannot be replayed
///      against a different contract, a different chain, or a larger amount.
contract WitnessVerifier is IWitnessVerifier {
    /// @notice ERC-8004 Identity Registry on this chain. When set, the agent wallet
    ///         must actually own the agent id it claims, otherwise the identity is
    ///         decorative: any wallet could claim any agent id.
    address public identityRegistry;

    WitnessIntentRegistry public immutable registryContract;

    /// @notice Deployed secp256r1 verifier the passkey signature is checked against.
    /// @dev Immutable on purpose. The chain this stack runs on (Mezo) has no native
    ///      P-256 precompile, so the check is a call to a stateless pure-Solidity
    ///      verifier deployed alongside the rest of the stack. An immutable address
    ///      means the check can never be pointed somewhere else afterwards, which
    ///      is the same guarantee `lockConfiguration` gives the other two settings.
    address public immutable p256Verifier;

    address public owner;

    /// @dev Relying party identity the passkey was created for.
    string public rpId;
    string public origin;

    /// @dev Once true, the two security-critical settings above can never change
    ///      again. See `lockConfiguration`.
    bool public configurationLocked;

    error NotOwner();
    error Locked();

    event IdentityRegistrySet(address indexed identityRegistry);
    event RelyingPartySet(string rpId, string origin);
    event ConfigurationLocked(address indexed identityRegistry, string rpId, string origin);
    event Verified(
        uint256 indexed intentId, address indexed actor, bytes32 indexed actionHash, uint256 amount
    );

    constructor(
        address registry_,
        string memory rpId_,
        string memory origin_,
        address p256Verifier_
    ) {
        registryContract = WitnessIntentRegistry(registry_);
        rpId = rpId_;
        origin = origin_;
        p256Verifier = p256Verifier_;
        owner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function setIdentityRegistry(address identityRegistry_) external onlyOwner {
        if (configurationLocked) revert Locked();
        identityRegistry = identityRegistry_;
        emit IdentityRegistrySet(identityRegistry_);
    }

    /// @notice Update the relying party identity. The deployment origin must match
    ///         the browser origin judges actually visit, or every passkey prompt fails.
    function setRelyingParty(string calldata rpId_, string calldata origin_) external onlyOwner {
        if (configurationLocked) revert Locked();
        rpId = rpId_;
        origin = origin_;
        emit RelyingPartySet(rpId_, origin_);
    }

    /// @notice Permanently freeze the identity binding and the relying party.
    ///
    /// @dev Both setters are trust-critical, and neither needs to keep working
    ///      after setup:
    ///
    ///        - `identityRegistry` decides whether the ERC-8004 ownership check
    ///          runs at all. While it is mutable, the admin could silently disable
    ///          the identity requirement on every existing permission.
    ///        - `rpId` / `origin` decide which web origins' assertions are
    ///          accepted. While mutable, the admin could point them at an origin
    ///          the human never intended to authorize from.
    ///
    ///      So deployment calls this once, and the deployed configuration becomes
    ///      immutable. The verifier stays upgradeable only in the sense that a new
    ///      one can be deployed and the registry pointed at it — a visible, on-chain
    ///      action, not a silent settings change.
    function lockConfiguration() external onlyOwner {
        if (configurationLocked) revert Locked();
        configurationLocked = true;
        emit ConfigurationLocked(identityRegistry, rpId, origin);
    }

    function intentRegistry() external view returns (address) {
        return address(registryContract);
    }

    // ---------------------------------------------------------------------
    // Checks
    // ---------------------------------------------------------------------

    function check(
        uint256 intentId,
        bytes32 actionType,
        bytes32 actionHash,
        uint256 amount,
        address actor,
        WebAuthn.Assertion calldata assertion
    ) external view returns (Reason) {
        return _check(intentId, actionType, actionHash, amount, actor, assertion);
    }

    function authorizeAndConsume(
        uint256 intentId,
        bytes32 actionType,
        bytes32 actionHash,
        uint256 amount,
        address actor,
        WebAuthn.Assertion calldata assertion
    ) external returns (Reason) {
        Reason reason = _check(intentId, actionType, actionHash, amount, actor, assertion);
        if (reason != Reason.Allowed) revert Unauthorized(reason);

        // One-time approvals are consumed only after every check passes, so a
        // failed attempt never burns the human's approval.
        registryContract.markConsumed(intentId, actor);
        emit Verified(intentId, actor, actionHash, amount);
        return Reason.Allowed;
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    function _check(
        uint256 intentId,
        bytes32 actionType,
        bytes32 actionHash,
        uint256 amount,
        address actor,
        WebAuthn.Assertion calldata assertion
    ) internal view returns (Reason) {
        WitnessIntentRegistry.Intent memory it = registryContract.getIntent(intentId);

        if (it.user == address(0)) return Reason.NoSuchIntent;
        if (it.revoked) return Reason.Revoked;
        if (it.expiry != 0 && block.timestamp > it.expiry) return Reason.Expired;
        if (it.consumed) return Reason.AlreadyConsumed;
        if (actor != it.agentWallet) return Reason.WrongAgent;

        // Bind the permission to a real ERC-8004 identity, not a self-declared id.
        if (identityRegistry != address(0) && it.agentId != 0) {
            if (!_ownsAgent(it.agentId, it.agentWallet)) return Reason.AgentNotRegistered;
        }

        if (it.actionType != actionType) return Reason.ActionTypeMismatch;
        if (amount > it.maxAmount) return Reason.OverLimit;

        // The passkey must have signed THIS digest, using the key the human enrolled.
        WebAuthn.AuthError err =
            WebAuthn.verify(actionHash, assertion, it.qx, it.qy, rpId, origin, p256Verifier);
        return _mapAuthError(err);
    }

    /// @dev Agent identity is only real if the registry says the agent wallet owns
    ///      the agent id. Uses staticcall so a reverting/burned token id returns
    ///      false instead of bubbling up an opaque error.
    function _ownsAgent(uint256 agentId, address expectedOwner) private view returns (bool) {
        (bool ok, bytes memory data) =
            identityRegistry.staticcall(abi.encodeWithSignature("ownerOf(uint256)", agentId));
        if (!ok || data.length < 32) return false;
        return abi.decode(data, (address)) == expectedOwner;
    }

    function _mapAuthError(WebAuthn.AuthError e) private pure returns (Reason) {
        if (e == WebAuthn.AuthError.None) return Reason.Allowed;
        if (e == WebAuthn.AuthError.RpIdMismatch) return Reason.RpIdMismatch;
        if (e == WebAuthn.AuthError.NoUserPresence) return Reason.NoUserPresence;
        if (e == WebAuthn.AuthError.NoUserVerification) return Reason.NoUserVerification;
        if (e == WebAuthn.AuthError.WrongType) return Reason.WrongType;
        if (e == WebAuthn.AuthError.ChallengeMismatch) return Reason.ChallengeMismatch;
        if (e == WebAuthn.AuthError.OriginMismatch) return Reason.OriginMismatch;
        return Reason.BadSignature;
    }
}
