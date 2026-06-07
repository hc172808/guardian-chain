import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface MaintenanceState {
  enabled: boolean;
  message: string;
  loading: boolean;
}

export function useMaintenance(): MaintenanceState {
  const [state, setState] = useState<MaintenanceState>({
    enabled: false,
    message: '',
    loading: true,
  });

  useEffect(() => {
    let active = true;

    const fetch = async () => {
      const { data } = await supabase
        .from('admin_config')
        .select('config_value')
        .eq('config_key', 'maintenance_mode')
        .maybeSingle();

      if (!active) return;

      if (data?.config_value) {
        const v = data.config_value as { enabled?: boolean; message?: string };
        setState({ enabled: !!v.enabled, message: v.message ?? '', loading: false });
      } else {
        setState({ enabled: false, message: '', loading: false });
      }
    };

    fetch();

    // Realtime — so toggling maintenance in admin panel takes effect immediately
    const channel = supabase
      .channel('maintenance-mode')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'admin_config', filter: "config_key=eq.maintenance_mode" },
        (payload) => {
          if (!active) return;
          const v = (payload.new as any)?.config_value as { enabled?: boolean; message?: string } | undefined;
          if (v !== undefined) {
            setState({ enabled: !!v.enabled, message: v.message ?? '', loading: false });
          }
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  return state;
}
