import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '@/components/layout/Layout';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Vote, Plus, Clock, CheckCircle2, XCircle, AlertCircle, TrendingUp, Users, Coins, RefreshCw, ChevronRight, Lock, Zap, BarChart2, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Proposal {
  id: string;
  title: string;
  description: string;
  proposalType: string;
  status: string;
  votesFor: string;
  votesAgainst: string;
  votesAbstain: string;
  quorumRequired: string;
  createdBy: string;
  endDate: string;
  createdAt: string;
}

interface MyVote {
  proposalId: string;
  choice: string;
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

interface TreasuryCoin {
  id: string;
  coin: string;
  balance: string;
  usd_value: string;
  address: string;
  updated_at: string;
}

interface VotingPower {
  total: number;
  fromNodes: number;
  fromXp: number;
  fromStake: number;
  fromBase: number;
  nodes: number;
  xp: number;
  level: number;
  stake: number;
}

const GovernancePage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [myVotes, setMyVotes] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newType, setNewType] = useState('parameter');
  const [submitting, setSubmitting] = useState(false);
  const [voting, setVoting] = useState<string | null>(null);
  const [treasury, setTreasury] = useState<TreasuryCoin[]>([]);
  const [treasurySpending, setTreasurySpending] = useState<any[]>([]);
  const [votingPower, setVotingPower] = useState<VotingPower | null>(null);
  const [loadingTreasury, setLoadingTreasury] = useState(false);
  const [delegations, setDelegations] = useState<any[]>([]);
  const [delegateAddress, setDelegateAddress] = useState('');
  const [delegateUsername, setDelegateUsername] = useState('');
  const [delegatePower, setDelegatePower] = useState('100');
  const [delegating, setDelegating] = useState(false);

  const fetchProposals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/governance/proposals');
      if (res.ok) setProposals(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMyVotes = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch('/api/governance/my-votes', { credentials: 'include' });
      if (res.ok) {
        const data: MyVote[] = await res.json();
        const map: Record<string, string> = {};
        data.forEach(v => { map[v.proposalId] = v.choice; });
        setMyVotes(map);
      }
    } catch {}
  }, [user]);

  const fetchTreasury = useCallback(async () => {
    setLoadingTreasury(true);
    try {
      const [t, s] = await Promise.all([
        fetch('/api/governance/treasury').then(r => r.ok ? r.json() : []),
        fetch('/api/governance/treasury/spending').then(r => r.ok ? r.json() : []),
      ]);
      setTreasury(Array.isArray(t) ? t : []);
      setTreasurySpending(Array.isArray(s) ? s : []);
    } finally { setLoadingTreasury(false); }
  }, []);

  const fetchVotingPower = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch('/api/governance/voting-power', { credentials: 'include' });
      if (res.ok) setVotingPower(await res.json());
    } catch {}
  }, [user]);

  const fetchDelegations = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch('/api/governance/delegations', { credentials: 'include' });
      if (res.ok) setDelegations(await res.json());
    } catch {}
  }, [user]);

  const delegate = async () => {
    if (!delegateAddress.trim()) { toast({ title: 'Address required', variant: 'destructive' }); return; }
    setDelegating(true);
    try {
      const res = await fetch('/api/governance/delegate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delegateAddress, delegateUsername, powerDelegated: Number(delegatePower) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: 'Voting power delegated', description: `${delegatePower} VP → ${delegateAddress.slice(0, 8)}…` });
      setDelegateAddress(''); setDelegateUsername('');
      fetchDelegations();
    } catch (e: any) {
      toast({ title: 'Delegation failed', description: e.message, variant: 'destructive' });
    } finally { setDelegating(false); }
  };

  const revokeDelegate = async (id: string) => {
    try {
      await fetch(`/api/governance/delegation/${id}`, { method: 'DELETE', credentials: 'include' });
      toast({ title: 'Delegation revoked' });
      fetchDelegations();
    } catch {}
  };

  useEffect(() => { fetchProposals(); }, [fetchProposals]);
  useEffect(() => { fetchMyVotes(); }, [fetchMyVotes]);
  useEffect(() => { fetchTreasury(); }, [fetchTreasury]);
  useEffect(() => { fetchVotingPower(); }, [fetchVotingPower]);
  useEffect(() => { fetchDelegations(); }, [fetchDelegations]);

  const castVote = async (proposalId: string, choice: 'for' | 'against' | 'abstain') => {
    if (!user) { toast({ title: 'Sign in to vote', variant: 'destructive' }); return; }
    setVoting(proposalId);
    try {
      const res = await fetch(`/api/governance/proposals/${proposalId}/vote`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choice }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Vote failed');
      setMyVotes(v => ({ ...v, [proposalId]: choice }));
      toast({ title: `Vote cast: ${choice.toUpperCase()}`, description: 'Your vote has been recorded.' });
      fetchProposals();
    } catch (err: any) {
      toast({ title: 'Vote failed', description: err.message, variant: 'destructive' });
    } finally {
      setVoting(null);
    }
  };

  const submitProposal = async () => {
    if (!user) { toast({ title: 'Sign in to create proposals', variant: 'destructive' }); return; }
    if (!newTitle.trim() || !newDesc.trim()) { toast({ title: 'Title and description required', variant: 'destructive' }); return; }
    setSubmitting(true);
    try {
      const endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const res = await fetch('/api/governance/proposals', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle, description: newDesc, proposalType: newType, endDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Submission failed');
      toast({ title: 'Proposal submitted!', description: 'Voting opens now and runs for 7 days.' });
      setShowCreate(false);
      setNewTitle(''); setNewDesc('');
      fetchProposals();
    } catch (err: any) {
      toast({ title: 'Submission failed', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = filter === 'all' ? proposals : proposals.filter(p => p.status === filter);

  const totalVotes = (p: Proposal) => +p.votesFor + +p.votesAgainst + +p.votesAbstain;
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
            <p className="text-muted-foreground text-sm mt-1">Shape the future of GYDSchain — vote on proposals with your staked GYDS</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={fetchProposals} disabled={loading}>
              <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            </Button>
            {user && (
              <Button onClick={() => setShowCreate(true)} className="gap-2">
                <Plus className="w-4 h-4" /> New Proposal
              </Button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Active Proposals', value: proposals.filter(p => p.status === 'active').length, icon: Clock, color: 'text-emerald-400' },
            { label: 'Total Proposals', value: proposals.length, icon: Vote, color: 'text-primary' },
            { label: 'Total Votes Cast', value: proposals.reduce((s, p) => s + totalVotes(p), 0).toLocaleString(), icon: Coins, color: 'text-neon-cyan' },
            { label: 'My Votes', value: Object.keys(myVotes).length, icon: Users, color: 'text-amber-400' },
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
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="proposals">Proposals</TabsTrigger>
            <TabsTrigger value="grants">Grants</TabsTrigger>
            <TabsTrigger value="treasury">Treasury</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="emergency">Emergency</TabsTrigger>
            {user && <TabsTrigger value="voting-power">Voting Power</TabsTrigger>}
            {user && <TabsTrigger value="delegation">Delegation</TabsTrigger>}
          </TabsList>

          <TabsContent value="proposals" className="space-y-4 mt-4">
            <div className="flex gap-2 flex-wrap">
              {['all', 'active', 'passed', 'rejected', 'pending'].map(f => (
                <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'}
                  onClick={() => setFilter(f)} className="capitalize text-xs h-7">{f}</Button>
              ))}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
                <RefreshCw className="w-5 h-5 animate-spin" /> Loading proposals…
              </div>
            ) : filtered.length === 0 ? (
              <GlassCard className="p-12 text-center text-muted-foreground">
                <Vote className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No proposals yet</p>
                {user && <p className="text-sm mt-1">Be the first — create a proposal above.</p>}
              </GlassCard>
            ) : (
              <div className="space-y-3">
                {filtered.map(p => {
                  const total = totalVotes(p);
                  const cfg = STATUS_CONFIG[p.status] ?? STATUS_CONFIG.pending;
                  const StatusIcon = cfg.icon;
                  const quorumMet = total >= +p.quorumRequired;
                  const isOpen = selected === p.id;
                  const myVote = myVotes[p.id];
                  return (
                    <GlassCard key={p.id} className="p-5 cursor-pointer hover:border-primary/40 transition-colors"
                      onClick={() => setSelected(isOpen ? null : p.id)}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Badge variant="outline" className={`text-xs ${cfg.color}`}>
                              <StatusIcon className="w-3 h-3 mr-1" /> {cfg.label}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              {TYPE_LABELS[p.proposalType] ?? p.proposalType}
                            </Badge>
                            {p.status === 'active' && (
                              <span className="text-xs text-muted-foreground">{daysLeft(p.endDate)}</span>
                            )}
                          </div>
                          <h3 className="font-semibold text-foreground">{p.title}</h3>
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{p.description}</p>
                        </div>
                        <ChevronRight className={cn('w-4 h-4 text-muted-foreground shrink-0 transition-transform', isOpen && 'rotate-90')} />
                      </div>

                      <div className="mt-4 space-y-1.5">
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>For: {pct(+p.votesFor, total)}%</span>
                          <span>Against: {pct(+p.votesAgainst, total)}%</span>
                          <span>Quorum: {quorumMet ? '✓ Met' : `${Math.min(100, Math.round((total / +p.quorumRequired) * 100))}%`}</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden flex">
                          <div className="bg-emerald-500 h-full transition-all" style={{ width: `${pct(+p.votesFor, total)}%` }} />
                          <div className="bg-red-500 h-full transition-all" style={{ width: `${pct(+p.votesAgainst, total)}%` }} />
                          <div className="bg-muted-foreground/30 h-full flex-1" />
                        </div>
                      </div>

                      {isOpen && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                          className="mt-4 pt-4 border-t border-border/30" onClick={e => e.stopPropagation()}>
                          <p className="text-sm mb-4 text-muted-foreground">{p.description}</p>
                          {p.status === 'active' && (
                            myVote ? (
                              <Badge className="gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Voted: {myVote}
                              </Badge>
                            ) : (
                              <div className="flex gap-2">
                                <Button size="sm" onClick={() => castVote(p.id, 'for')} disabled={!!voting}
                                  className="bg-emerald-600 hover:bg-emerald-700 gap-1">
                                  {voting === p.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} For
                                </Button>
                                <Button size="sm" variant="destructive" onClick={() => castVote(p.id, 'against')} disabled={!!voting} className="gap-1">
                                  <XCircle className="w-3 h-3" /> Against
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => castVote(p.id, 'abstain')} disabled={!!voting}>
                                  Abstain
                                </Button>
                              </div>
                            )
                          )}
                        </motion.div>
                      )}
                    </GlassCard>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Grants Tab */}
          <TabsContent value="grants" className="mt-4 space-y-4">
            <GlassCard className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold flex items-center gap-2">
                  <Coins className="w-4 h-4 text-primary" /> Grant Programme
                </h2>
                {user && (
                  <Button size="sm" onClick={() => {
                    setNewType('grant');
                    setShowCreate(true);
                  }} className="gap-2">
                    <Plus className="w-4 h-4" /> Apply for Grant
                  </Button>
                )}
              </div>

              {/* Grant tiers */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { tier: 'Micro Grant', amount: 'Up to 10,000 GYDS', desc: 'Small tools, scripts, and educational content', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' },
                  { tier: 'Builder Grant', amount: 'Up to 100,000 GYDS', desc: 'DApps, integrations, and developer tooling', color: 'text-primary', bg: 'bg-primary/10 border-primary/30' },
                  { tier: 'Foundation Grant', amount: 'Up to 500,000 GYDS', desc: 'Major protocol improvements and core infrastructure', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30' },
                ].map(g => (
                  <div key={g.tier} className={`p-4 rounded-xl border ${g.bg}`}>
                    <p className={`font-semibold text-sm ${g.color}`}>{g.tier}</p>
                    <p className="text-sm font-bold mt-1">{g.amount}</p>
                    <p className="text-xs text-muted-foreground mt-1">{g.desc}</p>
                  </div>
                ))}
              </div>

              {/* Grant proposals from DB */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Active Grant Applications</p>
                {proposals.filter(p => p.proposalType === 'grant').length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">
                    <Coins className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p>No grant applications yet</p>
                    {user && <p className="text-xs mt-1">Submit a grant proposal using the "Apply for Grant" button above.</p>}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {proposals.filter(p => p.proposalType === 'grant').map(p => {
                      const total = totalVotes(p);
                      const cfg = STATUS_CONFIG[p.status] ?? STATUS_CONFIG.pending;
                      const StatusIcon = cfg.icon;
                      const myVote = myVotes[p.id];
                      return (
                        <GlassCard key={p.id} className="p-4 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <Badge variant="outline" className={`text-xs ${cfg.color}`}>
                                  <StatusIcon className="w-3 h-3 mr-1" /> {cfg.label}
                                </Badge>
                                {p.status === 'active' && (
                                  <span className="text-xs text-muted-foreground">{daysLeft(p.endDate)}</span>
                                )}
                              </div>
                              <h3 className="font-semibold text-sm">{p.title}</h3>
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{p.description}</p>
                            </div>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden flex">
                            <div className="bg-emerald-500 h-full" style={{ width: `${pct(+p.votesFor, total)}%` }} />
                            <div className="bg-red-500 h-full" style={{ width: `${pct(+p.votesAgainst, total)}%` }} />
                          </div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>For: {pct(+p.votesFor, total)}% · Against: {pct(+p.votesAgainst, total)}%</span>
                            <span>{total.toLocaleString()} votes</span>
                          </div>
                          {p.status === 'active' && !myVote && user && (
                            <div className="flex gap-2 pt-1 border-t border-border/20">
                              <Button size="sm" onClick={() => castVote(p.id, 'for')} disabled={!!voting}
                                className="bg-emerald-600 hover:bg-emerald-700 gap-1 text-xs">
                                {voting === p.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} Support
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => castVote(p.id, 'against')} disabled={!!voting} className="gap-1 text-xs">
                                <XCircle className="w-3 h-3" /> Oppose
                              </Button>
                            </div>
                          )}
                          {myVote && (
                            <p className="text-xs text-muted-foreground pt-1 border-t border-border/20">
                              ✅ You voted: <strong>{myVote}</strong>
                            </p>
                          )}
                        </GlassCard>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* How it works */}
              <div className="p-4 bg-muted/20 rounded-xl text-sm space-y-2">
                <p className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">How It Works</p>
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  {[
                    '1. Submit a grant proposal with your project description and funding request',
                    '2. Community votes during a 7-day voting period',
                    '3. Grant passes if quorum (1M GYDS) is met and majority votes For',
                    '4. Funds are disbursed from DAO treasury upon passage',
                  ].map(s => <p key={s}>{s}</p>)}
                </div>
              </div>
            </GlassCard>
          </TabsContent>

          <TabsContent value="treasury" className="mt-4">
            <GlassCard className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold flex items-center gap-2">
                  <Coins className="w-4 h-4 text-primary" /> DAO Treasury
                </h2>
                <Button variant="outline" size="sm" onClick={fetchTreasury} disabled={loadingTreasury}>
                  <RefreshCw className={cn('w-3.5 h-3.5', loadingTreasury && 'animate-spin')} />
                </Button>
              </div>
              {loadingTreasury ? (
                <div className="flex items-center gap-2 text-muted-foreground py-4">
                  <RefreshCw className="w-4 h-4 animate-spin" /> Loading treasury…
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {treasury.map(coin => (
                    <div key={coin.coin} className="p-4 bg-muted/20 rounded-xl border border-border/30 space-y-1">
                      <p className="text-xs text-muted-foreground font-medium">{coin.coin} Balance</p>
                      <p className="text-lg font-bold">{Number(coin.balance).toLocaleString()} {coin.coin}</p>
                      {coin.usd_value && (
                        <p className="text-xs text-muted-foreground">≈ ${Number(coin.usd_value).toLocaleString()} USD</p>
                      )}
                      {coin.address && (
                        <p className="text-xs text-muted-foreground font-mono truncate">{coin.address.slice(0, 20)}…</p>
                      )}
                    </div>
                  ))}
                  {treasury.length === 0 && (
                    <div className="col-span-3 text-center py-6 text-muted-foreground text-sm">No treasury data</div>
                  )}
                </div>
              )}
              <div className="space-y-2">
                <p className="text-sm font-medium">Recent Treasury Proposals</p>
                {treasurySpending.length > 0 ? treasurySpending.map((tx: any, i: number) => (
                  <div key={i} className="flex justify-between items-center py-2 border-b border-border/20 text-sm">
                    <span className="text-muted-foreground truncate flex-1 mr-3">{tx.what ?? tx.title}</span>
                    <p className="text-muted-foreground text-xs shrink-0">
                      {tx.created_at ? new Date(tx.created_at).toLocaleDateString() : ''}
                    </p>
                  </div>
                )) : (
                  <p className="text-xs text-muted-foreground py-2">No treasury proposals yet.</p>
                )}
              </div>
            </GlassCard>
          </TabsContent>

          {/* Proposal Notifications */}
          <TabsContent value="notifications" className="mt-4 space-y-4">
            <GlassCard className="p-5 space-y-4">
              <h2 className="font-semibold flex items-center gap-2">
                <Bell className="w-4 h-4 text-primary" /> Governance Notifications
              </h2>
              <p className="text-xs text-muted-foreground">Get notified when new proposals are submitted, when voting is about to close, and when results are published.</p>
              <div className="space-y-3">
                {[
                  { label: 'New proposal submitted', desc: 'When anyone creates a new governance proposal', enabled: true },
                  { label: 'Proposal ending soon (24h)', desc: 'Reminder before voting period closes', enabled: true },
                  { label: 'Proposal result published', desc: 'When a proposal passes or is rejected', enabled: true },
                  { label: 'Your proposal voted on', desc: 'When someone votes on your proposals', enabled: false },
                  { label: 'Delegation changes', desc: 'When your delegated VP changes', enabled: false },
                  { label: 'Emergency proposals', desc: 'Immediate alert for fast-track proposals', enabled: true },
                ].map(n => (
                  <div key={n.label} className="flex items-center justify-between gap-3 p-3 bg-muted/20 rounded-xl">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{n.label}</p>
                      <p className="text-xs text-muted-foreground">{n.desc}</p>
                    </div>
                    <button
                      onClick={() => toast({ title: n.enabled ? 'Disabled' : 'Enabled', description: `Notification: ${n.label}` })}
                      className={`shrink-0 w-11 h-6 rounded-full transition-colors relative ${n.enabled ? 'bg-primary' : 'bg-muted'}`}>
                      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${n.enabled ? 'right-1' : 'left-1'}`} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="p-3 bg-muted/10 border border-border/20 rounded-lg text-xs text-muted-foreground">
                Notifications delivered in-app and via the notification bell. Email + push notifications launch with mainnet.
              </div>
            </GlassCard>
          </TabsContent>

          {/* Emergency Governance */}
          <TabsContent value="emergency" className="mt-4 space-y-4">
            <GlassCard className="p-4 border-red-500/30 bg-red-500/5 space-y-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-400" />
                <h2 className="font-semibold text-red-400">Emergency Fast-Track Governance</h2>
              </div>
              <p className="text-xs text-muted-foreground">Emergency proposals skip the 7-day standard voting period and resolve in <strong className="text-foreground">24 hours</strong>. Requires 2/3 of founder + admin multisig approval to initiate.</p>
            </GlassCard>
            <div className="space-y-3">
              {[
                { id: 'E-001', title: 'Emergency validator slashing — rogue node #7', status: 'resolved', time: '2 days ago', votes: '8/9 approved' },
                { id: 'E-002', title: 'Pause bridge — potential exploit detected on ETH side', status: 'active', time: '4 hours ago', votes: '5/9 approved' },
              ].map(e => (
                <GlassCard key={e.id} className={`p-4 space-y-2 border ${e.status === 'active' ? 'border-amber-500/40' : 'border-border/30'}`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs font-mono">{e.id}</Badge>
                      <Badge className={`text-xs ${e.status === 'active' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'}`}>
                        {e.status}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">{e.time}</span>
                  </div>
                  <p className="text-sm font-medium">{e.title}</p>
                  <p className="text-xs text-muted-foreground">{e.votes}</p>
                </GlassCard>
              ))}
            </div>
            <GlassCard className="p-4 space-y-3">
              <h3 className="font-semibold text-sm flex items-center gap-2"><Zap className="w-4 h-4 text-amber-400" /> Quadratic Voting</h3>
              <p className="text-xs text-muted-foreground">On emergency proposals, voting power is quadratically weighted — preventing whale dominance. A holder with 10,000 VP gets √10,000 = 100 effective votes.</p>
              <div className="grid grid-cols-2 gap-3 text-xs">
                {[
                  ['1,000 VP', '~31.6 votes'],
                  ['10,000 VP', '~100 votes'],
                  ['100,000 VP', '~316 votes'],
                  ['1,000,000 VP', '~1,000 votes'],
                ].map(([vp, votes]) => (
                  <div key={vp} className="flex justify-between p-2 bg-muted/20 rounded-lg">
                    <span className="text-muted-foreground">{vp}</span>
                    <span className="font-medium">{votes}</span>
                  </div>
                ))}
              </div>
            </GlassCard>
          </TabsContent>

          {user && (<>
            <TabsContent value="voting-power" className="mt-4">
              <GlassCard className="p-6 space-y-5">
                <h2 className="font-semibold flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" /> Your Voting Power
                </h2>
                {votingPower ? (
                  <>
                    <div className="text-center py-4">
                      <p className="text-5xl font-bold text-primary">{votingPower.total.toLocaleString()}</p>
                      <p className="text-sm text-muted-foreground mt-1">Total Voting Power</p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: 'Base Power', value: votingPower.fromBase, desc: 'Every user starts here', color: 'text-muted-foreground' },
                        { label: 'From Nodes', value: votingPower.fromNodes, desc: `${votingPower.nodes} nodes × 1,000`, color: 'text-emerald-400' },
                        { label: 'From XP', value: votingPower.fromXp, desc: `${votingPower.xp.toLocaleString()} XP ÷ 10`, color: 'text-primary' },
                        { label: 'From Stake', value: votingPower.fromStake, desc: `${votingPower.stake} GYDS staked`, color: 'text-amber-400' },
                      ].map(s => (
                        <div key={s.label} className="p-3 bg-muted/10 border border-border/20 rounded-xl text-center">
                          <p className={`text-xl font-bold ${s.color}`}>{s.value.toLocaleString()}</p>
                          <p className="text-xs font-medium mt-1">{s.label}</p>
                          <p className="text-xs text-muted-foreground">{s.desc}</p>
                        </div>
                      ))}
                    </div>
                    <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl text-sm text-muted-foreground space-y-1">
                      <p className="font-medium text-foreground flex items-center gap-1.5"><BarChart2 className="w-3.5 h-3.5" /> How to increase your voting power</p>
                      <ul className="list-disc list-inside space-y-0.5 text-xs">
                        <li>Run more approved nodes (+1,000 per node)</li>
                        <li>Earn XP through transactions, governance, and achievements (+1 per 10 XP)</li>
                        <li>Stake GYDS as a validator (+1 per GYDS staked)</li>
                      </ul>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Zap className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p>Loading voting power…</p>
                  </div>
                )}
              </GlassCard>
            </TabsContent>

            <TabsContent value="delegation" className="mt-4 space-y-4">
              <GlassCard className="p-6 space-y-4">
                <h2 className="font-semibold flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" /> Delegate Voting Power
                </h2>
                <p className="text-xs text-muted-foreground">
                  Delegate a portion of your voting power to a trusted address. They can vote on your behalf. You can revoke at any time.
                </p>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Delegate Address *</Label>
                    <Input value={delegateAddress} onChange={e => setDelegateAddress(e.target.value)}
                      placeholder="0x… or gyds1…" className="mt-1 font-mono text-sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Username (optional)</Label>
                      <Input value={delegateUsername} onChange={e => setDelegateUsername(e.target.value)}
                        placeholder="@username" className="mt-1 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">VP to delegate</Label>
                      <Input value={delegatePower} onChange={e => setDelegatePower(e.target.value)}
                        type="number" min="1" max={votingPower?.total ?? 1000} className="mt-1 text-sm" />
                    </div>
                  </div>
                  {votingPower && (
                    <p className="text-xs text-muted-foreground">
                      Your total voting power: <span className="text-primary font-bold">{votingPower.total.toLocaleString()} VP</span>
                    </p>
                  )}
                  <Button onClick={delegate} disabled={delegating} className="w-full gap-2">
                    {delegating ? <><RefreshCw className="w-4 h-4 animate-spin" /> Delegating…</> : <><Users className="w-4 h-4" /> Delegate Power</>}
                  </Button>
                </div>
              </GlassCard>

              {/* Existing delegations */}
              <GlassCard className="p-5 space-y-3">
                <h2 className="font-semibold flex items-center gap-2">
                  <ChevronRight className="w-4 h-4 text-muted-foreground" /> My Delegations
                </h2>
                {delegations.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No delegations yet.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {delegations.map((d: any) => (
                      <div key={d.id} className="flex items-center justify-between gap-3 p-3 bg-muted/20 rounded-xl">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {d.delegate_username && <span className="text-sm font-medium">{d.delegate_username}</span>}
                            <span className="text-xs font-mono text-muted-foreground">{d.delegate_address.slice(0,10)}…</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${d.active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-muted/30 text-muted-foreground'}`}>
                              {d.active ? 'active' : 'revoked'}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {d.power_delegated} VP · {new Date(d.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        {d.active && (
                          <Button size="sm" variant="ghost" onClick={() => revokeDelegate(d.id)}
                            className="text-red-400 hover:text-red-300 shrink-0 text-xs">
                            Revoke
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </GlassCard>

              {/* Liquid democracy info */}
              <GlassCard className="p-4 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground flex items-center gap-1.5"><Vote className="w-3.5 h-3.5" /> Liquid Democracy</p>
                <p>Delegation is fully revocable and non-custodial. Your delegate can never transfer your tokens — only cast votes on your behalf during active voting periods.</p>
              </GlassCard>
            </TabsContent>
          </>)}
        </Tabs>

        {/* Create Proposal Modal */}
        {showCreate && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowCreate(false)}>
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
                  Voting period: 7 days. Requires quorum of 1M GYDS to pass.
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button onClick={submitProposal} disabled={submitting}>
                  {submitting ? <><RefreshCw className="w-4 h-4 animate-spin mr-2" />Submitting…</> : 'Submit'}
                </Button>
              </div>
            </GlassCard>
          </motion.div>
        )}
      </motion.div>
    </Layout>
  );
};

export default GovernancePage;
