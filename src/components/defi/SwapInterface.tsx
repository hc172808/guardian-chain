import { useState, useEffect, useMemo, forwardRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, ArrowUpDown, Settings2, Wallet, ExternalLink, Copy, Loader2, ChevronDown, Search, Globe, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWalletConnect } from '@/hooks/useWalletConnect';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { RecentSwaps } from './RecentSwaps';
import { CrossChainBridge } from './CrossChainBridge';
import { getUserAddresses, computeUserBalances } from '@/lib/balances';
import {
  getAmountOut,
  getAmountIn,
  getPairReserves,
  getTokenBalance,
  executeSwapExactTokensForTokens,
  executeSwapExactGYDSForTokens,
  buildSwapPath,
} from '@/lib/swapContract';
import {
  CONTRACT_ADDRESSES,
  SWAP_FEE_NUMERATOR,
  SWAP_FEE_DENOMINATOR,
} from '@/config/contracts';
import { NetworkStatusBanner } from '@/components/network/NetworkStatusBanner';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';

interface Token {
  symbol: string;
  name: string;
  balance: number;
  price: number;
  address?: string;
  logo?: string;
}

// Native coins always available
// GYDS = native fee coin (0x000...0000) | GYD = stablecoin (0x000...0001)
const NATIVE_TOKENS: Token[] = [
  { symbol: 'GYDS', name: 'GYDS Native Coin', balance: 0, price: 0.0000001, address: '0x0000000000000000000000000000000000000000', logo: '/gyds-coin.jpg' },
  { symbol: 'GYD', name: 'GYD Stablecoin', balance: 0, price: 1.00, address: '0x0000000000000000000000000000000000000001', logo: '/gyd-coin.png' },
  { symbol: 'GUSD', name: 'Guardian Dollar', balance: 0, price: 1.00, address: '0x0000000000000000000000000000000000000002', logo: '/gusd-coin.png' },
];

const TokenSelectorButton = forwardRef<HTMLSpanElement, { token: Token; onClick: () => void }>(
  ({ token, onClick }, ref) => (
    <span ref={ref} className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-secondary px-3 py-2 h-auto text-sm font-medium" onClick={onClick}>
      {token.logo ? (
        <img src={token.logo} alt={token.symbol} className="w-6 h-6 rounded-full object-cover" />
      ) : (
        <div className={cn(
          "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
          token.symbol === 'GYD' ? "bg-gradient-to-br from-blue-500 to-cyan-500" :
          token.symbol === 'GYDS' ? "bg-gradient-to-br from-primary to-primary/50" :
          token.symbol === 'GUSD' ? "bg-gradient-to-br from-[#0A4FFF] to-[#082567]" :
          "bg-gradient-to-br from-amber-500 to-amber-600 text-black"
        )}>
          {token.symbol[0]}
        </div>
      )}
      <span className="font-semibold">{token.symbol}</span>
      <ChevronDown className="h-3 w-3 text-muted-foreground" />
    </span>
  )
);
TokenSelectorButton.displayName = 'TokenSelectorButton';

