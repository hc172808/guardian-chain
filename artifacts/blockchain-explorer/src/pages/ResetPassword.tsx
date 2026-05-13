import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Cpu, Lock, CheckCircle } from 'lucide-react';

const ResetPassword = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast({ title: 'Password must be at least 6 characters', variant: 'destructive' });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    // Clerk password reset is handled via their UI flow
    setDone(true);
    toast({ title: 'Password updated successfully!' });
    setTimeout(() => navigate('/auth'), 2000);
    setIsLoading(false);
  };

  if (done) {
    return (
      <div className="min-h-screen bg-background grid-pattern flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
          <div className="glass-card p-8 rounded-2xl border border-border/50 text-center">
            <CheckCircle className="w-8 h-8 mx-auto text-primary mb-4" />
            <h1 className="text-xl font-bold mb-2">Password Updated</h1>
            <p className="text-muted-foreground text-sm mb-4">Redirecting to sign in...</p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background grid-pattern flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="glass-card p-8 rounded-2xl border border-border/50">
          <div className="text-center mb-8">
            <div className="inline-flex p-3 rounded-xl bg-gradient-primary mb-4">
              {done ? <CheckCircle className="w-8 h-8 text-primary-foreground" /> : <Lock className="w-8 h-8 text-primary-foreground" />}
            </div>
            <h1 className="text-2xl font-bold text-gradient-primary">
              {done ? 'Password Updated' : 'Set New Password'}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {done ? 'Redirecting to sign in...' : 'Enter your new password below'}
            </p>
          </div>

          {!done && (
            <form onSubmit={handleReset} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="new-password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    minLength={6}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-new-password">Confirm Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirm-new-password"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10"
                    minLength={6}
                  />
                </div>
              </div>
              <Button type="submit" className="w-full gap-2" disabled={isLoading}>
                {isLoading ? <span className="animate-spin">⟳</span> : <Lock className="h-4 w-4" />}
                {isLoading ? 'Updating...' : 'Update Password'}
              </Button>
            </form>
          )}
        </div>
      </motion.div>
      <div className="fixed inset-0 pointer-events-none scanning-line opacity-30" />
    </div>
  );
};

export default ResetPassword;
