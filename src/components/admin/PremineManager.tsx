import { useState } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Coins, Loader2, Pickaxe } from 'lucide-react';
import { RESERVED_WALLETS } from '@/config/wallets';

export const PremineManager = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [gydsAmount, setGydsAmount] = useState('1000000');
  const [gydAmount, setGydAmount] = useState('10000');
  const [targetAddress, setTargetAddress] = useState(RESERVED_WALLETS.founder.address);
  const [loading, setLoading] = useState(false);

  const handlePremine = async () => {
    if (!user) return;
    const gyds = parseFloat(gydsAmount);
    const gyd = parseFloat(gydAmount);

    if ((!gyds || gyds <= 0) && (!gyd || gyd <= 0)) {
      toast({ title: 'Enter at least one amount', variant: 'destructive' });
      return;
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(targetAddress)) {
      toast({ title: 'Invalid wallet address', variant: 'destructive' });
      return;
    }

    setLoading(true);

    const operations = [];
    const txHash = () => '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

    if (gyds > 0) {
      operations.push({
        operation_type: 'mint',
        amount: gyds,
        wallet_address: targetAddress.toLowerCase(),
        tx_hash: txHash(),
        status: 'confirmed',
        created_by: user.id,
        usdt_amount: 0,
      });
    }

    if (gyd > 0) {
      operations.push({
        operation_type: 'mint',
        amount: gyd,
        wallet_address: `gyd:${targetAddress.toLowerCase()}`,
        tx_hash: txHash(),
        status: 'confirmed',
        created_by: user.id,
        usdt_amount: 0,
      });
    }

    const { error } = await supabase.from('token_operations').insert(operations);

    if (error) {
      toast({ title: 'Pre-mine failed', description: error.message, variant: 'destructive' });
    } else {
      // Update circulating supply in token_price
      if (gyds > 0) {
        const { data: existing } = await supabase.from('token_price').select('*').maybeSingle();
        if (existing) {
          await supabase.from('token_price').update({
            circulating_supply: existing.circulating_supply + gyds,
          }).eq('id', existing.id);
        }
      }

      toast({
        title: 'Pre-mine successful!',
        description: `${gyds > 0 ? `${gyds.toLocaleString()} GYDS` : ''}${gyds > 0 && gyd > 0 ? ' + ' : ''}${gyd > 0 ? `${gyd.toLocaleString()} GYD` : ''} → ${targetAddress.slice(0, 10)}...`,
      });
    }

    setLoading(false);
  };

  return (
    <GlassCard className="p-6">
      <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
        <Pickaxe className="h-5 w-5 text-primary" />
        Pre-mine Allocation
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        Allocate initial GYDS and GYD to the founder or specified wallet. These are recorded as confirmed token operations.
      </p>

      <div className="space-y-4">
        <div>
          <Label>Target Wallet Address</Label>
          <Input
            value={targetAddress}
            onChange={(e) => setTargetAddress(e.target.value)}
            placeholder="0x..."
            className="font-mono text-sm"
          />
          <Button
            variant="link"
            size="sm"
            className="px-0 text-xs"
            onClick={() => setTargetAddress(RESERVED_WALLETS.founder.address)}
          >
            Use founder address
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="flex items-center gap-2">
              <Coins className="h-3 w-3" /> GYDS Amount
            </Label>
            <Input
              type="number"
              value={gydsAmount}
              onChange={(e) => setGydsAmount(e.target.value)}
              placeholder="1000000"
            />
          </div>
          <div>
            <Label className="flex items-center gap-2">
              <Coins className="h-3 w-3" /> GYD Amount
            </Label>
            <Input
              type="number"
              value={gydAmount}
              onChange={(e) => setGydAmount(e.target.value)}
              placeholder="10000"
            />
          </div>
        </div>

        <Button onClick={handlePremine} disabled={loading} className="w-full gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pickaxe className="h-4 w-4" />}
          {loading ? 'Processing...' : 'Execute Pre-mine'}
        </Button>
      </div>
    </GlassCard>
  );
};
