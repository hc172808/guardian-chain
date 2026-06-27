import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  Blocks, Plus, Trash2, Copy, Check, RefreshCw, AlertTriangle,
  Server, Network, Shield, CheckCircle2, Terminal, Download, Loader2
} from 'lucide-react';

interface GenesisValidator {
  address: string;
  stake: number;
  label?: string;
  addedAt: string;
}

interface GenesisPeer {
  enode: string;
  label?: string;
  addedAt: string;
}

interface GenesisConfig {
  validators: GenesisValidator[];
  peers: GenesisPeer[];
  genesisNodeEnode: string;
  chainId: number;
  networkName: string;
}

export function GenesisManager() {
  const { toast } = useToast();
  const [config, setConfig] = useState<GenesisConfig>({
    validators: [],
    peers: [],
    genesisNodeEnode: '',
    chainId: 13370,
    networkName: 'GYDSchain',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const [newValidatorAddr, setNewValidatorAddr] = useState('');
  const [newValidatorStake, setNewValidatorStake] = useState('10000');
  const [newValidatorLabel, setNewValidatorLabel] = useState('');

  const [newPeerEnode, setNewPeerEnode] = useState('');
  const [newPeerLabel, setNewPeerLabel] = useState('');
  const [fetchingEnode, setFetchingEnode] = useState(false);
  const [enodeNetwork, setEnodeNetwork] = useState<'mainnet' | 'testnet' | 'devnet'>('mainnet');

  useEffect(() => { loadConfig(); }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/config/genesis_network', { credentials: 'include' });
      if (res.ok) {
        const row = await res.json();
        if (row) {
          const data = (row.configValue ?? row) as Partial<GenesisConfig>;
          setConfig(prev => ({ ...prev, ...data }));
        }
      }
    } catch { /* first load */ }
    setLoading(false);
  };

  const saveConfig = async (next: GenesisConfig) => {
    setSaving(true);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'genesis_network', value: next }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: '❌ Save failed', description: err.error ?? `HTTP ${res.status}`, variant: 'destructive' });
        return false;
      }
      setConfig(next);
      toast({ title: '✅ Genesis config saved' });
      return true;
    } catch (e: any) {
      toast({ title: '❌ Save failed', description: e.message, variant: 'destructive' });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const addValidator = async () => {
    const addr = newValidatorAddr.trim();
    if (!addr || !addr.startsWith('0x') || addr.length < 40) {
      toast({ title: 'Invalid address', description: 'Must be a 0x… Ethereum-format address', variant: 'destructive' });
      return;
    }
    const stake = parseInt(newValidatorStake) || 10000;
    const next: GenesisConfig = {
      ...config,
      validators: [
        ...config.validators.filter(v => v.address.toLowerCase() !== addr.toLowerCase()),
        { address: addr, stake, label: newValidatorLabel.trim() || undefined, addedAt: new Date().toISOString() },
      ],
    };
    if (await saveConfig(next)) {
      setNewValidatorAddr('');
      setNewValidatorLabel('');
    }
  };

  const removeValidator = async (address: string) => {
    if (!confirm(`Remove validator ${address.slice(0, 10)}…?`)) return;
    await saveConfig({ ...config, validators: config.validators.filter(v => v.address !== address) });
  };

  const addPeer = async () => {
    const enode = newPeerEnode.trim();
    if (!enode.startsWith('enode://')) {
      toast({ title: 'Invalid enode', description: 'Must start with enode://', variant: 'destructive' });
      return;
    }
    const next: GenesisConfig = {
      ...config,
      peers: [
        ...config.peers.filter(p => p.enode !== enode),
        { enode, label: newPeerLabel.trim() || undefined, addedAt: new Date().toISOString() },
      ],
    };
    if (await saveConfig(next)) {
      setNewPeerEnode('');
      setNewPeerLabel('');
    }
  };

  const removePeer = async (enode: string) => {
    if (!confirm('Remove this bootstrap peer?')) return;
    await saveConfig({ ...config, peers: config.peers.filter(p => p.enode !== enode) });
  };

  const setGenesisEnode = async (enode: string) => {
    await saveConfig({ ...config, genesisNodeEnode: enode });
  };

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
    toast({ title: 'Copied!' });
  };

  const fetchLocalEnode = async () => {
    setFetchingEnode(true);
    try {
      const res = await fetch(`/api/admin/genesis-enode/${enodeNetwork}`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast({ title: 'Failed to fetch enode', description: data.error ?? `HTTP ${res.status}`, variant: 'destructive' });
        return;
      }
      setConfig(c => ({ ...c, genesisNodeEnode: data.enode }));
      toast({
        title: data.running ? '✅ Genesis enode fetched' : '⚠️ Genesis test node not running',
        description: data.running
          ? `Enode loaded from local ${enodeNetwork} genesis node (port ${data.port})`
          : `Enode generated for ${enodeNetwork} — start the genesis test node to use it live`,
      });
    } catch (e: any) {
      toast({ title: 'Network error', description: e.message, variant: 'destructive' });
    } finally {
      setFetchingEnode(false);
    }
  };

  const buildBootstrapEnv = () =>
    [...config.peers, ...(config.genesisNodeEnode ? [{ enode: config.genesisNodeEnode }] : [])]
      .map(p => p.enode).join(',');

  if (loading) return (
    <GlassCard className="p-6 animate-pulse">
      <div className="h-4 bg-muted rounded w-1/3 mb-3" />
      <div className="h-3 bg-muted rounded w-2/3" />
    </GlassCard>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <GlassCard className="p-5 border-yellow-500/30">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-lg bg-yellow-500/20">
            <Blocks className="h-5 w-5 text-yellow-400" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Genesis Network Config</h3>
              <Button size="sm" variant="ghost" onClick={loadConfig} className="gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage genesis validators, bootstrap peers, and enode addresses for the GYDSchain network (Chain ID 13370).
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
          <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />
          <p className="text-xs text-yellow-300">
            Changes here update the dashboard config only. To apply to a running genesis node, update its
            <code className="bg-black/30 px-1 rounded mx-1">/opt/gyds-genesis/config/genesis.json</code>
            and restart: <code className="bg-black/30 px-1 rounded">sudo systemctl restart gyds-genesis</code>
          </p>
        </div>
      </GlassCard>

      {/* Genesis node enode */}
      <GlassCard className="p-5 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Server className="h-4 w-4 text-primary" />
          <h4 className="font-medium">Genesis Node Enode Address</h4>
        </div>
        <p className="text-xs text-muted-foreground">
          If running a local test genesis node, click <strong>Fetch from local node</strong> to auto-fill. For a real external server, run the command below and paste the result.
        </p>

        {/* Quick-fetch from local test genesis node */}
        <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/30">
          <Download className="h-4 w-4 text-primary shrink-0" />
          <span className="text-xs text-muted-foreground flex-1">Fetch enode from local test genesis node:</span>
          <Select value={enodeNetwork} onValueChange={v => setEnodeNetwork(v as any)}>
            <SelectTrigger className="h-8 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mainnet">Mainnet</SelectItem>
              <SelectItem value="testnet">Testnet</SelectItem>
              <SelectItem value="devnet">Devnet</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={fetchLocalEnode} disabled={fetchingEnode} className="gap-1.5 shrink-0">
            {fetchingEnode ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Fetch
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">Or run this on your external genesis server and paste the result below:</p>
        <pre className="text-xs bg-black/40 p-3 rounded font-mono overflow-x-auto">
          {`curl -s http://GENESIS_SERVER_IP:8544 \\
  -H 'Content-Type: application/json' \\
  -d '{"jsonrpc":"2.0","method":"net_enode","params":[],"id":1}' \\
  | jq -r '.result'`}
        </pre>
        <div className="flex gap-2">
          <Input
            value={config.genesisNodeEnode}
            onChange={e => setConfig(c => ({ ...c, genesisNodeEnode: e.target.value }))}
            placeholder="enode://abc123...@203.0.113.10:30300"
            className="font-mono text-xs"
          />
          <Button
            onClick={() => setGenesisEnode(config.genesisNodeEnode)}
            disabled={saving}
            className="shrink-0"
          >
            Save
          </Button>
          {config.genesisNodeEnode && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => copy(config.genesisNodeEnode, 'genesis-enode')}
            >
              {copied === 'genesis-enode' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          )}
        </div>
        {config.genesisNodeEnode && (
          <Badge variant="outline" className="text-green-400 border-green-400/40 gap-1 text-xs">
            <CheckCircle2 className="h-3 w-3" /> Genesis enode configured
          </Badge>
        )}
      </GlassCard>

      {/* Bootstrap GYDS_BOOTSTRAP_NODES env */}
      {(config.peers.length > 0 || config.genesisNodeEnode) && (
        <GlassCard className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-primary" />
              <h4 className="font-medium">Bootstrap Env Variable</h4>
            </div>
            <Button size="sm" variant="outline" onClick={() => copy(buildBootstrapEnv(), 'bootstrap-env')} className="gap-1.5">
              {copied === 'bootstrap-env' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              Copy
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Pass this to all non-genesis node install commands as <code className="bg-black/30 px-1 rounded">GYDS_BOOTSTRAP_NODES</code>:</p>
          <pre className="text-xs bg-black/40 p-3 rounded overflow-x-auto whitespace-pre-wrap font-mono">
            {`GYDS_BOOTSTRAP_NODES="${buildBootstrapEnv()}"`}
          </pre>
        </GlassCard>
      )}

      {/* Validators */}
      <GlassCard className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <h4 className="font-medium">Genesis Validators ({config.validators.length})</h4>
        </div>
        <p className="text-xs text-muted-foreground">
          Validators are pre-authorized in the genesis block. Each must have at least 10,000 GYDS staked.
        </p>

        {/* Add validator form */}
        <div className="space-y-2 p-3 rounded-lg bg-secondary/30 border border-border/50">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Add Validator</p>
          <div className="grid sm:grid-cols-3 gap-2">
            <div className="sm:col-span-2 space-y-1">
              <Label className="text-xs">Wallet Address (0x…)</Label>
              <Input
                value={newValidatorAddr}
                onChange={e => setNewValidatorAddr(e.target.value)}
                placeholder="0xABC123..."
                className="font-mono text-xs h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Initial Stake (GYDS)</Label>
              <Input
                type="number"
                value={newValidatorStake}
                onChange={e => setNewValidatorStake(e.target.value)}
                min={10000}
                className="h-9 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Input
              value={newValidatorLabel}
              onChange={e => setNewValidatorLabel(e.target.value)}
              placeholder="Label (optional — e.g. Founder Validator)"
              className="h-9 text-sm"
            />
            <Button onClick={addValidator} disabled={saving || !newValidatorAddr} className="gap-1.5 shrink-0">
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
        </div>

        {/* Validator list */}
        {config.validators.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No genesis validators yet.</p>
        ) : (
          <div className="space-y-2">
            {config.validators.map((v, i) => (
              <div key={v.address} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-1.5 rounded-md bg-primary/20 shrink-0">
                    <Shield className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {v.label && <span className="text-sm font-medium">{v.label}</span>}
                      <Badge variant="outline" className="text-xs font-mono">
                        {v.address.slice(0, 10)}…{v.address.slice(-6)}
                      </Badge>
                      <Badge className="text-xs bg-primary/20 text-primary border-primary/30">
                        {v.stake.toLocaleString()} GYDS
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Added {new Date(v.addedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copy(v.address, `addr-${i}`)}>
                    {copied === `addr-${i}` ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:bg-destructive/10"
                    onClick={() => removeValidator(v.address)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* Bootstrap Peers */}
      <GlassCard className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4 text-primary" />
          <h4 className="font-medium">Bootstrap Peers ({config.peers.length})</h4>
        </div>
        <p className="text-xs text-muted-foreground">
          Additional enode addresses (beyond genesis) that new nodes should connect to on startup.
        </p>

        {/* Add peer form */}
        <div className="space-y-2 p-3 rounded-lg bg-secondary/30 border border-border/50">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Add Bootstrap Peer</p>
          <div className="space-y-1">
            <Label className="text-xs">Enode URL</Label>
            <Input
              value={newPeerEnode}
              onChange={e => setNewPeerEnode(e.target.value)}
              placeholder="enode://pubkey@ip:port"
              className="font-mono text-xs h-9"
            />
          </div>
          <div className="flex gap-2">
            <Input
              value={newPeerLabel}
              onChange={e => setNewPeerLabel(e.target.value)}
              placeholder="Label (optional — e.g. Boot Node 1)"
              className="h-9 text-sm"
            />
            <Button onClick={addPeer} disabled={saving || !newPeerEnode} className="gap-1.5 shrink-0">
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
        </div>

        {/* Peer list */}
        {config.peers.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No additional bootstrap peers yet.</p>
        ) : (
          <div className="space-y-2">
            {config.peers.map((p, i) => (
              <div key={p.enode} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-1.5 rounded-md bg-primary/20 shrink-0">
                    <Network className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {p.label && <span className="text-sm font-medium">{p.label}</span>}
                      <code className="text-xs bg-black/30 px-1.5 py-0.5 rounded font-mono">
                        {p.enode.slice(0, 30)}…
                      </code>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Added {new Date(p.addedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copy(p.enode, `peer-${i}`)}>
                    {copied === `peer-${i}` ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:bg-destructive/10"
                    onClick={() => removePeer(p.enode)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
