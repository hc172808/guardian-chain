import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSignIn, useSignUp, useUser } from '@clerk/react';
import { useToast } from '@/hooks/use-toast';
import { Cpu, Mail, Lock, UserPlus, LogIn, ShieldCheck } from 'lucide-react';
import { z } from 'zod';

const emailSchema = z.string().email('Please enter a valid email address');
const passwordSchema = z.string().min(8, 'Password must be at least 8 characters');

type Screen = 'login' | 'signup' | 'verify' | 'forgot' | 'reset_sent';

const Auth = () => {
  const [screen, setScreen] = useState<Screen>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { signIn: clerkSignIn } = useSignIn();
  const { signUp: clerkSignUp } = useSignUp();
  const { isSignedIn } = useUser();
  const navigate = useNavigate();
  const { toast } = useToast();

  if (isSignedIn) {
    navigate('/');
    return null;
  }

  const validate = (fields: string[] = ['email', 'password']) => {
    const errs: Record<string, string> = {};
    if (fields.includes('email')) {
      const r = emailSchema.safeParse(email);
      if (!r.success) errs.email = r.error.errors[0].message;
    }
    if (fields.includes('password')) {
      const r = passwordSchema.safeParse(password);
      if (!r.success) errs.password = r.error.errors[0].message;
    }
    if (fields.includes('confirm') && password !== confirmPassword) {
      errs.confirm = 'Passwords do not match';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate(['email', 'password'])) return;
    setIsLoading(true);
    try {
      const result = await clerkSignIn?.create({ identifier: email, password });
      if (result?.status === 'complete') {
        await clerkSignIn?.setActive({ session: result.createdSessionId });
        toast({ title: 'Welcome back!', description: 'Successfully signed in.' });
        navigate('/');
      } else {
        toast({ title: 'Additional verification required', description: 'Please check your email for a verification code.', variant: 'destructive' });
      }
    } catch (err: any) {
      const msg = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || 'Invalid email or password.';
      toast({ title: 'Sign In Failed', description: msg, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate(['email', 'password', 'confirm'])) return;
    setIsLoading(true);
    try {
      const result = await clerkSignUp?.create({ emailAddress: email, password });
      if (result?.status === 'complete') {
        await clerkSignUp?.setActive({ session: result.createdSessionId });
        toast({ title: 'Account Created!', description: 'Welcome to ChainCore!' });
        navigate('/');
      } else if (
        result?.status === 'missing_requirements' ||
        result?.unverifiedFields?.includes('email_address')
      ) {
        await clerkSignUp?.prepareEmailAddressVerification({ strategy: 'email_code' });
        toast({ title: 'Verify your email', description: 'We sent a 6-digit code to ' + email });
        setScreen('verify');
      } else {
        toast({ title: 'Check your email', description: 'Please verify your email address to continue.' });
        setScreen('verify');
      }
    } catch (err: any) {
      const msg = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || 'Sign up failed.';
      if (msg.toLowerCase().includes('already')) {
        toast({ title: 'Account Already Exists', description: 'This email is registered. Sign in instead.', variant: 'destructive' });
        setScreen('login');
      } else {
        toast({ title: 'Sign Up Failed', description: msg, variant: 'destructive' });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyCode || verifyCode.length < 6) {
      setErrors({ code: 'Enter the 6-digit code from your email' });
      return;
    }
    setIsLoading(true);
    try {
      const result = await clerkSignUp?.attemptEmailAddressVerification({ code: verifyCode });
      if (result?.status === 'complete') {
        await clerkSignUp?.setActive({ session: result.createdSessionId });
        toast({ title: 'Email Verified!', description: 'Welcome to ChainCore!' });
        navigate('/');
      } else {
        toast({ title: 'Verification incomplete', description: 'Please try again.', variant: 'destructive' });
      }
    } catch (err: any) {
      const msg = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || 'Invalid code.';
      toast({ title: 'Verification Failed', description: msg, variant: 'destructive' });
      setErrors({ code: msg });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    setIsLoading(true);
    try {
      await clerkSignUp?.prepareEmailAddressVerification({ strategy: 'email_code' });
      toast({ title: 'Code resent', description: 'Check your inbox.' });
    } catch {
      toast({ title: 'Could not resend', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate(['email'])) return;
    setIsLoading(true);
    try {
      await clerkSignIn?.create({ strategy: 'reset_password_email_code', identifier: email });
      setScreen('reset_sent');
      toast({ title: 'Reset email sent!', description: 'Check your inbox.' });
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.errors?.[0]?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background grid-pattern flex items-center justify-center p-4">
      <motion.div
        key={screen}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md"
      >
        <div className="glass-card p-8 rounded-2xl border border-border/50">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex p-3 rounded-xl bg-gradient-primary mb-4">
              {screen === 'verify' ? (
                <ShieldCheck className="w-8 h-8 text-primary-foreground" />
              ) : (
                <Cpu className="w-8 h-8 text-primary-foreground" />
              )}
            </div>
            <h1 className="text-2xl font-bold text-gradient-primary">ChainCore</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {screen === 'login' && 'Sign in to your account'}
              {screen === 'signup' && 'Create a new account'}
              {screen === 'verify' && 'Verify your email'}
              {screen === 'forgot' && 'Reset your password'}
              {screen === 'reset_sent' && 'Check your email'}
            </p>
          </div>

          {/* ── EMAIL VERIFICATION ── */}
          {screen === 'verify' && (
            <form onSubmit={handleVerify} className="space-y-4">
              <div className="p-4 rounded-lg bg-primary/10 border border-primary/30 text-sm text-center">
                We sent a 6-digit verification code to <strong>{email}</strong>
              </div>
              <div className="space-y-2">
                <Label htmlFor="code">Verification Code</Label>
                <Input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                  className="text-center text-2xl tracking-widest font-mono"
                  autoFocus
                />
                {errors.code && <p className="text-xs text-destructive">{errors.code}</p>}
              </div>
              <Button type="submit" className="w-full gap-2" disabled={isLoading}>
                {isLoading ? <span className="animate-spin">⟳</span> : <ShieldCheck className="h-4 w-4" />}
                {isLoading ? 'Verifying...' : 'Verify Email'}
              </Button>
              <div className="text-center space-y-2">
                <button type="button" onClick={handleResendCode} disabled={isLoading}
                  className="text-sm text-primary hover:underline">
                  Resend code
                </button>
                <br />
                <button type="button" onClick={() => setScreen('signup')}
                  className="text-sm text-muted-foreground hover:underline">
                  ← Back to sign up
                </button>
              </div>
            </form>
          )}

          {/* ── FORGOT PASSWORD ── */}
          {screen === 'forgot' && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="reset-email" type="email" placeholder="you@example.com" value={email}
                    onChange={(e) => setEmail(e.target.value)} className="pl-10" />
                </div>
                {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
              </div>
              <Button type="submit" className="w-full gap-2" disabled={isLoading}>
                {isLoading ? <span className="animate-spin">⟳</span> : <Mail className="h-4 w-4" />}
                {isLoading ? 'Sending...' : 'Send Reset Link'}
              </Button>
              <Button type="button" variant="ghost" className="w-full text-sm"
                onClick={() => { setScreen('login'); setErrors({}); }}>
                ← Back to Sign In
              </Button>
            </form>
          )}

          {/* ── RESET SENT ── */}
          {screen === 'reset_sent' && (
            <div className="text-center space-y-4">
              <div className="p-4 rounded-lg bg-primary/10 border border-primary/30">
                <Mail className="h-8 w-8 mx-auto text-primary mb-2" />
                <p className="text-sm">
                  We sent a password reset link to <strong>{email}</strong>. Check your inbox.
                </p>
              </div>
              <Button variant="outline" className="w-full"
                onClick={() => { setScreen('login'); setErrors({}); }}>
                Back to Sign In
              </Button>
            </div>
          )}

          {/* ── LOGIN / SIGNUP ── */}
          {(screen === 'login' || screen === 'signup') && (
            <>
              <form onSubmit={screen === 'login' ? handleLogin : handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="email" type="email" placeholder="you@example.com" value={email}
                      onChange={(e) => setEmail(e.target.value)} className="pl-10" />
                  </div>
                  {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="password" type="password" placeholder="••••••••" value={password}
                      onChange={(e) => setPassword(e.target.value)} className="pl-10" />
                  </div>
                  {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
                </div>

                {screen === 'signup' && (
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input id="confirmPassword" type="password" placeholder="••••••••" value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)} className="pl-10" />
                    </div>
                    {errors.confirm && <p className="text-xs text-destructive">{errors.confirm}</p>}
                  </div>
                )}

                <Button type="submit" className="w-full gap-2" disabled={isLoading}>
                  {isLoading ? (
                    <span className="animate-spin">⟳</span>
                  ) : screen === 'login' ? (
                    <><LogIn className="h-4 w-4" /> Sign In</>
                  ) : (
                    <><UserPlus className="h-4 w-4" /> Create Account</>
                  )}
                </Button>
              </form>

              {screen === 'login' && (
                <div className="mt-3 text-center">
                  <button type="button" onClick={() => { setScreen('forgot'); setErrors({}); }}
                    className="text-sm text-muted-foreground hover:text-primary hover:underline">
                    Forgot your password?
                  </button>
                </div>
              )}

              <div className="mt-6 text-center">
                <p className="text-sm text-muted-foreground">
                  {screen === 'login' ? "Don't have an account?" : 'Already have an account?'}
                  <button type="button"
                    onClick={() => { setScreen(screen === 'login' ? 'signup' : 'login'); setErrors({}); }}
                    className="ml-1 text-primary hover:underline font-medium">
                    {screen === 'login' ? 'Sign up' : 'Sign in'}
                  </button>
                </p>
              </div>
            </>
          )}
        </div>
      </motion.div>

      <div className="fixed inset-0 pointer-events-none scanning-line opacity-30" />
    </div>
  );
};

export default Auth;
