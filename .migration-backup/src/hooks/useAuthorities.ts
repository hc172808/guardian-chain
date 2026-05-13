import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Authority {
  id: string;
  category: string;
  name: string;
  description: string;
  enabled: boolean;
  required_role: 'founder' | 'admin';
  updated_at: string;
}

let cache: Authority[] | null = null;
const listeners = new Set<(rows: Authority[]) => void>();

async function load(): Promise<Authority[]> {
  const { data, error } = await supabase
    .from('authorities' as any)
    .select('*')
    .order('category')
    .order('name');
  if (error || !data) return [];
  cache = data as unknown as Authority[];
  listeners.forEach((l) => l(cache!));
  return cache;
}

export function useAuthorities() {
  const [rows, setRows] = useState<Authority[]>(cache ?? []);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    listeners.add(setRows);
    if (!cache) {
      load().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }

    const ch = supabase
      .channel('authorities-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'authorities' },
        () => load(),
      )
      .subscribe();

    return () => {
      listeners.delete(setRows);
      supabase.removeChannel(ch);
    };
  }, []);

  const isEnabled = useCallback(
    (id: string) => {
      const a = rows.find((r) => r.id === id);
      // Safe-default ON if missing — never silently break a feature
      return a ? a.enabled : true;
    },
    [rows],
  );

  const byCategory = rows.reduce<Record<string, Authority[]>>((acc, a) => {
    (acc[a.category] ||= []).push(a);
    return acc;
  }, {});

  const disabledCount = rows.filter((r) => !r.enabled).length;
  const total = rows.length;

  const toggle = async (id: string, enabled: boolean) => {
    const { error } = await supabase
      .from('authorities' as any)
      .update({ enabled, updated_at: new Date().toISOString() } as any)
      .eq('id', id);
    if (!error) load();
    return { error };
  };

  return { rows, loading, isEnabled, byCategory, disabledCount, total, toggle, refresh: load };
}
