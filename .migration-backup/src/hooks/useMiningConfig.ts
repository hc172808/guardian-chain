import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface MiningConfig {
  block_time_seconds: number;
  base_reward: number;
  halving_blocks: number;
  pool_fee_default: number;
}

const DEFAULTS: MiningConfig = {
  block_time_seconds: 120,
  base_reward: 50,
  halving_blocks: 210000,
  pool_fee_default: 1,
};

export const useMiningConfig = () => {
  const [config, setConfig] = useState<MiningConfig>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data } = await supabase
        .from('admin_config')
        .select('config_value')
        .eq('config_key', 'mining_config')
        .maybeSingle();
      if (!active) return;
      if (data?.config_value && typeof data.config_value === 'object') {
        setConfig({ ...DEFAULTS, ...(data.config_value as Partial<MiningConfig>) });
      }
      setLoading(false);
    };
    load();

    const channel = supabase
      .channel('mining_config_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_config', filter: 'config_key=eq.mining_config' }, load)
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  return { config, loading };
};
