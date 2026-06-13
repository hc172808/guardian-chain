import { useState, useEffect, useRef } from 'react';
import { Layout } from '@/components/layout/Layout';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useWalletConnect } from '@/hooks/useWalletConnect';
import { useToast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';
import { Droplets, Wallet, Loader2, Clock, AlertTriangle, ShieldCheck } from 'lucide-react';
import { MyOperationsFeed } from '@/components/wallet/MyOperationsFeed';

const HCAPTCHA_SITE_KEY = import.meta.env.VITE_HCAPTCHA_SITE_KEY ?? '';

function HCaptcha({ onVerify, onExpire }: { onVerify: (token: string) => void; onExpire: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);

  useEffect(() => {
    if (!HCAPTCHA_SITE_KEY || !ref.current) return;
    const scriptId = 'hcaptcha-script';
    if (!document.getElementById(scriptId)) {
      const s = document.createElement('script');
      s.id = scriptId;
      s.src = 'https://js.hcaptcha.com/1/api.js?render=explicit';
      s.async = true;
      s.defer = true;
      document.head.appendChild(s);
    }
    const render = () => {
      if ((window as any).hcaptcha && ref.current && !widgetRef.current) {
        widgetRef.current = (window as any).hcaptcha.render(ref.current, {
          sitekey: HCAPTCHA_SITE_KEY,
          callback: onVerify,
          'expired-callback': onExpire,
          theme: 'dark',
        });
      }
    };
    if ((window as any).hcaptcha) render();
    else {
      const script = document.getElementById(scriptId) as HTMLScriptElement;
      if (script) script.onload = render;
    }
    return () => {
      if (widgetRef.current !== null && (window as any).hcaptcha) {
        try { (window as any).hcaptcha.remove(widgetRef.current); } catch {}
        widgetRef.current = null;
      }
    };
  }, []);

  if (!HCAPTCHA_SITE_KEY) return null;
  return <div ref={ref} className="flex justify-center" />;
}

const FAUCET_AMOUNTS = {
  gyd: 100,
  gyds: 0.5,
};
const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

const FaucetPage = () => {
  const { user } = useAuth();
  const { address, isConnected } = useWalletConnect();
  const { toast } = useToast();
  const [isClaiming, setIsClaiming] = useState<'gyd' | 'gyds' | null>(null);
  const [lastClaim, setLastClaim] = useState<Record<string, number>>({});
  const [manualAddress, setManualAddress] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaEnabled = !!HCAPTCHA_SITE_KEY;

  const targetAddress = isConnected && address ? address : manualAddress;

  // Load existing cooldowns from API (server-enforced, survives refresh)
  useEffect(() => {
    if (!user) return;
    fetch('/api/faucet/claims')
      .then(r => r.ok ? r.json() : [])
      .then((data: Array<{ token_type: string; created_at: string }>) => {
        const next: Record<string, number> = {};
        data.forEach((c) => {
          const t = new Date(c.created_at).getTime();
          if (!next[c.token_type] || t > next[c.token_type]) next[c.token_type] = t;
        });
        setLastClaim(next);
      })
      .catch(() => {});
  }, [user]);

  const canClaim = (type: string) => {
    const last = lastClaim[type] || 0;
    return Date.now() - last > COOLDOWN_MS;
  };

  const nextClaimIn = (type: string) => {
    const last = lastClaim[type] || 0;
    const remaining = COOLDOWN_MS - (Date.now() - last);
    if (remaining <= 0) return '';
    const h = Math.floor(remaining / 3_600_000);
    const m = Math.floor((remaining % 3_600_000) / 60_000);
    return `${h}h ${m}m`;
  };

  const claim = async (type: 'gyd' | 'gyds') => {
    if (!user) {
      toast({ title: 'Login Required', description: 'Please sign in first.', variant: 'destructive' });
      return;
    }
    if (!targetAddress) {
      toast({ title: 'Address Required', description: 'Connect wallet or enter an address.', variant: 'destructive' });
      return;
    }
    if (!canClaim(type)) {
      toast({ title: 'Cooldown Active', description: 'You can claim once every 24 hours.', variant: 'destructive' });
      return;
    }

    if (captchaEnabled && !captchaToken) {
      toast({ title: 'CAPTCHA Required', description: 'Please complete the CAPTCHA first.', variant: 'destructive' });
      return;
    }

    setIsClaiming(type);
    try {
      const res = await fetch('/api/faucet/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token_type: type, wallet_address: targetAddress, hcaptcha_token: captchaToken }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Claim failed');

      setLastClaim(prev => ({ ...prev, [type]: Date.now() }));
      setCaptchaToken(null);
      toast({
        title: `🎉 Claimed ${data.amount} ${type.toUpperCase()}!`,
        description: `Test tokens sent to ${targetAddress.slice(0, 8)}...`,
      });
    } catch (err: any) {
      toast({ title: 'Claim Failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsClaiming(null);
    }
  };

  return (
    <Layout>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold flex items-center justify-center gap-3">
            <Droplets className="w-8 h-8 text-primary" />
            Testnet Faucet
          </h1>
          <p className="text-muted-foreground mt-2">
            Claim free test GYD and GYDS tokens for development and testing
          </p>
          <Badge variant="outline" className="mt-2 text-amber-400 border-amber-400/30">Testnet Only</Badge>
        </div>

        {/* Wallet / Address */}
        <GlassCard className="p-4 space-y-3">
          <p className="text-sm font-medium">Recipient Address</p>
          {isConnected && address ? (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/50">
              <Wallet className="h-4 w-4 text-primary" />
              <code className="text-sm font-mono flex-1">{address}</code>
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Connected</Badge>
            </div>
          ) : (
            <Input
              placeholder="0x... or connect wallet"
              value={manualAddress}
              onChange={(e) => setManualAddress(e.target.value)}
              className="font-mono"
            />
          )}
        </GlassCard>

        {/* Claim Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <GlassCard className="p-6 space-y-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center mx-auto text-2xl font-bold">
              G
            </div>
            <div>
              <h3 className="text-xl font-bold">GYD</h3>
              <p className="text-sm text-muted-foreground">Stablecoin (1 USD)</p>
              <p className="text-2xl font-bold mt-2">{FAUCET_AMOUNTS.gyd} GYD</p>
            </div>
            <Button
              className="w-full"
              disabled={isClaiming !== null || !user || !targetAddress || !canClaim('gyd')}
              onClick={() => claim('gyd')}
            >
              {isClaiming === 'gyd' ? (
                <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Claiming...</span>
              ) : !canClaim('gyd') ? (
                <span className="flex items-center gap-2"><Clock className="h-4 w-4" /> {nextClaimIn('gyd') || 'Cooldown'}</span>
              ) : (
                'Claim GYD'
              )}
            </Button>
          </GlassCard>

          <GlassCard className="p-6 space-y-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center mx-auto text-2xl font-bold">
              Gs
            </div>
            <div>
              <h3 className="text-xl font-bold">GYDS</h3>
              <p className="text-sm text-muted-foreground">Gas & Staking</p>
              <p className="text-2xl font-bold mt-2">{FAUCET_AMOUNTS.gyds} GYDS</p>
            </div>
            <Button
              className="w-full"
              disabled={isClaiming !== null || !user || !targetAddress || !canClaim('gyds')}
              onClick={() => claim('gyds')}
            >
              {isClaiming === 'gyds' ? (
                <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Claiming...</span>
              ) : !canClaim('gyds') ? (
                <span className="flex items-center gap-2"><Clock className="h-4 w-4" /> {nextClaimIn('gyds') || 'Cooldown'}</span>
              ) : (
                'Claim GYDS'
              )}
            </Button>
          </GlassCard>
        </div>

        {/* hCaptcha */}
        {captchaEnabled && (
          <GlassCard className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium mb-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Anti-Bot Verification
            </div>
            <HCaptcha
              onVerify={(token) => setCaptchaToken(token)}
              onExpire={() => setCaptchaToken(null)}
            />
            {captchaToken && (
              <p className="text-xs text-emerald-400 flex items-center gap-1 justify-center">
                <ShieldCheck className="h-3 w-3" /> Verified
              </p>
            )}
          </GlassCard>
        )}

        {/* Info */}
        <GlassCard className="p-4 border-amber-500/30 bg-amber-500/5">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-muted-foreground space-y-1">
              <p><strong className="text-foreground">Testnet tokens have no real value.</strong></p>
              <p>• Claim limit: once every 24 hours per token type</p>
              <p>• {FAUCET_AMOUNTS.gyd} GYD + {FAUCET_AMOUNTS.gyds} GYDS per claim</p>
              <p>• Tokens are for testing DeFi, staking, and transactions</p>
            </div>
          </div>
        </GlassCard>

        <MyOperationsFeed />
      </motion.div>
    </Layout>
  );
};

export default FaucetPage;
