import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSignIn, useSignUp, useUser } from '@clerk/react';
import { useToast } from '@/hooks/use-toast';
import { Cpu, Mail, Lock, UserPlus, LogIn, ShieldCheck, ExternalLink } from 'lucide-react';
import { z } from 'zod';

const emailSchema = z.string().email('Please enter a valid email address');
const passwordSchema = z.string().min(8, 'Password must be at least 8 characters');

type Screen = 'login' | 'signup' | 'verify' | 'forgot' | 'reset_sent';

const EMAIL_PROVIDERS: { label: string; url: string }[] = [
  { label: 'Open Gmail',   url: 'https://mail.google.com' },
  { label: 'Open Outlook', url: 'https://outlook.live.com' },
  { label: 'Open Yahoo',   url: 'https://mail.yahoo.com' },
];

function OAuthButton({ provider, label, icon, onClick }: {
  provider: string; label: string; icon: React.ReactNode; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-center gap-2.5 w-full py-2.5 px-4 rounded-lg border border-border/60 bg-card hover:bg-muted/60 transition-colors text-sm font-medium text-foreground"
    >
      {icon}
      {label}
    </button>
  );
}

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48">
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
  </svg>
);

const GitHubIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
  </svg>
);

const Auth = () => {
  const [screen, setScreen] = useState<Screen>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);
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

  const handleOAuth = async (strategy: 'oauth_google' | 'oauth_github') => {
    setOauthLoading(strategy);
    try {
      await clerkSignIn?.authenticateWithRedirect({
        strategy,
        redirectUrl: `${window.location.origin}/sso-callback`,
        redirectUrlComplete: '/',
      });
    } catch (err: any) {
      const msg = err?.errors?.[0]?.message || 'OAuth sign-in failed';
      toast({ title: 'Sign In Failed', description: msg, variant: 'destructive' });
      setOauthLoading(null);
    }
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
        toast({ title: 'Additional verification required', description: 'Please complete any pending steps.', variant: 'destructive' });
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
        toast({ title: 'Check your email', description: `Verification code sent to ${email}` });
        setScreen('verify');
      } else {
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
      toast({ title: 'New code sent!', description: 'Check your inbox and spam folder.' });
      setVerifyCode('');
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
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.errors?.[0]?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const OAuthDivider = () => (
    <div className="flex items-center gap-3 my-5">
      <div className="flex-1 h-px bg-border/60" />
      <span className="text-xs text-muted-foreground">or continue with</span>
      <div className="flex-1 h-px bg-border/60" />
    </div>
  );

  const OAuthButtons = () => (
    <div className="flex gap-2.5">
      <OAuthButton
        provider="google"
        label="Google"
        icon={<GoogleIcon />}
        onClick={() => handleOAuth('oauth_google')}
      />
      <OAuthButton
        provider="github"
        label="GitHub"
        icon={<GitHubIcon />}
        onClick={() => handleOAuth('oauth_github')}
      />
    </div>
  );

  return (
    <div className="min-h-screen bg-background grid-pattern flex items-center justify-center p-4">
      <motion.div
        key={screen}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-md"
      >
        <div className="glass-card p-8 rounded-2xl border border-border/50">
          {/* Logo */}
          <div className="text-center mb-6">
            <div className="inline-flex p-3 rounded-xl bg-gradient-primary mb-4">
              {screen === 'verify' ? (
                <ShieldCheck className="w-8 h-8 text-primary-foreground" />
              ) : (
                <Cpu className="w-8 h-8 text-primary-foreground" />
              )}
            </div>
            <h1 className="text-2xl font-bold text-gradient-primary">ChainCore</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {screen === 'login'      && 'Sign in to your account'}
              {screen === 'signup'     && 'Create a new account'}
              {screen === 'verify'     && 'Verify your email address'}
              {screen === 'forgot'     && 'Reset your password'}
              {screen === 'reset_sent' && 'Check your email'}
            </p>
          </div>

          {/* ── EMAIL VERIFICATION ── */}
          {screen === 'verify' && (
            <form onSubmit={handleVerify} className="space-y-4">
              {/* Tip box */}
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2 text-sm">
                <p className="font-medium text-foreground">Code sent to <span className="text-primary">{email}</span></p>
                <ul className="text-muted-foreground space-y-1 text-xs list-disc list-inside">
                  <li>Sender: <span className="font-mono">noreply@clerk.dev</span></li>
                  <li>Subject: <em>"Verify your email address"</em></li>
                  <li className="text-amber-400 font-medium">Check your spam / junk folder — it often lands there</li>
                  <li>The code expires in 10 minutes</li>
                </ul>
              </div>

              {/* Quick links to open email providers */}
              <div className="flex gap-2 flex-wrap">
                {EMAIL_PROVIDERS.map((p) => (
                  <a
                    key={p.label}
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline border border-primary/30 rounded-md px-2.5 py-1.5 bg-primary/5 hover:bg-primary/10 transition-colors"
                  >
                    {p.label}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ))}
              </div>

              <div className="space-y-2">
                <Label htmlFor="code">6-Digit Verification Code</Label>
                <Input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="1 2 3 4 5 6"
                  value={verifyCode}
                  onChange={(e) => {
                    setVerifyCode(e.target.value.replace(/\D/g, ''));
                    setErrors({});
                  }}
                  className="text-center text-2xl tracking-[0.5em] font-mono h-14"
                  autoFocus
                  autoComplete="one-time-code"
                />
                {errors.code && <p className="text-xs text-destructive">{errors.code}</p>}
              </div>

              <Button type="submit" className="w-full gap-2 h-11" disabled={isLoading || verifyCode.length < 6}>
                {isLoading ? <span className="animate-spin">⟳</span> : <ShieldCheck className="h-4 w-4" />}
                {isLoading ? 'Verifying…' : 'Verify Email'}
              </Button>

              <div className="flex items-center justify-between text-sm pt-1">
                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={isLoading}
                  className="text-primary hover:underline disabled:opacity-50"
                >
                  Resend code
                </button>
                <button
                  type="button"
                  onClick={() => { setScreen('signup'); setVerifyCode(''); setErrors({}); }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  ← Back
                </button>
              </div>

              {/* Alternative: use OAuth instead */}
              <div className="pt-2 border-t border-border/40 mt-2">
                <p className="text-xs text-muted-foreground text-center mb-3">
                  Or skip email verification entirely — sign up with:
                </p>
                <OAuthButtons />
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
                {isLoading ? 'Sending…' : 'Send Reset Link'}
              </Button>
              <Button type="button" variant="ghost" className="w-full text-sm"
                onClick={() => { setScreen('login'); setErrors({}); }}>
                ← Back to Sign In
              </Button>
            </form>
          )}

          {/* ── RESET SENT ── */}
          {screen === 'reset_sent' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-primary/10 border border-primary/30 text-sm space-y-2">
                <div className="flex items-center gap-2 text-primary font-medium">
                  <Mail className="h-5 w-5" />
                  Reset link sent!
                </div>
                <p className="text-muted-foreground text-xs">
                  Sent to <strong>{email}</strong> from <span className="font-mono">noreply@clerk.dev</span>.
                  <br />Check your spam/junk folder if it doesn't arrive within a minute.
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                {EMAIL_PROVIDERS.map((p) => (
                  <a key={p.label} href={p.url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline border border-primary/30 rounded-md px-2.5 py-1.5 bg-primary/5">
                    {p.label} <ExternalLink className="w-3 h-3" />
                  </a>
                ))}
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
              {/* OAuth first — no email verification needed */}
              <OAuthButtons />
              <OAuthDivider />

              <form onSubmit={screen === 'login' ? handleLogin : handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="email" type="email" placeholder="you@example.com" value={email}
                      onChange={(e) => setEmail(e.target.value)} className="pl-10" autoComplete="email" />
                  </div>
                  {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="password" type="password" placeholder="••••••••" value={password}
                      onChange={(e) => setPassword(e.target.value)} className="pl-10"
                      autoComplete={screen === 'login' ? 'current-password' : 'new-password'} />
                  </div>
                  {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
                </div>

                {screen === 'signup' && (
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input id="confirmPassword" type="password" placeholder="••••••••" value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)} className="pl-10" autoComplete="new-password" />
                    </div>
                    {errors.confirm && <p className="text-xs text-destructive">{errors.confirm}</p>}
                  </div>
                )}

                <Button type="submit" className="w-full gap-2 h-11" disabled={isLoading}>
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

              <div className="mt-5 text-center">
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
