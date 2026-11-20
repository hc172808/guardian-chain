// GydsSwap Contract Integration
// Uses ethers.js to interact with the GydsSwapRouter, Factory, Pair, and Farm
// contracts on the GYDSchain (Chain ID 198282).

import { ethers } from 'ethers';
import { ALL_RPC_ENDPOINTS } from '@/config/network';
import {
  CONTRACT_ADDRESSES,
  ROUTER_ABI,
  FACTORY_ABI,
  PAIR_ABI,
  FARM_ABI,
  ERC20_ABI,
  SWAP_FEE_NUMERATOR,
  SWAP_FEE_DENOMINATOR,
} from '@/config/contracts';
import { getEthereumProvider, NETWORK_CONFIG } from '@/config/network';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// ── Provider / Signer helpers ───────────────────────────────────────────────

export function getProvider(): ethers.JsonRpcProvider | null {
  for (const url of ALL_RPC_ENDPOINTS) {
    try {
      return new ethers.JsonRpcProvider(url, undefined, { polling: false });
    } catch {
      continue;
    }
  }
  return null;
}

export function getSigner(): ethers.Signer | null {
  const eth = (window as any).ethereum;
  if (!eth) return null;
  const provider = new ethers.BrowserProvider(eth);
  // Signer must be requested via eth_requestAccounts first
  return null; // Will be populated after connectWallet()
}

export async function getConnectedSigner(): Promise<ethers.Signer | null> {
  const eth = getEthereumProvider();
  if (!eth) throw new Error('No EVM wallet is connected. Open this page in your wallet browser or install a supported wallet.');
  const accounts = await eth.request({ method: 'eth_requestAccounts' });
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error('No wallet account was authorized.');
  }
  const provider = new ethers.BrowserProvider(eth as any);
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== NETWORK_CONFIG.chainId) {
    throw new Error(`Switch your wallet to ${NETWORK_CONFIG.chainName} (chain ${NETWORK_CONFIG.chainId}) before continuing.`);
  }
  return provider.getSigner(accounts[0]);
}

export async function getAuthorizedWalletAddress(): Promise<string | null> {
  const eth = getEthereumProvider();
  if (!eth) return null;
  try {
    const accounts = await eth.request({ method: 'eth_accounts' });
    return Array.isArray(accounts) && ethers.isAddress(accounts[0]) ? accounts[0] : null;
  } catch {
    return null;
  }
}

// ── Contract instances (read-only) ───────────────────────────────────────────

function getRouter() {
  const provider = getProvider();
  if (!provider) return null;
  const addr = CONTRACT_ADDRESSES.mainnet.Router;
  if (addr === '0x0000000000000000000000000000000000000000') return null;
  return new ethers.Contract(addr, ROUTER_ABI, provider);
}

function getFactory() {
  const provider = getProvider();
  if (!provider) return null;
  const addr = CONTRACT_ADDRESSES.mainnet.Factory;
  if (addr === '0x0000000000000000000000000000000000000000') return null;
  return new ethers.Contract(addr, FACTORY_ABI, provider);
}

export async function getPairAddress(tokenA: string, tokenB: string): Promise<string | null> {
  const factory = getFactory();
  if (!factory || !ethers.isAddress(tokenA) || !ethers.isAddress(tokenB)) return null;
  try {
    const pair = await factory.getPair(tokenA, tokenB);
    return ethers.isAddress(pair) && pair.toLowerCase() !== ZERO_ADDRESS ? pair : null;
  } catch {
    return null;
  }
}

function getPair(tokenA: string, tokenB: string) {
  const provider = getProvider();
  if (!provider) return null;
  const factory = getFactory();
  if (!factory) return null;
  // pair address from factory
  return null; // async call needed
}

function getFarm() {
  const provider = getProvider();
  if (!provider) return null;
  const addr = CONTRACT_ADDRESSES.mainnet.Farm;
  if (addr === '0x0000000000000000000000000000000000000000') return null;
  return new ethers.Contract(addr, FARM_ABI, provider);
}

