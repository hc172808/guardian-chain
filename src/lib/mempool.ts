// Mempool — every send/swap goes through here.
import { api } from '@/lib/api';
import { requireActiveNodes } from './networkGuard';

export interface SubmitTxParams {
  userId: string;
  fromAddress: string;
  toAddress: string;
  amount: number;
  fee?: number;
  walletId?: string | null;
  symbol?: string;
  /** Skip the mempool balance check — use when the caller already validated balance via computeUserBalances */
  skipBalanceCheck?: boolean;
}

export interface SubmitTxResult {
  txHash: string;
  status: 'pending';
  liveNodes: number;
}

export const getPendingOutflows = async (fromAddress: string): Promise<number> => {
  try {
    const data = await api.get('/api/transactions');
    return (data ?? [])
      .filter((t: any) => t.from_address === fromAddress && t.status === 'pending')
      .reduce((s: number, t: any) => s + Number(t.amount || 0) + Number(t.fee || 0), 0);
  } catch { return 0; }
};

export const getConfirmedBalance = async (address: string): Promise<number> => {
  try {
    const addr = address.toLowerCase();
    const data = await api.get('/api/transactions');
    let bal = 0;
    for (const t of (data ?? []) as any[]) {
      if (t.status !== 'confirmed') continue;
      const a = Number(t.amount || 0);
      const f = Number(t.fee || 0);
      if ((t.from_address ?? '').toLowerCase() === addr) bal -= (a + f);
      if ((t.to_address ?? '').toLowerCase() === addr) bal += a;
    }
    return bal;
  } catch { return 0; }
};

export const getSpendableBalance = async (address: string): Promise<number> => {
  const [confirmed, pending] = await Promise.all([
    getConfirmedBalance(address),
    getPendingOutflows(address.toLowerCase()),
  ]);
  return confirmed - pending;
};

const computeTxHash = async (from: string, to: string, amount: number, nonce: number): Promise<string> => {
  const payload = `${from.toLowerCase()}|${to.toLowerCase()}|${amount}|${nonce}`;
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
    return '0x' + Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let h1 = 0x811c9dc5, h2 = 0xdeadbeef;
  for (let i = 0; i < payload.length; i++) {
    h1 = Math.imul(h1 ^ payload.charCodeAt(i), 16777619) >>> 0;
    h2 = Math.imul(h2 ^ payload.charCodeAt(i), 2654435761) >>> 0;
  }
  return '0x' + h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0') + nonce.toString(16).padStart(48, '0');
};

const getNextNonce = async (userId: string): Promise<number> => {
  try {
    const data = await api.get('/api/transactions');
    return (data?.length ?? 0) + 1;
  } catch { return 1; }
};

export const submitTransaction = async (params: SubmitTxParams): Promise<SubmitTxResult> => {
  const net = await requireActiveNodes();
  if (!params.fromAddress || !params.toAddress) throw new Error('Both from and to addresses are required.');
  if (!Number.isFinite(params.amount) || params.amount <= 0) throw new Error('Amount must be greater than zero.');
  const fee = Number(params.fee ?? 0);
  const total = params.amount + fee;
  const SYSTEM_ADDRS = new Set(['faucet', 'swap-pool', 'system', 'lp-bank', 'mint', 'bridge']);
  if (!params.skipBalanceCheck && !SYSTEM_ADDRS.has(params.fromAddress.toLowerCase())) {
    const spendable = await getSpendableBalance(params.fromAddress);
    if (spendable < total) throw new Error(`Insufficient spendable balance. You have ${spendable.toFixed(6)} available, need ${total.toFixed(6)}.`);
  }
  const nonce = await getNextNonce(params.userId);
  const txHash = await computeTxHash(params.fromAddress, params.toAddress, params.amount, nonce);
  await api.post('/api/transactions', {
    user_id: params.userId, from_address: params.fromAddress, to_address: params.toAddress,
    amount: params.amount, fee, tx_hash: txHash, status: 'pending', wallet_id: params.walletId ?? null,
  });
  return { txHash, status: 'pending', liveNodes: net.liveNodes.length };
};

export const getUserPendingCount = async (userId: string): Promise<number> => {
  try {
    const data = await api.get('/api/transactions');
    return (data ?? []).filter((t: any) => t.user_id === userId && t.status === 'pending').length;
  } catch { return 0; }
};

export const getMempoolCount = async (): Promise<number> => {
  try {
    const data = await api.get('/api/transactions');
    return (data ?? []).filter((t: any) => t.status === 'pending').length;
  } catch { return 0; }
};
