import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Coins, Save, Loader2, Rocket, ShieldCheck, AlertTriangle } from 'lucide-react';
import {
  ALL_AUTHORITIES,
  AuthorityKey,
  TokenFactoryPricing,
  DEFAULT_PRICING,
  normalizePricing,
} from '@/lib/tokenAuthorities';

export const TokenPricingManager = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [pricing, setPricing] = useState<TokenFactoryPricing>(DEFAULT_PRICING);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('admin_config')
        .select('config_value')
        .eq('config_key', 'token_factory_pricing')
        .maybeSingle();
      setPricing(normalizePricing(data?.config_value));
      setLoading(false);
    };
    load();
  }, []);

  const updateAuthority = (key: AuthorityKey, patch: Partial<{ enabled: boolean; fee: number }>) => {
    setPricing((p) => ({
      ...p,
      authorities: { ...p.authorities, [key]: { ...p.authorities[key], ...patch } },
    }));
  };

  const updatePromo = (patch: Partial<TokenFactoryPricing['mainnet_promotion']>) => {
    setPricing((p) => ({ ...p, mainnet_promotion: { ...p.mainnet_promotion, ...patch } }));
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('admin_config').upsert(
        {
          config_key: 'token_factory_pricing',
          config_value: pricing as any,
          updated_by: user.id,
        },
        { onConflict: 'config_key' },
      );
      if (error) throw error;
      toast({ title: 'Pricing Updated', description: 'Token factory rules saved.' });
    } catch (err: any) {
      toast({ title: 'Failed', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <GlassCard className="p-6 text-center text-muted-foreground">Loading pricing...</GlassCard>;

  const enabledCount = (Object.keys(pricing.authorities) as AuthorityKey[])
    .filter((k) => pricing.authorities[k].enabled).length;

  return (
    <div className="space-y-6">
      {/* Base fees */}
      <GlassCard className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-primary/20"><Coins className="h-5 w-5 text-primary" /></div>
          <div>
            <h3 className="font-semibold text-lg">Token Factory — Base Fees</h3>
            <p className="text-sm text-muted-foreground">Charged in GYDS for every new token. New tokens always launch on devnet.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Deployment Fee (GYDS)</Label>
            <Input
              data-testid="input-deployment-fee"
              type="number" min={0}
              value={pricing.deployment_fee}
              onChange={(e) => setPricing({ ...pricing, deployment_fee: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-2">
            <Label>Minimum Liquidity (GYDS)</Label>
            <Input
              data-testid="input-min-liquidity"
              type="number" min={0}
              value={pricing.min_liquidity}
              onChange={(e) => setPricing({ ...pricing, min_liquidity: parseFloat(e.target.value) || 0 })}
            />
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-border">
          <h4 className="font-medium mb-3">Global Purchase Limits</h4>
          <p className="text-sm text-muted-foreground mb-4">Apply to every token unless overridden per-token. 0 = unlimited.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Max Buy Per Wallet</Label>
              <Input
                data-testid="input-max-buy"
                type="number" min={0}
                value={pricing.global_max_buy_per_wallet}
                onChange={(e) => setPricing({ ...pricing, global_max_buy_per_wallet: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-2">
              <Label>Daily Buy Limit</Label>
              <Input
                data-testid="input-daily-limit"
                type="number" min={0}
                value={pricing.global_daily_buy_limit}
                onChange={(e) => setPricing({ ...pricing, global_daily_buy_limit: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Authorities matrix */}
      <GlassCard className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/20"><ShieldCheck className="h-5 w-5 text-primary" /></div>
            <div>
              <h3 className="font-semibold text-lg">Token Authorities</h3>
              <p className="text-sm text-muted-foreground">
                Toggle which authorities users may add to their tokens, and set the GYDS fee for each.
              </p>
            </div>
          </div>
          <Badge variant="outline" data-testid="badge-enabled-count">{enabledCount}/{ALL_AUTHORITIES.length} enabled</Badge>
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs uppercase text-muted-foreground border-b border-border">
            <div className="col-span-6">Authority</div>
            <div className="col-span-3">Fee (GYDS)</div>
            <div className="col-span-3 text-right">Allow Users</div>
          </div>
          {ALL_AUTHORITIES.map((a) => {
            const cfg = pricing.authorities[a.key];
            return (
              <div
                key={a.key}
                className={`grid grid-cols-12 gap-2 items-center p-3 rounded-lg ${cfg.enabled ? 'bg-secondary/40' : 'bg-secondary/10 opacity-70'}`}
                data-testid={`row-authority-${a.key}`}
              >
                <div className="col-span-6">
                  <p className="font-medium flex items-center gap-2">
                    {a.label}
                    {a.warning && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                  </p>
                  <p className="text-xs text-muted-foreground">{a.description}</p>
                  {a.warning && <p className="text-xs text-amber-500/80 mt-1">{a.warning}</p>}
                </div>
                <div className="col-span-3">
                  <Input
                    data-testid={`input-fee-${a.key}`}
                    type="number" min={0}
                    value={cfg.fee}
                    onChange={(e) => updateAuthority(a.key, { fee: parseFloat(e.target.value) || 0 })}
                    disabled={!cfg.enabled}
                  />
                </div>
                <div className="col-span-3 flex justify-end">
                  <Switch
                    data-testid={`switch-${a.key}`}
                    checked={cfg.enabled}
                    onCheckedChange={(v) => updateAuthority(a.key, { enabled: v })}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>

      {/* Mainnet promotion */}
      <GlassCard className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-primary/20"><Rocket className="h-5 w-5 text-primary" /></div>
          <div>
            <h3 className="font-semibold text-lg">Devnet → Mainnet Promotion</h3>
            <p className="text-sm text-muted-foreground">
              Tokens launch on devnet. They are auto-promoted to mainnet once they meet BOTH the age and market-cap thresholds.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/40 mb-4">
          <div>
            <p className="font-medium">Auto-Promotion</p>
            <p className="text-xs text-muted-foreground">When off, tokens stay on devnet until you promote them manually.</p>
          </div>
          <Switch
            data-testid="switch-promotion-enabled"
            checked={pricing.mainnet_promotion.enabled}
            onCheckedChange={(v) => updatePromo({ enabled: v })}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Minimum Age on Devnet (days)</Label>
            <Input
              data-testid="input-min-age-days"
              type="number" min={0}
              value={pricing.mainnet_promotion.min_age_days}
              onChange={(e) => updatePromo({ min_age_days: parseInt(e.target.value) || 0 })}
            />
            <p className="text-xs text-muted-foreground">Default: 30 days.</p>
          </div>
          <div className="space-y-2">
            <Label>Minimum Market Cap (USD)</Label>
            <Input
              data-testid="input-min-market-cap"
              type="number" min={0}
              value={pricing.mainnet_promotion.min_market_cap_usd}
              onChange={(e) => updatePromo({ min_market_cap_usd: parseFloat(e.target.value) || 0 })}
            />
            <p className="text-xs text-muted-foreground">Default: $10,000.</p>
          </div>
          <div className="space-y-2">
            <Label>Promotion Fee (GYDS)</Label>
            <Input
              data-testid="input-promotion-fee"
              type="number" min={0}
              value={pricing.mainnet_promotion.promotion_fee}
              onChange={(e) => updatePromo({ promotion_fee: parseFloat(e.target.value) || 0 })}
            />
            <p className="text-xs text-muted-foreground">Optional fee charged when a token is promoted. 0 = free.</p>
          </div>
          <div className="space-y-2">
            <Label>GYDS Price (USD)</Label>
            <Input
              data-testid="input-gyds-price"
              type="number" min={0} step="0.000001"
              value={pricing.mainnet_promotion.gyds_price_usd}
              onChange={(e) => updatePromo({ gyds_price_usd: parseFloat(e.target.value) || 0 })}
            />
            <p className="text-xs text-muted-foreground">Used to convert each token's GYDS-denominated cap into USD.</p>
          </div>
        </div>
      </GlassCard>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} className="gap-2" data-testid="button-save-pricing">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save All Settings
        </Button>
      </div>
    </div>
  );
};
