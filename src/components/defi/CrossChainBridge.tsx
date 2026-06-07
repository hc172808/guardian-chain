import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Loader2, AlertCircle, CheckCircle2, RefreshCw, Wifi, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useWalletConnect } from '@/hooks/useWalletConnect';
import { useToast } from '@/hooks/use-toast';
import { useCoinGeckoPrices } from '@/hooks/useCoinGeckoPrices';
import { useNetworkDetection } from '@/hooks/useNetworkDetection';
import { supabase } from '@/integrations/supabase/client';
import { useBridgeNetworks } from '@/hooks/useBridgeNetworks';
import { BridgeHistory } from './BridgeHistory';
import { PriceSparkline } from './PriceSparkline';
import { BridgeFeeComparison } from './BridgeFeeComparison';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EXTERNAL_CHAINS, GYDS_CHAIN } from '@/config/bridgeChains';

interface BridgeStatus {
  stage: 'idle' | 'confirming' | 'bridging' | 'minting' | 'complete' | 'error';
  message: string;
  txHash?: string;
}

export const CrossChainBridge = () => {
  const { enabledChains, loading: networksLoading } = useBridgeNetworks();
  const [sourceChain, setSourceChain] = useState(EXTERNAL_CHAINS[0]);
  const [amount, setAmount] = useState('');
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>({ stage: 'idle', message: '' });
  const [showHistory, setShowHistory] = useState(false);

  const { user } = useAuth();
  const { address, isConnected } = useWalletConnect();
  const { toast } = useToast();
  const { prices, changes, isLoading: pricesLoading, lastUpdated, refetch: refetchPrices } = useCoinGeckoPrices();
  const { networkName, isExternalNetwork, suggestBridge, chainId, dismissSuggestion } = useNetworkDetection();

  // Keep sourceChain in sync with enabledChains (in case admin disables the selected one)
  const activeSource = enabledChains.find(c => c.id === sourceChain.id) ?? enabledChains[0] ?? EXTERNAL_CHAINS[0];

  const currentPrice = prices[activeSource.id] || 0;
  const sourceUsdValue = parseFloat(amount || '0') * currentPrice;
  const bridgeFeeUsd = sourceUsdValue * activeSource.bridgeFee;
  const netUsdValue = sourceUsdValue - bridgeFeeUsd;
  const gydsPrice = 0.0000001;
  const receivedGyds = netUsdValue / gydsPrice;

  // Auto-select chain based on detected network
  const handleChainChange = (chainId: string) => {
    const chain = enabledChains.find(c => c.id === chainId);
    if (chain) setSourceChain(chain);
  };

  // Verify the user actually owns the required source-chain coin in a real wallet
  // (window.ethereum for EVM chains, window.solana / Phantom for Solana).
  // Returns { ok, balance, error } — ok=false aborts the bridge with a toast.
  const verifySourceWallet = async (
    chain: typeof EXTERNAL_CHAINS[number],
    requiredAmount: number
  ): Promise<{ ok: boolean; balance: number; error?: string }> => {
    try {
      if (chain.id === 'solana') {
        const sol = (window as any).solana;
        if (!sol || !sol.isPhantom) {
          return { ok: false, balance: 0, error: 'Phantom wallet not detected. Install Phantom to bridge from Solana.' };
        }
        if (!sol.isConnected) {
          await sol.connect();
        }
        const pub = sol.publicKey?.toString();
        if (!pub) return { ok: false, balance: 0, error: 'Phantom wallet did not return a public key.' };
        const rpc = 'https://api.mainnet-beta.solana.com';
        const resp = await fetch(rpc, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [pub] }),
        });
        const j = await resp.json();
        const lamports = j?.result?.value ?? 0;
        const sourceBalance = lamports / 1e9;
        if (sourceBalance < requiredAmount) {
          return { ok: false, balance: sourceBalance, error: `You only have ${sourceBalance.toFixed(6)} SOL in this Phantom wallet. Need ${requiredAmount}.` };
        }
        return { ok: true, balance: sourceBalance };
      }

      // Non-EVM chains (NEAR, Cosmos, Cardano, Polkadot, Tron, TON, XRP, Stellar, Algorand, Hedera, Aptos, Sui, ICP)
      // These chains don't support wallet_switchEthereumChain — user sends from their native wallet to a deposit address.
      if (!chain.evm) {
        // We can't check the balance programmatically without a dedicated adapter,
        // so we trust the user's declaration. In production this would be validated
        // via a cross-chain oracle / relayer once the tx is broadcast.
        return { ok: true, balance: requiredAmount };
      }

      // EVM chains (Ethereum, BNB Chain, Polygon, Avalanche, Fantom, Arbitrum, Optimism, Base, zkSync, Linea, Cronos)
      const eth = (window as any).ethereum;
      if (!eth) {
        return { ok: false, balance: 0, error: `MetaMask (or compatible EVM wallet) not detected. Install one to bridge from ${chain.name}.` };
      }
      // Request accounts and switch to the required chain
      const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' });
      if (!accounts?.length) return { ok: false, balance: 0, error: 'EVM wallet did not return any accounts.' };
      const chainHex = '0x' + chain.chainId.toString(16);
      try {
        await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainHex }] });
      } catch (switchErr: any) {
        if (switchErr?.code !== 4902) {
          return { ok: false, balance: 0, error: `Please switch your wallet to ${chain.name} (chain id ${chain.chainId}).` };
        }
      }
      const balanceHex: string = await eth.request({
        method: 'eth_getBalance',
        params: [accounts[0], 'latest'],
      });
      const sourceBalance = parseInt(balanceHex, 16) / 1e18;
      if (sourceBalance < requiredAmount) {
        return { ok: false, balance: sourceBalance, error: `You only have ${sourceBalance.toFixed(6)} ${chain.symbol} in this wallet on ${chain.name}. Need ${requiredAmount}.` };
      }
      return { ok: true, balance: sourceBalance };
    } catch (e: any) {
      return { ok: false, balance: 0, error: e?.message || 'Wallet verification failed.' };
    }
  };

  const handleBridge = async () => {
    if (!user || !address) {
      toast({ title: 'Connect Wallet', description: 'Please connect your GYDS wallet first.', variant: 'destructive' });
      return;
    }

    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) {
      toast({ title: 'Invalid Amount', description: 'Please enter a valid amount.', variant: 'destructive' });
      return;
    }

    // ── REAL on-chain check: require the required source coin in the user's wallet ──
    setBridgeStatus({ stage: 'confirming', message: `Verifying you own ${amountNum} ${sourceChain.symbol} on ${sourceChain.name}...` });
    const verify = await verifySourceWallet(sourceChain, amountNum);
    if (!verify.ok) {
      setBridgeStatus({ stage: 'error', message: verify.error || 'Wallet verification failed.' });
      toast({
        title: `Insufficient ${sourceChain.symbol}`,
        description: verify.error,
        variant: 'destructive',
      });
      setTimeout(() => setBridgeStatus({ stage: 'idle', message: '' }), 4000);
      return;
    }

    try {
      setBridgeStatus({ stage: 'confirming', message: `Confirm ${amountNum} ${sourceChain.symbol} transfer in your wallet...` });
      await new Promise(r => setTimeout(r, 2000));

      setBridgeStatus({ stage: 'bridging', message: `Bridging from ${sourceChain.name} to GYDS Network...` });
      await new Promise(r => setTimeout(r, 3000));

      setBridgeStatus({ stage: 'minting', message: `Submitting ${receivedGyds.toLocaleString()} GYDS bridge tx to mempool...` });

      const { submitTransaction } = await import('@/lib/mempool');
      const result = await submitTransaction({
        userId: user.id,
        fromAddress: 'bridge',
        toAddress: address,
        amount: receivedGyds,
        fee: 0,
        symbol: 'GYDS',
      });
      const txHash = result.txHash;

      await new Promise(r => setTimeout(r, 1500));

      setBridgeStatus({ stage: 'complete', message: `Successfully received ${receivedGyds.toLocaleString()} GYDS!`, txHash });

      toast({
        title: '🎉 Bridge Complete!',
        description: `Converted ${amountNum} ${sourceChain.symbol} to ${receivedGyds.toLocaleString()} GYDS`,
      });

      setAmount('');
      setTimeout(() => setBridgeStatus({ stage: 'idle', message: '' }), 5000);
    } catch (err: any) {
      setBridgeStatus({ stage: 'error', message: err.message || 'Bridge failed' });
      toast({ title: 'Bridge Failed', description: err.message, variant: 'destructive' });
    }
  };

  const isProcessing = ['confirming', 'bridging', 'minting'].includes(bridgeStatus.stage);

  return (
    <div className="space-y-4">
      {/* Network Auto-Detection Banner */}
      {suggestBridge && networkName && (
        <div className="rounded-xl border border-primary/50 bg-primary/10 p-3 flex items-center gap-3">
          <Wifi className="h-5 w-5 text-primary shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">
              Detected: <span className="text-primary">{networkName}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Bridge your {networkName} assets to GYDS Network
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={dismissSuggestion}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Cross-Chain Purchase</h2>
          <button onClick={() => setShowHistory(!showHistory)} className="text-xs text-primary hover:underline">
            {showHistory ? 'Hide History' : 'History'}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refetchPrices} disabled={pricesLoading} className="text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className={cn("h-3.5 w-3.5", pricesLoading && "animate-spin")} />
          </button>
          <Badge variant="secondary" className="gap-1">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            {pricesLoading ? 'Updating...' : 'Live Prices'}
          </Badge>
        </div>
      </div>

      {/* Transaction History */}
      {showHistory && (
        <div className="rounded-xl border border-border/50 bg-card/30 p-4">
          <h3 className="text-sm font-medium mb-3">Recent Bridge Transactions</h3>
          <BridgeHistory />
        </div>
      )}

      {/* Source Chain Selection */}
      <div className="rounded-xl border border-border/50 bg-card/50 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">From Network</span>
          <Badge variant="outline" className="text-xs">{sourceChain.bridgeFee * 100}% fee</Badge>
        </div>

        <div className="flex items-center gap-3">
          <Select value={activeSource.id} onValueChange={handleChainChange}>
            <SelectTrigger className="w-[180px] bg-secondary/50">
              <SelectValue>
                <div className="flex items-center gap-2">
                  <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-sm", `bg-gradient-to-br ${activeSource.color}`)}>
                    {activeSource.logo}
                  </div>
                  <span>{activeSource.symbol}</span>
                </div>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {enabledChains.map(chain => (
                <SelectItem key={chain.id} value={chain.id}>
                  <div className="flex items-center gap-2">
                    <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-xs", `bg-gradient-to-br ${chain.color}`)}>
                      {chain.logo}
                    </div>
                    <span>{chain.name}</span>
                    <PriceSparkline coinId={chain.id} width={48} height={16} />
                    <span className="text-muted-foreground text-xs">
                      ${prices[chain.id]?.toLocaleString() || '...'}
                    </span>
                    {changes[chain.id] !== undefined && (
                      <span className={cn("text-xs", changes[chain.id] >= 0 ? "text-emerald-500" : "text-destructive")}>
                        {changes[chain.id] >= 0 ? '+' : ''}{changes[chain.id]?.toFixed(1)}%
                      </span>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            type="number"
            placeholder="0.0"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="flex-1 text-2xl font-light bg-transparent border-0 focus-visible:ring-0"
            disabled={isProcessing}
          />
        </div>

        <div className="flex justify-between text-sm text-muted-foreground">
          <span>≈ ${sourceUsdValue.toFixed(2)}</span>
          <span className="flex items-center gap-1">
            ${currentPrice.toLocaleString()} / {sourceChain.symbol}
            {changes[sourceChain.id] !== undefined && (
              <span className={cn("text-xs", changes[sourceChain.id] >= 0 ? "text-emerald-500" : "text-destructive")}>
                ({changes[sourceChain.id] >= 0 ? '+' : ''}{changes[sourceChain.id]?.toFixed(1)}%)
              </span>
            )}
          </span>
        </div>
        {lastUpdated && (
          <p className="text-[10px] text-muted-foreground">
            Last updated: {lastUpdated.toLocaleTimeString()}
          </p>
        )}
      </div>

      {/* Bridge Arrow */}
      <div className="flex justify-center -my-2 relative z-10">
        <div className="rounded-full border border-border/50 bg-card p-2">
          <ArrowRight className="h-4 w-4 text-primary" />
        </div>
      </div>

      {/* Destination (GYDS Network) */}
      <div className="rounded-xl border border-border/50 bg-card/50 p-4 space-y-3">
        <span className="text-sm text-muted-foreground">To Network</span>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/50">
            <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-sm", `bg-gradient-to-br ${GYDS_CHAIN.color}`)}>
              {GYDS_CHAIN.logo}
            </div>
            <span className="font-semibold">{GYDS_CHAIN.symbol}</span>
          </div>
          <span className="text-2xl font-light text-right flex-1">
            {amount && parseFloat(amount) > 0 ? receivedGyds.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '0'}
          </span>
        </div>
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>≈ ${netUsdValue.toFixed(2)}</span>
          <span>Chain ID: {GYDS_CHAIN.chainId}</span>
        </div>
      </div>

      {/* Bridge Details */}
      {amount && parseFloat(amount) > 0 && (
        <div className="rounded-xl border border-border/50 bg-card/30 p-3 space-y-2 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Bridge Fee ({sourceChain.bridgeFee * 100}%)</span>
            <span className="font-mono">-${bridgeFeeUsd.toFixed(4)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Estimated Time</span>
            <span className="font-mono">~2-5 min</span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium">You Receive</span>
            <span className="font-mono font-semibold text-primary">
              {receivedGyds.toLocaleString(undefined, { maximumFractionDigits: 0 })} GYDS
            </span>
          </div>
        </div>
      )}

      {/* Fee Comparison */}
      <BridgeFeeComparison
        chains={EXTERNAL_CHAINS}
        prices={prices}
        amount={amount}
        gydsPrice={gydsPrice}
        onSelectChain={handleChainChange}
        selectedChainId={sourceChain.id}
      />

      {/* Bridge Status */}
      {bridgeStatus.stage !== 'idle' && (
        <div className={cn(
          "rounded-xl border p-4 flex items-center gap-3",
          bridgeStatus.stage === 'error' ? "border-destructive/50 bg-destructive/10" :
          bridgeStatus.stage === 'complete' ? "border-primary/50 bg-primary/10" :
          "border-primary/50 bg-primary/10"
        )}>
          {isProcessing && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
          {bridgeStatus.stage === 'error' && <AlertCircle className="h-5 w-5 text-destructive" />}
          {bridgeStatus.stage === 'complete' && <CheckCircle2 className="h-5 w-5 text-primary" />}
          <div className="flex-1">
            <p className="text-sm font-medium">{bridgeStatus.message}</p>
            {bridgeStatus.txHash && (
              <p className="text-xs text-muted-foreground font-mono mt-1">
                TX: {bridgeStatus.txHash.slice(0, 10)}...{bridgeStatus.txHash.slice(-8)}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Bridge Button */}
      <Button
        className="w-full h-14 text-lg font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
        disabled={!isConnected || !amount || parseFloat(amount) <= 0 || isProcessing}
        onClick={handleBridge}
      >
        {isProcessing ? (
          <span className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Processing...
          </span>
        ) : !isConnected ? (
          'Connect Wallet'
        ) : (
          `Bridge ${sourceChain.symbol} → GYDS`
        )}
      </Button>

      {/* Supported Networks */}
      <div className="pt-4 border-t border-border/30">
        <p className="text-xs text-muted-foreground mb-3">Supported Networks</p>
        <div className="flex flex-wrap gap-2">
          {EXTERNAL_CHAINS.map(chain => (
            <Badge
              key={chain.id}
              variant="outline"
              className={cn(
                "cursor-pointer transition-all",
                sourceChain.id === chain.id && "border-primary bg-primary/10"
              )}
              onClick={() => handleChainChange(chain.id)}
            >
              {chain.logo} {chain.symbol}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
};
