import { useState } from 'react';
import { Database, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

type Result = {
  ok: boolean; configured?: boolean; latency_ms?: number; server_version?: string;
  database?: string; replica?: boolean; read_only?: boolean; error?: string; error_code?: string | null; checked_at?: string;
};

export default function IndexerDbHealth() {
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<Result | null>(null);

  const run = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('indexer-db-health', { body: {} });
    setRes(error ? { ok: false, error: error.message } : (data as Result));
    setLoading(false);
  };

  return (
    <div className="rounded-xl border border-border bg-card/50 p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          <div>
            <h3 className="font-semibold">PostgreSQL connection check</h3>
            <p className="text-xs text-muted-foreground">Tests the saved GYDS_INDEXER_DB_URL. The secret is never shown.</p>
          </div>
        </div>
        <Button onClick={run} disabled={loading} size="sm">
          {loading && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Run check
        </Button>
      </div>
      {res && (
        <div className="rounded-lg border border-border p-3 text-sm space-y-1">
          <div className="flex items-center gap-2 font-medium">
            {res.ok ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <XCircle className="h-4 w-4 text-destructive" />}
            {res.ok ? 'Connected' : res.configured === false ? 'Not configured' : 'Connection failed'}
          </div>
          {res.latency_ms !== undefined && <div className="text-muted-foreground">Latency: {res.latency_ms} ms</div>}
          {res.server_version && <div className="text-muted-foreground">PostgreSQL {res.server_version} · db “{res.database}”{res.replica ? ' · replica' : ''}{res.read_only ? ' · read-only' : ''}</div>}
          {res.error && <div className="text-destructive break-words">{res.error_code ? `[${res.error_code}] ` : ''}{res.error}</div>}
          {res.checked_at && <div className="text-xs text-muted-foreground">Checked {new Date(res.checked_at).toLocaleString()}</div>}
        </div>
      )}
    </div>
  );
}
