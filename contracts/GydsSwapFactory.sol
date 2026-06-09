// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./GydsSwapPair.sol";

/// @title GydsSwapFactory
/// @notice Deploys new GydsSwapPair contracts and maintains the registry.
///         One pair per (tokenA, tokenB) tuple — order-independent.
///
/// Supported pairs on GydsChain (Chain ID 13370):
///   GYDS / USDT  →  GLP-GYDS-USDT
///   GYDS / BTC   →  GLP-GYDS-BTC
///   GYDS / ETH   →  GLP-GYDS-ETH
///   GYDS / USDC  →  GLP-GYDS-USDC
contract GydsSwapFactory {

    // ─── State ───────────────────────────────────────────────────────────────

    /// @notice Address that receives 0.05% protocol fee (0 = fees off)
    address public feeTo;

    /// @notice Address authorized to change feeTo
    address public feeToSetter;

    /// @notice token0 → token1 → pair address (token0 < token1 always)
    mapping(address => mapping(address => address)) public getPair;

    /// @notice All deployed pair addresses in creation order
    address[] public allPairs;

    // ─── Events ──────────────────────────────────────────────────────────────

    event PairCreated(
        address indexed token0,
        address indexed token1,
        address pair,
        uint256 pairIndex
    );

    event FeeToUpdated(address indexed oldFeeTo, address indexed newFeeTo);
    event FeeToSetterUpdated(address indexed oldSetter, address indexed newSetter);

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor(address _feeToSetter) {
        feeToSetter = _feeToSetter;
    }

    // ─── View ────────────────────────────────────────────────────────────────

    /// @notice Total number of pairs ever created
    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }

    /// @notice Get full list of all pair addresses
    function getAllPairs() external view returns (address[] memory) {
        return allPairs;
    }

    // ─── Create pair ─────────────────────────────────────────────────────────

    /// @notice Deploy a new pair for tokenA / tokenB.
    ///         The LP token symbol is derived from the token symbols: GLP-{SYM0}-{SYM1}
    /// @param tokenA First token address
    /// @param tokenB Second token address
    /// @param sym0   Symbol of the lower-address token (e.g. "GYDS")
    /// @param sym1   Symbol of the higher-address token (e.g. "USDT")
    /// @return pair  Address of the new GydsSwapPair
    function createPair(
        address tokenA,
        address tokenB,
        string calldata sym0,
        string calldata sym1
    ) external returns (address pair) {
        require(tokenA != tokenB, "GydsSwap: IDENTICAL_ADDRESSES");
        (address token0, address token1) = tokenA < tokenB
            ? (tokenA, tokenB)
            : (tokenB, tokenA);
        require(token0 != address(0), "GydsSwap: ZERO_ADDRESS");
        require(getPair[token0][token1] == address(0), "GydsSwap: PAIR_EXISTS");

        // Determine LP symbol based on sorted order
        string memory lpSym;
        if (tokenA < tokenB) {
            lpSym = string(abi.encodePacked("GLP-", sym0, "-", sym1));
        } else {
            lpSym = string(abi.encodePacked("GLP-", sym1, "-", sym0));
        }

        bytes memory bytecode = type(GydsSwapPair).creationCode;
        bytes32 salt = keccak256(abi.encodePacked(token0, token1));
        assembly {
            pair := create2(0, add(bytecode, 32), mload(bytecode), salt)
        }
        require(pair != address(0), "GydsSwap: PAIR_CREATION_FAILED");

        GydsSwapPair(pair).initialize(token0, token1, lpSym);

        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair; // both directions point to the same pair
        allPairs.push(pair);

        emit PairCreated(token0, token1, pair, allPairs.length);
    }

    // ─── Admin ───────────────────────────────────────────────────────────────

    /// @notice Set the protocol fee recipient address (0 = disable protocol fee)
    function setFeeTo(address _feeTo) external {
        require(msg.sender == feeToSetter, "GydsSwap: FORBIDDEN");
        emit FeeToUpdated(feeTo, _feeTo);
        feeTo = _feeTo;
    }

    /// @notice Transfer the fee-setter role to a new address
    function setFeeToSetter(address _feeToSetter) external {
        require(msg.sender == feeToSetter, "GydsSwap: FORBIDDEN");
        require(_feeToSetter != address(0), "GydsSwap: ZERO_ADDRESS");
        emit FeeToSetterUpdated(feeToSetter, _feeToSetter);
        feeToSetter = _feeToSetter;
    }
}
