import { useAuthorities } from '@/hooks/useAuthorities';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

export const ChainStatusBanner = () => {
  const { rows, loading } = useAuthorities();
  if (loading || !rows.length) return null;

  const halted = rows.find((r) => r.id === 'emergency_shutdown' && !r.enabled);
  const frozen = rows.find((r) => r.id === 'freeze_pause' && !r.enabled);

  if (!halted && !frozen) return null;

  const isHalted = !!halted;
  return (
    <div
      className={cn(
        'sticky top-0 z-50 border-b px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium',
        isHalted
          ? 'bg-destructive text-destructive-foreground border-destructive'
          : 'bg-yellow-500/90 text-black border-yellow-600',
      )}
      role="alert"
    >
      {isHalted ? <ShieldAlert className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
      <span>
        {isHalted
          ? 'CHAIN HALTED — emergency_shutdown authority is OFF. All write operations are blocked.'
          : 'Network is in FREEZE/PAUSE mode. Transfers and contract calls are temporarily disabled.'}
      </span>
    </div>
  );
};
