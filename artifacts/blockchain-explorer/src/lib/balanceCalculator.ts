import { supabase } from '@/integrations/supabase/client';

/**
 * Centralized balance calculator for GYD and GYDS.
 * Only counts operations and transactions that belong to the authenticated user.
 */
export async function getUserBalances(userId: string) {
  // 1. Get the user's wallet addresses
  const { data: userWallets } = await supabase
    .from('wallets')
    .select('address')
    .eq('user_id', userId);

  const myAddresses = new Set((userWallets || []).map(w => w.address.toLowerCase()));

  // If user has no wallets, balances are 0
  if (myAddresses.size === 0) {
    return { gyd: 0, gyds: 0, addresses: myAddresses };
  }

  // 2. Get token operations scoped to user's addresses
  //    Filter by wallet_address OR created_by to catch admin-created operations for this user
  const { data: opsData } = await supabase
    .from('token_operations')
    .select('operation_type, amount, wallet_address, created_by')
    .eq('status', 'confirmed');

  let gyds = 0;
  let gyd = 0;

  if (opsData) {
    opsData.forEach(op => {
      // Only count if the operation's wallet_address is one of the user's wallets.
      // We intentionally do NOT credit by `created_by` — admin-issued mints
      // (e.g. burn→mint) credit the destination wallet, not the admin's account.
      // This guarantees a brand-new user/wallet starts at zero balance.
      const isMyOp = myAddresses.has(op.wallet_address.toLowerCase());

      if (!isMyOp) return;

      switch (op.operation_type) {
        case 'mint_gyds':
        case 'premine_gyds':
        case 'mint':
        case 'bridge_mint_gyds':
          gyds += op.amount;
          break;
        case 'burn_gyds':
        case 'burn':
        case 'bridge_burn_gyds':
          gyds -= op.amount;
          break;
        case 'mint_gyd':
        case 'premine_gyd':
          gyd += op.amount;
          break;
        case 'burn_gyd':
          gyd -= op.amount;
          break;
      }
    });
  }

  // 3. Get transactions scoped to this user only
  const { data: txData } = await supabase
    .from('transactions')
    .select('from_address, to_address, amount, fee')
    .eq('user_id', userId)
    .eq('status', 'confirmed');

  if (txData) {
    txData.forEach(tx => {
      const fromMe = myAddresses.has(tx.from_address.toLowerCase());
      const toMe = myAddresses.has(tx.to_address.toLowerCase());
      if (fromMe) gyd -= tx.amount + tx.fee;
      if (toMe) gyd += tx.amount;
    });
  }

  // 4. Floor at 0 — negative balances indicate data issues, don't expose them
  return {
    gyd: Math.max(0, gyd),
    gyds: Math.max(0, gyds),
    addresses: myAddresses,
  };
}
