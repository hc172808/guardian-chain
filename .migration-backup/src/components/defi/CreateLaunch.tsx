import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { GlassCard } from '@/components/ui/GlassCard';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, Rocket, TrendingUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface CreateLaunchProps {
  onBack: () => void;
}

interface UserToken {
  id: string;
  name: string;
  symbol: string;
  logo_url: string | null;
}

export const CreateLaunch = ({ onBack }: CreateLaunchProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [userTokens, setUserTokens] = useState<UserToken[]>([]);
  const [form, setForm] = useState({
    tokenId: '',
    name: '',
    symbol: '',
    description: '',
    targetRaise: '',
    curveType: 'linear',
    steepness: '1.0',
    initialPrice: '0.001',
    maxPrice: '',
    startsAt: '',
    endsAt: '',
    isPremier: false,
  });

  useEffect(() => {
    if (!user) return;
    const loadTokens = async () => {
      const { data } = await supabase
        .from('tokens')
        .select('id, name, symbol, logo_url')
        .eq('creator_id', user.id);
      if (data) setUserTokens(data);
    };
    loadTokens();
  }, [user]);

  const handleTokenSelect = (tokenId: string) => {
    const token = userTokens.find(t => t.id === tokenId);
    if (token) {
      setForm(prev => ({ ...prev, tokenId, name: token.name, symbol: token.symbol }));
    }
  };

  const handleSubmit = async () => {
    if (!user) return;
    if (!form.name || !form.targetRaise) {
      toast({ title: 'Missing fields', description: 'Name and target raise are required.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const token = userTokens.find(t => t.id === form.tokenId);
      const { error } = await supabase.from('token_launches').insert({
        creator_id: user.id,
        token_id: form.tokenId || null,
        name: form.name,
        symbol: form.symbol || form.name.slice(0, 4).toUpperCase(),
        description: form.description,
        logo_url: token?.logo_url || null,
        target_raise: parseFloat(form.targetRaise),
        bonding_curve_type: form.curveType,
        bonding_curve_steepness: parseFloat(form.steepness),
        initial_price: parseFloat(form.initialPrice),
        max_price: form.maxPrice ? parseFloat(form.maxPrice) : null,
        starts_at: form.startsAt || null,
        ends_at: form.endsAt || null,
        is_premier: form.isPremier,
        status: 'upcoming',
      });

      if (error) throw error;

      toast({ title: 'Launch Submitted!', description: 'Your token launch is now listed as upcoming.' });
      onBack();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const curvePreview = () => {
    const steepness = parseFloat(form.steepness) || 1;
    const initial = parseFloat(form.initialPrice) || 0.001;
    const points = Array.from({ length: 5 }, (_, i) => {
      const pct = (i + 1) * 20;
      let price = initial;
      if (form.curveType === 'linear') price = initial + (steepness * pct / 100);
      else if (form.curveType === 'exponential') price = initial * Math.pow(1 + steepness, pct / 100);
      else price = initial * Math.sqrt(1 + steepness * pct / 100);
      return { pct, price: price.toFixed(4) };
    });
    return points;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">Submit to Wavebreak</h1>
      </div>

      {/* Select existing token */}
      {userTokens.length > 0 && (
        <GlassCard className="p-4 space-y-3">
          <Label>Link Existing Token (optional)</Label>
          <Select value={form.tokenId} onValueChange={handleTokenSelect}>
            <SelectTrigger className="bg-secondary/30">
              <SelectValue placeholder="Select one of your tokens" />
            </SelectTrigger>
            <SelectContent>
              {userTokens.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.name} ({t.symbol})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </GlassCard>
      )}

      {/* Basic Info */}
      <GlassCard className="p-4 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <Rocket className="h-4 w-4 text-amber-500" /> Project Details
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Token Name" className="bg-secondary/30" />
          </div>
          <div className="space-y-1">
            <Label>Symbol</Label>
            <Input value={form.symbol} onChange={e => setForm(p => ({ ...p, symbol: e.target.value }))} placeholder="TKN" className="bg-secondary/30" />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Description</Label>
          <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="What does your project do?" className="bg-secondary/30 min-h-[80px]" />
        </div>
        <div className="space-y-1">
          <Label>Fundraising Target (GYDS)</Label>
          <Input type="number" value={form.targetRaise} onChange={e => setForm(p => ({ ...p, targetRaise: e.target.value }))} placeholder="100000" className="bg-secondary/30" />
        </div>
      </GlassCard>

      {/* Bonding Curve */}
      <GlassCard className="p-4 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" /> Bonding Curve
        </h2>
        <div className="space-y-1">
          <Label>Curve Type</Label>
          <Select value={form.curveType} onValueChange={v => setForm(p => ({ ...p, curveType: v }))}>
            <SelectTrigger className="bg-secondary/30">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="linear">Linear — Steady price increase</SelectItem>
              <SelectItem value="exponential">Exponential — Accelerating price</SelectItem>
              <SelectItem value="sqrt">Square Root — Decelerating price</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Steepness</Label>
            <Input type="number" step="0.1" value={form.steepness} onChange={e => setForm(p => ({ ...p, steepness: e.target.value }))} className="bg-secondary/30" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Initial Price</Label>
            <Input type="number" step="0.001" value={form.initialPrice} onChange={e => setForm(p => ({ ...p, initialPrice: e.target.value }))} className="bg-secondary/30" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Max Price</Label>
            <Input type="number" step="0.01" value={form.maxPrice} onChange={e => setForm(p => ({ ...p, maxPrice: e.target.value }))} placeholder="∞" className="bg-secondary/30" />
          </div>
        </div>

        {/* Curve Preview */}
        <div className="bg-secondary/20 rounded-lg p-3 space-y-2">
          <span className="text-xs text-muted-foreground font-medium">Price Preview</span>
          <div className="flex items-end gap-1 h-16">
            {curvePreview().map((p, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] text-muted-foreground">{p.price}</span>
                <div
                  className="w-full bg-primary/60 rounded-t"
                  style={{ height: `${Math.min(100, (parseFloat(p.price) / (parseFloat(curvePreview()[4]?.price || '1')) * 100))}%`, minHeight: 4 }}
                />
                <span className="text-[10px] text-muted-foreground">{p.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      </GlassCard>

      {/* Schedule */}
      <GlassCard className="p-4 space-y-4">
        <h2 className="font-semibold">Schedule</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Start Date</Label>
            <Input type="datetime-local" value={form.startsAt} onChange={e => setForm(p => ({ ...p, startsAt: e.target.value }))} className="bg-secondary/30" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">End Date</Label>
            <Input type="datetime-local" value={form.endsAt} onChange={e => setForm(p => ({ ...p, endsAt: e.target.value }))} className="bg-secondary/30" />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <Label>Apply for Premier Launch</Label>
            <p className="text-xs text-muted-foreground">Get featured and white-glove support</p>
          </div>
          <Switch checked={form.isPremier} onCheckedChange={v => setForm(p => ({ ...p, isPremier: v }))} />
        </div>
      </GlassCard>

      <Button
        className="w-full h-14 text-lg font-semibold bg-amber-600/80 hover:bg-amber-600 text-foreground"
        onClick={handleSubmit}
        disabled={loading || !form.name || !form.targetRaise}
      >
        {loading ? 'Submitting...' : 'Submit Launch'}
      </Button>
    </div>
  );
};
