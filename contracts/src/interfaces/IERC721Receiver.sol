// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IERC721Receiver
/// @notice The receiver hook ERC-721 `_safeMint` / `safeTransferFrom` call on the
///         receiving contract.
///
/// @dev AgentExecutor needs this because the ERC-8004 Identity Registry mints the
///      agent identity with `_safeMint`: without the hook the mint reverts, so a
///      contract could never own an agent identity.
interface IERC721Receiver {
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data)
        external
        returns (bytes4);
}
