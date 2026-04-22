import { ReactNode } from 'react';
import { useComponentVisibility } from '@/hooks/useComponentVisibility';

interface HideableProps {
  componentKey: string;
  children: ReactNode;
  fallback?: ReactNode;
}

export const Hideable = ({ componentKey, children, fallback = null }: HideableProps) => {
  const { isHidden } = useComponentVisibility();
  if (isHidden(componentKey)) return <>{fallback}</>;
  return <>{children}</>;
};
