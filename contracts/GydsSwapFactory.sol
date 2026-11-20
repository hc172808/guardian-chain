// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./GydsSwapPair.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title GydsSwapFactory
/// @notice Deploys new GydsSwapPair contracts and maintains the registry.
///         One pair per (tokenA, tokenB) tuple — order-independent.
///
/// Supported pairs on GydsChain (Chain ID 198282):
///   GYDS / USDT  →  GLP-GYDS-USDT
///   GYDS / BTC   →  GLP-GYDS-BTC
///   GYDS / ETH   →  GLP-GYDS-ETH
///   GYDS / USDC  →  GLP-GYDS-USDC
contract GydsSwapFactory {

    uint256 public constant Q112 = 2 ** 112;
    uint32 public constant MARKET_CAP_TWAP_WINDOW = 30 minutes;
    uint256 public constant MIN_MARKET_CAP_USD_E18 = 10_000 * 1e18;

    // ─── State ───────────────────────────────────────────────────────────────

    /// @notice Address that receives 0.05% protocol fee (0 = fees off)
    address public feeTo;

    /// @notice Address authorized to change feeTo
    address public feeToSetter;

    /// @notice Wrapped native token and USD-reference stablecoin used for pricing.
    address public immutable wrappedNative;
    address public immutable usdStablecoin;

    /// @notice Assets exempt from the launch-token trading gate (e.g. USDT).
    mapping(address => bool) public trustedTokens;

    /// @notice Tokens registered as launches by their creators.
    mapping(address => bool) public launchTokens;

    /// @notice The launch token whose threshold controls each non-base pair.
    mapping(address => address) public pairGateToken;

    /// @notice Once a launch token reaches the threshold, its trading unlock is permanent.
    mapping(address => bool) public marketCapUnlocked;

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
    event LaunchTokenRegistered(address indexed token);
    event TrustedTokenUpdated(address indexed token, bool trusted);
    event MarketCapTradingUnlocked(address indexed token, uint256 marketCapUsdE18);

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor(address _feeToSetter, address _wrappedNative, address _usdStablecoin) {
        require(_feeToSetter != address(0), "GydsSwap: ZERO_FEE_SETTER");
        require(_wrappedNative != address(0) && _usdStablecoin != address(0), "GydsSwap: ZERO_ORACLE_TOKEN");
        require(_wrappedNative != _usdStablecoin, "GydsSwap: IDENTICAL_ORACLE_TOKENS");
        feeToSetter = _feeToSetter;
        wrappedNative = _wrappedNative;
        usdStablecoin = _usdStablecoin;
        trustedTokens[_wrappedNative] = true;
        trustedTokens[_usdStablecoin] = true;
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

    /// @notice Live on-chain market cap in USD, scaled to 18 decimals.
    /// @dev Uses totalSupply as circulating supply (burns reduce totalSupply).
    function getMarketCapUsdE18(address token) public view returns (uint256) {
        return _getMarketCapUsdE18(token);
    }

    /// @notice Whether swaps through a registered pair are currently allowed.
    function isPairTradeAllowed(address tokenA, address tokenB) public view returns (bool) {
        address pair = getPair[tokenA][tokenB];
        if (pair == address(0)) return false;

        address gateToken = pairGateToken[pair];
        if (gateToken == address(0) || trustedTokens[gateToken] || marketCapUnlocked[gateToken]) {
            return true;
        }
        return _getMarketCapUsdE18(gateToken) >= MIN_MARKET_CAP_USD_E18;
    }

    /// @notice Register a deployed token so its non-WGYDS pairs are threshold-gated.
    /// @dev Permissionless registration cannot unlock trading; it only opts a token into the gate.
    function registerLaunchToken(address token) external {
        require(token != address(0) && token.code.length > 0, "GydsSwap: INVALID_LAUNCH_TOKEN");
        require(token != wrappedNative && token != usdStablecoin, "GydsSwap: ORACLE_TOKEN");
        require(!trustedTokens[token], "GydsSwap: TRUSTED_TOKEN");
        launchTokens[token] = true;
        emit LaunchTokenRegistered(token);
    }

    /// @notice Admin may exempt established quote assets from the launch gate.
    function setTrustedToken(address token, bool trusted) external {
        require(msg.sender == feeToSetter, "GydsSwap: FORBIDDEN");
        require(token != address(0), "GydsSwap: ZERO_ADDRESS");
        trustedTokens[token] = trusted;
        emit TrustedTokenUpdated(token, trusted);
    }

    /// @notice Pair-only check that permanently records the first successful threshold crossing.
    function enforcePairTrade(address tokenA, address tokenB) external returns (bool) {
        address pair = getPair[tokenA][tokenB];
        require(pair != address(0) && msg.sender == pair, "GydsSwap: CALLER_NOT_PAIR");

        address gateToken = pairGateToken[pair];
        if (gateToken == address(0) || trustedTokens[gateToken] || marketCapUnlocked[gateToken]) {
            return true;
        }

        uint256 marketCap = _getMarketCapUsdE18(gateToken);
        if (marketCap < MIN_MARKET_CAP_USD_E18) return false;

        marketCapUnlocked[gateToken] = true;
        emit MarketCapTradingUnlocked(gateToken, marketCap);
        return true;
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
        address gateToken = _resolvePairGate(tokenA, tokenB);
        return _createPair(tokenA, tokenB, sym0, sym1, gateToken);
    }

    /// @notice Create a pair and explicitly choose which registered launch token controls its gate.
    function createPairForLaunch(
        address tokenA,
        address tokenB,
        string calldata sym0,
        string calldata sym1,
        address launchToken
    ) external returns (address pair) {
        require(launchToken == tokenA || launchToken == tokenB, "GydsSwap: GATE_TOKEN_NOT_IN_PAIR");
        require(launchTokens[launchToken] && !trustedTokens[launchToken], "GydsSwap: TOKEN_NOT_REGISTERED");
        require(tokenA != wrappedNative && tokenB != wrappedNative, "GydsSwap: BASE_PAIR_NOT_GATED");
        return _createPair(tokenA, tokenB, sym0, sym1, launchToken);
    }

    function _createPair(
        address tokenA,
        address tokenB,
        string memory sym0,
        string memory sym1,
        address gateToken
    ) private returns (address pair) {
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
        pairGateToken[pair] = gateToken;
        allPairs.push(pair);

        emit PairCreated(token0, token1, pair, allPairs.length);
    }

    function _resolvePairGate(address tokenA, address tokenB) private view returns (address) {
        // The WGYDS market is the bootstrap price-discovery market for new launches.
        if (tokenA == wrappedNative || tokenB == wrappedNative) return address(0);

        bool launchA = launchTokens[tokenA] && !trustedTokens[tokenA];
        bool launchB = launchTokens[tokenB] && !trustedTokens[tokenB];
        if (launchA) return tokenA;
        if (launchB) return tokenB;
        if (trustedTokens[tokenA] && trustedTokens[tokenB]) return address(0);

        revert("GydsSwap: TOKEN_NOT_REGISTERED");
    }

    function _getMarketCapUsdE18(address token) private view returns (uint256) {
        address tokenBasePair = getPair[token][wrappedNative];
        address baseUsdPair = getPair[wrappedNative][usdStablecoin];
        if (tokenBasePair == address(0) || baseUsdPair == address(0)) return 0;

        uint256 tokenPriceInBaseX112;
        uint256 basePriceInUsdX112;
        bool tokenPriceReady;
        bool basePriceReady;
        try IMarketCapOraclePair(tokenBasePair).getTwapPrice(token, MARKET_CAP_TWAP_WINDOW)
            returns (uint256 price, bool ready)
        {
            tokenPriceInBaseX112 = price;
            tokenPriceReady = ready;
        } catch {
            return 0;
        }
        try IMarketCapOraclePair(baseUsdPair).getTwapPrice(wrappedNative, MARKET_CAP_TWAP_WINDOW)
            returns (uint256 price, bool ready)
        {
            basePriceInUsdX112 = price;
            basePriceReady = ready;
        } catch {
            return 0;
        }
        if (!tokenPriceReady || !basePriceReady) return 0;

        uint256 supply;
        uint8 usdDecimals;
        try IMarketCapToken(token).totalSupply() returns (uint256 value) {
            supply = value;
        } catch {
            return 0;
        }
        try IMarketCapToken(usdStablecoin).decimals() returns (uint8 value) {
            usdDecimals = value;
        } catch {
            return 0;
        }
        if (usdDecimals > 36) return 0;

        uint256 supplyInBase = Math.mulDiv(supply, tokenPriceInBaseX112, Q112);
        uint256 supplyInUsdRaw = Math.mulDiv(supplyInBase, basePriceInUsdX112, Q112);
        return Math.mulDiv(supplyInUsdRaw, 1e18, 10 ** uint256(usdDecimals));
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

interface IMarketCapToken {
    function totalSupply() external view returns (uint256);
    function decimals() external view returns (uint8);
}

interface IMarketCapOraclePair {
    function getTwapPrice(address baseToken, uint32 minWindow)
        external view returns (uint256 priceX112, bool ready);
}
