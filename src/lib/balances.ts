import { api } from '@/lib/api';

export const getUserAddresses = async (
  userId: string,
  connectedAddress?: string,
): Promise<Set<string>> => {
  const myAddresses = new Set<string>();
  if (connectedAddress) myAddresses.add(connectedAddress.toLowerCase());

  try {
    const userWallets = await api.get('/api/wallets');
    (userWallets || []).forEach((w: any) => myAddresses.add(w.address.toLowerCase()));
  } catch {}

  try {
    const founderConfig = await api.get('/api/config/founder_wallet');
    const fcVal = founderConfig?.configValue ?? founderConfig?.config_value;
    if (fcVal?.address) myAddresses.add(fcVal.address.toLowerCase());
  } catch {}

  return myAddresses;
};

export const computeUserBalances = async (
  userId: string,
  myAddresses: Set<string>,
): Promise<{ gydsBalance: number; gydBalance: number }> => {
  let gydsBalance = 0;
  let gydBalance = 0;

  try {
    const opsData = await api.get('/api/token-operations');
    for (const op of (opsData ?? []) as any[]) {
      // Handle both camelCase (Drizzle) and snake_case field names
      const status   = op.status ?? '';
      if (status !== 'confirmed') continue;

      const rawAddr: string = op.walletAddress ?? op.wallet_address ?? '';
      if (rawAddr.startsWith('sponsor:')) continue;

      const isGyd    = rawAddr.startsWith('gyd:');
      const isBridge = rawAddr.startsWith('bridge:');
      const actualAddr = isGyd ? rawAddr.slice(4) : isBridge ? rawAddr.slice(7) : rawAddr;
      if (!myAddresses.has(actualAddr.toLowerCase())) continue;

      const opType: string = op.operationType ?? op.operation_type ?? '';
      const amt = Number(op.amount ?? 0);

      if (opType === 'mint_gyds' || opType === 'premine_gyds') {
        gydsBalance += amt;
      } else if (opType === 'mint_gyd' || opType === 'premine_gyd') {
        gydBalance += amt;
      } else if (opType === 'mint') {
        // legacy 'mint' — treat as GYDS unless address has 'gyd:' prefix
        if (isGyd) gydBalance += amt; else gydsBalance += amt;
      } else if (opType === 'burn_gyds' || opType === 'burn') {
        if (isGyd) gydBalance -= amt; else gydsBalance -= amt;
      } else if (opType === 'burn_gyd') {
        gydBalance -= amt;
      }
    }
  } catch {}

  try {
    const txData = await api.get('/api/transactions');
    for (const tx of (txData ?? []) as any[]) {
      if (tx.status !== 'confirmed') continue;

      // Handle both camelCase and snake_case
      const fromAddr = (tx.fromAddress ?? tx.from_address ?? '').toLowerCase();
      const toAddr   = (tx.toAddress   ?? tx.to_address   ?? '').toLowerCase();
      const symbol   = (tx.tokenSymbol ?? tx.token_symbol ?? 'GYD').toUpperCase();
      const amt      = Number(tx.amount ?? 0);
      const fee      = Number(tx.fee ?? 0);

      const fromMe = fromAddr ? myAddresses.has(fromAddr) : false;
      const toMe   = toAddr   ? myAddresses.has(toAddr)   : false;

      if (symbol === 'GYDS') {
        if (fromMe) gydsBalance -= amt + fee;
        if (toMe)   gydsBalance += amt;
      } else {
        if (fromMe) gydBalance -= amt + fee;
        if (toMe)   gydBalance += amt;
      }
    }
  } catch {}

  return {
    gydsBalance: Math.max(0, gydsBalance),
    gydBalance:  Math.max(0, gydBalance),
  };
};
