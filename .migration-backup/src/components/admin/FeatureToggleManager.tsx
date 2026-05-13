import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Settings, Shield, Lock, Unlock } from 'lucide-react';

interface FeatureToggle {
  id: string;
  feature_key: string;
  feature_name: string;
  description: string | null;
  is_enabled: boolean;
  admin_only: boolean;
}

export const FeatureToggleManager = () => {
  const { toast } = useToast();
  const [features, setFeatures] = useState<FeatureToggle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchFeatures(); }, []);

  const fetchFeatures = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('feature_toggles')
      .select('*')
      .order('feature_name');
    if (data) setFeatures(data as any);
    setLoading(false);
  };

  const toggleFeature = async (id: string, field: 'is_enabled' | 'admin_only', value: boolean) => {
    const { error } = await supabase
      .from('feature_toggles')
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      toast({ title: 'Failed to update', variant: 'destructive' });
    } else {
      setFeatures(features.map(f => f.id === id ? { ...f, [field]: value } : f));
      toast({ title: `Feature ${value ? 'enabled' : 'disabled'}` });
    }
  };

  const featureIcon = (key: string) => {
    if (key.includes('contract')) return '📜';
    if (key.includes('token') || key.includes('mint')) return '🪙';
    if (key.includes('defi') || key.includes('swap')) return '🔄';
    if (key.includes('bridge')) return '🌉';
    if (key.includes('stake')) return '📌';
    if (key.includes('pool')) return '💧';
    if (key.includes('launch')) return '🚀';
    if (key.includes('mining')) return '⛏️';
    if (key.includes('auth')) return '🔐';
    if (key.includes('site')) return '🌐';
    return '⚙️';
  };

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 rounded-lg bg-primary/20">
          <Settings className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">Feature & Authority Toggles</h3>
          <p className="text-sm text-muted-foreground">Enable/disable features for all users or restrict to admin only</p>
        </div>
      </div>

      {loading ? (
        <p className="text-center text-muted-foreground py-8">Loading features...</p>
      ) : (
        <div className="space-y-3">
          {features.map((feature) => (
            <div key={feature.id} className="flex items-center justify-between p-4 rounded-lg bg-secondary/30">
              <div className="flex items-center gap-3">
                <span className="text-xl">{featureIcon(feature.feature_key)}</span>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium">{feature.feature_name}</h4>
                    {feature.admin_only && (
                      <Badge variant="outline" className="text-yellow-500 border-yellow-500 text-xs gap-1">
                        <Lock className="h-3 w-3" />
                        Admin Only
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Admin Only</Label>
                  <Switch
                    checked={feature.admin_only}
                    onCheckedChange={(v) => toggleFeature(feature.id, 'admin_only', v)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Enabled</Label>
                  <Switch
                    checked={feature.is_enabled}
                    onCheckedChange={(v) => toggleFeature(feature.id, 'is_enabled', v)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
};
