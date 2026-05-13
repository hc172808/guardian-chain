import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useUser, useClerk } from '@clerk/react';

type AppRole = 'user' | 'admin' | 'founder';

interface AuthContextType {
  // @ts-ignore - keeping compat shape with supabase user
  user: { id: string; email?: string } | null;
  // @ts-ignore
  session: { user: { id: string } } | null;
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

  const user = clerkUser
    ? { id: clerkUser.id, email: clerkUser.primaryEmailAddress?.emailAddress }
    : null;
  const session = user ? { user: { id: user.id } } : null;
  const loading = !isLoaded;

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
    await clerkSignOut();
  };

  const isFounder = roles.includes('founder');
  const isAdmin = roles.includes('admin') || roles.includes('founder');

  return (
    <AuthContext.Provider value={{
      user,
      session,
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
