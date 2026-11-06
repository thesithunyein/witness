// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "../../src/interfaces/IERC20.sol";

/// @notice Pulls and returns the token the way Mezo's Stability Pool does.
contract MockStabilityPool {
    IERC20 public immutable token;
    mapping(address => uint256) public deposits;

    constructor(address token_) {
        token = IERC20(token_);
    }

    function provideToSP(uint256 amount) external {
        require(token.transferFrom(msg.sender, address(this), amount), "mock sp transferFrom");
        deposits[msg.sender] += amount;
    }

    function withdrawFromSP(uint256 amount) external {
        require(deposits[msg.sender] >= amount, "mock sp balance");
        deposits[msg.sender] -= amount;
        require(token.transfer(msg.sender, amount), "mock sp transfer");
    }
}
