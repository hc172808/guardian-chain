import { useNetwork, ALL_NETWORKS, NetworkKind, NETWORK_BADGE } from '@/contexts/NetworkContext';
import { cn } from '@/lib/utils';
import { Power, PowerOff, Globe } from 'lucide-react';
import { Button } from './button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

interface NetworkSelectorProps {
  showToggles?: boolean;
  className?: string;
}

export const NetworkSelector = ({ showToggles = true, className }: NetworkSelectorProps) => {
  const { selectedNetwork, setSelectedNetwork, activeNetworks, toggleNetwork, enableAll, disableAll } = useNetwork();
  const visibleNetworks: NetworkKind[] = ALL_NETWORKS;
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

export const CompactNetworkSelector = ({ className }: { className?: string }) => {
  const { selectedNetwork, setSelectedNetwork } = useNetwork();

  return (
    <Select value={selectedNetwork} onValueChange={value => setSelectedNetwork(value as NetworkKind | 'all')}>
      <SelectTrigger
        aria-label="Select blockchain network"
        className={cn('h-8 w-[132px] text-xs border-border/50 bg-background/80 backdrop-blur-sm px-2', className)}
      >
        <Globe className="h-3.5 w-3.5 shrink-0" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value="all" className="text-xs">All networks</SelectItem>
        <SelectItem value="mainnet" className="text-xs">Mainnet</SelectItem>
        <SelectItem value="testnet" className="text-xs">Testnet</SelectItem>
        <SelectItem value="devnet" className="text-xs">Devnet</SelectItem>
      </SelectContent>
    </Select>
  );
};
