import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { Coins, ArrowDownRight, Loader2 } from 'lucide-react';

interface Delegation {
  id: string;
  amount: number;
  status: string;
  delegated_at: string;
  validator_id: string;
}

interface Props {
  validators: { id: string; name: string | null; address: string }[];
  onUpdate: () => void;
}

export const MyDelegations = ({ validators, onUpdate }: Props) => {
  const { user } = useAuth();
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [loading, setLoading] = useState(true);
  const [undelegating, setUndelegating] = useState<string | null>(null);

  const fetchDelegations = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('validator_delegations' as any)
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('delegated_at', { ascending: false });
    if (data) setDelegations(data as any);
    setLoading(false);
  };

  useEffect(() => { fetchDelegations(); }, [user]);

  const handleUndelegate = async (id: string) => {
    setUndelegating(id);
    const { error } = await supabase
      .from('validator_delegations' as any)
      .update({ status: 'undelegated', undelegated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      toast({ title: 'Failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Undelegated successfully' });
      fetchDelegations();
      onUpdate();
    }
    setUndelegating(null);
  };

  if (!user) return null;

  const getValidatorName = (vid: string) => {
    const v = validators.find(v => v.id === vid);
    return v?.name || v?.address?.slice(0, 10) + '...' || 'Unknown';
  };

  const totalDelegated = delegations.reduce((s, d) => s + Number(d.amount), 0);

  return (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Coins className="h-5 w-5 text-primary" />
          My Delegations
        </h3>
        <Badge variant="outline">{totalDelegated.toLocaleString()} GYDS</Badge>
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : delegations.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          No active delegations. Click "Delegate" on any validator to start earning rewards.
        </p>
      ) : (
        <div className="space-y-2">
          {delegations.map((d) => (
            <div key={d.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
              <div>
                <p className="text-sm font-medium">{getValidatorName(d.validator_id)}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(d.delegated_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-primary">{Number(d.amount).toLocaleString()} GYDS</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-xs"
                  disabled={undelegating === d.id}
                  onClick={() => handleUndelegate(d.id)}
                >
                  {undelegating === d.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowDownRight className="h-3 w-3" />}
                  Undelegate
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
};
