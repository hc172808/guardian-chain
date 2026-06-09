import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { Cpu, LogIn } from 'lucide-react';

const Auth = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  const handleLogin = () => {
    window.location.href = '/api/auth/login';
  };

  return (
    <div className="min-h-screen bg-background grid-pattern flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="glass-card p-8 rounded-2xl border border-border/50">
          <div className="text-center mb-8">
            <div className="inline-flex p-3 rounded-xl bg-gradient-primary mb-4">
              <Cpu className="w-8 h-8 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold text-gradient-primary">ChainCore</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Sign in to access your account
            </p>
          </div>

          <Button
            onClick={handleLogin}
            className="w-full gap-2"
            size="lg"
          >
            <LogIn className="h-4 w-4" />
            Log in
          </Button>

          <p className="text-center text-xs text-muted-foreground mt-4">
            You'll be redirected to sign in securely.
          </p>
        </div>
      </motion.div>

      <div className="fixed inset-0 pointer-events-none scanning-line opacity-30" />
    </div>
  );
};

export default Auth;
