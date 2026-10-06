// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice ERC-20 token deployed for an approved user-created stablecoin.
/// The creator's linked wallet is the owner and controls minting and burning.
contract UserStablecoin is ERC20, Ownable {
    uint8 private immutable _tokenDecimals;

    constructor(
        string memory tokenName,
        string memory tokenSymbol,
        uint8 tokenDecimals,
        address creatorWallet,
        uint256 initialSupply
    ) ERC20(tokenName, tokenSymbol) Ownable(creatorWallet) {
        require(creatorWallet != address(0), "Invalid creator wallet");
        require(tokenDecimals <= 18, "Decimals exceed 18");
        _tokenDecimals = tokenDecimals;

        if (initialSupply > 0) {
            _mint(creatorWallet, initialSupply);
        }
    }

    function decimals() public view override returns (uint8) {
        return _tokenDecimals;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /// @notice A holder can always burn their own tokens.
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    /// @notice The creator can burn tokens held by any account.
    function burnFrom(address account, uint256 amount) external onlyOwner {
        _burn(account, amount);
    }
}