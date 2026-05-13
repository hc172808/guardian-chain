import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useSignIn } from '@clerk/react';
import { Cpu, Lock, CheckCircle } from 'lucide-react';

const ResetPassword = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [showCodeStep, setShowCodeStep] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { signIn, setActive } = useSignIn();

  // Clerk password reset uses: signIn.create({ strategy: 'reset_password_email_code', identifier })
  // then signIn.attemptFirstFactor({ strategy: 'reset_password_email_code', code, password })
  // The ResetPassword page is reached after user enters the code sent by email.
  // We check the URL for a __clerk_status param that Clerk adds, or we show a form to enter
  // the email code + new password.

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
    if (!code.trim()) {
      toast({ title: 'Please enter the reset code from your email', variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    try {
      const result = await signIn?.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code,
        password,
      } as Parameters<NonNullable<typeof signIn>['attemptFirstFactor']>[0]);
      if (result?.status === 'complete') {
        await setActive?.({ session: result.createdSessionId });
        setDone(true);
        toast({ title: 'Password updated successfully!' });
        setTimeout(() => navigate('/'), 2000);
      } else {
        toast({ title: 'Reset incomplete', description: 'The code may be invalid or expired.', variant: 'destructive' });
      }
    } catch (err: unknown) {
      const clerkErr = err as { errors?: Array<{ longMessage?: string; message?: string }> };
      const msg = clerkErr?.errors?.[0]?.longMessage || clerkErr?.errors?.[0]?.message || 'Reset failed';
      toast({ title: 'Failed to reset password', description: msg, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-background grid-pattern flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
          <div className="glass-card p-8 rounded-2xl border border-border/50 text-center">
            <CheckCircle className="w-8 h-8 mx-auto text-primary mb-4" />
            <h1 className="text-xl font-bold mb-2">Password Updated</h1>
            <p className="text-muted-foreground text-sm mb-4">Redirecting to dashboard...</p>
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
              <Lock className="w-8 h-8 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold text-gradient-primary">Set New Password</h1>
            <p className="text-muted-foreground text-sm mt-1">Enter the code from your email and your new password</p>
          </div>

          <form onSubmit={handleReset} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-code">Email Reset Code</Label>
              <div className="relative">
                <Cpu className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="reset-code"
                  type="text"
                  placeholder="Enter 6-digit code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="pl-10"
                  autoComplete="one-time-code"
                />
              </div>
            </div>
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
                  autoComplete="new-password"
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
                  autoComplete="new-password"
                />
              </div>
            </div>
            <Button type="submit" className="w-full gap-2" disabled={isLoading}>
              {isLoading ? <span className="animate-spin">⟳</span> : <Lock className="h-4 w-4" />}
              {isLoading ? 'Updating...' : 'Update Password'}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => navigate('/auth')}>
              Back to Sign In
            </Button>
          </form>
        </div>
      </motion.div>
      <div className="fixed inset-0 pointer-events-none scanning-line opacity-30" />
    </div>
  );
};

export default ResetPassword;
