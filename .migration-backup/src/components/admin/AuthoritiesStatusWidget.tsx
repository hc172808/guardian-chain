import { Link } from 'react-router-dom';
import { Shield, AlertTriangle, AlertOctagon } from 'lucide-react';
import { useAuthorities } from '@/hooks/useAuthorities';
import { cn } from '@/lib/utils';

const CRITICAL_IDS = ['emergency_shutdown', 'validator', 'consensus_rules', 'block_production', 'finality'];

export const AuthoritiesStatusWidget = () => {
  const { rows, loading, total, disabledCount } = useAuthorities();
  if (loading || total === 0) return null;

  const emergencyOff = rows.some((r) => r.id === 'emergency_shutdown' && !r.enabled);
  const criticalDisabled = rows.filter((r) => CRITICAL_IDS.includes(r.id) && !r.enabled);

  let tone: 'ok' | 'warn' | 'critical' | 'halted' = 'ok';
  if (emergencyOff) tone = 'halted';
  else if (criticalDisabled.length > 0) tone = 'critical';
  else if (disabledCount > 0) tone = 'warn';

  const styles: Record<typeof tone, string> = {
    ok: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-500',
    warn: 'border-yellow-500/30 bg-yellow-500/5 text-yellow-500',
    critical: 'border-orange-500/30 bg-orange-500/5 text-orange-500',
    halted: 'border-red-500/40 bg-red-500/10 text-red-500',
  };

  const Icon = tone === 'halted' ? AlertOctagon : tone === 'ok' ? Shield : AlertTriangle;
  const headline =
    tone === 'halted'
      ? 'CHAIN HALTED'
      : tone === 'ok'
      ? 'All authorities live'
      : `${disabledCount} of ${total} disabled`;

  return (
    <Link
      to="/admin?tab=authorities"
      className={cn('block w-full rounded-lg border px-3 py-2 text-xs transition hover:opacity-90', styles[tone])}
    >
      <div className="flex items-center gap-2 font-semibold">
        <Icon className="h-3.5 w-3.5" />
        <span>{headline}</span>
      </div>
      {criticalDisabled.length > 0 && (
        <p className="mt-1 text-[10px] opacity-80 truncate">
          Critical off: {criticalDisabled.slice(0, 3).map((c) => c.name.split(' ')[0]).join(', ')}
        </p>
      )}
    </Link>
  );
};
