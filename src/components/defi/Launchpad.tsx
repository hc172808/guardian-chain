import { useState } from 'react';
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
import { Rocket, Search, Filter, ArrowUpDown, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Launch {
  id: string;
  name: string;
  symbol: string;
  status: 'live' | 'upcoming' | 'completed';
  raised: number;
  target: number;
  participants: number;
  endsIn?: string;
  isPremier?: boolean;
}

const mockLaunches: Launch[] = [
  {
    id: '1',
    name: 'NetlifeGY Finance',
    symbol: 'NGYF',
    status: 'live',
    raised: 125000,
    target: 200000,
    participants: 342,
    endsIn: '2d 14h',
    isPremier: true,
  },
  {
    id: '2',
    name: 'Bridge Protocol',
    symbol: 'BRP',
    status: 'upcoming',
    raised: 0,
    target: 150000,
    participants: 0,
    endsIn: 'Starts in 5d',
  },
  {
    id: '3',
    name: 'Yield Optimizer',
    symbol: 'YOPT',
    status: 'completed',
    raised: 500000,
    target: 500000,
    participants: 1250,
  },
];

export const Launchpad = () => {
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('newest');

  const filteredLaunches = mockLaunches.filter((launch) => {
    if (filter === 'all') return true;
    return launch.status === filter;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold italic">Wavebreak</h1>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon">
            <Search className="h-5 w-5" />
          </Button>
          <Button 
            variant="outline" 
            size="icon"
            className="border-amber-500/50 text-amber-500"
          >
            <Rocket className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Premier Section */}
      <div className="space-y-4">
        <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/50">
          PREMIER
        </Badge>
        <h2 className="text-2xl font-bold">Premier Launches</h2>
        <p className="text-muted-foreground">
          In addition to our permissionless launchpad, projects can do a Premier Launch: 
          receive white-glove launch support, build a custom bonding curve, and hit your target.
        </p>
        <Button variant="link" className="text-amber-500 p-0 h-auto gap-1">
          Apply Now <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      {/* CTA Card */}
      <GlassCard className="p-6 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-secondary/50 flex items-center justify-center mx-auto">
          <Rocket className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-lg font-medium">
          Want to make a big splash with your token?
        </p>
        <Button 
          variant="outline" 
          className="border-amber-500/50 text-amber-500 hover:bg-amber-500/10 gap-2"
        >
          Apply to Premier Launches
          <ArrowRight className="h-4 w-4" />
        </Button>
      </GlassCard>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[180px] bg-secondary/50">
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Launches</SelectItem>
            <SelectItem value="live">Live</SelectItem>
            <SelectItem value="upcoming">Upcoming</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="secondary" size="icon">
          <Filter className="h-4 w-4" />
        </Button>

        <Button variant="secondary" className="gap-2">
          <ArrowUpDown className="h-4 w-4" />
          Newest
        </Button>
      </div>

      {/* Live & Upcoming */}
      <div>
        <h3 className="text-xl font-bold mb-4">Live & Upcoming</h3>
        <div className="space-y-4">
          {filteredLaunches.map((launch) => (
            <GlassCard 
              key={launch.id} 
              className={cn(
                "p-4",
                launch.isPremier && "border-amber-500/30"
              )}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center font-bold">
                    {launch.symbol[0]}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{launch.name}</span>
                      {launch.isPremier && (
                        <Badge className="bg-amber-500/20 text-amber-500 text-xs">
                          PREMIER
                        </Badge>
                      )}
                    </div>
                    <span className="text-sm text-muted-foreground">{launch.symbol}</span>
                  </div>
                </div>
                <Badge 
                  variant={launch.status === 'live' ? 'default' : 'secondary'}
                  className={cn(
                    launch.status === 'live' && "bg-primary/20 text-primary",
                    launch.status === 'completed' && "bg-muted text-muted-foreground"
                  )}
                >
                  {launch.status === 'live' ? 'LIVE' : 
                   launch.status === 'upcoming' ? 'UPCOMING' : 'COMPLETED'}
                </Badge>
              </div>

              {/* Progress */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Raised</span>
                  <span className="font-medium">
                    ${launch.raised.toLocaleString()} / ${launch.target.toLocaleString()}
                  </span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${(launch.raised / launch.target) * 100}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{launch.participants} participants</span>
                  {launch.endsIn && <span>{launch.endsIn}</span>}
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      </div>
    </div>
  );
};
