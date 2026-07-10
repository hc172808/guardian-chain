/**
 * CaptchaWidget.tsx
 *
 * Dual-mode CAPTCHA widget that mirrors the server's captcha.ts logic:
 *
 *   • If VITE_HCAPTCHA_SITE_KEY is set  → loads and renders the hCaptcha widget
 *   • Otherwise                          → shows the built-in math challenge
 *
 * Usage:
 *   <CaptchaWidget onVerify={payload => setCaptchaPayload(payload)} onExpire={() => setCaptchaPayload(null)} />
 *
 * Pass `captchaPayload` (spread) into your login/register fetch body.
 * Call reset() on the returned ref to get a fresh challenge after a failed attempt.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────
/** Shape sent to the server alongside username/password */
export type CaptchaPayload =
  | { hcaptchaToken: string }
  | { challengeId: string; captchaAnswer: string };

export interface CaptchaWidgetHandle {
  reset: () => void;
}

interface Props {
  onVerify: (payload: CaptchaPayload) => void;
  onExpire?: () => void;
  /** Pass a ref to get imperative reset() access */
  widgetRef?: React.MutableRefObject<CaptchaWidgetHandle | null>;
  className?: string;
}

// ── Config ────────────────────────────────────────────────────────────────────
const HCAPTCHA_SITE_KEY = (import.meta as any).env?.VITE_HCAPTCHA_SITE_KEY ?? '';

