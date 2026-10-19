// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title GYDSchain GRC-20 Token
/// @notice Mints the declared initial supply to the creator at deployment.
/// Future minting is disabled unless the creator explicitly opts in.
contract GydsToken is ERC20, Ownable {
    uint8 private immutable _tokenDecimals;
    bool public immutable mintingEnabled;

    constructor(
        string memory tokenName,
        string memory tokenSymbol,
        uint8 tokenDecimals,
        address creator,
        uint256 initialSupply,
        bool allowFutureMinting
    ) ERC20(tokenName, tokenSymbol) Ownable(creator) {
        require(creator != address(0), "Invalid creator");
        require(tokenDecimals <= 18, "Decimals exceed 18");
        require(initialSupply > 0, "Initial supply is zero");

        _tokenDecimals = tokenDecimals;
        mintingEnabled = allowFutureMinting;
        _mint(creator, initialSupply);
    }

    function decimals() public view override returns (uint8) {
        return _tokenDecimals;
    }

    /// @notice Only available when future minting was explicitly enabled at deployment.
    function mint(address to, uint256 amount) external onlyOwner {
        require(mintingEnabled, "Minting disabled");
        _mint(to, amount);
    }

    /// @notice Holders may burn only their own tokens.
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }
}
