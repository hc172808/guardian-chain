import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Wrench, AlertTriangle, Save, RefreshCw, Eye, Users, Lock } from 'lucide-react';

const CONFIG_KEY = 'maintenance_mode';

export const MaintenanceManager = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [enabled, setEnabled]   = useState(false);
  const [message, setMessage]   = useState('');
  const [loading, setLoading]   = useState(true);
  const [saving,  setSaving]    = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('admin_config')
        .select('config_value')
        .eq('config_key', CONFIG_KEY)
        .maybeSingle();
      if (data?.config_value) {
        const v = data.config_value as { enabled?: boolean; message?: string };
        setEnabled(!!v.enabled);
        setMessage(v.message ?? '');
      }
      setLoading(false);
    };
    load();
  }, []);

  const save = async (nextEnabled?: boolean) => {
    setSaving(true);
    const newEnabled = nextEnabled !== undefined ? nextEnabled : enabled;
    const { error } = await supabase
      .from('admin_config')
      .upsert(
        {
          config_key:   CONFIG_KEY,
          config_value: { enabled: newEnabled, message: message.trim(), updated_by: user?.id, updated_at: new Date().toISOString() },
          updated_by:   user?.id,
          is_public:    true,
        },
        { onConflict: 'config_key' }
      );

    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    } else {
      toast({
        title: newEnabled ? '🔒 Maintenance mode ON' : '✅ Maintenance mode OFF',
        description: newEnabled
          ? 'New visitors now see the maintenance page.'
          : 'Site is live for all visitors.',
      });
    }
    setSaving(false);
  };

  const toggle = async (val: boolean) => {
    setEnabled(val);
    await save(val);
  };

  if (loading) {
    return (
      <GlassCard className="p-8 flex justify-center">
        <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status card */}
      <GlassCard className={`p-5 border ${enabled ? 'border-amber-500/40 bg-amber-500/5' : 'border-border/40'}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg ${enabled ? 'bg-amber-500/20' : 'bg-muted/40'}`}>
              <Wrench className={`w-5 h-5 ${enabled ? 'text-amber-400' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                Maintenance Mode
                <Badge
                  variant={enabled ? 'destructive' : 'secondary'}
                  className="text-xs"
                >
                  {enabled ? 'ACTIVE' : 'OFF'}
                </Badge>
              </h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                {enabled
                  ? 'New visitors see a maintenance page. Logged-in users see an upgrade banner.'
                  : 'Site is fully accessible to all visitors.'}
              </p>
            </div>
          </div>

          <Switch
            checked={enabled}
            onCheckedChange={toggle}
            disabled={saving}
            className="shrink-0"
          />
        </div>
      </GlassCard>

      {/* What each group sees */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <GlassCard className="p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Lock className="w-4 h-4 text-muted-foreground" />
            New / Logged-out visitors
          </div>
          <p className="text-xs text-muted-foreground">
            {enabled
              ? 'See a full-screen maintenance page with your custom message.'
              : 'Access the site normally.'}
          </p>
          <Badge variant={enabled ? 'destructive' : 'secondary'} className="text-xs">
            {enabled ? 'Blocked — maintenance page' : 'Normal access'}
          </Badge>
        </GlassCard>

        <GlassCard className="p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Users className="w-4 h-4 text-muted-foreground" />
            Existing logged-in users
          </div>
          <p className="text-xs text-muted-foreground">
            {enabled
              ? 'See a dismissible amber banner at the top of every page saying you\'re upgrading.'
              : 'No banner shown.'}
          </p>
          <Badge variant={enabled ? 'outline' : 'secondary'} className="text-xs">
            {enabled ? 'Upgrade banner shown' : 'No banner'}
          </Badge>
        </GlassCard>
      </div>

      {/* Custom message */}
      <GlassCard className="p-5 space-y-4">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Eye className="w-4 h-4 text-primary" /> Custom Message
        </h3>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">
            Message shown on the maintenance page and in the upgrade banner
          </Label>
          <Textarea
            placeholder="We're upgrading the platform with exciting new features. We'll be back shortly!"
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={3}
            maxLength={300}
          />
          <p className="text-xs text-muted-foreground text-right">{message.length}/300</p>
        </div>

        {/* Warning */}
        {enabled && (
          <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-200/80">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
            <span>
              Maintenance mode is currently <strong>ACTIVE</strong>.
              New visitors cannot access the site. Admins and founders bypass the maintenance page automatically.
            </span>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            onClick={() => save()}
            disabled={saving}
            className="gap-2"
          >
            {saving
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Saving…</>
              : <><Save className="w-4 h-4" /> Save Message</>
            }
          </Button>
          {enabled && (
            <Button
              variant="outline"
              onClick={() => toggle(false)}
              disabled={saving}
              className="gap-2 text-green-400 border-green-500/30 hover:bg-green-500/10"
            >
              Turn Off Maintenance
            </Button>
          )}
        </div>
      </GlassCard>
    </div>
  );
};