// ── Price / Quote helpers (pure math, no contract calls) ─────────────────────

/**
 * Compute the output amount for a constant-product AMM swap.
 * Uses the same formula as GydsSwapLibrary.getAmountOut:
 *   amountOut = (amountIn * 997 * reserveOut) / (reserveIn * 1000 + amountIn * 997)
 */
export function getAmountOut(
  amountIn: string | number,
  reserveIn: string | number,
  reserveOut: string | number
): string {
  const ain = parseFloat(String(amountIn));
  const rin = parseFloat(String(reserveIn));
  const rout = parseFloat(String(reserveOut));
  if (!ain || !rin || !rout) return '0';
  const amountInWithFee = ain * SWAP_FEE_NUMERATOR;
  const numerator = amountInWithFee * rout;
  const denominator = rin * SWAP_FEE_DENOMINATOR + amountInWithFee;
  return (numerator / denominator).toString();
}

/**
 * Compute the input amount needed for a desired output.
 * Uses the same formula as GydsSwapLibrary.getAmountIn:
 *   amountIn = (reserveIn * amountOut * 1000) / ((reserveOut - amountOut) * 997) + 1
 */
export function getAmountIn(
  amountOut: string | number,
  reserveIn: string | number,
  reserveOut: string | number
): string {
  const aout = parseFloat(String(amountOut));
  const rin = parseFloat(String(reserveIn));
  const rout = parseFloat(String(reserveOut));
  if (!aout || !rin || !rout || aout >= rout) return '0';
  const numerator = rin * aout * SWAP_FEE_DENOMINATOR;
  const denominator = (rout - aout) * SWAP_FEE_NUMERATOR;
  return (numerator / denominator + 1).toString();
}

/**
 * Quote the proportional second amount for liquidity provision.
 * amountB = (amountA * reserveB) / reserveA
 */
export function quoteLiquidity(
  amountA: string | number,
  reserveA: string | number,
  reserveB: string | number
): string {
  const aa = parseFloat(String(amountA));
  const ra = parseFloat(String(reserveA));
  const rb = parseFloat(String(reserveB));
  if (!aa || !ra || !rb) return '0';
  return ((aa * rb) / ra).toString();
}

// ── On-chain read helpers (async) ───────────────────────────────────────────

export interface PairReserves {
  reserve0: string;
  reserve1: string;
  blockTimestampLast: number;
}

export async function getPairReserves(pairAddress: string): Promise<PairReserves | null> {
  const provider = getProvider();
  if (!provider) return null;
  try {
    const pair = new ethers.Contract(pairAddress, PAIR_ABI, provider);
    const [r0, r1, ts] = await pair.getReserves();
    return {
      reserve0: r0.toString(),
      reserve1: r1.toString(),
      blockTimestampLast: Number(ts),
    };
  } catch {
    return null;
  }
}

export async function getPairInfo(pairAddress: string) {
  const provider = getProvider();
  if (!provider) return null;
  try {
    const pair = new ethers.Contract(pairAddress, PAIR_ABI, provider);
    const [t0, t1, lp, total] = await Promise.all([
      pair.token0(),
      pair.token1(),
      pair.lpToken(),
      pair.totalSupply(),
    ]);
    return { token0: t0, token1: t1, lpToken: lp, totalSupply: total.toString() };
  } catch {
    return null;
  }
}

export async function getTokenBalance(tokenAddress: string, account: string): Promise<string> {
  if (tokenAddress === '0x0000000000000000000000000000000000000000') {
    // Native GYDS — use eth_getBalance
    const provider = getProvider();
    if (!provider) return '0';
    try {
      const bal = await provider.getBalance(account);
      return ethers.formatEther(bal);
    } catch {
      return '0';
    }
  }
  const provider = getProvider();
  if (!provider) return '0';
  try {
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const bal = await token.balanceOf(account);
    const decimals = await token.decimals().catch(() => 18);
    return ethers.formatUnits(bal, decimals);
  } catch {
    return '0';
  }
}

