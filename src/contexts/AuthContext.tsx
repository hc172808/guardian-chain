import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api } from '@/lib/api';

type AppRole = 'user' | 'admin' | 'founder';

interface AuthUser {
  id: string;
  email?: string | null;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  profileImageUrl?: string | null;
  walletAddress?: string | null;
  hasPassword?: boolean;
  totpEnabled?: boolean;
  isBanned?: boolean;
  roles: AppRole[];
  isAdmin: boolean;
  isFounder: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: { message: string } | null }>;
  signUp: (email: string, password: string) => Promise<{ error: { message: string } | null }>;
  signOut: () => Promise<void>;
  isFounder: boolean;
  isAdmin: boolean;
  refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = async () => {
    try {
      const data = await api.get('/api/me');
      setUser(data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  const signIn = async (email: string, password: string): Promise<{ error: { message: string } | null }> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: email, password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        return { error: { message: err.error ?? 'Login failed' } };
      }
      await fetchUser();
      return { error: null };
    } catch (e: any) {
      return { error: { message: e.message ?? 'Login failed' } };
    }
  };

  const signUp = async (email: string, password: string): Promise<{ error: { message: string } | null }> => {
    try {
      const username = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_');
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        return { error: { message: err.error ?? 'Registration failed' } };
      }
      await fetchUser();
      return { error: null };
    } catch (e: any) {
      return { error: { message: e.message ?? 'Registration failed' } };
    }
  };

  const signOut = async () => {
    await fetch('/api/auth/logout', { credentials: 'include' });
    setUser(null);
    window.location.href = '/auth';
  };

  const isFounder = user?.isFounder ?? false;
  const isAdmin = user?.isAdmin ?? false;

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      signIn,
      signUp,
      signOut,
      isFounder,
      isAdmin,
      refetch: fetchUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
