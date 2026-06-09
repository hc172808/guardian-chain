// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title GLPToken — Gyds Liquidity Provider Token
/// @notice ERC-20 LP token for a GydsSwap pair.
///         Symbol format: GLP-{TOKEN0_SYMBOL}-{TOKEN1_SYMBOL}
///         e.g. GLP-GYDS-USDT, GLP-GYDS-ETH
/// @dev Minted/burned exclusively by the GydsSwapPair that owns this token.
///      Implements full ERC-20 + ERC-2612 (permit) for gas-free approvals.
contract GLPToken {

    // ─── ERC-20 state ────────────────────────────────────────────────────────

    string  public name;
    string  public symbol;
    uint8   public constant decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // ─── ERC-2612 (permit) ───────────────────────────────────────────────────

    bytes32 public DOMAIN_SEPARATOR;
    // keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)")
    bytes32 public constant PERMIT_TYPEHASH =
        0x6e71edae12b1b97f4d1f60370fef10105fa2faae0126114a169c64845d6126c9;
    mapping(address => uint256) public nonces;

    // ─── Access control ──────────────────────────────────────────────────────

    /// @notice The GydsSwapPair that controls mint/burn
    address public immutable pair;

    modifier onlyPair() {
        require(msg.sender == pair, "GLP: FORBIDDEN");
        _;
    }

    // ─── Events ──────────────────────────────────────────────────────────────

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    // ─── Constructor ─────────────────────────────────────────────────────────

    /// @param _pair        Address of the owning GydsSwapPair
    /// @param _symbol      e.g. "GLP-GYDS-USDT"
    constructor(address _pair, string memory _symbol) {
        pair = _pair;
        symbol = _symbol;
        name = string(abi.encodePacked("Gyds Liquidity Provider ", _symbol));

        DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256(bytes(name)),
            keccak256(bytes("1")),
            block.chainid,
            address(this)
        ));
    }

    // ─── ERC-20 ──────────────────────────────────────────────────────────────

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        if (allowance[from][msg.sender] != type(uint256).max) {
            allowance[from][msg.sender] -= value;
        }
        _transfer(from, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        _approve(msg.sender, spender, value);
        return true;
    }

    // ─── Mint / Burn (pair only) ──────────────────────────────────────────────

    function mint(address to, uint256 value) external onlyPair {
        totalSupply += value;
        balanceOf[to] += value;
        emit Transfer(address(0), to, value);
    }

    function burn(address from, uint256 value) external onlyPair {
        balanceOf[from] -= value;
        totalSupply -= value;
        emit Transfer(from, address(0), value);
    }

    // ─── ERC-2612 Permit ─────────────────────────────────────────────────────

    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        require(deadline >= block.timestamp, "GLP: EXPIRED");
        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            DOMAIN_SEPARATOR,
            keccak256(abi.encode(
                PERMIT_TYPEHASH,
                owner,
                spender,
                value,
                nonces[owner]++,
                deadline
            ))
        ));
        address recoveredAddress = ecrecover(digest, v, r, s);
        require(recoveredAddress != address(0) && recoveredAddress == owner, "GLP: INVALID_SIGNATURE");
        _approve(owner, spender, value);
    }

    // ─── Internal helpers ────────────────────────────────────────────────────

    function _transfer(address from, address to, uint256 value) internal {
        require(to != address(0), "GLP: TRANSFER_TO_ZERO");
        balanceOf[from] -= value;
        balanceOf[to]   += value;
        emit Transfer(from, to, value);
    }

    function _approve(address owner, address spender, uint256 value) internal {
        allowance[owner][spender] = value;
        emit Approval(owner, spender, value);
    }
}
