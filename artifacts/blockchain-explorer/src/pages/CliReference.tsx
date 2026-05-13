import { Layout } from '@/components/layout/Layout';
import { GlassCard } from '@/components/ui/GlassCard';
import { motion } from 'framer-motion';
import { Terminal, Copy, Wallet, ArrowRightLeft, Shield, Server, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface CliCommand {
  command: string;
  description: string;
  flags?: { flag: string; desc: string }[];
  example?: string;
}

interface CommandGroup {
  title: string;
  icon: React.ElementType;
  description: string;
  commands: CliCommand[];
}

const commandGroups: CommandGroup[] = [
  {
    title: 'Wallet Management',
    icon: Wallet,
    description: 'Create, import, and manage wallets and keys',
    commands: [
      {
        command: 'gydsctl wallet create',
        description: 'Create a new wallet with a generated seed phrase',
        flags: [
          { flag: '--password <pass>', desc: 'Encrypt with password (prompted if omitted)' },
          { flag: '--output <path>', desc: 'Save keystore file to path' },
        ],
        example: 'gydsctl wallet create --output ~/.gydschain/keystore/my-wallet.json',
      },
      {
        command: 'gydsctl wallet import',
        description: 'Import wallet from seed phrase or private key',
        flags: [
          { flag: '--seed "<words>"', desc: '12 or 24 word mnemonic seed phrase' },
          { flag: '--private-key <hex>', desc: 'Import from raw private key' },
          { flag: '--keystore <path>', desc: 'Import from keystore JSON file' },
        ],
        example: 'gydsctl wallet import --seed "word1 word2 word3 ... word12"',
      },
      {
        command: 'gydsctl wallet list',
        description: 'List all wallets in the local keystore',
        example: 'gydsctl wallet list',
      },
      {
        command: 'gydsctl wallet balance',
        description: 'Query GYDS and GYD balance for an address',
        flags: [
          { flag: '<address>', desc: 'Wallet address (0x...)' },
          { flag: '--rpc <url>', desc: 'RPC endpoint (default: https://rpc.netlifegy.com)' },
        ],
        example: 'gydsctl wallet balance 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD38',
      },
      {
        command: 'gydsctl wallet export',
        description: 'Export wallet as keystore file or raw key',
        flags: [
          { flag: '--address <addr>', desc: 'Address to export' },
          { flag: '--format <type>', desc: 'Output format: keystore | privatekey | seed' },
        ],
        example: 'gydsctl wallet export --address 0x742d... --format keystore',
      },
    ],
  },
  {
    title: 'Transactions',
    icon: ArrowRightLeft,
    description: 'Send tokens, check status, and view history',
    commands: [
      {
        command: 'gydsctl tx send',
        description: 'Send GYDS or GYD to a recipient',
        flags: [
          { flag: '--from <addr>', desc: 'Sender wallet address' },
          { flag: '--to <addr>', desc: 'Recipient wallet address' },
          { flag: '--amount <num>', desc: 'Amount to send' },
          { flag: '--coin <symbol>', desc: 'Coin: GYD (default) or GYDS' },
          { flag: '--fee <num>', desc: 'Custom fee (default: auto)' },
          { flag: '--nonce <num>', desc: 'Custom nonce (default: auto)' },
        ],
        example: 'gydsctl tx send --from 0xABC... --to 0xDEF... --amount 100 --coin GYD',
      },
      {
        command: 'gydsctl tx status',
        description: 'Check the status of a transaction by hash',
        flags: [
          { flag: '<tx_hash>', desc: 'Transaction hash (0x...)' },
        ],
        example: 'gydsctl tx status 0xabc123...',
      },
      {
        command: 'gydsctl tx list',
        description: 'List recent transactions for an address',
        flags: [
          { flag: '--address <addr>', desc: 'Filter by address' },
          { flag: '--limit <n>', desc: 'Number of results (default: 20)' },
          { flag: '--offset <n>', desc: 'Pagination offset' },
          { flag: '--coin <symbol>', desc: 'Filter by coin type' },
        ],
        example: 'gydsctl tx list --address 0x742d... --limit 50',
      },
      {
        command: 'gydsctl tx decode',
        description: 'Decode a raw signed transaction',
        flags: [
          { flag: '<raw_tx>', desc: 'Hex-encoded raw transaction' },
        ],
        example: 'gydsctl tx decode 0xf86c...',
      },
    ],
  },
  {
    title: 'Staking & Delegation',
    icon: Shield,
    description: 'Delegate, undelegate, and manage validator stakes',
    commands: [
      {
        command: 'gydsctl stake delegate',
        description: 'Delegate GYDS to a validator',
        flags: [
          { flag: '--from <addr>', desc: 'Delegator address' },
          { flag: '--validator <addr>', desc: 'Validator address' },
          { flag: '--amount <num>', desc: 'GYDS amount to delegate' },
        ],
        example: 'gydsctl stake delegate --from 0xABC... --validator 0xVAL... --amount 1000',
      },
      {
        command: 'gydsctl stake undelegate',
        description: 'Undelegate GYDS from a validator (21-day unbonding)',
        flags: [
          { flag: '--from <addr>', desc: 'Delegator address' },
          { flag: '--validator <addr>', desc: 'Validator address' },
          { flag: '--amount <num>', desc: 'GYDS amount to undelegate' },
        ],
        example: 'gydsctl stake undelegate --from 0xABC... --validator 0xVAL... --amount 500',
      },
      {
        command: 'gydsctl stake redelegate',
        description: 'Move delegation from one validator to another',
        flags: [
          { flag: '--from <addr>', desc: 'Delegator address' },
          { flag: '--src-validator <addr>', desc: 'Source validator' },
          { flag: '--dst-validator <addr>', desc: 'Destination validator' },
          { flag: '--amount <num>', desc: 'Amount to redelegate' },
        ],
        example: 'gydsctl stake redelegate --from 0xABC... --src-validator 0xV1... --dst-validator 0xV2... --amount 500',
      },
      {
        command: 'gydsctl stake rewards',
        description: 'Query pending staking rewards',
        flags: [
          { flag: '--address <addr>', desc: 'Delegator address' },
          { flag: '--withdraw', desc: 'Claim rewards immediately' },
        ],
        example: 'gydsctl stake rewards --address 0xABC...',
      },
      {
        command: 'gydsctl stake validators',
        description: 'List all active validators with stats',
        flags: [
          { flag: '--status <type>', desc: 'Filter: active | inactive | jailed' },
          { flag: '--sort <field>', desc: 'Sort by: stake | uptime | blocks' },
        ],
        example: 'gydsctl stake validators --status active --sort stake',
      },
    ],
  },
  {
    title: 'Node Operations',
    icon: Server,
    description: 'Manage node status, peers, and synchronization',
    commands: [
      {
        command: 'gydsd init',
        description: 'Initialize a new node with genesis configuration',
        flags: [
          { flag: '--chain-id <id>', desc: 'Chain ID (default: 13370)' },
          { flag: '--data-dir <path>', desc: 'Data directory (default: ~/.gydschain)' },
        ],
        example: 'gydsd init --chain-id 13370',
      },
      {
        command: 'gydsd start',
        description: 'Start the blockchain node',
        flags: [
          { flag: '--rpc', desc: 'Enable JSON-RPC server' },
          { flag: '--rpc-port <port>', desc: 'RPC port (default: 8545)' },
          { flag: '--ws', desc: 'Enable WebSocket server' },
          { flag: '--ws-port <port>', desc: 'WebSocket port (default: 8546)' },
          { flag: '--validator', desc: 'Enable validator mode' },
          { flag: '--mining', desc: 'Enable PoW mining rewards' },
          { flag: '--max-peers <n>', desc: 'Max P2P peers (default: 50)' },
        ],
        example: 'gydsd start --rpc --ws --validator --rpc-port 8545',
      },
      {
        command: 'gydsd status',
        description: 'Show current node status and sync progress',
        example: 'gydsd status',
      },
      {
        command: 'gydsd validator start',
        description: 'Start the node in validator mode with key generation',
        flags: [
          { flag: '--key-file <path>', desc: 'Validator key file path' },
          { flag: '--stake <amount>', desc: 'Initial stake amount' },
        ],
        example: 'gydsd validator start --stake 10000',
      },
      {
        command: 'gydsctl node status',
        description: 'Query node status via RPC',
        example: 'gydsctl node status',
      },
      {
        command: 'gydsctl node peers',
        description: 'List connected P2P peers',
        example: 'gydsctl node peers',
      },
      {
        command: 'gydsctl node sync-status',
        description: 'Show detailed synchronization status',
        example: 'gydsctl node sync-status',
      },
    ],
  },
];

const CommandCard = ({ cmd, onCopy }: { cmd: CliCommand; onCopy: (text: string) => void }) => (
  <div className="border border-border/50 rounded-lg p-4 space-y-3 bg-card/30 hover:bg-card/50 transition-colors">
    <div className="flex items-start justify-between gap-2">
      <div className="flex-1">
        <code className="text-sm font-mono font-semibold text-primary">{cmd.command}</code>
        <p className="text-sm text-muted-foreground mt-1">{cmd.description}</p>
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 shrink-0"
        onClick={() => onCopy(cmd.command)}
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
    {cmd.flags && cmd.flags.length > 0 && (
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Flags</p>
        <div className="grid gap-1">
          {cmd.flags.map((f, i) => (
            <div key={i} className="flex gap-3 text-xs">
              <code className="text-accent-foreground bg-accent/20 px-1.5 py-0.5 rounded font-mono whitespace-nowrap">{f.flag}</code>
              <span className="text-muted-foreground">{f.desc}</span>
            </div>
          ))}
        </div>
      </div>
    )}
    {cmd.example && (
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Example</p>
        <div className="relative">
          <pre className="text-xs bg-background/80 border border-border/30 rounded p-2 overflow-x-auto font-mono text-foreground/80">
            {cmd.example}
          </pre>
          <Button
            size="icon"
            variant="ghost"
            className="absolute top-1 right-1 h-5 w-5 opacity-60 hover:opacity-100"
            onClick={() => onCopy(cmd.example!)}
          >
            <Copy className="h-3 w-3" />
          </Button>
        </div>
      </div>
    )}
  </div>
);

const CliReferencePage = () => {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied!' });
  };

  const filteredGroups = commandGroups.map(g => ({
    ...g,
    commands: g.commands.filter(c =>
      !search ||
      c.command.toLowerCase().includes(search.toLowerCase()) ||
      c.description.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter(g => g.commands.length > 0);

  return (
    <Layout>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8 max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-3">
            <span className="text-gradient-primary">gydsctl</span> CLI Reference
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Complete command reference for the GYDSchain CLI tool — manage wallets, send transactions, delegate stake, and operate nodes.
          </p>
        </div>

        {/* Install */}
        <GlassCard className="p-5">
          <h3 className="text-lg font-semibold flex items-center gap-2 mb-3">
            <Terminal className="h-5 w-5 text-primary" />
            Installation
          </h3>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { label: 'Ubuntu / Debian', cmd: 'curl -sSL https://netlifegy.com/install-cli.sh | bash' },
              { label: 'macOS (Homebrew)', cmd: 'brew install gydschain/tap/gydsctl' },
              { label: 'Go Install', cmd: 'go install github.com/gydschain/gydschain-complete/devtools/cli@latest' },
            ].map((item, i) => (
              <div key={i} className="space-y-2">
                <p className="text-sm font-medium">{item.label}</p>
                <div className="relative">
                  <pre className="text-xs bg-background/80 border border-border/30 rounded p-2 overflow-x-auto font-mono">
                    {item.cmd}
                  </pre>
                  <Button
                    size="icon" variant="ghost"
                    className="absolute top-1 right-1 h-5 w-5 opacity-60 hover:opacity-100"
                    onClick={() => copyToClipboard(item.cmd)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Search */}
        <div className="relative max-w-md mx-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search commands..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Category tabs */}
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            variant={activeGroup === null ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveGroup(null)}
          >
            All Commands
          </Button>
          {commandGroups.map(g => (
            <Button
              key={g.title}
              variant={activeGroup === g.title ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveGroup(activeGroup === g.title ? null : g.title)}
              className="gap-1.5"
            >
              <g.icon className="h-3.5 w-3.5" />
              {g.title}
            </Button>
          ))}
        </div>

        {/* Command groups */}
        {filteredGroups
          .filter(g => !activeGroup || g.title === activeGroup)
          .map((group) => (
          <GlassCard key={group.title} className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-primary/20">
                <group.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">{group.title}</h2>
                <p className="text-sm text-muted-foreground">{group.description}</p>
              </div>
            </div>
            <div className="grid gap-4 mt-4">
              {group.commands.map((cmd, i) => (
                <CommandCard key={i} cmd={cmd} onCopy={copyToClipboard} />
              ))}
            </div>
          </GlassCard>
        ))}

        {filteredGroups.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Terminal className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No commands match your search.</p>
          </div>
        )}
      </motion.div>
    </Layout>
  );
};

export default CliReferencePage;