export async function getTokenDecimals(tokenAddress: string): Promise<number> {
  const provider = getProvider();
  if (!provider) return 18;
  try {
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    return await token.decimals();
  } catch {
    return 18;
  }
}

export interface ExactInputQuote {
  amountInRaw: string;
  amountOutRaw: string;
  amountOut: string;
  inputDecimals: number;
  outputDecimals: number;
  path: string[];
}

/**
 * Get an executable quote from the configured on-chain router. Native GYDS is
 * represented by WGYDS inside the AMM path, while the wallet still sends GYDS.
 */
export async function getSwapQuoteExactIn(
  amountIn: string,
  tokenIn: string,
  tokenOut: string,
): Promise<ExactInputQuote | null> {
  const router = getRouter();
  if (!router) return null;
  const native = '0x0000000000000000000000000000000000000000';
  const wrapped = CONTRACT_ADDRESSES.mainnet.WGYDS;
  const path = buildSwapPath(
    tokenIn.toLowerCase() === native ? wrapped : tokenIn,
    tokenOut.toLowerCase() === native ? wrapped : tokenOut,
  );
  if (path.length < 2 || path.some(address => !ethers.isAddress(address))) return null;

  try {
    const inputDecimals = tokenIn.toLowerCase() === native ? 18 : await getTokenDecimals(tokenIn);
    const outputDecimals = tokenOut.toLowerCase() === native ? 18 : await getTokenDecimals(tokenOut);
    const amountInRaw = ethers.parseUnits(amountIn, inputDecimals);
    const amounts = await router.getAmountsOut(amountInRaw, path);
    const amountOutRaw = BigInt(amounts[amounts.length - 1].toString());
    if (amountOutRaw <= 0n) return null;
    return {
      amountInRaw: amountInRaw.toString(),
      amountOutRaw: amountOutRaw.toString(),
      amountOut: ethers.formatUnits(amountOutRaw, outputDecimals),
      inputDecimals,
      outputDecimals,
      path,
    };
  } catch {
    return null;
  }
}

export async function getTokenSymbol(tokenAddress: string): Promise<string> {
  const provider = getProvider();
  if (!provider) return '???';
  try {
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    return await token.symbol();
  } catch {
    return '???';
  }
}

export async function getTokenName(tokenAddress: string): Promise<string> {
  const provider = getProvider();
  if (!provider) return 'Unknown';
  try {
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    return await token.name();
  } catch {
    return 'Unknown';
  }
}

// ── Swap path helpers ───────────────────────────────────────────────────────

export interface SwapPath {
  path: string[];
  amounts: string[];
}

/**
 * Build a swap path between two tokens. For now, direct pairs only.
 * In production, add multi-hop routing through WGYDS.
 */
export function buildSwapPath(tokenIn: string, tokenOut: string): string[] {
  // Direct path
  if (tokenIn.toLowerCase() !== tokenOut.toLowerCase()) {
    return [tokenIn, tokenOut];
  }
  return [];
}

// ── Farm / Staking helpers ──────────────────────────────────────────────────

export interface PoolInfo {
  pid: number;
  lpToken: string;
  allocPoints: string;
  accGydsPerShare: string;
  active: boolean;
}

export interface UserFarmInfo {
  amount: string;
  rewardDebt: string;
  pendingHarvest: string;
  pendingRewards: string;
}

export async function getFarmPools(): Promise<PoolInfo[]> {
  const farm = getFarm();
  if (!farm) return [];
  try {
    const length = await farm.poolLength();
    const pools: PoolInfo[] = [];
    for (let i = 0; i < length; i++) {
      const p = await farm.poolInfo(i);
      pools.push({
        pid: i,
        lpToken: p.lpToken,
        allocPoints: p.allocPoints.toString(),
        accGydsPerShare: p.accGydsPerShare.toString(),
        active: p.active,
      });
    }
    return pools;
  } catch {
    return [];
  }
}

