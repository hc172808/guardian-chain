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
import { Vote, Plus, Clock, CheckCircle2, XCircle, AlertCircle, TrendingUp, Users, Coins, RefreshCw, ChevronRight, Lock } from 'lucide-react';
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

  useEffect(() => { fetchProposals(); }, [fetchProposals]);
  useEffect(() => { fetchMyVotes(); }, [fetchMyVotes]);

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
          <TabsList>
            <TabsTrigger value="proposals">Proposals</TabsTrigger>
            <TabsTrigger value="treasury">Treasury</TabsTrigger>
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
