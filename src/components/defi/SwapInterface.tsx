import { useState, useEffect, useMemo, useRef, forwardRef } from 'react';
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
import {
  getTokenBalance,
  getSwapQuoteExactIn,
  executeSwapExactTokensForTokens,
  executeSwapExactGYDSForTokens,
  executeSwapExactTokensForGYDS,
} from '@/lib/swapContract';
import {
  applyRuntimeContractAddresses,
  CONTRACT_ADDRESSES,
  isConfiguredContractAddress,
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

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// GYD and USDT are included only after real ERC-20 addresses are configured.
const NATIVE_TOKENS: Token[] = [
  { symbol: 'GYDS', name: 'GYDS Native Coin', balance: 0, price: 0.0000001, address: ZERO_ADDRESS, logo: '/gyds-coin.jpg' },
];

const UNCONFIGURED_TOKEN: Token = {
  symbol: 'USDT',
  name: 'USDT contract not configured',
  balance: 0,
  price: 1,
  address: ZERO_ADDRESS,
};

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
  const [receiveToken, setReceiveToken] = useState<Token>(UNCONFIGURED_TOKEN);
  const [slippage, setSlippage] = useState(0.5);
  const [isSwapping, setIsSwapping] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [swapContractsConfigured, setSwapContractsConfigured] = useState(false);
  const [quoteUnavailable, setQuoteUnavailable] = useState(false);
  const quoteSequence = useRef(0);

  const { address, isConnected } = useWalletConnect();
  const { user } = useAuth();
  const { toast } = useToast();
  // This address is useful for balance display, but on-chain swaps still need
  // a browser wallet signer from window.ethereum.
  const effectiveAddress = address || user?.walletAddress || null;

  // Load tokens from database + coin logos + real balances
  useEffect(() => {
    const loadTokens = async () => {
      let dexAddresses: Record<string, string> = {};
      let dexChainId = 0;
      try {
        const dexRes = await fetch('/api/dex/config', { credentials: 'include', cache: 'no-store' });
        if (dexRes.ok) {
          const dexConfig = await dexRes.json();
          dexAddresses = dexConfig.addresses ?? {};
          dexChainId = Number(dexConfig.chainId);
          applyRuntimeContractAddresses(dexAddresses);
        }
      } catch {}
      const coreContractsReady = dexChainId === 198282 && [
        dexAddresses.Router,
        dexAddresses.Factory,
        dexAddresses.WGYDS,
      ].every(isConfiguredContractAddress);
      setSwapContractsConfigured(coreContractsReady);

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
      let usdtBalance = 0;
      if (effectiveAddress) {
        const [nativeBalance, gydTokenBalance, usdtTokenBalance] = await Promise.all([
          getTokenBalance(ZERO_ADDRESS, effectiveAddress),
          isConfiguredContractAddress(dexAddresses.GYD)
            ? getTokenBalance(dexAddresses.GYD, effectiveAddress)
            : Promise.resolve('0'),
          isConfiguredContractAddress(dexAddresses.USDT)
            ? getTokenBalance(dexAddresses.USDT, effectiveAddress)
            : Promise.resolve('0'),
        ]);
        gydsBalance = Number(nativeBalance) || 0;
        gydBalance = Number(gydTokenBalance) || 0;
        usdtBalance = Number(usdtTokenBalance) || 0;
      }

      const nativeWithLogos: Token[] = [
        { symbol: 'GYDS', name: 'GYDS Native Coin', balance: gydsBalance, price: gydsPrice, address: ZERO_ADDRESS, logo: logos['gyds_logo'] },
        ...(isConfiguredContractAddress(dexAddresses.GYD)
          ? [{ symbol: 'GYD', name: 'GYD Stablecoin', balance: gydBalance, price: 1, address: dexAddresses.GYD, logo: logos['gyd_logo'] }]
          : []),
        ...(isConfiguredContractAddress(dexAddresses.USDT)
          ? [{ symbol: 'USDT', name: 'Tether USD', balance: usdtBalance, price: 1, address: dexAddresses.USDT }]
          : []),
      ];

      const dbTokens: Token[] = await Promise.all((data || []).map(async t => ({
        symbol: t.symbol,
        name: t.name,
        balance: effectiveAddress && isConfiguredContractAddress(t.address)
          ? Number(await getTokenBalance(t.address, effectiveAddress)) || 0
          : 0,
        price: 0.01,
        address: t.address,
        logo: t.logo_url || undefined,
      })));

      // Merge native + DB tokens, avoiding duplicates
      const merged = [...nativeWithLogos];
      dbTokens.forEach(t => {
        if (!merged.find(m => m.symbol === t.symbol)) {
          merged.push(t);
        }
      });
      setAllTokens(merged);
      setPayToken(prev => merged.find(m => m.symbol === prev.symbol) || prev);
      setReceiveToken(prev => merged.find(m => m.symbol === prev.symbol) || merged.find(m => m.symbol === 'USDT') || UNCONFIGURED_TOKEN);
    };

    loadTokens();

    const channel = supabase
      .channel('swap-tokens')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tokens' }, () => loadTokens())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => loadTokens())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'token_operations' }, () => loadTokens())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, address]);

  const handleSwapTokens = () => {
    const temp = payToken;
    setPayToken(receiveToken);
    setReceiveToken(temp);
    setPayAmount(receiveAmount);
    setReceiveAmount(payAmount);
  };

  const handlePayAmountChange = (value: string) => {
    setPayAmount(value);
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

  useEffect(() => {
    const sequence = ++quoteSequence.current;
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setReceiveAmount('');
      setQuoteUnavailable(false);
      return;
    }

    if (!swapContractsConfigured) {
      const estimate = amount * (payToken.price / receiveToken.price) *
        (SWAP_FEE_NUMERATOR / SWAP_FEE_DENOMINATOR);
      setReceiveAmount(Number.isFinite(estimate) ? estimate.toFixed(6) : '');
      setQuoteUnavailable(true);
      return;
    }

    let active = true;
    setQuoteUnavailable(false);
    const timer = window.setTimeout(async () => {
      const quote = await getSwapQuoteExactIn(
        payAmount,
        payToken.address ?? '',
        receiveToken.address ?? '',
      );
      if (!active || sequence !== quoteSequence.current) return;
      if (!quote) {
        setReceiveAmount('');
        setQuoteUnavailable(true);
        return;
      }
      setReceiveAmount(Number(quote.amountOut).toFixed(6));
      setQuoteUnavailable(false);
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [payAmount, payToken, receiveToken, swapContractsConfigured]);

  const payValue = parseFloat(payAmount || '0') * payToken.price;
  const receiveValue = parseFloat(receiveAmount || '0') * receiveToken.price;
  const exchangeRate = useMemo(() => payToken.price / receiveToken.price, [payToken.price, receiveToken.price]);
  const fee = payValue * (1 - SWAP_FEE_NUMERATOR / SWAP_FEE_DENOMINATOR);

  const executeSwap = async () => {
    if (!swapContractsConfigured) {
      toast({
        title: 'Swaps are not deployed',
        description: 'The GydsSwap router, factory, and wrapped GYDS addresses are not configured for Chain ID 198282.',
        variant: 'destructive',
      });
      return;
    }

    if (!user || !effectiveAddress) {
      toast({ title: 'Login Required', description: 'Sign in to trade.', variant: 'destructive' });
      return;
    }

    if (!payToken.address || !receiveToken.address ||
        (payToken.address === ZERO_ADDRESS && !isConfiguredContractAddress(CONTRACT_ADDRESSES.mainnet.WGYDS)) ||
        (receiveToken.address === ZERO_ADDRESS && !isConfiguredContractAddress(CONTRACT_ADDRESSES.mainnet.WGYDS))) {
      toast({ title: 'Token contract is not configured', description: 'Set valid token contract addresses in Admin → Server Config → DeFi Contracts.', variant: 'destructive' });
      return;
    }
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;

    setIsSwapping(true);

    try {
      const quote = await getSwapQuoteExactIn(payAmount, payToken.address, receiveToken.address);
      if (!quote) {
        throw new Error('There is no on-chain liquidity for this pair yet. Create the pair and add real liquidity before trading.');
      }
      const receiveAmt = Number(quote.amountOut);

      const chainBalance = Number(await getTokenBalance(payToken.address, effectiveAddress));
      if (!Number.isFinite(chainBalance) || amount > chainBalance + 1e-12) {
        throw new Error(`Insufficient on-chain ${payToken.symbol} balance. Available: ${Number.isFinite(chainBalance) ? chainBalance.toFixed(6) : '0.000000'}.`);
      }

      // ── Enforce token purchase limits ──
      if (receiveToken.address !== ZERO_ADDRESS) {
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

      // Submit with the router's fresh on-chain quote and the user's slippage.
      const routerAddr = CONTRACT_ADDRESSES.mainnet.Router;
      let txHash: string | null = null;
      if (isConfiguredContractAddress(routerAddr)) {
        const slippageBps = Math.min(5000, Math.max(0, Math.round(slippage * 100)));
        const minOut = (BigInt(quote.amountOutRaw) * BigInt(10000 - slippageBps) / 10000n).toString();
        const deadline = Math.floor(Date.now() / 1000) + 300;
        if (payToken.address === ZERO_ADDRESS) {
          txHash = await executeSwapExactGYDSForTokens(quote.amountInRaw, minOut, quote.path, effectiveAddress, deadline);
        } else if (receiveToken.address === ZERO_ADDRESS) {
          txHash = await executeSwapExactTokensForGYDS(quote.amountInRaw, minOut, quote.path, effectiveAddress, deadline);
        } else {
          txHash = await executeSwapExactTokensForTokens(quote.amountInRaw, minOut, quote.path, effectiveAddress, deadline);
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

      throw new Error('The on-chain swap transaction was rejected or could not be confirmed. No swap was recorded by this app.');
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

  const selectedTokensConfigured = !!payToken.address && !!receiveToken.address &&
    (payToken.address === ZERO_ADDRESS || isConfiguredContractAddress(payToken.address)) &&
    (receiveToken.address === ZERO_ADDRESS || isConfiguredContractAddress(receiveToken.address)) &&
    payToken.address.toLowerCase() !== receiveToken.address.toLowerCase();
  const canSwap = swapContractsConfigured && selectedTokensConfigured &&
    !!user && !!effectiveAddress && !!payAmount && !!receiveAmount &&
    !quoteUnavailable && parseFloat(payAmount) > 0 && !isSwapping;

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

      {!swapContractsConfigured && (
        <div role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
          <p className="font-medium text-amber-400">Swaps are unavailable: GydsSwap is not deployed/configured.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            The displayed output is only an indicative estimate. Deploy the router, factory, and wrapped GYDS contract, then configure real token addresses and liquidity in Admin → Server Config → DeFi Contracts.
          </p>
        </div>
      )}
      {swapContractsConfigured && quoteUnavailable && (
        <div role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
          <p className="font-medium text-amber-400">No live quote for this pair.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Check that both token contracts are configured, the pair was created in GydsSwap Factory, and real liquidity has been added.
          </p>
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
        ) : !swapContractsConfigured ? (
          'Swap Unavailable'
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
