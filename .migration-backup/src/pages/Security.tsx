import { Layout } from '@/components/layout/Layout';
import { GlassCard } from '@/components/ui/GlassCard';
import { motion } from 'framer-motion';
import { Shield, AlertTriangle, CheckCircle, XCircle, Info, Lock, Users, Pickaxe, Blocks, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AuditItem {
  title: string;
  status: 'pass' | 'mitigated' | 'info';
  category: string;
  description: string;
  mitigation?: string;
}

const auditItems: AuditItem[] = [
  {
    title: '51% Hash Power Attack',
    status: 'pass',
    category: 'Consensus',
    description: 'Hash power cannot influence block production or transaction ordering.',
    mitigation: 'PoW is strictly for reward distribution. All consensus decisions are made by PoS validators.',
  },
  {
    title: 'Mining Cartel Formation',
    status: 'pass',
    category: 'Mining',
    description: 'Large mining pools cannot collude to control the network.',
    mitigation: 'Miners only earn rewards, they have no say in block content or finality.',
  },
  {
    title: 'Botnet Mining Takeover',
    status: 'pass',
    category: 'Mining',
    description: 'Botnets cannot dominate mining rewards.',
    mitigation: 'Human score verification, session caps, address caps, and rate limiting prevent bot dominance.',
  },
  {
    title: 'Double Spending',
    status: 'pass',
    category: 'Transaction',
    description: 'Same tokens cannot be spent twice.',
    mitigation: 'Strict nonce ordering + deterministic state + PoS finality make double spends impossible.',
  },
  {
    title: 'Transaction Reordering',
    status: 'pass',
    category: 'Transaction',
    description: 'Miners cannot reorder transactions for profit.',
    mitigation: 'Transaction ordering is controlled exclusively by PoS validators, not miners.',
  },
  {
    title: 'Finality Reversion',
    status: 'pass',
    category: 'Consensus',
    description: 'Finalized blocks cannot be reverted.',
    mitigation: '2/3 stake attestation creates irreversible finality. No forks after finalization.',
  },
  {
    title: 'Nonce Replay',
    status: 'pass',
    category: 'Transaction',
    description: 'Old transactions cannot be replayed.',
    mitigation: 'Monotonically increasing nonces per account. Reused nonces rejected at protocol level.',
  },
  {
    title: 'Mining Speed Abuse',
    status: 'pass',
    category: 'Mining',
    description: 'Fast miners cannot disproportionately earn rewards.',
    mitigation: 'Difficulty adjustment penalizes abnormally fast miners. Rate limiting enforced.',
  },
  {
    title: 'Sybil Attack (Mining)',
    status: 'mitigated',
    category: 'Mining',
    description: 'Creating many addresses to bypass caps.',
    mitigation: 'Per-address daily caps scale inversely with address count. Diminishing returns.',
  },
  {
    title: 'Validator Centralization',
    status: 'info',
    category: 'Consensus',
    description: 'Large stake holders have more influence.',
    mitigation: 'Inherent to PoS. Economic incentives align validators with network health.',
  },
];

const Security = () => {
  const passCount = auditItems.filter(i => i.status === 'pass').length;
  const mitigatedCount = auditItems.filter(i => i.status === 'mitigated').length;
  const infoCount = auditItems.filter(i => i.status === 'info').length;

  return (
    <Layout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-6"
      >
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Shield className="w-8 h-8 text-primary" />
            Security Audit
          </h1>
          <p className="text-muted-foreground mt-2">
            Comprehensive security analysis of the ChainCore protocol
          </p>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <GlassCard className="text-center">
            <div className="text-4xl font-bold text-gradient-primary mb-2">
              {auditItems.length}
            </div>
            <p className="text-sm text-muted-foreground">Vectors Analyzed</p>
          </GlassCard>
          
          <GlassCard className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <CheckCircle className="w-6 h-6 text-neon-emerald" />
              <span className="text-4xl font-bold text-neon-emerald">{passCount}</span>
            </div>
            <p className="text-sm text-muted-foreground">Fully Protected</p>
          </GlassCard>
          
          <GlassCard className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <AlertTriangle className="w-6 h-6 text-neon-amber" />
              <span className="text-4xl font-bold text-neon-amber">{mitigatedCount}</span>
            </div>
            <p className="text-sm text-muted-foreground">Mitigated</p>
          </GlassCard>
          
          <GlassCard className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Info className="w-6 h-6 text-primary" />
              <span className="text-4xl font-bold text-primary">{infoCount}</span>
            </div>
            <p className="text-sm text-muted-foreground">Informational</p>
          </GlassCard>
        </div>

        {/* Security Model Visualization */}
        <GlassCard>
          <h2 className="text-xl font-semibold mb-6">Security Model</h2>
          
          <div className="relative">
            <div className="grid grid-cols-3 gap-8 items-center">
              {/* Attackers */}
              <div className="text-center">
                <h3 className="font-medium mb-4 text-neon-rose">Attack Vectors</h3>
                <div className="space-y-3">
                  {['51% Hashpower', 'Mining Cartels', 'Botnets', 'Replay Attacks'].map((attack) => (
                    <div key={attack} className="p-3 rounded-lg bg-neon-rose/10 border border-neon-rose/20">
                      <XCircle className="w-4 h-4 text-neon-rose inline mr-2" />
                      <span className="text-sm">{attack}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Protection Layer */}
              <div className="text-center">
                <h3 className="font-medium mb-4 text-primary">Protection Layer</h3>
                <div className="p-6 rounded-xl bg-primary/10 border-2 border-primary/30 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent" />
                  <Shield className="w-12 h-12 text-primary mx-auto mb-3" />
                  <p className="font-medium">PoS Consensus</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Sole authority for finality
                  </p>
                  <div className="flex items-center justify-center gap-2 mt-4 text-xs">
                    <ArrowRight className="w-4 h-4 text-neon-rose rotate-180" />
                    <span className="text-neon-rose">Blocked</span>
                  </div>
                </div>
              </div>

              {/* Protected Assets */}
              <div className="text-center">
                <h3 className="font-medium mb-4 text-neon-emerald">Protected Assets</h3>
                <div className="space-y-3">
                  {['Block Production', 'TX Ordering', 'Finality', 'State Integrity'].map((asset) => (
                    <div key={asset} className="p-3 rounded-lg bg-neon-emerald/10 border border-neon-emerald/20">
                      <Lock className="w-4 h-4 text-neon-emerald inline mr-2" />
                      <span className="text-sm">{asset}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Detailed Audit */}
        <GlassCard className="p-0 overflow-hidden">
          <div className="p-4 border-b border-border/50">
            <h2 className="text-lg font-semibold">Detailed Security Analysis</h2>
          </div>
          
          <div className="divide-y divide-border/30">
            {auditItems.map((item, index) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                className="p-4 hover:bg-secondary/10 transition-colors"
              >
                <div className="flex items-start gap-4">
                  <div className={cn(
                    'p-2 rounded-lg flex-shrink-0',
                    item.status === 'pass' && 'bg-neon-emerald/10',
                    item.status === 'mitigated' && 'bg-neon-amber/10',
                    item.status === 'info' && 'bg-primary/10'
                  )}>
                    {item.status === 'pass' && <CheckCircle className="w-5 h-5 text-neon-emerald" />}
                    {item.status === 'mitigated' && <AlertTriangle className="w-5 h-5 text-neon-amber" />}
                    {item.status === 'info' && <Info className="w-5 h-5 text-primary" />}
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium">{item.title}</h3>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                        {item.category}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                    {item.mitigation && (
                      <p className="text-sm mt-2 p-2 rounded bg-secondary/30">
                        <span className="text-primary font-medium">Mitigation: </span>
                        {item.mitigation}
                      </p>
                    )}
                  </div>
                  
                  <div className={cn(
                    'text-xs font-medium px-3 py-1 rounded-full flex-shrink-0',
                    item.status === 'pass' && 'bg-neon-emerald/10 text-neon-emerald',
                    item.status === 'mitigated' && 'bg-neon-amber/10 text-neon-amber',
                    item.status === 'info' && 'bg-primary/10 text-primary'
                  )}>
                    {item.status === 'pass' && 'SECURE'}
                    {item.status === 'mitigated' && 'MITIGATED'}
                    {item.status === 'info' && 'INFO'}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </GlassCard>

        {/* Key Insight */}
        <GlassCard className="border-primary/30 bg-primary/5">
          <div className="flex items-start gap-4">
            <Shield className="w-8 h-8 text-primary flex-shrink-0" />
            <div>
              <h3 className="font-semibold mb-2">Key Security Insight</h3>
              <p className="text-muted-foreground">
                The fundamental security of ChainCore comes from the <span className="text-primary font-medium">complete separation</span> of 
                mining (rewards) from consensus (finality). Hash power can never influence block production, transaction 
                ordering, or finality decisions. This architecture makes traditional PoW attacks like 51% attacks, 
                selfish mining, and mining cartels <span className="text-neon-emerald font-medium">fundamentally impossible</span>.
              </p>
            </div>
          </div>
        </GlassCard>
      </motion.div>
    </Layout>
  );
};

export default Security;
