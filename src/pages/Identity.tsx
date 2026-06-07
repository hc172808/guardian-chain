import { useState } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '@/components/layout/Layout';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  Fingerprint, Shield, CheckCircle2, Clock, AlertCircle,
  Globe, Link2, Star, Award, Copy, Zap, UserCheck
} from 'lucide-react';

const KYC_TIERS = [
  { tier: 0, label: 'Anonymous',  limit: '1,000 GYDS / day',  req: 'Email only',        color: 'text-muted-foreground' },
  { tier: 1, label: 'Basic',      limit: '10,000 GYDS / day', req: 'Email + Phone',      color: 'text-primary' },
  { tier: 2, label: 'Verified',   limit: '100,000 GYDS / day',req: 'Gov ID scan',        color: 'text-emerald-400' },
  { tier: 3, label: 'Enhanced',   limit: 'Unlimited',         req: 'Full KYC + Liveness',color: 'text-amber-400' },
];

const CLAIMS = [
  { id: 'email',    label: 'Email verified',      icon: CheckCircle2, verified: true,  date: '2025-01-15' },
  { id: 'twitter',  label: 'Twitter linked',      icon: Globe,        verified: false, date: null },
  { id: 'telegram', label: 'Telegram linked',     icon: Globe,        verified: false, date: null },
  { id: 'kyc1',     label: 'KYC Tier 1',          icon: UserCheck,    verified: false, date: null },
  { id: 'validator',label: 'Registered Validator',icon: Shield,       verified: false, date: null },
  { id: 'node',     label: 'Node Operator',       icon: Zap,          verified: false, date: null },
];

const IdentityPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentTier] = useState(0);
  const [did] = useState(user ? `did:gyds:${user.id.slice(0, 16)}` : null);
  const [repScore] = useState(247);

  const linkSocial = (name: string) => toast({ title: `${name} verification`, description: 'Coming soon — social link verification launching with mainnet.' });
  const upgradeKYC = (tier: number) => toast({ title: `KYC Tier ${tier}`, description: 'KYC provider integration (Sumsub/Onfido) coming soon.' });

  return (
    <Layout>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Fingerprint className="w-6 h-6 text-primary" /> On-Chain Identity
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Decentralized identity, verified claims, and reputation on GYDSchain
          </p>
        </div>

        {!user ? (
          <GlassCard className="p-8 text-center">
            <Fingerprint className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="font-semibold">Sign in to manage your identity</p>
          </GlassCard>
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
                  <div>
                    <p className="text-xs text-muted-foreground">Your Decentralized Identifier (DID)</p>
                    <p className="font-mono text-sm text-primary mt-1 break-all">{did}</p>
                  </div>
                  <button onClick={() => { navigator.clipboard.writeText(did ?? ''); toast({ title: 'DID copied!' }); }}
                    className="text-muted-foreground hover:text-primary p-1"><Copy className="w-4 h-4" /></button>
                </div>
                <div className="p-3 bg-muted/20 rounded-xl text-xs text-muted-foreground">
                  Your DID is a globally unique, self-sovereign identifier anchored to the GYDSchain.
                  You control it — no central authority can revoke it.
                </div>
              </GlassCard>

              {/* Verified claims */}
              <GlassCard className="p-5 space-y-3">
                <h2 className="font-semibold">Verified Claims</h2>
                <div className="space-y-2">
                  {CLAIMS.map(c => {
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
                <div className="space-y-3">
                  {KYC_TIERS.map(t => (
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
                  ))}
                </div>
              </GlassCard>

              <GlassCard className="p-4 border-amber-500/20 bg-amber-500/5 text-sm">
                <div className="flex gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-muted-foreground">
                    KYC provider integrations (Sumsub, Onfido, Persona) are launching with mainnet.
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
                    <p className="text-xs text-muted-foreground">/ 1000</p>
                  </div>
                </div>
                <Progress value={(repScore / 1000) * 100} className="h-2" />
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Tx History',  score: 45, max: 100 },
                    { label: 'Staking',     score: 80, max: 200 },
                    { label: 'Governance',  score: 0,  max: 150 },
                    { label: 'Node Uptime', score: 0,  max: 200 },
                    { label: 'LP Activity', score: 72, max: 150 },
                    { label: 'Social Links',score: 50, max: 200 },
                  ].map(s => (
                    <div key={s.label} className="p-3 bg-muted/20 rounded-xl">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">{s.label}</span>
                        <span className="font-bold">{s.score}/{s.max}</span>
                      </div>
                      <Progress value={(s.score / s.max) * 100} className="h-1" />
                    </div>
                  ))}
                </div>
              </GlassCard>

              <GlassCard className="p-5 space-y-3">
                <h2 className="font-semibold">Reputation Badges</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { label: 'Early Adopter', icon: '🌟', earned: true },
                    { label: 'First Tx',      icon: '💸', earned: true },
                    { label: 'Staker',        icon: '🔒', earned: true },
                    { label: 'Node Operator', icon: '⚡', earned: false },
                    { label: 'Validator',     icon: '🛡️', earned: false },
                    { label: 'DeFi Power',    icon: '🔥', earned: false },
                    { label: 'NFT Creator',   icon: '🎨', earned: false },
                    { label: 'DAO Voter',     icon: '🗳️', earned: false },
                    { label: 'Whale',         icon: '🐋', earned: false },
                  ].map(b => (
                    <div key={b.label} className={`p-3 rounded-xl text-center border ${b.earned ? 'border-primary/30 bg-primary/5' : 'border-border/20 bg-muted/5 opacity-40'}`}>
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
