import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  glow?: boolean;
  hover?: boolean;
}

export const GlassCard = ({ children, className, glow = false, hover = false }: GlassCardProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={hover ? { scale: 1.02, transition: { duration: 0.2 } } : undefined}
      className={cn(
        'glass-card rounded-lg p-6',
        glow && 'border-glow',
        hover && 'cursor-pointer transition-colors hover:border-primary/30',
        className
      )}
    >
      {children}
    </motion.div>
  );
};
