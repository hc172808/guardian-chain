import { cn } from '@/lib/utils';
import { Droplets, Briefcase, ArrowLeftRight, Layers, Rocket } from 'lucide-react';

interface DeFiBottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const navItems = [
  { id: 'pools', icon: Droplets, label: 'Pools' },
  { id: 'portfolio', icon: Briefcase, label: 'Portfolio' },
  { id: 'swap', icon: ArrowLeftRight, label: 'Swap' },
  { id: 'stake', icon: Layers, label: 'Stake' },
  { id: 'launchpad', icon: Rocket, label: 'Launch' },
];

export const DeFiBottomNav = ({ activeTab, onTabChange }: DeFiBottomNavProps) => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-lg border-t border-border safe-area-bottom">
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={cn(
              'flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors',
              activeTab === item.id
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <div className={cn(
              "p-1.5 rounded-lg transition-colors",
              activeTab === item.id && "bg-secondary"
            )}>
              <item.icon className="h-5 w-5" />
            </div>
            <span className="text-xs">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
};
