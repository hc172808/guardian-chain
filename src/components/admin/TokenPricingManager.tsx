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
}

const DEFAULTS: TokenPricing = {
  deployment_fee: 100,
  freeze_authority_fee: 50,
  update_authority_fee: 25,
  mint_authority_fee: 200,
  min_liquidity: 100,
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

      <Button onClick={save} disabled={saving} className="mt-6 gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save Pricing
      </Button>
    </GlassCard>
  );
};
