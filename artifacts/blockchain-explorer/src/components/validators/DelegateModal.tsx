import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { Loader2, ArrowUpRight, Shield } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

interface DelegateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  validator: {
    id: string;
    name: string | null;
    address: string;
    commission: number;
    stake: number;
  } | null;
  onSuccess: () => void;
}

export const DelegateModal = ({ open, onOpenChange, validator, onSuccess }: DelegateModalProps) => {
  const { user } = useAuth();
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  if (!validator) return null;

  const handleDelegate = async () => {
    if (!user || !amount || parseFloat(amount) <= 0) return;
    setSaving(true);

    const { error } = await supabase.from('validator_delegations' as any).insert({
      user_id: user.id,
      validator_id: validator.id,
      amount: parseFloat(amount),
      status: 'active',
    });

    if (error) {
      toast({ title: 'Delegation failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Delegation successful!', description: `${amount} GYDS delegated to ${validator.name || 'validator'}` });
      setAmount('');
      onOpenChange(false);
      onSuccess();
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Delegate to Validator
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="p-3 rounded-lg bg-secondary/30">
            <p className="text-sm font-medium">{validator.name || 'Unnamed Validator'}</p>
            <code className="text-xs text-muted-foreground">{validator.address.slice(0, 14)}...{validator.address.slice(-8)}</code>
            <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
              <span>Stake: {Number(validator.stake).toLocaleString()} GYDS</span>
              <span>Commission: {validator.commission}%</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Amount (GYDS)</Label>
            <Input
              type="number"
              placeholder="Enter amount to delegate"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min="0"
              step="100"
            />
            <p className="text-xs text-muted-foreground">
              Delegated GYDS earn staking rewards minus {validator.commission}% commission
            </p>
          </div>

          <Button
            onClick={handleDelegate}
            disabled={saving || !amount || parseFloat(amount) <= 0}
            className="w-full gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
            Delegate GYDS
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
