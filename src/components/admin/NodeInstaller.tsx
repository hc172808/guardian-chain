import { useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Server, Globe, Smartphone, Network, Copy, Check, Terminal, Zap, CheckCircle2, Loader2, PlusCircle, Blocks, Shield, AlertTriangle } from 'lucide-react';

type NodeType = 'genesis' | 'bootnode' | 'fullnode' | 'litenode' | 'rpcnode' | 'boostnode' | 'validatornode' | 'termux';

interface NodeOption {
  id: NodeType;
  label: string;
  desc: string;
  icon: typeof Server;
  ports: string;
  needsRoot: boolean;
  founderOnly?: boolean;
}

const NODE_OPTIONS: NodeOption[] = [
  {
    id: 'genesis',
    label: 'Genesis Node',
    desc: 'FOUNDER ONLY — creates the blockchain from block 0. Run this ONCE on your primary server.',
    icon: Blocks,
    ports: 'P2P TCP 30300; RPC/WS 8544 via HTTPS',
    needsRoot: true,
    founderOnly: true,
  },
  {
    id: 'bootnode',
    label: 'Boot Node',
    desc: 'Peer discovery only — no mining, no RPC. Run 2-3 of these for network health.',
    icon: Network,
    ports: 'P2P TCP 30303',
    needsRoot: true,
  },
  {
    id: 'fullnode',
    label: 'Full Node',
    desc: 'Full node with PoS consensus, mining and RPC. High storage required.',
    icon: Server,
    ports: 'P2P TCP 30303; RPC/WS 8545 via HTTPS',
    needsRoot: true,
  },
  {
    id: 'rpcnode',
    label: 'RPC Node',
    desc: 'Public-facing RPC endpoint. Includes nginx reverse proxy with rate limiting.',
    icon: Globe,
    ports: 'P2P TCP 30305; RPC/WS 8545 via HTTPS',
    needsRoot: true,
  },
  {
    id: 'validatornode',
    label: 'Validator Node',
    desc: 'PoS validator — requires 10,000 GYDS staked. Earns block rewards.',
    icon: Shield,
    ports: 'P2P TCP 30306; RPC/WS 8547 via HTTPS',
    needsRoot: true,
  },
  {
    id: 'litenode',
    label: 'Lite Node',
    desc: 'Cache + wallet. Talks to public RPC. Connects via WireGuard VPN. Runs as your user.',
    icon: Server,
    ports: 'P2P TCP 30303; API 8545 via HTTPS',
    needsRoot: false,
  },
  {
    id: 'boostnode',
    label: 'Boost Node',
    desc: 'High-performance relay node. Boosts network throughput and peer connectivity.',
    icon: Zap,
    ports: 'P2P TCP 30304; RPC/WS 8547 via HTTPS',
    needsRoot: true,
  },
  {
    id: 'termux',
    label: 'Mobile (Termux)',
    desc: 'Android phone lite node via Termux. No root required.',
    icon: Smartphone,
    ports: 'n/a',
    needsRoot: false,
  },
];

const INSTALL_SCRIPTS: Record<NodeType, string> = {
  genesis:       'install-genesis.sh',
  bootnode:      'install-bootnode.sh',
  fullnode:      'install-fullnode.sh',
  rpcnode:       'install-rpcnode.sh',
  validatornode: 'install-validatornode.sh',
  litenode:      'install-litenode.sh',
  boostnode:     'install-boostnode.sh',
  termux:        'install-termux.sh',
};

const NODE_SCRIPTS_URL = 'https://raw.githubusercontent.com/hc172808/guardian-chain/main/public/scripts';

