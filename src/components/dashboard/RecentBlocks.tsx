import { useMemo } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { generateMockBlocks, Block } from '@/lib/blockchain';
import { CheckCircle, Clock, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

export const RecentBlocks = () => {
  const blocks = useMemo(() => generateMockBlocks(8).reverse(), []);

  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold">Recent Blocks</h3>
        <Link 
          to="/explorer"
          className="text-sm text-primary hover:text-primary/80 flex items-center gap-1"
        >
          View All <ExternalLink className="w-3 h-3" />
        </Link>
      </div>
      
      <div className="space-y-3">
        {blocks.map((block, index) => (
          <BlockRow key={block.hash} block={block} index={index} />
        ))}
      </div>
    </GlassCard>
  );
};

const BlockRow = ({ block, index }: { block: Block; index: number }) => {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className="flex items-center gap-4 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer"
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
          <span className="font-mono text-sm font-medium">
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
        <p className="text-xs text-muted-foreground font-mono truncate mt-1">
          {block.hash.slice(0, 16)}...{block.hash.slice(-8)}
        </p>
      </div>
      
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-medium">{block.transactions.length} txs</p>
        <p className="text-xs text-muted-foreground">
          {new Date(block.timestamp).toLocaleTimeString()}
        </p>
      </div>
    </motion.div>
  );
};
