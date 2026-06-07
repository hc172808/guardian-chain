import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link2, Save, RefreshCw, Globe, Zap } from 'lucide-react';
import { EXTERNAL_CHAINS } from '@/config/bridgeChains';
import { useBridgeNetworks, saveBridgeNetworkConfig, BridgeNetworkConfig } from '@/hooks/useBridgeNetworks';
import { useToast } from '@/hooks/use-toast';

export const BridgeNetworkManager = () => {
  const { config, loading, refetch } = useBridgeNetworks();
  const [draft, setDraft] = useState<BridgeNetworkConfig>({});
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => { setDraft({ ...config }); }, [config]);

  const toggle = (id: string) => setDraft(prev => ({ ...prev, [id]: !prev[id] }));

  const enableAll = () => {
    const all: BridgeNetworkConfig = {};
    EXTERNAL_CHAINS.forEach(c => { all[c.id] = true; });
    setDraft(all);
  };

  const disableAll = () => {
    const none: BridgeNetworkConfig = {};
    EXTERNAL_CHAINS.forEach(c => { none[c.id] = false; });
    setDraft(none);
  };

  const save = async () => {
    setSaving(true);
    const error = await saveBridgeNetworkConfig(draft);
    setSaving(false);
    if (error) {
      toast({ title: 'Failed to save', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Bridge networks updated', description: 'Users will now only see enabled networks.' });
      refetch();
    }
  };

  const evmChains = EXTERNAL_CHAINS.filter(c => c.evm);
  const nonEvmChains = EXTERNAL_CHAINS.filter(c => !c.evm);
  const enabledCount = EXTERNAL_CHAINS.filter(c => draft[c.id] !== false).length;

  const ChainGroup = ({ label, icon: Icon, chains }: { label: string; icon: any; chains: typeof EXTERNAL_CHAINS }) => (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{label}</h4>
        <Badge variant="outline" className="text-xs ml-auto">
          {chains.filter(c => draft[c.id] !== false).length}/{chains.length} enabled
        </Badge>
      </div>
      <div className="space-y-2">
        {chains.map(chain => {
          const enabled = draft[chain.id] !== false;
          return (
            <div
              key={chain.id}
              className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg w-7 text-center">{chain.logo}</span>
                <div>
                  <p className="font-medium text-sm">{chain.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{chain.symbol} · fee {(chain.bridgeFee * 100).toFixed(1)}%</p>
                </div>
                {!enabled && <Badge variant="destructive" className="text-xs">disabled</Badge>}
              </div>
              <Switch checked={enabled} onCheckedChange={() => toggle(chain.id)} />
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <GlassCard className="p-6">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-primary/20">
              <Link2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Bridge Network Control</h3>
              <p className="text-sm text-muted-foreground">
                Toggle which chains users can see and use in the cross-chain bridge.
              </p>
            </div>
          </div>
          <Badge className="bg-primary/20 text-primary border-primary/30">
            {enabledCount}/{EXTERNAL_CHAINS.length} active
          </Badge>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading config…
          </div>
        ) : (
          <div className="space-y-6">
            <ChainGroup label="EVM-Compatible Chains" icon={Zap} chains={evmChains} />
            <ChainGroup label="Non-EVM Chains" icon={Globe} chains={nonEvmChains} />
          </div>
        )}

        <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border">
          <Button variant="outline" size="sm" onClick={enableAll}>Enable All</Button>
          <Button variant="outline" size="sm" onClick={disableAll}>Disable All</Button>
          <div className="flex-1" />
          <Button onClick={save} disabled={saving} className="gap-2">
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Changes
          </Button>
        </div>
      </GlassCard>
    </div>
  );
};
