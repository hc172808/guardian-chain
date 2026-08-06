// GYDSchain Contract Addresses
// Fill in after deployment with Hardhat/Truffle. All addresses are placeholders
// for the GydsSwap ecosystem (Uniswap V2 style AMM) on Chain ID 198282.

export const CONTRACT_ADDRESSES = {
  // Mainnet (Chain ID 198282)
  mainnet: {
    // GydsSwap core contracts
    WGYDS:      '0x0000000000000000000000000000000000000000', // Wrapped GYDS (native coin wrapper)
    Factory:    '0x0000000000000000000000000000000000000000', // GydsSwapFactory
    Router:     '0x0000000000000000000000000000000000000000', // GydsSwapRouter
    Farm:       '0x0000000000000000000000000000000000000000', // GydsSwapFarm

    // LP tokens (populated by factory after pair creation)
    // GLP-GYDS-USDT, GLP-GYDS-BTC, GLP-GYDS-ETH, GLP-GYDS-USDC
    Pairs: {
      'GYDS-USDT': '0x0000000000000000000000000000000000000000',
      'GYDS-BTC':  '0x0000000000000000000000000000000000000000',
      'GYDS-ETH':  '0x0000000000000000000000000000000000000000',
      'GYDS-USDC': '0x0000000000000000000000000000000000000000',
    },

    // Other tokens
    USDT: '0x0000000000000000000000000000000000000000',
    USDC: '0x0000000000000000000000000000000000000000',
    WBTC: '0x0000000000000000000000000000000000000000',
    WETH: '0x0000000000000000000000000000000000000000',
  },

  // Testnet (Chain ID 13371)
  testnet: {
    WGYDS:      '0x0000000000000000000000000000000000000000',
    Factory:    '0x0000000000000000000000000000000000000000',
    Router:     '0x0000000000000000000000000000000000000000',
    Farm:       '0x0000000000000000000000000000000000000000',
    Pairs: {
      'GYDS-USDT': '0x0000000000000000000000000000000000000000',
      'GYDS-BTC':  '0x0000000000000000000000000000000000000000',
      'GYDS-ETH':  '0x0000000000000000000000000000000000000000',
      'GYDS-USDC': '0x0000000000000000000000000000000000000000',
    },
  },
};

// Minimal ABI fragments for ethers.js interaction
// Full ABIs are in /contracts/*.sol; these are the JS-callable functions.
export const ROUTER_ABI = [
  // View functions
  'function factory() external view returns (address)',
  'function WGYDS() external view returns (address)',
  'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)',
  'function getAmountsIn(uint amountOut, address[] calldata path) external view returns (uint[] memory amounts)',
  'function quote(uint amountA, uint reserveA, uint reserveB) external pure returns (uint amountB)',
  'function getAmountOut(uint amountIn, uint reserveIn, uint reserveOut) external pure returns (uint amountOut)',
  'function getAmountIn(uint amountOut, uint reserveIn, uint reserveOut) external pure returns (uint amountIn)',

  // Swap functions
  'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
  'function swapTokensForExactTokens(uint amountOut, uint amountInMax, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
  'function swapExactGYDSForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)',
  'function swapExactTokensForGYDS(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
  'function swapGYDSForExactTokens(uint amountOut, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)',
  'function swapTokensForExactGYDS(uint amountOut, uint amountInMax, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',

  // Liquidity functions
  'function addLiquidity(address tokenA, address tokenB, uint amountADesired, uint amountBDesired, uint amountAMin, uint amountBMin, address to, uint deadline) external returns (uint amountA, uint amountB, uint liquidity)',
  'function addLiquidityGYDS(address token, uint amountTokenDesired, uint amountTokenMin, uint amountGYDSMin, address to, uint deadline) external payable returns (uint amountToken, uint amountGYDS, uint liquidity)',
  'function removeLiquidity(address tokenA, address tokenB, uint liquidity, uint amountAMin, uint amountBMin, address to, uint deadline) external returns (uint amountA, uint amountB)',
  'function removeLiquidityGYDS(address token, uint liquidity, uint amountTokenMin, uint amountGYDSMin, address to, uint deadline) external returns (uint amountToken, uint amountGYDS)',
];

export const FACTORY_ABI = [
  'function getPair(address tokenA, address tokenB) external view returns (address pair)',
  'function allPairs(uint) external view returns (address)',
  'function allPairsLength() external view returns (uint)',
  'function getAllPairs() external view returns (address[] memory)',
  'function feeTo() external view returns (address)',
  'function createPair(address tokenA, address tokenB, string calldata sym0, string calldata sym1) external returns (address pair)',
  'event PairCreated(address indexed token0, address indexed token1, address pair, uint256 pairIndex)',
];

export const PAIR_ABI = [
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function lpToken() external view returns (address)',
  'function totalSupply() external view returns (uint)',
  'function balanceOf(address) external view returns (uint)',
  'function mint(address to) external returns (uint liquidity)',
  'function burn(address to) external returns (uint amount0, uint amount1)',
  'function swap(uint amount0Out, uint amount1Out, address to, bytes calldata data) external',
  'event Sync(uint112 reserve0, uint112 reserve1)',
  'event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)',
];

export const FARM_ABI = [
  'function poolLength() external view returns (uint256)',
  'function poolInfo(uint256) external view returns (address lpToken, uint256 allocPoints, uint256 lastRewardTime, uint256 accGydsPerShare, bool active)',
  'function userInfo(uint256 pid, address user) external view returns (uint256 amount, uint256 rewardDebt, uint256 pendingHarvest)',
  'function pendingRewards(uint256 pid, address user) external view returns (uint256)',
  'function deposit(uint256 pid, uint256 amount) external',
  'function withdraw(uint256 pid, uint256 amount) external',
  'function harvest(uint256 pid) external',
  'function emergencyWithdraw(uint256 pid) external',
  'function gydsPerSecond() external view returns (uint256)',
  'function totalAllocPoints() external view returns (uint256)',
];

export const ERC20_ABI = [
  'function name() external view returns (string)',
  'function symbol() external view returns (string)',
  'function decimals() external view returns (uint8)',
  'function totalSupply() external view returns (uint)',
  'function balanceOf(address account) external view returns (uint)',
  'function transfer(address to, uint amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint)',
  'function approve(address spender, uint amount) external returns (bool)',
  'function transferFrom(address from, address to, uint amount) external returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint amount)',
  'event Approval(address indexed owner, address indexed spender, uint amount)',
];

// INIT_CODE_HASH for pairFor() in GydsSwapLibrary
// Update this after deploying GydsSwapPair and computing keccak256(creationCode)
export const INIT_CODE_HASH = '0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f';

// Fee tier: 0.3% = 30 bps
export const SWAP_FEE_BPS = 30;
export const SWAP_FEE_NUMERATOR = 997;
export const SWAP_FEE_DENOMINATOR = 1000;
