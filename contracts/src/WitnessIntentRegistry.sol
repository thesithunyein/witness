// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title WitnessIntentRegistry
/// @notice Stores the human-approved permission ("intent receipt") that Witness
///         verifies against, and holds the passkey public key the human enrolled.
///
/// @dev Two details that make the difference between a real primitive and a demo:
///
///      1. The passkey public key is stored HERE, enrolled by the human, not
///         supplied per-call. P-256 signatures do not support public key recovery,
///         so a caller-supplied key would let any attacker authorize anything by
///         signing with their own key.
///
///      2. `consumed` and `revoked` are enforced state, not advisory flags, so a
///         one-time approval genuinely cannot be replayed.
contract WitnessIntentRegistry {
    struct Intent {
        address user; // the human who authorized
        address agentWallet; // the only agent wallet allowed to act
        uint256 agentId; // ERC-8004 agent identity this permission is bound to
        bytes32 actionType; // e.g. keccak256("witness.action.transfer")
        uint256 maxAmount; // spend ceiling for this approval
        uint64 expiry; // unix seconds; 0 means "no expiry"
        bytes32 policyHash; // commitment to the full off-chain policy document
        bytes32 credentialHash; // keccak256(credentialId) of the enrolled passkey
        uint256 qx; // enrolled passkey public key, x
        uint256 qy; // enrolled passkey public key, y
        uint64 createdAt;
        bool revoked;
        bool consumed; // one-time use
    }

    error NotUser();
    error NotVerifier();
    error NotOwner();
    error NoSuchIntent();
    error InvalidAgent();
    error ExpiryInPast();
    error AlreadyRevoked();
    error Locked();

    event IntentCreated(
        uint256 indexed intentId,
        address indexed user,
        address indexed agentWallet,
        uint256 agentId,
        bytes32 actionType,
        uint256 maxAmount,
        uint64 expiry,
        bytes32 policyHash,
        bytes32 credentialHash
    );
    event IntentRevoked(uint256 indexed intentId, address indexed user, uint64 atTime);
    event IntentConsumed(uint256 indexed intentId, address indexed agentWallet, uint64 atTime);
    event VerifierSet(address indexed verifier);
    event ConfigurationLocked(address indexed verifier, address indexed owner);

    uint256 public nextIntentId = 1;
    address public owner;
    address public verifier;

    /// @dev Once true, the verifier pointer and the owner can never change again.
    bool public configurationLocked;

    mapping(uint256 => Intent) private _intents;

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @notice Point the registry at the verifier allowed to consume intents.
    /// @dev Set once by the deployer. Kept updatable so the verifier can be
    ///      replaced without orphaning existing receipts, but only by the owner.
    function setVerifier(address verifier_) external onlyOwner {
        if (configurationLocked) revert Locked();
        verifier = verifier_;
        emit VerifierSet(verifier_);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (configurationLocked) revert Locked();
        owner = newOwner;
    }

    /// @notice Permanently freeze the verifier pointer and ownership.
    ///
    /// @dev The verifier is the only address allowed to mark a permission consumed.
    ///      A mutable pointer is therefore a denial-of-service surface: a malicious
    ///      admin could point it at a contract that burns every active permission.
    ///      After setup there is no reason to change it, so deployment freezes it.
    ///      Human-facing authority is unaffected — `revokeIntent` is gated on the
    ///      intent's own author (`it.user`), never on the owner.
    function lockConfiguration() external onlyOwner {
        if (configurationLocked) revert Locked();
        configurationLocked = true;
        emit ConfigurationLocked(verifier, owner);
    }

    /// @notice Register a permission. The caller becomes the authorizing human.
    /// @param agentWallet The agent allowed to act under this permission.
    /// @param agentId ERC-8004 identity id. Pass 0 to skip the identity binding.
    /// @param credentialHash keccak256 of the WebAuthn credential id, for audit.
    /// @param qx/qy The enrolled passkey public key. THE identity that must sign.
    function createIntent(
        address agentWallet,
        uint256 agentId,
        bytes32 actionType,
        uint256 maxAmount,
        uint64 expiry,
        bytes32 policyHash,
        bytes32 credentialHash,
        uint256 qx,
        uint256 qy
    ) external returns (uint256 intentId) {
        if (agentWallet == address(0)) revert InvalidAgent();
        if (expiry != 0 && expiry <= block.timestamp) revert ExpiryInPast();

        intentId = nextIntentId++;
        _intents[intentId] = Intent({
            user: msg.sender,
            agentWallet: agentWallet,
            agentId: agentId,
            actionType: actionType,
            maxAmount: maxAmount,
            expiry: expiry,
            policyHash: policyHash,
            credentialHash: credentialHash,
            qx: qx,
            qy: qy,
            createdAt: uint64(block.timestamp),
            revoked: false,
            consumed: false
        });

        emit IntentCreated(
            intentId,
            msg.sender,
            agentWallet,
            agentId,
            actionType,
            maxAmount,
            expiry,
            policyHash,
            credentialHash
        );
    }

    /// @notice The human withdraws the permission. Takes effect immediately.
    function revokeIntent(uint256 intentId) external {
        Intent storage it = _intents[intentId];
        if (it.user == address(0)) revert NoSuchIntent();
        if (it.user != msg.sender) revert NotUser();
        if (it.revoked) revert AlreadyRevoked();

        it.revoked = true;
        emit IntentRevoked(intentId, msg.sender, uint64(block.timestamp));
    }

    /// @notice Mark a one-time permission as spent. Only the verifier may do this,
    ///         and only after it has fully validated the assertion.
    function markConsumed(uint256 intentId, address agentWallet) external {
        if (msg.sender != verifier) revert NotVerifier();
        Intent storage it = _intents[intentId];
        if (it.user == address(0)) revert NoSuchIntent();
        it.consumed = true;
        emit IntentConsumed(intentId, agentWallet, uint64(block.timestamp));
    }

    function getIntent(uint256 intentId) external view returns (Intent memory) {
        return _intents[intentId];
    }

    function exists(uint256 intentId) external view returns (bool) {
        return _intents[intentId].user != address(0);
    }

    /// @notice Convenience read for UIs: is this permission currently usable?
    function isActive(uint256 intentId) external view returns (bool) {
        Intent storage it = _intents[intentId];
        if (it.user == address(0) || it.revoked || it.consumed) return false;
        if (it.expiry != 0 && block.timestamp > it.expiry) return false;
        return true;
    }
}
