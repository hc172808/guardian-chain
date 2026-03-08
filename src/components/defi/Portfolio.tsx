import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { GlassCard } from '@/components/ui/GlassCard';
import { Slider } from '@/components/ui/slider';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Sprout, Search, List, LayoutGrid, AlertTriangle, MoreHorizontal,
  FileText, Plus, Minus, Lock, ArrowLeftRight, X, Monitor, Wallet, Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useWalletConnect } from '@/hooks/useWalletConnect';
import { supabase } from '@/integrations/supabase/client';

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
  { id: '1', tokenA: { symbol: 'BRGC' }, tokenB: { symbol: 'GYD' }, fee: '1.00%', balance: 125.50, pendingYield: 2.35, hasWarning: true },
  { id: '2', tokenA: { symbol: 'BRGC' }, tokenB: { symbol: 'NETGY' }, fee: '1.00%', balance: 89.20, pendingYield: 1.15, hasWarning: true },
  { id: '3', tokenA: { symbol: 'NETGY' }, tokenB: { symbol: 'BRCT' }, fee: '1%', balance: 280.62, pendingYield: 0.04, hasWarning: true },
];

interface PortfolioProps {
  onViewPosition?: (position: any) => void;
}

type OverlayType = 'deposit' | 'withdraw' | 'lock' | 'transfer' | 'terminal' | null;

