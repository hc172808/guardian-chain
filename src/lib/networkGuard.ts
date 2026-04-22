// Network availability gate.
//
// No transaction may settle unless at least one node is currently ONLINE
// AND has produced a heartbeat within HEARTBEAT_FRESH_SECS. Mining ALSO
// requires a live node, so this guard is the single chokepoint for both.

import { supabase } from '@/integrations/supabase/client';

const HEARTBEAT_FRESH_SECS = 90; // a node is "live" if it pinged in the last 90s

export interface ActiveNodeInfo {
  id: string;
  user_id: string;
  node_type: string;
  hash_rate: number;
  last_heartbeat: string;
}

export interface NetworkStatus {
  ok: boolean;
  liveNodes: ActiveNodeInfo[];
  totalHashrate: number;
  reason?: string;
}

export const getNetworkStatus = async (): Promise<NetworkStatus> => {
  const cutoff = new Date(Date.now() - HEARTBEAT_FRESH_SECS * 1000).toISOString();

  const { data, error } = await supabase
    .from('node_installations')
    .select('id, user_id, node_type, hash_rate, last_heartbeat, is_online, is_approved')
    .eq('is_online', true)
    .eq('is_approved', true)
    .gte('last_heartbeat', cutoff);

  if (error) {
    return { ok: false, liveNodes: [], totalHashrate: 0, reason: `Network query failed: ${error.message}` };
  }

  const liveNodes = (data ?? []).map((n: any) => ({
    id: n.id,
    user_id: n.user_id,
    node_type: n.node_type,
    hash_rate: Number(n.hash_rate) || 0,
    last_heartbeat: n.last_heartbeat,
  }));

  const totalHashrate = liveNodes.reduce((sum, n) => sum + n.hash_rate, 0);

  if (liveNodes.length === 0) {
    return {
      ok: false,
      liveNodes,
      totalHashrate,
      reason: 'No nodes are online. At least one approved node must be running before any transaction can be confirmed.',
    };
  }

  return { ok: true, liveNodes, totalHashrate };
};

// Convenience: throw if no nodes are live. Used at the top of every
// transaction-submission code path.
export const requireActiveNodes = async (): Promise<NetworkStatus> => {
  const s = await getNetworkStatus();
  if (!s.ok) throw new Error(s.reason ?? 'Network is offline');
  return s;
};
