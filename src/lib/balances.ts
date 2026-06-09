import { api } from '@/lib/api';

export const getUserAddresses = async (
  userId: string,
  connectedAddress?: string,
  userEmail?: string,
): Promise<Set<string>> => {
  const myAddresses = new Set<string>();
  if (connectedAddress) myAddresses.add(connectedAddress.toLowerCase());

  try {
    const userWallets = await api.get('/api/wallets');
    (userWallets || []).forEach((w: any) => myAddresses.add(w.address.toLowerCase()));
  } catch {}

  try {
    const founderConfig = await api.get('/api/config/founder_wallet');
    if (founderConfig?.config_value) {
      const fc = founderConfig.config_value as Record<string, string>;
      if (fc.address) myAddresses.add(fc.address.toLowerCase());
    }
  } catch {}

  if (userEmail?.toLowerCase() === 'netlifegy@gmail.com') {
    myAddresses.add('0x0000000000000000000000000000000000000001');
  }

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
      if (op.status !== 'confirmed') continue;
      const rawAddr: string = op.wallet_address ?? '';
      if (rawAddr.startsWith('sponsor:')) continue;
      const isGyd = rawAddr.startsWith('gyd:');
      const isBridge = rawAddr.startsWith('bridge:');
      const actualAddr = isGyd ? rawAddr.slice(4) : isBridge ? rawAddr.slice(7) : rawAddr;
      if (!myAddresses.has(actualAddr.toLowerCase())) continue;
      if (op.operation_type === 'mint' || op.operation_type === 'mint_gyd' || op.operation_type === 'mint_gyds') {
        if (isGyd || op.operation_type === 'mint_gyd') gydBalance += Number(op.amount);
        else gydsBalance += Number(op.amount);
      } else if (op.operation_type === 'burn') {
        if (isGyd) gydBalance -= Number(op.amount);
        else gydsBalance -= Number(op.amount);
      }
    }
  } catch {}

  try {
    const txData = await api.get('/api/transactions');
    for (const tx of (txData ?? []) as any[]) {
      if (tx.status !== 'confirmed') continue;
      const fromMe = myAddresses.has((tx.from_address ?? '').toLowerCase());
      const toMe = myAddresses.has((tx.to_address ?? '').toLowerCase());
      if (fromMe) gydBalance -= Number(tx.amount) + Number(tx.fee ?? 0);
      if (toMe) gydBalance += Number(tx.amount);
    }
  } catch {}

  return {
    gydsBalance: Math.max(0, gydsBalance),
    gydBalance: Math.max(0, gydBalance),
  };
};
