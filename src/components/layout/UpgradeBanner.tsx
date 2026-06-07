import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wrench, X, Zap } from 'lucide-react';

interface Props {
  message?: string;
}

const SESSION_KEY = 'upgrade-banner-dismissed';

export function UpgradeBanner({ message }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Don't show if user already dismissed this session
    const dismissed = sessionStorage.getItem(SESSION_KEY);
    if (!dismissed) setVisible(true);
  }, []);

  const dismiss = () => {
    sessionStorage.setItem(SESSION_KEY, '1');
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="overflow-hidden"
        >
          <div className="relative bg-gradient-to-r from-amber-500/15 via-amber-400/10 to-amber-500/15 border-b border-amber-500/30 px-4 py-2.5">
            {/* Subtle animated shimmer */}
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-400/5 to-transparent pointer-events-none"
              animate={{ x: ['-100%', '100%'] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
            />

            <div className="max-w-6xl mx-auto flex items-center gap-3 relative">
              {/* Icon */}
              <div className="shrink-0 flex items-center gap-1.5">
                <motion.div
                  animate={{ rotate: [0, -15, 15, -10, 10, 0] }}
                  transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 3 }}
                >
                  <Wrench className="w-4 h-4 text-amber-400" />
                </motion.div>
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              </div>

              {/* Text */}
              <p className="flex-1 text-sm text-amber-200/90 min-w-0">
                <span className="font-semibold text-amber-300">Upgrade in progress —&nbsp;</span>
                <span className="text-amber-200/80">
                  {message || "We're adding new features. Everything is running normally."}
                </span>
              </p>

              {/* "New features" pill */}
              <div className="shrink-0 hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs font-medium">
                <Zap className="w-3 h-3" />
                Live update
              </div>

              {/* Dismiss */}
              <button
                onClick={dismiss}
                className="shrink-0 ml-1 p-1 rounded hover:bg-amber-500/20 text-amber-400/70 hover:text-amber-300 transition-colors"
                aria-label="Dismiss upgrade banner"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
