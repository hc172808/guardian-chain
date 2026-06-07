import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { EXTERNAL_CHAINS } from '@/config/bridgeChains';

const CONFIG_KEY = 'bridge_networks_enabled';

export type BridgeNetworkConfig = Record<string, boolean>;

export const useBridgeNetworks = () => {
  const [config, setConfig] = useState<BridgeNetworkConfig>({});
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('admin_config')
      .select('config_value')
      .eq('config_key', CONFIG_KEY)
      .maybeSingle();

    if (data?.config_value && typeof data.config_value === 'object' && !Array.isArray(data.config_value)) {
      setConfig(data.config_value as BridgeNetworkConfig);
    } else {
      // Default: all enabled
      const defaults: BridgeNetworkConfig = {};
      EXTERNAL_CHAINS.forEach(c => { defaults[c.id] = true; });
      setConfig(defaults);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  // Returns only the enabled chains (for display in bridge)
  const enabledChains = EXTERNAL_CHAINS.filter(c => config[c.id] !== false);

  return { config, enabledChains, loading, refetch: fetchConfig };
};

export const saveBridgeNetworkConfig = async (cfg: BridgeNetworkConfig) => {
  const { error } = await supabase
    .from('admin_config')
    .upsert({ config_key: CONFIG_KEY, config_value: cfg as any, updated_at: new Date().toISOString() }, { onConflict: 'config_key' });
  return error;
};
