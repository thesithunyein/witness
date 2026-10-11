// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Minimal stand-in for the ERC-8004 Identity Registry.
/// @dev Only the surface Witness depends on: `ownerOf(uint256) -> address`.
///      Used to test that the agent-id binding is actually enforced rather than
///      decorative, without depending on live registry state in unit tests.
contract MockERC8004Identity {
    mapping(uint256 => address) public ownerOf;
    uint256 public nextAgentId = 1;

    function setOwner(uint256 agentId, address owner) external {
        ownerOf[agentId] = owner;
    }

    function register(address to) external returns (uint256 agentId) {
        agentId = nextAgentId++;
        ownerOf[agentId] = to;
    }
}
