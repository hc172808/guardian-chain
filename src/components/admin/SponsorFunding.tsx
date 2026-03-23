// Sponsor Funding Component - GYDS balance management for fee sponsors
import { useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  Wallet, 
  Plus, 
  Minus, 
  ArrowRight,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface FeeSponsor {
  id: string;
  address: string;
  name: string;
  is_active: boolean;
  daily_gas_limit: string;
  daily_gas_used: string;
  max_gas_per_tx: string;
  tx_count: number;
  balance_gyds: string;
  created_at: string;
}

interface SponsorFundingProps {
  sponsor: FeeSponsor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
}

export const SponsorFunding = ({ sponsor, open, onOpenChange, onUpdate }: SponsorFundingProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState('');
  const [operation, setOperation] = useState<'deposit' | 'withdraw'>('deposit');

  const formatGYDS = (wei: string) => {
    const value = BigInt(wei || '0');
    const gyds = Number(value) / 1e18;
    return gyds.toLocaleString(undefined, { maximumFractionDigits: 6 });
  };

  const parseGYDSToWei = (gyds: string): string => {
    try {
      const value = parseFloat(gyds);
      if (isNaN(value) || value <= 0) return '0';
      // Convert to wei (multiply by 10^18)
      const wei = BigInt(Math.floor(value * 1e18));
      return wei.toString();
    } catch {
      return '0';
    }
  };

  const handleFundingOperation = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast({ title: 'Please enter a valid amount', variant: 'destructive' });
      return;
    }

    setLoading(true);

    try {
      // Fetch current sponsors
      const { data } = await supabase
        .from('admin_config')
        .select('config_value')
        .eq('config_key', 'fee_sponsors')
        .single();

      if (!data) {
        toast({ title: 'Sponsors not found', variant: 'destructive' });
        return;
      }

      const configValue = data.config_value as { sponsors?: FeeSponsor[] };
      const sponsors = configValue?.sponsors || [];
      
      // Find and update the sponsor
      const weiAmount = parseGYDSToWei(amount);
      const updatedSponsors = sponsors.map(s => {
        if (s.id === sponsor.id) {
          const currentBalance = BigInt(s.balance_gyds || '0');
          const changeAmount = BigInt(weiAmount);
          
          let newBalance: bigint;
          if (operation === 'deposit') {
            newBalance = currentBalance + changeAmount;
          } else {
            newBalance = currentBalance - changeAmount;
            if (newBalance < 0n) newBalance = 0n;
          }
          
          return { ...s, balance_gyds: newBalance.toString() };
        }
        return s;
      });

      // Save updated sponsors - convert to JSON-compatible format
      const sponsorsJson = updatedSponsors.map(s => ({
        id: s.id,
        address: s.address,
        name: s.name,
        is_active: s.is_active,
        daily_gas_limit: s.daily_gas_limit,
        daily_gas_used: s.daily_gas_used,
        max_gas_per_tx: s.max_gas_per_tx,
        tx_count: s.tx_count,
        balance_gyds: s.balance_gyds,
        created_at: s.created_at,
      }));
      
      const { error } = await supabase
        .from('admin_config')
        .update({ 
          config_value: JSON.parse(JSON.stringify({ sponsors: sponsorsJson })),
          updated_at: new Date().toISOString()
        })
        .eq('config_key', 'fee_sponsors');

      if (error) throw error;

      // Log the operation
      await supabase.from('token_operations').insert({
        operation_type: operation === 'deposit' ? 'mint' : 'burn',
        wallet_address: `sponsor:${sponsor.id}`,
        amount: parseFloat(amount),
        status: 'completed',
      });

      toast({ 
        title: `${operation === 'deposit' ? 'Deposited' : 'Withdrew'} ${amount} GYDS`,
        description: `Updated balance for ${sponsor.name}`
      });

      setAmount('');
      onUpdate();
      onOpenChange(false);
    } catch (error) {
      console.error('Funding operation failed:', error);
      toast({ title: 'Operation failed', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const currentBalanceGYDS = formatGYDS(sponsor.balance_gyds);
  const estimatedNewBalance = () => {
    const current = parseFloat(currentBalanceGYDS.replace(/,/g, '')) || 0;
    const change = parseFloat(amount) || 0;
    const newBal = operation === 'deposit' ? current + change : current - change;
    return Math.max(0, newBal).toLocaleString(undefined, { maximumFractionDigits: 6 });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Fund {sponsor.name}
          </DialogTitle>
          <DialogDescription>
            Manage GYDS balance for gas fee sponsorship
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          {/* Current Balance */}
          <GlassCard className="p-4 text-center">
            <p className="text-sm text-muted-foreground">Current Balance</p>
            <p className="text-2xl font-bold text-primary">{currentBalanceGYDS} GYDS</p>
            <code className="text-xs text-muted-foreground">{sponsor.address}</code>
          </GlassCard>

          {/* Operation Tabs */}
          <Tabs value={operation} onValueChange={(v) => setOperation(v as 'deposit' | 'withdraw')}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="deposit" className="gap-2">
                <Plus className="h-4 w-4" />
                Deposit
              </TabsTrigger>
              <TabsTrigger value="withdraw" className="gap-2">
                <Minus className="h-4 w-4" />
                Withdraw
              </TabsTrigger>
            </TabsList>

            <TabsContent value="deposit" className="mt-4">
              <div className="space-y-2">
                <Label>Amount to Deposit (GYDS)</Label>
                <Input
                  type="number"
                  step="0.000001"
                  min="0"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
            </TabsContent>

            <TabsContent value="withdraw" className="mt-4">
              <div className="space-y-2">
                <Label>Amount to Withdraw (GYDS)</Label>
                <Input
                  type="number"
                  step="0.000001"
                  min="0"
                  max={parseFloat(currentBalanceGYDS.replace(/,/g, '')) || 0}
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <Button 
                  variant="link" 
                  size="sm" 
                  className="p-0 h-auto text-xs"
                  onClick={() => setAmount(currentBalanceGYDS.replace(/,/g, ''))}
                >
                  Max: {currentBalanceGYDS} GYDS
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          {/* Preview */}
          {amount && parseFloat(amount) > 0 && (
            <div className="flex items-center justify-center gap-3 p-3 rounded-lg bg-secondary/30">
              <span className="text-sm">{currentBalanceGYDS}</span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-bold text-primary">{estimatedNewBalance()} GYDS</span>
            </div>
          )}

          {/* Warning for withdraw */}
          {operation === 'withdraw' && (
            <div className="flex items-start gap-2 p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5">
              <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                Withdrawing funds may prevent gas sponsorship if balance falls below required limits.
              </p>
            </div>
          )}

          {/* Submit */}
          <Button 
            onClick={handleFundingOperation} 
            disabled={loading || !amount || parseFloat(amount) <= 0}
            className="w-full gap-2"
          >
            {loading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : operation === 'deposit' ? (
              <Plus className="h-4 w-4" />
            ) : (
              <Minus className="h-4 w-4" />
            )}
            {loading ? 'Processing...' : `${operation === 'deposit' ? 'Deposit' : 'Withdraw'} GYDS`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