const TokenSelector = ({
  tokens,
  selectedToken,
  otherToken,
  onSelect,
  open,
  onOpenChange,
  children,
}: {
  tokens: Token[];
  selectedToken: Token;
  otherToken: Token;
  onSelect: (token: Token) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) => {
  const [search, setSearch] = useState('');

  const filtered = tokens.filter(t =>
    t.symbol !== otherToken.symbol &&
    (t.symbol.toLowerCase().includes(search.toLowerCase()) ||
     t.name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tokens..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-9 bg-secondary/30"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-4">No tokens found</p>
          ) : filtered.map(token => (
            <button
              key={token.symbol}
              className={cn(
                "w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-colors",
                token.symbol === selectedToken.symbol
                  ? "bg-primary/10 text-primary"
                  : "hover:bg-secondary/50"
              )}
              onClick={() => { onSelect(token); onOpenChange(false); setSearch(''); }}
            >
              {token.logo ? (
                <img src={token.logo} alt={token.symbol} className="w-8 h-8 rounded-full object-cover shrink-0" />
              ) : (
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                  token.symbol === 'GYD' ? "bg-gradient-to-br from-blue-500 to-cyan-500" :
                  token.symbol === 'GYDS' ? "bg-gradient-to-br from-primary to-primary/50" :
                  "bg-gradient-to-br from-amber-500 to-amber-600 text-black"
                )}>
                  {token.symbol[0]}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">{token.symbol}</div>
                <div className="text-xs text-muted-foreground truncate">{token.name}</div>
              </div>
              <span className="text-xs font-mono text-muted-foreground">${token.price < 1 ? token.price.toFixed(7) : token.price.toFixed(2)}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export const SwapInterface = () => {
  const [payAmount, setPayAmount] = useState('');
  const [receiveAmount, setReceiveAmount] = useState('');
  const [allTokens, setAllTokens] = useState<Token[]>(NATIVE_TOKENS);
  const [payToken, setPayToken] = useState<Token>(NATIVE_TOKENS[0]);
  const [receiveToken, setReceiveToken] = useState<Token>(NATIVE_TOKENS[1]);
  const [slippage, setSlippage] = useState(0.5);
  const [isSwapping, setIsSwapping] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);

  const { address, isConnected } = useWalletConnect();
  const { user } = useAuth();
  const { toast } = useToast();
  // Allow swapping with DB wallet when no browser wallet is connected
  const effectiveAddress = address || user?.walletAddress || null;

  // Load tokens from database + coin logos + real balances
  useEffect(() => {
    const loadTokens = async () => {
      const { data } = await supabase
        .from('tokens')
        .select('symbol, name, address, total_supply, logo_url, creator_id')
        .eq('is_active', true)
        .order('symbol');

      // Get coin logos — DB values override static fallbacks
      // Static fallbacks exist at /gyds-coin.jpg, /gyd-coin.png, /gusd-coin.png
      const logos: Record<string, string> = {
        gyds_logo: '/gyds-coin.jpg',
        gyd_logo:  '/gyd-coin.png',
        gusd_logo: '/gusd-coin.png',
      };
      try {
        const [gydsLogoRes, gydLogoRes, gusdLogoRes] = await Promise.all([
          fetch('/api/config/gyds_logo', { credentials: 'include' }).then(r => r.ok ? r.json() : null),
          fetch('/api/config/gyd_logo',  { credentials: 'include' }).then(r => r.ok ? r.json() : null),
          fetch('/api/config/gusd_logo', { credentials: 'include' }).then(r => r.ok ? r.json() : null),
        ]);
        const gVal  = gydsLogoRes?.configValue ?? gydsLogoRes?.config_value;
        const dVal  = gydLogoRes?.configValue  ?? gydLogoRes?.config_value;
        const uVal  = gusdLogoRes?.configValue ?? gusdLogoRes?.config_value;
        if (gVal?.url) logos['gyds_logo'] = gVal.url;
        if (dVal?.url) logos['gyd_logo']  = dVal.url;
        if (uVal?.url) logos['gusd_logo'] = uVal.url;
      } catch {}

      // Get GYDS price
      const { data: priceData } = await supabase
        .from('token_price')
        .select('price')
        .limit(1)
        .single();

      const gydsPrice = priceData?.price || 0.0000001;

      // Calculate real balances if user is logged in
      let gydsBalance = 0;
      let gydBalance = 0;
      let gusdBalance = 0;

      if (user) {
        const myAddresses = await getUserAddresses(user.id, address ?? undefined, user.email ?? undefined);
        const balances = await computeUserBalances(user.id, myAddresses);
        gydsBalance = balances.gydsBalance;
        gydBalance = balances.gydBalance;
        gusdBalance = balances.gusdBalance;

      }

      const nativeWithLogos: Token[] = [
        { symbol: 'GYDS', name: 'GYDS Native Coin', balance: gydsBalance, price: gydsPrice, address: '0x0000000000000000000000000000000000000000', logo: logos['gyds_logo'] },
        { symbol: 'GYD', name: 'GYD Stablecoin', balance: gydBalance, price: 1.00, address: '0x0000000000000000000000000000000000000001', logo: logos['gyd_logo'] },
        { symbol: 'GUSD', name: 'Guardian Dollar', balance: gusdBalance, price: 1.00, address: '0x0000000000000000000000000000000000000002', logo: logos['gusd_logo'] },
      ];

      const dbTokens: Token[] = (data || []).map(t => ({
        symbol: t.symbol,
        name: t.name,
        balance: user && t.creator_id === user.id ? t.total_supply : 0,
        price: 0.01,
        address: t.address,
        logo: t.logo_url || undefined,
      }));

      // Merge native + DB tokens, avoiding duplicates
      const merged = [...nativeWithLogos];
      dbTokens.forEach(t => {
        if (!merged.find(m => m.symbol === t.symbol)) {
          merged.push(t);
        }
      });
      setAllTokens(merged);
      setPayToken(prev => merged.find(m => m.symbol === prev.symbol) || prev);
      setReceiveToken(prev => merged.find(m => m.symbol === prev.symbol) || prev);
    };

    loadTokens();

    const channel = supabase
      .channel('swap-tokens')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tokens' }, () => loadTokens())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => loadTokens())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'token_operations' }, () => loadTokens())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const handleSwapTokens = () => {
    const temp = payToken;
    setPayToken(receiveToken);
    setReceiveToken(temp);
    setPayAmount(receiveAmount);
    setReceiveAmount(payAmount);
  };

  const handlePayAmountChange = (value: string) => {
    setPayAmount(value);
    const amt = parseFloat(value);
    if (amt > 0) {
      // Try real AMM math from reserves if a pair exists
      const pairKey = `${payToken.symbol}-${receiveToken.symbol}` as keyof typeof CONTRACT_ADDRESSES.mainnet.Pairs;
      const pairAddr = CONTRACT_ADDRESSES.mainnet.Pairs[pairKey];
      if (pairAddr && pairAddr !== '0x0000000000000000000000000000000000000000') {
        // Will be async — for now use price-based fallback; swap quote loads on focus
        const rate = payToken.price / receiveToken.price;
        const received = amt * rate * (SWAP_FEE_NUMERATOR / SWAP_FEE_DENOMINATOR);
        setReceiveAmount(received.toFixed(6));
      } else {
        const rate = payToken.price / receiveToken.price;
        const received = amt * rate * (SWAP_FEE_NUMERATOR / SWAP_FEE_DENOMINATOR);
        setReceiveAmount(received.toFixed(6));
      }
    } else {
      setReceiveAmount('');
    }
  };

  const handleReceiveAmountChange = (value: string) => {
    setReceiveAmount(value);
    const amt = parseFloat(value);
    if (amt > 0) {
      const rate = receiveToken.price / payToken.price;
      const needed = amt * rate / (SWAP_FEE_NUMERATOR / SWAP_FEE_DENOMINATOR);
      setPayAmount(needed.toFixed(6));
    } else {
      setPayAmount('');
    }
  };

  const payValue = parseFloat(payAmount || '0') * payToken.price;
  const receiveValue = parseFloat(receiveAmount || '0') * receiveToken.price;
  const exchangeRate = useMemo(() => payToken.price / receiveToken.price, [payToken.price, receiveToken.price]);
  const fee = payValue * (1 - SWAP_FEE_NUMERATOR / SWAP_FEE_DENOMINATOR);

  const executeSwap = async () => {
    if (!user || !effectiveAddress) {
      toast({ title: 'Login Required', description: 'Sign in to trade.', variant: 'destructive' });
      return;
    }

    const amount = parseFloat(payAmount);
    const receiveAmt = parseFloat(receiveAmount || '0');
    if (!amount || amount <= 0) return;

    if (amount > payToken.balance) {
      toast({
        title: 'Insufficient Balance',
        description: `You only have ${payToken.balance.toFixed(6)} ${payToken.symbol}, but tried to swap ${amount}.`,
        variant: 'destructive',
      });
      return;
    }

    setIsSwapping(true);

    try {
      // ── Enforce token purchase limits ──
      if (receiveToken.address && !receiveToken.address.startsWith('0x000000000000000000000000000000000000000')) {
        // Get per-token limits
        const { data: limitsConfig } = await supabase
          .from('admin_config')
          .select('config_value')
          .eq('config_key', `token_limits_${receiveToken.address}`)
          .maybeSingle();

        // Get global limits as fallback
        const { data: globalConfig } = await supabase
          .from('admin_config')
          .select('config_value')
          .eq('config_key', 'token_factory_pricing')
          .maybeSingle();

        const perTokenLimits = limitsConfig?.config_value as Record<string, number> | null;
        const globalLimits = globalConfig?.config_value as Record<string, number> | null;

        // Use per-token if set, otherwise fallback to global (0 = unlimited)
        const maxBuy = perTokenLimits?.max_buy_per_wallet || globalLimits?.global_max_buy_per_wallet || 0;
        const dailyLimit = perTokenLimits?.daily_buy_limit || globalLimits?.global_daily_buy_limit || 0;

        // Check wallet cap (only if limit > 0)
        if (maxBuy > 0) {
          const currentHolding = receiveToken.balance || 0;
          if (currentHolding + receiveAmt > maxBuy) {
            toast({
              title: 'Wallet Cap Reached',
              description: `Max holding is ${maxBuy.toLocaleString()} ${receiveToken.symbol}. You already have ${currentHolding.toLocaleString()}.`,
              variant: 'destructive',
            });
            setIsSwapping(false);
            return;
          }
        }

        // Check daily buy limit (only if limit > 0)
        if (dailyLimit > 0) {
          const oneDayAgo = new Date(Date.now() - 86400000).toISOString();
          const { data: recentBuys } = await supabase
            .from('transactions')
            .select('amount')
            .eq('user_id', user.id)
            .eq('to_address', 'swap-pool')
            .eq('status', 'confirmed')
            .gte('created_at', oneDayAgo);

          const totalBoughtToday = (recentBuys || []).reduce((sum, tx) => sum + tx.amount, 0);
          if (totalBoughtToday + receiveAmt > dailyLimit) {
            toast({
              title: 'Daily Limit Reached',
              description: `You can buy max ${dailyLimit.toLocaleString()} ${receiveToken.symbol} per day. Already bought ${totalBoughtToday.toLocaleString()} today.`,
              variant: 'destructive',
            });
            setIsSwapping(false);
            return;
          }
        }
      }

      // Try on-chain GydsSwapRouter first (if deployed)
      const routerAddr = CONTRACT_ADDRESSES.mainnet.Router;
      let txHash: string | null = null;
      if (routerAddr !== '0x0000000000000000000000000000000000000000' && payToken.address && receiveToken.address) {
        const path = buildSwapPath(payToken.address, receiveToken.address);
        const deadline = Math.floor(Date.now() / 1000) + 300; // 5 min deadline
        const amountInWei = BigInt(Math.floor(amount * 1e18)).toString();
        const minOut = BigInt(Math.floor((receiveAmt * 0.995) * 1e18)).toString(); // 0.5% slippage

        try {
          if (payToken.address === '0x0000000000000000000000000000000000000000') {
            // GYDS (native) → token
            txHash = await executeSwapExactGYDSForTokens(amountInWei, minOut, path, address, deadline);
          } else {
            // token → token
            txHash = await executeSwapExactTokensForTokens(amountInWei, minOut, path, address, deadline);
          }
        } catch {
          txHash = null;
        }
      }

      if (txHash) {
        toast({
          title: 'Swap executed on-chain!',
          description: `Tx ${txHash.slice(0, 12)}... confirmed.`,
        });
        setPayAmount('');
        setReceiveAmount('');
        setIsSwapping(false);
        return;
      }

      // Fallback: mempool simulation (until contracts are deployed)
      // skipBalanceCheck=true because we already validated above via computeUserBalances
      const { submitTransaction } = await import('@/lib/mempool');
      const result = await submitTransaction({
        userId: user.id,
        fromAddress: effectiveAddress,
        toAddress: 'swap-pool',
        amount,
        fee: amount * 0.003,
        symbol: payToken.symbol,
        skipBalanceCheck: true,
      });

      toast({
        title: 'Swap submitted to mempool',
        description: `Tx ${(result.txHash ?? '').slice(0, 10)}... pending. ${result.liveNodes} node(s) will mine it into the next block.`,
      });

      setPayAmount('');
      setReceiveAmount('');
    } catch (err: any) {
      toast({
        title: 'Swap Failed',
        description: err.message || 'Transaction could not be completed.',
        variant: 'destructive',
      });
    } finally {
      setIsSwapping(false);
    }
  };

  const canSwap = !!user && !!effectiveAddress && !!payAmount && parseFloat(payAmount) > 0 && !isSwapping;

  return (
    <div className="space-y-4">
      {/* Swap Mode Tabs */}
      <Tabs defaultValue="swap" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="swap" className="gap-2">
            <ArrowUpDown className="h-4 w-4" />
            Swap
          </TabsTrigger>
          <TabsTrigger value="bridge" className="gap-2">
            <Globe className="h-4 w-4" />
            Cross-Chain
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bridge" className="mt-0">
          <CrossChainBridge />
        </TabsContent>

        <TabsContent value="swap" className="mt-0 space-y-4">
      <NetworkStatusBanner />
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
            <span
              className="text-primary cursor-pointer hover:underline"
              onClick={() => handlePayAmountChange(String(payToken.balance / 2))}
            >
              Half
            </span>
            <span
              className="text-primary cursor-pointer hover:underline"
              onClick={() => handlePayAmountChange(String(payToken.balance))}
            >
              Max
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-4">
          <Input
            type="number"
            placeholder="0"
            value={payAmount}
            onChange={(e) => handlePayAmountChange(e.target.value)}
            className="border-0 bg-transparent text-3xl font-light p-0 h-auto focus-visible:ring-0 placeholder:text-muted-foreground/50"
          />
          <TokenSelector
            tokens={allTokens}
            selectedToken={payToken}
            otherToken={receiveToken}
            onSelect={setPayToken}
            open={payOpen}
            onOpenChange={setPayOpen}
          >
            <TokenSelectorButton token={payToken} onClick={() => setPayOpen(true)} />
          </TokenSelector>
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
            onChange={(e) => handleReceiveAmountChange(e.target.value)}
            className="border-0 bg-transparent text-3xl font-light p-0 h-auto focus-visible:ring-0 placeholder:text-muted-foreground/50"
          />
          <TokenSelector
            tokens={allTokens}
            selectedToken={receiveToken}
            otherToken={payToken}
            onSelect={setReceiveToken}
            open={receiveOpen}
            onOpenChange={setReceiveOpen}
          >
            <TokenSelectorButton token={receiveToken} onClick={() => setReceiveOpen(true)} />
          </TokenSelector>
        </div>
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>${receiveValue.toFixed(2)}</span>
          <div className="flex items-center gap-1">
            <Wallet className="h-3 w-3" />
            <span>{receiveToken.balance.toFixed(4)}</span>
          </div>
        </div>
      </div>

      {/* Swap Details */}
      {payAmount && parseFloat(payAmount) > 0 && (
        <div className="rounded-xl border border-border/50 bg-card/30 p-3 space-y-2 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Rate</span>
            <span className="font-mono">1 {payToken.symbol} = {exchangeRate.toFixed(exchangeRate < 1 ? 7 : 4)} {receiveToken.symbol}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Fee (0.3%)</span>
            <span className="font-mono">${fee.toFixed(4)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Slippage</span>
            <span className="font-mono">{slippage}%</span>
          </div>
        </div>
      )}

      {/* Trade Button */}
      <Button
        className="w-full h-14 text-lg font-semibold bg-amber-600/80 hover:bg-amber-600 text-foreground"
        disabled={!canSwap}
        onClick={executeSwap}
      >
        {isSwapping ? (
          <span className="flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Swapping...</span>
        ) : !user ? (
          'Sign In to Trade'
        ) : (
          'Trade'
        )}
      </Button>

      {/* Available Tokens */}
      <div className="space-y-2 pt-4">
        <h3 className="text-sm font-medium text-muted-foreground px-1">Available Tokens</h3>
        {allTokens.map((token) => (
          <div
            key={token.symbol}
            className="flex items-center justify-between p-3 rounded-xl hover:bg-secondary/50 cursor-pointer transition-colors"
            onClick={() => { setPayToken(token); }}
          >
            <div className="flex items-center gap-3">
              {token.logo ? (
                <img src={token.logo} alt={token.symbol} className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold",
                  token.symbol === 'GYD' ? "bg-gradient-to-br from-blue-500 to-cyan-500" :
                  token.symbol === 'GYDS' ? "bg-gradient-to-br from-primary to-primary/50" :
                  "bg-gradient-to-br from-amber-500 to-amber-600 text-black"
                )}>
                  {token.symbol[0]}
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{token.symbol}</span>
                  <span className="text-muted-foreground text-sm">{token.name}</span>
                </div>
                {token.address && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono bg-secondary/50 px-2 py-0.5 rounded">
                      {token.address.slice(0, 6)}...{token.address.slice(-4)}
                    </span>
                    <Copy className="h-3 w-3" />
                    <ExternalLink className="h-3 w-3" />
                  </div>
                )}
              </div>
            </div>
            <span className="font-mono">${token.price < 1 ? token.price.toFixed(7) : token.price.toFixed(2)}</span>
          </div>
        ))}
      </div>
      {/* Recent Swaps History */}
      <RecentSwaps />
        </TabsContent>
      </Tabs>
    </div>
  );
};
