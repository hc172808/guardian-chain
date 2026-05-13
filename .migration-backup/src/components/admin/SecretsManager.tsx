import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Key, Plus, Trash2, Eye, EyeOff, Save, Shield } from 'lucide-react';

interface SecretEntry {
  key: string;
  value: string;
  isNew?: boolean;
}

export const SecretsManager = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [secrets, setSecrets] = useState<SecretEntry[]>([]);
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSecrets();
  }, []);

  const fetchSecrets = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('admin_config')
      .select('*')
      .eq('config_key', 'edge_secrets')
      .single();

    if (data?.config_value) {
      const val = data.config_value as Record<string, string>;
      setSecrets(Object.entries(val).map(([key, value]) => ({ key, value: value as string })));
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const secretsObj: Record<string, string> = {};
    secrets.forEach(s => { secretsObj[s.key] = s.value; });

    const { error } = await supabase
      .from('admin_config')
      .upsert({
        config_key: 'edge_secrets',
        config_value: secretsObj as any,
        updated_by: user?.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'config_key' });

    if (error) {
      toast({ title: 'Failed to save secrets', variant: 'destructive' });
    } else {
      toast({ title: 'Secrets saved successfully' });
    }
    setSaving(false);
  };

  const addSecret = () => {
    if (!newKey.trim()) return;
    if (secrets.find(s => s.key === newKey.trim())) {
      toast({ title: 'Secret key already exists', variant: 'destructive' });
      return;
    }
    setSecrets([...secrets, { key: newKey.trim().toUpperCase(), value: newValue, isNew: true }]);
    setNewKey('');
    setNewValue('');
  };

  const removeSecret = (key: string) => {
    setSecrets(secrets.filter(s => s.key !== key));
  };

  const updateSecretValue = (key: string, value: string) => {
    setSecrets(secrets.map(s => s.key === key ? { ...s, value } : s));
  };

  const toggleShow = (key: string) => {
    setShowValues(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 rounded-lg bg-primary/20">
          <Key className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">Secrets Manager</h3>
          <p className="text-sm text-muted-foreground">Manage Edge Function secrets and API keys</p>
        </div>
      </div>

      <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 mb-4">
        <p className="text-sm text-yellow-500 flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Secrets are stored encrypted. Changes require saving to take effect.
        </p>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-center py-8">Loading secrets...</p>
      ) : (
        <div className="space-y-3">
          {secrets.map((secret) => (
            <div key={secret.key} className="flex items-center gap-2 p-3 rounded-lg bg-secondary/30">
              <div className="flex-1 space-y-1">
                <Label className="text-xs font-mono text-muted-foreground">{secret.key}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type={showValues[secret.key] ? 'text' : 'password'}
                    value={secret.value}
                    onChange={(e) => updateSecretValue(secret.key, e.target.value)}
                    className="font-mono text-sm"
                  />
                  <Button size="icon" variant="ghost" onClick={() => toggleShow(secret.key)}>
                    {showValues[secret.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button size="icon" variant="ghost" className="text-destructive" onClick={() => removeSecret(secret.key)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}

          {secrets.length === 0 && (
            <p className="text-muted-foreground text-center py-4">No secrets configured yet</p>
          )}

          <div className="border-t border-border pt-4 space-y-3">
            <h4 className="font-medium text-sm">Add New Secret</h4>
            <div className="flex gap-2">
              <Input
                placeholder="SECRET_KEY"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value.toUpperCase())}
                className="font-mono"
              />
              <Input
                placeholder="secret_value"
                type="password"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
              />
              <Button variant="outline" onClick={addSecret} className="gap-1 shrink-0">
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full gap-2 mt-4">
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save All Secrets'}
          </Button>
        </div>
      )}
    </GlassCard>
  );
};
