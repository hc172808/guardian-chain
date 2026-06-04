import { supabase } from '@/integrations/supabase/client';
import { getEthereumProvider, hasEthereumProvider } from '@/config/network';

export interface WalletAuthState {
  address: string;
  isConnected: boolean;
  isConnecting: boolean;
}

export interface WalletProvider {
  name: string;
  icon?: string;
  isInstalled: boolean;
  getProvider: () => any;
}

// ── Provider detection ─────────────────────────────────────────────────────

export const detectProviders = (): WalletProvider[] => {
  if (typeof window === 'undefined') return [];
  const providers: WalletProvider[] = [];

  // MetaMask
  const eth = (window as any).ethereum;
  if (eth?.isMetaMask) {
    providers.push({ name: 'MetaMask', isInstalled: true, getProvider: () => eth });
  }

  // Trust Wallet
  if (eth?.isTrust || (window as any).trustwallet) {
    providers.push({
      name: 'Trust Wallet',
      isInstalled: true,
      getProvider: () => (window as any).trustwallet || eth,
    });
  }

  // Phantom EVM
  const phantom = (window as any).phantom?.ethereum;
  if (phantom) {
    providers.push({ name: 'Phantom', isInstalled: true, getProvider: () => phantom });
  }

  // Coinbase
  if (eth?.isCoinbaseWallet) {
    providers.push({ name: 'Coinbase Wallet', isInstalled: true, getProvider: () => eth });
  }

  // Generic EIP-6963
  if (providers.length === 0 && eth) {
    providers.push({ name: 'Wallet', isInstalled: true, getProvider: () => eth });
  }

  return providers;
};

export const getPrimaryProvider = (): any | null => {
  const providers = detectProviders();
  return providers.length > 0 ? providers[0].getProvider() : null;
};

// ── Connection ───────────────────────────────────────────────────────────

export const connectWallet = async (): Promise<{ address: string; provider: any }> => {
  const provider = getPrimaryProvider();
  if (!provider) throw new Error('No wallet detected');

  const accounts = await provider.request({ method: 'eth_requestAccounts' });
  if (!accounts || accounts.length === 0) {
    throw new Error('Wallet returned no accounts');
  }

  const address = accounts[0].toLowerCase();
  return { address, provider };
};

// ── Signature ─────────────────────────────────────────────────────────────

export const signLoginMessage = async (
  address: string,
  provider: any,
  action: 'login' | 'signup' = 'login'
): Promise<string> => {
  const timestamp = Date.now();
  const nonce = Math.random().toString(36).substring(2, 15);
  const message = `ChainCore ${action === 'signup' ? 'Account Creation' : 'Login'}\n\nAddress: ${address}\nNonce: ${nonce}\nTimestamp: ${timestamp}\n\nThis proves you control this wallet. Do not share this signature.`;

  const signature = await provider.request({
    method: 'personal_sign',
    params: [message, address],
  });

  return signature;
};

// ── Auth helpers ──────────────────────────────────────────────────────────

const walletEmail = (address: string) => `wallet-${address.slice(2).toLowerCase()}@chaincore.local`;

const generatePassword = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let pw = '';
  for (let i = 0; i < 32; i++) {
    pw += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pw;
};

const storeWalletAuth = async (address: string, password: string, userId: string) => {
  await supabase.from('admin_config').upsert(
    {
      config_key: `wallet_auth_${address.toLowerCase()}`,
      config_value: { password, user_id: userId, created_at: Date.now() },
      updated_by: userId,
    },
    { onConflict: 'config_key' }
  );
};

const getWalletAuth = async (address: string): Promise<{ password: string; user_id: string } | null> => {
  const { data } = await supabase
    .from('admin_config')
    .select('config_value')
    .eq('config_key', `wallet_auth_${address.toLowerCase()}`)
    .maybeSingle();
  if (!data) return null;
  const v = data.config_value as any;
  return v ? { password: v.password, user_id: v.user_id } : null;
};

// ── Sign up with wallet ───────────────────────────────────────────────────