export function NodeInstaller() {
  const [selected, setSelected] = useState<Record<NodeType, boolean>>({
    genesis: false, bootnode: false, fullnode: false, litenode: false,
    rpcnode: false, boostnode: false, validatornode: false, termux: false,
  });
  const [enableMining, setEnableMining]   = useState(true);
  const [blockTime, setBlockTime]         = useState('120');
  const [wgEndpoint, setWgEndpoint]       = useState('vpn.netlifegy.com:51820');
  const [genesisBootstrap, setGenesisBootstrap] = useState('');
  const [copied, setCopied]               = useState<string | null>(null);
  // Registration form state
  const [nodeIp, setNodeIp]               = useState('');
  const [nodeHostname, setNodeHostname]   = useState('');
  const [nodeWgKey, setNodeWgKey]         = useState('');
  const [registering, setRegistering]     = useState(false);
  const [registered, setRegistered]       = useState<string[]>([]);
  const { toast } = useToast();
  const { user } = useAuth();

  const anySelected = Object.values(selected).some(Boolean);
  const selectedNodes = NODE_OPTIONS.filter(n => selected[n.id]);

  const toggle = (id: NodeType) =>
    setSelected((s) => ({ ...s, [id]: !s[id] }));

  const buildBashCommand = (): string => {
    const lines: string[] = [
      '# Fetch GYDSchain installer scripts from guardian-chain; use the local checkout if unavailable.',
      'set -euo pipefail',
      'PROJECT_ROOT="${PROJECT_ROOT:-$PWD}"',
      'export PROJECT_ROOT',
      `NODE_SCRIPTS_URL="\${GYDS_NODE_SCRIPTS_URL:-${NODE_SCRIPTS_URL}}"`,
      'SCRIPT_CACHE_DIR="$(mktemp -d)"',
      'chmod 755 "$SCRIPT_CACHE_DIR"',
      'trap \'rm -rf "$SCRIPT_CACHE_DIR"\' EXIT',
      'fetch_node_script() {',
      '  local name="$1" destination="$SCRIPT_CACHE_DIR/$1" local_script="$PROJECT_ROOT/public/scripts/$1"',
      '  if command -v curl >/dev/null 2>&1 && curl -fsSL --connect-timeout 5 --max-time 15 "$NODE_SCRIPTS_URL/$name" -o "$destination" 2>/dev/null; then',
      '    chmod 644 "$destination"',
      '    printf \'Fetched %s from GitHub\\n\' "$name" >&2',
      '  elif [[ -f "$local_script" ]]; then',
      '    cp "$local_script" "$destination"',
      '    chmod 644 "$destination"',
      '    printf \'GitHub unavailable; using local %s\\n\' "$name" >&2',
      '  else',
      '    printf \'Could not fetch %s and no local copy exists at %s\\n\' "$name" "$local_script" >&2',
      '    return 1',
      '  fi',
      '  printf \'%s\\n\' "$destination"',
      '}',
      // These installers source helpers relative to their own script directory.
      'NODE_NETWORK_SCRIPT="$(fetch_node_script node-network.sh)"',
      'NODE_PROFILE_SCRIPT="$(fetch_node_script node-profile.sh)"',
      '',
    ];
    selectedNodes.forEach(n => {
      lines.push(`# ── Install ${n.label}`);
      if (n.id === 'termux') {
        lines.push(`# Requires the node source checkout on the Android device.`);
        lines.push(`SCRIPT_PATH="$(fetch_node_script ${INSTALL_SCRIPTS[n.id]})"`);
        lines.push(`PROJECT_ROOT="$PROJECT_ROOT" bash "$SCRIPT_PATH"`);
        lines.push('');
        return;
      }
      const envCommand = n.needsRoot ? 'sudo env' : 'env';
      lines.push(`SCRIPT_PATH="$(fetch_node_script ${INSTALL_SCRIPTS[n.id]})"`);
      if (n.id === 'genesis') {
        lines.push(`${envCommand} PROJECT_ROOT="$PROJECT_ROOT" CHAIN_ID=198282 STORAGE_SIZE=500 bash "$SCRIPT_PATH"`);
      } else {
        lines.push(`${envCommand} PROJECT_ROOT="$PROJECT_ROOT" BLOCK_TIME=${blockTime} ENABLE_MINING=${enableMining} WG_SERVER_ENDPOINT=${wgEndpoint} \\`);
        if (genesisBootstrap && (n.id === 'fullnode' || n.id === 'validatornode' || n.id === 'bootnode')) {
          lines.push(`  GYDS_BOOTSTRAP_NODES="${genesisBootstrap}" \\`);
        }
        lines.push(`  bash "$SCRIPT_PATH"`);
      }
      lines.push('');
    });
    return lines.join('\n');
  };

  const buildUninstallCommand = (): string => {
    const roles = selectedNodes.map((node) => node.id).join(' ');
    const needsRoot = selectedNodes.some((node) => node.needsRoot);
    return [
      '# Stops and removes selected GYDS node services and binaries; chain data, wallets, configs, and logs are kept.',
      'set -euo pipefail',
      'PROJECT_ROOT="${PROJECT_ROOT:-$PWD}"',
      'export PROJECT_ROOT',
      `NODE_SCRIPTS_URL="\${GYDS_NODE_SCRIPTS_URL:-${NODE_SCRIPTS_URL}}"`,
      'SCRIPT_CACHE_DIR="$(mktemp -d)"',
      'chmod 755 "$SCRIPT_CACHE_DIR"',
      'trap \'rm -rf "$SCRIPT_CACHE_DIR"\' EXIT',
      'fetch_node_script() {',
      '  local name="$1" destination="$SCRIPT_CACHE_DIR/$1" local_script="$PROJECT_ROOT/public/scripts/$1"',
      '  if command -v curl >/dev/null 2>&1 && curl -fsSL --connect-timeout 5 --max-time 15 "$NODE_SCRIPTS_URL/$name" -o "$destination" 2>/dev/null; then',
      '    chmod 644 "$destination"',
      '    printf \'Fetched %s from GitHub\\n\' "$name" >&2',
      '  elif [[ -f "$local_script" ]]; then',
      '    cp "$local_script" "$destination"',
      '    chmod 644 "$destination"',
      '    printf \'GitHub unavailable; using local %s\\n\' "$name" >&2',
      '  else',
      '    printf \'Could not fetch %s and no local copy exists at %s\\n\' "$name" "$local_script" >&2',
      '    return 1',
      '  fi',
      '  printf \'%s\\n\' "$destination"',
      '}',
      'SCRIPT_PATH="$(fetch_node_script uninstall-node.sh)"',
      needsRoot
        ? `sudo env NODE_INSTALL_USER="\${SUDO_USER:-$USER}" bash "$SCRIPT_PATH" ${roles}`
        : `NODE_INSTALL_USER="\${SUDO_USER:-$USER}" bash "$SCRIPT_PATH" ${roles}`,
      '',
    ].join('\n');
  };

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    toast({ title: 'Copied to clipboard', description: `${label} copied. Paste into your server terminal.` });
    setTimeout(() => setCopied(null), 2000);
  };

  const registerNodes = async () => {
    if (!selectedNodes.length) return;
    setRegistering(true);
    const names: string[] = [];
    try {
      for (const n of selectedNodes) {
        if (n.id === 'termux') continue;
        const res = await fetch('/api/nodes', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nodeType: n.id,
            ipAddress: nodeIp.trim() || null,
            hostname: nodeHostname.trim() || null,
            wireguardPublicKey: nodeWgKey.trim() || null,
            enableMining,
            blockTime: parseInt(blockTime) || 120,
            wgEndpoint,
          }),
        });
        if (res.ok) names.push(n.label);
      }
      setRegistered(names);
      toast({
        title: `${names.length} node${names.length > 1 ? 's' : ''} registered`,
        description: `${names.join(', ')} — now visible in the Approve Nodes tab.`,
      });
    } catch (e: any) {
      toast({ title: 'Registration failed', description: e.message, variant: 'destructive' });
    } finally {
      setRegistering(false);
    }
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
                  opt.founderOnly
                    ? on ? 'border-yellow-500 bg-yellow-500/10' : 'border-yellow-500/40 bg-secondary/30 hover:border-yellow-500/70'
                    : on ? 'border-primary bg-primary/10' : 'border-border bg-secondary/30 hover:border-primary/40'
                }`}
              >
                <div className="flex items-start gap-3">
                  <Icon className={`h-5 w-5 mt-0.5 ${on ? (opt.founderOnly ? 'text-yellow-400' : 'text-primary') : 'text-muted-foreground'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium" data-testid={`label-${opt.id}`}>{opt.label}</span>
                      {on && <Badge variant="default" className="text-xs">selected</Badge>}
                      {opt.needsRoot && <Badge variant="outline" className="text-xs">root</Badge>}
                      {opt.founderOnly && <Badge className="text-xs bg-yellow-500/20 text-yellow-400 border-yellow-500/30">founder only</Badge>}
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

      {/* Node script source policy and node settings */}
      <GlassCard className="p-6 space-y-4">
        <h4 className="font-medium">Node scripts and local source</h4>
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground" data-testid="notice-local-node-source">
          Installer scripts are fetched from <code>hc172808/guardian-chain/public/scripts</code> first, then use the local script if GitHub is unavailable. Node code is still built from the source bundled in this project; separate node repositories are not fetched. Review <code>nodes-requirements.md</code> before using these sources on a public network.
        </div>

        {/* Genesis warning */}
        {selected.genesis && (
          <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
            <AlertTriangle className="h-5 w-5 text-yellow-400 shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-300 space-y-1">
              <p className="font-semibold">Genesis node — run this ONCE on your primary server.</p>
              <p className="text-xs text-yellow-400/80">It creates block 0 of the GYDSchain (Chain ID 198282). All other nodes must connect to the genesis node's enode address as their bootstrap peer.</p>
              <p className="text-xs text-yellow-400/80">After the genesis node starts, get its enode with: <code className="bg-black/30 px-1 rounded">curl http://localhost:8544 -d '&#123;"method":"net_enode","id":1&#125;'</code></p>
            </div>
          </div>
        )}

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

        {/* Bootstrap peers field — shown when any non-genesis node is selected, or when genesis+others */}
        <div className="space-y-2 pt-1">
          <Label className="flex items-center gap-1.5">
            Bootstrap peers / genesis enode
            <span className="text-xs text-muted-foreground font-normal">(paste after genesis node is running)</span>
          </Label>
          <Input
            value={genesisBootstrap}
            onChange={e => setGenesisBootstrap(e.target.value)}
            placeholder="enode://abc123...@203.0.113.10:30300"
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            This enode address is injected as <code className="bg-black/30 px-1 rounded">GYDS_BOOTSTRAP_NODES</code> for fullnode/validator/bootnode, and as <code className="bg-black/30 px-1 rounded">BOOTSTRAP_PEERS</code> for genesis. Leave blank if the genesis node hasn't started yet — you can re-copy the command after.
          </p>
        </div>
      </GlassCard>

      {anySelected && (
        <>
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
              Remote scripts are downloaded to a temporary folder, with local fallback. Run from the project checkout so each installer can build its bundled node source. Root access is requested only for node roles that need it.
            </p>
          </GlassCard>
          <GlassCard className="p-6 space-y-3 border-destructive/30">
            <div className="flex items-center justify-between">
              <h4 className="font-medium flex items-center gap-2">
                <Terminal className="h-4 w-4" />
                Uninstall selected nodes
              </h4>
              <CopyBtn text={buildUninstallCommand()} label="Uninstall command" />
            </div>
            <pre className="text-xs bg-black/40 p-4 rounded overflow-x-auto whitespace-pre-wrap">
              {buildUninstallCommand()}
            </pre>
            <p className="text-xs text-muted-foreground border-t border-border/50 pt-2">
              The command asks for confirmation, stops/removes selected node services and binaries, and keeps chain data, validator keys, wallets, configuration, and logs. Firewall rules, shared users, and dashboard registrations are left unchanged.
            </p>
          </GlassCard>
        </>
      )}

      {/* ── Register Node in DB ── */}
      {anySelected && (
        <GlassCard className="p-6 space-y-4 border-primary/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/20">
              <PlusCircle className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h4 className="font-semibold">Register Node Installation</h4>
              <p className="text-xs text-muted-foreground">
                Save this node to the dashboard so it appears in <strong>Approve Node Installations</strong>.
                Admin/Founder nodes are auto-approved.
              </p>
            </div>
          </div>

          {registered.length > 0 ? (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-green-400">Registered successfully!</p>
                <p className="text-xs text-muted-foreground">{registered.join(', ')} — visible in Admin → Nodes tab.</p>
                <button
                  className="text-xs text-primary hover:underline mt-1"
                  onClick={() => setRegistered([])}
                >
                  Register another
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Server IP Address</Label>
                  <Input
                    value={nodeIp}
                    onChange={e => setNodeIp(e.target.value)}
                    placeholder="e.g. 203.0.113.10"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Hostname (optional)</Label>
                  <Input
                    value={nodeHostname}
                    onChange={e => setNodeHostname(e.target.value)}
                    placeholder="e.g. node1.netlifegy.com"
                    className="h-9 text-sm"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">WireGuard Public Key (optional — fill in after key generation)</Label>
                <Input
                  value={nodeWgKey}
                  onChange={e => setNodeWgKey(e.target.value)}
                  placeholder="base64-encoded WireGuard public key"
                  className="h-9 text-sm font-mono"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="text-xs text-muted-foreground">
                  Will register: {selectedNodes.filter(n => n.id !== 'termux').map(n => n.label).join(', ')}
                </div>
                <Button
                  onClick={registerNodes}
                  disabled={registering}
                  className="gap-2"
                >
                  {registering
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Registering…</>
                    : <><PlusCircle className="h-4 w-4" /> Register Node{selectedNodes.length > 1 ? 's' : ''}</>
                  }
                </Button>
              </div>
            </div>
          )}
        </GlassCard>
      )}
    </div>
  );
}
