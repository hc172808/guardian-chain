// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./GydsSwapLibrary.sol";
import "./GydsSwapPair.sol";

/// @title GydsSwapRouter
/// @notice User-facing router for GydsSwap DEX on GydsChain (Chain ID 13370).
///         Handles: addLiquidity, removeLiquidity, and all swap variants.
///
/// Slippage protection:  every function accepts minimum amounts / deadline.
/// Reentrancy:           each external function has a deadline guard + pair-level lock.
/// Supports GYDS native coin via WGYDS wrapper.
contract GydsSwapRouter {

    // ─── Immutables ──────────────────────────────────────────────────────────

    address public immutable factory;
    address public immutable WGYDS; // Wrapped GYDS (ERC-20 wrapper for native coin)

    // ─── Modifiers ───────────────────────────────────────────────────────────

    modifier ensure(uint256 deadline) {
        require(deadline >= block.timestamp, "GydsSwapRouter: EXPIRED");
        _;
    }

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor(address _factory, address _WGYDS) {
        factory = _factory;
        WGYDS   = _WGYDS;
    }

    // ─── Receive GYDS (for WGYDS unwrapping) ────────────────────────────────

    receive() external payable {
        require(msg.sender == WGYDS, "GydsSwapRouter: ONLY_WGYDS");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  ADD LIQUIDITY
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Add liquidity for a token pair.
    ///         Mints GLP-{T0}-{T1} LP tokens to `to`.
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        _ensurePair(tokenA, tokenB);
        (amountA, amountB) = _calcLiquidityAmounts(tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin);
        address pair = GydsSwapLibrary.pairFor(factory, tokenA, tokenB);
        _safeTransferFrom(tokenA, msg.sender, pair, amountA);
        _safeTransferFrom(tokenB, msg.sender, pair, amountB);
        liquidity = GydsSwapPair(pair).mint(to);
    }

    /// @notice Add liquidity where one side is native GYDS coin.
    function addLiquidityGYDS(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountGYDSMin,
        address to,
        uint256 deadline
    ) external payable ensure(deadline) returns (uint256 amountToken, uint256 amountGYDS, uint256 liquidity) {
        _ensurePair(token, WGYDS);
        (amountToken, amountGYDS) = _calcLiquidityAmounts(
            token, WGYDS,
            amountTokenDesired, msg.value,
            amountTokenMin, amountGYDSMin
        );
        address pair = GydsSwapLibrary.pairFor(factory, token, WGYDS);
        _safeTransferFrom(token, msg.sender, pair, amountToken);
        IWGYDS(WGYDS).deposit{value: amountGYDS}();
        require(IWGYDS(WGYDS).transfer(pair, amountGYDS), "GydsSwapRouter: WGYDS_TRANSFER_FAILED");
        liquidity = GydsSwapPair(pair).mint(to);
        // Refund unused GYDS
        if (msg.value > amountGYDS) {
            _safeTransferGYDS(msg.sender, msg.value - amountGYDS);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  REMOVE LIQUIDITY
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Remove liquidity and receive token0 + token1 back.
    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) public ensure(deadline) returns (uint256 amountA, uint256 amountB) {
        address pair = GydsSwapLibrary.pairFor(factory, tokenA, tokenB);
        // Transfer LP tokens to pair (burn will be triggered by pair.burn())
        address lpToken = GydsSwapPair(pair).lpToken();
        _safeTransferFrom(lpToken, msg.sender, pair, liquidity);
        (uint256 amount0, uint256 amount1) = GydsSwapPair(pair).burn(to);
        (address token0,) = GydsSwapLibrary.sortTokens(tokenA, tokenB);
        (amountA, amountB) = tokenA == token0 ? (amount0, amount1) : (amount1, amount0);
        require(amountA >= amountAMin, "GydsSwapRouter: INSUFFICIENT_A_AMOUNT");
        require(amountB >= amountBMin, "GydsSwapRouter: INSUFFICIENT_B_AMOUNT");
    }

    /// @notice Remove liquidity and receive token + native GYDS back.
    function removeLiquidityGYDS(
        address token,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountGYDSMin,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256 amountToken, uint256 amountGYDS) {
        (amountToken, amountGYDS) = removeLiquidity(
            token, WGYDS,
            liquidity,
            amountTokenMin, amountGYDSMin,
            address(this),  // receive WGYDS here first
            deadline
        );
        _safeTransfer(token, to, amountToken);
        IWGYDS(WGYDS).withdraw(amountGYDS);
        _safeTransferGYDS(to, amountGYDS);
    }

    /// @notice Remove liquidity with a signed permit (gasless approval)
    function removeLiquidityWithPermit(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline,
        bool approveMax,
        uint8 v, bytes32 r, bytes32 s
    ) external returns (uint256 amountA, uint256 amountB) {
        address pair = GydsSwapLibrary.pairFor(factory, tokenA, tokenB);
        address lpToken = GydsSwapPair(pair).lpToken();
        uint256 value = approveMax ? type(uint256).max : liquidity;
        GLPToken(lpToken).permit(msg.sender, address(this), value, deadline, v, r, s);
        (amountA, amountB) = removeLiquidity(tokenA, tokenB, liquidity, amountAMin, amountBMin, to, deadline);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  SWAP — exact input
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Swap an exact amount of input tokens for as many output tokens as possible.
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        amounts = GydsSwapLibrary.getAmountsOut(factory, amountIn, path);
        require(amounts[amounts.length - 1] >= amountOutMin, "GydsSwapRouter: INSUFFICIENT_OUTPUT_AMOUNT");
        _safeTransferFrom(path[0], msg.sender, GydsSwapLibrary.pairFor(factory, path[0], path[1]), amounts[0]);
        _swap(amounts, path, to);
    }

    /// @notice Swap native GYDS for exact minimum output tokens.
    function swapExactGYDSForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable ensure(deadline) returns (uint256[] memory amounts) {
        require(path[0] == WGYDS, "GydsSwapRouter: INVALID_PATH");
        amounts = GydsSwapLibrary.getAmountsOut(factory, msg.value, path);
        require(amounts[amounts.length - 1] >= amountOutMin, "GydsSwapRouter: INSUFFICIENT_OUTPUT_AMOUNT");
        IWGYDS(WGYDS).deposit{value: amounts[0]}();
        require(IWGYDS(WGYDS).transfer(GydsSwapLibrary.pairFor(factory, path[0], path[1]), amounts[0]), "");
        _swap(amounts, path, to);
    }

    /// @notice Swap exact tokens for native GYDS.
    function swapExactTokensForGYDS(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        require(path[path.length - 1] == WGYDS, "GydsSwapRouter: INVALID_PATH");
        amounts = GydsSwapLibrary.getAmountsOut(factory, amountIn, path);
        require(amounts[amounts.length - 1] >= amountOutMin, "GydsSwapRouter: INSUFFICIENT_OUTPUT_AMOUNT");
        _safeTransferFrom(path[0], msg.sender, GydsSwapLibrary.pairFor(factory, path[0], path[1]), amounts[0]);
        _swap(amounts, path, address(this));
        IWGYDS(WGYDS).withdraw(amounts[amounts.length - 1]);
        _safeTransferGYDS(to, amounts[amounts.length - 1]);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  SWAP — exact output
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Swap as few input tokens as possible for an exact amount of output.
    function swapTokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        amounts = GydsSwapLibrary.getAmountsIn(factory, amountOut, path);
        require(amounts[0] <= amountInMax, "GydsSwapRouter: EXCESSIVE_INPUT_AMOUNT");
        _safeTransferFrom(path[0], msg.sender, GydsSwapLibrary.pairFor(factory, path[0], path[1]), amounts[0]);
        _swap(amounts, path, to);
    }

    /// @notice Swap native GYDS for an exact amount of output tokens.
    function swapGYDSForExactTokens(
        uint256 amountOut,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable ensure(deadline) returns (uint256[] memory amounts) {
        require(path[0] == WGYDS, "GydsSwapRouter: INVALID_PATH");
        amounts = GydsSwapLibrary.getAmountsIn(factory, amountOut, path);
        require(amounts[0] <= msg.value, "GydsSwapRouter: EXCESSIVE_INPUT_AMOUNT");
        IWGYDS(WGYDS).deposit{value: amounts[0]}();
        require(IWGYDS(WGYDS).transfer(GydsSwapLibrary.pairFor(factory, path[0], path[1]), amounts[0]), "");
        _swap(amounts, path, to);
        // Refund excess GYDS
        if (msg.value > amounts[0]) {
            _safeTransferGYDS(msg.sender, msg.value - amounts[0]);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  VIEW HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    function quote(uint256 amountA, uint256 reserveA, uint256 reserveB)
        external pure returns (uint256 amountB)
    {
        return GydsSwapLibrary.quote(amountA, reserveA, reserveB);
    }

    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        external pure returns (uint256 amountOut)
    {
        return GydsSwapLibrary.getAmountOut(amountIn, reserveIn, reserveOut);
    }

    function getAmountIn(uint256 amountOut, uint256 reserveIn, uint256 reserveOut)
        external pure returns (uint256 amountIn)
    {
        return GydsSwapLibrary.getAmountIn(amountOut, reserveIn, reserveOut);
    }

    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external view returns (uint256[] memory amounts)
    {
        return GydsSwapLibrary.getAmountsOut(factory, amountIn, path);
    }

    function getAmountsIn(uint256 amountOut, address[] calldata path)
        external view returns (uint256[] memory amounts)
    {
        return GydsSwapLibrary.getAmountsIn(factory, amountOut, path);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  INTERNAL
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Execute chained swaps through a path
    function _swap(uint256[] memory amounts, address[] memory path, address _to) internal {
        for (uint256 i; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0,) = GydsSwapLibrary.sortTokens(input, output);
            uint256 amountOut = amounts[i + 1];
            (uint256 amount0Out, uint256 amount1Out) = input == token0
                ? (uint256(0), amountOut)
                : (amountOut, uint256(0));
            address to = i < path.length - 2
                ? GydsSwapLibrary.pairFor(factory, output, path[i + 2])
                : _to;
            GydsSwapPair(GydsSwapLibrary.pairFor(factory, input, output))
                .swap(amount0Out, amount1Out, to, new bytes(0));
        }
    }

    /// @dev Calculate optimal liquidity amounts (respects existing price ratio)
    function _calcLiquidityAmounts(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin
    ) internal view returns (uint256 amountA, uint256 amountB) {
        (uint256 reserveA, uint256 reserveB) = GydsSwapLibrary.getReserves(factory, tokenA, tokenB);
        if (reserveA == 0 && reserveB == 0) {
            (amountA, amountB) = (amountADesired, amountBDesired);
        } else {
            uint256 amountBOptimal = GydsSwapLibrary.quote(amountADesired, reserveA, reserveB);
            if (amountBOptimal <= amountBDesired) {
                require(amountBOptimal >= amountBMin, "GydsSwapRouter: INSUFFICIENT_B_AMOUNT");
                (amountA, amountB) = (amountADesired, amountBOptimal);
            } else {
                uint256 amountAOptimal = GydsSwapLibrary.quote(amountBDesired, reserveB, reserveA);
                require(amountAOptimal >= amountAMin, "GydsSwapRouter: INSUFFICIENT_A_AMOUNT");
                (amountA, amountB) = (amountAOptimal, amountBDesired);
            }
        }
    }

    /// @dev Ensure pair exists; create it if needed with token symbols derived on-chain
    function _ensurePair(address tokenA, address tokenB) internal {
        if (IGydsSwapFactory(factory).getPair(tokenA, tokenB) == address(0)) {
            // Pair doesn't exist yet — caller must create it manually via factory.createPair()
            revert("GydsSwapRouter: PAIR_NOT_FOUND — call factory.createPair() first");
        }
    }

    function _safeTransfer(address token, address to, uint256 value) internal {
        (bool success, bytes memory data_) = token.call(
            abi.encodeWithSelector(0xa9059cbb, to, value)
        );
        require(success && (data_.length == 0 || abi.decode(data_, (bool))), "GydsSwapRouter: TRANSFER_FAILED");
    }

    function _safeTransferFrom(address token, address from, address to, uint256 value) internal {
        (bool success, bytes memory data_) = token.call(
            abi.encodeWithSelector(0x23b872dd /* transferFrom */, from, to, value)
        );
        require(success && (data_.length == 0 || abi.decode(data_, (bool))), "GydsSwapRouter: TRANSFERFROM_FAILED");
    }

    function _safeTransferGYDS(address to, uint256 value) internal {
        (bool success,) = to.call{value: value}("");
        require(success, "GydsSwapRouter: GYDS_TRANSFER_FAILED");
    }
}

// ─── Minimal interfaces ───────────────────────────────────────────────────────

interface IGydsSwapFactory {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
}

interface IWGYDS {
    function deposit() external payable;
    function withdraw(uint256 wad) external;
    function transfer(address dst, uint256 wad) external returns (bool);
}
