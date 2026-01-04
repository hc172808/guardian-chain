import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { GlassCard } from './GlassCard';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  change?: number;
  suffix?: string;
  className?: string;
}

export const StatCard = ({ title, value, icon: Icon, change, suffix, className }: StatCardProps) => {
  return (
    <GlassCard className={cn('relative overflow-hidden', className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="mt-2 text-2xl font-bold font-mono text-gradient-primary">
            {value}
            {suffix && <span className="text-sm ml-1 text-muted-foreground">{suffix}</span>}
          </p>
          {change !== undefined && (
            <p className={cn(
              'mt-1 text-xs font-medium',
              change >= 0 ? 'text-neon-emerald' : 'text-neon-rose'
            )}>
              {change >= 0 ? '+' : ''}{change.toFixed(2)}%
            </p>
          )}
        </div>
        <div className="p-3 rounded-lg bg-primary/10">
          <Icon className="w-5 h-5 text-primary" />
        </div>
      </div>
      <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-primary/5 rounded-full blur-2xl" />
    </GlassCard>
  );
};
