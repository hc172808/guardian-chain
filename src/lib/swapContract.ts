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
  const eth = (window as any).ethereum;
  if (!eth) return null;
  try {
    const provider = new ethers.BrowserProvider(eth);
    const accounts = await eth.request({ method: 'eth_requestAccounts' });
    if (!accounts || accounts.length === 0) return null;
    return provider.getSigner();
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
  if (!signer) return null;
  const routerAddr = CONTRACT_ADDRESSES.mainnet.Router;
  if (routerAddr === '0x0000000000000000000000000000000000000000') return null;
  try {
    const router = new ethers.Contract(routerAddr, ROUTER_ABI, signer);
    const tx = await router.swapExactTokensForTokens(
      amountIn,
      amountOutMin,
      path,
      to,
      deadline
    );
    const receipt = await tx.wait();
    return receipt?.hash ?? tx.hash;
  } catch {
    return null;
  }
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
  if (!signer) return null;
  const routerAddr = CONTRACT_ADDRESSES.mainnet.Router;
  if (routerAddr === '0x0000000000000000000000000000000000000000') return null;
  try {
    const router = new ethers.Contract(routerAddr, ROUTER_ABI, signer);
    const tx = await router.swapExactGYDSForTokens(
      amountOutMin,
      path,
      to,
      deadline,
      { value: amountIn }
    );
    const receipt = await tx.wait();
    return receipt?.hash ?? tx.hash;
  } catch {
    return null;
  }
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
  if (!signer) return null;
  const routerAddr = CONTRACT_ADDRESSES.mainnet.Router;
  if (routerAddr === '0x0000000000000000000000000000000000000000') return null;
  try {
    const router = new ethers.Contract(routerAddr, ROUTER_ABI, signer);
    const tx = await router.addLiquidity(
      tokenA, tokenB,
      amountADesired, amountBDesired,
      amountAMin, amountBMin,
      to, deadline
    );
    const receipt = await tx.wait();
    return receipt?.hash ?? tx.hash;
  } catch {
    return null;
  }
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
  deadline: number
): Promise<string | null> {
  const signer = await getConnectedSigner();
  if (!signer) return null;
  const routerAddr = CONTRACT_ADDRESSES.mainnet.Router;
  if (routerAddr === '0x0000000000000000000000000000000000000000') return null;
  try {
    const router = new ethers.Contract(routerAddr, ROUTER_ABI, signer);
    const tx = await router.removeLiquidity(
      tokenA, tokenB,
      liquidity,
      amountAMin, amountBMin,
      to, deadline
    );
    const receipt = await tx.wait();
    return receipt?.hash ?? tx.hash;
  } catch {
    return null;
  }
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
