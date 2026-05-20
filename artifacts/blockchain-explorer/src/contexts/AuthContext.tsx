import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';

type AppRole = 'user' | 'admin' | 'founder';

interface WalletUser {
  id: string;
  wallet_address: string;
  ens_name?: string | null;
  role: string;
}

interface AuthContextType {
  user: { id: string; walletAddress?: string } | null;
  session: { user: { id: string } } | null;
  walletUser: WalletUser | null;
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
  const [roles, setRoles] = useState<AppRole[]>(['user']);
  const [walletUser, setWalletUser] = useState<WalletUser | null>(null);
  const [walletLoading, setWalletLoading] = useState(true);

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

  const user = walletUser
    ? { id: walletUser.id, walletAddress: walletUser.wallet_address }
    : null;

  const session = user ? { user: { id: user.id } } : null;
  const loading = walletLoading;

  useEffect(() => {
    if (walletUser) {
      setRoles([(walletUser.role as AppRole) || 'user']);
    } else {
      setRoles(['user']);
    }
  }, [walletUser]);

  const signOut = async () => {
    await fetch('/api/auth/wallet/logout', { method: 'POST', credentials: 'include' });
    setWalletUser(null);
    setRoles(['user']);
  };

  const isFounder = roles.includes('founder');
  const isAdmin = roles.includes('admin') || roles.includes('founder');

  return (
    <AuthContext.Provider value={{
      user,
      session,
      walletUser,
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
