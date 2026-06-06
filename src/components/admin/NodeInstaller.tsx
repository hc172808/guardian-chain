import { useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Server, Globe, Smartphone, Network, Copy, Check, Terminal } from 'lucide-react';

type NodeType = 'bootnode' | 'fullnode' | 'litenode' | 'rpc' | 'termux';

interface NodeOption {
  id: NodeType;
  label: string;
  desc: string;
  icon: typeof Server;
  ports: string;
  needsRoot: boolean;
}

const NODE_OPTIONS: NodeOption[] = [
  { id: 'bootnode', label: 'Bootnode',  desc: 'Peer discovery only — no mining, no RPC. Run 2-3 of these.', icon: Network,    ports: '30303 tcp+udp',   needsRoot: true  },
  { id: 'fullnode', label: 'Full Node', desc: 'Founder full node with PoS consensus, mining and RPC.',       icon: Server,     ports: '8546, 30303',     needsRoot: true  },
  { id: 'rpc',      label: 'RPC Node',  desc: 'Public-facing RPC endpoint (no mining, shifted ports).',       icon: Globe,      ports: '8547, 30304',     needsRoot: true  },
  { id: 'litenode', label: 'Lite Node', desc: 'Cache + wallet. Talks to public RPC. Runs as your user.',     icon: Server,     ports: '3030 (api)',      needsRoot: false },
  { id: 'termux',   label: 'Mobile (Termux)', desc: 'Android phone lite node via Termux.',                    icon: Smartphone, ports: 'n/a',             needsRoot: false },
];

