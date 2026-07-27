import { useNetwork, ALL_NETWORKS, NetworkKind, NETWORK_BADGE } from '@/contexts/NetworkContext';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Power, PowerOff, Globe } from 'lucide-react';
import { Button } from './button';

interface NetworkSelectorProps {
  showToggles?: boolean;
  className?: string;
}

export const NetworkSelector = ({ showToggles = true, className }: NetworkSelectorProps) => {
  const { selectedNetwork, setSelectedNetwork, activeNetworks, toggleNetwork, enableAll, disableAll } = useNetwork();
  const { isAdmin, isFounder } = useAuth();
  const visibleNetworks: NetworkKind[] = (isAdmin || isFounder)
    ? ALL_NETWORKS
    : ALL_NETWORKS.filter(n => n !== 'devnet');
  const allOn = activeNetworks.size === visibleNetworks.length;

  return (
    <div className={cn('flex items-center gap-2 flex-wrap', className)}>
      {/* All Networks button */}
      <button
        onClick={() => setSelectedNetwork('all')}
        className={cn(
          'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium transition-all',
          selectedNetwork === 'all'
            ? 'border-primary bg-primary/20 text-primary'
            : 'border-border text-muted-foreground hover:border-primary/40'
        )}
      >
        <Globe className="h-3 w-3" /> All
      </button>

      {/* Per-network selector + toggle */}
      {visibleNetworks.map(n => {
        const badge = NETWORK_BADGE[n];
        const isSelected = selectedNetwork === n;
        const isEnabled = activeNetworks.has(n);

        return (
          <div key={n} className="flex items-center gap-0.5">
            <button
              onClick={() => { setSelectedNetwork(n); }}
              className={cn(
                'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-l-full border-y border-l font-medium transition-all',
                !isEnabled && 'opacity-40 line-through',
                isSelected && isEnabled
                  ? `${badge.border} ${badge.bg} ${badge.text}`
                  : 'border-border text-muted-foreground hover:border-primary/40'
              )}
            >
              <span className={cn('w-1.5 h-1.5 rounded-full', isEnabled ? badge.dot : 'bg-muted-foreground')} />
              {badge.label}
            </button>
            {showToggles && (
              <button
                title={isEnabled ? `Disable ${badge.label}` : `Enable ${badge.label}`}
                onClick={() => toggleNetwork(n)}
                className={cn(
                  'text-xs px-1.5 py-1 rounded-r-full border-y border-r transition-all',
                  isEnabled
                    ? `${badge.border} ${badge.text} hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40`
                    : 'border-border text-muted-foreground/50 hover:border-primary/40 hover:text-primary'
                )}
              >
                {isEnabled ? <Power className="h-2.5 w-2.5" /> : <PowerOff className="h-2.5 w-2.5" />}
              </button>
            )}
          </div>
        );
      })}

      {showToggles && (
        <button
          onClick={allOn ? disableAll : enableAll}
          className="text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:border-primary/40 hover:text-primary transition-all"
          title={allOn ? 'Disable non-mainnet networks' : 'Enable all networks'}
        >
          {allOn ? 'Disable extras' : 'All on'}
        </button>
      )}
    </div>
  );
};
