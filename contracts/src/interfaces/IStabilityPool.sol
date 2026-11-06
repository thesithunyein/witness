// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Mezo Stability Pool surface Witness calls.
/// @dev Matches mezo-org/musd `provideToSP` / `withdrawFromSP` (no front-end tag).
///      Testnet 31611: 0x1CCA7E410eE41739792eA0A24e00349Dd247680e
interface IStabilityPool {
    function provideToSP(uint256 _amount) external;
    function withdrawFromSP(uint256 _amount) external;
}
