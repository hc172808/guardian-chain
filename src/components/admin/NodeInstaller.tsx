import { useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Server, Globe, Smartphone, Network, Copy, Check, Terminal, Container, Download, Zap } from 'lucide-react';

type NodeType = 'bootnode' | 'fullnode' | 'litenode' | 'rpcnode' | 'boostnode' | 'termux';

interface NodeOption {
  id: NodeType;
  label: string;
  desc: string;
  icon: typeof Server;
  ports: string;
  needsRoot: boolean;
  repo: string;
  portainerStack: string;
}

const NODE_OPTIONS: NodeOption[] = [
  {
    id: 'bootnode',
    label: 'Boot Node',
    desc: 'Peer discovery only — no mining, no RPC. Run 2-3 of these for network health.',
    icon: Network,
    ports: '30303 tcp+udp',
    needsRoot: true,
    repo: 'https://github.com/hc172808/fullnode.git',
    portainerStack: 'portainer-fullnode.yml',
  },
  {
    id: 'fullnode',
    label: 'Full Node',
    desc: 'Founder full node with PoS consensus, mining and RPC. High storage required.',
    icon: Server,
    ports: '8546, 30303',
    needsRoot: true,
    repo: 'https://github.com/hc172808/fullnode.git',
    portainerStack: 'portainer-fullnode.yml',
  },
  {
    id: 'rpcnode',
    label: 'RPC Node',
    desc: 'Public-facing RPC endpoint. Includes nginx reverse proxy with rate limiting.',
    icon: Globe,
    ports: '8545, 8546, 8080',
    needsRoot: true,
    repo: 'https://github.com/hc172808/rpcnode.git',
    portainerStack: 'portainer-rpcnode.yml',
  },
  {
    id: 'litenode',
    label: 'Lite Node',
    desc: 'Cache + wallet. Talks to public RPC. Connects via WireGuard VPN. Runs as your user.',
    icon: Server,
    ports: '3030 (api)',
    needsRoot: false,
    repo: 'https://github.com/hc172808/litenode.git',
    portainerStack: 'portainer-litenode.yml',
  },
  {
    id: 'boostnode',
    label: 'Boost Node',
    desc: 'High-performance relay node. Boosts network throughput and peer connectivity.',
    icon: Zap,
    ports: '8547, 30304',
    needsRoot: true,
    repo: 'https://github.com/hc172808/boostnode.git',
    portainerStack: 'portainer-boostnode.yml',
  },
  {
    id: 'termux',
    label: 'Mobile (Termux)',
    desc: 'Android phone lite node via Termux. No root required.',
    icon: Smartphone,
    ports: 'n/a',
    needsRoot: false,
    repo: 'https://github.com/hc172808/litenode.git',
    portainerStack: '',
  },
];

const INSTALL_SCRIPTS: Record<NodeType, string> = {
  bootnode:  'install-fullnode.sh',
  fullnode:  'install-fullnode.sh',
  rpcnode:   'install-rpcnode.sh',
  litenode:  'install-litenode.sh',
  boostnode: 'install-boostnode.sh',
  termux:    'install-termux.sh',
};

type InstallMode = 'bash' | 'docker' | 'portainer';

