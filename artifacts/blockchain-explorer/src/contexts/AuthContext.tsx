import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useUser, useClerk } from '@clerk/react';

type AppRole = 'user' | 'admin' | 'founder';

interface ReplitUser {
  id: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  profileImageUrl?: string | null;
}

interface AuthContextType {
  user: { id: string; email?: string } | null;
  session: { user: { id: string } } | null;
  replitUser: ReplitUser | null;
  roles: AppRole[];
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  isFounder: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const { user: clerkUser, isLoaded } = useUser();
  const { signOut: clerkSignOut } = useClerk();
  const [roles, setRoles] = useState<AppRole[]>(['user']);
  const [replitUser, setReplitUser] = useState<ReplitUser | null>(null);
  const [replitLoading, setReplitLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/user', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.id) setReplitUser(data);
      })
      .catch(() => {})
      .finally(() => setReplitLoading(false));
  }, []);

  const clerkUserNormalized = clerkUser
    ? { id: clerkUser.id, email: clerkUser.primaryEmailAddress?.emailAddress }
    : null;

  const replitUserNormalized = replitUser
    ? { id: replitUser.id, email: replitUser.email ?? undefined }
    : null;

  const user = clerkUserNormalized ?? replitUserNormalized;
  const session = user ? { user: { id: user.id } } : null;
  const loading = !isLoaded || replitLoading;

  useEffect(() => {
    if (!clerkUser) {
      setRoles(['user']);
      return;
    }
    const meta = clerkUser.publicMetadata as Record<string, unknown>;
    const role = (meta?.role as AppRole) || 'user';
    setRoles([role]);
  }, [clerkUser]);

  const signUp = async (_email: string, _password: string): Promise<{ error: Error | null }> => {
    return { error: null };
  };

  const signIn = async (_email: string, _password: string): Promise<{ error: Error | null }> => {
    return { error: null };
  };

  const signOut = async () => {
    setRoles(['user']);
    if (clerkUser) {
      await clerkSignOut();
    } else {
      window.location.href = '/api/logout';
    }
  };

  const isFounder = roles.includes('founder');
  const isAdmin = roles.includes('admin') || roles.includes('founder');

  return (
    <AuthContext.Provider value={{
      user,
      session,
      replitUser,
      roles,
      loading,
      signUp,
      signIn,
      signOut,
      isFounder,
      isAdmin,
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
