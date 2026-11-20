import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GlassCard } from '@/components/ui/GlassCard';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Droplets } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { loadDeFiTokenCatalog, NATIVE_GYDS_ADDRESS, type DeFiTokenAsset } from '@/lib/defiTokenCatalog';
import {
  applyRuntimeContractAddresses,
  isConfiguredContractAddress,
} from '@/config/contracts';
import {
  executeAddLiquidity,
  executeCreatePair,
  getTokenDecimals,
} from '@/lib/swapContract';
import { ethers } from 'ethers';

interface CreatePoolProps {
  onBack: () => void;
}

export const CreatePool = ({ onBack }: CreatePoolProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [availableTokens, setAvailableTokens] = useState<DeFiTokenAsset[]>([{
    symbol: 'GYDS',
    name: 'GYDS Native Coin',
    address: NATIVE_GYDS_ADDRESS,
    price: 0.0000001,
    source: 'native',
  }]);
  const [dexConfig, setDexConfig] = useState<{ chainId: number; addresses: Record<string, string> } | null>(null);
  const [walletTokens, setWalletTokens] = useState<string[]>([]);
  const [form, setForm] = useState({
    tokenA: 'GYDS',
    tokenB: '',
    initialLiquidityA: '',
    initialLiquidityB: '',
  });

  useEffect(() => {
    const loadTokens = async () => {
      try {
        const dexConfig = await api.get('/api/dex/config').catch((error) => {
          console.error('[create-pool] Could not load DEX contract config:', error);
          return { chainId: 0, addresses: {} };
        });
        applyRuntimeContractAddresses(dexConfig.addresses ?? {});
        setDexConfig({
          chainId: Number(dexConfig.chainId),
          addresses: dexConfig.addresses ?? {},
        });
        const catalog = await loadDeFiTokenCatalog(dexConfig);
        setAvailableTokens(catalog);
        setWalletTokens(user
          ? catalog.filter(token => token.creatorId === user.id).map(token => token.symbol)
          : []);
      } catch (error) {
        console.error('[create-pool] Could not load the mainnet token catalog:', error);
        toast({
          title: 'Could not load tokens',
          description: 'The server token list could not be loaded. Refresh the page and try again.',
          variant: 'destructive',
        });
      }
    };
    void loadTokens();
  }, [user, toast]);

  const allTokens = availableTokens.map(token => token.symbol);
  const contractsReady = Number(dexConfig?.chainId) === 198282 &&
    isConfiguredContractAddress(dexConfig?.addresses?.Factory) &&
    isConfiguredContractAddress(dexConfig?.addresses?.WGYDS);

  const handleSubmit = async () => {
    if (!user) {
      toast({ title: 'Login Required', description: 'Please sign in first.', variant: 'destructive' });
      return;
    }
    if (!form.tokenA || !form.tokenB || form.tokenA === form.tokenB) {
      toast({ title: 'Invalid pair', description: 'Select two different tokens.', variant: 'destructive' });
      return;
    }
    if (!contractsReady) {
      toast({
        title: 'GydsSwap is not configured',
        description: 'Configure the mainnet Factory and WGYDS contract addresses in Admin → Server Config → DeFi Contracts first.',
        variant: 'destructive',
      });
      return;
    }
    const amountA = Number(form.initialLiquidityA || 0);
    const amountB = Number(form.initialLiquidityB || 0);
    if (!Number.isFinite(amountA) || !Number.isFinite(amountB) || amountA < 0 || amountB < 0 ||
        ((amountA > 0) !== (amountB > 0))) {
      toast({
        title: 'Invalid initial liquidity',
        description: 'Leave both amounts empty to create the pair only, or enter a positive amount for both tokens.',
        variant: 'destructive',
      });
      return;
    }
    if (amountA > 0 && !isConfiguredContractAddress(dexConfig?.addresses?.Router)) {
      toast({
        title: 'GydsSwap Router is not configured',
        description: 'Configure the mainnet Router address before adding initial liquidity.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const tokenAMeta = availableTokens.find(t => t.symbol === form.tokenA);
      const tokenBMeta = availableTokens.find(t => t.symbol === form.tokenB);
      if (!tokenAMeta || !tokenBMeta) throw new Error('Token details are missing. Reload the token list and try again.');
      const contractAddress = (token: DeFiTokenAsset) =>
        token.source === 'native' ? dexConfig!.addresses.WGYDS : token.address;
      const tokenAAddress = contractAddress(tokenAMeta);
      const tokenBAddress = contractAddress(tokenBMeta);
      if (!isConfiguredContractAddress(tokenAAddress) || !isConfiguredContractAddress(tokenBAddress)) {
        throw new Error('Both tokens need deployed contract addresses before a pool can be created.');
      }

      const pair = await executeCreatePair(
        tokenAAddress,
        tokenBAddress,
        tokenAMeta.source === 'native' ? 'GYDS' : tokenAMeta.symbol,
        tokenBMeta.source === 'native' ? 'GYDS' : tokenBMeta.symbol,
      );
      let liquidityTxHash: string | null = null;
      let liquidityError = '';
      if (amountA > 0 && amountB > 0) {
        try {
          const decimalsA = tokenAMeta.source === 'native' ? 18 : await getTokenDecimals(tokenAAddress);
          const decimalsB = tokenBMeta.source === 'native' ? 18 : await getTokenDecimals(tokenBAddress);
          const amountARaw = ethers.parseUnits(form.initialLiquidityA, decimalsA);
          const amountBRaw = ethers.parseUnits(form.initialLiquidityB, decimalsB);
          const amountAMin = amountARaw * 995n / 1000n;
          const amountBMin = amountBRaw * 995n / 1000n;
          liquidityTxHash = await executeAddLiquidity(
            tokenAMeta.source === 'native' ? NATIVE_GYDS_ADDRESS : tokenAAddress,
            tokenBMeta.source === 'native' ? NATIVE_GYDS_ADDRESS : tokenBAddress,
            amountARaw.toString(),
            amountBRaw.toString(),
            amountAMin.toString(),
            amountBMin.toString(),
            '',
            Math.floor(Date.now() / 1000) + 600,
          );
        } catch (error: any) {
          liquidityError = error?.shortMessage ?? error?.message ?? 'Liquidity transaction failed.';
        }
      }

      const estimatedTvl = amountA * tokenAMeta.price + amountB * tokenBMeta.price;
      try {
        await api.post('/api/liquidity-pools', {
          token_a_symbol: form.tokenA,
          token_b_symbol: form.tokenB,
          token_a_address: tokenAAddress,
          token_b_address: tokenBAddress,
          fee_tier: 0.3,
          tvl: liquidityTxHash ? estimatedTvl : 0,
        });
      } catch (error: any) {
        throw new Error(`The pair exists on-chain at ${pair.pairAddress}, but could not be added to the pool list: ${error.message}`);
      }

      if (liquidityError) {
        toast({
          title: 'Pair created; liquidity was not added',
          description: `${form.tokenA} / ${form.tokenB} exists on-chain. Add liquidity from the pool page. ${liquidityError}`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: pair.txHash ? 'Pool created on-chain' : 'Pool already exists',
          description: liquidityTxHash
            ? `${form.tokenA} / ${form.tokenB} liquidity confirmed (${liquidityTxHash.slice(0, 12)}…).`
            : `${form.tokenA} / ${form.tokenB} pair is ready. Add liquidity before swapping.`,
        });
      }
      onBack();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">Create Liquidity Pool</h1>
      </div>

      <GlassCard className="p-4 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <Droplets className="h-4 w-4 text-primary" /> Token Pair
        </h2>
        {walletTokens.length > 0 && (
          <div className="text-xs text-muted-foreground">
            Your tokens: {walletTokens.join(', ')}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Token A</Label>
            <Select value={form.tokenA} onValueChange={v => setForm(p => ({ ...p, tokenA: v }))}>
              <SelectTrigger className="bg-secondary/30"><SelectValue /></SelectTrigger>
              <SelectContent>
                {allTokens.map(t => (
                  <SelectItem key={t} value={t} disabled={t === form.tokenB}>
                    {t} {walletTokens.includes(t) ? '(owned)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Token B</Label>
            <Select value={form.tokenB} onValueChange={v => setForm(p => ({ ...p, tokenB: v }))}>
              <SelectTrigger className="bg-secondary/30"><SelectValue placeholder="Select token" /></SelectTrigger>
              <SelectContent>
                {allTokens.map(t => (
                  <SelectItem key={t} value={t} disabled={t === form.tokenA}>
                    {t} {walletTokens.includes(t) ? '(owned)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="p-4 space-y-4">
        <h2 className="font-semibold">Swap Fee</h2>
        <p className="text-sm text-muted-foreground">
          GydsSwap currently uses a fixed 0.3% swap fee for every pool.
        </p>
      </GlassCard>

      <GlassCard className="p-4 space-y-4">
        <h2 className="font-semibold">Initial Liquidity</h2>
        <p className="text-xs text-muted-foreground">
          Optional. Enter both amounts to create the pair and add liquidity in separate confirmed transactions. Leave both blank to create an empty pair.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">{form.tokenA} Amount</Label>
            <Input type="number" value={form.initialLiquidityA} onChange={e => setForm(p => ({ ...p, initialLiquidityA: e.target.value }))} placeholder="0" className="bg-secondary/30" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{form.tokenB || 'Token B'} Amount</Label>
            <Input type="number" value={form.initialLiquidityB} onChange={e => setForm(p => ({ ...p, initialLiquidityB: e.target.value }))} placeholder="0" className="bg-secondary/30" />
          </div>
        </div>
      </GlassCard>

      {!contractsReady && (
        <GlassCard className="border-amber-500/30 p-4 text-sm text-amber-300">
          Mainnet GydsSwap Factory and WGYDS addresses are required. No pool will be recorded as live until its on-chain pair is created.
        </GlassCard>
      )}

      <Button
        className="w-full h-14 text-lg font-semibold bg-amber-600/80 hover:bg-amber-600 text-foreground"
        onClick={handleSubmit}
        disabled={loading || !contractsReady || !form.tokenA || !form.tokenB}
      >
        {loading ? 'Confirming on-chain...' : Number(form.initialLiquidityA) > 0 && Number(form.initialLiquidityB) > 0 ? 'Create Pair & Add Liquidity' : 'Create Pair'}
      </Button>
    </div>
  );
};
