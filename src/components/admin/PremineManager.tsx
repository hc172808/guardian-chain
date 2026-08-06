import { useState } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import {
  Coins, Loader2, Pickaxe, ChevronDown, ChevronUp,
  Copy, Download, AlertTriangle, Info, Smartphone, CheckCircle,
} from 'lucide-react';
import { RESERVED_WALLETS } from '@/config/wallets';

const CHAIN_ID = 198282;
const RPC_URLS = {
  mainnet: 'https://rpc.netlifegy.com',
  testnet: 'https://testnet-rpc.netlifegy.com',
  local:   'http://localhost:8545',
};

const copyText = (text: string, toast: any) =>
  navigator.clipboard.writeText(text).then(() => toast({ title: 'Copied!' }));

const downloadFile = (content: string, filename: string) => {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

export const PremineManager = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [gydsAmount, setGydsAmount] = useState('1000000');
  const [gydAmount, setGydAmount] = useState('10000');
  const [targetAddress, setTargetAddress] = useState(RESERVED_WALLETS.founder.address);
  const [loading, setLoading] = useState(false);
  const [showGenesis, setShowGenesis] = useState(false);
  const [showWalletGuide, setShowWalletGuide] = useState(false);
  const [customRpc, setCustomRpc] = useState('');

  const handlePremine = async () => {
    if (!user) return;
    const gyds = parseFloat(gydsAmount);
    const gyd = parseFloat(gydAmount);
    if ((!gyds || gyds <= 0) && (!gyd || gyd <= 0)) {
      toast({ title: 'Enter at least one amount', variant: 'destructive' });
      return;
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(targetAddress)) {
      toast({ title: 'Invalid wallet address', variant: 'destructive' });
      return;
    }
    setLoading(true);
    const txHash = () => '0x' + crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 32);
    const operations = [];
    if (gyds > 0) {
      operations.push({ operation_type: 'mint', amount: gyds, wallet_address: targetAddress.toLowerCase(), tx_hash: txHash(), status: 'confirmed', created_by: user.id, usdt_amount: 0 });
    }
    if (gyd > 0) {
      operations.push({ operation_type: 'mint', amount: gyd, wallet_address: `gyd:${targetAddress.toLowerCase()}`, tx_hash: txHash(), status: 'confirmed', created_by: user.id, usdt_amount: 0 });
    }
    try {
      for (const op of operations) await api.post('/api/token-operations', op);
      if (gyds > 0) {
        const existing = await api.get('/api/token-price').catch(() => null);
        if (existing) await api.patch('/api/token-price', { circulating_supply: existing.circulating_supply + gyds });
      }
      toast({
        title: 'Pre-mine recorded!',
        description: `${gyds > 0 ? `${gyds.toLocaleString()} GYDS` : ''}${gyds > 0 && gyd > 0 ? ' + ' : ''}${gyd > 0 ? `${gyd.toLocaleString()} GYD` : ''} → ${targetAddress.slice(0, 10)}…`,
      });
    } catch (e: any) {
      toast({ title: 'Pre-mine failed', description: e.message, variant: 'destructive' });
    }
    setLoading(false);
  };

  // Genesis alloc helpers
  const weiHex = (amount: number) => {
    const wei = BigInt(Math.floor(amount)) * BigInt('1000000000000000000');
    return '0x' + wei.toString(16);
  };
  const genesisAlloc: Record<string, { balance: string }> = {};
  const g = parseFloat(gydsAmount) || 0;
  const gd = parseFloat(gydAmount) || 0;
  const addr = targetAddress.toLowerCase();
  if (/^0x[a-f0-9]{40}$/.test(addr) && (g > 0 || gd > 0)) {
    genesisAlloc[addr] = { balance: weiHex(g + gd) };
  }
  const founderAddr = RESERVED_WALLETS.founder.address.toLowerCase();
  if (founderAddr !== addr) {
    genesisAlloc[founderAddr] = { balance: weiHex(1_000_000_000) };
  }
  const genesisJson = JSON.stringify({
    config: {
      chainId: CHAIN_ID,
      homesteadBlock: 0, eip150Block: 0, eip155Block: 0, eip158Block: 0,
      byzantiumBlock: 0, constantinopleBlock: 0, petersburgBlock: 0,
      istanbulBlock: 0, berlinBlock: 0, londonBlock: 0,
      clique: { period: 120, epoch: 30000 },
    },
    difficulty: '1',
    gasLimit: '0x47b760',
    extradata: `0x${'0'.repeat(64)}${founderAddr.slice(2)}${'0'.repeat(130)}`,
    alloc: genesisAlloc,
  }, null, 2);

  const rpcUrl = customRpc.trim() || RPC_URLS.mainnet;
  const metamaskParams = JSON.stringify({
    chainId: '0x' + CHAIN_ID.toString(16),
    chainName: 'GYDS Network',
    nativeCurrency: { name: 'GYDS', symbol: 'GYDS', decimals: 18 },
    rpcUrls: [rpcUrl],
    blockExplorerUrls: ['https://explorer.netlifegy.com'],
  }, null, 2);

  return (
    <div className="space-y-4">
      {/* Important notice */}
      <GlassCard className="p-4 border-amber-500/30 bg-amber-500/5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1.5">
            <p className="font-medium text-amber-300 text-sm">Dashboard Balance vs. On-Chain Balance</p>
            <p className="text-xs text-muted-foreground">
              Pre-minting here records a balance <strong>inside this dashboard</strong> (GYDS Network internal ledger).
              External wallets (Trust Wallet, MetaMask, Coinbase Wallet) will only see your GYDS balance if:
            </p>
            <ol className="text-xs text-muted-foreground space-y-0.5 list-decimal list-inside">
              <li>Your GYDS node is running and reachable via RPC</li>
              <li>The pre-mine is in your <strong>genesis.json</strong> (export below)</li>
              <li>The wallet has GYDS Network added as a custom network (guide below)</li>
            </ol>
          </div>
        </div>
      </GlassCard>

      {/* Pre-mine form */}
      <GlassCard className="p-6">
        <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <Pickaxe className="h-5 w-5 text-primary" />
          Pre-mine Allocation
          <Badge variant="outline" className="text-xs">Dashboard Ledger</Badge>
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Allocate initial GYDS and GYD to the founder or a specified wallet. Recorded as confirmed token operations in the dashboard.
        </p>
        <div className="space-y-4">
          <div>
            <Label>Target Wallet Address</Label>
            <Input value={targetAddress} onChange={e => setTargetAddress(e.target.value)} placeholder="0x..." className="font-mono text-sm" />
            <Button variant="link" size="sm" className="px-0 text-xs" onClick={() => setTargetAddress(RESERVED_WALLETS.founder.address)}>
              Use founder address
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="flex items-center gap-2"><Coins className="h-3 w-3" /> GYDS Amount</Label>
              <Input type="number" value={gydsAmount} onChange={e => setGydsAmount(e.target.value)} placeholder="1000000" />
            </div>
            <div>
              <Label className="flex items-center gap-2"><Coins className="h-3 w-3" /> GYD Amount</Label>
              <Input type="number" value={gydAmount} onChange={e => setGydAmount(e.target.value)} placeholder="10000" />
            </div>
          </div>
          <Button onClick={handlePremine} disabled={loading} className="w-full gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pickaxe className="h-4 w-4" />}
            {loading ? 'Processing…' : 'Record Pre-mine in Dashboard'}
          </Button>
        </div>
      </GlassCard>

      {/* Genesis block config */}
      <GlassCard className="p-4">
        <button className="w-full flex items-center justify-between text-sm font-medium" onClick={() => setShowGenesis(v => !v)}>
          <span className="flex items-center gap-2"><Download className="h-4 w-4 text-primary" /> Genesis Block Config (genesis.json)</span>
          {showGenesis ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {showGenesis && (
          <div className="mt-4 space-y-3">
            {/* Live DB genesis — primary method */}
            <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/20 space-y-2">
              <p className="text-xs font-semibold text-green-300 flex items-center gap-1.5">
                <CheckCircle className="h-3.5 w-3.5" /> Live genesis.json — built from ALL dashboard balances
              </p>
              <p className="text-xs text-muted-foreground">
                This reads every confirmed token operation from the database and generates a genesis.json
                with the correct <strong>on-chain</strong> pre-mine allocations. Use this file to initialize
                your Geth node — balances will appear in any EVM wallet.
              </p>
              <div className="flex gap-2">
                <Button size="sm" className="gap-1.5 text-xs flex-1" asChild>
                  <a href="/api/chain/genesis.json" download="genesis.json">
                    <Download className="h-3 w-3" /> Download genesis.json (from DB)
                  </a>
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => copyText('/api/chain/genesis.json', toast)}>
                  <Copy className="h-3 w-3" /> Copy URL
                </Button>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Preview (current form values only — download above uses live DB data):
            </p>
            <pre className="text-xs font-mono bg-background rounded-lg p-3 border border-border/50 max-h-52 overflow-y-auto whitespace-pre-wrap">{genesisJson}</pre>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs flex-1" onClick={() => downloadFile(genesisJson, 'genesis.json')}>
                <Download className="h-3 w-3" /> Download (preview only)
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => copyText(genesisJson, toast)}>
                <Copy className="h-3 w-3" /> Copy
              </Button>
            </div>

            <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20 space-y-2">
              <p className="text-xs font-medium text-blue-300 flex items-center gap-1.5"><Info className="h-3.5 w-3.5" /> One-command server install</p>
              {[
                ['Auto install', `curl -fsSL https://netlifegy.com/scripts/install-gyds-node.sh | DASHBOARD_URL=https://netlifegy.com bash`],
                ['Init chain', `geth --datadir ./data init genesis.json`],
                ['Start node', `geth --datadir ./data --networkid ${CHAIN_ID} --http --http.addr 0.0.0.0 --http.port 8545 --http.corsdomain "*" --allow-insecure-unlock`],
                ['Check balance', `geth attach http://localhost:8545 --exec 'eth.getBalance("${addr}")'`],
              ].map(([label, cmd]) => (
                <div key={label} className="flex items-start gap-2">
                  <span className="text-[10px] text-muted-foreground w-20 shrink-0 pt-0.5">{label}</span>
                  <div className="flex-1 flex items-center gap-1.5 min-w-0">
                    <code className="text-[10px] font-mono bg-secondary/50 px-1.5 py-0.5 rounded flex-1 break-all">{cmd}</code>
                    <button onClick={() => copyText(cmd as string, toast)} className="shrink-0"><Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </GlassCard>

      {/* Trust Wallet / MetaMask guide */}
      <GlassCard className="p-4">
        <button className="w-full flex items-center justify-between text-sm font-medium" onClick={() => setShowWalletGuide(v => !v)}>
          <span className="flex items-center gap-2"><Smartphone className="h-4 w-4 text-primary" /> Add GYDS to Trust Wallet / MetaMask</span>
          {showWalletGuide ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {showWalletGuide && (
          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Your node RPC URL (blank = use public mainnet)</Label>
              <Input value={customRpc} onChange={e => setCustomRpc(e.target.value)} placeholder="http://YOUR_SERVER_IP:8545" className="text-xs font-mono" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Trust Wallet steps */}
              <div className="p-3 rounded-lg border border-border/40 space-y-2">
                <p className="text-xs font-semibold">Trust Wallet</p>
                {[
                  ['1.', 'Open Trust Wallet → Settings'],
                  ['2.', 'Preferences → Custom Nodes → "+"'],
                  ['Name:', 'GYDS Network'],
                  ['RPC URL:', rpcUrl],
                  ['Chain ID:', String(CHAIN_ID)],
                  ['Symbol:', 'GYDS'],
                  ['3.', 'Save → Switch to GYDS Network'],
                  ['✓', 'Pre-mined balance will appear'],
                ].map(([prefix, text]) => (
                  <div key={text} className="flex items-start gap-2 text-xs">
                    <span className="text-primary w-14 shrink-0 font-mono text-[10px]">{prefix}</span>
                    <div className="flex-1 flex items-center justify-between gap-1">
                      <span className="text-muted-foreground break-all">{text}</span>
                      {['RPC URL:', 'Chain ID:', 'Symbol:', 'Name:'].includes(prefix) && (
                        <button onClick={() => copyText(text, toast)} className="shrink-0"><Copy className="h-2.5 w-2.5 text-muted-foreground hover:text-foreground" /></button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {/* MetaMask steps */}
              <div className="p-3 rounded-lg border border-border/40 space-y-2">
                <p className="text-xs font-semibold">MetaMask</p>
                {[
                  ['1.', 'Settings → Networks → Add network manually'],
                  ['Name:', 'GYDS Network'],
                  ['RPC:', rpcUrl],
                  ['Chain ID:', String(CHAIN_ID)],
                  ['Symbol:', 'GYDS'],
                  ['2.', 'Save → Switch to GYDS'],
                  ['✓', 'Balance shows automatically'],
                ].map(([prefix, text]) => (
                  <div key={text} className="flex items-start gap-2 text-xs">
                    <span className="text-primary w-14 shrink-0 font-mono text-[10px]">{prefix}</span>
                    <div className="flex-1 flex items-center justify-between gap-1">
                      <span className="text-muted-foreground break-all">{text}</span>
                      {['RPC:', 'Chain ID:', 'Symbol:', 'Name:'].includes(prefix) && (
                        <button onClick={() => copyText(text, toast)} className="shrink-0"><Copy className="h-2.5 w-2.5 text-muted-foreground hover:text-foreground" /></button>
                      )}
                    </div>
                  </div>
                ))}
                <div className="pt-2 border-t border-border/30">
                  <p className="text-[10px] text-muted-foreground mb-1">MetaMask network params JSON:</p>
                  <pre className="text-[10px] font-mono bg-background rounded p-2 border border-border/30 max-h-24 overflow-y-auto">{metamaskParams}</pre>
                  <Button variant="outline" size="sm" className="gap-1 text-xs mt-1.5 w-full" onClick={() => copyText(metamaskParams, toast)}>
                    <Copy className="h-3 w-3" /> Copy JSON
                  </Button>
                </div>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/20">
              <p className="text-xs text-green-300 flex items-start gap-2">
                <CheckCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                Once the custom network is added and your local node is running, your pre-mined balance
                (from genesis.json) will appear in any EVM-compatible wallet. Dashboard balance and
                on-chain balance match once your node is live.
              </p>
            </div>
          </div>
        )}
      </GlassCard>
    </div>
  );
};
