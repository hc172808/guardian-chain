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
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface CreatePoolProps {
  onBack: () => void;
}

const NATIVE_TOKENS = ['GYD', 'GYDS'];

export const CreatePool = ({ onBack }: CreatePoolProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [customTokens, setCustomTokens] = useState<{ symbol: string; address: string }[]>([]);
  const [walletTokens, setWalletTokens] = useState<string[]>([]);
  const [form, setForm] = useState({
    tokenA: 'GYD',
    tokenB: '',
    feeTier: '0.3',
    initialLiquidityA: '',
    initialLiquidityB: '',
  });

  useEffect(() => {
    const loadTokens = async () => {
      const { data } = await supabase.from('tokens').select('symbol, address').eq('is_active', true);
      if (data) setCustomTokens(data);

      // Load tokens user owns (created or has balance)
      if (user) {
        const { data: userTokens } = await supabase
          .from('tokens')
          .select('symbol')
          .eq('creator_id', user.id)
          .eq('is_active', true);
        if (userTokens) setWalletTokens(userTokens.map(t => t.symbol));
      }
    };
    loadTokens();
  }, [user]);

  const allTokens = [...new Set([...NATIVE_TOKENS, ...customTokens.map(t => t.symbol)])];

  const handleSubmit = async () => {
    if (!user) {
      toast({ title: 'Login Required', description: 'Please sign in first.', variant: 'destructive' });
      return;
    }
    if (!form.tokenA || !form.tokenB || form.tokenA === form.tokenB) {
      toast({ title: 'Invalid pair', description: 'Select two different tokens.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const tokenAMeta = customTokens.find(t => t.symbol === form.tokenA);
      const tokenBMeta = customTokens.find(t => t.symbol === form.tokenB);

      const { error } = await supabase.from('liquidity_pools').insert({
        creator_id: user.id,
        token_a_symbol: form.tokenA,
        token_b_symbol: form.tokenB,
        token_a_address: tokenAMeta?.address || null,
        token_b_address: tokenBMeta?.address || null,
        fee_tier: parseFloat(form.feeTier),
        tvl: (parseFloat(form.initialLiquidityA) || 0) + (parseFloat(form.initialLiquidityB) || 0),
      });

      if (error) throw error;
      toast({ title: 'Pool Created!', description: `${form.tokenA} / ${form.tokenB} pool is now live.` });
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
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Token A</Label>
            <Select value={form.tokenA} onValueChange={v => setForm(p => ({ ...p, tokenA: v }))}>
              <SelectTrigger className="bg-secondary/30"><SelectValue /></SelectTrigger>
              <SelectContent>
                {allTokens.map(t => (
                  <SelectItem key={t} value={t} disabled={t === form.tokenB}>{t}</SelectItem>
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
                  <SelectItem key={t} value={t} disabled={t === form.tokenA}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="p-4 space-y-4">
        <h2 className="font-semibold">Fee Tier</h2>
        <div className="grid grid-cols-3 gap-2">
          {['0.04', '0.3', '1.0'].map(fee => (
            <Button
              key={fee}
              variant={form.feeTier === fee ? 'default' : 'secondary'}
              className={form.feeTier === fee ? 'bg-primary' : ''}
              onClick={() => setForm(p => ({ ...p, feeTier: fee }))}
            >
              {fee}%
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {form.feeTier === '0.04' && 'Best for stable pairs (e.g. GYDS/GYD)'}
          {form.feeTier === '0.3' && 'Best for most pairs'}
          {form.feeTier === '1.0' && 'Best for exotic or volatile pairs'}
        </p>
      </GlassCard>

      <GlassCard className="p-4 space-y-4">
        <h2 className="font-semibold">Initial Liquidity</h2>
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

      <Button
        className="w-full h-14 text-lg font-semibold bg-amber-600/80 hover:bg-amber-600 text-foreground"
        onClick={handleSubmit}
        disabled={loading || !form.tokenA || !form.tokenB}
      >
        {loading ? 'Creating...' : 'Create Pool'}
      </Button>
    </div>
  );
};