export async function getUserFarmInfo(pid: number, user: string): Promise<UserFarmInfo | null> {
  const farm = getFarm();
  if (!farm) return null;
  try {
    const [u, pending] = await Promise.all([
      farm.userInfo(pid, user),
      farm.pendingRewards(pid, user),
    ]);
    return {
      amount: u.amount.toString(),
      rewardDebt: u.rewardDebt.toString(),
      pendingHarvest: u.pendingHarvest.toString(),
      pendingRewards: pending.toString(),
    };
  } catch {
    return null;
  }
}

// ── Write helpers (require signer) ──────────────────────────────────────────

export async function approveToken(
  tokenAddress: string,
  spender: string,
  amount: string
): Promise<boolean> {
  const signer = await getConnectedSigner();
  if (!signer) return false;
  try {
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
    const tx = await token.approve(spender, amount);
    await tx.wait();
    return true;
  } catch {
    return false;
  }
}

export async function checkAllowance(tokenAddress: string, owner: string, spender: string): Promise<string> {
  const provider = getProvider();
  if (!provider) return '0';
  try {
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const allowed = await token.allowance(owner, spender);
    return allowed.toString();
  } catch {
    return '0';
  }
}

function getRouterAddress(): string {
  const routerAddress = CONTRACT_ADDRESSES.mainnet.Router;
  if (!ethers.isAddress(routerAddress) || routerAddress.toLowerCase() === ZERO_ADDRESS) {
    throw new Error('GydsSwap Router is not configured for mainnet.');
  }
  return routerAddress;
}

async function waitForTransaction(tx: any): Promise<string> {
  const receipt = await tx.wait();
  if (!receipt || Number(receipt.status) !== 1) {
    throw new Error('The transaction was not confirmed successfully.');
  }
  return receipt.hash ?? tx.hash;
}

async function ensureRouterAllowance(
  signer: ethers.Signer,
  tokenAddress: string,
  amount: bigint,
  routerAddress = getRouterAddress(),
): Promise<void> {
  if (amount <= 0n) throw new Error('Token amount must be greater than zero.');
  const owner = await signer.getAddress();
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
  const allowance = BigInt((await token.allowance(owner, routerAddress)).toString());
  if (allowance < amount) {
    const approval = await token.approve(routerAddress, amount);
    await waitForTransaction(approval);
  }
}

/**
 * Execute a swapExactTokensForTokens on-chain.
 * Returns the transaction hash, or null if the user rejected or it failed.
 */
export async function executeSwapExactTokensForTokens(
  amountIn: string,
  amountOutMin: string,
  path: string[],
  to: string,
  deadline: number
): Promise<string | null> {
  const signer = await getConnectedSigner();
  if (!signer) throw new Error('Connect an EVM wallet to swap.');
  if (path.length < 2) throw new Error('A valid token route is required.');
  const routerAddr = getRouterAddress();
  await ensureRouterAllowance(signer, path[0], BigInt(amountIn), routerAddr);
  const router = new ethers.Contract(routerAddr, ROUTER_ABI, signer);
  const recipient = await signer.getAddress();
  void to;
  const tx = await router.swapExactTokensForTokens(
    amountIn,
    amountOutMin,
    path,
    recipient,
    deadline
  );
  return waitForTransaction(tx);
}

/**
 * Execute a swapExactGYDSForTokens (native coin → token) on-chain.
 */
