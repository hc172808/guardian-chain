import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { GlassCard } from '@/components/ui/GlassCard';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Sprout, 
  Search, 
  List, 
  LayoutGrid, 
  Settings, 
  Circle, 
  AlertTriangle, 
  MoreHorizontal,
  FileText,
  Plus,
  Minus,
  Lock,
  ArrowLeftRight,
  X,
  Monitor
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Position {
  id: string;
  tokenA: { symbol: string };
  tokenB: { symbol: string };
  fee: string;
  balance: number;
  pendingYield: number;
  hasWarning?: boolean;
}

const mockPositions: Position[] = [
  {
    id: '1',
    tokenA: { symbol: 'BRGC' },
    tokenB: { symbol: 'GYD' },
    fee: '1.00%',
    balance: 125.50,
    pendingYield: 2.35,
    hasWarning: true,
  },
  {
    id: '2',
    tokenA: { symbol: 'BRGC' },
    tokenB: { symbol: 'NETGY' },
    fee: '1.00%',
    balance: 89.20,
    pendingYield: 1.15,
    hasWarning: true,
  },
  {
    id: '3',
    tokenA: { symbol: 'NETGY' },
    tokenB: { symbol: 'BRCT' },
    fee: '1%',
    balance: 280.62,
    pendingYield: 0.04,
    hasWarning: true,
  },
];

export const Portfolio = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  const totalValue = mockPositions.reduce((acc, p) => acc + p.balance, 0);
  const totalPendingYield = mockPositions.reduce((acc, p) => acc + p.pendingYield, 0);
  const estimatedYield24h = totalValue * 0.0001; // Mock 0.01% daily

  const filteredPositions = mockPositions.filter(
    (pos) =>
      pos.tokenA.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pos.tokenB.symbol.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Portfolio</h1>
        <p className="text-muted-foreground">
          Track and manage your active liquidity positions.
        </p>
      </div>

      {/* Harvest Yield Button */}
      <Button
        variant="outline"
        className="gap-2 border-primary/50 text-primary hover:bg-primary/10"
      >
        <Sprout className="h-4 w-4" />
        Harvest Yield
      </Button>

      {/* Stats Card */}
      <GlassCard className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Total Value</span>
          <span className="font-semibold text-foreground">${totalValue.toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Estimated Yield (24H)</span>
          <div className="flex items-center gap-2">
            <span className="text-primary text-sm">&lt;0.01%</span>
            <span className="font-semibold text-foreground">${estimatedYield24h.toFixed(2)}</span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Pending Yield</span>
          <span className="font-semibold text-foreground">${totalPendingYield.toFixed(2)}</span>
        </div>
      </GlassCard>

      {/* Search and View Toggle */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="text-muted-foreground">
          <Search className="h-5 w-5" />
        </Button>
        <div className="flex-1" />
        <div className="flex items-center bg-secondary/50 rounded-lg p-1">
          <Button
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            size="icon"
            onClick={() => setViewMode('list')}
            className="h-8 w-8"
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
            size="icon"
            onClick={() => setViewMode('grid')}
            className="h-8 w-8"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </div>
        <Button variant="secondary" size="icon">
          <Settings className="h-4 w-4" />
        </Button>
        <Button variant="secondary" size="icon">
          <Circle className="h-4 w-4" />
        </Button>
      </div>

      {/* Column Headers */}
      <div className="flex items-center justify-between text-sm text-muted-foreground px-2">
        <span>Pool</span>
        <span>Balance</span>
      </div>

      {/* Position Items */}
      <div className="space-y-2">
        {filteredPositions.map((position) => (
          <div
            key={position.id}
            className="flex items-center justify-between p-4 rounded-xl bg-card/50 border border-border/30 hover:border-border/60 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 border-background z-10",
                  position.tokenA.symbol === 'BRGC' ? "bg-gradient-to-br from-amber-500 to-amber-600 text-black" :
                  position.tokenA.symbol === 'NETGY' ? "bg-gradient-to-br from-orange-500 to-orange-600" :
                  "bg-gradient-to-br from-primary to-primary/50"
                )}>
                  {position.tokenA.symbol[0]}
                </div>
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 border-background",
                  position.tokenB.symbol === 'GYD' ? "bg-gradient-to-br from-blue-500 to-cyan-500" :
                  position.tokenB.symbol === 'NETGY' ? "bg-gradient-to-br from-purple-500 to-purple-600" :
                  position.tokenB.symbol === 'BRCT' ? "bg-gradient-to-br from-orange-600 to-red-600" :
                  "bg-gradient-to-br from-primary to-primary/50"
                )}>
                  {position.tokenB.symbol[0]}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">
                  {position.tokenA.symbol} / {position.tokenB.symbol}
                </span>
                <Badge variant="secondary" className="text-xs font-mono flex items-center gap-1">
                  <span className="text-muted-foreground">|||</span>
                  {position.fee}
                </Badge>
                {position.hasWarning && (
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                )}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="font-semibold">${position.balance.toFixed(2)}</div>
                <div className="text-xs text-primary">+${position.pendingYield.toFixed(2)}</div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-muted-foreground">
                    <MoreHorizontal className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-card border-border">
                  <DropdownMenuItem className="gap-2 text-primary">
                    <Sprout className="h-4 w-4" />
                    Harvest Yield
                  </DropdownMenuItem>
                  <DropdownMenuItem className="gap-2">
                    <FileText className="h-4 w-4" />
                    Position Details
                  </DropdownMenuItem>
                  <DropdownMenuItem className="gap-2">
                    <Plus className="h-4 w-4" />
                    Deposit Liquidity
                  </DropdownMenuItem>
                  <DropdownMenuItem className="gap-2">
                    <Minus className="h-4 w-4" />
                    Withdraw Liquidity
                  </DropdownMenuItem>
                  <DropdownMenuItem className="gap-2">
                    <Lock className="h-4 w-4" />
                    Lock Liquidity
                  </DropdownMenuItem>
                  <DropdownMenuItem className="gap-2">
                    <ArrowLeftRight className="h-4 w-4" />
                    Transfer Position
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="gap-2 text-destructive">
                    <X className="h-4 w-4" />
                    Close position
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="gap-2 text-muted-foreground text-xs">
                    OPEN POSITION IN
                  </DropdownMenuItem>
                  <DropdownMenuItem className="gap-2">
                    <Monitor className="h-4 w-4" />
                    Liquidity Terminal
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
