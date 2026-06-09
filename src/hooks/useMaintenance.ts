import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

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
      try {
        const row = await api.get('/api/config/maintenance_mode');
        if (!active) return;
        if (row?.config_value) {
          const v = row.config_value as { enabled?: boolean; message?: string };
          setState({ enabled: !!v.enabled, message: v.message ?? '', loading: false });
        } else {
          setState({ enabled: false, message: '', loading: false });
        }
      } catch {
        if (active) setState({ enabled: false, message: '', loading: false });
      }
    };

    fetch();

    // Poll every 30s instead of realtime
    const interval = setInterval(fetch, 30000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  return state;
}
