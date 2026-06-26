// Web3 wallet authentication — nonce-based ECDSA signing against the Express backend.

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
        if (p.isMetaMask)            providers.push({ name: 'MetaMask',        isInstalled: true, getProvider: () => p });
        else if (p.isTrust)          providers.push({ name: 'Trust Wallet',    isInstalled: true, getProvider: () => p });
        else if (p.isCoinbaseWallet) providers.push({ name: 'Coinbase Wallet', isInstalled: true, getProvider: () => p });
        else                         providers.push({ name: 'Wallet',          isInstalled: true, getProvider: () => p });
      }
    } else {
      if (eth.isMetaMask)            providers.push({ name: 'MetaMask',        isInstalled: true, getProvider: () => eth });
      else if (eth.isTrust)          providers.push({ name: 'Trust Wallet',    isInstalled: true, getProvider: () => eth });
      else if (eth.isCoinbaseWallet) providers.push({ name: 'Coinbase Wallet', isInstalled: true, getProvider: () => eth });
      else                           providers.push({ name: 'Wallet',          isInstalled: true, getProvider: () => eth });
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

export const signAuthMessage = async (address: string, provider: any): Promise<string> => {
  const nonceRes = await fetch(`/api/auth/nonce?address=${encodeURIComponent(address)}`, {
    credentials: 'include',
  });
  if (!nonceRes.ok) throw new Error('Failed to fetch auth nonce from server');
  const { message } = await nonceRes.json();
  return await provider.request({ method: 'personal_sign', params: [message, address] });
};

export const signLoginMessage = signAuthMessage;

// Authenticate with the server using the signed nonce.
// mode is ignored — both signup and login use the same Web3 endpoint (creates user if needed).
export const signUpWithWallet = async (
  address: string,
  signature: string,
): Promise<{ user: any; error: Error | null }> => {
  try {
    const res = await fetch('/api/auth/web3', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, signature }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      return { user: null, error: new Error(err.error ?? 'Wallet authentication failed') };
    }
    const data = await res.json();
    return { user: data, error: null };
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
    const res = await fetch('/api/wallets', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, encrypted_seed: '', pin_hash: '' }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      return { error: new Error(err.error ?? 'Failed to link wallet') };
    }
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
