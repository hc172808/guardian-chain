import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { Cpu, Eye, EyeOff, Wallet, User, Lock, Mail, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tab = 'login' | 'register' | 'web3';

const api = async (path: string, body?: object) => {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Request failed');
  return data;
};

// ── Login form ────────────────────────────────────────────────────────────────
const LoginForm = ({ onSuccess }: { onSuccess: () => void }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) { setError('Fill in all fields'); return; }
    setLoading(true);
    try {
      await api('/api/auth/login', { username: username.trim().toLowerCase(), password });
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground">Username</label>
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="your_username"
            autoComplete="username"
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-background border border-border focus:border-primary focus:outline-none text-sm transition-colors"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground">Password</label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type={showPw ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            className="w-full pl-10 pr-10 py-2.5 rounded-lg bg-background border border-border focus:border-primary focus:outline-none text-sm transition-colors"
          />
          <button type="button" onClick={() => setShowPw(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
            {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-lg px-3 py-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {loading ? 'Signing in…' : 'Sign In'}
      </button>
    </form>
  );
};

// ── Register form ─────────────────────────────────────────────────────────────
const RegisterForm = ({ onSuccess }: { onSuccess: () => void }) => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) { setError('Username and password are required'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (!/^[a-z0-9_]{3,20}$/i.test(username.trim())) {
      setError('Username must be 3–20 characters: letters, numbers, underscores only');
      return;
    }
    setLoading(true);
    try {
      await api('/api/auth/register', { username: username.trim(), email: email.trim() || undefined, password });
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground">Username <span className="text-destructive">*</span></label>
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="choose_a_username"
            autoComplete="username"
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-background border border-border focus:border-primary focus:outline-none text-sm transition-colors"
          />
        </div>
        <p className="text-xs text-muted-foreground">3–20 characters, letters/numbers/underscores</p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground">Email <span className="text-muted-foreground/50">(optional)</span></label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-background border border-border focus:border-primary focus:outline-none text-sm transition-colors"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground">Password <span className="text-destructive">*</span></label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type={showPw ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            className="w-full pl-10 pr-10 py-2.5 rounded-lg bg-background border border-border focus:border-primary focus:outline-none text-sm transition-colors"
          />
          <button type="button" onClick={() => setShowPw(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
            {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground">Confirm Password <span className="text-destructive">*</span></label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type={showPw ? 'text' : 'password'}
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            className={cn(
              "w-full pl-10 pr-4 py-2.5 rounded-lg bg-background border focus:outline-none text-sm transition-colors",
              confirm && password !== confirm ? 'border-destructive focus:border-destructive' : 'border-border focus:border-primary'
            )}
          />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-lg px-3 py-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {loading ? 'Creating account…' : 'Create Account'}
      </button>
    </form>
  );
};

// ── Web3 form ─────────────────────────────────────────────────────────────────
const Web3Form = ({ onSuccess }: { onSuccess: () => void }) => {
  const [step, setStep] = useState<'connect' | 'sign' | 'done'>('connect');
  const [address, setAddress] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const hasEthereum = typeof window !== 'undefined' && !!(window as any).ethereum;

  const handleConnect = async () => {
    setError('');
    setLoading(true);
    try {
      const eth = (window as any).ethereum;
      if (!eth) throw new Error('No Web3 wallet detected. Install MetaMask or another wallet.');
      const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' });
      if (!accounts[0]) throw new Error('No account selected');
      const addr = accounts[0].toLowerCase();
      setAddress(addr);

      // Fetch nonce from server
      const res = await fetch(`/api/auth/nonce?address=${encodeURIComponent(addr)}`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to get nonce');
      setMessage(data.message);
      setStep('sign');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSign = async () => {
    setError('');
    setLoading(true);
    try {
      const eth = (window as any).ethereum;
      const signature = await eth.request({
        method: 'personal_sign',
        params: [message, address],
      });
      await api('/api/auth/web3', { address, signature });
      setStep('done');
      setTimeout(onSuccess, 800);
    } catch (err: any) {
      if (err.code === 4001) setError('Signature rejected. Please try again.');
      else setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (step === 'done') {
    return (
      <div className="flex flex-col items-center gap-3 py-6">
        <CheckCircle2 className="h-12 w-12 text-green-400" />
        <p className="font-semibold">Wallet verified!</p>
        <p className="text-sm text-muted-foreground">Redirecting…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {step === 'connect' && (
        <>
          <p className="text-sm text-muted-foreground text-center">
            Connect your Web3 wallet to sign in. No password needed.
          </p>
          {!hasEthereum && (
            <div className="flex items-start gap-2 text-amber-500 text-sm bg-amber-500/10 rounded-lg px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              No wallet detected. Install <a href="https://metamask.io" target="_blank" rel="noopener noreferrer" className="underline ml-1">MetaMask</a> or another browser wallet.
            </div>
          )}
          <button
            onClick={handleConnect}
            disabled={loading || !hasEthereum}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
            {loading ? 'Connecting…' : 'Connect Wallet'}
          </button>
        </>
      )}

      {step === 'sign' && (
        <>
          <div className="p-3 rounded-lg bg-card border border-border">
            <p className="text-xs text-muted-foreground mb-1">Connected address</p>
            <p className="font-mono text-xs break-all">{address}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/40 border border-border">
            <p className="text-xs text-muted-foreground mb-1">Message to sign</p>
            <p className="text-xs font-mono whitespace-pre-wrap break-all">{message}</p>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Sign this message in your wallet to verify ownership. No gas required.
          </p>
          <button
            onClick={handleSign}
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
            {loading ? 'Waiting for signature…' : 'Sign & Verify'}
          </button>
          <button onClick={() => { setStep('connect'); setAddress(''); setMessage(''); setError(''); }}
            className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors">
            ← Use a different wallet
          </button>
        </>
      )}

      {error && (
        <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-lg px-3 py-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
};

// ── Main Auth page ─────────────────────────────────────────────────────────────
const Auth = () => {
  const { user, refetch } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('login');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (user) navigate('/');
  }, [user, navigate]);

  const handleSuccess = async () => {
    setSuccess(true);
    await refetch();
    navigate('/');
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'login',    label: 'Sign In' },
    { id: 'register', label: 'Register' },
    { id: 'web3',     label: 'Web3 Wallet' },
  ];

  return (
    <div className="min-h-screen bg-background grid-pattern flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="glass-card p-8 rounded-2xl border border-border/50">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="inline-flex p-3 rounded-xl bg-gradient-primary mb-4">
              <Cpu className="w-8 h-8 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold text-gradient-primary">ChainCore</h1>
            <p className="text-muted-foreground text-sm mt-1">GYDS Blockchain Network</p>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 p-1 rounded-lg bg-muted/50 mb-6">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex-1 py-1.5 rounded-md text-sm font-medium transition-all',
                  tab === t.id
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.15 }}
            >
              {tab === 'login'    && <LoginForm    onSuccess={handleSuccess} />}
              {tab === 'register' && <RegisterForm onSuccess={handleSuccess} />}
              {tab === 'web3'     && <Web3Form     onSuccess={handleSuccess} />}
            </motion.div>
          </AnimatePresence>

          {/* Footer switch */}
          <p className="text-center text-xs text-muted-foreground mt-5">
            {tab === 'login' ? (
              <>No account? <button onClick={() => setTab('register')} className="text-primary hover:underline">Register</button></>
            ) : tab === 'register' ? (
              <>Already have an account? <button onClick={() => setTab('login')} className="text-primary hover:underline">Sign in</button></>
            ) : (
              <>Prefer a password? <button onClick={() => setTab('login')} className="text-primary hover:underline">Sign in</button></>
            )}
          </p>
        </div>
      </motion.div>

      <div className="fixed inset-0 pointer-events-none scanning-line opacity-30" />
    </div>
  );
};

export default Auth;