export async function executeSwapExactGYDSForTokens(
  amountIn: string, // msg.value
  amountOutMin: string,
  path: string[],
  to: string,
  deadline: number
): Promise<string | null> {
  const signer = await getConnectedSigner();
  if (!signer) throw new Error('Connect an EVM wallet to swap.');
  if (path.length < 2 || path[0].toLowerCase() !== CONTRACT_ADDRESSES.mainnet.WGYDS.toLowerCase()) {
    throw new Error('The native GYDS route must start with the configured WGYDS contract.');
  }
  const routerAddr = getRouterAddress();
  const router = new ethers.Contract(routerAddr, ROUTER_ABI, signer);
  const recipient = await signer.getAddress();
  void to;
  const tx = await router.swapExactGYDSForTokens(
    amountOutMin,
    path,
    recipient,
    deadline,
    { value: amountIn }
  );
  return waitForTransaction(tx);
}

/**
 * Execute a token-to-native-GYDS swap.
 */
export async function executeSwapExactTokensForGYDS(
  amountIn: string,
  amountOutMin: string,
  path: string[],
  to: string,
  deadline: number,
): Promise<string | null> {
  const signer = await getConnectedSigner();
  if (!signer) throw new Error('Connect an EVM wallet to swap.');
  if (path.length < 2 || path[path.length - 1].toLowerCase() !== CONTRACT_ADDRESSES.mainnet.WGYDS.toLowerCase()) {
    throw new Error('The native GYDS route must end with the configured WGYDS contract.');
  }
  const routerAddr = getRouterAddress();
  await ensureRouterAllowance(signer, path[0], BigInt(amountIn), routerAddr);
  const router = new ethers.Contract(routerAddr, ROUTER_ABI, signer);
  const recipient = await signer.getAddress();
  void to;
  const tx = await router.swapExactTokensForGYDS(
    amountIn,
    amountOutMin,
    path,
    recipient,
    deadline,
  );
  return waitForTransaction(tx);
}

export async function executeCreatePair(
  tokenA: string,
  tokenB: string,
  symbolA: string,
  symbolB: string,
): Promise<{ pairAddress: string; txHash: string | null }> {
  const signer = await getConnectedSigner();
  if (!signer) throw new Error('Connect an EVM wallet to create a pool.');
  if (!ethers.isAddress(tokenA) || !ethers.isAddress(tokenB) ||
      tokenA.toLowerCase() === tokenB.toLowerCase()) {
    throw new Error('Choose two different deployed token contracts.');
  }
  const factoryAddress = CONTRACT_ADDRESSES.mainnet.Factory;
  if (!ethers.isAddress(factoryAddress) || factoryAddress.toLowerCase() === ZERO_ADDRESS) {
    throw new Error('GydsSwap Factory is not configured for mainnet.');
  }
  const factory = new ethers.Contract(factoryAddress, FACTORY_ABI, signer);
  const existing = await factory.getPair(tokenA, tokenB);
  if (ethers.isAddress(existing) && existing.toLowerCase() !== ZERO_ADDRESS) {
    return { pairAddress: existing, txHash: null };
  }
  const tx = await factory.createPair(tokenA, tokenB, symbolA, symbolB);
  const txHash = await waitForTransaction(tx);
  const pairAddress = await factory.getPair(tokenA, tokenB);
  if (!ethers.isAddress(pairAddress) || pairAddress.toLowerCase() === ZERO_ADDRESS) {
    throw new Error('The pair transaction confirmed, but the factory did not return a pair address.');
  }
  return { pairAddress, txHash };
}

/**
 * Execute addLiquidity on-chain.
 */
