import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Droplets, Briefcase, ArrowLeftRight, Layers, Rocket, Link2,
  BookOpen, TrendingUp, Zap, Target, Sprout, DollarSign,
  MoreHorizontal, X,
} from 'lucide-react';
import { useComponentVisibility } from '@/hooks/useComponentVisibility';

interface DeFiBottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

// Primary tabs — always visible in the nav bar
const primaryItems = [
  { id: 'swap',        icon: ArrowLeftRight, label: 'Swap',      featureKey: 'defi.swap' },
  { id: 'pools',       icon: Droplets,       label: 'Pools',     featureKey: 'defi.pools' },
  { id: 'stake',       icon: Layers,         label: 'Stake',     featureKey: 'defi.stake' },
  { id: 'farm',        icon: Sprout,         label: 'Farm',      featureKey: 'defi.farm' },
  { id: 'vaults',      icon: TrendingUp,     label: 'Vaults',    featureKey: 'defi.vaults' },
  { id: 'bridge',      icon: Link2,          label: 'Bridge',    featureKey: 'defi.crosschain' },
  { id: 'stablecoin',  icon: DollarSign,     label: 'Stable',    featureKey: 'defi.stable' },
  { id: 'portfolio',   icon: Briefcase,      label: 'Portfolio', featureKey: 'defi.portfolio' },
];

// Advanced tabs — hidden behind "More"
const advancedItems = [
  { id: 'orderbook',  icon: BookOpen, label: 'Orderbook', featureKey: 'defi.orderbook' },
  { id: 'perps',      icon: Zap,      label: 'Perps',     featureKey: 'defi.perps' },
  { id: 'predict',    icon: Target,   label: 'Predict',   featureKey: 'defi.predict' },
  { id: 'launchpad',  icon: Rocket,   label: 'Launchpad', featureKey: 'defi.launchpad' },
];

export const DeFiBottomNav = ({ activeTab, onTabChange }: DeFiBottomNavProps) => {
  const { isHidden } = useComponentVisibility();
  const [moreOpen, setMoreOpen] = useState(false);

  const visiblePrimary = primaryItems.filter(n => !isHidden(n.featureKey));
  const visibleAdvanced = advancedItems.filter(n => !isHidden(n.featureKey));

  const isAdvancedActive = advancedItems.some(a => a.id === activeTab);

  const handleTabChange = (id: string) => {
    onTabChange(id);
    setMoreOpen(false);
  };

  return (
    <>
      {/* Advanced "More" drawer */}
      {moreOpen && visibleAdvanced.length > 0 && (
        <>
          {/* backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setMoreOpen(false)}
          />
          <div className="fixed bottom-16 left-0 right-0 z-50 bg-card/98 backdrop-blur-lg border-t border-border shadow-xl">
            <div className="px-4 pt-3 pb-2 flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Advanced</p>
              <button
                onClick={() => setMoreOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1 px-3 pb-4">
              {visibleAdvanced.map(item => (
                <button
                  key={item.id}
                  onClick={() => handleTabChange(item.id)}
                  className={cn(
                    'flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl transition-colors',
                    activeTab === item.id
                      ? 'bg-secondary text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  <span className="text-[10px]">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Main nav bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-lg border-t border-border safe-area-bottom">
        <div className="flex items-center justify-around h-16 overflow-x-auto">
          {visiblePrimary.map((item) => (
            <button
              key={item.id}
              onClick={() => handleTabChange(item.id)}
              className={cn(
                'flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-colors min-w-[48px]',
                activeTab === item.id
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <div className={cn(
                'p-1.5 rounded-lg transition-colors',
                activeTab === item.id && 'bg-secondary'
              )}>
                <item.icon className="h-4 w-4" />
              </div>
              <span className="text-[10px]">{item.label}</span>
            </button>
          ))}

          {/* More button (only if advanced tabs exist) */}
          {visibleAdvanced.length > 0 && (
            <button
              onClick={() => setMoreOpen(o => !o)}
              className={cn(
                'flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-colors min-w-[48px]',
                (moreOpen || isAdvancedActive)
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <div className={cn(
                'p-1.5 rounded-lg transition-colors',
                (moreOpen || isAdvancedActive) && 'bg-secondary'
              )}>
                <MoreHorizontal className="h-4 w-4" />
              </div>
              <span className="text-[10px]">{isAdvancedActive ? advancedItems.find(a => a.id === activeTab)?.label : 'More'}</span>
            </button>
          )}
        </div>
      </nav>
    </>
  );
};
