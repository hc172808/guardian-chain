import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Wallet, AlertTriangle, Smartphone, ExternalLink } from 'lucide-react';
import {
  detectProviders,
  connectWallet,
  signLoginMessage,
  signUpWithWallet,
  signInWithWallet,
  getWalletInstallUrl,
  getWalletDeepLink,
} from '@/lib/web3Auth';
import { isMobile } from '@/config/network';
import { useToast } from '@/hooks/use-toast';

interface Web3ConnectModalProps {
  open: boolean;
  onClose: () => void;
  mode: 'login' | 'signup' | 'link';
  onSuccess?: (address: string) => void;
}

export const Web3ConnectModal = ({ open, onClose, mode, onSuccess }: Web3ConnectModalProps) => {
  const { toast } = useToast();
  const [step, setStep] = useState<'select' | 'sign' | 'processing'>('select');
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [availableProviders, setAvailableProviders] = useState<ReturnType<typeof detectProviders>>([]);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [connectingAddress, setConnectingAddress] = useState<string>('');
  const [pendingProvider, setPendingProvider] = useState<any>(null);

  useEffect(() => {
    setIsMobileDevice(isMobile());
    setAvailableProviders(detectProviders());
    // Re-scan for providers periodically (some mobile wallets inject late)
    const interval = setInterval(() => {
      setAvailableProviders(detectProviders());
    }, 1000);
    return () => clearInterval(interval);
  }, [open]);

  const handleConnect = async (providerName: string) => {
    setSelectedProvider(providerName);
    setStep('sign');
    try {
      const { address, provider } = await connectWallet();
      setConnectingAddress(address);
      setPendingProvider(provider);
      await handleSign(address, provider);
    } catch (err: any) {
      toast({ title: 'Connection Failed', description: err.message, variant: 'destructive' });
      setStep('select');
      setSelectedProvider(null);
    }
  };

  const handleSign = async (address: string, provider: any) => {
    setStep('processing');
    try {
      const signature = await signLoginMessage(address, provider, mode === 'signup' ? 'signup' : 'login');
      // Use the address as the "username" for Supabase
      const { user, error } = mode === 'signup'
        ? await signUpWithWallet(address)
        : await signInWithWallet(address);

      if (error) {
        toast({ title: 'Authentication Failed', description: error.message, variant: 'destructive' });
        setStep('select');
        return;
      }

      toast({
        title: mode === 'signup' ? 'Account Created!' : 'Wallet Connected!',
        description: `${address.slice(0, 6)}...${address.slice(-4)} is now ${mode === 'signup' ? 'your account' : 'linked'}.`,
      });

      onSuccess?.(address);
      onClose();
      setStep('select');
    } catch (err: any) {
      toast({ title: 'Signature Failed', description: err.message, variant: 'destructive' });
      setStep('sign');
    }
  };

  const handleMobileOpen = (walletName: string) => {
    const currentUrl = window.location.href;
    const deepLink = getWalletDeepLink(walletName, currentUrl);
    if (deepLink) {
      window.location.href = deepLink;
    } else {
      const installUrl = getWalletInstallUrl(walletName);
      if (installUrl) window.open(installUrl, '_blank');
    }
  };

  const getWalletIcon = (name: string) => {
    const icons: Record<string, string> = {
      'MetaMask': 'https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg',
      'Trust Wallet': 'https://trustwallet.com/assets/images/media/assets/trust_platform.svg',
      'Phantom': 'https://phantom.app/img/phantom-logo.svg',
      'Coinbase Wallet': 'https://www.coinbase.com/assets/coinbase-app/app-icon.png',
    };
    return icons[name] || null;
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); setStep('select'); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            {mode === 'signup' ? 'Create Account with Wallet' : mode === 'login' ? 'Login with Wallet' : 'Link Wallet'}
          </DialogTitle>
          <DialogDescription>
            {step === 'select' && 'Connect your crypto wallet to authenticate.'}
            {step === 'sign' && 'Sign the message in your wallet to verify.'}
            {step === 'processing' && 'Processing your authentication...'}
          </DialogDescription>
        </DialogHeader>

        {step === 'select' && (
          <div className="space-y-4">
            {isMobileDevice && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm">
                <div className="flex items-start gap-2">
                  <Smartphone className="h-4 w-4 text-amber-500 mt-0.5" />
                  <div>
                    <p className="font-medium text-amber-500">On mobile?</p>
                    <p className="text-muted-foreground">
                      Open this page inside your wallet's built-in browser (MetaMask → Browser, Trust → DApps).
                    </p>
                  </div>
                </div>
              </div>
            )}

            {availableProviders.length > 0 ? (
              <div className="space-y-2">
                {availableProviders.map((p) => (
                  <Button
                    key={p.name}
                    variant="outline"
                    className="w-full justify-start gap-3 h-14"
                    onClick={() => handleConnect(p.name)}
                    disabled={step !== 'select'}
                  >
                    {getWalletIcon(p.name) ? (
                      <img src={getWalletIcon(p.name)!} alt={p.name} className="h-6 w-6" />
                    ) : (
                      <Wallet className="h-5 w-5" />
                    )}
                    <span className="flex-1 text-left">{p.name}</span>
                    <span className="text-xs text-muted-foreground">Detected</span>
                  </Button>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-4 rounded-lg bg-secondary/30 text-center">
                  <AlertTriangle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm font-medium">No wallet detected</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Install a wallet extension or open this page in a wallet app.
                  </p>
                </div>

                {isMobileDevice && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Open in wallet app:</p>
                    {['MetaMask', 'Trust Wallet', 'Phantom'].map((wallet) => (
                      <Button
                        key={wallet}
                        variant="outline"
                        className="w-full justify-start gap-3 h-12"
                        onClick={() => handleMobileOpen(wallet)}
                      >
                        {getWalletIcon(wallet) ? (
                          <img src={getWalletIcon(wallet)!} alt={wallet} className="h-5 w-5" />
                        ) : (
                          <Wallet className="h-4 w-4" />
                        )}
                        <span className="flex-1 text-left">{wallet}</span>
                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    ))}
                  </div>
                )}

                {!isMobileDevice && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Install a wallet:</p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1" asChild>
                        <a href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer">
                          MetaMask
                        </a>
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1" asChild>
                        <a href="https://trustwallet.com/download" target="_blank" rel="noopener noreferrer">
                          Trust Wallet
                        </a>
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {step === 'sign' && (
          <div className="text-center space-y-4 py-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-primary/20 flex items-center justify-center">
              <Wallet className="h-8 w-8 text-primary animate-pulse" />
            </div>
            <div>
              <p className="font-medium">Sign the message in your wallet</p>
              <p className="text-sm text-muted-foreground mt-1">
                {connectingAddress && `${connectingAddress.slice(0, 6)}...${connectingAddress.slice(-4)}`}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Check your wallet popup to confirm the signature request.
            </p>
          </div>
        )}

        {step === 'processing' && (
          <div className="text-center space-y-4 py-4">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="font-medium">Authenticating...</p>
            <p className="text-xs text-muted-foreground">
              {mode === 'signup' ? 'Creating your account...' : 'Logging you in...'}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