export async function executeAddLiquidity(
  tokenA: string,
  tokenB: string,
  amountADesired: string,
  amountBDesired: string,
  amountAMin: string,
  amountBMin: string,
  to: string,
  deadline: number
): Promise<string | null> {
  const signer = await getConnectedSigner();
  if (!signer) throw new Error('Connect an EVM wallet to add liquidity.');
  const routerAddr = getRouterAddress();
  const router = new ethers.Contract(routerAddr, ROUTER_ABI, signer);
  const recipient = await signer.getAddress();
  void to;

  if (tokenA.toLowerCase() === ZERO_ADDRESS) {
    await ensureRouterAllowance(signer, tokenB, BigInt(amountBDesired), routerAddr);
    const tx = await router.addLiquidityGYDS(
      tokenB,
      amountBDesired,
      amountBMin,
      amountAMin,
      recipient,
      deadline,
      { value: amountADesired },
    );
    return waitForTransaction(tx);
  }
  if (tokenB.toLowerCase() === ZERO_ADDRESS) {
    await ensureRouterAllowance(signer, tokenA, BigInt(amountADesired), routerAddr);
    const tx = await router.addLiquidityGYDS(
      tokenA,
      amountADesired,
      amountAMin,
      amountBMin,
      recipient,
      deadline,
      { value: amountBDesired },
    );
    return waitForTransaction(tx);
  }

  await ensureRouterAllowance(signer, tokenA, BigInt(amountADesired), routerAddr);
  await ensureRouterAllowance(signer, tokenB, BigInt(amountBDesired), routerAddr);
  const tx = await router.addLiquidity(
    tokenA, tokenB,
    amountADesired, amountBDesired,
    amountAMin, amountBMin,
    recipient, deadline
  );
  return waitForTransaction(tx);
}

/**
 * Execute removeLiquidity on-chain.
 */
export async function executeRemoveLiquidity(
  tokenA: string,
  tokenB: string,
  liquidity: string,
  amountAMin: string,
  amountBMin: string,
  to: string,
  deadline: number,
  connectedSigner?: ethers.Signer,
): Promise<string | null> {
  const signer = connectedSigner ?? await getConnectedSigner();
  if (!signer) throw new Error('Connect an EVM wallet to remove liquidity.');
  const routerAddr = getRouterAddress();
  const wrapped = CONTRACT_ADDRESSES.mainnet.WGYDS;
  const nativeA = tokenA.toLowerCase() === ZERO_ADDRESS;
  const nativeB = tokenB.toLowerCase() === ZERO_ADDRESS;
  const contractA = nativeA ? wrapped : tokenA;
  const contractB = nativeB ? wrapped : tokenB;
  const pairAddress = await getPairAddress(contractA, contractB);
  if (!pairAddress) throw new Error('No on-chain pair exists for these tokens.');
  const pairInfo = await getPairInfo(pairAddress);
  if (!pairInfo?.lpToken) throw new Error('Could not read the pool LP token.');
  await ensureRouterAllowance(signer, pairInfo.lpToken, BigInt(liquidity), routerAddr);
  const router = new ethers.Contract(routerAddr, ROUTER_ABI, signer);
  const recipient = await signer.getAddress();
  void to;

  if (nativeA || nativeB) {
    const token = nativeA ? tokenB : tokenA;
    const amountTokenMin = nativeA ? amountBMin : amountAMin;
    const amountGYDSMin = nativeA ? amountAMin : amountBMin;
    const tx = await router.removeLiquidityGYDS(
      token,
      liquidity,
      amountTokenMin,
      amountGYDSMin,
      recipient,
      deadline,
    );
    return waitForTransaction(tx);
  }

  const tx = await router.removeLiquidity(
    tokenA, tokenB,
    liquidity,
    amountAMin, amountBMin,
    recipient, deadline
  );
  return waitForTransaction(tx);
}

