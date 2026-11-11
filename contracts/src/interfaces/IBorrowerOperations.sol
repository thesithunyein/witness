// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice The Mezo BorrowerOperations surface Witness calls.
/// @dev Signatures match mezo-org/musd `BorrowerOperations.sol`. Each call acts on
///      the trove owned by `msg.sender`, so the safe that calls it owns the trove.
///      `repayMUSD` burns MUSD from `msg.sender` without an approval.
///      Testnet 31611: 0xCdF7028ceAB81fA0C6971208e83fa7872994beE5
interface IBorrowerOperations {
    function openTrove(uint256 _debtAmount, address _upperHint, address _lowerHint)
        external
        payable;

    function addColl(address _upperHint, address _lowerHint) external payable;

    function repayMUSD(uint256 _amount, address _upperHint, address _lowerHint) external;

    function musd() external view returns (address);
}
