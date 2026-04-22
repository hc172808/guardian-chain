import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const CONFIG_KEY = 'hidden_components';

export const KNOWN_COMPONENTS: Array<{ key: string; label: string; group: string }> = [
  { key: 'defi.swap',           label: 'DeFi: Swap',                 group: 'DeFi' },
  { key: 'defi.crosschain',     label: 'DeFi: Cross-Chain Bridge',   group: 'DeFi' },
  { key: 'defi.stake',          label: 'DeFi: Staking',              group: 'DeFi' },
  { key: 'defi.pools',          label: 'DeFi: Liquidity Pools',      group: 'DeFi' },
  { key: 'defi.launchpad',      label: 'DeFi: Launchpad',            group: 'DeFi' },
  { key: 'defi.portfolio',      label: 'DeFi: Portfolio',            group: 'DeFi' },
  { key: 'defi.recent_swaps',   label: 'DeFi: Recent Swaps',         group: 'DeFi' },
  { key: 'wallet.faucet',       label: 'Wallet: Faucet',             group: 'Wallet' },
  { key: 'wallet.create',       label: 'Wallet: Create',             group: 'Wallet' },
  { key: 'mining.dashboard',    label: 'Mining Dashboard',           group: 'Mining' },
  { key: 'tokens.create',       label: 'Tokens: Create New',         group: 'Tokens' },
  { key: 'tokens.list',         label: 'Tokens: Public List',        group: 'Tokens' },
  { key: 'explorer.search',     label: 'Explorer: Search',           group: 'Explorer' },
  { key: 'docs.cli',            label: 'Docs: CLI Reference',        group: 'Docs' },
  { key: 'network.validators',  label: 'Network: Validators page',   group: 'Network' },
];

let cache: string[] | null = null;
const subs: Array<(v: string[]) => void> = [];

const fetchHidden = async (): Promise<string[]> => {
  const { data } = await supabase
    .from('admin_config')
    .select('config_value')
    .eq('config_key', CONFIG_KEY)
    .maybeSingle();
  const v = data?.config_value as { hidden?: string[] } | null;
  return Array.isArray(v?.hidden) ? v!.hidden! : [];
};

export const useComponentVisibility = () => {
  const { isAdmin } = useAuth();
  const [hidden, setHidden] = useState<string[]>(cache || []);
  const [loading, setLoading] = useState(cache === null);

  useEffect(() => {
    let active = true;
    const sub = (v: string[]) => active && setHidden(v);
    subs.push(sub);

    if (cache === null) {
      fetchHidden().then((v) => {
        cache = v;
        subs.forEach((s) => s(v));
        if (active) setLoading(false);
      });
    } else {
      setLoading(false);
    }

    const channel = supabase
      .channel('component-visibility')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'admin_config', filter: `config_key=eq.${CONFIG_KEY}` },
        async () => {
          const v = await fetchHidden();
          cache = v;
          subs.forEach((s) => s(v));
        }
      )
      .subscribe();

    return () => {
      active = false;
      const i = subs.indexOf(sub);
      if (i >= 0) subs.splice(i, 1);
      supabase.removeChannel(channel);
    };
  }, []);

  const isHidden = useCallback(
    (key: string): boolean => {
      // Admins always see everything
      if (isAdmin) return false;
      return hidden.includes(key);
    },
    [hidden, isAdmin]
  );

  const setHiddenList = useCallback(async (next: string[]) => {
    cache = next;
    subs.forEach((s) => s(next));
    await supabase
      .from('admin_config')
      .upsert(
        { config_key: CONFIG_KEY, config_value: { hidden: next } as any },
        { onConflict: 'config_key' }
      );
  }, []);

  const toggle = useCallback(
    async (key: string) => {
      const next = hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key];
      await setHiddenList(next);
    },
    [hidden, setHiddenList]
  );

  return { hidden, isHidden, toggle, setHiddenList, loading, isAdmin };
};
