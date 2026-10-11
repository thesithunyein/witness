// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title WitnessAction
/// @notice The canonical digest a human's passkey signs to approve one action.
///
/// @dev This is the security core of the protocol, so it is worth being explicit
///      about what it binds and why each field is present:
///
///        chainId   - an approval given on testnet cannot be replayed on mainnet
///        domain    - the enforcing contract; an approval for one counterparty
///                    cannot be replayed against another
///        intentId  - which human permission is being exercised
///        actionType- what kind of action (transfer, swap, ...)
///        token     - which asset
///        to        - the recipient
///        amount    - the exact amount
///
///      Because all of these are inside the signed digest, an agent that is
///      prompt-injected into changing the recipient or the amount produces a
///      digest the human never signed, and verification fails.
///
///      This is deliberately a domain-separated keccak digest rather than a full
///      EIP-712 typed-data envelope: domain separation by chain id + contract is
///      what the security argument depends on, and keeping the digest a plain
///      keccak makes it cheap to reproduce in a browser, a test, or a wallet.
library WitnessAction {
    bytes32 internal constant ACTION_HASH_TYPEHASH = keccak256(
        "WitnessAction(uint256 chainId,address domain,uint256 intentId,bytes32 actionType,address token,address to,uint256 amount)"
    );

    /// @dev Domain tag for asset transfers.
    bytes32 internal constant TRANSFER = keccak256("witness.action.transfer");

    function hash(
        uint256 chainId,
        address domain,
        uint256 intentId,
        bytes32 actionType,
        address token,
        address to,
        uint256 amount
    ) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                ACTION_HASH_TYPEHASH, chainId, domain, intentId, actionType, token, to, amount
            )
        );
    }

    function transferHash(
        uint256 chainId,
        address domain,
        uint256 intentId,
        address token,
        address to,
        uint256 amount
    ) internal pure returns (bytes32) {
        return hash(chainId, domain, intentId, TRANSFER, token, to, amount);
    }
}
