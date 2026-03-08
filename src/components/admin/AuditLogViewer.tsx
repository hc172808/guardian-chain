import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import {
  ScrollText, Loader2, Shield, Users, Coins, Server, Settings, RefreshCw,
} from 'lucide-react';

interface AuditEntry {
  id: string;
  user_id: string;
  user_email: string | null;
  action: string;
  category: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, any>;
  created_at: string;
}

const categoryIcons: Record<string, any> = {
  firewall: Shield,
  validator: Users,
  token: Coins,
  node: Server,
  config: Settings,
  general: ScrollText,
  auth: Shield,
};

const categoryColors: Record<string, string> = {
  firewall: 'text-destructive',
  validator: 'text-primary',
  token: 'text-yellow-500',
  node: 'text-primary',
  config: 'text-muted-foreground',
  auth: 'text-primary',
  general: 'text-muted-foreground',
};

export const AuditLogViewer = () => {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const fetchLogs = async () => {
    setLoading(true);
    let query = supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (filter !== 'all') {
      query = query.eq('category', filter);
    }

    const { data } = await query;
    if (data) setLogs(data as any);
    setLoading(false);
  };

  useEffect(() => { fetchLogs(); }, [filter]);

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <GlassCard className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-lg bg-primary/10">
            <ScrollText className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Audit Log</h3>
            <p className="text-sm text-muted-foreground">All admin actions recorded with timestamps</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              <SelectItem value="firewall">Firewall</SelectItem>
              <SelectItem value="validator">Validators</SelectItem>
              <SelectItem value="token">Tokens</SelectItem>
              <SelectItem value="node">Nodes</SelectItem>
              <SelectItem value="config">Config</SelectItem>
              <SelectItem value="auth">Auth</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={fetchLogs}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : logs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <ScrollText className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p>No audit logs yet</p>
          <p className="text-xs mt-1">Actions will be recorded as admins make changes</p>
        </div>
      ) : (
        <div className="space-y-1 max-h-[500px] overflow-y-auto">
          {logs.map((log) => {
            const Icon = categoryIcons[log.category] || ScrollText;
            const color = categoryColors[log.category] || 'text-muted-foreground';
            return (
              <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-secondary/20 transition-colors">
                <div className={`p-1.5 rounded ${color} mt-0.5`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{log.action}</span>
                    <Badge variant="outline" className="text-xs">{log.category}</Badge>
                    {log.target_type && (
                      <span className="text-xs text-muted-foreground">
                        {log.target_type}{log.target_id ? `: ${log.target_id.slice(0, 8)}...` : ''}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">
                      {log.user_email || log.user_id.slice(0, 8) + '...'}
                    </span>
                    <span className="text-xs text-muted-foreground">•</span>
                    <span className="text-xs text-muted-foreground">{formatTime(log.created_at)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </GlassCard>
  );
};
