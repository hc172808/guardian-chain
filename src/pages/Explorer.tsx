import { useState, useMemo } from 'react';
import { Layout } from '@/components/layout/Layout';
import { GlassCard } from '@/components/ui/GlassCard';
import { generateMockBlocks, Block } from '@/lib/blockchain';
import { motion } from 'framer-motion';
import { Search, Blocks, CheckCircle, Clock, ChevronRight, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

const Explorer = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBlock, setSelectedBlock] = useState<Block | null>(null);
  
  const blocks = useMemo(() => generateMockBlocks(50).reverse(), []);
  
  const filteredBlocks = blocks.filter(block => 
    block.hash.includes(searchQuery) || 
    block.height.toString().includes(searchQuery) ||
    block.validator.includes(searchQuery)
  );

  return (
    <Layout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-6"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Blocks className="w-8 h-8 text-primary" />
              Block Explorer
            </h1>
            <p className="text-muted-foreground mt-2">
              Browse and search the blockchain
            </p>
          </div>
          
          <div className="relative w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by block height, hash, or validator..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-secondary/50 border-border/50"
            />
          </div>
        </div>

        {/* Block List */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <GlassCard className="p-0 overflow-hidden">
              <div className="p-4 border-b border-border/50">
                <h3 className="font-semibold">Recent Blocks</h3>
              </div>
              
              <div className="divide-y divide-border/30 max-h-[600px] overflow-y-auto">
                {filteredBlocks.map((block, index) => (
                  <motion.div
                    key={block.hash}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: index * 0.02 }}
                    onClick={() => setSelectedBlock(block)}
                    className={cn(
                      'p-4 hover:bg-secondary/30 cursor-pointer transition-colors flex items-center gap-4',
                      selectedBlock?.hash === block.hash && 'bg-secondary/50'
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
                  <DetailRow label="Validator Stake" value={`${selectedBlock.validatorStake.toLocaleString()} CORE`} />
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
                          <span className="text-neon-emerald">{reward.reward.toFixed(4)} CORE</span>
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
      </motion.div>
    </Layout>
  );
};

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

export default Explorer;
