import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { TrendingUp } from 'lucide-react';

interface Chain {
  id: string;
  name: string;
  symbol: string;
  logo: string;
  color: string;
  bridgeFee: number;
}

interface BridgeFeeComparisonProps {
  chains: Chain[];
  prices: Record<string, number>;
  amount: string;
  gydsPrice: number;
  onSelectChain: (chainId: string) => void;
  selectedChainId: string;
}

export const BridgeFeeComparison = ({
  chains,
  prices,
  amount,
  gydsPrice,
  onSelectChain,
  selectedChainId,
}: BridgeFeeComparisonProps) => {
  const amountNum = parseFloat(amount || '0');
  if (!amountNum || amountNum <= 0) return null;

  // Calculate received GYDS for each chain assuming user has equivalent USD worth
  const comparisons = chains.map(chain => {
    const price = prices[chain.id] || 0;
    const usdValue = amountNum * price;
    const fee = usdValue * chain.bridgeFee;
    const netUsd = usdValue - fee;
    const receivedGyds = netUsd / gydsPrice;
    return { ...chain, usdValue, fee, netUsd, receivedGyds };
  });

  // Find best rate (most GYDS received)
  const bestChainId = comparisons.reduce((best, c) =>
    c.receivedGyds > (comparisons.find(x => x.id === best)?.receivedGyds || 0) ? c.id : best,
    comparisons[0].id
  );

  return (
    <div className="rounded-xl border border-border/50 bg-card/30 p-3 space-y-2">
      <div className="flex items-center gap-2 mb-2">
        <TrendingUp className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-medium text-muted-foreground">Fee Comparison (for {amountNum} tokens)</span>
      </div>
      <div className="space-y-1.5">
        {comparisons.map(c => (
          <button
            key={c.id}
            onClick={() => onSelectChain(c.id)}
            className={cn(
              "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all",
              selectedChainId === c.id
                ? "bg-primary/10 border border-primary/30"
                : "bg-secondary/30 hover:bg-secondary/50 border border-transparent"
            )}
          >
            <div className="flex items-center gap-2">
              <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-xs", `bg-gradient-to-br ${c.color}`)}>
                {c.logo}
              </div>
              <span className="font-medium">{c.symbol}</span>
              {c.id === bestChainId && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-primary/20 text-primary">
                  Best Rate
                </Badge>
              )}
            </div>
            <div className="text-right">
              <span className="font-mono text-xs">
                {c.receivedGyds.toLocaleString(undefined, { maximumFractionDigits: 0 })} GYDS
              </span>
              <span className="text-[10px] text-muted-foreground ml-2">
                (-${c.fee.toFixed(2)} fee)
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
