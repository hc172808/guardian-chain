import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

/**
 * SECURITY NOTE — Client-side role gate.
 *
 * This component (and any `isAdmin` / `isFounder` check in the UI) is a
 * USABILITY convenience only. Anyone can flip the roles array in memory with
 * DevTools, so the browser MUST NOT be the security boundary.
 *
 * The real authorization boundary is server-side:
 *   1. Postgres RLS policies backed by the SECURITY DEFINER `has_role()`
 *      function guard every sensitive table (admin_config, token_operations,
 *      node_installations, profiles, …).
 *   2. Privileged HTTP endpoints in `server/routes.ts` re-check the
 *      authenticated user's role before mutating state.
 *
 * If either of those two layers is bypassed, this component provides no
 * protection. Never move a privileged operation into the client because
 * "RequireAuth already blocked it".
 */
interface RequireAuthProps {
  children: ReactNode;
  requiredRole?: 'admin' | 'founder';
}

export const RequireAuth = ({ children, requiredRole }: RequireAuthProps) => {
  const { user, loading, isAdmin, isFounder } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (requiredRole === 'founder' && !isFounder) {
    return <Navigate to="/" replace />;
  }

  if (requiredRole === 'admin' && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
