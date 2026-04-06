import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Coins, Save, Loader2 } from 'lucide-react';

interface TokenPricing {
  deployment_fee: number;
  freeze_authority_fee: number;
  update_authority_fee: number;
  mint_authority_fee: number;
  min_liquidity: number;
  global_max_buy_per_wallet: number;
  global_daily_buy_limit: number;
  website_hosting_fee: number;
  website_max_size_mb: number;
}

const DEFAULTS: TokenPricing = {
  deployment_fee: 100,
  freeze_authority_fee: 50,
  update_authority_fee: 25,
  mint_authority_fee: 200,
  min_liquidity: 100,
  global_max_buy_per_wallet: 0,
  global_daily_buy_limit: 0,
  website_hosting_fee: 500,
  website_max_size_mb: 5,
};

export const TokenPricingManager = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [pricing, setPricing] = useState<TokenPricing>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('admin_config')
        .select('config_value')
        .eq('config_key', 'token_factory_pricing')
        .maybeSingle();
      if (data?.config_value) {
        const val = data.config_value as Record<string, number>;
        setPricing({
          deployment_fee: val.deployment_fee ?? DEFAULTS.deployment_fee,
          freeze_authority_fee: val.freeze_authority_fee ?? DEFAULTS.freeze_authority_fee,
          update_authority_fee: val.update_authority_fee ?? DEFAULTS.update_authority_fee,
          mint_authority_fee: val.mint_authority_fee ?? DEFAULTS.mint_authority_fee,
          min_liquidity: val.min_liquidity ?? DEFAULTS.min_liquidity,
          global_max_buy_per_wallet: val.global_max_buy_per_wallet ?? DEFAULTS.global_max_buy_per_wallet,
          global_daily_buy_limit: val.global_daily_buy_limit ?? DEFAULTS.global_daily_buy_limit,
          website_hosting_fee: val.website_hosting_fee ?? DEFAULTS.website_hosting_fee,
          website_max_size_mb: val.website_max_size_mb ?? DEFAULTS.website_max_size_mb,
        });
      }
      setLoading(false);
    };
    load();
  }, []);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('admin_config').upsert({
        config_key: 'token_factory_pricing',
        config_value: pricing as any,
        updated_by: user.id,
      }, { onConflict: 'config_key' });
      if (error) throw error;
      toast({ title: 'Pricing Updated', description: 'Token creation fees have been saved.' });
    } catch (err: any) {
      toast({ title: 'Failed', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <GlassCard className="p-6 text-center text-muted-foreground">Loading pricing...</GlassCard>;

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-primary/20">
          <Coins className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">Token Factory Pricing</h3>
          <p className="text-sm text-muted-foreground">Set fees for all token creation features (in GYDS)</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Deployment Fee (GYDS)</Label>
          <Input
            type="number"
            min={0}
            value={pricing.deployment_fee}
            onChange={(e) => setPricing({ ...pricing, deployment_fee: parseFloat(e.target.value) || 0 })}
          />
        </div>
        <div className="space-y-2">
          <Label>Minimum Liquidity (GYDS)</Label>
          <Input
            type="number"
            min={0}
            value={pricing.min_liquidity}
            onChange={(e) => setPricing({ ...pricing, min_liquidity: parseFloat(e.target.value) || 0 })}
          />
        </div>
        <div className="space-y-2">
          <Label>Freeze Authority Fee (GYDS)</Label>
          <Input
            type="number"
            min={0}
            value={pricing.freeze_authority_fee}
            onChange={(e) => setPricing({ ...pricing, freeze_authority_fee: parseFloat(e.target.value) || 0 })}
          />
        </div>
        <div className="space-y-2">
          <Label>Update Authority Fee (GYDS)</Label>
          <Input
            type="number"
            min={0}
            value={pricing.update_authority_fee}
            onChange={(e) => setPricing({ ...pricing, update_authority_fee: parseFloat(e.target.value) || 0 })}
          />
        </div>
        <div className="space-y-2">
          <Label>Mint Authority Fee (GYDS)</Label>
          <Input
            type="number"
            min={0}
            value={pricing.mint_authority_fee}
            onChange={(e) => setPricing({ ...pricing, mint_authority_fee: parseFloat(e.target.value) || 0 })}
          />
        </div>
      </div>

      <div className="mt-6 pt-6 border-t border-border">
        <h4 className="font-medium mb-4">Website Hosting</h4>
        <p className="text-sm text-muted-foreground mb-4">
          Token creators can upload an HTML file to host a mini-website for their token. Set the fee and max file size.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Hosting Fee (GYDS)</Label>
            <Input
              type="number"
              min={0}
              value={pricing.website_hosting_fee}
              onChange={(e) => setPricing({ ...pricing, website_hosting_fee: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-2">
            <Label>Max File Size (MB)</Label>
            <Input
              type="number"
              min={1}
              max={5}
              value={pricing.website_max_size_mb}
              onChange={(e) => setPricing({ ...pricing, website_max_size_mb: Math.min(5, Math.max(1, parseFloat(e.target.value) || 1)) })}
            />
            <p className="text-xs text-muted-foreground">Between 1 and 5 MB</p>
          </div>
        </div>
      </div>

      <div className="mt-6 pt-6 border-t border-border">
        <h4 className="font-medium mb-4">Global Purchase Limits</h4>
        <p className="text-sm text-muted-foreground mb-4">
          These limits apply to all tokens unless overridden by per-token settings. Set to 0 for no limit.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Max Buy Per Wallet (tokens)</Label>
            <Input
              type="number"
              min={0}
              value={pricing.global_max_buy_per_wallet}
              onChange={(e) => setPricing({ ...pricing, global_max_buy_per_wallet: parseFloat(e.target.value) || 0 })}
              placeholder="0 = unlimited"
            />
          </div>
          <div className="space-y-2">
            <Label>Daily Buy Limit (tokens)</Label>
            <Input
              type="number"
              min={0}
              value={pricing.global_daily_buy_limit}
              onChange={(e) => setPricing({ ...pricing, global_daily_buy_limit: parseFloat(e.target.value) || 0 })}
              placeholder="0 = unlimited"
            />
          </div>
        </div>
      </div>

      <Button onClick={save} disabled={saving} className="mt-6 gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save Pricing
      </Button>
    </GlassCard>
  );
};