export function NodeInstaller() {
  const [selected, setSelected] = useState<Record<NodeType, boolean>>({
    bootnode: false, fullnode: false, litenode: false, rpc: false, termux: false,
  });
  const [srcDir, setSrcDir]               = useState('/opt/gydschain/public/blockchain-go');
  const [repoUrl, setRepoUrl]             = useState('https://github.com/hc172808/guardian-chain.git');
  const [autoClone, setAutoClone]         = useState(true);
  const [enableMining, setEnableMining]   = useState(true);
  const [blockTime, setBlockTime]         = useState('120');
  const [copied, setCopied]               = useState<string | null>(null);
  const { toast } = useToast();

  const anySelected = Object.values(selected).some(Boolean);

  const toggle = (id: NodeType) =>
    setSelected((s) => ({ ...s, [id]: !s[id] }));

  const buildCommand = (): string => {
    const lines: string[] = [];
    lines.push('# GYDSchain Node Installer — copy & paste this on your server');
    lines.push('set -euo pipefail');
    lines.push('');
    if (autoClone) {
      lines.push('# 1. Get the source');
      lines.push('sudo mkdir -p /opt && cd /opt');
      lines.push(`sudo git clone --depth=1 ${repoUrl} gydschain-repo 2>/dev/null || ( cd /opt/gydschain-repo && sudo git pull --ff-only )`);
      lines.push('export SRC_DIR=/opt/gydschain-repo/public/blockchain-go');
    } else {
      lines.push(`export SRC_DIR=${srcDir}`);
    }
    lines.push(`export BLOCK_TIME=${blockTime}`);
    lines.push(`export ENABLE_MINING=${enableMining}`);
    lines.push('');
    lines.push('# 2. Run the installer');
    const flags: string[] = [];
    if (selected.bootnode) flags.push('--bootnode');
    if (selected.fullnode) flags.push('--fullnode');
    if (selected.rpc)      flags.push('--rpc');
    if (selected.litenode) flags.push('--litenode');
    const linuxFlags = flags.join(' ');
    if (linuxFlags) {
      lines.push(`sudo -E bash "$SRC_DIR/../scripts/install-all-nodes.sh" ${linuxFlags}`);
    }
    if (selected.termux) {
      lines.push('');
      lines.push('# 3. For Android (Termux only — run inside the Termux app, not on the server):');
      lines.push(`#   bash "$SRC_DIR/../scripts/install-termux.sh"`);
    }
    return lines.join('\n');
  };

  const oneLiner = (): string => {
    const flags: string[] = [];
    if (selected.bootnode) flags.push('--bootnode');
    if (selected.fullnode) flags.push('--fullnode');
    if (selected.rpc)      flags.push('--rpc');
    if (selected.litenode) flags.push('--litenode');
    const f = flags.join(' ') || '--all';
    if (autoClone) {
      return `curl -fsSL ${repoUrl.replace(/\.git$/, '')}/raw/main/public/scripts/install-all-nodes.sh | sudo BLOCK_TIME=${blockTime} ENABLE_MINING=${enableMining} REPO_URL=${repoUrl} bash -s -- ${f}`;
    }
    return `sudo SRC_DIR=${srcDir} BLOCK_TIME=${blockTime} ENABLE_MINING=${enableMining} bash ${srcDir}/../scripts/install-all-nodes.sh ${f}`;
  };

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    toast({ title: 'Copied to clipboard', description: `${label} copied. Paste it into your server SSH session.` });
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-4" data-testid="panel-node-installer">
      <GlassCard className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 rounded-lg bg-primary/20">
            <Server className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Node Installer</h3>
            <p className="text-sm text-muted-foreground">
              Pick which GYDSchain nodes to install on a single Ubuntu 22.04 server.
              All scripts build the real Go binaries from source.
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          {NODE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const on = selected[opt.id];
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => toggle(opt.id)}
                data-testid={`button-toggle-${opt.id}`}
                className={`text-left p-4 rounded-lg border-2 transition-all ${
                  on
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-secondary/30 hover:border-primary/40'
                }`}
              >
                <div className="flex items-start gap-3">
                  <Icon className={`h-5 w-5 mt-0.5 ${on ? 'text-primary' : 'text-muted-foreground'}`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium" data-testid={`label-${opt.id}`}>{opt.label}</span>
                      {on && <Badge variant="default" className="text-xs">selected</Badge>}
                      {opt.needsRoot && <Badge variant="outline" className="text-xs">root</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{opt.desc}</p>
                    <p className="text-xs text-muted-foreground mt-1">Ports: {opt.ports}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </GlassCard>

      <GlassCard className="p-6 space-y-4">
        <h4 className="font-medium">Configuration</h4>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="block-time">Mining block time (seconds)</Label>
            <Input
              id="block-time"
              type="number"
              value={blockTime}
              onChange={(e) => setBlockTime(e.target.value)}
              data-testid="input-block-time"
            />
            <p className="text-xs text-muted-foreground">Default: 120s (matches network consensus).</p>
          </div>

          <div className="space-y-2 flex flex-col">
            <Label htmlFor="enable-mining">Enable mining on full node</Label>
            <div className="flex items-center gap-3 pt-2">
              <Switch
                id="enable-mining"
                checked={enableMining}
                onCheckedChange={setEnableMining}
                data-testid="switch-mining"
              />
              <span className="text-sm text-muted-foreground">
                {enableMining ? 'Mining enabled' : 'Mining disabled'}
              </span>
            </div>
          </div>

          <div className="space-y-2 md:col-span-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="auto-clone">Auto-clone source from GitHub</Label>
              <Switch
                id="auto-clone"
                checked={autoClone}
                onCheckedChange={setAutoClone}
                data-testid="switch-auto-clone"
              />
            </div>
            {autoClone ? (
              <Input
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/owner/repo.git"
                data-testid="input-repo-url"
              />
            ) : (
              <Input
                value={srcDir}
                onChange={(e) => setSrcDir(e.target.value)}
                placeholder="/opt/gydschain/public/blockchain-go"
                data-testid="input-src-dir"
              />
            )}
          </div>
        </div>
      </GlassCard>

      {anySelected && (
        <>
          <GlassCard className="p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium flex items-center gap-2">
                <Terminal className="h-4 w-4" />
                One-line install command
              </h4>
              <Button
                size="sm"
                variant="outline"
                onClick={() => copy(oneLiner(), 'One-liner')}
                data-testid="button-copy-oneliner"
                className="gap-2"
              >
                {copied === 'One-liner' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied === 'One-liner' ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <pre
              className="text-xs bg-black/40 p-3 rounded overflow-x-auto whitespace-pre-wrap break-all"
              data-testid="text-oneliner"
            >
              {oneLiner()}
            </pre>
          </GlassCard>

          <GlassCard className="p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium flex items-center gap-2">
                <Terminal className="h-4 w-4" />
                Full install script
              </h4>
              <Button
                size="sm"
                variant="outline"
                onClick={() => copy(buildCommand(), 'Install script')}
                data-testid="button-copy-script"
                className="gap-2"
              >
                {copied === 'Install script' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied === 'Install script' ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <pre
              className="text-xs bg-black/40 p-3 rounded overflow-x-auto"
              data-testid="text-script"
            >
              {buildCommand()}
            </pre>

            <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t border-border/50">
              <p>
                <strong>How to use:</strong> SSH into your Ubuntu 22.04 server, paste the
                command above, and press Enter.
              </p>
              <p>
                Each script: installs Go 1.22, builds the real binary from source,
                creates a system user, configures ufw + fail2ban, and starts a
                systemd service that auto-restarts.
              </p>
            </div>
          </GlassCard>
        </>
      )}
    </div>
  );
}
