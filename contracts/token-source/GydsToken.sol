// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title GYDSchain GRC-20 Token
/// @notice Mints a fixed initial supply to the deploying wallet. No owner or
/// privileged controls are included in this token implementation.
contract GydsToken is ERC20 {
    uint8 private immutable _tokenDecimals;

    constructor(
        string memory tokenName,
        string memory tokenSymbol,
        uint8 tokenDecimals,
        uint256 initialSupply
    ) ERC20(tokenName, tokenSymbol) {
        require(tokenDecimals <= 18, "Decimals exceed 18");
        require(initialSupply > 0, "Initial supply is zero");

        _tokenDecimals = tokenDecimals;
        _mint(msg.sender, initialSupply);
    }

    function decimals() public view override returns (uint8) {
        return _tokenDecimals;
    }

}
