import { supabase } from '@/integrations/supabase/client';

const isMobile = (): boolean =>
  typeof navigator !== 'undefined' && /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);

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

  const eth = (window as any).ethereum;
  if (eth) {
    // Multiple providers injected (e.g. MetaMask + Coinbase)
    if (Array.isArray(eth.providers)) {
      for (const p of eth.providers) {
        if (p.isMetaMask)       providers.push({ name: 'MetaMask',       isInstalled: true, getProvider: () => p });
        else if (p.isTrust)     providers.push({ name: 'Trust Wallet',   isInstalled: true, getProvider: () => p });
        else if (p.isCoinbaseWallet) providers.push({ name: 'Coinbase Wallet', isInstalled: true, getProvider: () => p });
        else                    providers.push({ name: 'Wallet',         isInstalled: true, getProvider: () => p });
      }
    } else {
      if (eth.isMetaMask)            providers.push({ name: 'MetaMask',       isInstalled: true, getProvider: () => eth });
      else if (eth.isTrust)          providers.push({ name: 'Trust Wallet',   isInstalled: true, getProvider: () => eth });
      else if (eth.isCoinbaseWallet) providers.push({ name: 'Coinbase Wallet',isInstalled: true, getProvider: () => eth });
      else                           providers.push({ name: 'Wallet',         isInstalled: true, getProvider: () => eth });
    }
  }

  const phantom = (window as any).phantom?.ethereum;
  if (phantom) providers.push({ name: 'Phantom', isInstalled: true, getProvider: () => phantom });

  const trust = (window as any).trustwallet;
  if (trust && !providers.find(p => p.name === 'Trust Wallet')) {
    providers.push({ name: 'Trust Wallet', isInstalled: true, getProvider: () => trust });
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
  if (!provider) throw new Error(
    isMobile()
      ? 'No wallet found. Open this page inside your wallet app (MetaMask → Browser, Trust Wallet → DApps).'
      : 'No wallet detected. Install MetaMask, Trust Wallet, or Phantom, then refresh this page.'
  );

  const accounts = await provider.request({ method: 'eth_requestAccounts' });
  if (!accounts || accounts.length === 0) throw new Error('Wallet returned no accounts');

  return { address: accounts[0].toLowerCase(), provider };
};

// ── Auth message (fixed, deterministic) ──────────────────────────────────
//
// The auth password is derived from signing this fixed message.
// No nonce → same wallet always produces the same password → no storage needed.
// Works across devices and browsers.

const authMessage = (address: string): string =>
  `ChainCore Authentication\n\nWallet: ${address.toLowerCase()}\nApp: chaincore.gyds\n\nSigning this message proves you own this wallet and creates your login credentials.\nNo transaction will be submitted.`;

// ── Deterministic password ───────────────────────────────────────────────

const derivePassword = async (signature: string): Promise<string> => {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(signature + ':chaincore'));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback (old browsers) — FNV-1a based
  const s = signature + ':chaincore';
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h.toString(16).padStart(8, '0').repeat(8);
};

// ── signAuthMessage ──────────────────────────────────────────────────────
//
// Single wallet signature used for both UX confirmation AND password derivation.
// Replaces the old signLoginMessage (which used a random nonce that was thrown away).

export const signAuthMessage = async (address: string, provider: any): Promise<string> => {
  const msg = authMessage(address);
  return await provider.request({ method: 'personal_sign', params: [msg, address] });
};

// Keep old export name for anything that may still reference it
export const signLoginMessage = signAuthMessage;

// ── Wallet email helper ──────────────────────────────────────────────────

const walletEmail = (address: string) =>
  `wallet-${address.replace(/^0x/, '').toLowerCase()}@chaincore.local`;

// ── Sign up with wallet ───────────────────────────────────────────────────

