import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Bell, BellRing, Plus, Trash2, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface PriceAlert {
  id: string;
  token_id: string;
  target_price: number;
  direction: string;
  is_triggered: boolean;
  triggered_at: string | null;
  created_at: string;
  tokens: { name: string; symbol: string; address: string; logo_url: string | null };
}

export const PriceAlerts = () => {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAlerts = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('token_price_alerts')
      .select('*, tokens(name, symbol, address, logo_url)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (data) setAlerts(data as unknown as PriceAlert[]);
    setLoading(false);
  };

  useEffect(() => { fetchAlerts(); }, [user]);

  const deleteAlert = async (id: string) => {
    await supabase.from('token_price_alerts').delete().eq('id', id);
    toast({ title: 'Alert deleted' });
    fetchAlerts();
  };

  if (!user) return null;

  return (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          Price Alerts
        </h3>
        <Badge variant="outline">{alerts.filter(a => !a.is_triggered).length} active</Badge>
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : alerts.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          No price alerts set. Click 🔔 on a token detail page to create one.
        </p>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert) => (
            <div key={alert.id} className={cn(
              "flex items-center justify-between p-3 rounded-lg",
              alert.is_triggered ? "bg-primary/10 border border-primary/30" : "bg-secondary/30"
            )}>
              <div className="flex items-center gap-3">
                {alert.direction === 'above' ? (
                  <TrendingUp className="h-4 w-4 text-primary" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-destructive" />
                )}
                <div>
                  <p className="text-sm font-medium">{alert.tokens?.symbol || 'Token'}</p>
                  <p className="text-xs text-muted-foreground">
                    {alert.direction === 'above' ? 'Above' : 'Below'} ${alert.target_price}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {alert.is_triggered ? (
                  <Badge className="bg-primary/20 text-primary text-xs gap-1">
                    <BellRing className="h-3 w-3" /> Triggered
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">Active</Badge>
                )}
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteAlert(alert.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
};

// Component for creating alert from token detail page
export const CreatePriceAlert = ({ tokenId, tokenSymbol }: { tokenId: string; tokenSymbol: string }) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState('');
  const [direction, setDirection] = useState<'above' | 'below'>('above');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!user || !price) return;
    setCreating(true);
    const { error } = await supabase.from('token_price_alerts').insert({
      user_id: user.id,
      token_id: tokenId,
      target_price: parseFloat(price),
      direction,
    });
    if (error) {
      toast({ title: 'Failed to create alert', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `Alert set for ${tokenSymbol}`, description: `When price goes ${direction} $${price}` });
      setOpen(false);
      setPrice('');
    }
    setCreating(false);
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <Bell className="h-3 w-3" /> Set Alert
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" /> Price Alert for {tokenSymbol}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="flex gap-2">
            <Button
              variant={direction === 'above' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDirection('above')}
              className="flex-1 gap-1"
            >
              <TrendingUp className="h-3 w-3" /> Above
            </Button>
            <Button
              variant={direction === 'below' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDirection('below')}
              className="flex-1 gap-1"
            >
              <TrendingDown className="h-3 w-3" /> Below
            </Button>
          </div>
          <div className="space-y-2">
            <Label>Target Price ($)</Label>
            <Input
              type="number"
              step="0.00000001"
              placeholder="0.0001"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          <Button onClick={handleCreate} disabled={creating || !price} className="w-full gap-2">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
            Create Alert
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
