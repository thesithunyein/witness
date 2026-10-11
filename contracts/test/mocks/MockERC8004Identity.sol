// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC721Receiver} from "../../src/interfaces/IERC721Receiver.sol";

/// @notice Minimal stand-in for the ERC-8004 Identity Registry.
/// @dev Only the surface Witness depends on: `ownerOf(uint256) -> address`.
///      Used to test that the agent-id binding is actually enforced rather than
///      decorative, without depending on live registry state in unit tests.
contract MockERC8004Identity {
    mapping(uint256 => address) public ownerOf;
    uint256 public nextAgentId = 1;

    error UnsafeRecipient(address to);

    function setOwner(uint256 agentId, address owner) external {
        ownerOf[agentId] = owner;
    }

    function register(address to) external returns (uint256 agentId) {
        agentId = nextAgentId++;
        ownerOf[agentId] = to;
    }

    /// @notice Mint to the caller the way the real registry does: `_safeMint`.
    /// @dev The receiver hook is not ceremony. The deployed registry mints with
    ///      `_safeMint`, so a contract that does not implement the hook cannot own
    ///      an agent identity — the registration reverts after the token has been
    ///      minted. Mirroring that here is what makes this mock able to catch it.
    function register(string calldata) external returns (uint256 agentId) {
        agentId = nextAgentId++;
        ownerOf[agentId] = msg.sender;

        if (msg.sender.code.length > 0) {
            bytes4 ret = IERC721Receiver(msg.sender)
                .onERC721Received(address(this), address(0), agentId, "");
            if (ret != IERC721Receiver.onERC721Received.selector) {
                revert UnsafeRecipient(msg.sender);
            }
        }
    }
}
