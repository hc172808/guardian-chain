// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title GydsSwapLibrary
/// @notice Pure math helpers for the GydsSwap AMM (Uniswap V2 style)
/// @dev All functions are pure — no state reads
library GydsSwapLibrary {

    // ─── Sorting ────────────────────────────────────────────────────────────

    /// @notice Sort two token addresses deterministically (lower first)
    function sortTokens(address tokenA, address tokenB)
        internal pure returns (address token0, address token1)
    {
        require(tokenA != tokenB, "GydsSwap: IDENTICAL_ADDRESSES");
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "GydsSwap: ZERO_ADDRESS");
    }

    // ─── Pair address ────────────────────────────────────────────────────────

    /// @notice Compute the CREATE2 address of a pair without any external calls
    function pairFor(address factory, address tokenA, address tokenB)
        internal pure returns (address pair)
    {
        (address token0, address token1) = sortTokens(tokenA, tokenB);
        pair = address(uint160(uint256(keccak256(abi.encodePacked(
            hex"ff",
            factory,
            keccak256(abi.encodePacked(token0, token1)),
            // keccak256 of GydsSwapPair bytecode — update after deployment
            hex"96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f"
        )))));
    }

    // ─── Reserves ────────────────────────────────────────────────────────────

    /// @notice Fetch and sort reserves for a pair
    function getReserves(
        address factory,
        address tokenA,
        address tokenB
    ) internal view returns (uint reserveA, uint reserveB) {
        (address token0,) = sortTokens(tokenA, tokenB);
        (uint reserve0, uint reserve1,) = IGydsSwapPair(pairFor(factory, tokenA, tokenB)).getReserves();
        (reserveA, reserveB) = tokenA == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
    }

    // ─── Quoting ─────────────────────────────────────────────────────────────

    /// @notice Given an amount of tokenA and reserves, return equivalent amount of tokenB
    /// @dev Used when adding liquidity to calculate the proportional second amount
    function quote(uint amountA, uint reserveA, uint reserveB)
        internal pure returns (uint amountB)
    {
        require(amountA > 0, "GydsSwap: INSUFFICIENT_AMOUNT");
        require(reserveA > 0 && reserveB > 0, "GydsSwap: INSUFFICIENT_LIQUIDITY");
        amountB = amountA * reserveB / reserveA;
    }

    // ─── AMM math (0.3% fee) ─────────────────────────────────────────────────

    /// @notice Given an exact input amount, return output amount after 0.3% fee
    /// @dev Uses the constant-product formula: amountOut = (amountIn * 997 * reserveOut) / (reserveIn * 1000 + amountIn * 997)
    function getAmountOut(uint amountIn, uint reserveIn, uint reserveOut)
        internal pure returns (uint amountOut)
    {
        require(amountIn > 0, "GydsSwap: INSUFFICIENT_INPUT_AMOUNT");
        require(reserveIn > 0 && reserveOut > 0, "GydsSwap: INSUFFICIENT_LIQUIDITY");
        uint amountInWithFee = amountIn * 997;
        uint numerator = amountInWithFee * reserveOut;
        uint denominator = reserveIn * 1000 + amountInWithFee;
        amountOut = numerator / denominator;
    }

    /// @notice Given an exact output amount, return required input amount (including 0.3% fee)
    function getAmountIn(uint amountOut, uint reserveIn, uint reserveOut)
        internal pure returns (uint amountIn)
    {
        require(amountOut > 0, "GydsSwap: INSUFFICIENT_OUTPUT_AMOUNT");
        require(reserveIn > 0 && reserveOut > 0, "GydsSwap: INSUFFICIENT_LIQUIDITY");
        uint numerator = reserveIn * amountOut * 1000;
        uint denominator = (reserveOut - amountOut) * 997;
        amountIn = numerator / denominator + 1;
    }

    /// @notice Chained getAmountOut across a multi-hop path
    function getAmountsOut(address factory, uint amountIn, address[] memory path)
        internal view returns (uint[] memory amounts)
    {
        require(path.length >= 2, "GydsSwap: INVALID_PATH");
        amounts = new uint[](path.length);
        amounts[0] = amountIn;
        for (uint i; i < path.length - 1; i++) {
            (uint reserveIn, uint reserveOut) = getReserves(factory, path[i], path[i + 1]);
            amounts[i + 1] = getAmountOut(amounts[i], reserveIn, reserveOut);
        }
    }

    /// @notice Chained getAmountIn across a multi-hop path
    function getAmountsIn(address factory, uint amountOut, address[] memory path)
        internal view returns (uint[] memory amounts)
    {
        require(path.length >= 2, "GydsSwap: INVALID_PATH");
        amounts = new uint[](path.length);
        amounts[amounts.length - 1] = amountOut;
        for (uint i = path.length - 1; i > 0; i--) {
            (uint reserveIn, uint reserveOut) = getReserves(factory, path[i - 1], path[i]);
            amounts[i - 1] = getAmountIn(amounts[i], reserveIn, reserveOut);
        }
    }

    // ─── Babylonian sqrt ─────────────────────────────────────────────────────

    /// @notice Integer square root (Babylonian method)
    function sqrt(uint y) internal pure returns (uint z) {
        if (y > 3) {
            z = y;
            uint x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }

    /// @notice min(a, b)
    function min(uint x, uint y) internal pure returns (uint z) {
        z = x < y ? x : y;
    }
}

/// @dev Minimal interface for pair reserve reads used by the library
interface IGydsSwapPair {
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
}
