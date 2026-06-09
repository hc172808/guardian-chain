// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./GLPToken.sol";
import "./GydsSwapLibrary.sol";

/// @title GydsSwapPair
/// @notice Constant-product AMM pool (Uniswap V2 style) for GydsChain (Chain ID 13370).
///         Each pair holds two ERC-20 reserves and mints GLP-{T0}-{T1} LP tokens.
///
/// Fee:     0.3% per swap  →  0.25% to LPs,  0.05% to protocol (feeTo)
/// Formula: x * y = k
contract GydsSwapPair {

    // ─── Constants ───────────────────────────────────────────────────────────

    uint256 public constant MINIMUM_LIQUIDITY = 1_000; // locked forever to prevent division by zero

    // ─── State ───────────────────────────────────────────────────────────────

    address public factory;
    address public token0;
    address public token1;
    address public lpToken;      // GLP-{T0}-{T1} ERC-20

    uint112 private reserve0;
    uint112 private reserve1;
    uint32  private blockTimestampLast;

    uint256 public price0CumulativeLast;
    uint256 public price1CumulativeLast;
    uint256 public kLast; // reserve0 * reserve1 at last mint/burn event (used for protocol fee)

    // ─── Reentrancy guard ────────────────────────────────────────────────────

    uint256 private _status = 1;
    modifier nonReentrant() {
        require(_status == 1, "GydsSwap: REENTRANCY");
        _status = 2;
        _;
        _status = 1;
    }

    // ─── Events ──────────────────────────────────────────────────────────────

    event Mint(address indexed sender, uint256 amount0, uint256 amount1);
    event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to);
    event Swap(
        address indexed sender,
        uint256 amount0In,
        uint256 amount1In,
        uint256 amount0Out,
        uint256 amount1Out,
        address indexed to
    );
    event Sync(uint112 reserve0, uint112 reserve1);

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor() {
        factory = msg.sender;
    }

    /// @notice Called once by the factory after deployment
    function initialize(
        address _token0,
        address _token1,
        string memory _lpSymbol
    ) external {
        require(msg.sender == factory, "GydsSwap: FORBIDDEN");
        token0  = _token0;
        token1  = _token1;
        lpToken = address(new GLPToken(address(this), _lpSymbol));
    }

    // ─── View ────────────────────────────────────────────────────────────────

    function getReserves()
        public view
        returns (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast)
    {
        _reserve0 = reserve0;
        _reserve1 = reserve1;
        _blockTimestampLast = blockTimestampLast;
    }

    function totalLPSupply() external view returns (uint256) {
        return GLPToken(lpToken).totalSupply();
    }

    function lpBalanceOf(address account) external view returns (uint256) {
        return GLPToken(lpToken).balanceOf(account);
    }

    // ─── Mint (add liquidity) ─────────────────────────────────────────────────

    /// @notice Mint LP tokens. Caller must have already transferred token0 and token1 to this contract.
    /// @param to Recipient of LP tokens
    /// @return liquidity Amount of LP tokens minted
    function mint(address to) external nonReentrant returns (uint256 liquidity) {
        (uint112 _reserve0, uint112 _reserve1,) = getReserves();
        uint256 balance0 = _balanceOf(token0);
        uint256 balance1 = _balanceOf(token1);
        uint256 amount0  = balance0 - _reserve0;
        uint256 amount1  = balance1 - _reserve1;

        bool feeOn = _mintFee(_reserve0, _reserve1);
        uint256 _totalSupply = GLPToken(lpToken).totalSupply();

        if (_totalSupply == 0) {
            // First deposit: geometric mean, minus minimum liquidity locked to zero address
            liquidity = GydsSwapLibrary.sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY;
            GLPToken(lpToken).mint(address(0), MINIMUM_LIQUIDITY); // lock minimum liquidity
        } else {
            liquidity = GydsSwapLibrary.min(
                amount0 * _totalSupply / _reserve0,
                amount1 * _totalSupply / _reserve1
            );
        }

        require(liquidity > 0, "GydsSwap: INSUFFICIENT_LIQUIDITY_MINTED");
        GLPToken(lpToken).mint(to, liquidity);

        _update(balance0, balance1, _reserve0, _reserve1);
        if (feeOn) kLast = uint256(reserve0) * uint256(reserve1);
        emit Mint(msg.sender, amount0, amount1);
    }

    // ─── Burn (remove liquidity) ──────────────────────────────────────────────

    /// @notice Burn LP tokens. Caller must have already transferred LP tokens to this contract.
    /// @param to Recipient of underlying token0 and token1
    /// @return amount0 Token0 returned
    /// @return amount1 Token1 returned
    function burn(address to)
        external nonReentrant
        returns (uint256 amount0, uint256 amount1)
    {
        (uint112 _reserve0, uint112 _reserve1,) = getReserves();
        uint256 balance0 = _balanceOf(token0);
        uint256 balance1 = _balanceOf(token1);
        uint256 liquidity = GLPToken(lpToken).balanceOf(address(this));

        bool feeOn = _mintFee(_reserve0, _reserve1);
        uint256 _totalSupply = GLPToken(lpToken).totalSupply();

        amount0 = liquidity * balance0 / _totalSupply;
        amount1 = liquidity * balance1 / _totalSupply;
        require(amount0 > 0 && amount1 > 0, "GydsSwap: INSUFFICIENT_LIQUIDITY_BURNED");

        GLPToken(lpToken).burn(address(this), liquidity);
        _safeTransfer(token0, to, amount0);
        _safeTransfer(token1, to, amount1);

        balance0 = _balanceOf(token0);
        balance1 = _balanceOf(token1);
        _update(balance0, balance1, _reserve0, _reserve1);
        if (feeOn) kLast = uint256(reserve0) * uint256(reserve1);
        emit Burn(msg.sender, amount0, amount1, to);
    }

    // ─── Swap ────────────────────────────────────────────────────────────────

    /// @notice Execute a swap. Caller must have already transferred the input token.
    /// @param amount0Out Amount of token0 to send out (0 if swapping token0 → token1)
    /// @param amount1Out Amount of token1 to send out (0 if swapping token1 → token0)
    /// @param to         Recipient
    /// @param data       Optional flash-swap callback data (pass "" for normal swaps)
    function swap(
        uint256 amount0Out,
        uint256 amount1Out,
        address to,
        bytes calldata data
    ) external nonReentrant {
        require(amount0Out > 0 || amount1Out > 0, "GydsSwap: INSUFFICIENT_OUTPUT_AMOUNT");
        (uint112 _reserve0, uint112 _reserve1,) = getReserves();
        require(amount0Out < _reserve0 && amount1Out < _reserve1, "GydsSwap: INSUFFICIENT_LIQUIDITY");
        require(to != token0 && to != token1, "GydsSwap: INVALID_TO");

        if (amount0Out > 0) _safeTransfer(token0, to, amount0Out);
        if (amount1Out > 0) _safeTransfer(token1, to, amount1Out);

        // Flash-swap callback (optional)
        if (data.length > 0) {
            IGydsSwapCallee(to).gydsSwapCall(msg.sender, amount0Out, amount1Out, data);
        }

        uint256 balance0 = _balanceOf(token0);
        uint256 balance1 = _balanceOf(token1);

        uint256 amount0In = balance0 > _reserve0 - amount0Out ? balance0 - (_reserve0 - amount0Out) : 0;
        uint256 amount1In = balance1 > _reserve1 - amount1Out ? balance1 - (_reserve1 - amount1Out) : 0;
        require(amount0In > 0 || amount1In > 0, "GydsSwap: INSUFFICIENT_INPUT_AMOUNT");

        // Verify constant product invariant holds after 0.3% fee
        // balance0Adjusted * balance1Adjusted >= reserve0 * reserve1 * (1000^2)
        uint256 balance0Adjusted = balance0 * 1000 - amount0In * 3;
        uint256 balance1Adjusted = balance1 * 1000 - amount1In * 3;
        require(
            balance0Adjusted * balance1Adjusted >= uint256(_reserve0) * uint256(_reserve1) * 1_000_000,
            "GydsSwap: K_INVARIANT_FAILED"
        );

        _update(balance0, balance1, _reserve0, _reserve1);
        emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
    }

    // ─── Sync ────────────────────────────────────────────────────────────────

    /// @notice Force reserves to match current token balances (safety valve)
    function sync() external nonReentrant {
        _update(_balanceOf(token0), _balanceOf(token1), reserve0, reserve1);
    }

    // ─── Internal ────────────────────────────────────────────────────────────

    /// @dev Update reserves and TWAP accumulators
    function _update(
        uint256 balance0,
        uint256 balance1,
        uint112 _reserve0,
        uint112 _reserve1
    ) private {
        require(balance0 <= type(uint112).max && balance1 <= type(uint112).max, "GydsSwap: OVERFLOW");
        uint32 blockTimestamp = uint32(block.timestamp % 2**32);
        uint32 timeElapsed    = blockTimestamp - blockTimestampLast;

        if (timeElapsed > 0 && _reserve0 != 0 && _reserve1 != 0) {
            // TWAP price accumulators (UQ112x112 format)
            price0CumulativeLast += uint256(uint224((uint256(_reserve1) << 112) / uint256(_reserve0))) * timeElapsed;
            price1CumulativeLast += uint256(uint224((uint256(_reserve0) << 112) / uint256(_reserve1))) * timeElapsed;
        }

        reserve0 = uint112(balance0);
        reserve1 = uint112(balance1);
        blockTimestampLast = blockTimestamp;
        emit Sync(reserve0, reserve1);
    }

    /// @dev Collect 0.05% protocol fee (if feeTo is set) by minting LP tokens
    function _mintFee(uint112 _reserve0, uint112 _reserve1) private returns (bool feeOn) {
        address feeTo = IGydsSwapFactory(factory).feeTo();
        feeOn = feeTo != address(0);
        uint256 _kLast = kLast;
        if (feeOn) {
            if (_kLast != 0) {
                uint256 rootK  = GydsSwapLibrary.sqrt(uint256(_reserve0) * uint256(_reserve1));
                uint256 rootKLast = GydsSwapLibrary.sqrt(_kLast);
                if (rootK > rootKLast) {
                    uint256 _totalSupply = GLPToken(lpToken).totalSupply();
                    uint256 numerator    = _totalSupply * (rootK - rootKLast);
                    uint256 denominator  = rootK * 5 + rootKLast;
                    uint256 protocolFee  = numerator / denominator;
                    if (protocolFee > 0) GLPToken(lpToken).mint(feeTo, protocolFee);
                }
            }
        } else if (_kLast != 0) {
            kLast = 0;
        }
    }

    function _safeTransfer(address token, address to, uint256 value) private {
        (bool success, bytes memory data_) = token.call(
            abi.encodeWithSelector(0xa9059cbb /* transfer(address,uint256) */, to, value)
        );
        require(success && (data_.length == 0 || abi.decode(data_, (bool))), "GydsSwap: TRANSFER_FAILED");
    }

    function _balanceOf(address token) private view returns (uint256) {
        (bool success, bytes memory data_) = token.staticcall(
            abi.encodeWithSelector(0x70a08231 /* balanceOf(address) */, address(this))
        );
        require(success, "GydsSwap: BALANCE_CALL_FAILED");
        return abi.decode(data_, (uint256));
    }
}

// ─── Interfaces used by the pair ─────────────────────────────────────────────

interface IGydsSwapFactory {
    function feeTo() external view returns (address);
}

interface IGydsSwapCallee {
    function gydsSwapCall(address sender, uint256 amount0, uint256 amount1, bytes calldata data) external;
}
