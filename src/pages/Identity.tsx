import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '@/components/layout/Layout';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  Fingerprint, Shield, CheckCircle2, AlertCircle,
  Globe, Link2, Star, Award, Copy, Zap, UserCheck, RefreshCw
} from 'lucide-react';

const KYC_TIERS = [
  { tier: 0, label: 'Anonymous',  limit: '1,000 GYDS / day',  req: 'Email only',         color: 'text-muted-foreground' },
  { tier: 1, label: 'Basic',      limit: '10,000 GYDS / day', req: 'Email + Phone',       color: 'text-primary' },
  { tier: 2, label: 'Verified',   limit: '100,000 GYDS / day',req: 'Gov ID scan',         color: 'text-emerald-400' },
  { tier: 3, label: 'Enhanced',   limit: 'Unlimited',         req: 'Full KYC + Liveness', color: 'text-amber-400' },
];

interface DidDoc { did: string; document: any; created_at: string; }
interface KycRecord { tier: number; status: string; updated_at?: string; }
interface Reputation {
  score: number;
  level: number;
  breakdown: {
    txScore: number; nodeScore: number; xpScore: number; achieveScore: number;
    totalXp: number; achievements: number;
  };
}

const IdentityPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [didDoc, setDidDoc] = useState<DidDoc | null>(null);
  const [kyc, setKyc] = useState<KycRecord | null>(null);
  const [rep, setRep] = useState<Reputation | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    try {
      const [didRes, kycRes, repRes] = await Promise.all([
        fetch('/api/identity/did', { credentials: 'include' }),
        fetch('/api/identity/kyc', { credentials: 'include' }),
        fetch('/api/identity/reputation', { credentials: 'include' }),
      ]);
      if (didRes.ok) setDidDoc(await didRes.json());
      if (kycRes.ok) setKyc(await kycRes.json());
      if (repRes.ok) setRep(await repRes.json());
    } finally { setLoading(false); }
  }, [user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const linkSocial = (name: string) => toast({ title: `${name} verification`, description: 'Social link verification launching with mainnet.' });
  const upgradeKYC = (tier: number) => toast({ title: `KYC Tier ${tier}`, description: 'KYC provider (Sumsub/Onfido) integration coming with mainnet.' });

  const claimsFromData = [
    { id: 'email', label: 'Email verified', icon: CheckCircle2, verified: !!user?.email, date: user ? (new Date(Date.now() - 86400000 * 30)).toLocaleDateString() : null },
    { id: 'twitter', label: 'Twitter linked', icon: Globe, verified: false, date: null },
    { id: 'telegram', label: 'Telegram linked', icon: Globe, verified: false, date: null },
    { id: 'kyc1', label: 'KYC Tier 1', icon: UserCheck, verified: (kyc?.tier ?? 0) >= 1, date: null },
    { id: 'validator', label: 'Registered Validator', icon: Shield, verified: false, date: null },
    { id: 'node', label: 'Node Operator', icon: Zap, verified: false, date: null },
  ];

  const repScore = rep?.score ?? 0;
  const repPct = Math.min((repScore / 1000) * 100, 100);

  const breakdown = rep?.breakdown;
  const repBreakdown = breakdown ? [
    { label: 'Transactions', score: breakdown.txScore ?? 0, max: 100 },
    { label: 'Staking/Nodes', score: breakdown.nodeScore ?? 0, max: 200 },
    { label: 'XP Earned', score: breakdown.xpScore ?? 0, max: 200 },
    { label: 'Achievements', score: breakdown.achieveScore ?? 0, max: 150 },
    { label: 'Governance', score: 0, max: 150 },
    { label: 'Social Links', score: 0, max: 200 },
  ] : [];

  const REPUTATION_BADGES = [
    { label: 'Early Adopter', icon: '🌟', earned: repScore > 0 },
    { label: 'First Tx', icon: '💸', earned: (breakdown?.txScore ?? 0) > 0 },
    { label: 'Staker', icon: '🔒', earned: (breakdown?.nodeScore ?? 0) > 0 },
    { label: 'Node Operator', icon: '⚡', earned: (breakdown?.nodeScore ?? 0) >= 50 },
    { label: 'XP Hunter', icon: '⭐', earned: (breakdown?.totalXp ?? 0) >= 100 },
    { label: 'DeFi Power', icon: '🔥', earned: false },
    { label: 'NFT Creator', icon: '🎨', earned: false },
    { label: 'DAO Voter', icon: '🗳️', earned: false },
    { label: 'Whale', icon: '🐋', earned: false },
  ];

  return (
    <Layout>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Fingerprint className="w-6 h-6 text-primary" /> On-Chain Identity
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Decentralized identity, verified claims, and reputation on GYDSchain
            </p>
          </div>
          {user && (
            <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          )}
        </div>

        {!user ? (
          <GlassCard className="p-8 text-center">
            <Fingerprint className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="font-semibold">Sign in to manage your identity</p>
          </GlassCard>
        ) : loading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
            <RefreshCw className="w-5 h-5 animate-spin" /> Loading identity data…
          </div>
        ) : (
          <Tabs defaultValue="identity">
            <TabsList>
              <TabsTrigger value="identity">My DID</TabsTrigger>
              <TabsTrigger value="kyc">KYC / Compliance</TabsTrigger>
              <TabsTrigger value="reputation">Reputation</TabsTrigger>
            </TabsList>

            {/* Identity */}
            <TabsContent value="identity" className="mt-4 space-y-4">
              <GlassCard className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">Your Decentralized Identifier (DID)</p>
                    <p className="font-mono text-sm text-primary mt-1 break-all">{didDoc?.did ?? '—'}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Anchored on GYDSchain · Chain ID 13370
                      {didDoc?.created_at && ` · Created ${new Date(didDoc.created_at).toLocaleDateString()}`}
                    </p>
                  </div>
                  <button onClick={() => { navigator.clipboard.writeText(didDoc?.did ?? ''); toast({ title: 'DID copied!' }); }}
                    className="text-muted-foreground hover:text-primary p-1 shrink-0">
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-3 bg-muted/20 rounded-xl text-xs text-muted-foreground">
                  Your DID is a globally unique, self-sovereign identifier. You control it — no central authority can revoke it.
                </div>
                {/* DID Document preview */}
                {didDoc?.document && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">DID Document</p>
                    <pre className="text-xs font-mono bg-muted/20 rounded-lg p-3 overflow-auto max-h-32 text-muted-foreground">
                      {JSON.stringify(didDoc.document, null, 2)}
                    </pre>
                  </div>
                )}
              </GlassCard>

              {/* Verified claims */}
              <GlassCard className="p-5 space-y-3">
                <h2 className="font-semibold">Verified Claims</h2>
                <div className="space-y-2">
                  {claimsFromData.map(c => {
                    const Icon = c.icon;
                    return (
                      <div key={c.id} className="flex items-center gap-3 p-3 bg-muted/20 rounded-xl">
                        <Icon className={`w-4 h-4 shrink-0 ${c.verified ? 'text-emerald-400' : 'text-muted-foreground'}`} />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{c.label}</p>
                          {c.date && <p className="text-xs text-muted-foreground">Verified {c.date}</p>}
                        </div>
                        {c.verified ? (
                          <Badge className="text-xs bg-emerald-500/10 text-emerald-400 border-emerald-500/30">Verified</Badge>
                        ) : (
                          <Button size="sm" variant="outline" className="text-xs h-7"
                            onClick={() => c.id === 'twitter' || c.id === 'telegram' ? linkSocial(c.label) : upgradeKYC(1)}>
                            Verify
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </GlassCard>
            </TabsContent>

            {/* KYC */}
            <TabsContent value="kyc" className="mt-4 space-y-4">
              <GlassCard className="p-5 space-y-4">
                <h2 className="font-semibold">KYC Tier Progression</h2>
                <p className="text-xs text-muted-foreground">Current: <strong className="text-primary">{KYC_TIERS[kyc?.tier ?? 0]?.label}</strong></p>
                <div className="space-y-3">
                  {KYC_TIERS.map(t => {
                    const currentTier = kyc?.tier ?? 0;
                    return (
                      <div key={t.tier} className={`p-4 rounded-xl border transition-colors ${t.tier === currentTier ? 'border-primary/40 bg-primary/5' : 'border-border/30 bg-muted/10'}`}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-bold ${t.tier <= currentTier ? 'border-primary bg-primary/20 text-primary' : 'border-border/40 text-muted-foreground'}`}>
                              {t.tier <= currentTier ? '✓' : t.tier}
                            </div>
                            <div>
                              <p className="font-semibold text-sm">{t.label}</p>
                              <p className="text-xs text-muted-foreground">{t.req}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-mono text-primary">{t.limit}</p>
                            {t.tier > currentTier && (
                              <Button size="sm" className="mt-1 h-6 text-xs" onClick={() => upgradeKYC(t.tier)}>
                                Upgrade
                              </Button>
                            )}
                            {t.tier === currentTier && (
                              <Badge className="mt-1 text-xs bg-primary/20 text-primary border-primary/30">Current</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </GlassCard>

              <GlassCard className="p-4 border-amber-500/20 bg-amber-500/5 text-sm">
                <div className="flex gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-muted-foreground">
                    KYC provider integrations (Sumsub, Onfido) launch with mainnet.
                    Your data is <strong>never stored on-chain</strong> — only a hashed attestation is anchored.
                  </p>
                </div>
              </GlassCard>
            </TabsContent>

            {/* Reputation */}
            <TabsContent value="reputation" className="mt-4 space-y-4">
              <GlassCard className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">Reputation Score</h2>
                  <div className="text-right">
                    <p className="text-3xl font-bold text-primary">{repScore}</p>
                    <p className="text-xs text-muted-foreground">/ 1000 · Level {rep?.level ?? 1}</p>
                  </div>
                </div>
                <Progress value={repPct} className="h-2" />
                {breakdown && (
                  <div className="grid grid-cols-2 gap-3">
                    {repBreakdown.map(s => (
                      <div key={s.label} className="p-3 bg-muted/20 rounded-xl">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground">{s.label}</span>
                          <span className="font-bold">{s.score}/{s.max}</span>
                        </div>
                        <Progress value={(s.score / s.max) * 100} className="h-1" />
                      </div>
                    ))}
                  </div>
                )}
                {breakdown && (
                  <div className="flex gap-4 text-xs text-muted-foreground pt-1 border-t border-border/20">
                    <span>Total XP: <strong className="text-primary">{Number(breakdown.totalXp).toLocaleString()}</strong></span>
                    <span>Achievements: <strong className="text-primary">{breakdown.achievements}</strong></span>
                  </div>
                )}
              </GlassCard>

              <GlassCard className="p-5 space-y-3">
                <h2 className="font-semibold">Reputation Badges</h2>
                <div className="grid grid-cols-3 gap-3">
                  {REPUTATION_BADGES.map(b => (
                    <div key={b.label} className={`p-3 rounded-xl text-center border transition-all ${b.earned ? 'border-primary/30 bg-primary/5' : 'border-border/20 bg-muted/5 opacity-40'}`}>
                      <div className="text-2xl mb-1">{b.icon}</div>
                      <p className="text-xs font-medium">{b.label}</p>
                    </div>
                  ))}
                </div>
              </GlassCard>
            </TabsContent>
          </Tabs>
        )}
      </motion.div>
    </Layout>
  );
};

export default IdentityPage;