export const signUpWithWallet = async (address: string): Promise<{ user: any; error: Error | null }> => {
  const email = walletEmail(address);
  const password = generatePassword();

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        wallet_address: address,
        auth_method: 'wallet',
      },
    },
  });

  if (signUpError) {
    // If already registered, treat as sign-in
    if (signUpError.message?.includes('already registered') || signUpError.message?.includes('already exists')) {
      return await signInWithWallet(address);
    }
    return { user: null, error: signUpError };
  }

  const userId = signUpData?.user?.id;
  if (!userId) {
    return { user: null, error: new Error('Signup succeeded but no user ID returned') };
  }

  // Store wallet address
  await supabase.from('wallets').insert({
    user_id: userId,
    address: address,
    encrypted_seed: '',
    pin_hash: '',
  });

  // Store auth credentials
  await storeWalletAuth(address, password, userId);

  // Also store in user_roles
  await supabase.from('user_roles').insert({
    user_id: userId,
    role: 'user',
  });

  return { user: signUpData.user, error: null };
};

// ── Sign in with wallet ──────────────────────────────────────────────────

export const signInWithWallet = async (address: string): Promise<{ user: any; error: Error | null }> => {
  const email = walletEmail(address);
  const auth = await getWalletAuth(address);

  if (!auth) {
    // No stored auth — try to sign up instead
    return await signUpWithWallet(address);
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: auth.password,
  });

  if (error) {
    // If password wrong, maybe re-create
    if (error.message?.includes('Invalid login')) {
      return await signUpWithWallet(address);
    }
    return { user: null, error };
  }

  return { user: data.user, error: null };
};

// ── Link wallet to existing user ─────────────────────────────────────────

export const linkWalletToUser = async (
  userId: string,
  address: string
): Promise<{ error: Error | null }> => {
  const { error } = await supabase.from('wallets').insert({
    user_id: userId,
    address,
    encrypted_seed: '',
    pin_hash: '',
  });
  return { error };
};

// ── Mobile helpers ───────────────────────────────────────────────────────

export const MOBILE_WALLET_LINKS = {
  metamask: {
    ios: 'https://apps.apple.com/app/metamask/id1438144202',
    android: 'https://play.google.com/store/apps/details?id=io.metamask',
    deep: 'https://metamask.app.link/dapp/',
  },
  trust: {
    ios: 'https://apps.apple.com/app/trust-crypto-bitcoin-wallet/id1288339409',
    android: 'https://play.google.com/store/apps/details?id=com.wallet.crypto.trustapp',
    deep: 'https://link.trustwallet.com/open_url?url=',
  },
  phantom: {
    ios: 'https://apps.apple.com/app/phantom-solana-wallet/id1598432977',
    android: 'https://play.google.com/store/apps/details?id=app.phantom',
    deep: 'https://phantom.app/ul/',
  },
};

export const getWalletInstallUrl = (walletName: string): string | null => {
  const mobile = isMobile();
  const platform = /android/i.test(navigator.userAgent) ? 'android' : 'ios';
  const key = walletName.toLowerCase().includes('metamask')
    ? 'metamask'
    : walletName.toLowerCase().includes('trust')
    ? 'trust'
    : walletName.toLowerCase().includes('phantom')
    ? 'phantom'
    : null;
  if (!key) return null;
  const link = MOBILE_WALLET_LINKS[key as keyof typeof MOBILE_WALLET_LINKS];
  return mobile ? link[platform] : null;
};

export const getWalletDeepLink = (walletName: string, currentUrl: string): string | null => {
  const key = walletName.toLowerCase().includes('metamask')
    ? 'metamask'
    : walletName.toLowerCase().includes('trust')
    ? 'trust'
    : walletName.toLowerCase().includes('phantom')
    ? 'phantom'
    : null;
  if (!key) return null;
  const link = MOBILE_WALLET_LINKS[key as keyof typeof MOBILE_WALLET_LINKS];
  return `${link.deep}${encodeURIComponent(currentUrl)}`;
};
