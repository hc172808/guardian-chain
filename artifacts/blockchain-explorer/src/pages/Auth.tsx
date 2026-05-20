import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAccount, useConnect, useDisconnect, useSignMessage } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { SiweMessage } from 'siwe';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Cpu, Wallet, ShieldCheck, Zap, Globe, Lock, PlusCircle, CheckCircle2 } from 'lucide-react';

import { Button } from '@/components/ui/button';

const FEATURES = [
  { icon: <Wallet className="w-5 h-5" />, title: 'Wallet Identity', desc: 'Your wallet address is your account — no email or password needed.' },
  { icon: <ShieldCheck className="w-5 h-5" />, title: 'Sign to Verify', desc: 'Prove ownership by signing a message. No gas fees involved.' },
  { icon: <Lock className="w-5 h-5" />, title: 'Fully Decentralized', desc: 'No centralised accounts. You own your identity on-chain.' },
];

const Auth = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, refreshWalletUser } = useAuth();
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);
  const [addingNetwork, setAddingNetwork] = useState(false);
  const [networkAdded, setNetworkAdded] = useState(false);

  const addGYDSNetwork = async () => {
    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      toast({ title: 'No wallet detected', description: 'Please install MetaMask or another Web3 wallet first.', variant: 'destructive' });
      return;
    }
    setAddingNetwork(true);
    try {
      await ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: '0x343A',
          chainName: 'GYDS Network',
          nativeCurrency: { name: 'GYDS', symbol: 'GYDS', decimals: 18 },
          rpcUrls: [`${window.location.origin}/api/rpc`],
          blockExplorerUrls: [window.location.origin],
        }],
      });
      setNetworkAdded(true);
      toast({ title: 'GYDS Network added!', description: 'Chain ID 13370 has been added to your wallet.' });
    } catch (err: any) {
      if (err?.code === 4001) {
        toast({ title: 'Cancelled', description: 'Network add was rejected.', variant: 'destructive' });
      } else {
        toast({ title: 'Failed to add network', description: err?.message || 'Unknown error', variant: 'destructive' });
      }
    } finally {
      setAddingNetwork(false);
    }
  };

  useEffect(() => {
    if (user) navigate('/');
  }, [user, navigate]);

  useEffect(() => {
    if (!isConnected) {
      setSigned(false);
    }
  }, [isConnected]);

  const handleSignIn = async () => {
    if (!address) return;
    setSigning(true);
    try {
      // 1. Get nonce from server
      const nonceRes = await fetch('/api/auth/nonce', { credentials: 'include' });
      const { nonce } = await nonceRes.json();

      // 2. Build SIWE message
      const siweMsg = new SiweMessage({
        domain: window.location.host,
        address,
        statement: 'Sign in to ChainCore — GYDSchain Explorer',
        uri: window.location.origin,
        version: '1',
        chainId: 1,
        nonce,
      });
      const message = siweMsg.prepareMessage();

      // 3. Ask wallet to sign
      const signature = await signMessageAsync({ message });

      // 4. Verify on server
      const verifyRes = await fetch('/api/auth/wallet/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message, signature }),
      });

      if (!verifyRes.ok) {
        throw new Error('Server verification failed');
      }

      setSigned(true);
      await refreshWalletUser();
      toast({ title: 'Wallet verified!', description: `Welcome, ${address.slice(0, 6)}...${address.slice(-4)}` });
      navigate('/');
    } catch (err: any) {
      if (err?.code === 4001 || err?.message?.includes('rejected')) {
        toast({ title: 'Signature rejected', description: 'You cancelled the sign request in your wallet.', variant: 'destructive' });
      } else {
        toast({ title: 'Sign-in failed', description: err?.message || 'Unknown error', variant: 'destructive' });
      }
    } finally {
      setSigning(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left panel — branding */}
      <motion.div
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 bg-gradient-to-br from-background via-background to-primary/5 border-r border-border/40 relative overflow-hidden"
      >
        {/* Background glow */}
        <div className="absolute top-1/3 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary to-cyan-400">
              <Cpu className="w-7 h-7 text-black" />
            </div>
            <span className="text-2xl font-bold text-gradient-primary">ChainCore</span>
          </div>
          <p className="text-xs text-muted-foreground tracking-widest uppercase mt-1 ml-1">GYDSchain Ecosystem</p>
        </div>

        <div className="relative z-10 space-y-6">
          <div>
            <h1 className="text-4xl font-bold leading-tight text-foreground mb-3">
              The Future of Web3<br />
              <span className="text-gradient-primary">Starts with Your Wallet</span>
            </h1>
            <p className="text-muted-foreground text-lg leading-relaxed">
              Explore blocks, swap tokens, stake validators, and launch assets — all with your wallet as your passport.
            </p>
          </div>

          <div className="space-y-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex items-start gap-4 p-4 rounded-xl border border-border/30 bg-card/30 backdrop-blur-sm">
                <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">{f.icon}</div>
                <div>
                  <p className="font-semibold text-foreground text-sm">{f.title}</p>
                  <p className="text-muted-foreground text-xs mt-0.5">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-2 text-xs text-muted-foreground">
          <Globe className="w-3.5 h-3.5" />
          <span>Powered by GYDSchain · Chain ID 13370 · PoS consensus</span>
        </div>
      </motion.div>

      {/* Right panel — wallet connect */}
      <div className="flex-1 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="w-full max-w-md space-y-8"
        >
          {/* Mobile logo */}
          <div className="lg:hidden text-center">
            <div className="inline-flex p-3 rounded-xl bg-gradient-to-br from-primary to-cyan-400 mb-3">
              <Cpu className="w-8 h-8 text-black" />
            </div>
            <h1 className="text-2xl font-bold text-gradient-primary">ChainCore</h1>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-foreground">Connect your wallet</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Use MetaMask, Coinbase Wallet, WalletConnect, or any Web3 wallet to sign in.
            </p>
          </div>

          {/* Step 1 — Connect wallet */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${isConnected ? 'bg-primary text-black' : 'bg-border text-foreground'}`}>
                {isConnected ? '✓' : '1'}
              </span>
              Connect Wallet
            </div>
            <ConnectButton
              label="Connect Wallet"
              showBalance={false}
              chainStatus="none"
            />
          </div>

          {/* Add GYDS Network helper */}
          <div className="rounded-xl border border-border/40 bg-card/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">GYDS Network</p>
                <p className="text-xs text-muted-foreground">Chain ID 13370 · native token GYDS</p>
              </div>
              {networkAdded ? (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <CheckCircle2 className="w-4 h-4" />
                  Added
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addGYDSNetwork}
                  disabled={addingNetwork}
                  className="gap-1.5 text-xs border-primary/40 text-primary hover:bg-primary/10"
                >
                  {addingNetwork ? (
                    <span className="animate-spin inline-block">⟳</span>
                  ) : (
                    <PlusCircle className="w-3.5 h-3.5" />
                  )}
                  Add to MetaMask
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              New to GYDS? Click above to add the network to your wallet in one click — no manual entry needed.
            </p>
          </div>

          {/* Step 2 — Sign to verify (shown after connecting) */}
          {isConnected && !signed && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold bg-border text-foreground">2</span>
                Sign to Verify Ownership
              </div>

              <div className="p-4 rounded-xl border border-border/50 bg-card/50 space-y-2">
                <p className="text-sm text-foreground font-medium">
                  Connected: <span className="font-mono text-primary">{address?.slice(0, 6)}...{address?.slice(-4)}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Click below and sign the message in your wallet to prove you own this address. This is free — no gas required.
                </p>
              </div>

              <Button
                onClick={handleSignIn}
                disabled={signing}
                className="w-full h-12 gap-2 text-base font-semibold bg-primary hover:bg-primary/90 text-black"
              >
                {signing ? (
                  <><span className="animate-spin inline-block">⟳</span> Waiting for signature…</>
                ) : (
                  <><Zap className="w-4 h-4" /> Sign in with Wallet</>
                )}
              </Button>
            </motion.div>
          )}

        </motion.div>
      </div>

      <div className="fixed inset-0 pointer-events-none scanning-line opacity-20" />
    </div>
  );
};

export default Auth;
