import { Layout } from '@/components/layout/Layout';
import { GlassCard } from '@/components/ui/GlassCard';
import { motion } from 'framer-motion';
import { FileText, Code, Shield, Pickaxe, Blocks, ArrowRight, Check } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ANTI_BOT_FORMULAS, DIFFICULTY_FORMULAS } from '@/lib/blockchain';

const Protocol = () => {
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
            <FileText className="w-8 h-8 text-primary" />
            Protocol Documentation
          </h1>
          <p className="text-muted-foreground mt-2">
            Technical specifications for the ChainCore hybrid consensus system
          </p>
        </div>

        {/* Architecture Overview */}
        <GlassCard>
          <h2 className="text-xl font-semibold mb-4 text-gradient-primary">Architecture Overview</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h3 className="font-medium mb-3 flex items-center gap-2">
                <Shield className="w-4 h-4 text-neon-emerald" />
                Proof-of-Stake (Consensus)
              </h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-neon-emerald mt-0.5 flex-shrink-0" />
                  <span>Sole authority for block finality</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-neon-emerald mt-0.5 flex-shrink-0" />
                  <span>Transaction ordering and inclusion</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-neon-emerald mt-0.5 flex-shrink-0" />
                  <span>Validator selection via stake weight</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-neon-emerald mt-0.5 flex-shrink-0" />
                  <span>Finality after 2/3 stake attestation</span>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-medium mb-3 flex items-center gap-2">
                <Pickaxe className="w-4 h-4 text-neon-amber" />
                Proof-of-Work (Rewards Only)
              </h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-neon-amber mt-0.5 flex-shrink-0" />
                  <span>CPU/Browser mining for token distribution</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-neon-amber mt-0.5 flex-shrink-0" />
                  <span>No influence on block production</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-neon-amber mt-0.5 flex-shrink-0" />
                  <span>Anti-bot protection mechanisms</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-neon-amber mt-0.5 flex-shrink-0" />
                  <span>Rate-limited reward distribution</span>
                </li>
              </ul>
            </div>
          </div>
        </GlassCard>

        {/* Technical Specs */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Anti-Bot Formulas */}
          <GlassCard>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Code className="w-5 h-5 text-primary" />
              Anti-Bot Formulas
            </h2>
            
            <div className="space-y-4">
              <FormulaBlock
                title="Human Score Calculation"
                formula="humanScore = min(100, max(0, CV × 200))"
                description="Where CV = σ(timing) / μ(timing). Bots have consistent timing (low CV), humans don't."
              />
              
              <FormulaBlock
                title="Max Shares Per Minute"
                formula="maxShares = floor((60 / difficulty) × humanMultiplier)"
                description="humanMultiplier = 0.5 + (humanScore / 200), ranges from 0.5× to 1×"
              />
              
              <FormulaBlock
                title="Session Reward Cap"
                formula="sessionCap = baseReward × log₂(hours + 1) × 10"
                description="Logarithmic scaling prevents long sessions from being too profitable"
              />
              
              <FormulaBlock
                title="Daily Address Cap"
                formula="dailyCap = (networkReward × 0.1) / max(1, log₂(addressCount))"
                description="Scales inversely with address count to prevent Sybil attacks"
              />
            </div>
          </GlassCard>

          {/* Difficulty Curves */}
          <GlassCard>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Blocks className="w-5 h-5 text-primary" />
              Difficulty Adjustment
            </h2>
            
            <div className="space-y-4">
              <FormulaBlock
                title="Difficulty Adjustment"
                formula="newDiff = currentDiff × clamp(targetTime / actualTime, 0.5, 2)"
                description="Adjusts between 0.5× and 2× per period to maintain target block time"
              />
              
              <FormulaBlock
                title="Network Difficulty"
                formula="netDiff = (totalHashRate × 10) / targetSharesPerBlock"
                description="Scales with total network hash rate"
              />
              
              <FormulaBlock
                title="Miner Difficulty Penalty"
                formula="minerDiff = netDiff × (hashRatio)^1.5 if ratio > 2"
                description="Penalizes miners with unusually high hash rates (anti-ASIC)"
              />
              
              <div className="p-3 rounded-lg bg-secondary/30 mt-4">
                <p className="text-xs text-muted-foreground">
                  <span className="text-primary font-medium">Target Block Time:</span>{' '}
                  {DIFFICULTY_FORMULAS.TARGET_BLOCK_TIME / 1000} seconds
                </p>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Mining Protocol Spec */}
        <GlassCard>
          <h2 className="text-xl font-semibold mb-4">Mining Protocol Specification</h2>
          
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="stratum">
              <AccordionTrigger>Stratum-Like Protocol</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4 text-sm">
                  <p className="text-muted-foreground">
                    ChainCore uses a Stratum-compatible protocol for miner communication:
                  </p>
                  <div className="p-4 rounded-lg bg-secondary/30 font-mono text-xs overflow-x-auto">
                    <pre>{`// Subscribe
{"id": 1, "method": "mining.subscribe", "params": ["ChainCore/1.0"]}

// Authorize
{"id": 2, "method": "mining.authorize", "params": ["address", "x"]}

// Submit share
{"id": 4, "method": "mining.submit", "params": ["address", "job_id", "nonce", "ntime"]}`}</pre>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
            
            <AccordionItem value="validation">
              <AccordionTrigger>Share Validation</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>Each submitted share undergoes validation:</p>
                  <ol className="list-decimal list-inside space-y-1 ml-2">
                    <li>Verify job_id is current and not stale</li>
                    <li>Check nonce hasn't been submitted before</li>
                    <li>Validate hash meets current difficulty target</li>
                    <li>Apply rate limiting based on human score</li>
                    <li>Credit reward if within session/address caps</li>
                  </ol>
                </div>
              </AccordionContent>
            </AccordionItem>
            
            <AccordionItem value="pools">
              <AccordionTrigger>Pool Mining Support</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>Both solo and pool mining are supported:</p>
                  <div className="grid grid-cols-2 gap-4 mt-2">
                    <div className="p-3 rounded bg-secondary/30">
                      <p className="font-medium text-foreground mb-1">Solo Mining</p>
                      <p className="text-xs">Connect directly to lite nodes. Full reward for valid shares.</p>
                    </div>
                    <div className="p-3 rounded bg-secondary/30">
                      <p className="font-medium text-foreground mb-1">Pool Mining</p>
                      <p className="text-xs">Proportional reward distribution. Lower variance for small miners.</p>
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
            
            <AccordionItem value="browser">
              <AccordionTrigger>Browser Mining API</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 text-sm">
                  <p className="text-muted-foreground">WebAssembly-based mining for browsers:</p>
                  <div className="p-4 rounded-lg bg-secondary/30 font-mono text-xs overflow-x-auto">
                    <pre>{`// Initialize miner
const miner = new ChainCoreMiner({
  address: '0x...',
  threads: navigator.hardwareConcurrency,
  throttle: 0.8 // Use 80% of CPU
});

// Start mining
miner.start();

// Events
miner.on('share', (share) => console.log('Share submitted'));
miner.on('reward', (amount) => console.log('Reward:', amount));`}</pre>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </GlassCard>

        {/* Double Spending Prevention */}
        <GlassCard>
          <h2 className="text-xl font-semibold mb-4">Double-Spending Prevention</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-4 rounded-lg bg-secondary/30">
              <h3 className="font-medium mb-2 text-neon-emerald">Deterministic State</h3>
              <p className="text-sm text-muted-foreground">
                State transitions are deterministic. Same inputs always produce same outputs. No ambiguity in transaction execution.
              </p>
            </div>
            <div className="p-4 rounded-lg bg-secondary/30">
              <h3 className="font-medium mb-2 text-neon-amber">Strict Nonce Ordering</h3>
              <p className="text-sm text-muted-foreground">
                Each account has monotonically increasing nonce. Reused or out-of-order nonces are rejected at protocol level.
              </p>
            </div>
            <div className="p-4 rounded-lg bg-secondary/30">
              <h3 className="font-medium mb-2 text-neon-purple">PoS Finality</h3>
              <p className="text-sm text-muted-foreground">
                Once 2/3+ stake attests to a block, it's final. No reorganization possible. Irreversible state commitment.
              </p>
            </div>
          </div>
        </GlassCard>
      </motion.div>
    </Layout>
  );
};

const FormulaBlock = ({ title, formula, description }: { title: string; formula: string; description: string }) => (
  <div className="p-4 rounded-lg bg-secondary/30">
    <p className="text-sm font-medium mb-2">{title}</p>
    <code className="block p-2 rounded bg-background/50 text-primary font-mono text-sm mb-2">
      {formula}
    </code>
    <p className="text-xs text-muted-foreground">{description}</p>
  </div>
);

export default Protocol;
