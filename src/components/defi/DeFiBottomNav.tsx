import { cn } from '@/lib/utils';
import { Droplets, Briefcase, ArrowLeftRight, Layers, Rocket, Link2, BookOpen, TrendingUp, Calculator, Zap, Target, Sprout, DollarSign } from 'lucide-react';
import { useComponentVisibility } from '@/hooks/useComponentVisibility';

interface DeFiBottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const navItems = [
  { id: 'swap',        icon: ArrowLeftRight, label: 'Swap',        featureKey: 'defi.swap' },
  { id: 'pools',       icon: Droplets,       label: 'Pools',       featureKey: 'defi.pools' },
  { id: 'stake',       icon: Layers,         label: 'Stake',       featureKey: 'defi.stake' },
  { id: 'farm',        icon: Sprout,         label: 'Farm',        featureKey: 'defi.farm' },
  { id: 'orderbook',   icon: BookOpen,       label: 'Orders',      featureKey: 'defi.orderbook' },
  { id: 'vaults',      icon: TrendingUp,     label: 'Vaults',      featureKey: 'defi.vaults' },
  { id: 'bridge',      icon: Link2,          label: 'Bridge',      featureKey: 'defi.crosschain' },
  { id: 'stablecoin',  icon: DollarSign,     label: 'Stable',      featureKey: 'defi.stable' },
  { id: 'perps',       icon: Zap,            label: 'Perps',       featureKey: 'defi.perps' },
  { id: 'predict',     icon: Target,         label: 'Predict',     featureKey: 'defi.predict' },
  { id: 'launchpad',   icon: Rocket,         label: 'Launch',      featureKey: 'defi.launchpad' },
  { id: 'portfolio',   icon: Briefcase,      label: 'Portfolio',   featureKey: 'defi.portfolio' },
  { id: 'ilcalc',      icon: Calculator,     label: 'IL Calc',     featureKey: 'defi.ilcalc' },
];

export const DeFiBottomNav = ({ activeTab, onTabChange }: DeFiBottomNavProps) => {
  const { isHidden } = useComponentVisibility();
  const visible = navItems.filter(n => !isHidden(n.featureKey));
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-lg border-t border-border safe-area-bottom">
      <div className="flex items-center justify-around h-16 overflow-x-auto">
        {visible.map((item) => (
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
