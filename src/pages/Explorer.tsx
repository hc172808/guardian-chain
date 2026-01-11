import { useState, useMemo, useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { GlassCard } from '@/components/ui/GlassCard';
import { generateMockBlocks, Block, Transaction } from '@/lib/blockchain';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Blocks, CheckCircle, Clock, ChevronRight, Wifi, WifiOff, ArrowUpRight, ArrowDownLeft, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { useBlockchainWebSocket } from '@/hooks/useBlockchainWebSocket';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

const ExplorerContent = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBlock, setSelectedBlock] = useState<Block | null>(null);
  const [blocks, setBlocks] = useState<Block[]>(() => generateMockBlocks(50).reverse());
  
  const {
    isConnected,
    latestBlock,
    latestTransactions,
    pendingTransactions,
    error,
  } = useBlockchainWebSocket();

  // Update blocks when new block arrives
  useEffect(() => {
    if (latestBlock) {
      setBlocks(prev => {
        // Check if block already exists
        if (prev.some(b => b.hash === latestBlock.hash)) return prev;
        return [latestBlock, ...prev.slice(0, 99)];
      });
    }
  }, [latestBlock]);
  
  const filteredBlocks = blocks.filter(block => 
    block.hash.includes(searchQuery) || 
    block.height.toString().includes(searchQuery) ||
    block.validator.includes(searchQuery)
  );

  const filteredTransactions = latestTransactions.filter(tx =>
    tx.id.includes(searchQuery) ||
    tx.from.includes(searchQuery) ||
    tx.to.includes(searchQuery)
  );

  return (
    <Layout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-6"
      >
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Blocks className="w-8 h-8 text-primary" />
              Block Explorer
            </h1>
            <p className="text-muted-foreground mt-2 flex items-center gap-2">
              Browse and search the blockchain
              <ConnectionStatus isConnected={isConnected} error={error} />
            </p>
          </div>
          
          <div className="relative w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by block height, hash, or address..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-secondary/50 border-border/50"
            />
          </div>
        </div>

        {/* Live Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <LiveStatCard
            label="Latest Block"
            value={`#${(latestBlock?.height || blocks[0]?.height || 0).toLocaleString()}`}
            icon={<Blocks className="w-4 h-4" />}
            pulse={!!latestBlock}
          />
          <LiveStatCard
            label="Pending Txs"
            value={pendingTransactions.length.toString()}
            icon={<Clock className="w-4 h-4" />}
            pulse={pendingTransactions.length > 0}
          />
          <LiveStatCard
            label="Confirmed Txs"
            value={latestTransactions.length.toString()}
            icon={<CheckCircle className="w-4 h-4" />}
          />
          <LiveStatCard
            label="Connection"
            value={isConnected ? 'Live' : 'Offline'}
            icon={isConnected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            highlight={isConnected ? 'emerald' : 'destructive'}
          />
        </div>

        {/* Main Content */}
        <Tabs defaultValue="blocks" className="space-y-4">
          <TabsList className="bg-secondary/50">
            <TabsTrigger value="blocks" className="gap-2">
              <Blocks className="w-4 h-4" />
              Blocks
            </TabsTrigger>
            <TabsTrigger value="transactions" className="gap-2">
              <Activity className="w-4 h-4" />
              Transactions
              {pendingTransactions.length > 0 && (
                <Badge variant="secondary" className="ml-1 bg-neon-amber/20 text-neon-amber">
                  {pendingTransactions.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="blocks">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <GlassCard className="p-0 overflow-hidden">
                  <div className="p-4 border-b border-border/50 flex items-center justify-between">
                    <h3 className="font-semibold">Recent Blocks</h3>
                    {latestBlock && (
                      <span className="text-xs text-muted-foreground animate-pulse">
                        Live updates enabled
                      </span>
                    )}
                  </div>
                  
                  <div className="divide-y divide-border/30 max-h-[600px] overflow-y-auto">
                    <AnimatePresence mode="popLayout">
                      {filteredBlocks.map((block, index) => (
                        <motion.div
                          key={block.hash}
                          initial={{ opacity: 0, y: -20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 20 }}
                          transition={{ delay: index * 0.02 }}
                          onClick={() => setSelectedBlock(block)}
                          className={cn(
                            'p-4 hover:bg-secondary/30 cursor-pointer transition-colors flex items-center gap-4',
                            selectedBlock?.hash === block.hash && 'bg-secondary/50',
                            index === 0 && latestBlock?.hash === block.hash && 'ring-1 ring-primary/50'
                          )}
                        >
                          <div className="flex-shrink-0">
                            {block.finalized ? (
                              <div className="p-2 rounded-lg bg-neon-emerald/10">
                                <CheckCircle className="w-4 h-4 text-neon-emerald" />
                              </div>
                            ) : (
                              <div className="p-2 rounded-lg bg-neon-amber/10">
                                <Clock className="w-4 h-4 text-neon-amber animate-pulse-slow" />
                              </div>
                            )}
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-bold text-primary">
                                #{block.height.toLocaleString()}
                              </span>
                              <span className={cn(
                                'text-xs px-2 py-0.5 rounded-full',
                                block.finalized 
                                  ? 'bg-neon-emerald/10 text-neon-emerald' 
                                  : 'bg-neon-amber/10 text-neon-amber'
                              )}>
                                {block.finalized ? 'Finalized' : 'Pending'}
                              </span>
                              {index === 0 && latestBlock?.hash === block.hash && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary animate-pulse">
                                  New
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground font-mono mt-1 truncate">
                              {block.hash}
                            </p>
                          </div>
                          
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-medium">{block.transactions.length} txs</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(block.timestamp).toLocaleTimeString()}
                            </p>
                          </div>
                          
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </GlassCard>
              </div>

              {/* Block Details */}
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
                      <DetailRow label="Mining Rewards" value={selectedBlock.miningRewards.length.toString()} />
                      <DetailRow 
                        label="Status" 
                        value={selectedBlock.finalized ? 'Finalized' : 'Pending'} 
                        highlight={selectedBlock.finalized ? 'emerald' : 'amber'}
                      />
                      <DetailRow 
                        label="Timestamp" 
                        value={new Date(selectedBlock.timestamp).toLocaleString()} 
                      />
                      
                      <div className="pt-4 border-t border-border/50">
                        <h4 className="text-sm font-medium mb-2">Mining Rewards</h4>
                        {selectedBlock.miningRewards.map((reward, i) => (
                          <div key={i} className="text-xs bg-secondary/30 p-2 rounded mb-2">
                            <p className="font-mono text-muted-foreground truncate">
                              {reward.minerId}
                            </p>
                            <p className="mt-1">
                              <span className="text-neon-emerald">{reward.reward.toFixed(4)} GYDS</span>
                              <span className="text-muted-foreground ml-2">({reward.shares} shares)</span>
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      Select a block to view details
                    </p>
                  )}
                </GlassCard>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="transactions">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Pending Transactions */}
              <GlassCard className="p-0 overflow-hidden">
                <div className="p-4 border-b border-border/50 flex items-center justify-between">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Clock className="w-4 h-4 text-neon-amber" />
                    Pending Transactions
                  </h3>
                  <Badge variant="outline" className="bg-neon-amber/10 text-neon-amber border-neon-amber/30">
                    {pendingTransactions.length}
                  </Badge>
                </div>
                
                <div className="divide-y divide-border/30 max-h-[500px] overflow-y-auto">
                  <AnimatePresence mode="popLayout">
                    {pendingTransactions.length > 0 ? (
                      pendingTransactions.map((tx, index) => (
                        <TransactionRow key={tx.id} tx={tx} index={index} isPending />
                      ))
                    ) : (
                      <div className="p-8 text-center text-muted-foreground">
                        <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>No pending transactions</p>
                      </div>
                    )}
                  </AnimatePresence>
                </div>
              </GlassCard>

              {/* Confirmed Transactions */}
              <GlassCard className="p-0 overflow-hidden">
                <div className="p-4 border-b border-border/50 flex items-center justify-between">
                  <h3 className="font-semibold flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-neon-emerald" />
                    Confirmed Transactions
                  </h3>
                  <Badge variant="outline" className="bg-neon-emerald/10 text-neon-emerald border-neon-emerald/30">
                    {filteredTransactions.length}
                  </Badge>
                </div>
                
                <div className="divide-y divide-border/30 max-h-[500px] overflow-y-auto">
                  <AnimatePresence mode="popLayout">
                    {filteredTransactions.length > 0 ? (
                      filteredTransactions.map((tx, index) => (
                        <TransactionRow key={tx.id} tx={tx} index={index} />
                      ))
                    ) : (
                      <div className="p-8 text-center text-muted-foreground">
                        <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>No confirmed transactions yet</p>
                      </div>
                    )}
                  </AnimatePresence>
                </div>
              </GlassCard>
            </div>
          </TabsContent>
        </Tabs>
      </motion.div>
    </Layout>
  );
};

const ConnectionStatus = ({ isConnected, error }: { isConnected: boolean; error: string | null }) => (
  <span className={cn(
    'inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full',
    isConnected 
      ? 'bg-neon-emerald/10 text-neon-emerald' 
      : 'bg-destructive/10 text-destructive'
  )}>
    {isConnected ? (
      <>
        <span className="w-1.5 h-1.5 rounded-full bg-neon-emerald animate-pulse" />
        Live
      </>
    ) : (
      <>
        <WifiOff className="w-3 h-3" />
        {error || 'Offline'}
      </>
    )}
  </span>
);

const LiveStatCard = ({ 
  label, 
  value, 
  icon, 
  pulse,
  highlight 
}: { 
  label: string; 
  value: string; 
  icon: React.ReactNode;
  pulse?: boolean;
  highlight?: 'emerald' | 'destructive';
}) => (
  <GlassCard className={cn(
    'p-4 transition-all',
    pulse && 'ring-1 ring-primary/30'
  )}>
    <div className="flex items-center gap-2 text-muted-foreground mb-1">
      {icon}
      <span className="text-xs">{label}</span>
    </div>
    <p className={cn(
      'text-xl font-bold font-mono',
      highlight === 'emerald' && 'text-neon-emerald',
      highlight === 'destructive' && 'text-destructive'
    )}>
      {value}
    </p>
  </GlassCard>
);

const TransactionRow = ({ 
  tx, 
  index,
  isPending 
}: { 
  tx: Transaction; 
  index: number;
  isPending?: boolean;
}) => (
  <motion.div
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: 20 }}
    transition={{ delay: index * 0.02 }}
    className={cn(
      'p-4 hover:bg-secondary/30 transition-colors',
      isPending && 'bg-neon-amber/5'
    )}
  >
    <div className="flex items-center gap-3">
      <div className={cn(
        'p-2 rounded-lg',
        isPending ? 'bg-neon-amber/10' : 'bg-neon-emerald/10'
      )}>
        {isPending ? (
          <Clock className="w-4 h-4 text-neon-amber animate-pulse" />
        ) : (
          <CheckCircle className="w-4 h-4 text-neon-emerald" />
        )}
      </div>
      
      <div className="flex-1 min-w-0">
        <p className="text-xs font-mono text-muted-foreground truncate">
          {tx.id}
        </p>
        <div className="flex items-center gap-2 mt-1 text-xs">
          <span className="flex items-center gap-1 text-muted-foreground">
            <ArrowUpRight className="w-3 h-3" />
            <span className="font-mono truncate max-w-[80px]">{tx.from.slice(0, 8)}...</span>
          </span>
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
          <span className="flex items-center gap-1 text-muted-foreground">
            <ArrowDownLeft className="w-3 h-3" />
            <span className="font-mono truncate max-w-[80px]">{tx.to.slice(0, 8)}...</span>
          </span>
        </div>
      </div>
      
      <div className="text-right">
        <p className="text-sm font-bold text-primary">{tx.amount.toFixed(4)} GYDS</p>
        <p className="text-xs text-muted-foreground">
          {new Date(tx.timestamp).toLocaleTimeString()}
        </p>
      </div>
    </div>
  </motion.div>
);

const DetailRow = ({ 
  label, 
  value, 
  mono, 
  truncate, 
  highlight 
}: { 
  label: string; 
  value: string; 
  mono?: boolean; 
  truncate?: boolean;
  highlight?: 'emerald' | 'amber';
}) => (
  <div>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className={cn(
      'text-sm mt-0.5',
      mono && 'font-mono',
      truncate && 'truncate',
      highlight === 'emerald' && 'text-neon-emerald',
      highlight === 'amber' && 'text-neon-amber'
    )}>
      {value}
    </p>
  </div>
);

const Explorer = () => (
  <RequireAuth>
    <ExplorerContent />
  </RequireAuth>
);

export default Explorer;
