import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GlassCard } from '@/components/ui/GlassCard';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Rocket, Search, Filter, ArrowUpDown, ArrowRight, Plus, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { CreateLaunch } from './CreateLaunch';
import { ContributeModal } from './ContributeModal';

interface Launch {
  id: string;
  name: string;
  symbol: string;
  status: string;
  raised_amount: number;
  target_raise: number;
  participants: number;
  ends_at: string | null;
  starts_at: string | null;
  is_premier: boolean;
  logo_url: string | null;
  bonding_curve_type: string;
  initial_price: number;
  bonding_curve_steepness: number;
}

const timeRemaining = (date: string | null) => {
  if (!date) return null;
  const diff = new Date(date).getTime() - Date.now();
  if (diff <= 0) return 'Ended';
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  return d > 0 ? `${d}d ${h}h` : `${h}h`;
};

export const Launchpad = () => {
  const [filter, setFilter] = useState('all');
  const [launches, setLaunches] = useState<Launch[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [contributeTo, setContributeTo] = useState<Launch | null>(null);
  const [loading, setLoading] = useState(true);

  const loadLaunches = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('token_launches')
      .select('id, name, symbol, status, raised_amount, target_raise, participants, ends_at, starts_at, is_premier, logo_url, bonding_curve_type, initial_price, bonding_curve_steepness')
      .order('created_at', { ascending: false });
    if (data) setLaunches(data);
    setLoading(false);
  };

  useEffect(() => {
    loadLaunches();
    const channel = supabase
      .channel('launches')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'token_launches' }, () => loadLaunches())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  if (showCreate) return <CreateLaunch onBack={() => { setShowCreate(false); loadLaunches(); }} />;
  if (contributeTo) return <ContributeModal launch={contributeTo} onBack={() => { setContributeTo(null); loadLaunches(); }} />;

  const filtered = launches.filter(l => filter === 'all' || l.status === filter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold italic">Wavebreak</h1>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon"><Search className="h-5 w-5" /></Button>
          <Button variant="outline" size="icon" className="border-amber-500/50 text-amber-500" onClick={() => setShowCreate(true)}>
            <Rocket className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/50">PREMIER</Badge>
        <h2 className="text-2xl font-bold">Premier Launches</h2>
        <p className="text-muted-foreground">
          In addition to our permissionless launchpad, projects can do a Premier Launch:
          receive white-glove launch support, build a custom bonding curve, and hit your target.
        </p>
        <Button variant="link" className="text-amber-500 p-0 h-auto gap-1">Apply Now <ArrowRight className="h-4 w-4" /></Button>
      </div>

      <Button className="w-full gap-2 bg-amber-600/80 hover:bg-amber-600 text-foreground" onClick={() => setShowCreate(true)}>
        <Plus className="h-4 w-4" /> Submit Your Token Launch
      </Button>

      <div className="flex items-center gap-3">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[180px] bg-secondary/50"><SelectValue placeholder="Filter" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Launches</SelectItem>
            <SelectItem value="live">Live</SelectItem>
            <SelectItem value="upcoming">Upcoming</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="secondary" size="icon"><Filter className="h-4 w-4" /></Button>
        <Button variant="secondary" className="gap-2"><ArrowUpDown className="h-4 w-4" />Newest</Button>
      </div>

      <div>
        <h3 className="text-xl font-bold mb-4">Live & Upcoming</h3>
        {loading ? (
          <GlassCard className="p-8 text-center text-muted-foreground">Loading launches...</GlassCard>
        ) : filtered.length === 0 ? (
          <GlassCard className="p-8 text-center space-y-3">
            <Rocket className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">No launches yet. Be the first!</p>
            <Button variant="outline" className="border-amber-500/50 text-amber-500" onClick={() => setShowCreate(true)}>
              Submit Launch
            </Button>
          </GlassCard>
        ) : (
          <div className="space-y-4">
            {filtered.map(launch => {
              const progress = launch.target_raise > 0 ? (launch.raised_amount / launch.target_raise) * 100 : 0;
              const remaining = launch.status === 'live' ? timeRemaining(launch.ends_at) : launch.status === 'upcoming' ? `Starts ${timeRemaining(launch.starts_at) || 'soon'}` : null;
              return (
                <GlassCard key={launch.id} className={cn("p-4", launch.is_premier && "border-amber-500/30")}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      {launch.logo_url ? (
                        <img src={launch.logo_url} alt={launch.symbol} className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center font-bold">
                          {launch.symbol[0]}
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{launch.name}</span>
                          {launch.is_premier && <Badge className="bg-amber-500/20 text-amber-500 text-xs">PREMIER</Badge>}
                        </div>
                        <span className="text-sm text-muted-foreground">{launch.symbol} · {launch.bonding_curve_type}</span>
                      </div>
                    </div>
                    <Badge
                      variant={launch.status === 'live' ? 'default' : 'secondary'}
                      className={cn(
                        launch.status === 'live' && "bg-primary/20 text-primary",
                        launch.status === 'completed' && "bg-muted text-muted-foreground"
                      )}
                    >
                      {launch.status.toUpperCase()}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Raised</span>
                      <span className="font-medium">${launch.raised_amount.toLocaleString()} / ${launch.target_raise.toLocaleString()}</span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min(100, progress)}%` }} />
                    </div>
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>{launch.participants} participants</span>
                      {remaining && <span>{remaining}</span>}
                    </div>
                  </div>
                  {launch.status === 'live' && (
                    <Button
                      className="w-full mt-4 gap-2 bg-primary/20 text-primary hover:bg-primary/30 border border-primary/50"
                      onClick={() => setContributeTo(launch)}
                    >
                      <TrendingUp className="h-4 w-4" /> Buy {launch.symbol}
                    </Button>
                  )}
                </GlassCard>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