export function NodeInstaller() {
  const [selected, setSelected] = useState<Record<NodeType, boolean>>({
    bootnode: false, fullnode: false, litenode: false, rpcnode: false, boostnode: false, termux: false,
  });
  const [mode, setMode] = useState<InstallMode>('bash');
  const [enableMining, setEnableMining]   = useState(true);
  const [blockTime, setBlockTime]         = useState('120');
  const [wgEndpoint, setWgEndpoint]       = useState('vpn.netlifegy.com:51820');
  const [copied, setCopied]               = useState<string | null>(null);
  const { toast } = useToast();

  const anySelected = Object.values(selected).some(Boolean);
  const selectedNodes = NODE_OPTIONS.filter(n => selected[n.id]);

  const toggle = (id: NodeType) =>
    setSelected((s) => ({ ...s, [id]: !s[id] }));

  const scriptBaseUrl = 'https://raw.githubusercontent.com/hc172808/guardian-chain/main/public/scripts/';

  const buildBashCommand = (): string => {
    const lines: string[] = ['# GYDSchain Node Installer — paste this on your Ubuntu 22.04 server', 'set -euo pipefail', ''];
    selectedNodes.forEach(n => {
      if (n.id === 'termux') return;
      lines.push(`# ── Install ${n.label} (${n.repo})`);
      lines.push(`curl -fsSL ${scriptBaseUrl}${INSTALL_SCRIPTS[n.id]} | \\`);
      lines.push(`  BLOCK_TIME=${blockTime} ENABLE_MINING=${enableMining} \\`);
      lines.push(`  WG_SERVER_ENDPOINT=${wgEndpoint} \\`);
      lines.push(`  ${n.needsRoot ? 'sudo ' : ''}bash`);
      lines.push('');
    });
    if (selected.termux) {
      lines.push('# ── Mobile / Termux (run inside Termux on Android):');
      lines.push(`curl -fsSL ${scriptBaseUrl}install-termux.sh | bash`);
    }
    return lines.join('\n');
  };

  const buildDockerCommand = (): string => {
    return selectedNodes
      .filter(n => n.id !== 'termux')
      .map(n => [
        `# ── ${n.label}`,
        `git clone ${n.repo} gyds-${n.id} && cd gyds-${n.id}`,
        `docker build -t gyds-${n.id}:latest . \\`,
        `  --build-arg CHAIN_ID=13370 \\`,
        `  --build-arg ENABLE_MINING=${enableMining}`,
        `docker run -d --name gyds-${n.id} \\`,
        `  --cap-add NET_ADMIN \\`,
        `  -e WG_SERVER_ENDPOINT=${wgEndpoint} \\`,
        `  -v gyds-${n.id}-data:/var/lib/gydschain \\`,
        `  --restart unless-stopped \\`,
        `  gyds-${n.id}:latest`,
        '',
      ].join('\n'))
      .join('\n');
  };

  const getPortainerStackUrl = (): string => {
    const stacks = [...new Set(selectedNodes.filter(n => n.portainerStack).map(n => n.portainerStack))];
    const base = 'https://raw.githubusercontent.com/hc172808/guardian-chain/main/public/docker/';
    return stacks.map(s => `${base}${s}`).join('\n');
  };

  const getWgConfigTemplate = (): string => {
    return `[Interface]
PrivateKey = YOUR_PRIVATE_KEY_HERE
Address = 10.0.0.X/32
DNS = 1.1.1.1
MTU = 1420

[Peer]
PublicKey = SERVER_PUBLIC_KEY_HERE
Endpoint = ${wgEndpoint}
AllowedIPs = 10.0.0.0/24
PersistentKeepalive = 25`;
  };

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    toast({ title: 'Copied to clipboard', description: `${label} copied. Paste into your server terminal.` });
    setTimeout(() => setCopied(null), 2000);
  };

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Downloaded', description: `${filename} saved` });
  };

  const CopyBtn = ({ text, label }: { text: string; label: string }) => (
    <Button
      size="sm"
      variant="outline"
      onClick={() => copy(text, label)}
      className="gap-2"
    >
      {copied === label ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied === label ? 'Copied' : 'Copy'}
    </Button>
  );

  return (
    <div className="space-y-4" data-testid="panel-node-installer">

      {/* Node type selector */}
      <GlassCard className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 rounded-lg bg-primary/20">
            <Server className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Node Installer</h3>
            <p className="text-sm text-muted-foreground">
              Pick node types → choose install method → copy the command to your server.
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
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
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium" data-testid={`label-${opt.id}`}>{opt.label}</span>
                      {on && <Badge variant="default" className="text-xs">selected</Badge>}
                      {opt.needsRoot && <Badge variant="outline" className="text-xs">root</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{opt.desc}</p>
                    <p className="text-xs text-muted-foreground mt-1">Ports: {opt.ports}</p>
                    <p className="text-xs text-primary/60 mt-1 truncate">{opt.repo.replace('https://github.com/', '')}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </GlassCard>

      {/* Install mode selector */}
      <GlassCard className="p-6 space-y-4">
        <h4 className="font-medium">Install Method</h4>
        <div className="flex flex-wrap gap-3">
          {([
            { id: 'bash',      icon: Terminal,  label: 'Bash Script',       desc: 'Ubuntu 22.04 — direct on host' },
            { id: 'docker',    icon: Container, label: 'Docker CLI',         desc: 'Run in Docker containers' },
            { id: 'portainer', icon: Server,    label: 'Portainer Stack',    desc: 'Import YAML in Portainer UI' },
          ] as const).map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left ${
                mode === m.id ? 'border-primary bg-primary/10' : 'border-border bg-secondary/20 hover:border-primary/30'
              }`}
            >
              <m.icon className={`h-5 w-5 ${mode === m.id ? 'text-primary' : 'text-muted-foreground'}`} />
              <div>
                <p className="font-medium text-sm">{m.label}</p>
                <p className="text-xs text-muted-foreground">{m.desc}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Common config */}
        <div className="grid md:grid-cols-3 gap-4 pt-2">
          <div className="space-y-2">
            <Label>Block time (seconds)</Label>
            <Input
              type="number"
              value={blockTime}
              onChange={e => setBlockTime(e.target.value)}
              data-testid="input-block-time"
            />
          </div>
          <div className="space-y-2">
            <Label>WireGuard server endpoint</Label>
            <Input
              value={wgEndpoint}
              onChange={e => setWgEndpoint(e.target.value)}
              placeholder="vpn.netlifegy.com:51820"
            />
          </div>
          <div className="space-y-2 flex flex-col">
            <Label>Enable mining on full node</Label>
            <div className="flex items-center gap-3 pt-2">
              <Switch
                checked={enableMining}
                onCheckedChange={setEnableMining}
                data-testid="switch-mining"
              />
              <span className="text-sm text-muted-foreground">
                {enableMining ? 'Mining ON' : 'Mining OFF'}
              </span>
            </div>
          </div>
        </div>
      </GlassCard>

      {anySelected && (
        <>
          {/* Bash mode */}
          {mode === 'bash' && (
            <GlassCard className="p-6 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium flex items-center gap-2">
                  <Terminal className="h-4 w-4" />
                  Bash install command
                </h4>
                <CopyBtn text={buildBashCommand()} label="Bash command" />
              </div>
              <pre className="text-xs bg-black/40 p-4 rounded overflow-x-auto whitespace-pre-wrap">
                {buildBashCommand()}
              </pre>
              <p className="text-xs text-muted-foreground border-t border-border/50 pt-2">
                Each script installs Go 1.22, builds the binary, creates a system user, configures ufw + fail2ban, and starts a systemd service that auto-restarts.
              </p>
            </GlassCard>
          )}

          {/* Docker mode */}
          {mode === 'docker' && (
            <GlassCard className="p-6 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium flex items-center gap-2">
                  <Container className="h-4 w-4" />
                  Docker CLI commands
                </h4>
                <CopyBtn text={buildDockerCommand()} label="Docker commands" />
              </div>
              <pre className="text-xs bg-black/40 p-4 rounded overflow-x-auto whitespace-pre-wrap">
                {buildDockerCommand()}
              </pre>
            </GlassCard>
          )}

          {/* Portainer mode */}
          {mode === 'portainer' && (
            <div className="space-y-4">
              <GlassCard className="p-6 space-y-3">
                <h4 className="font-medium flex items-center gap-2">
                  <Server className="h-4 w-4" />
                  Portainer Stack Files
                </h4>
                <p className="text-sm text-muted-foreground">
                  In Portainer: <strong>Stacks → Add stack → Upload</strong> or paste the URL.
                  Each stack includes a WireGuard VPN client that connects back to your VPN server.
                </p>
                <div className="space-y-2">
                  {[...new Set(selectedNodes.filter(n => n.portainerStack).map(n => n.portainerStack))].map(stack => {
                    const node = selectedNodes.find(n => n.portainerStack === stack)!;
                    return (
                      <div key={stack} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                        <div>
                          <p className="font-medium text-sm">{stack}</p>
                          <p className="text-xs text-muted-foreground">{node.label} + WireGuard VPN client</p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-2"
                            onClick={() => copy(`https://raw.githubusercontent.com/hc172808/guardian-chain/main/public/docker/${stack}`, `URL ${stack}`)}
                          >
                            <Copy className="h-3 w-3" /> URL
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-2"
                            onClick={async () => {
                              const res = await fetch(`/public/docker/${stack}`).catch(() => null);
                              const text = res?.ok ? await res.text() : `# Download from:\nhttps://raw.githubusercontent.com/hc172808/guardian-chain/main/public/docker/${stack}`;
                              downloadFile(text, stack);
                            }}
                          >
                            <Download className="h-3 w-3" /> Download
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </GlassCard>

              <GlassCard className="p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium flex items-center gap-2">
                    <Terminal className="h-4 w-4" />
                    WireGuard Client Config Template
                  </h4>
                  <CopyBtn text={getWgConfigTemplate()} label="WG config" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Save as <code className="bg-black/30 px-1 rounded">/etc/gydschain/wg-&lt;nodetype&gt;.conf</code> on the host before deploying the stack.
                </p>
                <pre className="text-xs bg-black/40 p-4 rounded overflow-x-auto whitespace-pre-wrap">
                  {getWgConfigTemplate()}
                </pre>
                <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t border-border/50">
                  <p><strong>Steps:</strong></p>
                  <p>1. <code className="bg-black/30 px-1 rounded">wg genkey | tee privkey | wg pubkey &gt; pubkey</code> — generate keypair</p>
                  <p>2. Give your public key to the VPN server admin to get assigned an IP + server pubkey</p>
                  <p>3. Fill in the config and save to the path shown above</p>
                  <p>4. Deploy the Portainer stack — the WireGuard container will auto-connect</p>
                </div>
              </GlassCard>
            </div>
          )}
        </>
      )}
    </div>
  );
}
