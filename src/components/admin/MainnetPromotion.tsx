import { useEffect, useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Rocket, RefreshCw, Loader2, CheckCircle2, Clock, TrendingUp, Network } from 'lucide-react';
import {
  loadPricingConfig,
  readAllTokenNetworkStates,
  computeMarketCapUsd,
  evaluateEligibility,
  runPromotionSweep,
  writeTokenNetworkState,
  TokenNetworkState,
} from '@/lib/tokenPromotion';
import { MainnetPromotionConfig } from '@/lib/tokenAuthorities';

interface TokenRow {
  id: string;
  name: string;
  symbol: string;
  created_at: string;
  total_supply: number;
  burned_supply: number;
  gyds_liquidity: number;
  state: TokenNetworkState;
  ageDays: number;
  marketCapUsd: number;
  eligible: boolean;
  reason: string;
}

export const MainnetPromotion = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [rows, setRows] = useState<TokenRow[]>([]);
  const [promo, setPromo] = useState<MainnetPromotionConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [sweeping, setSweeping] = useState(false);
  const [promotingId, setPromotingId] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    const pricing = await loadPricingConfig();
    setPromo(pricing.mainnet_promotion);

    const { data: tokens } = await supabase
      .from('tokens')
      .select('id, name, symbol, created_at, total_supply, burned_supply, gyds_liquidity')
      .order('created_at', { ascending: false });

    const states = await readAllTokenNetworkStates();
    const built: TokenRow[] = (tokens ?? []).map((t: any) => {
      const state = states.get(t.id) ?? { network_type: 'devnet' as const, mainnet_promoted_at: null, market_cap_usd: 0, extra_authorities: {} };
      const mc = computeMarketCapUsd(t, pricing.mainnet_promotion.gyds_price_usd);
      const v = evaluateEligibility(t, state, mc, pricing.mainnet_promotion);
      return {
        id: t.id, name: t.name, symbol: t.symbol, created_at: t.created_at,
        total_supply: t.total_supply, burned_supply: t.burned_supply, gyds_liquidity: t.gyds_liquidity,
        state, ageDays: v.ageDays, marketCapUsd: mc, eligible: v.eligible, reason: v.reason,
      };
    });
    setRows(built);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const onSweep = async () => {
    setSweeping(true);
    try {
      const result = await runPromotionSweep();
      toast({
        title: 'Promotion sweep complete',
        description: `Scanned ${result.scanned}, promoted ${result.promoted.length}.`,
      });
      await refresh();
    } catch (e: any) {
      toast({ title: 'Sweep failed', description: e.message, variant: 'destructive' });
    } finally {
      setSweeping(false);
    }
  };

  const promoteOne = async (row: TokenRow) => {
    setPromotingId(row.id);
    try {
      const now = new Date().toISOString();
      await writeTokenNetworkState(row.id, {
        network_type: 'mainnet',
        mainnet_promoted_at: now,
        market_cap_usd: row.marketCapUsd,
      }, user?.id);
      toast({ title: `${row.symbol} promoted`, description: 'Token is now on mainnet.' });
      await refresh();
    } catch (e: any) {
      toast({ title: 'Promotion failed', description: e.message, variant: 'destructive' });
    } finally {
      setPromotingId(null);
    }
  };

  const devnet  = rows.filter((r) => r.state.network_type === 'devnet');
  const mainnet = rows.filter((r) => r.state.network_type === 'mainnet');

  return (
    <GlassCard className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/20"><Rocket className="h-5 w-5 text-primary" /></div>
          <div>
            <h3 className="font-semibold text-lg">Mainnet Promotion</h3>
            <p className="text-sm text-muted-foreground">
              {promo?.enabled
                ? `Auto: ${promo.min_age_days}d on devnet AND ≥ $${promo.min_market_cap_usd.toLocaleString()} market cap.`
                : 'Auto-promotion is OFF — manually promote tokens below.'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading} className="gap-2" data-testid="button-refresh-promotion">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button onClick={onSweep} disabled={sweeping} className="gap-2" data-testid="button-run-sweep">
            {sweeping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            Run Sweep
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Stat icon={<Network className="h-4 w-4" />}    label="Total Tokens" value={rows.length} />
        <Stat icon={<Clock className="h-4 w-4" />}      label="On Devnet"    value={devnet.length} />
        <Stat icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" />} label="On Mainnet" value={mainnet.length} />
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading tokens...</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No tokens have been created yet.</div>
      ) : (
        <div className="space-y-2">
          <SectionTitle>Devnet ({devnet.length})</SectionTitle>
          {devnet.map((row) => (
            <TokenRowView
              key={row.id}
              row={row}
              promoting={promotingId === row.id}
              onPromote={() => promoteOne(row)}
            />
          ))}
          {mainnet.length > 0 && (
            <>
              <SectionTitle className="mt-6">Mainnet ({mainnet.length})</SectionTitle>
              {mainnet.map((row) => <TokenRowView key={row.id} row={row} promoting={false} />)}
            </>
          )}
        </div>
      )}
    </GlassCard>
  );
};

const Stat = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) => (
  <div className="p-4 rounded-lg bg-secondary/30">
    <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon} {label}</div>
    <div className="text-2xl font-bold mt-1">{value}</div>
  </div>
);

const SectionTitle = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <h4 className={`text-sm font-medium text-muted-foreground uppercase tracking-wide ${className}`}>{children}</h4>
);

const TokenRowView = ({
  row, promoting, onPromote,
}: { row: TokenRow; promoting: boolean; onPromote?: () => void }) => {
  const isMainnet = row.state.network_type === 'mainnet';
  return (
    <div
      className={`flex items-center justify-between p-3 rounded-lg border ${isMainnet ? 'border-emerald-500/30 bg-emerald-500/5' : row.eligible ? 'border-amber-500/40 bg-amber-500/5' : 'border-border bg-secondary/30'}`}
      data-testid={`row-token-${row.id}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium truncate">{row.name} ({row.symbol})</p>
          <Badge variant={isMainnet ? 'default' : 'outline'} className={isMainnet ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : ''}>
            {isMainnet ? 'MAINNET' : 'DEVNET'}
          </Badge>
          {!isMainnet && row.eligible && <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40">Eligible</Badge>}
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1 flex-wrap">
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {row.ageDays.toFixed(1)} days old</span>
          <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3" /> ${row.marketCapUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })} cap</span>
          <span className="truncate">{row.reason}</span>
        </div>
      </div>
      {!isMainnet && onPromote && (
        <Button
          size="sm"
          variant={row.eligible ? 'default' : 'outline'}
          onClick={onPromote}
          disabled={promoting}
          className="gap-2 ml-3"
          data-testid={`button-promote-${row.id}`}
        >
          {promoting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Rocket className="h-3 w-3" />}
          Promote
        </Button>
      )}
    </div>
  );
};
