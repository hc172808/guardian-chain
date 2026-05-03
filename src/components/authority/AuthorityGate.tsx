import { ReactNode } from 'react';
import { useAuthorities } from '@/hooks/useAuthorities';
import { GlassCard } from '@/components/ui/GlassCard';
import { Lock } from 'lucide-react';

interface Props {
  /** Authority IDs that must ALL be enabled for children to render normally */
  requireAll: string[];
  children: ReactNode;
  /** When true, renders nothing if blocked (instead of a disabled-card) */
  silent?: boolean;
  /** Custom label for the disabled card */
  label?: string;
}

/**
 * Renders children only when every authority in `requireAll` is enabled.
 * Otherwise shows a disabled-state card (or nothing if `silent`).
 */
export const AuthorityGate = ({ requireAll, children, silent, label }: Props) => {
  const { rows, isEnabled, loading } = useAuthorities();
  if (loading) return <>{children}</>;

  const blocked = requireAll.filter((id) => !isEnabled(id));
  if (blocked.length === 0) return <>{children}</>;
  if (silent) return null;

  const names = blocked.map((id) => {
    const r = rows.find((x) => x.id === id);
    return r?.name || id;
  });

  return (
    <GlassCard className="p-6 text-center space-y-2 border-destructive/40">
      <Lock className="h-8 w-8 mx-auto text-destructive" />
      <p className="font-semibold">{label || 'Action disabled by authority policy'}</p>
      <p className="text-sm text-muted-foreground">
        Required authority {names.length > 1 ? 'authorities are' : 'is'} OFF: {names.join(', ')}
      </p>
    </GlassCard>
  );
};

/** Imperative helper for handlers — returns first blocking authority id, or null */
export function checkAuthorities(
  isEnabled: (id: string) => boolean,
  required: string[],
): string | null {
  for (const id of required) if (!isEnabled(id)) return id;
  return null;
}
