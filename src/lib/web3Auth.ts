// Web3 wallet detection and connection utilities.
// Auth is now handled by Replit Auth — wallet signing is kept for address verification only.

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

export const detectProviders = (): WalletProvider[] => {
  if (typeof window === 'undefined') return [];
  const providers: WalletProvider[] = [];
  const eth = (window as any).ethereum;
  if (eth) {
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
  if (trust && !providers.find(p => p.name === 'Trust Wallet'))
    providers.push({ name: 'Trust Wallet', isInstalled: true, getProvider: () => trust });
  return providers;
};

export const getPrimaryProvider = (): any | null => {
  const providers = detectProviders();
  return providers.length > 0 ? providers[0].getProvider() : null;
};

export const connectWallet = async (): Promise<{ address: string; provider: any }> => {
  const provider = getPrimaryProvider();
  if (!provider) throw new Error(
    isMobile()
      ? 'No wallet found. Open this page inside your wallet app.'
      : 'No wallet detected. Install MetaMask, Trust Wallet, or Phantom, then refresh.'
  );
  const accounts = await provider.request({ method: 'eth_requestAccounts' });
  if (!accounts || accounts.length === 0) throw new Error('Wallet returned no accounts');
  return { address: accounts[0].toLowerCase(), provider };
};

const authMessage = (address: string): string =>
  `ChainCore Authentication\n\nWallet: ${address.toLowerCase()}\nApp: chaincore.gyds\n\nSigning this message proves you own this wallet.\nNo transaction will be submitted.`;

const derivePassword = async (signature: string): Promise<string> => {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(signature + ':chaincore'));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  const s = signature + ':chaincore';
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h.toString(16).padStart(8, '0').repeat(8);
};

export const signAuthMessage = async (address: string, provider: any): Promise<string> => {
  const msg = authMessage(address);
  return await provider.request({ method: 'personal_sign', params: [msg, address] });
};

export const signLoginMessage = signAuthMessage;

// These now just link a wallet address to the authenticated user account
export const signUpWithWallet = async (
  address: string,
  _signature: string,
): Promise<{ user: any; error: Error | null }> => {
  try {
    const res = await fetch('/api/wallets', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, encrypted_seed: '', pin_hash: '' }),
    });
    if (!res.ok) return { user: null, error: new Error('Failed to link wallet') };
    // Direct to login
    window.location.href = '/api/auth/login';
    return { user: null, error: null };
  } catch (e: any) {
    return { user: null, error: e };
  }
};

export const signInWithWallet = signUpWithWallet;

export const linkWalletToUser = async (
  _userId: string,
  address: string,
): Promise<{ error: Error | null }> => {
  try {
    await fetch('/api/wallets', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, encrypted_seed: '', pin_hash: '' }),
    });
    return { error: null };
  } catch (e: any) {
    return { error: e };
  }
};

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
  const key = walletName.toLowerCase().includes('metamask') ? 'metamask'
    : walletName.toLowerCase().includes('trust') ? 'trust'
    : walletName.toLowerCase().includes('phantom') ? 'phantom'
    : null;
  if (!key) return null;
  return mobile ? MOBILE_WALLET_LINKS[key][platform] : null;
};

export const getWalletDeepLink = (walletName: string, currentUrl: string): string | null => {
  const key = walletName.toLowerCase().includes('metamask') ? 'metamask'
    : walletName.toLowerCase().includes('trust') ? 'trust'
    : walletName.toLowerCase().includes('phantom') ? 'phantom'
    : null;
  if (!key) return null;
  return `${MOBILE_WALLET_LINKS[key].deep}${encodeURIComponent(currentUrl)}`;
};
