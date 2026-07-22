import { useState, useEffect } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { RESERVED_WALLETS, TOKENOMICS } from '@/config/wallets';
import { 
  Flame, 
  Coins, 
  DollarSign, 
  TrendingUp, 
  History,
  Loader2,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';

interface TokenOperation {
  id: string;
  operation_type: 'burn' | 'mint';
  amount: number;
  usdt_amount: number;
  wallet_address: string;
  tx_hash: string | null;
  status: string;
  created_at: string;
}

interface TokenPrice {
  id?: string;
  price: number;
  total_supply: number;
  circulating_supply: number;
  burned_total: number;
}

export const BurnMintManager = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [operations, setOperations] = useState<TokenOperation[]>([]);
  const [tokenPrice, setTokenPrice] = useState<TokenPrice | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  
  const [burnUsdtAmount, setBurnUsdtAmount] = useState('');
  const [mintAmount, setMintAmount] = useState('');
  const [mintAddress, setMintAddress] = useState('');
  const [gusdMintAmount, setGusdMintAmount] = useState('');
  const [gusdMintAddress, setGusdMintAddress] = useState('');
  const [gusdProcessing, setGusdProcessing] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [ops, price] = await Promise.all([
        api.get('/api/token-operations'),
        api.get('/api/token-price'),
      ]);
      setOperations(Array.isArray(ops) ? ops : []);
      if (price) setTokenPrice(price);
    } catch {
      // ignore
    }
    setLoading(false);
  };

  const calculateMintFromBurn = (usdtAmount: number): number => {
    if (!tokenPrice) return 0;
    return usdtAmount / tokenPrice.price;
  };

  const handleBurnUsdt = async () => {
    if (!burnUsdtAmount) {
      toast({ title: 'Enter USDT amount', variant: 'destructive' });
      return;
    }
    const usdtNum = parseFloat(burnUsdtAmount);
    if (isNaN(usdtNum) || usdtNum <= 0) {
      toast({ title: 'Invalid amount', variant: 'destructive' });
      return;
    }
    setProcessing(true);
    const gydsToMint = calculateMintFromBurn(usdtNum);
    const txHash = '0x' + crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 32);
    try {
      await api.post('/api/token-operations', {
        operation_type: 'burn',
        amount: usdtNum,
        usdt_amount: usdtNum,
        wallet_address: RESERVED_WALLETS.burn.address,
        tx_hash: txHash,
        status: 'confirmed',
      });
      await api.post('/api/token-operations', {
        operation_type: 'mint',
        amount: gydsToMint,
        usdt_amount: usdtNum,
        wallet_address: RESERVED_WALLETS.miningPool.address,
        tx_hash: txHash + '-mint',
        status: 'confirmed',
      });
      if (tokenPrice) {
        await api.patch('/api/token-price', {
          circulating_supply: tokenPrice.circulating_supply + gydsToMint,
          burned_total: tokenPrice.burned_total + usdtNum,
        });
      }
      toast({ 
        title: 'Burn & Mint successful!', 
        description: `Burned ${usdtNum} USDT, minted ${gydsToMint.toLocaleString()} GYDS`
      });
      setBurnUsdtAmount('');
      fetchData();
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    }
    setProcessing(false);
  };

  const handleMint = async () => {
    if (!mintAmount || !mintAddress) {
      toast({ title: 'Fill all fields', variant: 'destructive' });
      return;
    }
    const amountNum = parseFloat(mintAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast({ title: 'Invalid amount', variant: 'destructive' });
      return;
    }
    setProcessing(true);
    const txHash = '0x' + crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 32);
    try {
      await api.post('/api/token-operations', {
        operation_type: 'mint',
        amount: amountNum,
        usdt_amount: 0,
        wallet_address: mintAddress,
        tx_hash: txHash,
        status: 'confirmed',
      });
      toast({ title: 'Mint successful!', description: `Minted ${amountNum.toLocaleString()} GYDS` });
      setMintAmount('');
      setMintAddress('');
      fetchData();
    } catch (e: any) {
      toast({ title: 'Mint failed', description: e.message, variant: 'destructive' });
    }
    setProcessing(false);
  };

  const handleMintGusd = async () => {
    if (!gusdMintAmount || !gusdMintAddress) {
      toast({ title: 'Fill all fields', variant: 'destructive' });
      return;
    }
    const amountNum = parseFloat(gusdMintAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast({ title: 'Invalid amount', variant: 'destructive' });
      return;
    }
    setGusdProcessing(true);
    const txHash = '0x' + crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 32);
    try {
      await api.post('/api/token-operations', {
        operation_type: 'mint_gusd',
        amount: amountNum,
        usdt_amount: amountNum,
        wallet_address: gusdMintAddress,
        tx_hash: txHash,
        status: 'confirmed',
      });
      toast({ title: 'Mint successful!', description: `Minted ${amountNum.toLocaleString()} GUSD` });
      setGusdMintAmount('');
      setGusdMintAddress('');
      fetchData();
    } catch (e: any) {
      toast({ title: 'Mint failed', description: e.message, variant: 'destructive' });
    }
    setGusdProcessing(false);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <GlassCard className="p-4 text-center">
          <DollarSign className="h-6 w-6 mx-auto text-primary mb-2" />
          <p className="text-xs text-muted-foreground">GYDS Price</p>
          <p className="text-xl font-bold font-mono">${tokenPrice?.price?.toFixed(7) ?? TOKENOMICS.initialPrice}</p>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <Coins className="h-6 w-6 mx-auto text-neon-emerald mb-2" />
          <p className="text-xs text-muted-foreground">Total Supply</p>
          <p className="text-xl font-bold font-mono">{((tokenPrice?.total_supply || TOKENOMICS.maxSupply) / 1e9).toFixed(1)}B</p>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <TrendingUp className="h-6 w-6 mx-auto text-neon-amber mb-2" />
          <p className="text-xs text-muted-foreground">Circulating</p>
          <p className="text-xl font-bold font-mono">{((tokenPrice?.circulating_supply || 0) / 1e6).toFixed(2)}M</p>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <Flame className="h-6 w-6 mx-auto text-destructive mb-2" />
          <p className="text-xs text-muted-foreground">Total Burned</p>
          <p className="text-xl font-bold font-mono">${(tokenPrice?.burned_total || 0).toLocaleString()}</p>
        </GlassCard>
      </div>

      <Tabs defaultValue="burn" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="burn">Burn USDT</TabsTrigger>
          <TabsTrigger value="mint">Mint GYDS</TabsTrigger>
          <TabsTrigger value="gusd">Mint GUSD</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="burn">
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <Flame className="h-5 w-5 text-destructive" />
              Burn USDT to Mint GYDS
            </h3>
            <div className="space-y-4">
              <div>
                <Label>USDT Amount to Burn</Label>
                <Input type="number" value={burnUsdtAmount} onChange={(e) => setBurnUsdtAmount(e.target.value)} placeholder="1000" />
              </div>
              {burnUsdtAmount && parseFloat(burnUsdtAmount) > 0 && (
                <div className="p-4 rounded-lg bg-neon-emerald/10 border border-neon-emerald/30">
                  <p className="text-sm text-muted-foreground">Will mint:</p>
                  <p className="text-2xl font-bold text-neon-emerald font-mono">
                    {calculateMintFromBurn(parseFloat(burnUsdtAmount)).toLocaleString()} GYDS
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Rate: 1 USDT = {(1 / (tokenPrice?.price || TOKENOMICS.initialPrice)).toLocaleString()} GYDS
                  </p>
                </div>
              )}
              <Button onClick={handleBurnUsdt} disabled={processing} className="w-full gap-2 bg-destructive hover:bg-destructive/80">
                {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4" />}
                Burn & Mint
              </Button>
            </div>
          </GlassCard>
        </TabsContent>

        <TabsContent value="mint">
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <Coins className="h-5 w-5 text-neon-emerald" />
              Direct Mint (Admin Only)
            </h3>
            <div className="space-y-4">
              <div>
                <Label>Amount (GYDS)</Label>
                <Input type="number" value={mintAmount} onChange={(e) => setMintAmount(e.target.value)} placeholder="1000000" />
              </div>
              <div>
                <Label>Destination Address</Label>
                <Input value={mintAddress} onChange={(e) => setMintAddress(e.target.value)} placeholder="0x..." />
                <div className="flex flex-wrap gap-2 mt-2">
                  {Object.entries(RESERVED_WALLETS).map(([key, wallet]) => (
                    <Button key={key} variant="outline" size="sm" onClick={() => setMintAddress(wallet.address)} className="text-xs">
                      {wallet.name}
                    </Button>
                  ))}
                </div>
              </div>
              <Button onClick={handleMint} disabled={processing} className="w-full gap-2">
                {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />}
                Mint GYDS
              </Button>
            </div>
          </GlassCard>
        </TabsContent>

        <TabsContent value="gusd">
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <DollarSign className="h-5 w-5 text-[#0A4FFF]" />
              Mint Guardian Dollar (GUSD) — Admin Only
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              GUSD is the reserve-backed stablecoin pegged 1:1 to USD. Only authorized issuers (admins) may mint.
            </p>
            <div className="space-y-4">
              <div>
                <Label>Amount (GUSD)</Label>
                <Input type="number" value={gusdMintAmount} onChange={(e) => setGusdMintAmount(e.target.value)} placeholder="1000" />
              </div>
              <div>
                <Label>Destination Address</Label>
                <Input value={gusdMintAddress} onChange={(e) => setGusdMintAddress(e.target.value)} placeholder="0x..." />
                <div className="flex flex-wrap gap-2 mt-2">
                  {Object.entries(RESERVED_WALLETS).map(([key, wallet]) => (
                    <Button key={key} variant="outline" size="sm" onClick={() => setGusdMintAddress(wallet.address)} className="text-xs">
                      {wallet.name}
                    </Button>
                  ))}
                </div>
              </div>
              <Button
                onClick={handleMintGusd}
                disabled={gusdProcessing}
                className="w-full gap-2 bg-[#0A4FFF] hover:bg-[#0A4FFF]/80 text-white"
              >
                {gusdProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />}
                Mint GUSD
              </Button>
            </div>
          </GlassCard>
        </TabsContent>

        <TabsContent value="history">
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <History className="h-5 w-5" />
              Operation History
            </h3>
            {loading ? (
              <div className="text-center py-8"><Loader2 className="h-8 w-8 animate-spin mx-auto" /></div>
            ) : operations.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No operations yet</p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {operations.map((op) => (
                  <div key={op.id} className="p-3 rounded-lg bg-secondary/30 border border-border/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {op.operation_type === 'burn' ? (
                          <Flame className="h-4 w-4 text-destructive" />
                        ) : (
                          <Coins className="h-4 w-4 text-neon-emerald" />
                        )}
                        <Badge variant={op.operation_type === 'burn' ? 'destructive' : 'default'}>
                          {op.operation_type.toUpperCase()}
                        </Badge>
                        <span className="font-mono text-sm">
                          {op.amount.toLocaleString()} {op.operation_type === 'burn' ? 'USDT' : op.operation_type.includes('gusd') ? 'GUSD' : 'GYDS'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {op.status === 'confirmed' ? (
                          <CheckCircle className="h-4 w-4 text-neon-emerald" />
                        ) : (
                          <XCircle className="h-4 w-4 text-destructive" />
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 font-mono">{(op.wallet_address ?? '').slice(0, 16)}...</p>
                    <p className="text-xs text-muted-foreground">{new Date(op.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        </TabsContent>
      </Tabs>
    </div>
  );
};