export async function executeRemoveLiquidityPercent(
  tokenA: string,
  tokenB: string,
  percent: number,
): Promise<string> {
  if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
    throw new Error('Choose a removal amount from 1% to 100%.');
  }
  const signer = await getConnectedSigner();
  if (!signer) throw new Error('Connect an EVM wallet to remove liquidity.');
  const contractA = tokenA.toLowerCase() === ZERO_ADDRESS ? CONTRACT_ADDRESSES.mainnet.WGYDS : tokenA;
  const contractB = tokenB.toLowerCase() === ZERO_ADDRESS ? CONTRACT_ADDRESSES.mainnet.WGYDS : tokenB;
  const pairAddress = await getPairAddress(contractA, contractB);
  if (!pairAddress) throw new Error('No on-chain pair exists for these tokens.');
  const pairInfo = await getPairInfo(pairAddress);
  const reserves = await getPairReserves(pairAddress);
  if (!pairInfo?.lpToken || !reserves) throw new Error('Could not read the pool reserves or LP token.');
  const lpToken = new ethers.Contract(pairInfo.lpToken, ERC20_ABI, signer);
  const owner = await signer.getAddress();
  const [balanceRaw, supplyRaw] = await Promise.all([
    lpToken.balanceOf(owner),
    lpToken.totalSupply(),
  ]);
  const balance = BigInt(balanceRaw.toString());
  const supply = BigInt(supplyRaw.toString());
  const liquidity = balance * BigInt(percent) / 100n;
  if (liquidity <= 0n || supply <= 0n) {
    throw new Error('This wallet has no LP tokens to remove from the selected pool.');
  }

  const reserve0 = BigInt(reserves.reserve0);
  const reserve1 = BigInt(reserves.reserve1);
  const tokenAReserve = pairInfo.token0.toLowerCase() === contractA.toLowerCase() ? reserve0 : reserve1;
  const tokenBReserve = pairInfo.token0.toLowerCase() === contractB.toLowerCase() ? reserve0 : reserve1;
  const amountAMin = tokenAReserve * liquidity / supply * 995n / 1000n;
  const amountBMin = tokenBReserve * liquidity / supply * 995n / 1000n;
  return (await executeRemoveLiquidity(
    tokenA,
    tokenB,
    liquidity.toString(),
    amountAMin.toString(),
    amountBMin.toString(),
    owner,
    Math.floor(Date.now() / 1000) + 600,
    signer,
  )) ?? '';
}

/**
 * Execute deposit (stake LP tokens) on the Farm.
 */
export async function executeFarmDeposit(pid: number, amount: string): Promise<string | null> {
  const signer = await getConnectedSigner();
  if (!signer) return null;
  const farmAddr = CONTRACT_ADDRESSES.mainnet.Farm;
  if (farmAddr === '0x0000000000000000000000000000000000000000') return null;
  try {
    const farm = new ethers.Contract(farmAddr, FARM_ABI, signer);
    const tx = await farm.deposit(pid, amount);
    const receipt = await tx.wait();
    return receipt?.hash ?? tx.hash;
  } catch {
    return null;
  }
}

/**
 * Execute withdraw (unstake LP tokens) on the Farm.
 */
export async function executeFarmWithdraw(pid: number, amount: string): Promise<string | null> {
  const signer = await getConnectedSigner();
  if (!signer) return null;
  const farmAddr = CONTRACT_ADDRESSES.mainnet.Farm;
  if (farmAddr === '0x0000000000000000000000000000000000000000') return null;
  try {
    const farm = new ethers.Contract(farmAddr, FARM_ABI, signer);
    const tx = await farm.withdraw(pid, amount);
    const receipt = await tx.wait();
    return receipt?.hash ?? tx.hash;
  } catch {
    return null;
  }
}

/**
 * Execute harvest (claim rewards) on the Farm.
 */
export async function executeFarmHarvest(pid: number): Promise<string | null> {
  const signer = await getConnectedSigner();
  if (!signer) return null;
  const farmAddr = CONTRACT_ADDRESSES.mainnet.Farm;
  if (farmAddr === '0x0000000000000000000000000000000000000000') return null;
  try {
    const farm = new ethers.Contract(farmAddr, FARM_ABI, signer);
    const tx = await farm.harvest(pid);
    const receipt = await tx.wait();
    return receipt?.hash ?? tx.hash;
  } catch {
    return null;
  }
}
