import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GlassCard } from '@/components/ui/GlassCard';
import { Block, Transaction } from '@/lib/blockchain';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Blocks, CheckCircle, Clock, ChevronRight, Wifi, WifiOff, ArrowUpRight, ArrowDownLeft, Activity, ExternalLink, Coins, Shield, AlertTriangle, Users, Database, Image, Droplets, Trophy, Code2, MapPin, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { useBlockchainWebSocket } from '@/hooks/useBlockchainWebSocket';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { LocalRpcIndicator } from '@/components/LocalRpcIndicator';

interface NetworkStats {
  activeValidators: number;
  activeMiners: number;
  totalTransactions: number;
  totalTokens: number;
  liveNodes: number;
  networkHashRateThps: number;
}

// Standalone explorer - no Layout wrapper, no auth required
const Explorer = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBlock, setSelectedBlock] = useState<Block | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [tokens, setTokens] = useState<any[]>([]);
  const [dbTransactions, setDbTransactions] = useState<Transaction[]>([]);
  const [networkStats, setNetworkStats] = useState<NetworkStats | null>(null);
  const [dbLoading, setDbLoading] = useState(false);

  const { isConnected, latestBlock, latestTransactions, pendingTransactions, error, gaveUp } = useBlockchainWebSocket();

  useEffect(() => {
    if (latestBlock) {
      setBlocks(prev => {
        if (prev.some(b => b.hash === latestBlock.hash)) return prev;
        return [latestBlock, ...prev.slice(0, 99)];
      });
    }
  }, [latestBlock]);

  // Load tokens
  useEffect(() => {
    fetch('/api/tokens?limit=20')
      .then(r => r.ok ? r.json() : [])
      .then(data => setTokens(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  // Load network stats on mount and refresh every 30s
  useEffect(() => {
    const load = () => {
      fetch('/api/network-stats')
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data?.stats) setNetworkStats(data.stats); })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  // When WebSocket is offline / gave up, load confirmed transactions from DB
  useEffect(() => {
    if (!isConnected || gaveUp) {
      setDbLoading(true);
      fetch('/api/transactions?limit=50')
        .then(r => r.ok ? r.json() : [])
        .then((data: any[]) => {
          if (!Array.isArray(data)) return;
          const mapped: Transaction[] = data.map(tx => ({
            id: tx.id ?? tx.tx_hash ?? String(tx.id),
            from: tx.from_address ?? tx.from ?? '',
            to: tx.to_address ?? tx.to ?? '',
            amount: Number(tx.amount ?? 0),
            fee: Number(tx.fee ?? 0),
            nonce: 0,
            data: '',
            signature: '',
            status: tx.status ?? 'confirmed',
            blockHeight: tx.block_height ?? null,
            timestamp: tx.created_at ? new Date(tx.created_at).getTime() : Date.now(),
          }));
          setDbTransactions(mapped);
        })
        .catch(() => {})
        .finally(() => setDbLoading(false));
    }
  }, [isConnected, gaveUp]);

  const confirmedTxs = isConnected && !gaveUp ? latestTransactions : dbTransactions;
  const confirmedSource = isConnected && !gaveUp ? 'live' : 'db';

  const filteredBlocks = blocks.filter(block =>
    block.hash.includes(searchQuery) ||
    block.height.toString().includes(searchQuery) ||
    block.validator.includes(searchQuery)
  );

  const filteredTransactions = confirmedTxs.filter(tx =>
    tx.id.includes(searchQuery) || tx.from.includes(searchQuery) || tx.to.includes(searchQuery)
  );

  // Stats: prefer network stats from API; fall back to live WS counts
  const totalTxCount = networkStats?.totalTransactions
    ? networkStats.totalTransactions.toLocaleString()
    : confirmedTxs.length.toString();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Standalone Header */}
      <header className="border-b border-border/50 bg-card/80 backdrop-blur-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/20">
              <Blocks className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="font-bold text-lg">GYDS Explorer</h1>
              <p className="text-xs text-muted-foreground">explorer.netlifegy.com</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LocalRpcIndicator />
            <ConnectionStatus isConnected={isConnected} error={error} gaveUp={gaveUp} />
            <a href="https://netlifegy.com" target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 hidden sm:flex">
              netlifegy.com <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Search */}
        <div className="relative max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by block, hash, token name, symbol, or address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === 'Enter' && searchQuery.trim().length > 1) {
                const q = searchQuery.trim();
                const params = new URLSearchParams({ q, limit: '1' });
                const res = await fetch(`/api/tokens/search?${params}`).then(r => r.ok ? r.json() : null).catch(() => null);
                if (res?.address) navigate(`/explorer/token/${res.address}`);
              }
            }}
            className="pl-10 bg-secondary/50 border-border/50 h-12 text-base"
          />
          {searchQuery.trim().length > 1 && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Badge variant="secondary" className="text-xs cursor-pointer hover:bg-primary/20"
                onClick={async () => {
                  const q = searchQuery.trim();
                  const params = new URLSearchParams({ q, limit: '1' });
                  const res = await fetch(`/api/tokens/search?${params}`).then(r => r.ok ? r.json() : null).catch(() => null);
                  if (res?.address) navigate(`/explorer/token/${res.address}`);
                }}
              >
                Search Token →
              </Badge>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <LiveStatCard label="Latest Block" value={`#${(latestBlock?.height || blocks[0]?.height || 0).toLocaleString()}`} icon={<Blocks className="w-4 h-4" />} pulse={!!latestBlock} />
          <LiveStatCard label="Validators" value={(networkStats?.activeValidators ?? '—').toString()} icon={<Users className="w-4 h-4" />} />
          <LiveStatCard label="Total Txs" value={totalTxCount} icon={<CheckCircle className="w-4 h-4" />} />
          <LiveStatCard label="Tokens" value={(networkStats?.totalTokens ?? tokens.length).toString()} icon={<Coins className="w-4 h-4" />} />
          <LiveStatCard label="Status" value={isConnected ? 'Live' : (networkStats?.liveNodes ?? 0) > 0 ? 'Nodes Active' : gaveUp ? 'DB Mode' : 'Offline'} icon={isConnected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />} highlight={isConnected ? 'emerald' : (networkStats?.liveNodes ?? 0) > 0 ? 'emerald' : gaveUp ? 'amber' : 'destructive'} />
        </div>

        {/* DB mode banner */}
        {!isConnected && gaveUp && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-neon-amber/10 border border-neon-amber/30 text-neon-amber text-sm">
            <Database className="w-4 h-4 flex-shrink-0" />
            <span>WebSocket offline — showing confirmed transactions from database. Live blocks will appear once the node reconnects.</span>
          </div>
        )}

        {/* Main Content */}
        <Tabs defaultValue="blocks" className="space-y-4">
          <TabsList className="bg-secondary/50 flex-wrap h-auto gap-1">
            <TabsTrigger value="blocks" className="gap-2"><Blocks className="w-4 h-4" /> Blocks</TabsTrigger>
            <TabsTrigger value="transactions" className="gap-2">
              <Activity className="w-4 h-4" /> Transactions
              {pendingTransactions.length > 0 && <Badge variant="secondary" className="ml-1 bg-neon-amber/20 text-neon-amber">{pendingTransactions.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="tokens" className="gap-2"><Coins className="w-4 h-4" /> Tokens</TabsTrigger>
            <TabsTrigger value="validators" className="gap-2"><Shield className="w-4 h-4" /> Validators</TabsTrigger>
            <TabsTrigger value="nfts" className="gap-2"><Image className="w-4 h-4" /> NFTs</TabsTrigger>
            <TabsTrigger value="pools" className="gap-2"><Droplets className="w-4 h-4" /> Pools</TabsTrigger>
            <TabsTrigger value="richlist" className="gap-2"><Trophy className="w-4 h-4" /> Rich List</TabsTrigger>
            <TabsTrigger value="contracts" className="gap-2"><Code2 className="w-4 h-4" /> Contracts</TabsTrigger>
          </TabsList>

          <TabsContent value="blocks">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <GlassCard className="p-0 overflow-hidden">
                  <div className="p-4 border-b border-border/50 flex items-center justify-between">
                    <h3 className="font-semibold">Recent Blocks</h3>
                    {latestBlock && <span className="text-xs text-muted-foreground animate-pulse">Live updates</span>}
                    {!isConnected && <span className="text-xs text-neon-amber">Waiting for node…</span>}
                  </div>
                  <div className="divide-y divide-border/30 max-h-[600px] overflow-y-auto">
                    <AnimatePresence mode="popLayout">
                      {filteredBlocks.length > 0 ? filteredBlocks.map((block, index) => (
                        <motion.div key={block.hash} initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: index * 0.02 }}
                          onClick={() => setSelectedBlock(block)}
                          className={cn('p-4 hover:bg-secondary/30 cursor-pointer transition-colors flex items-center gap-4', selectedBlock?.hash === block.hash && 'bg-secondary/50', index === 0 && latestBlock?.hash === block.hash && 'ring-1 ring-primary/50')}>
                          <div className="flex-shrink-0">
                            {block.finalized ? (
                              <div className="p-2 rounded-lg bg-neon-emerald/10"><CheckCircle className="w-4 h-4 text-neon-emerald" /></div>
                            ) : (
                              <div className="p-2 rounded-lg bg-neon-amber/10"><Clock className="w-4 h-4 text-neon-amber animate-pulse-slow" /></div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-bold text-primary">#{block.height.toLocaleString()}</span>
                              <span className={cn('text-xs px-2 py-0.5 rounded-full', block.finalized ? 'bg-neon-emerald/10 text-neon-emerald' : 'bg-neon-amber/10 text-neon-amber')}>
                                {block.finalized ? 'Finalized' : 'Pending'}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground font-mono mt-1 truncate">{block.hash}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-medium">{block.transactions.length} txs</p>
                            <p className="text-xs text-muted-foreground">{new Date(block.timestamp).toLocaleTimeString()}</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </motion.div>
                      )) : (
                        <div className="p-12 text-center text-muted-foreground">
                          <Blocks className="w-10 h-10 mx-auto mb-3 opacity-40" />
                          <p className="text-sm">No blocks yet — waiting for the node to connect</p>
                        </div>
                      )}
                    </AnimatePresence>
                  </div>
                </GlassCard>
              </div>

              <div>
                <GlassCard>
                  <h3 className="font-semibold mb-4">Block Details</h3>
                  {selectedBlock ? (
                    <div className="space-y-4">
                      <DetailRow label="Height" value={`#${selectedBlock.height.toLocaleString()}`} />
                      <DetailRow label="Hash" value={selectedBlock.hash} mono truncate />
                      <DetailRow label="Previous Hash" value={selectedBlock.previousHash} mono truncate />
                      <DetailRow label="Validator" value={selectedBlock.validator} mono truncate />
                      <DetailRow label="Validator Stake" value={`${selectedBlock.validatorStake.toLocaleString()} GYDS`} />
                      <DetailRow label="Transactions" value={selectedBlock.transactions.length.toString()} />
                      <DetailRow label="Status" value={selectedBlock.finalized ? 'Finalized' : 'Pending'} highlight={selectedBlock.finalized ? 'emerald' : 'amber'} />
                      <DetailRow label="Timestamp" value={new Date(selectedBlock.timestamp).toLocaleString()} />
                      <div className="pt-4 border-t border-border/50">
                        <h4 className="text-sm font-medium mb-2">Mining Rewards</h4>
                        {selectedBlock.miningRewards.map((reward, i) => (
                          <div key={i} className="text-xs bg-secondary/30 p-2 rounded mb-2">
                            <p className="font-mono text-muted-foreground truncate">{reward.minerId}</p>
                            <p className="mt-1"><span className="text-neon-emerald">{reward.reward.toFixed(4)} GYDS</span> <span className="text-muted-foreground ml-2">({reward.shares} shares)</span></p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">Select a block to view details</p>
                  )}
                </GlassCard>

                {/* Network Stats side card */}
                {networkStats && (
                  <GlassCard className="mt-4 p-4 space-y-3">
                    <h3 className="font-semibold text-sm">Network Stats</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">Live Nodes</span><span className="font-mono">{networkStats.liveNodes}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Validators</span><span className="font-mono">{networkStats.activeValidators}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Miners</span><span className="font-mono">{networkStats.activeMiners}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Total Txs</span><span className="font-mono">{networkStats.totalTransactions.toLocaleString()}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Tokens</span><span className="font-mono">{networkStats.totalTokens}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">PoS Finality</span><span className="text-neon-emerald font-mono">99.99%</span></div>
                    </div>
                  </GlassCard>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="transactions">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <GlassCard className="p-0 overflow-hidden">
                <div className="p-4 border-b border-border/50 flex items-center justify-between">
                  <h3 className="font-semibold flex items-center gap-2"><Clock className="w-4 h-4 text-neon-amber" /> Pending</h3>
                  <Badge variant="outline" className="bg-neon-amber/10 text-neon-amber border-neon-amber/30">{pendingTransactions.length}</Badge>
                </div>
                <div className="divide-y divide-border/30 max-h-[500px] overflow-y-auto">
                  {pendingTransactions.length > 0 ? pendingTransactions.map((tx, i) => (
                    <TransactionRow key={tx.id} tx={tx} index={i} isPending />
                  )) : (
                    <div className="p-8 text-center text-muted-foreground"><Clock className="w-8 h-8 mx-auto mb-2 opacity-50" /><p>No pending transactions</p></div>
                  )}
                </div>
              </GlassCard>

              <GlassCard className="p-0 overflow-hidden">
                <div className="p-4 border-b border-border/50 flex items-center justify-between">
                  <h3 className="font-semibold flex items-center gap-2">
                    {confirmedSource === 'db' ? <Database className="w-4 h-4 text-neon-amber" /> : <CheckCircle className="w-4 h-4 text-neon-emerald" />}
                    Confirmed
                    {confirmedSource === 'db' && <span className="text-xs text-muted-foreground">(from DB)</span>}
                  </h3>
                  <Badge variant="outline" className={cn(confirmedSource === 'db' ? 'bg-neon-amber/10 text-neon-amber border-neon-amber/30' : 'bg-neon-emerald/10 text-neon-emerald border-neon-emerald/30')}>
                    {dbLoading ? '…' : filteredTransactions.length}
                  </Badge>
                </div>
                <div className="divide-y divide-border/30 max-h-[500px] overflow-y-auto">
                  {dbLoading ? (
                    <div className="p-8 text-center text-muted-foreground"><Activity className="w-8 h-8 mx-auto mb-2 opacity-50 animate-pulse" /><p>Loading…</p></div>
                  ) : filteredTransactions.length > 0 ? filteredTransactions.map((tx, i) => (
                    <TransactionRow key={tx.id} tx={tx} index={i} />
                  )) : (
                    <div className="p-8 text-center text-muted-foreground"><Activity className="w-8 h-8 mx-auto mb-2 opacity-50" /><p>No confirmed transactions</p></div>
                  )}
                </div>
              </GlassCard>
            </div>
          </TabsContent>

          <TabsContent value="tokens">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {tokens.filter(t => !searchQuery || t.symbol?.toLowerCase().includes(searchQuery.toLowerCase()) || t.name?.toLowerCase().includes(searchQuery.toLowerCase()) || t.address?.includes(searchQuery)).map((token: any) => {
                const getSecurityScore = () => {
                  let score = 0;
                  if (!token.mint_enabled || token.mint_locked) score++;
                  if (!token.freeze_enabled || token.freeze_locked) score++;
                  if (token.lp_lock_type === 'burned') score++;
                  if (token.gyds_liquidity >= 100) score++;
                  if (score >= 4) return { label: 'Safe', color: 'bg-primary/20 text-primary border-primary/30' };
                  if (score >= 2) return { label: 'Caution', color: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30' };
                  return { label: 'Risky', color: 'bg-destructive/20 text-destructive border-destructive/30' };
                };
                const security = getSecurityScore();

                return (
                  <Link key={token.id} to={`/explorer/token/${token.address}`} className="block">
                    <GlassCard className="p-4 hover:border-primary/50 transition-colors cursor-pointer">
                      <div className="flex items-center gap-3 mb-3">
                        {token.logo_url ? (
                          <img src={token.logo_url} alt={token.symbol} className="w-10 h-10 rounded-lg object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                            <Coins className="h-5 w-5 text-primary" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold">{token.name}</h3>
                          <p className="text-sm text-muted-foreground">{token.symbol}</p>
                        </div>
                        <Badge variant="outline" className={cn("text-xs gap-1", security.color)}>
                          {security.label === 'Safe' ? <Shield className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                          {security.label}
                        </Badge>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between"><span className="text-muted-foreground">Supply</span><span>{Number(token.total_supply).toLocaleString()}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Liquidity</span><span className="text-primary">{Number(token.gyds_liquidity).toLocaleString()} GYDS</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">LP</span>
                          <Badge variant="outline" className="text-xs">{token.lp_lock_type === 'burned' ? 'Burned 🔥' : 'Time-Locked'}</Badge>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono mt-2 truncate">{token.address}</p>
                    </GlassCard>
                  </Link>
                );
              })}
              {tokens.length === 0 && (
                <div className="col-span-full text-center py-12 text-muted-foreground">
                  <Coins className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No tokens created yet</p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Validators Tab */}
          <TabsContent value="validators" className="mt-4">
            <ValidatorsTab networkStats={networkStats} searchQuery={searchQuery} />
          </TabsContent>

          {/* NFT Explorer Tab */}
          <TabsContent value="nfts" className="mt-4">
            <NFTExplorerTab searchQuery={searchQuery} />
          </TabsContent>

          {/* Pool Explorer Tab */}
          <TabsContent value="pools" className="mt-4">
            <PoolExplorerTab searchQuery={searchQuery} />
          </TabsContent>

          {/* Rich List Tab */}
          <TabsContent value="richlist" className="mt-4">
            <RichListTab />
          </TabsContent>

          {/* Contracts Tab */}
          <TabsContent value="contracts" className="mt-4">
            <ContractsTab searchQuery={searchQuery} />
          </TabsContent>

        </Tabs>

        {/* Footer */}
        <footer className="border-t border-border/50 pt-6 pb-8 text-center text-xs text-muted-foreground">
          <p>GYDS Network Explorer • Chain ID: 13370 • <a href="https://netlifegy.com" className="text-primary hover:underline">netlifegy.com</a></p>
        </footer>
      </main>
    </div>
  );
};

// Sub-components
const ConnectionStatus = ({ isConnected, error, gaveUp }: { isConnected: boolean; error: string | null; gaveUp: boolean }) => (
  <span className={cn('inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full',
    isConnected ? 'bg-neon-emerald/10 text-neon-emerald' :
    gaveUp ? 'bg-neon-amber/10 text-neon-amber' :
    'bg-destructive/10 text-destructive'
  )}>
    {isConnected
      ? (<><span className="w-1.5 h-1.5 rounded-full bg-neon-emerald animate-pulse" /> Live</>)
      : gaveUp
        ? (<><Database className="w-3 h-3" /> DB Mode</>)
        : (<><WifiOff className="w-3 h-3" /> {error || 'Connecting…'}</>)
    }
  </span>
);

const LiveStatCard = ({ label, value, icon, pulse, highlight }: { label: string; value: string; icon: React.ReactNode; pulse?: boolean; highlight?: 'emerald' | 'amber' | 'destructive' }) => (
  <GlassCard className={cn('p-4 transition-all', pulse && 'ring-1 ring-primary/30')}>
    <div className="flex items-center gap-2 text-muted-foreground mb-1">{icon}<span className="text-xs">{label}</span></div>
    <p className={cn('text-xl font-bold font-mono',
      highlight === 'emerald' && 'text-neon-emerald',
      highlight === 'amber' && 'text-neon-amber',
      highlight === 'destructive' && 'text-destructive'
    )}>{value}</p>
  </GlassCard>
);

const TransactionRow = ({ tx, index, isPending }: { tx: Transaction; index: number; isPending?: boolean }) => (
  <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.02 }}
    className={cn('p-4 hover:bg-secondary/30 transition-colors', isPending && 'bg-neon-amber/5')}>
    <div className="flex items-center gap-3">
      <div className={cn('p-2 rounded-lg', isPending ? 'bg-neon-amber/10' : 'bg-neon-emerald/10')}>
        {isPending ? <Clock className="w-4 h-4 text-neon-amber animate-pulse" /> : <CheckCircle className="w-4 h-4 text-neon-emerald" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-mono text-muted-foreground truncate">{tx.id}</p>
        <div className="flex items-center gap-2 mt-1 text-xs">
          <span className="flex items-center gap-1 text-muted-foreground"><ArrowUpRight className="w-3 h-3" /><span className="font-mono truncate max-w-[80px]">{tx.from.slice(0, 8)}...</span></span>
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
          <span className="flex items-center gap-1 text-muted-foreground"><ArrowDownLeft className="w-3 h-3" /><span className="font-mono truncate max-w-[80px]">{tx.to.slice(0, 8)}...</span></span>
        </div>
      </div>
      <div className="text-right">
        <p className="text-sm font-bold text-primary">{tx.amount.toFixed(4)} GYDS</p>
        <p className="text-xs text-muted-foreground">{new Date(tx.timestamp).toLocaleTimeString()}</p>
      </div>
    </div>
  </motion.div>
);

const DetailRow = ({ label, value, mono, truncate, highlight }: { label: string; value: string; mono?: boolean; truncate?: boolean; highlight?: 'emerald' | 'amber' }) => (
  <div>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className={cn('text-sm mt-0.5', mono && 'font-mono', truncate && 'truncate', highlight === 'emerald' && 'text-neon-emerald', highlight === 'amber' && 'text-neon-amber')}>{value}</p>
  </div>
);

// ── Validator Tab ────────────────────────────────────────────────────────────
const DEMO_VALIDATORS = [
  { address: '0xA1b2C3d4E5f6789012345678901234567890ABCD', stake: 500_000, commission: 5, uptime: 99.98, status: 'active', blocks: 14_892 },
  { address: '0xB2C3D4E5F6789012345678901234567890ABCDE', stake: 420_000, commission: 3, uptime: 99.95, status: 'active', blocks: 13_104 },
  { address: '0xC3D4E5F6789012345678901234567890ABCDEF0', stake: 380_000, commission: 7, uptime: 99.91, status: 'active', blocks: 12_651 },
  { address: '0xD4E5F6789012345678901234567890ABCDEF01', stake: 310_000, commission: 4, uptime: 99.87, status: 'active', blocks: 11_033 },
  { address: '0xE5F6789012345678901234567890ABCDEF012', stake: 250_000, commission: 6, uptime: 98.20, status: 'jailed', blocks: 8_912 },
  { address: '0xF6789012345678901234567890ABCDEF0123', stake: 210_000, commission: 5, uptime: 99.72, status: 'active', blocks: 7_461 },
];

const ValidatorsTab = ({ networkStats, searchQuery }: { networkStats: NetworkStats | null; searchQuery: string }) => {
  const [validators, setValidators] = useState(DEMO_VALIDATORS);
  useEffect(() => {
    fetch('/api/validators?limit=50')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (Array.isArray(data) && data.length > 0) setValidators(data.map((v: any) => ({ address: v.address, stake: Number(v.stake_amount || 0), commission: Number(v.commission_rate || 5), uptime: Number(v.uptime || 99), status: v.status || 'active', blocks: Number(v.blocks_validated || 0) }))); })
      .catch(() => {});
  }, []);

  const filtered = validators.filter(v => !searchQuery || v.address.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <GlassCard className="p-0 overflow-hidden">
      <div className="p-4 border-b border-border/50 flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2"><Shield className="w-4 h-4 text-primary" /> Active Validators</h3>
        <Badge variant="outline" className="text-xs">{filtered.length} validators</Badge>
      </div>
      <div className="divide-y divide-border/30">
        {filtered.map((v, i) => (
          <div key={v.address} className="p-4 hover:bg-secondary/20 flex items-center gap-4 flex-wrap">
            <div className="flex-shrink-0 w-6 text-center">
              <span className={cn('text-xs font-bold', i < 3 ? 'text-neon-amber' : 'text-muted-foreground')}>#{i + 1}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-mono text-muted-foreground truncate">{v.address}</p>
              <div className="flex items-center gap-3 mt-1 text-xs">
                <Badge variant="outline" className={cn('text-xs', v.status === 'active' ? 'border-neon-emerald/30 text-neon-emerald' : 'border-destructive/30 text-destructive')}>
                  {v.status === 'active' ? '● Active' : '⚠ Jailed'}
                </Badge>
                <span className="text-muted-foreground">{v.blocks.toLocaleString()} blocks</span>
              </div>
            </div>
            <div className="flex items-center gap-6 text-sm flex-shrink-0">
              <div className="text-center">
                <p className="font-bold">{(v.stake / 1000).toFixed(0)}K</p>
                <p className="text-xs text-muted-foreground">Stake</p>
              </div>
              <div className="text-center">
                <p className="font-bold text-neon-emerald">{v.uptime}%</p>
                <p className="text-xs text-muted-foreground">Uptime</p>
              </div>
              <div className="text-center">
                <p className="font-bold">{v.commission}%</p>
                <p className="text-xs text-muted-foreground">Commission</p>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="p-12 text-center text-muted-foreground">
            <Shield className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p>No validators found</p>
          </div>
        )}
      </div>
    </GlassCard>
  );
};

// ── NFT Explorer Tab ─────────────────────────────────────────────────────────
const DEMO_NFTS = [
  { id: '001', name: 'Genesis Validator Badge', collection: 'GYDS Genesis', owner: '0xA1b2…ABCD', price: 2500, rarity: 'Legendary', image: null },
  { id: '002', name: 'Founding Member Card #12', collection: 'GYDS Genesis', owner: '0xB2C3…BCDE', price: 1800, rarity: 'Epic', image: null },
  { id: '003', name: 'GYDSchain OG #7', collection: 'GYDS OGs', owner: '0xC3D4…CDEF', price: 950, rarity: 'Rare', image: null },
  { id: '004', name: 'Testnet Pioneer #23', collection: 'Testnet Heroes', owner: '0xD4E5…DEF0', price: 400, rarity: 'Uncommon', image: null },
  { id: '005', name: 'Staking Star #55', collection: 'Staking Stars', owner: '0xE5F6…EF01', price: 320, rarity: 'Uncommon', image: null },
  { id: '006', name: 'Block Producer #1', collection: 'Block Producers', owner: '0xF678…F012', price: 5000, rarity: 'Legendary', image: null },
];

const RARITY_COLORS: Record<string, string> = {
  Legendary: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  Epic: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  Rare: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  Uncommon: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  Common: 'bg-secondary text-muted-foreground border-border/50',
};

const NFTExplorerTab = ({ searchQuery }: { searchQuery: string }) => {
  const [nfts, setNfts] = useState(DEMO_NFTS);
  useEffect(() => {
    fetch('/api/nfts?limit=20')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (Array.isArray(data) && data.length > 0) setNfts(data); })
      .catch(() => {});
  }, []);

  const filtered = nfts.filter(n => !searchQuery || n.name.toLowerCase().includes(searchQuery.toLowerCase()) || n.collection.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {filtered.map(nft => (
        <GlassCard key={nft.id} className="p-4 hover:border-primary/30 transition-colors">
          <div className="aspect-square rounded-xl bg-gradient-to-br from-primary/20 via-violet-500/10 to-blue-500/20 flex items-center justify-center mb-3 border border-border/30">
            <Image className="w-12 h-12 text-muted-foreground opacity-40" />
          </div>
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{nft.name}</p>
                <p className="text-xs text-muted-foreground truncate">{nft.collection}</p>
              </div>
              <Badge variant="outline" className={cn('text-xs flex-shrink-0', RARITY_COLORS[nft.rarity])}>{nft.rarity}</Badge>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground font-mono truncate">{nft.owner}</span>
              <span className="font-bold text-primary flex-shrink-0">{nft.price.toLocaleString()} GYDS</span>
            </div>
          </div>
        </GlassCard>
      ))}
      {filtered.length === 0 && (
        <div className="col-span-full p-12 text-center text-muted-foreground">
          <Image className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p>No NFTs found</p>
        </div>
      )}
    </div>
  );
};

// ── Pool Explorer Tab ─────────────────────────────────────────────────────────
const DEMO_POOLS = [
  { pair: 'GYDS / USDT', tvl: 2_840_000, volume24h: 1_240_000, apr: 24.5, fee: 0.3, token0: 'GYDS', token1: 'USDT' },
  { pair: 'GYDS / ETH', tvl: 1_560_000, volume24h: 720_000, apr: 18.2, fee: 0.3, token0: 'GYDS', token1: 'ETH' },
  { pair: 'GYDS / BNB', tvl: 920_000, volume24h: 340_000, apr: 31.8, fee: 0.3, token0: 'GYDS', token1: 'BNB' },
  { pair: 'USDT / USDC', tvl: 4_200_000, volume24h: 2_100_000, apr: 8.4, fee: 0.05, token0: 'USDT', token1: 'USDC' },
  { pair: 'GYDS / MATIC', tvl: 680_000, volume24h: 190_000, apr: 42.1, fee: 0.3, token0: 'GYDS', token1: 'MATIC' },
  { pair: 'GYDS / AVAX', tvl: 490_000, volume24h: 130_000, apr: 38.7, fee: 0.3, token0: 'GYDS', token1: 'AVAX' },
];

const fmtUSD = (n: number) => n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `$${(n / 1_000).toFixed(1)}K` : `$${n}`;

const PoolExplorerTab = ({ searchQuery }: { searchQuery: string }) => {
  const filtered = DEMO_POOLS.filter(p => !searchQuery || p.pair.toLowerCase().includes(searchQuery.toLowerCase()));
  return (
    <GlassCard className="p-0 overflow-hidden">
      <div className="p-4 border-b border-border/50">
        <h3 className="font-semibold flex items-center gap-2"><Droplets className="w-4 h-4 text-primary" /> Liquidity Pools</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/30 text-xs text-muted-foreground">
              <th className="text-left p-4">#</th>
              <th className="text-left p-4">Pool</th>
              <th className="text-right p-4">TVL</th>
              <th className="text-right p-4">Vol 24h</th>
              <th className="text-right p-4">APR</th>
              <th className="text-right p-4">Fee</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20">
            {filtered.map((pool, i) => (
              <tr key={pool.pair} className="hover:bg-secondary/20 transition-colors">
                <td className="p-4 text-muted-foreground text-xs">{i + 1}</td>
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-1">
                      <div className="w-5 h-5 rounded-full bg-primary/30 border border-background flex items-center justify-center text-[9px] font-bold">{pool.token0[0]}</div>
                      <div className="w-5 h-5 rounded-full bg-violet-500/30 border border-background flex items-center justify-center text-[9px] font-bold">{pool.token1[0]}</div>
                    </div>
                    <span className="font-medium">{pool.pair}</span>
                  </div>
                </td>
                <td className="p-4 text-right font-mono">{fmtUSD(pool.tvl)}</td>
                <td className="p-4 text-right font-mono text-muted-foreground">{fmtUSD(pool.volume24h)}</td>
                <td className="p-4 text-right font-bold text-neon-emerald">{pool.apr}%</td>
                <td className="p-4 text-right text-muted-foreground">{pool.fee}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="p-12 text-center text-muted-foreground">
            <Droplets className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p>No pools found</p>
          </div>
        )}
      </div>
    </GlassCard>
  );
};

// ── Rich List Tab ─────────────────────────────────────────────────────────────
const RICH_LIST = [
  { rank: 1, address: '0xA1b2C3d4E5f6789012345678901234567890ABCD', label: 'Validator Pool', balance: 48_200_000, pct: 4.82, change: '+0.12%' },
  { rank: 2, address: '0xB2C3D4E5F6789012345678901234567890ABCDE', label: 'Treasury', balance: 42_000_000, pct: 4.20, change: '0%' },
  { rank: 3, address: '0xC3D4E5F6789012345678901234567890ABCDEF0', label: 'Team Lockup', balance: 35_000_000, pct: 3.50, change: '0%' },
  { rank: 4, address: '0xD4E5F6789012345678901234567890ABCDEF01', label: 'Ecosystem Fund', balance: 28_500_000, pct: 2.85, change: '+0.03%' },
  { rank: 5, address: '0xE5F6789012345678901234567890ABCDEF012', label: 'DEX Reserve', balance: 21_000_000, pct: 2.10, change: '-0.05%' },
  { rank: 6, address: '0xF6789012345678901234567890ABCDEF0123', label: 'Staking Contract', balance: 18_400_000, pct: 1.84, change: '+0.08%' },
  { rank: 7, address: '0x1234567890ABCDEF1234567890ABCDEF1234', label: '', balance: 12_100_000, pct: 1.21, change: '+0.01%' },
  { rank: 8, address: '0x2345678901ABCDEF2345678901ABCDEF2345', label: '', balance: 9_800_000, pct: 0.98, change: '-0.02%' },
  { rank: 9, address: '0x3456789012ABCDEF3456789012ABCDEF3456', label: '', balance: 8_200_000, pct: 0.82, change: '+0.00%' },
  { rank: 10, address: '0x4567890123ABCDEF4567890123ABCDEF4567', label: '', balance: 7_450_000, pct: 0.75, change: '-0.01%' },
];

const RichListTab = () => (
  <GlassCard className="p-0 overflow-hidden">
    <div className="p-4 border-b border-border/50 flex items-center justify-between">
      <h3 className="font-semibold flex items-center gap-2"><Trophy className="w-4 h-4 text-neon-amber" /> GYDS Rich List</h3>
      <span className="text-xs text-muted-foreground">Top 10 holders by balance</span>
    </div>
    <div className="divide-y divide-border/20">
      {RICH_LIST.map(h => (
        <div key={h.rank} className="p-4 hover:bg-secondary/20 transition-colors flex items-center gap-4">
          <div className="flex-shrink-0 w-8 text-center">
            {h.rank <= 3 ? (
              <Star className={cn('w-4 h-4 mx-auto', h.rank === 1 ? 'text-neon-amber' : h.rank === 2 ? 'text-gray-400' : 'text-amber-700')} />
            ) : (
              <span className="text-xs text-muted-foreground">#{h.rank}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            {h.label && <p className="text-xs font-medium text-primary mb-0.5">{h.label}</p>}
            <p className="text-xs font-mono text-muted-foreground truncate">{h.address}</p>
          </div>
          <div className="text-right flex-shrink-0 space-y-0.5">
            <p className="font-bold text-sm">{(h.balance / 1_000_000).toFixed(2)}M GYDS</p>
            <div className="flex items-center gap-2 justify-end">
              <span className="text-xs text-muted-foreground">{h.pct}%</span>
              <span className={cn('text-xs font-mono', h.change.startsWith('+') ? 'text-neon-emerald' : h.change === '0%' ? 'text-muted-foreground' : 'text-destructive')}>{h.change}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
    <div className="p-4 border-t border-border/30 text-center text-xs text-muted-foreground">
      Balances refresh every 30 seconds • Data from testnet
    </div>
  </GlassCard>
);

// ── Contracts Tab ─────────────────────────────────────────────────────────────
const DEMO_CONTRACTS = [
  { address: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12', name: 'GYDSwap Router', type: 'DEX Router', verified: true, txCount: 128_441, creator: '0xNETLIFEGY' },
  { address: '0xBCDEF12345678901BCDEF12345678901BCDEF123', name: 'GYDSwap Factory', type: 'AMM Factory', verified: true, txCount: 42_003, creator: '0xNETLIFEGY' },
  { address: '0xCDEF123456789012CDEF123456789012CDEF1234', name: 'GydsSwapFarm', type: 'LP Farm', verified: true, txCount: 31_200, creator: '0xNETLIFEGY' },
  { address: '0xDEF1234567890123DEF1234567890123DEF12345', name: 'WGYDS', type: 'Wrapped Token', verified: true, txCount: 98_772, creator: '0xNETLIFEGY' },
  { address: '0xEF12345678901234EF12345678901234EF123456', name: 'StakingPool', type: 'Staking', verified: true, txCount: 18_905, creator: '0xNETLIFEGY' },
  { address: '0xF123456789012345F123456789012345F1234567', name: 'InsurancePool', type: 'Insurance', verified: false, txCount: 7_201, creator: '0xNETLIFEGY' },
];

const ContractsTab = ({ searchQuery }: { searchQuery: string }) => {
  const filtered = DEMO_CONTRACTS.filter(c => !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.address.toLowerCase().includes(searchQuery.toLowerCase()) || c.type.toLowerCase().includes(searchQuery.toLowerCase()));
  return (
    <GlassCard className="p-0 overflow-hidden">
      <div className="p-4 border-b border-border/50">
        <h3 className="font-semibold flex items-center gap-2"><Code2 className="w-4 h-4 text-primary" /> Smart Contracts</h3>
      </div>
      <div className="divide-y divide-border/20">
        {filtered.map(contract => (
          <div key={contract.address} className="p-4 hover:bg-secondary/20 transition-colors flex items-center gap-4 flex-wrap">
            <div className="p-2 rounded-lg bg-primary/10 flex-shrink-0">
              <Code2 className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <p className="font-medium text-sm">{contract.name}</p>
                <Badge variant="outline" className="text-xs">{contract.type}</Badge>
                {contract.verified && <Badge variant="outline" className="text-xs border-neon-emerald/30 text-neon-emerald gap-1"><CheckCircle className="w-2.5 h-2.5" /> Verified</Badge>}
              </div>
              <p className="text-xs font-mono text-muted-foreground truncate">{contract.address}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-bold">{contract.txCount.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">transactions</p>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="p-12 text-center text-muted-foreground">
            <Code2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p>No contracts found</p>
          </div>
        )}
      </div>
    </GlassCard>
  );
};

export default Explorer;
