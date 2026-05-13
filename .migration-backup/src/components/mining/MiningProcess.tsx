// Mining Process Explainer - Step by step how mining works
import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowRight, 
  Clock, 
  Cpu, 
  CheckCircle,
  Coins,
  Shield,
  Pickaxe,
  Blocks,
  Users,
  Flame
} from 'lucide-react';

const steps = [
  {
    number: 1,
    title: 'Transactions Happen',
    description: 'Users send coins to each other. These transactions sit in the mempool (waiting room).',
    icon: ArrowRight,
    color: 'text-blue-400',
  },
  {
    number: 2,
    title: 'Miner Collects Transactions',
    description: 'The miner picks pending transactions from the mempool and bundles them into a block.',
    icon: Pickaxe,
    color: 'text-orange-400',
  },
  {
    number: 3,
    title: 'Miner Solves a Puzzle (PoW)',
    description: 'The miner tries to find a special number called a nonce. It hashes the block over and over until it finds a hash that meets the network\'s difficulty rule. This takes brute force, not intelligence.',
    icon: Cpu,
    color: 'text-purple-400',
  },
  {
    number: 4,
    title: 'First Miner Wins',
    description: 'The first miner to find a valid hash broadcasts the block to the network. Other nodes verify it.',
    icon: CheckCircle,
    color: 'text-neon-emerald',
  },
  {
    number: 5,
    title: 'Block Added to Chain',
    description: 'If valid, the block becomes part of the blockchain. The miner gets: Block reward (new coins) + Transaction fees.',
    icon: Blocks,
    color: 'text-primary',
  },
  {
    number: 6,
    title: 'Repeat',
    description: 'Mining starts again for the next block. The process continues indefinitely.',
    icon: Clock,
    color: 'text-yellow-400',
  },
];

const importance = [
  { icon: Shield, label: 'Prevents double spending', description: 'Each transaction can only be spent once' },
  { icon: Users, label: 'Secures the network', description: 'Distributed consensus across miners' },
  { icon: Blocks, label: 'Keeps blockchain decentralized', description: 'No central authority controls it' },
  { icon: Coins, label: 'Controls coin supply (emission)', description: 'New coins are created at a predictable rate' },
];

export const MiningProcess = () => {
  return (
    <div className="space-y-6">
      {/* Process Steps */}
      <GlassCard className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-lg bg-primary/20">
            <Pickaxe className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">How Mining Works</h2>
            <p className="text-sm text-muted-foreground">Step-by-step process</p>
          </div>
        </div>

        <div className="relative">
          {/* Vertical line connecting steps */}
          <div className="absolute left-6 top-8 bottom-8 w-0.5 bg-gradient-to-b from-primary/50 via-primary/20 to-transparent" />
          
          <div className="space-y-6">
            {steps.map((step, index) => (
              <div key={step.number} className="relative flex gap-4">
                {/* Step number */}
                <div className={`relative z-10 flex items-center justify-center w-12 h-12 rounded-full bg-background border-2 border-primary/30 ${step.color}`}>
                  <step.icon className="h-5 w-5" />
                </div>
                
                {/* Content */}
                <div className="flex-1 pt-2">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-xs">Step {step.number}</Badge>
                    <h3 className="font-semibold">{step.title}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </GlassCard>

      {/* Why Mining is Important */}
      <GlassCard className="p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Why Mining is Important
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {importance.map((item) => (
            <div key={item.label} className="p-4 rounded-lg bg-secondary/30 flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <item.icon className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium">{item.label}</p>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* ChainCore Specific */}
      <GlassCard className="p-6 border-primary/30">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Coins className="h-5 w-5 text-primary" />
          ChainCore Mining Specifics
        </h3>
        
        <div className="space-y-3 text-sm">
          <div className="flex items-start gap-3">
            <Badge variant="outline" className="mt-0.5">Hybrid</Badge>
            <p className="text-muted-foreground">
              ChainCore uses <strong>PoS for consensus</strong> (block finality) and <strong>PoW for reward distribution</strong> only.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <Badge variant="outline" className="mt-0.5">Block Time</Badge>
            <p className="text-muted-foreground">
              120 seconds per block with 5-second share submission intervals.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <Badge variant="outline" className="mt-0.5">Algorithms</Badge>
            <p className="text-muted-foreground">
              RandomX (CPU mining) and kHeavyHash (GPU mining) supported.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <Badge variant="outline" className="mt-0.5 bg-orange-500/20 text-orange-400 border-orange-500/30">Anti-Bot</Badge>
            <p className="text-muted-foreground">
              Rate limits and device verification prevent automated abuse.
            </p>
          </div>
        </div>
      </GlassCard>
    </div>
  );
};
