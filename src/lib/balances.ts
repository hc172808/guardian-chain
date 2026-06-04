import { supabase } from '@/integrations/supabase/client';

export const getUserAddresses = async (
  userId: string,
  connectedAddress?: string,
  userEmail?: string,
): Promise<Set<string>> => {
  const myAddresses = new Set<string>();

  if (connectedAddress) myAddresses.add(connectedAddress.toLowerCase());

  const { data: userWallets } = await supabase
    .from('wallets')
    .select('address')
    .eq('user_id', userId);

  (userWallets || []).forEach((w) => myAddresses.add(w.address.toLowerCase()));

  const { data: founderConfig } = await supabase
    .from('admin_config')
    .select('config_value')
    .eq('config_key', 'founder_wallet')
    .maybeSingle();

  if (founderConfig?.config_value) {
    const fc = founderConfig.config_value as Record<string, string>;
    if (fc.address) myAddresses.add(fc.address.toLowerCase());
  }

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

  const { data: opsData } = await supabase
    .from('token_operations')
    .select('*')
    .eq('status', 'confirmed');

  if (opsData) {
    for (const op of opsData) {
      const rawAddr: string = op.wallet_address ?? '';

      if (rawAddr.startsWith('sponsor:')) continue;

      const isGyd = rawAddr.startsWith('gyd:');
      const isBridge = rawAddr.startsWith('bridge:');

      const actualAddr = isGyd
        ? rawAddr.slice(4)
        : isBridge
        ? rawAddr.slice(7)
        : rawAddr;

      if (!myAddresses.has(actualAddr.toLowerCase())) continue;

      if (op.operation_type === 'mint') {
        if (isGyd) gydBalance += op.amount;
        else gydsBalance += op.amount;
      } else if (op.operation_type === 'burn') {
        if (isGyd) gydBalance -= op.amount;
        else gydsBalance -= op.amount;
      }
    }
  }

  const { data: txData } = await supabase
    .from('transactions')
    .select('from_address, to_address, amount, fee')
    .eq('user_id', userId)
    .eq('status', 'confirmed');

  if (txData) {
    for (const tx of txData) {
      const fromMe = myAddresses.has(tx.from_address.toLowerCase());
      const toMe = myAddresses.has(tx.to_address.toLowerCase());
      if (fromMe) gydBalance -= tx.amount + tx.fee;
      if (toMe) gydBalance += tx.amount;
    }
  }

  return {
    gydsBalance: Math.max(0, gydsBalance),
    gydBalance: Math.max(0, gydBalance),
  };
};
