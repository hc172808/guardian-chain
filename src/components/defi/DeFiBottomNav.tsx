import { cn } from '@/lib/utils';
import { Droplets, Briefcase, ArrowLeftRight, Layers, Rocket, Link2, BookOpen, TrendingUp, Calculator, Zap, Target, Sprout } from 'lucide-react';

interface DeFiBottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const navItems = [
  { id: 'swap',      icon: ArrowLeftRight, label: 'Swap' },
  { id: 'pools',     icon: Droplets,       label: 'Pools' },
  { id: 'stake',     icon: Layers,         label: 'Stake' },
  { id: 'farm',      icon: Sprout,         label: 'Farm' },
  { id: 'orderbook', icon: BookOpen,       label: 'Orders' },
  { id: 'vaults',    icon: TrendingUp,     label: 'Vaults' },
  { id: 'bridge',    icon: Link2,          label: 'Bridge' },
  { id: 'perps',     icon: Zap,            label: 'Perps' },
  { id: 'predict',   icon: Target,         label: 'Predict' },
  { id: 'launchpad', icon: Rocket,         label: 'Launch' },
  { id: 'portfolio', icon: Briefcase,      label: 'Portfolio' },
  { id: 'ilcalc',    icon: Calculator,     label: 'IL Calc' },
];

export const DeFiBottomNav = ({ activeTab, onTabChange }: DeFiBottomNavProps) => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-lg border-t border-border safe-area-bottom">
      <div className="flex items-center justify-around h-16 overflow-x-auto">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={cn(
              'flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-colors min-w-[56px]',
              activeTab === item.id
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <div className={cn(
              "p-1.5 rounded-lg transition-colors",
              activeTab === item.id && "bg-secondary"
            )}>
              <item.icon className="h-4 w-4" />
            </div>
            <span className="text-[10px]">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
};
