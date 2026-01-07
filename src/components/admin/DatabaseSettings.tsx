import { useState, useEffect } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Database, 
  Cloud, 
  Server,
  Save,
  TestTube,
  Loader2,
  CheckCircle,
  XCircle
} from 'lucide-react';

interface DatabaseConfig {
  type: 'cloud' | 'external';
  enabled: boolean;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
}

export const DatabaseSettings = () => {
  const { isFounder } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  
  const [config, setConfig] = useState<DatabaseConfig>({
    type: 'cloud',
    enabled: true
  });
  
  const [externalHost, setExternalHost] = useState('');
  const [externalPort, setExternalPort] = useState('5432');
  const [externalDb, setExternalDb] = useState('chaincore');
  const [externalUser, setExternalUser] = useState('');
  const [externalPass, setExternalPass] = useState('');

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    const { data } = await supabase
      .from('admin_config')
      .select('config_value')
      .eq('config_key', 'database_connection')
      .single();
    
    if (data?.config_value) {
      const cfg = data.config_value as unknown as DatabaseConfig;
      setConfig(cfg);
      if (cfg.host) setExternalHost(cfg.host);
      if (cfg.port) setExternalPort(cfg.port.toString());
      if (cfg.database) setExternalDb(cfg.database);
      if (cfg.username) setExternalUser(cfg.username);
    }
    setLoading(false);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    
    // Simulate connection test
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    if (externalHost && externalUser) {
      setTestResult('success');
      toast({ title: 'Connection successful!' });
    } else {
      setTestResult('error');
      toast({ title: 'Connection failed', variant: 'destructive' });
    }
    
    setTesting(false);
  };

  const handleSave = async () => {
    setSaving(true);
    
    const newConfig: DatabaseConfig = {
      type: config.type,
      enabled: config.enabled,
      ...(config.type === 'external' && {
        host: externalHost,
        port: parseInt(externalPort),
        database: externalDb,
        username: externalUser
      })
    };
    
    const { error } = await supabase
      .from('admin_config')
      .update({ config_value: JSON.parse(JSON.stringify(newConfig)) })
      .eq('config_key', 'database_connection');
    
    if (error) {
      toast({ title: 'Failed to save', variant: 'destructive' });
    } else {
      toast({ title: 'Settings saved!' });
    }
    
    setSaving(false);
  };

  if (!isFounder) {
    return (
      <GlassCard className="p-6 text-center">
        <Database className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground">Founder access required</p>
      </GlassCard>
    );
  }

  if (loading) {
    return (
      <GlassCard className="p-6 text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2 mb-6">
        <Database className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Database Configuration</h3>
      </div>

      <div className="space-y-6">
        {/* Cloud Toggle */}
        <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-3">
            <Cloud className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium">Cloud Database</p>
              <p className="text-sm text-muted-foreground">Use Lovable Cloud database</p>
            </div>
          </div>
          <Switch
            checked={config.type === 'cloud'}
            onCheckedChange={(checked) => setConfig({ ...config, type: checked ? 'cloud' : 'external' })}
          />
        </div>

        {/* External Database Config */}
        {config.type === 'external' && (
          <div className="p-4 rounded-lg bg-secondary/30 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Server className="h-4 w-4" />
              <p className="font-medium">External Database</p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Host</Label>
                <Input
                  value={externalHost}
                  onChange={(e) => setExternalHost(e.target.value)}
                  placeholder="db.example.com"
                />
              </div>
              <div>
                <Label>Port</Label>
                <Input
                  value={externalPort}
                  onChange={(e) => setExternalPort(e.target.value)}
                  placeholder="5432"
                />
              </div>
            </div>
            
            <div>
              <Label>Database Name</Label>
              <Input
                value={externalDb}
                onChange={(e) => setExternalDb(e.target.value)}
                placeholder="chaincore"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Username</Label>
                <Input
                  value={externalUser}
                  onChange={(e) => setExternalUser(e.target.value)}
                  placeholder="admin"
                />
              </div>
              <div>
                <Label>Password</Label>
                <Input
                  type="password"
                  value={externalPass}
                  onChange={(e) => setExternalPass(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            </div>
            
            <Button 
              variant="outline" 
              onClick={handleTestConnection} 
              disabled={testing}
              className="w-full gap-2"
            >
              {testing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : testResult === 'success' ? (
                <CheckCircle className="h-4 w-4 text-neon-emerald" />
              ) : testResult === 'error' ? (
                <XCircle className="h-4 w-4 text-destructive" />
              ) : (
                <TestTube className="h-4 w-4" />
              )}
              {testing ? 'Testing...' : 'Test Connection'}
            </Button>
          </div>
        )}

        {/* Disable Cloud */}
        {config.type === 'external' && (
          <div className="flex items-center justify-between p-4 rounded-lg border border-destructive/30 bg-destructive/5">
            <div>
              <p className="font-medium text-destructive">Disable Cloud Database</p>
              <p className="text-sm text-muted-foreground">
                This will stop all cloud database operations
              </p>
            </div>
            <Switch
              checked={!config.enabled}
              onCheckedChange={(checked) => setConfig({ ...config, enabled: !checked })}
            />
          </div>
        )}

        <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saving ? 'Saving...' : 'Save Configuration'}
        </Button>
      </div>
    </GlassCard>
  );
};
