import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import {
  Cpu, Eye, EyeOff, Wallet, User, Lock, Mail,
  AlertCircle, Loader2, CheckCircle2, KeyRound, Smartphone,
  Copy, RefreshCw, ShieldAlert, Send
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Tab = 'login' | 'register' | 'web3' | 'reset' | 'totp';

const api = async (path: string, body?: object, method = 'POST') => {
  const res = await fetch(path, {
    method: body ? method : 'GET',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Request failed');
  return data;
};

// ── Login form ────────────────────────────────────────────────────────────────
const LoginForm = ({ onSuccess, onReset }: { onSuccess: () => void; onReset: () => void }) => {
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
        <label className="text-sm font-medium text-muted-foreground">Username or Email</label>
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input type="text" value={username} onChange={e => setUsername(e.target.value)}
            placeholder="username or email" autoComplete="username"
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-background border border-border focus:border-primary focus:outline-none text-sm transition-colors" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-muted-foreground">Password</label>
          <button type="button" onClick={onReset} className="text-xs text-primary hover:underline">Forgot password?</button>
        </div>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
            placeholder="••••••••" autoComplete="current-password"
            className="w-full pl-10 pr-10 py-2.5 rounded-lg bg-background border border-border focus:border-primary focus:outline-none text-sm transition-colors" />
          <button type="button" onClick={() => setShowPw(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
            {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {error && <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-lg px-3 py-2"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
      <button type="submit" disabled={loading}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-60">
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
          <input type="text" value={username} onChange={e => setUsername(e.target.value)}
            placeholder="choose_a_username" autoComplete="username"
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-background border border-border focus:border-primary focus:outline-none text-sm transition-colors" />
        </div>
        <p className="text-xs text-muted-foreground">3–20 characters, letters/numbers/underscores</p>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground">Email <span className="text-muted-foreground/50">(optional)</span></label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com" autoComplete="email"
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-background border border-border focus:border-primary focus:outline-none text-sm transition-colors" />
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground">Password <span className="text-destructive">*</span></label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
            placeholder="••••••••" autoComplete="new-password"
            className="w-full pl-10 pr-10 py-2.5 rounded-lg bg-background border border-border focus:border-primary focus:outline-none text-sm transition-colors" />
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
          <input type={showPw ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)}
            placeholder="••••••••" autoComplete="new-password"
            className={cn("w-full pl-10 pr-4 py-2.5 rounded-lg bg-background border focus:outline-none text-sm transition-colors",
              confirm && password !== confirm ? 'border-destructive focus:border-destructive' : 'border-border focus:border-primary')} />
        </div>
      </div>
      {error && <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-lg px-3 py-2"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
      <button type="submit" disabled={loading}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-60">
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
    setError(''); setLoading(true);
    try {
      const eth = (window as any).ethereum;
      if (!eth) throw new Error('No Web3 wallet detected. Install MetaMask or another wallet.');
      const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' });
      if (!accounts[0]) throw new Error('No account selected');
      const addr = accounts[0].toLowerCase();
      setAddress(addr);
      const res = await fetch(`/api/auth/nonce?address=${encodeURIComponent(addr)}`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to get nonce');
      setMessage(data.message);
      setStep('sign');
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleSign = async () => {
    setError(''); setLoading(true);
    try {
      const eth = (window as any).ethereum;
      const signature = await eth.request({ method: 'personal_sign', params: [message, address] });
      await api('/api/auth/web3', { address, signature });
      setStep('done');
      setTimeout(onSuccess, 800);
    } catch (err: any) {
      if (err.code === 4001) setError('Signature rejected. Please try again.');
      else setError(err.message);
    } finally { setLoading(false); }
  };

  if (step === 'done') return (
    <div className="flex flex-col items-center gap-3 py-6">
      <CheckCircle2 className="h-12 w-12 text-green-400" />
      <p className="font-semibold">Wallet verified!</p>
      <p className="text-sm text-muted-foreground">Redirecting…</p>
    </div>
  );

  return (
    <div className="space-y-4">
      {step === 'connect' && (
        <>
          <p className="text-sm text-muted-foreground text-center">Connect your Web3 wallet to sign in. No password needed.</p>
          {!hasEthereum && (
            <div className="flex items-start gap-2 text-amber-500 text-sm bg-amber-500/10 rounded-lg px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              No wallet detected. Install <a href="https://metamask.io" target="_blank" rel="noopener noreferrer" className="underline ml-1">MetaMask</a>.
            </div>
          )}
          <button onClick={handleConnect} disabled={loading || !hasEthereum}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-60">
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
          <p className="text-xs text-muted-foreground text-center">Sign this message in your wallet to verify ownership. No gas required.</p>
          <button onClick={handleSign} disabled={loading}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-60">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
            {loading ? 'Waiting for signature…' : 'Sign & Verify'}
          </button>
          <button onClick={() => { setStep('connect'); setAddress(''); setMessage(''); setError(''); }}
            className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors">
            ← Use a different wallet
          </button>
        </>
      )}
      {error && <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-lg px-3 py-2"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
    </div>
  );
};

// ── Password Reset form ───────────────────────────────────────────────────────
const ResetForm = ({ onBack }: { onBack: () => void }) => {
  const [mode, setMode] = useState<'whatsapp' | 'wallet' | 'email'>('whatsapp');
  const [step, setStep] = useState<'request' | 'otp' | 'sent' | 'confirm' | 'done'>('request');
  // WhatsApp mode
  const [waUsername, setWaUsername] = useState('');
  const [waOtp, setWaOtp] = useState('');
  // Email mode
  const [email, setEmail] = useState('');
  // Wallet mode
  const [walletAddress, setWalletAddress] = useState('');
  // Shared confirm step
  const [resetToken, setResetToken] = useState('');
  const [manualToken, setManualToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [needs2fa, setNeeds2fa] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleWhatsAppRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await api('/api/auth/reset-password/whatsapp', { username: waUsername.trim().toLowerCase() });
      setStep('otp');
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleWhatsAppVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const data = await api('/api/auth/reset-password/whatsapp/verify', { username: waUsername.trim().toLowerCase(), otp: waOtp.trim() });
      setResetToken(data.token);
      setStep('confirm');
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleEmailRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await api('/api/auth/reset-password/request', { email: email.trim().toLowerCase() });
      setStep('sent');
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleWalletReset = async () => {
    setError(''); setLoading(true);
    try {
      const provider = (window as any).ethereum;
      if (!provider) throw new Error('No wallet detected. Install MetaMask or Trust Wallet.');
      const [acct] = await provider.request({ method: 'eth_requestAccounts' });
      const addr = String(acct).toLowerCase();
      setWalletAddress(addr);
      const nonceRes = await fetch(`/api/auth/nonce?address=${addr}`);
      const { nonce, message } = await nonceRes.json();
      if (!nonce) throw new Error('Failed to get challenge from server');
      const signature = await provider.request({ method: 'personal_sign', params: [message, addr] });
      const data = await api('/api/auth/reset-password/wallet', { address: addr, signature });
      setResetToken(data.token);
      setStep('confirm');
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword !== confirm) { setError('Passwords do not match'); return; }
    if (newPassword.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      const tok = resetToken || manualToken.trim();
      if (!tok) { setError('Paste the reset token from your email'); setLoading(false); return; }
      await api('/api/auth/reset-password/confirm', { token: tok, newPassword, totpCode: totpCode || undefined });
      setStep('done');
    } catch (err: any) {
      if (err.message?.includes('2FA') || err.message?.includes('authenticator')) setNeeds2fa(true);
      setError(err.message);
    }
    finally { setLoading(false); }
  };

  if (step === 'done') return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <CheckCircle2 className="h-12 w-12 text-green-400" />
      <p className="font-semibold">Password updated!</p>
      <p className="text-sm text-muted-foreground">Your account is secure. Sign in with your new password.</p>
      <button onClick={onBack} className="text-sm text-primary hover:underline mt-2">← Back to Sign In</button>
    </div>
  );

  if (step === 'otp') return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-2 py-2 text-center">
        <div className="h-14 w-14 rounded-full bg-green-500/10 flex items-center justify-center text-2xl">📱</div>
        <p className="font-semibold">Check WhatsApp</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          A 6-digit code was sent to the WhatsApp number linked to <span className="text-foreground font-medium">{waUsername}</span>. Enter it below.
        </p>
      </div>
      <form onSubmit={handleWhatsAppVerify} className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">WhatsApp Code</label>
          <input type="text" inputMode="numeric" value={waOtp} onChange={e => setWaOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="• • • • • •" maxLength={6} autoFocus
            className="w-full px-4 py-3 rounded-lg bg-background border border-border focus:border-primary focus:outline-none text-xl font-mono text-center tracking-[0.5em]" />
          <p className="text-xs text-muted-foreground text-center">Code expires in 10 minutes</p>
        </div>
        {error && <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-lg px-3 py-2"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
        <button type="submit" disabled={loading || waOtp.length < 6}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-60">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {loading ? 'Verifying…' : 'Verify Code'}
        </button>
        <button type="button" onClick={() => { setStep('request'); setWaOtp(''); setError(''); }}
          className="w-full text-xs text-muted-foreground hover:text-foreground">
          ← Didn't receive it? Try again
        </button>
      </form>
    </div>
  );

  if (step === 'sent') return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
        <Send className="h-7 w-7 text-primary" />
      </div>
      <p className="font-semibold">Check your inbox</p>
      <p className="text-sm text-muted-foreground max-w-xs">
        If <span className="text-foreground font-mono text-xs">{email}</span> is registered, we've sent a secure reset link. It expires in 1 hour.
      </p>
      <button onClick={() => { setStep('confirm'); }} className="text-xs text-primary hover:underline mt-1">
        I have my reset token →
      </button>
      <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground">← Back to Sign In</button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30">
        <ShieldAlert className="h-5 w-5 text-primary shrink-0" />
        <div>
          <p className="text-sm font-medium">Password Reset</p>
          <p className="text-xs text-muted-foreground">
            {step === 'request' ? 'Choose how to verify account ownership.' : 'Set your new password below.'}
          </p>
        </div>
      </div>

      {step === 'request' && (
        <>
          {/* Mode tabs */}
          <div className="flex rounded-lg border border-border overflow-hidden text-xs font-medium">
            {([
              { id: 'whatsapp', icon: '💬', label: 'WhatsApp' },
              { id: 'wallet',   icon: null,  label: 'Wallet' },
              { id: 'email',    icon: null,  label: 'Email' },
            ] as const).map(t => (
              <button key={t.id} type="button"
                onClick={() => { setMode(t.id); setError(''); }}
                className={cn('flex-1 py-2 flex items-center justify-center gap-1 transition-colors',
                  mode === t.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary/50')}>
                {t.icon && <span>{t.icon}</span>}
                {!t.icon && (t.id === 'wallet' ? <Wallet className="h-3 w-3" /> : <Mail className="h-3 w-3" />)}
                {t.label}
                {t.id === 'whatsapp' && <span className="text-[9px] opacity-70 ml-0.5">(Recommended)</span>}
              </button>
            ))}
          </div>

          {/* WhatsApp mode */}
          {mode === 'whatsapp' && (
            <form onSubmit={handleWhatsAppRequest} className="space-y-4">
              <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-sm text-green-300 space-y-1">
                <p className="font-medium">📱 Reset via WhatsApp OTP</p>
                <p className="text-xs">Enter your username. A 6-digit code will be sent to the WhatsApp number linked to your account.</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Username</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input type="text" value={waUsername} onChange={e => setWaUsername(e.target.value)}
                    placeholder="your_username" required autoComplete="username"
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-background border border-border focus:border-primary focus:outline-none text-sm" />
                </div>
              </div>
              {error && <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-lg px-3 py-2"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
              <button type="submit" disabled={loading || !waUsername.trim()}
                className="w-full py-2.5 rounded-lg bg-green-600 text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-green-500 transition-colors disabled:opacity-60">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>💬</span>}
                {loading ? 'Sending…' : 'Send WhatsApp Code'}
              </button>
              <button type="button" onClick={onBack} className="w-full text-xs text-muted-foreground hover:text-foreground">← Back to Sign In</button>
            </form>
          )}

          {/* Wallet mode */}
          {mode === 'wallet' && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-sm text-blue-300 space-y-1">
                <p className="font-medium">Most secure method</p>
                <p className="text-xs">Connect the wallet linked to your account and sign a challenge. No transaction needed.</p>
              </div>
              {walletAddress && (
                <div className="p-2 rounded bg-secondary/30 text-xs font-mono text-muted-foreground break-all">{walletAddress}</div>
              )}
              {error && <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-lg px-3 py-2"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
              <button type="button" onClick={handleWalletReset} disabled={loading}
                className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-60">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                {loading ? 'Waiting for signature…' : 'Sign with Wallet to Reset'}
              </button>
              <button type="button" onClick={onBack} className="w-full text-xs text-muted-foreground hover:text-foreground">← Back to Sign In</button>
            </div>
          )}

          {/* Email mode */}
          {mode === 'email' && (
            <form onSubmit={handleEmailRequest} className="space-y-4">
              <div className="p-3 rounded-lg bg-secondary/20 border border-border/30 text-xs text-muted-foreground">
                Enter the <strong>email address</strong> registered to your account. A secure reset link will be sent.
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Registered Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com" required
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-background border border-border focus:border-primary focus:outline-none text-sm" />
                </div>
              </div>
              {error && <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-lg px-3 py-2"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
              <button type="submit" disabled={loading}
                className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-60">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {loading ? 'Sending…' : 'Send Reset Link'}
              </button>
              <button type="button" onClick={onBack} className="w-full text-xs text-muted-foreground hover:text-foreground">← Back to Sign In</button>
            </form>
          )}
        </>
      )}

      {step === 'confirm' && (
        <form onSubmit={handleConfirm} className="space-y-4">
          {resetToken ? (
            <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20 text-xs text-green-400 flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> Identity verified — set your new password below.
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Reset Token <span className="text-xs font-normal">(from email)</span></label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input type="text" value={manualToken} onChange={e => setManualToken(e.target.value)}
                  placeholder="Paste token from email"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-background border border-border focus:border-primary focus:outline-none text-sm font-mono" />
              </div>
            </div>
          )}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">New Password <span className="text-xs font-normal text-muted-foreground/60">(min 8 chars)</span></label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input type={showPw ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)}
                placeholder="••••••••" autoComplete="new-password"
                className="w-full pl-10 pr-10 py-2.5 rounded-lg bg-background border border-border focus:border-primary focus:outline-none text-sm" />
              <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Confirm Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input type={showPw ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)}
                placeholder="••••••••" autoComplete="new-password"
                className={cn("w-full pl-10 pr-4 py-2.5 rounded-lg bg-background border focus:outline-none text-sm",
                  confirm && newPassword !== confirm ? 'border-destructive' : 'border-border focus:border-primary')} />
            </div>
          </div>
          {needs2fa && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-amber-400 flex items-center gap-1.5">
                <Smartphone className="h-3.5 w-3.5" /> 2FA Code Required
              </label>
              <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 mb-1">
                This account has 2FA enabled. Enter your authenticator code or a backup code.
              </div>
              <input type="text" value={totpCode} onChange={e => setTotpCode(e.target.value)}
                placeholder="6-digit code" maxLength={12}
                className="w-full px-3 py-2.5 rounded-lg bg-background border border-amber-500/40 focus:border-amber-400 focus:outline-none text-sm font-mono text-center tracking-widest" />
            </div>
          )}
          {error && <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-lg px-3 py-2"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
          <button type="submit" disabled={loading}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-60">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            {loading ? 'Updating…' : 'Set New Password'}
          </button>
          <button type="button" onClick={() => { setStep('request'); setResetToken(''); setError(''); }}
            className="w-full text-xs text-muted-foreground hover:text-foreground">
            ← Try a different method
          </button>
        </form>
      )}
    </div>
  );
};

// ── 2FA Setup form (for logged-in users — shown from profile) ─────────────────
export const TotpSetup = ({ onDone }: { onDone?: () => void }) => {
  const [step, setStep] = useState<'idle' | 'scan' | 'verify' | 'done'>('idle');
  const [secret, setSecret] = useState('');
  const [otpauth, setOtpauth] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const startSetup = async () => {
    setError(''); setLoading(true);
    try {
      const data = await api('/api/auth/totp/setup');
      setSecret(data.secret);
      setOtpauth(data.otpauth);
      setStep('scan');
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await api('/api/auth/totp/verify', { code: code.trim() });
      setStep('done');
      onDone?.();
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  if (step === 'done') return (
    <div className="flex flex-col items-center gap-3 py-4">
      <CheckCircle2 className="h-10 w-10 text-green-400" />
      <p className="font-semibold text-green-400">2FA Enabled!</p>
      <p className="text-sm text-muted-foreground text-center">Your account is now protected with two-factor authentication.</p>
    </div>
  );

  return (
    <div className="space-y-4">
      {step === 'idle' && (
        <>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30">
            <Smartphone className="h-5 w-5 text-primary shrink-0" />
            <div>
              <p className="text-sm font-medium">Two-Factor Authentication</p>
              <p className="text-xs text-muted-foreground">Use an authenticator app (Google Authenticator, Authy) for extra security.</p>
            </div>
          </div>
          {error && <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-lg px-3 py-2"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
          <button onClick={startSetup} disabled={loading}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-60">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
            {loading ? 'Setting up…' : 'Set Up 2FA'}
          </button>
        </>
      )}

      {step === 'scan' && (
        <>
          <p className="text-sm text-muted-foreground">Scan this QR code with your authenticator app, or enter the secret manually:</p>
          <div className="p-4 rounded-lg bg-white flex items-center justify-center">
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(otpauth)}`}
              alt="TOTP QR Code" className="w-44 h-44 rounded" />
          </div>
          <div className="p-3 rounded-lg bg-secondary/30">
            <p className="text-xs text-muted-foreground mb-1">Manual entry secret:</p>
            <p className="font-mono text-sm break-all">{secret}</p>
          </div>
          <button onClick={() => setStep('verify')}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors">
            I've scanned it →
          </button>
        </>
      )}

      {step === 'verify' && (
        <form onSubmit={verifyCode} className="space-y-4">
          <p className="text-sm text-muted-foreground">Enter the 6-digit code from your authenticator app to confirm setup:</p>
          <input type="text" inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value)}
            placeholder="000000" autoComplete="one-time-code"
            className="w-full text-center text-2xl tracking-widest font-mono py-3 rounded-lg bg-background border border-border focus:border-primary focus:outline-none" />
          {error && <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-lg px-3 py-2"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
          <button type="submit" disabled={loading || code.length < 6}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-60">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? 'Verifying…' : 'Verify & Enable 2FA'}
          </button>
          <button type="button" onClick={() => setStep('scan')} className="w-full text-xs text-muted-foreground hover:text-foreground">
            ← Back to QR code
          </button>
        </form>
      )}
    </div>
  );
};

// ── Main Auth page ─────────────────────────────────────────────────────────────
const Auth = () => {
  const { user, refetch } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('login');

  useEffect(() => {
    if (user) navigate('/');
  }, [user, navigate]);

  const handleSuccess = async () => {
    await refetch();
    navigate('/');
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'login',    label: 'Sign In' },
    { id: 'register', label: 'Register' },
    { id: 'web3',     label: 'Web3 Wallet' },
  ];

  const footerText = {
    login:    <><button onClick={() => setTab('register')} className="text-primary hover:underline">Create account</button> · <button onClick={() => setTab('web3')} className="text-primary hover:underline">Web3</button></>,
    register: <><button onClick={() => setTab('login')} className="text-primary hover:underline">Sign in</button></>,
    web3:     <><button onClick={() => setTab('login')} className="text-primary hover:underline">Use password</button></>,
    reset:    null,
    totp:     null,
  };

  return (
    <div className="min-h-screen bg-background grid-pattern flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="glass-card p-8 rounded-2xl border border-border/50">
          <div className="text-center mb-6">
            <div className="inline-flex p-3 rounded-xl bg-gradient-primary mb-4">
              <Cpu className="w-8 h-8 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold text-gradient-primary">ChainCore</h1>
            <p className="text-muted-foreground text-sm mt-1">GYDS Blockchain Network</p>
          </div>

          {tab !== 'reset' && tab !== 'totp' && (
            <div className="flex gap-1 p-1 rounded-lg bg-muted/50 mb-6">
              {tabs.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={cn('flex-1 py-1.5 rounded-md text-sm font-medium transition-all',
                    tab === t.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                  {t.label}
                </button>
              ))}
            </div>
          )}

          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.15 }}>
              {tab === 'login'    && <LoginForm    onSuccess={handleSuccess} onReset={() => setTab('reset')} />}
              {tab === 'register' && <RegisterForm onSuccess={handleSuccess} />}
              {tab === 'web3'     && <Web3Form     onSuccess={handleSuccess} />}
              {tab === 'reset'    && <ResetForm    onBack={() => setTab('login')} />}
            </motion.div>
          </AnimatePresence>

          {footerText[tab] && (
            <p className="text-center text-xs text-muted-foreground mt-5">
              {footerText[tab]}
            </p>
          )}
        </div>
      </motion.div>
      <div className="fixed inset-0 pointer-events-none scanning-line opacity-30" />
    </div>
  );
};

export default Auth;