export const signUpWithWallet = async (
  address: string,
  signature: string,
): Promise<{ user: any; error: Error | null }> => {
  const email    = walletEmail(address);
  const password = await derivePassword(signature);

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });

  if (signUpError) {
    if (
      signUpError.message?.includes('already registered') ||
      signUpError.message?.includes('already exists') ||
      signUpError.message?.includes('User already registered')
    ) {
      // Account exists — sign in instead
      return signInWithWallet(address, signature);
    }
    // Email rate limit: Supabase free tier limits to 4 confirmation emails/hour.
    // Solution: disable email confirmation in Supabase Dashboard →
    //   Authentication → Settings → "Enable email confirmations" → OFF
    if (
      signUpError.message?.toLowerCase().includes('rate limit') ||
      signUpError.message?.toLowerCase().includes('email rate') ||
      (signUpError as any)?.code === 'over_email_send_rate_limit'
    ) {
      return {
        user: null,
        error: new Error(
          'Email rate limit reached (Supabase free tier: 4/hour). ' +
          'Fix: In Supabase Dashboard → Authentication → Settings → ' +
          'disable "Enable email confirmations". Then try again.'
        ),
      };
    }
    return { user: null, error: signUpError };
  }

  const user = signUpData?.user;
  if (!user) return { user: null, error: new Error('Sign-up succeeded but no user returned') };

  // Store wallet address in wallets table (best-effort — may already exist)
  await supabase.from('wallets').insert({
    user_id: user.id,
    address,
    encrypted_seed: '',
    pin_hash: '',
  }).then(() => {}).catch(() => {});

  // Assign default user role (best-effort)
  await supabase.from('user_roles').insert({ user_id: user.id, role: 'user' })
    .then(() => {}).catch(() => {});

  // Auto-assign founder role if this is the founder wallet
  try {
    const { RESERVED_WALLETS } = await import('@/config/wallets');
    if (address.toLowerCase() === RESERVED_WALLETS.founder.address.toLowerCase()) {
      await supabase.from('user_roles').insert({ user_id: user.id, role: 'founder' })
        .then(() => {}).catch(() => {});
    }
  } catch {}

  return { user, error: null };
};

// ── Sign in with wallet ──────────────────────────────────────────────────

export const signInWithWallet = async (
  address: string,
  signature: string,
): Promise<{ user: any; error: Error | null }> => {
  const email    = walletEmail(address);
  const password = await derivePassword(signature);

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.message?.includes('Invalid login') || error.message?.includes('invalid')) {
      // No account yet — sign up
      return signUpWithWallet(address, signature);
    }
    return { user: null, error };
  }

  return { user: data.user, error: null };
};

// ── Link wallet to existing user ─────────────────────────────────────────

export const linkWalletToUser = async (
  userId: string,
  address: string,
): Promise<{ error: Error | null }> => {
  const { error } = await supabase.from('wallets').insert({
    user_id: userId,
    address,
    encrypted_seed: '',
    pin_hash: '',
  });
  return { error: error ?? null };
};

// ── Mobile helpers ───────────────────────────────────────────────────────

export const MOBILE_WALLET_LINKS = {
  metamask: {
    ios:    'https://apps.apple.com/app/metamask/id1438144202',
    android:'https://play.google.com/store/apps/details?id=io.metamask',
    deep:   'https://metamask.app.link/dapp/',
  },
  trust: {
    ios:    'https://apps.apple.com/app/trust-crypto-bitcoin-wallet/id1288339409',
    android:'https://play.google.com/store/apps/details?id=com.wallet.crypto.trustapp',
    deep:   'https://link.trustwallet.com/open_url?url=',
  },
  phantom: {
    ios:    'https://apps.apple.com/app/phantom-solana-wallet/id1598432977',
    android:'https://play.google.com/store/apps/details?id=app.phantom',
    deep:   'https://phantom.app/ul/',
  },
};

export const getWalletInstallUrl = (walletName: string): string | null => {
  const mobile   = isMobile();
  const platform = /android/i.test(navigator.userAgent) ? 'android' : 'ios';
  const key = walletName.toLowerCase().includes('metamask') ? 'metamask'
            : walletName.toLowerCase().includes('trust')   ? 'trust'
            : walletName.toLowerCase().includes('phantom') ? 'phantom'
            : null;
  if (!key) return null;
  return mobile ? MOBILE_WALLET_LINKS[key][platform] : null;
};

export const getWalletDeepLink = (walletName: string, currentUrl: string): string | null => {
  const key = walletName.toLowerCase().includes('metamask') ? 'metamask'
            : walletName.toLowerCase().includes('trust')   ? 'trust'
            : walletName.toLowerCase().includes('phantom') ? 'phantom'
            : null;
  if (!key) return null;
  return `${MOBILE_WALLET_LINKS[key].deep}${encodeURIComponent(currentUrl)}`;
};