export const Portfolio = ({ onViewPosition }: PortfolioProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [showSearch, setShowSearch] = useState(false);
  const [overlay, setOverlay] = useState<{ type: OverlayType; position: Position | null }>({ type: null, position: null });
  const { toast } = useToast();

  const totalValue = mockPositions.reduce((acc, p) => acc + p.balance, 0);
  const totalPendingYield = mockPositions.reduce((acc, p) => acc + p.pendingYield, 0);
  const estimatedYield24h = totalValue * 0.0001;

  const filteredPositions = mockPositions.filter(
    (pos) =>
      pos.tokenA.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pos.tokenB.symbol.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleHarvestAll = () => {
    toast({ title: 'Harvesting Yield', description: `Collecting $${totalPendingYield.toFixed(2)} from all positions...` });
  };

  const handleHarvest = (pos: Position) => {
    toast({ title: 'Harvesting Yield', description: `Collecting $${pos.pendingYield.toFixed(2)} from ${pos.tokenA.symbol}/${pos.tokenB.symbol}` });
  };

  const openPositionDetails = (pos: Position) => {
    onViewPosition?.({
      tokenA: pos.tokenA,
      tokenB: pos.tokenB,
      balance: pos.balance,
      pendingYield: pos.pendingYield,
      priceRatio: 11720.903,
      rangeMin: 0,
      rangeMax: Infinity,
      address: '5n2K...VjsQ',
      fee: pos.fee,
    });
  };

  const handleAction = (action: string, pos: Position) => {
    switch (action) {
      case 'details':
        openPositionDetails(pos);
        break;
      case 'deposit':
        setOverlay({ type: 'deposit', position: pos });
        break;
      case 'withdraw':
        setOverlay({ type: 'withdraw', position: pos });
        break;
      case 'lock':
        setOverlay({ type: 'lock', position: pos });
        break;
      case 'transfer':
        setOverlay({ type: 'transfer', position: pos });
        break;
      case 'terminal':
        setOverlay({ type: 'terminal', position: pos });
        break;
      case 'close':
        toast({ title: 'Close Position', description: `Closing ${pos.tokenA.symbol}/${pos.tokenB.symbol} position...`, variant: 'destructive' });
        break;
    }
  };

  if (overlay.type && overlay.position) {
    return (
      <OverlayPanel
        type={overlay.type}
        position={overlay.position}
        onBack={() => setOverlay({ type: null, position: null })}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Portfolio</h1>
        <p className="text-muted-foreground">Track and manage your active liquidity positions.</p>
      </div>

      <Button variant="outline" className="gap-2 border-primary/50 text-primary hover:bg-primary/10" onClick={handleHarvestAll}>
        <Sprout className="h-4 w-4" /> Harvest Yield
      </Button>

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

      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="text-muted-foreground" onClick={() => setShowSearch(!showSearch)}>
          <Search className="h-5 w-5" />
        </Button>
        {showSearch && (
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-secondary/30 rounded-md px-3 py-1.5 text-sm border border-border/50 focus:outline-none focus:ring-1 focus:ring-ring"
            autoFocus
          />
        )}
        {!showSearch && <div className="flex-1" />}
        <div className="flex items-center bg-secondary/50 rounded-lg p-1">
          <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('list')} className="h-8 w-8">
            <List className="h-4 w-4" />
          </Button>
          <Button variant={viewMode === 'grid' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('grid')} className="h-8 w-8">
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground px-2">
        <span>Pool</span>
        <span>Balance</span>
      </div>

      <div className="space-y-2">
        {filteredPositions.map((position) => (
          <div
            key={position.id}
            className="flex items-center justify-between p-4 rounded-xl bg-card/50 border border-border/30 hover:border-border/60 transition-colors cursor-pointer"
            onClick={() => openPositionDetails(position)}
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
                <span className="font-semibold">{position.tokenA.symbol} / {position.tokenB.symbol}</span>
                <Badge variant="secondary" className="text-xs font-mono flex items-center gap-1">
                  <span className="text-muted-foreground">|||</span>
                  {position.fee}
                </Badge>
                {position.hasWarning && <AlertTriangle className="h-4 w-4 text-amber-500" />}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="font-semibold">${position.balance.toFixed(2)}</div>
                <div className="text-xs text-primary">+${position.pendingYield.toFixed(2)}</div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-muted-foreground" onClick={(e) => e.stopPropagation()}>
                    <MoreHorizontal className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-card border-border" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenuItem className="gap-2 text-primary" onSelect={() => handleHarvest(position)}>
                    <Sprout className="h-4 w-4" /> Harvest Yield
                  </DropdownMenuItem>
                  <DropdownMenuItem className="gap-2" onSelect={() => handleAction('details', position)}>
                    <FileText className="h-4 w-4" /> Position Details
                  </DropdownMenuItem>
                  <DropdownMenuItem className="gap-2" onSelect={() => handleAction('deposit', position)}>
                    <Plus className="h-4 w-4" /> Deposit Liquidity
                  </DropdownMenuItem>
                  <DropdownMenuItem className="gap-2" onSelect={() => handleAction('withdraw', position)}>
                    <Minus className="h-4 w-4" /> Withdraw Liquidity
                  </DropdownMenuItem>
                  <DropdownMenuItem className="gap-2" onSelect={() => handleAction('lock', position)}>
                    <Lock className="h-4 w-4" /> Lock Liquidity
                  </DropdownMenuItem>
                  <DropdownMenuItem className="gap-2" onSelect={() => handleAction('transfer', position)}>
                    <ArrowLeftRight className="h-4 w-4" /> Transfer Position
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="gap-2 text-destructive" onSelect={() => handleAction('close', position)}>
                    <X className="h-4 w-4" /> Close position
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="gap-2 text-muted-foreground text-xs" disabled>
                    OPEN POSITION IN
                  </DropdownMenuItem>
                  <DropdownMenuItem className="gap-2" onSelect={() => handleAction('terminal', position)}>
                    <Monitor className="h-4 w-4" /> Liquidity Terminal
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

// Overlay panel for all portfolio actions
const OverlayPanel = ({ type, position, onBack }: { type: OverlayType; position: Position; onBack: () => void }) => {
  const pair = `${position.tokenA.symbol}/${position.tokenB.symbol}`;
  const { user } = useAuth();
  const { address, isConnected } = useWalletConnect();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [amountA, setAmountA] = useState('');
  const [amountB, setAmountB] = useState('');
  const [withdrawPercent, setWithdrawPercent] = useState([50]);
  const [lockDays, setLockDays] = useState('30');
  const [transferAddress, setTransferAddress] = useState('');

  const submitTx = async (desc: string, amount: number, toAddress: string) => {
    if (!user || !address) {
      toast({ title: 'Login Required', description: 'Connect your wallet first.', variant: 'destructive' });
      return;
    }
    setIsProcessing(true);
    try {
      const txHash = `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`;
      const { error } = await supabase.from('transactions').insert({
        user_id: user.id, from_address: address, to_address: toAddress,
        amount, fee: amount * 0.001, tx_hash: txHash, status: 'confirmed',
        confirmed_at: new Date().toISOString(), wallet_id: null,
      });
      if (error) throw error;
      toast({ title: 'Success', description: desc });
      onBack();
    } catch (err: any) {
      toast({ title: 'Failed', description: err.message, variant: 'destructive' });
    } finally { setIsProcessing(false); }
  };

  const titles: Record<string, string> = {
    deposit: `Deposit Liquidity — ${pair}`,
    withdraw: `Withdraw Liquidity — ${pair}`,
    lock: `Lock Liquidity — ${pair}`,
    transfer: `Transfer Position — ${pair}`,
    terminal: `Liquidity Terminal — ${pair}`,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>← Back</Button>
        <h2 className="text-xl font-bold">{titles[type!]}</h2>
      </div>

      {type === 'deposit' && (
        <>
          <GlassCard className="p-4 space-y-3">
            <p className="text-sm text-muted-foreground">Deposit {position.tokenA.symbol}</p>
            <div className="flex items-center gap-4">
              <Input type="number" placeholder="0" value={amountA} onChange={e => setAmountA(e.target.value)}
                className="border-0 bg-transparent text-2xl font-light p-0 h-auto focus-visible:ring-0" />
              <Badge variant="secondary" className="font-semibold px-3 py-1">{position.tokenA.symbol}</Badge>
            </div>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>${(parseFloat(amountA || '0') * 86.8).toFixed(2)}</span>
              <div className="flex items-center gap-1"><Wallet className="h-3 w-3" /><span>0.0000</span></div>
            </div>
          </GlassCard>
          <GlassCard className="p-4 space-y-3">
            <p className="text-sm text-muted-foreground">Deposit {position.tokenB.symbol}</p>
            <div className="flex items-center gap-4">
              <Input type="number" placeholder="0" value={amountB} onChange={e => setAmountB(e.target.value)}
                className="border-0 bg-transparent text-2xl font-light p-0 h-auto focus-visible:ring-0" />
              <Badge variant="secondary" className="font-semibold px-3 py-1">{position.tokenB.symbol}</Badge>
            </div>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>${(parseFloat(amountB || '0') * 1).toFixed(2)}</span>
              <div className="flex items-center gap-1"><Wallet className="h-3 w-3" /><span>0.0000</span></div>
            </div>
          </GlassCard>
          <Button className="w-full h-14 text-lg font-semibold bg-amber-600/80 hover:bg-amber-600 text-foreground"
            disabled={isProcessing || (!amountA && !amountB) || !isConnected}
            onClick={() => submitTx(
              `Deposited liquidity to ${pair}`,
              parseFloat(amountA || '0') + parseFloat(amountB || '0'),
              'liquidity-pool'
            )}>
            {isProcessing ? <span className="flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Depositing...</span>
              : !isConnected ? 'Connect Wallet' : 'Deposit Liquidity'}
          </Button>
        </>
      )}

      {type === 'withdraw' && (
        <>
          <GlassCard className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Withdraw Amount</span>
              <span className="font-semibold text-lg">{withdrawPercent[0]}%</span>
            </div>
            <Slider value={withdrawPercent} onValueChange={setWithdrawPercent} max={100} step={1} />
            <div className="flex gap-2">
              {[25, 50, 75, 100].map(v => (
                <Button key={v} variant={withdrawPercent[0] === v ? 'secondary' : 'ghost'} size="sm" className="flex-1"
                  onClick={() => setWithdrawPercent([v])}>{v}%</Button>
              ))}
            </div>
          </GlassCard>
          <GlassCard className="p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">You Receive ({position.tokenA.symbol})</span>
              <span className="font-mono">{((position.balance * withdrawPercent[0] / 100) / 2).toFixed(4)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">You Receive ({position.tokenB.symbol})</span>
              <span className="font-mono">{((position.balance * withdrawPercent[0] / 100) / 2).toFixed(4)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Withdrawal Fee</span><span className="font-mono">0.1%</span>
            </div>
          </GlassCard>
          {withdrawPercent[0] === 100 && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Withdrawing 100% will close this position.</span>
            </div>
          )}
          <Button className="w-full h-14 text-lg font-semibold bg-amber-600/80 hover:bg-amber-600 text-foreground"
            disabled={isProcessing || withdrawPercent[0] === 0 || !isConnected}
            onClick={() => submitTx(
              `Withdrew ${withdrawPercent[0]}% from ${pair}`,
              position.balance * withdrawPercent[0] / 100,
              address || 'user-wallet'
            )}>
            {isProcessing ? <span className="flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Withdrawing...</span>
              : !isConnected ? 'Connect Wallet' : `Withdraw ${withdrawPercent[0]}%`}
          </Button>
        </>
      )}

      {type === 'lock' && (
        <>
          <GlassCard className="p-4 space-y-4">
            <p className="text-sm text-muted-foreground">Lock your liquidity to earn higher yields and boost trust in the pool.</p>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Lock Duration (days)</label>
              <Input type="number" value={lockDays} onChange={e => setLockDays(e.target.value)} className="bg-secondary/30" />
            </div>
            <div className="flex gap-2">
              {['7', '30', '90', '180'].map(d => (
                <Button key={d} variant={lockDays === d ? 'secondary' : 'ghost'} size="sm" className="flex-1"
                  onClick={() => setLockDays(d)}>{d}d</Button>
              ))}
            </div>
          </GlassCard>
          <GlassCard className="p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Position Value</span>
              <span className="font-mono">${position.balance.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Lock Duration</span>
              <span className="font-mono">{lockDays} days</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Unlock Date</span>
              <span className="font-mono">{new Date(Date.now() + parseInt(lockDays || '0') * 86400000).toLocaleDateString()}</span>
            </div>
            <div className="flex justify-between text-primary">
              <span>Estimated APR Boost</span>
              <span className="font-mono font-semibold">+{Math.min(50, parseInt(lockDays || '0') / 3.6).toFixed(1)}%</span>
            </div>
          </GlassCard>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-400">
            <Lock className="h-4 w-4 shrink-0" />
            <span>Locked liquidity cannot be withdrawn until the lock period ends.</span>
          </div>
          <Button className="w-full h-14 text-lg font-semibold bg-amber-600/80 hover:bg-amber-600 text-foreground"
            disabled={isProcessing || !lockDays || parseInt(lockDays) <= 0 || !isConnected}
            onClick={() => submitTx(
              `Locked ${pair} liquidity for ${lockDays} days`,
              position.balance,
              'lock-contract'
            )}>
            {isProcessing ? <span className="flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Locking...</span>
              : !isConnected ? 'Connect Wallet' : `Lock for ${lockDays} Days`}
          </Button>
        </>
      )}

      {type === 'transfer' && (
        <>
          <GlassCard className="p-4 space-y-4">
            <p className="text-sm text-muted-foreground">Transfer this position to another wallet address.</p>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Recipient Address</label>
              <Input placeholder="0x..." value={transferAddress} onChange={e => setTransferAddress(e.target.value)} className="bg-secondary/30 font-mono" />
            </div>
          </GlassCard>
          <GlassCard className="p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Position</span>
              <span className="font-semibold">{pair}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Value</span>
              <span className="font-mono">${position.balance.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pending Yield</span>
              <span className="font-mono">${position.pendingYield.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Transfer Fee</span><span className="font-mono">0.05%</span>
            </div>
          </GlassCard>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>This action is irreversible. The position and any pending yield will be transferred.</span>
          </div>
          <Button className="w-full h-14 text-lg font-semibold bg-amber-600/80 hover:bg-amber-600 text-foreground"
            disabled={isProcessing || !transferAddress || transferAddress.length < 10 || !isConnected}
            onClick={() => submitTx(
              `Transferred ${pair} position to ${transferAddress.slice(0, 8)}...`,
              position.balance,
              transferAddress
            )}>
            {isProcessing ? <span className="flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Transferring...</span>
              : !isConnected ? 'Connect Wallet' : 'Transfer Position'}
          </Button>
        </>
      )}

      {type === 'terminal' && (
        <>
          <GlassCard className="p-4 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Monitor className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-lg">Liquidity Terminal</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <GlassCard className="p-3">
                <p className="text-xs text-muted-foreground mb-1">Position Value</p>
                <p className="text-xl font-bold">${position.balance.toFixed(2)}</p>
              </GlassCard>
              <GlassCard className="p-3">
                <p className="text-xs text-muted-foreground mb-1">Pending Yield</p>
                <p className="text-xl font-bold text-primary">${position.pendingYield.toFixed(2)}</p>
              </GlassCard>
            </div>
          </GlassCard>

          <GlassCard className="p-4 space-y-3">
            <h4 className="font-medium text-sm text-muted-foreground">Position Metrics</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Fee Tier</span><span className="font-mono">{position.fee}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Pool Share</span><span className="font-mono">~0.03%</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Impermanent Loss</span><span className="font-mono text-amber-400">-0.12%</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Net P&L</span><span className="font-mono text-primary">+$1.82</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Fees Earned (all time)</span><span className="font-mono">$4.56</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Time in Position</span><span className="font-mono">12d 4h</span></div>
            </div>
          </GlassCard>

          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" className="gap-2" onClick={() => { onBack(); setTimeout(() => onViewPosition?.({
              tokenA: position.tokenA, tokenB: position.tokenB, balance: position.balance,
              pendingYield: position.pendingYield, priceRatio: 11720.903, rangeMin: 0, rangeMax: Infinity,
              address: '5n2K...VjsQ', fee: position.fee,
            }), 100); }}>
              <FileText className="h-4 w-4" /> Full Details
            </Button>
            <Button variant="outline" className="gap-2 text-primary border-primary/50" onClick={() => {
              handleHarvest(position);
            }}>
              <Sprout className="h-4 w-4" /> Harvest
            </Button>
          </div>
        </>
      )}
    </div>
  );
};
