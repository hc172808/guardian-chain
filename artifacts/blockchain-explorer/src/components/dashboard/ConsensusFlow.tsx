import { GlassCard } from '../ui/GlassCard';
import { motion } from 'framer-motion';
import { Shield, Pickaxe, Blocks, ArrowRight, CheckCircle } from 'lucide-react';

const steps = [
  {
    icon: Pickaxe,
    title: 'CPU/Browser Mining',
    description: 'Miners submit shares',
    color: 'neon-amber',
  },
  {
    icon: Shield,
    title: 'PoS Validation',
    description: 'Validators verify & order',
    color: 'primary',
  },
  {
    icon: Blocks,
    title: 'Block Production',
    description: 'Block created by validator',
    color: 'neon-purple',
  },
  {
    icon: CheckCircle,
    title: 'Finality',
    description: 'Irreversible after 2/3 stake',
    color: 'neon-emerald',
  },
];

export const ConsensusFlow = () => {
  return (
    <GlassCard>
      <h3 className="text-lg font-semibold mb-6">Consensus Flow</h3>
      
      <div className="flex items-center justify-between">
        {steps.map((step, index) => (
          <motion.div
            key={step.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="flex items-center"
          >
            <div className="text-center">
              <div className={`mx-auto w-14 h-14 rounded-xl bg-${step.color}/10 flex items-center justify-center mb-3`}>
                <step.icon className={`w-7 h-7 text-${step.color}`} />
              </div>
              <h4 className="text-sm font-medium">{step.title}</h4>
              <p className="text-xs text-muted-foreground mt-1">{step.description}</p>
            </div>
            
            {index < steps.length - 1 && (
              <div className="mx-4 flex-shrink-0">
                <ArrowRight className="w-5 h-5 text-muted-foreground" />
              </div>
            )}
          </motion.div>
        ))}
      </div>

      <div className="mt-6 p-4 rounded-lg bg-secondary/30 border border-primary/20">
        <p className="text-sm text-muted-foreground">
          <span className="text-primary font-medium">Key Insight:</span> Mining affects 
          <span className="text-neon-amber font-medium"> reward distribution only</span>. 
          Block production and finality are controlled 
          <span className="text-neon-emerald font-medium"> exclusively by PoS validators</span>.
        </p>
      </div>
    </GlassCard>
  );
};
