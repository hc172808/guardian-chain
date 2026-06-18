import { useState, useEffect } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { logAuditEvent } from '@/lib/auditLog';
import { GYD_TOKEN, GYDS_TOKEN } from '@/config/tokens';
import { 
  DollarSign, 
  Link2, 
  Link2Off,
  Coins, 
  TrendingUp, 
  Loader2,
  Save,
  AlertTriangle
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';

interface StablecoinConfig {
  isPegged: boolean;
  pegValue: number;
  customPrice: number;
  totalSupply: number;
  circulatingSupply: number;
  collateralUSD: number;
}

interface GYDSConfig {
  price: number;
  totalSupply: number;
  circulatingSupply: number;
  burnedTotal: number;
}

export const StablecoinManager = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // GYD Stablecoin config
  const [gydConfig, setGydConfig] = useState<StablecoinConfig>({
    isPegged: true,
    pegValue: 1.0,
    customPrice: 1.0,
    totalSupply: 0,
    circulatingSupply: 0,
    collateralUSD: 0,
  });

  // GYDS token config
  const [gydsConfig, setGydsConfig] = useState<GYDSConfig>({
    price: 0.0000001,
    totalSupply: 100_000_000_000,
    circulatingSupply: 0,
    burnedTotal: 0,
  });

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const [priceData, configRow] = await Promise.all([
        api.get('/api/token-price').catch(() => null),
        api.get('/api/config/gyd_stablecoin').catch(() => null),
      ]);
      if (priceData) {
        setGydsConfig({
          price: priceData.price,
          totalSupply: priceData.total_supply,
          circulatingSupply: priceData.circulating_supply,
          burnedTotal: priceData.burned_total,
        });
      }
      if (configRow?.configValue) {
        const config = configRow.configValue as Record<string, unknown>;
        setGydConfig({
          isPegged: (config.isPegged as boolean) ?? true,
          pegValue: (config.pegValue as number) ?? 1.0,
          customPrice: (config.customPrice as number) ?? 1.0,
          totalSupply: (config.totalSupply as number) ?? 0,
          circulatingSupply: (config.circulatingSupply as number) ?? 0,
          collateralUSD: (config.collateralUSD as number) ?? 0,
        });
      }
    } catch { /* use defaults */ }
    setLoading(false);
  };

  const saveGydConfig = async () => {
    setSaving(true);
    const configValue = {
      isPegged: gydConfig.isPegged,
      pegValue: gydConfig.pegValue,
      customPrice: gydConfig.customPrice,
      totalSupply: gydConfig.totalSupply,
      circulatingSupply: gydConfig.circulatingSupply,
      collateralUSD: gydConfig.collateralUSD,
    };
    try {
      await api.post('/api/config', { key: 'gyd_stablecoin', value: configValue });
      toast({ title: 'GYD configuration saved!' });
      if (user) {
        await logAuditEvent(user.id, user.email ?? null, {
          action: 'stablecoin_config_save', category: 'token', target_type: 'token', target_id: 'gyd', details: configValue,
        });
      }
    } catch (e: any) {
      toast({ title: 'Failed to save', description: e.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  const saveGydsPrice = async () => {
    setSaving(true);
    try {
      await api.patch('/api/token-price', {
        price: gydsConfig.price,
        total_supply: gydsConfig.totalSupply,
        circulating_supply: gydsConfig.circulatingSupply,
        burned_total: gydsConfig.burnedTotal,
      });
      toast({ title: 'GYDS price updated!' });
      if (user) {
        await logAuditEvent(user.id, user.email ?? null, {
          action: 'token_price_update', category: 'token', target_type: 'token', target_id: 'gyds',
          details: { price: gydsConfig.price },
        });
      }
    } catch (e: any) {
      toast({ title: 'Failed to save', description: e.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  const getEffectiveGydPrice = () => {
    return gydConfig.isPegged ? gydConfig.pegValue : gydConfig.customPrice;
  };

  if (loading) {
    return (
      <GlassCard className="p-8 text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto" />
        <p className="mt-2 text-muted-foreground">Loading token configuration...</p>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-6">
      {/* Token Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <GlassCard className="p-4 text-center">
          <DollarSign className="h-6 w-6 mx-auto text-primary mb-2" />
          <p className="text-xs text-muted-foreground">GYDS Price</p>
          <p className="text-xl font-bold font-mono">${gydsConfig.price.toFixed(7)}</p>
        </GlassCard>
        
        <GlassCard className="p-4 text-center">
          <Coins className="h-6 w-6 mx-auto text-neon-emerald mb-2" />
          <p className="text-xs text-muted-foreground">GYD Price</p>
          <p className="text-xl font-bold font-mono">${getEffectiveGydPrice().toFixed(2)}</p>
          {gydConfig.isPegged ? (
            <Badge variant="outline" className="mt-1 text-xs text-neon-emerald border-neon-emerald">
              <Link2 className="h-3 w-3 mr-1" /> Pegged
            </Badge>
          ) : (
            <Badge variant="outline" className="mt-1 text-xs text-neon-amber border-neon-amber">
              <Link2Off className="h-3 w-3 mr-1" /> Custom
            </Badge>
          )}
        </GlassCard>
        
        <GlassCard className="p-4 text-center">
          <TrendingUp className="h-6 w-6 mx-auto text-neon-amber mb-2" />
          <p className="text-xs text-muted-foreground">GYDS Circulating</p>
          <p className="text-xl font-bold font-mono">{(gydsConfig.circulatingSupply / 1e6).toFixed(2)}M</p>
        </GlassCard>
        
        <GlassCard className="p-4 text-center">
          <DollarSign className="h-6 w-6 mx-auto text-neon-emerald mb-2" />
          <p className="text-xs text-muted-foreground">GYD Collateral</p>
          <p className="text-xl font-bold font-mono">${gydConfig.collateralUSD.toLocaleString()}</p>
        </GlassCard>
      </div>

      <Tabs defaultValue="gyd" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="gyd">GYD Stablecoin</TabsTrigger>
          <TabsTrigger value="gyds">GYDS Token</TabsTrigger>
        </TabsList>

        <TabsContent value="gyd">
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <Coins className="h-5 w-5 text-neon-emerald" />
              GYDchain (GYD) - Stablecoin Configuration
            </h3>

            <div className="space-y-6">
              {/* Peg Toggle */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/30 border border-border/50">
                <div className="flex items-center gap-3">
                  {gydConfig.isPegged ? (
                    <Link2 className="h-5 w-5 text-neon-emerald" />
                  ) : (
                    <Link2Off className="h-5 w-5 text-neon-amber" />
                  )}
                  <div>
                    <p className="font-medium">USD Peg</p>
                    <p className="text-sm text-muted-foreground">
                      {gydConfig.isPegged ? '1 GYD = 1 USD (fixed)' : 'Custom price enabled'}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={gydConfig.isPegged}
                  onCheckedChange={(checked) => setGydConfig({ ...gydConfig, isPegged: checked })}
                />
              </div>

              {!gydConfig.isPegged && (
                <div className="p-4 rounded-lg bg-neon-amber/10 border border-neon-amber/30">
                  <div className="flex items-center gap-2 text-neon-amber mb-3">
                    <AlertTriangle className="h-5 w-5" />
                    <span className="font-medium">Peg Disabled - Manual Price</span>
                  </div>
                  <div>
                    <Label>Custom GYD Price (USD)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={gydConfig.customPrice}
                      onChange={(e) => setGydConfig({ ...gydConfig, customPrice: parseFloat(e.target.value) || 0 })}
                      placeholder="1.00"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Total GYD Supply</Label>
                  <Input
                    type="number"
                    value={gydConfig.totalSupply}
                    onChange={(e) => setGydConfig({ ...gydConfig, totalSupply: parseFloat(e.target.value) || 0 })}
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label>Circulating Supply</Label>
                  <Input
                    type="number"
                    value={gydConfig.circulatingSupply}
                    onChange={(e) => setGydConfig({ ...gydConfig, circulatingSupply: parseFloat(e.target.value) || 0 })}
                    placeholder="0"
                  />
                </div>
              </div>

              <div>
                <Label>USD Collateral Reserve</Label>
                <Input
                  type="number"
                  value={gydConfig.collateralUSD}
                  onChange={(e) => setGydConfig({ ...gydConfig, collateralUSD: parseFloat(e.target.value) || 0 })}
                  placeholder="0"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Collateral Ratio: {gydConfig.circulatingSupply > 0 
                    ? ((gydConfig.collateralUSD / (gydConfig.circulatingSupply * getEffectiveGydPrice())) * 100).toFixed(2)
                    : '100'}%
                </p>
              </div>

              <Button onClick={saveGydConfig} disabled={saving} className="w-full gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save GYD Configuration
              </Button>
            </div>
          </GlassCard>
        </TabsContent>

        <TabsContent value="gyds">
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <TrendingUp className="h-5 w-5 text-primary" />
              GYDSchain (GYDS) - Native Token Configuration
            </h3>

            <div className="space-y-6">
              <div>
                <Label>GYDS Price (USD)</Label>
                <Input
                  type="number"
                  step="0.0000001"
                  value={gydsConfig.price}
                  onChange={(e) => setGydsConfig({ ...gydsConfig, price: parseFloat(e.target.value) || 0 })}
                  placeholder="0.0000001"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Market cap: ${(gydsConfig.price * gydsConfig.circulatingSupply).toLocaleString()}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Total Supply</Label>
                  <Input
                    type="number"
                    value={gydsConfig.totalSupply}
                    disabled
                    className="opacity-50"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Fixed max supply</p>
                </div>
                <div>
                  <Label>Circulating Supply</Label>
                  <Input
                    type="number"
                    value={gydsConfig.circulatingSupply}
                    onChange={(e) => setGydsConfig({ ...gydsConfig, circulatingSupply: parseFloat(e.target.value) || 0 })}
                    placeholder="0"
                  />
                </div>
              </div>

              <div>
                <Label>Total Burned (USD value)</Label>
                <Input
                  type="number"
                  value={gydsConfig.burnedTotal}
                  onChange={(e) => setGydsConfig({ ...gydsConfig, burnedTotal: parseFloat(e.target.value) || 0 })}
                  placeholder="0"
                />
              </div>

              <Button onClick={saveGydsPrice} disabled={saving} className="w-full gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save GYDS Configuration
              </Button>
            </div>
          </GlassCard>
        </TabsContent>
      </Tabs>

      {/* Token Info Cards */}
      <div className="grid md:grid-cols-2 gap-4">
        <GlassCard className="p-4">
          <h4 className="font-semibold mb-2">{GYDS_TOKEN.name} ({GYDS_TOKEN.symbol})</h4>
          <p className="text-sm text-muted-foreground">{GYDS_TOKEN.description}</p>
          <div className="mt-2 text-xs space-y-1">
            <p>Decimals: {GYDS_TOKEN.decimals}</p>
            <p>Max Supply: {GYDS_TOKEN.maxSupply.toLocaleString()}</p>
          </div>
        </GlassCard>
        
        <GlassCard className="p-4">
          <h4 className="font-semibold mb-2">{GYD_TOKEN.name} ({GYD_TOKEN.symbol})</h4>
          <p className="text-sm text-muted-foreground">{GYD_TOKEN.description}</p>
          <div className="mt-2 text-xs space-y-1">
            <p>Decimals: {GYD_TOKEN.decimals}</p>
            <p>Peg: {gydConfig.isPegged ? `$${gydConfig.pegValue} USD` : 'Custom'}</p>
          </div>
        </GlassCard>
      </div>
    </div>
  );
};
