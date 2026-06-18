import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

const CONFIG_KEY = 'hidden_components';

export const KNOWN_COMPONENTS: Array<{ key: string; label: string; group: string }> = [
  { key: 'defi.swap',           label: 'DeFi: Swap',                 group: 'DeFi' },
  { key: 'defi.crosschain',     label: 'DeFi: Cross-Chain Bridge',   group: 'DeFi' },
  { key: 'defi.stake',          label: 'DeFi: Staking',              group: 'DeFi' },
  { key: 'defi.pools',          label: 'DeFi: Liquidity Pools',      group: 'DeFi' },
  { key: 'defi.farm',           label: 'DeFi: LP Farming',           group: 'DeFi' },
  { key: 'defi.launchpad',      label: 'DeFi: Launchpad',            group: 'DeFi' },
  { key: 'defi.portfolio',      label: 'DeFi: Portfolio',            group: 'DeFi' },
  { key: 'defi.vaults',         label: 'DeFi: Yield Vaults',         group: 'DeFi' },
  { key: 'defi.orderbook',      label: 'DeFi: Orderbook',            group: 'DeFi' },
  { key: 'defi.perps',          label: 'DeFi: Perpetuals',           group: 'DeFi' },
  { key: 'defi.predict',        label: 'DeFi: Prediction',           group: 'DeFi' },
  { key: 'defi.stable',         label: 'DeFi: Stablecoin',           group: 'DeFi' },
  { key: 'defi.ilcalc',         label: 'DeFi: IL Calculator',        group: 'DeFi' },
  { key: 'defi.recent_swaps',   label: 'DeFi: Recent Swaps',         group: 'DeFi' },
  { key: 'wallet.faucet',       label: 'Wallet: Faucet',             group: 'Wallet' },
  { key: 'wallet.create',       label: 'Wallet: Create',             group: 'Wallet' },
  { key: 'wallet.ledger',       label: 'Wallet: Ledger',             group: 'Wallet' },
  { key: 'mining.dashboard',    label: 'Mining Dashboard',           group: 'Mining' },
  { key: 'tokens.create',       label: 'Tokens: Create',             group: 'Tokens' },
  { key: 'tokens.list',         label: 'Tokens: Public List',        group: 'Tokens' },
  { key: 'explorer.search',     label: 'Explorer: Search',           group: 'Explorer' },
  { key: 'governance.vote',     label: 'Governance: Vote',           group: 'Governance' },
  { key: 'governance.propose',  label: 'Governance: Propose',        group: 'Governance' },
  { key: 'governance.treasury', label: 'Governance: Treasury',       group: 'Governance' },
  { key: 'nft.mint',            label: 'NFT: Mint',                  group: 'NFT' },
  { key: 'nft.market',          label: 'NFT: Marketplace',             group: 'NFT' },
  { key: 'identity.did',        label: 'Identity: DID',              group: 'Identity' },
  { key: 'rwa.invest',          label: 'RWA: Invest',                group: 'RWA' },
  { key: 'community.post',        label: 'Community: Post',              group: 'Community' },
  { key: 'developer.api',       label: 'Developer: API',             group: 'Developer' },
  { key: 'developer.sdk',       label: 'Developer: SDK',             group: 'Developer' },
  { key: 'insurance.buy',       label: 'Insurance: Buy',               group: 'Insurance' },
  { key: 'multisig.create',      label: 'Multi-Sig: Create',          group: 'Multi-Sig' },
  { key: 'analytics.view',       label: 'Analytics: View',            group: 'Analytics' },
  { key: 'leaderboard.view',     label: 'Leaderboard: View',          group: 'Leaderboard' },
  { key: 'referrals.view',       label: 'Referrals: View',            group: 'Referrals' },
  { key: 'docs.cli',            label: 'Docs: CLI Reference',        group: 'Docs' },
  { key: 'network.validators',   label: 'Network: Validators',        group: 'Network' },
  { key: 'network.nodes',        label: 'Network: Nodes',             group: 'Network' },
  { key: 'mobile.biometric',    label: 'Mobile: Biometric',          group: 'Mobile' },
  { key: 'mobile.push',         label: 'Mobile: Push',               group: 'Mobile' },
  { key: 'mobile.qrpay',        label: 'Mobile: QR Pay',             group: 'Mobile' },
];

