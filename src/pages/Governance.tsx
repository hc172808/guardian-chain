import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '@/components/layout/Layout';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Vote, Plus, Clock, CheckCircle2, XCircle, AlertCircle,
  TrendingUp, Users, Coins, RefreshCw, ChevronRight, Lock
} from 'lucide-react';

interface Proposal {
  id: string;
  title: string;
  description: string;
  proposal_type: string;
  status: string;
  votes_for: number;
  votes_against: number;
  votes_abstain: number;
  quorum_required: number;
  created_at: string;
  end_date: string;
  created_by: string;
}

const STATUS_CONFIG: Record<string, { color: string; icon: any; label: string }> = {
  active:   { color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10', icon: Clock,        label: 'Active' },
  passed:   { color: 'text-primary border-primary/30 bg-primary/10',             icon: CheckCircle2, label: 'Passed' },
  rejected: { color: 'text-red-400 border-red-500/30 bg-red-500/10',             icon: XCircle,      label: 'Rejected' },
  pending:  { color: 'text-amber-400 border-amber-500/30 bg-amber-500/10',       icon: AlertCircle,  label: 'Pending' },
};

const TYPE_LABELS: Record<string, string> = {
  parameter: 'Parameter Change',
  treasury:  'Treasury Spend',
  upgrade:   'Protocol Upgrade',
  grant:     'Grant',
};

// Demo proposals since governance tables may not exist yet
const DEMO_PROPOSALS: Proposal[] = [
  {
    id: '1',
    title: 'Increase Block Size Limit to 4MB',
    description: 'This proposal increases the maximum block size from 2MB to 4MB to accommodate growing transaction volume and improve throughput during peak periods.',
    proposal_type: 'parameter',
    status: 'active',
    votes_for: 1_250_000,
    votes_against: 320_000,
    votes_abstain: 80_000,
    quorum_required: 1_000_000,
    created_at: new Date(Date.now() - 3 * 24 * 3600000).toISOString(),
    end_date: new Date(Date.now() + 4 * 24 * 3600000).toISOString(),
    created_by: 'Validator Council',
  },
  {
    id: '2',
    title: 'Treasury: Fund Community Developer Grants Q3 2026',
    description: 'Allocate 500,000 GYDS from the governance treasury to fund 5 community developer grants focused on tooling, SDKs, and integrations.',
    proposal_type: 'treasury',
    status: 'active',
    votes_for: 890_000,
    votes_against: 210_000,
    votes_abstain: 50_000,
    quorum_required: 800_000,
    created_at: new Date(Date.now() - 1 * 24 * 3600000).toISOString(),
    end_date: new Date(Date.now() + 6 * 24 * 3600000).toISOString(),
    created_by: 'Community',
  },
  {
    id: '3',
    title: 'Upgrade Validator Reward Formula v2',
    description: 'Replace the linear staking reward formula with a sigmoid curve that better balances small and large validators, reducing centralization pressure.',
    proposal_type: 'upgrade',
    status: 'passed',
    votes_for: 2_100_000,
    votes_against: 400_000,
    votes_abstain: 150_000,
    quorum_required: 1_000_000,
    created_at: new Date(Date.now() - 14 * 24 * 3600000).toISOString(),
    end_date: new Date(Date.now() - 7 * 24 * 3600000).toISOString(),
    created_by: 'Core Team',
  },
  {
    id: '4',
    title: 'Enable Cross-Chain Bridge Fee Reduction to 0.1%',
    description: 'Reduce bridge fees from 0.2–0.5% to a flat 0.1% to attract more bridging volume and increase GYDS liquidity across chains.',
    proposal_type: 'parameter',
    status: 'rejected',
    votes_for: 600_000,
    votes_against: 1_400_000,
    votes_abstain: 200_000,
    quorum_required: 1_000_000,
    created_at: new Date(Date.now() - 21 * 24 * 3600000).toISOString(),
    end_date: new Date(Date.now() - 14 * 24 * 3600000).toISOString(),
    created_by: 'Community',
  },
];

const GovernancePage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [proposals] = useState<Proposal[]>(DEMO_PROPOSALS);
  const [selected, setSelected] = useState<Proposal | null>(null);
  const [filter, setFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newType, setNewType] = useState('parameter');
  const [voting, setVoting] = useState<Record<string, string>>({});

  const filtered = filter === 'all' ? proposals : proposals.filter(p => p.status === filter);

  const vote = (proposalId: string, choice: 'for' | 'against' | 'abstain') => {
    if (!user) { toast({ title: 'Sign in to vote', variant: 'destructive' }); return; }
    setVoting(v => ({ ...v, [proposalId]: choice }));
    toast({ title: `Vote cast: ${choice.toUpperCase()}`, description: 'Your vote has been recorded.' });
  };

  const totalVotes = (p: Proposal) => p.votes_for + p.votes_against + p.votes_abstain;
  const pct = (v: number, total: number) => total > 0 ? Math.round((v / total) * 100) : 0;
  const daysLeft = (end: string) => {
    const d = Math.ceil((new Date(end).getTime() - Date.now()) / 86400000);
    return d > 0 ? `${d}d left` : 'Ended';
  };

  return (
    <Layout>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Vote className="w-6 h-6 text-primary" /> Governance
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Shape the future of GYDSchain — vote on proposals with your staked GYDS
            </p>
          </div>
          {user && (
            <Button onClick={() => setShowCreate(true)} className="gap-2 shrink-0">
              <Plus className="w-4 h-4" /> New Proposal
            </Button>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Active Proposals', value: proposals.filter(p => p.status === 'active').length, icon: Clock, color: 'text-emerald-400' },
            { label: 'Total Proposals', value: proposals.length, icon: Vote, color: 'text-primary' },
            { label: 'Total Votes Cast', value: '4.7M GYDS', icon: Coins, color: 'text-neon-cyan' },
            { label: 'Voting Power', value: user ? '~12,500' : '—', icon: Users, color: 'text-amber-400' },
          ].map(s => (
            <GlassCard key={s.label} className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <s.icon className={`w-4 h-4 ${s.color}`} />
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
              <p className="text-xl font-bold">{s.value}</p>
            </GlassCard>
          ))}
        </div>

        <Tabs defaultValue="proposals">
          <TabsList>
            <TabsTrigger value="proposals">Proposals</TabsTrigger>
            <TabsTrigger value="treasury">Treasury</TabsTrigger>
          </TabsList>

          <TabsContent value="proposals" className="space-y-4 mt-4">
            {/* Filter */}
            <div className="flex gap-2 flex-wrap">
              {['all', 'active', 'passed', 'rejected', 'pending'].map(f => (
                <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'}
                  onClick={() => setFilter(f)} className="capitalize text-xs h-7">
                  {f}
                </Button>
              ))}
            </div>

            {/* Proposal list */}
            <div className="space-y-3">
              {filtered.map(p => {
                const total = totalVotes(p);
                const cfg = STATUS_CONFIG[p.status] ?? STATUS_CONFIG.pending;
                const StatusIcon = cfg.icon;
                const quorumMet = total >= p.quorum_required;
                return (
                  <GlassCard
                    key={p.id}
                    className="p-5 cursor-pointer hover:border-primary/40 transition-colors"
                    onClick={() => setSelected(p === selected ? null : p)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge variant="outline" className={`text-xs ${cfg.color}`}>
                            <StatusIcon className="w-3 h-3 mr-1" /> {cfg.label}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {TYPE_LABELS[p.proposal_type] ?? p.proposal_type}
                          </Badge>
                          {p.status === 'active' && (
                            <span className="text-xs text-muted-foreground">{daysLeft(p.end_date)}</span>
                          )}
                        </div>
                        <h3 className="font-semibold text-foreground">{p.title}</h3>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{p.description}</p>
                      </div>
                      <ChevronRight className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${selected?.id === p.id ? 'rotate-90' : ''}`} />
                    </div>

                    {/* Vote bars */}
                    <div className="mt-4 space-y-1.5">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>For: {pct(p.votes_for, total)}%</span>
                        <span>Against: {pct(p.votes_against, total)}%</span>
                        <span>Quorum: {quorumMet ? '✓' : `${Math.round((total / p.quorum_required) * 100)}%`}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden flex">
                        <div className="bg-emerald-500 h-full transition-all" style={{ width: `${pct(p.votes_for, total)}%` }} />
                        <div className="bg-red-500 h-full transition-all" style={{ width: `${pct(p.votes_against, total)}%` }} />
                        <div className="bg-muted-foreground/30 h-full flex-1" />
                      </div>
                    </div>

                    {/* Vote buttons (active only) */}
                    {selected?.id === p.id && p.status === 'active' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mt-4 pt-4 border-t border-border/30"
                      >
                        <p className="text-sm mb-3">{p.description}</p>
                        {voting[p.id] ? (
                          <Badge className="gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Voted: {voting[p.id]}
                          </Badge>
                        ) : (
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => vote(p.id, 'for')} className="bg-emerald-600 hover:bg-emerald-700 gap-1">
                              <CheckCircle2 className="w-3 h-3" /> For
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => vote(p.id, 'against')} className="gap-1">
                              <XCircle className="w-3 h-3" /> Against
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => vote(p.id, 'abstain')}>
                              Abstain
                            </Button>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </GlassCard>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="treasury" className="mt-4">
            <GlassCard className="p-6 space-y-4">
              <h2 className="font-semibold flex items-center gap-2">
                <Coins className="w-4 h-4 text-primary" /> DAO Treasury
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { label: 'GYDS Balance', value: '12,500,000 GYDS', sub: '≈ $1,250 USD' },
                  { label: 'GYD Stablecoin', value: '250,000 GYD', sub: '≈ $250,000 USD' },
                  { label: 'ETH Reserve', value: '45.2 ETH', sub: '≈ $144,640 USD' },
                ].map(b => (
                  <div key={b.label} className="p-4 bg-muted/20 rounded-xl border border-border/30">
                    <p className="text-xs text-muted-foreground">{b.label}</p>
                    <p className="text-lg font-bold mt-1">{b.value}</p>
                    <p className="text-xs text-muted-foreground">{b.sub}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Recent Spending</p>
                {[
                  { what: 'Bug Bounty Payout — Critical RPC fix', amount: '-5,000 GYD', date: '3 days ago' },
                  { what: 'Q2 Developer Grants (3 teams)', amount: '-300,000 GYDS', date: '15 days ago' },
                  { what: 'Audit — Halborn Security', amount: '-50,000 GYDS', date: '30 days ago' },
                ].map(tx => (
                  <div key={tx.what} className="flex justify-between items-center py-2 border-b border-border/20 text-sm">
                    <span className="text-muted-foreground">{tx.what}</span>
                    <div className="text-right">
                      <p className="text-red-400 font-mono text-xs">{tx.amount}</p>
                      <p className="text-muted-foreground text-xs">{tx.date}</p>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          </TabsContent>
        </Tabs>

        {/* Create Proposal Modal */}
        {showCreate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowCreate(false)}
          >
            <GlassCard className="p-6 w-full max-w-lg space-y-4" onClick={e => e.stopPropagation()}>
              <h2 className="font-bold text-lg">Create Proposal</h2>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Title</Label>
                  <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Proposal title…" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Type</Label>
                  <Select value={newType} onValueChange={setNewType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Description</Label>
                  <Textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={4} placeholder="Describe your proposal…" />
                </div>
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-200/80 flex gap-2">
                  <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Requires 100,000 GYDS staked to submit a proposal.
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button onClick={() => { toast({ title: 'Proposal submitted!' }); setShowCreate(false); }}>Submit</Button>
              </div>
            </GlassCard>
          </motion.div>
        )}
      </motion.div>
    </Layout>
  );
};

export default GovernancePage;
