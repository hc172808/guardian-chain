import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, ArrowUpDown, Settings2, Wallet, ExternalLink, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Token {
  symbol: string;
  name: string;
  balance: number;
  price: number;
  icon?: string;
}

const tokens: Token[] = [
  { symbol: 'GYD', name: 'NetlifeGY', balance: 1.0103, price: 86.802 },
  { symbol: 'GYDS', name: 'NetlifeGY Stable', balance: 0, price: 1.00 },
  { symbol: 'NLGR', name: 'NetlifeGY Rewards', balance: 0, price: 0.7837 },
];

export const SwapInterface = () => {
  const [payAmount, setPayAmount] = useState('');
  const [receiveAmount, setReceiveAmount] = useState('');
  const [payToken, setPayToken] = useState(tokens[0]);
  const [receiveToken, setReceiveToken] = useState(tokens[1]);
  const [slippage, setSlippage] = useState(0.5);

  const handleSwapTokens = () => {
    const temp = payToken;
    setPayToken(receiveToken);
    setReceiveToken(temp);
    setPayAmount(receiveAmount);
    setReceiveAmount(payAmount);
  };

  const payValue = parseFloat(payAmount || '0') * payToken.price;
  const receiveValue = parseFloat(receiveAmount || '0') * receiveToken.price;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
          <RefreshCw className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Slippage</span>
          <Badge variant="secondary" className="font-mono">{slippage}%</Badge>
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
            <Settings2 className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Pay Input */}
      <div className="rounded-xl border border-border/50 bg-card/50 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Pay</span>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Half</span>
            <span className="text-primary cursor-pointer hover:underline">Max</span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-4">
          <Input
            type="number"
            placeholder="0"
            value={payAmount}
            onChange={(e) => setPayAmount(e.target.value)}
            className="border-0 bg-transparent text-3xl font-light p-0 h-auto focus-visible:ring-0 placeholder:text-muted-foreground/50"
          />
          <Button variant="secondary" className="gap-2 rounded-lg px-4 py-2 h-auto">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center text-xs font-bold">
              {payToken.symbol[0]}
            </div>
            <span className="font-semibold">{payToken.symbol}</span>
          </Button>
        </div>
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>${payValue.toFixed(2)}</span>
          <div className="flex items-center gap-1">
            <Wallet className="h-3 w-3" />
            <span>{payToken.balance.toFixed(4)}</span>
          </div>
        </div>
      </div>

      {/* Swap Button */}
      <div className="flex justify-center -my-2 relative z-10">
        <Button
          variant="secondary"
          size="icon"
          onClick={handleSwapTokens}
          className="rounded-lg border border-border/50 bg-card hover:bg-secondary"
        >
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      </div>

      {/* Receive Input */}
      <div className="rounded-xl border border-border/50 bg-card/50 p-4 space-y-3">
        <span className="text-sm text-muted-foreground">Receive</span>
        <div className="flex items-center justify-between gap-4">
          <Input
            type="number"
            placeholder="0"
            value={receiveAmount}
            onChange={(e) => setReceiveAmount(e.target.value)}
            className="border-0 bg-transparent text-3xl font-light p-0 h-auto focus-visible:ring-0 placeholder:text-muted-foreground/50"
          />
          <Button variant="secondary" className="gap-2 rounded-lg px-4 py-2 h-auto">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-xs font-bold text-black">
              {receiveToken.symbol[0]}
            </div>
            <span className="font-semibold">{receiveToken.symbol}</span>
          </Button>
        </div>
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>${receiveValue.toFixed(2)}</span>
          <div className="flex items-center gap-1">
            <Wallet className="h-3 w-3" />
            <span>{receiveToken.balance}</span>
          </div>
        </div>
      </div>

      {/* Trade Button */}
      <Button 
        className="w-full h-14 text-lg font-semibold bg-amber-600/80 hover:bg-amber-600 text-foreground"
        disabled={!payAmount || parseFloat(payAmount) <= 0}
      >
        Trade
      </Button>

      {/* Token List */}
      <div className="space-y-2 pt-4">
        {tokens.map((token) => (
          <div
            key={token.symbol}
            className="flex items-center justify-between p-3 rounded-xl hover:bg-secondary/50 cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold",
                token.symbol === 'GYD' ? "bg-gradient-to-br from-blue-500 to-cyan-500" :
                token.symbol === 'GYDS' ? "bg-gradient-to-br from-primary to-primary/50" :
                "bg-gradient-to-br from-amber-500 to-amber-600 text-black"
              )}>
                {token.symbol[0]}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{token.symbol}</span>
                  <span className="text-muted-foreground">{token.name}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono bg-secondary/50 px-2 py-0.5 rounded">
                    {token.symbol.slice(0, 4)}...{token.symbol.slice(-4)}
                  </span>
                  <Copy className="h-3 w-3" />
                  <ExternalLink className="h-3 w-3" />
                </div>
              </div>
            </div>
            <span className="font-mono">${token.price.toFixed(token.price < 1 ? 4 : 2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
