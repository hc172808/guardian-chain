import { useState } from 'react';
import { motion } from 'framer-motion';
import { Cpu, Wrench, Clock, Zap, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

interface Props {
  message?: string;
}

const FEATURES = [
  'New DeFi features',
  'Improved performance',
  'Enhanced security',
  'Better analytics',
];

export default function Maintenance({ message }: Props) {
  const navigate = useNavigate();
  const [adminClick, setAdminClick] = useState(0);

  // Secret: click the logo 5 times to reach login page
  const handleLogoClick = () => {
    const next = adminClick + 1;
    setAdminClick(next);
    if (next >= 5) navigate('/auth');
  };

  return (
    <div className="min-h-screen bg-background grid-pattern flex items-center justify-center p-4 overflow-hidden">
      {/* Scanning line */}
      <div className="fixed inset-0 pointer-events-none scanning-line opacity-20" />

      {/* Glow blobs */}
      <div className="fixed top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-1/4 right-1/4 w-96 h-96 bg-neon-cyan/5 rounded-full blur-3xl pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="max-w-lg w-full text-center space-y-8"
      >
        {/* Logo — secret admin entry */}
        <motion.div
          className="flex justify-center cursor-pointer select-none"
          onClick={handleLogoClick}
          whileTap={{ scale: 0.95 }}
        >
          <div className="relative">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-0 rounded-full border border-primary/30 border-dashed"
            />
            <div className="p-6 rounded-full bg-gradient-to-br from-primary/20 to-neon-cyan/10 border border-primary/30 backdrop-blur-sm">
              <Cpu className="w-12 h-12 text-primary" />
            </div>
          </div>
        </motion.div>

        {/* Brand */}
        <div>
          <h1 className="text-4xl font-bold text-gradient-primary mb-1">ChainCore</h1>
          <p className="text-muted-foreground text-sm">GYDSchain Network Dashboard</p>
        </div>

        {/* Main card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="glass-card rounded-2xl p-8 border border-primary/20 space-y-6"
        >
          {/* Icon + title */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30"
              >
                <Wrench className="w-8 h-8 text-amber-400" />
              </motion.div>
              {/* Animated dot */}
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 rounded-full animate-ping" />
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 rounded-full" />
            </div>

            <div>
              <h2 className="text-2xl font-bold text-foreground">Upgrading the Network</h2>
              <p className="text-muted-foreground text-sm mt-1">
                We're adding exciting new features. Back shortly!
              </p>
            </div>
          </div>

          {/* Custom message */}
          {message && (
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-sm text-foreground">
              {message}
            </div>
          )}

          {/* What's coming */}
          <div className="space-y-2 text-left">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              What's coming
            </p>
            <div className="grid grid-cols-1 gap-2">
              {FEATURES.map((f, i) => (
                <motion.div
                  key={f}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + i * 0.1 }}
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <Zap className="w-3.5 h-3.5 text-neon-cyan shrink-0" />
                  {f}
                </motion.div>
              ))}
            </div>
          </div>

          {/* Animated progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> In progress</span>
              <span className="font-mono text-primary">Almost done…</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-primary to-neon-cyan rounded-full"
                animate={{ x: ['-100%', '100%'] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                style={{ width: '60%' }}
              />
            </div>
          </div>
        </motion.div>

        {/* Footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="text-xs text-muted-foreground"
        >
          Chain ID: 13370 &nbsp;·&nbsp; netlifegy.com &nbsp;·&nbsp;{' '}
          <button
            onClick={() => navigate('/auth')}
            className="text-primary/60 hover:text-primary transition-colors inline-flex items-center gap-0.5"
          >
            Admin login <ChevronRight className="w-3 h-3" />
          </button>
        </motion.p>
      </motion.div>
    </div>
  );
}