let hiddenCache: string[] | null = null;
let userFeaturesCache: string[] | null = null;
const hiddenSubs: Array<(v: string[]) => void> = [];
const userFeatureSubs: Array<(v: string[]) => void> = [];

const fetchHidden = async (): Promise<string[]> => {
  try {
    const row = await api.get(`/api/config/${CONFIG_KEY}`);
    const v = row?.config_value as { hidden?: string[] } | null;
    return Array.isArray(v?.hidden) ? v!.hidden! : [];
  } catch {
    return [];
  }
};

const fetchUserFeatures = async (): Promise<string[]> => {
  try {
    const data = await api.get('/api/me/features');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
};

export const useComponentVisibility = () => {
  const { isAdmin, user } = useAuth();
  const [hidden, setHidden] = useState<string[]>(hiddenCache || []);
  const [userFeatures, setUserFeatures] = useState<string[]>(userFeaturesCache || []);
  const [loading, setLoading] = useState(hiddenCache === null || userFeaturesCache === null);

  useEffect(() => {
    let active = true;
    const hiddenSub = (v: string[]) => active && setHidden(v);
    const featSub = (v: string[]) => active && setUserFeatures(v);
    hiddenSubs.push(hiddenSub);
    userFeatureSubs.push(featSub);

    const init = async () => {
      if (hiddenCache === null) {
        const hv = await fetchHidden();
        hiddenCache = hv;
        hiddenSubs.forEach((s) => s(hv));
      }
      if (userFeaturesCache === null) {
        const fv = await fetchUserFeatures();
        userFeaturesCache = fv;
        userFeatureSubs.forEach((s) => s(fv));
      }
      if (active) setLoading(false);
    };
    init();

    // Poll every 30s
    const interval = setInterval(async () => {
      const hv = await fetchHidden();
      hiddenCache = hv;
      hiddenSubs.forEach((s) => s(hv));
      const fv = await fetchUserFeatures();
      userFeaturesCache = fv;
      userFeatureSubs.forEach((s) => s(fv));
    }, 30000);

    return () => {
      active = false;
      clearInterval(interval);
      const hi = hiddenSubs.indexOf(hiddenSub);
      if (hi >= 0) hiddenSubs.splice(hi, 1);
      const fi = userFeatureSubs.indexOf(featSub);
      if (fi >= 0) userFeatureSubs.splice(fi, 1);
    };
  }, []);

  const isHidden = useCallback(
    (key: string): boolean => {
      if (isAdmin) return false;
      // Hidden globally (admin toggle) OR not granted to user
      const globallyHidden = hidden.includes(key);
      const hasGrant = userFeatures.includes(key);
      return globallyHidden || !hasGrant;
    },
    [hidden, userFeatures, isAdmin]
  );

  const isGranted = useCallback(
    (key: string): boolean => {
      if (isAdmin) return true;
      return !hidden.includes(key) && userFeatures.includes(key);
    },
    [hidden, userFeatures, isAdmin]
  );

  const setHiddenList = useCallback(async (next: string[]) => {
    hiddenCache = next;
    hiddenSubs.forEach((s) => s(next));
    await api.post('/api/config', { key: CONFIG_KEY, value: { hidden: next } });
  }, []);

  const toggle = useCallback(
    async (key: string) => {
      const next = hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key];
      await setHiddenList(next);
    },
    [hidden, setHiddenList]
  );

  return { hidden, isHidden, isGranted, toggle, setHiddenList, loading, isAdmin, user };
};
