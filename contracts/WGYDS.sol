// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title WGYDS — Wrapped GYDS
/// @notice ERC-20 wrapper for the native GYDS coin on GydsChain (Chain ID 13370).
///         1 WGYDS = 1 GYDS (1:1, no fee).
///         Required by GydsSwapRouter to handle native-coin swap pairs.
contract WGYDS {

    string  public constant name     = "Wrapped GYDS";
    string  public constant symbol   = "WGYDS";
    uint8   public constant decimals = 18;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Deposit(address indexed dst, uint256 wad);
    event Withdrawal(address indexed src, uint256 wad);

    // ─── Wrap / Unwrap ───────────────────────────────────────────────────────

    receive() external payable {
        deposit();
    }

    function deposit() public payable {
        balanceOf[msg.sender] += msg.value;
        emit Deposit(msg.sender, msg.value);
        emit Transfer(address(0), msg.sender, msg.value);
    }

    function withdraw(uint256 wad) external {
        require(balanceOf[msg.sender] >= wad, "WGYDS: INSUFFICIENT_BALANCE");
        balanceOf[msg.sender] -= wad;
        (bool success,) = payable(msg.sender).call{value: wad}("");
        require(success, "WGYDS: TRANSFER_FAILED");
        emit Withdrawal(msg.sender, wad);
        emit Transfer(msg.sender, address(0), wad);
    }

    // ─── ERC-20 ──────────────────────────────────────────────────────────────

    function totalSupply() external view returns (uint256) {
        return address(this).balance;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        require(balanceOf[msg.sender] >= value, "WGYDS: INSUFFICIENT_BALANCE");
        balanceOf[msg.sender] -= value;
        balanceOf[to]         += value;
        emit Transfer(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        require(balanceOf[from] >= value, "WGYDS: INSUFFICIENT_BALANCE");
        if (allowance[from][msg.sender] != type(uint256).max) {
            require(allowance[from][msg.sender] >= value, "WGYDS: INSUFFICIENT_ALLOWANCE");
            allowance[from][msg.sender] -= value;
        }
        balanceOf[from] -= value;
        balanceOf[to]   += value;
        emit Transfer(from, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }
}
