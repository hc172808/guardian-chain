import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { useUser, useClerk } from '@clerk/react';

type AppRole = 'user' | 'admin' | 'founder';

interface WalletUser {
  id: string;
  wallet_address: string;
  ens_name?: string | null;
  role: string;
}

interface ReplitUser {
  id: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  profileImageUrl?: string | null;
}

interface AuthContextType {
  user: { id: string; email?: string; walletAddress?: string } | null;
  session: { user: { id: string } } | null;
  walletUser: WalletUser | null;
  replitUser: ReplitUser | null;
  roles: AppRole[];
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshWalletUser: () => Promise<void>;
  isFounder: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const { user: clerkUser, isLoaded } = useUser();
  const { signOut: clerkSignOut } = useClerk();
  const [roles, setRoles] = useState<AppRole[]>(['user']);
  const [walletUser, setWalletUser] = useState<WalletUser | null>(null);
  const [replitUser, setReplitUser] = useState<ReplitUser | null>(null);
  const [walletLoading, setWalletLoading] = useState(true);
  const [replitLoading, setReplitLoading] = useState(true);

  const refreshWalletUser = useCallback(async () => {
    try {
      const r = await fetch('/api/auth/wallet/user', { credentials: 'include' });
      if (r.ok) {
        const data = await r.json();
        setWalletUser(data);
      } else {
        setWalletUser(null);
      }
    } catch {
      setWalletUser(null);
    } finally {
      setWalletLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshWalletUser();
  }, [refreshWalletUser]);

  useEffect(() => {
    fetch('/api/auth/user', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.id) setReplitUser(data); })
      .catch(() => {})
      .finally(() => setReplitLoading(false));
  }, []);

  // Normalize user across all auth providers — wallet wins, then Clerk, then Replit
  const clerkNorm = clerkUser
    ? { id: clerkUser.id, email: clerkUser.primaryEmailAddress?.emailAddress }
    : null;

  const walletNorm = walletUser
    ? { id: walletUser.id, walletAddress: walletUser.wallet_address }
    : null;

  const replitNorm = replitUser
    ? { id: replitUser.id, email: replitUser.email ?? undefined }
    : null;

  const user = walletNorm ?? clerkNorm ?? replitNorm;
  const session = user ? { user: { id: user.id } } : null;
  const loading = !isLoaded || walletLoading || replitLoading;

  useEffect(() => {
    if (walletUser) {
      setRoles([(walletUser.role as AppRole) || 'user']);
      return;
    }
    if (!clerkUser) { setRoles(['user']); return; }
    const meta = clerkUser.publicMetadata as Record<string, unknown>;
    setRoles([(meta?.role as AppRole) || 'user']);
  }, [clerkUser, walletUser]);

  const signOut = async () => {
    if (walletUser) {
      await fetch('/api/auth/wallet/logout', { method: 'POST', credentials: 'include' });
      setWalletUser(null);
    } else if (clerkUser) {
      await clerkSignOut();
    } else if (replitUser) {
      window.location.href = '/api/logout';
    }
    setRoles(['user']);
  };

  const isFounder = roles.includes('founder');
  const isAdmin = roles.includes('admin') || roles.includes('founder');

  return (
    <AuthContext.Provider value={{
      user,
      session,
      walletUser,
      replitUser,
      roles,
      loading,
      signUp: async () => ({ error: null }),
      signIn: async () => ({ error: null }),
      signOut,
      refreshWalletUser,
      isFounder,
      isAdmin,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
