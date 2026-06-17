import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Smartphone, Apple, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as any).standalone === true;
    setIsIOS(ios);
    setIsInstalled(standalone);

    const stored = sessionStorage.getItem('pwa-install-dismissed');
    if (stored) { setDismissed(true); return; }

    if (standalone) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setTimeout(() => setShow(true), 3000);
    };
    window.addEventListener('beforeinstallprompt', handler);

    if (ios && !standalone) {
      setTimeout(() => setShow(true), 5000);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    if (result.outcome === 'accepted') setIsInstalled(true);
    setShow(false);
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShow(false);
    setDismissed(true);
    sessionStorage.setItem('pwa-install-dismissed', '1');
  };

  if (isInstalled || dismissed || !show) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        className="fixed bottom-20 left-4 right-4 z-50 md:left-auto md:right-6 md:w-80"
      >
        <div className="bg-card border border-border rounded-2xl shadow-2xl shadow-black/40 p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                <Smartphone className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm">Install ChainCore</p>
                <p className="text-xs text-muted-foreground">Get the full app experience</p>
              </div>
            </div>
            <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground p-1">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5 mb-3">
            {[
              { icon: <Monitor className="w-3 h-3" />, label: 'Works offline' },
              { icon: <Smartphone className="w-3 h-3" />, label: 'Home screen icon' },
              { icon: <Download className="w-3 h-3" />, label: 'Fast load' },
            ].map(f => (
              <span key={f.label} className="flex items-center gap-1 text-xs bg-muted/30 px-2 py-0.5 rounded-full text-muted-foreground">
                {f.icon}{f.label}
              </span>
            ))}
          </div>

          {isIOS ? (
            <div className="text-xs text-muted-foreground space-y-1.5">
              <p className="font-medium text-foreground">iOS Install Steps:</p>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-bold">1</span>
                <span>Tap <Apple className="w-3 h-3 inline" /> Share button in Safari</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-bold">2</span>
                <span>Tap <strong>"Add to Home Screen"</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-bold">3</span>
                <span>Tap <strong>Add</strong> — done!</span>
              </div>
              <button onClick={handleDismiss} className="text-xs text-primary underline mt-1">Got it</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 h-8 text-xs gap-1.5 bg-primary text-primary-foreground" onClick={handleInstall}>
                <Download className="w-3 h-3" /> Install App
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs px-3" onClick={handleDismiss}>
                Not now
              </Button>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