// ── hCaptcha widget (CDN-based, no npm package needed) ────────────────────────
const HCaptchaWidget = ({
  siteKey,
  onVerify,
  onExpire,
  widgetRef,
}: {
  siteKey: string;
  onVerify: (payload: CaptchaPayload) => void;
  onExpire?: () => void;
  widgetRef?: React.MutableRefObject<CaptchaWidgetHandle | null>;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef  = useRef<string | null>(null);
  const [loaded, setLoaded]   = useState(!!(window as any).hcaptcha);
  const [errored, setErrored] = useState(false);

  const renderWidget = useCallback(() => {
    const hc = (window as any).hcaptcha;
    if (!hc || !containerRef.current) return;
    // Clear any previous render first
    containerRef.current.innerHTML = '';
    try {
      widgetIdRef.current = hc.render(containerRef.current, {
        sitekey: siteKey,
        theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
        callback: (token: string) => onVerify({ hcaptchaToken: token }),
        'expired-callback': () => { onExpire?.(); },
        'error-callback': () => setErrored(true),
      });
    } catch { setErrored(true); }
  }, [siteKey, onVerify, onExpire]);

  // Load hCaptcha script once
  useEffect(() => {
    const win = window as any;
    if (win.hcaptcha) { setLoaded(true); return; }

    const existing = document.getElementById('hcaptcha-script');
    if (!existing) {
      const s = document.createElement('script');
      s.id  = 'hcaptcha-script';
      s.src = 'https://js.hcaptcha.com/1/api.js?render=explicit';
      s.async = true;
      s.defer = true;
      s.onload = () => setLoaded(true);
      s.onerror = () => setErrored(true);
      document.head.appendChild(s);
    } else {
      const onLoad = () => setLoaded(true);
      existing.addEventListener('load', onLoad);
      return () => existing.removeEventListener('load', onLoad);
    }
  }, []);

  // Render once loaded
  useEffect(() => {
    if (!loaded) return;
    renderWidget();
    return () => {
      const hc = (window as any).hcaptcha;
      if (hc && widgetIdRef.current !== null) {
        try { hc.remove(widgetIdRef.current); } catch {}
      }
    };
  }, [loaded, renderWidget]);

  // Expose imperative reset
  useEffect(() => {
    if (!widgetRef) return;
    widgetRef.current = {
      reset: () => {
        const hc = (window as any).hcaptcha;
        if (hc && widgetIdRef.current !== null) {
          try { hc.reset(widgetIdRef.current); } catch {}
        }
        onExpire?.();
      },
    };
  }, [widgetRef, onExpire]);

  if (errored) {
    return (
      <div className="flex items-center gap-2 text-amber-500 text-xs bg-amber-500/10 rounded-lg px-3 py-2">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        CAPTCHA unavailable — check your network connection.
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {!loaded && (
        <div className="flex items-center gap-2 text-muted-foreground text-xs py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading security check…
        </div>
      )}
      <div ref={containerRef} className={loaded ? '' : 'hidden'} />
    </div>
  );
};

// ── Math challenge widget (built-in, zero-config) ─────────────────────────────
const DIGIT_WORDS: Record<string, string> = {
  '0':'zero','1':'one','2':'two','3':'three','4':'four',
  '5':'five','6':'six','7':'seven','8':'eight','9':'nine',
  '10':'ten','11':'eleven','12':'twelve','13':'thirteen','14':'fourteen','15':'fifteen',
  '16':'sixteen','17':'seventeen','18':'eighteen','19':'nineteen','20':'twenty',
};

/** Render the math question with the numbers replaced by word labels for accessibility */
function QuestionDisplay({ question }: { question: string }) {
  // e.g. "8 + 3" → render each token stylishly
  const tokens = question.split(' ');
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xl font-bold tracking-wide select-none">
      {tokens.map((t, i) => {
        const isOp  = ['+','−','×','÷'].includes(t);
        const isNum = /^\d+$/.test(t) || t === '?';
        return (
          <span
            key={i}
            className={cn(
              'inline-flex items-center justify-center',
              isNum && t !== '?' && 'min-w-[2rem] h-8 rounded-md bg-primary/10 text-primary border border-primary/20',
              isOp  && 'text-muted-foreground text-lg',
              t === '?' && 'min-w-[2.5rem] h-8 rounded-md border-2 border-dashed border-primary/40 text-muted-foreground',
            )}
          >
            {t}
          </span>
        );
      })}
      <span className="text-muted-foreground text-lg">=</span>
      <span className="min-w-[2.5rem] h-8 rounded-md border-2 border-dashed border-primary/40 text-muted-foreground inline-flex items-center justify-center text-sm">?</span>
    </span>
  );
}

const MathChallengeWidget = ({
  onVerify,
  onExpire,
  widgetRef,
}: {
  onVerify: (payload: CaptchaPayload) => void;
  onExpire?: () => void;
  widgetRef?: React.MutableRefObject<CaptchaWidgetHandle | null>;
}) => {
  const [challengeId, setChallengeId] = useState('');
  const [question,    setQuestion]    = useState('');
  const [answer,      setAnswer]      = useState('');
  const [verified,    setVerified]    = useState(false);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep a stable reference to the latest onExpire/onVerify callbacks so
  // fetchChallenge doesn't need them in its dependency array — otherwise a
  // new inline `onExpire` prop on every parent re-render (e.g. each keystroke
  // in the username/password fields) would fetch a brand-new challenge.
  const onExpireRef = useRef(onExpire);
  useEffect(() => { onExpireRef.current = onExpire; }, [onExpire]);

  const fetchChallenge = useCallback(async () => {
    setLoading(true);
    setError('');
    setAnswer('');
    setVerified(false);
    onExpireRef.current?.();
    try {
      const res  = await fetch('/api/auth/captcha');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load security check');
      setChallengeId(data.challengeId);
      setQuestion(data.question);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      // Focus the input after load
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, []);

  // Fetch exactly once on mount. Subsequent fresh challenges only come from
  // an explicit reset() call (e.g. after a failed login) or the refresh button.
  useEffect(() => { fetchChallenge(); }, []);

  // Expose imperative reset
  useEffect(() => {
    if (!widgetRef) return;
    widgetRef.current = { reset: fetchChallenge };
  }, [widgetRef, fetchChallenge]);

  const handleChange = (val: string) => {
    // Only allow digits and minus sign
    const cleaned = val.replace(/[^0-9\-]/g, '');
    setAnswer(cleaned);
    setVerified(false);

    // Auto-verify when answer is plausibly complete (2+ digits or any digit after op ×)
    if (cleaned !== '' && !isNaN(parseInt(cleaned, 10))) {
      setVerified(true);
      onVerify({ challengeId, captchaAnswer: cleaned });
    } else {
      onExpire?.();
    }
  };

  return (
    <div className={cn(
      'rounded-xl border border-border bg-card/50 px-4 py-3 space-y-3',
      verified && 'border-green-500/40 bg-green-500/5',
    )}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>Security check</span>
        </div>
        <button
          type="button"
          onClick={fetchChallenge}
          disabled={loading}
          title="New question"
          className="p-1 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
        </button>
      </div>

      {/* Question */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 text-muted-foreground text-xs py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading question…
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-destructive text-xs">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
          <button type="button" onClick={fetchChallenge} className="underline ml-auto">Retry</button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <QuestionDisplay question={question} />
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="number"
              inputMode="numeric"
              value={answer}
              onChange={e => handleChange(e.target.value)}
              placeholder="Answer"
              className={cn(
                'w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none transition-colors text-center font-mono font-semibold',
                verified
                  ? 'border-green-500/60 focus:border-green-500 text-green-500'
                  : 'border-border focus:border-primary',
              )}
              aria-label="Type your answer"
            />
          </div>
        </div>
      )}

      {/* Status */}
      {verified && !loading && (
        <div className="flex items-center gap-1.5 text-green-500 text-xs">
          <ShieldCheck className="h-3.5 w-3.5" />
          Verified
        </div>
      )}
    </div>
  );
};

// ── Main export ───────────────────────────────────────────────────────────────
export const CaptchaWidget = ({ onVerify, onExpire, widgetRef, className }: Props) => {
  return (
    <div className={className}>
      {HCAPTCHA_SITE_KEY ? (
        <HCaptchaWidget
          siteKey={HCAPTCHA_SITE_KEY}
          onVerify={onVerify}
          onExpire={onExpire}
          widgetRef={widgetRef}
        />
      ) : (
        <MathChallengeWidget
          onVerify={onVerify}
          onExpire={onExpire}
          widgetRef={widgetRef}
        />
      )}
    </div>
  );
};
