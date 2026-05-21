import { NavLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { 
  Blocks, 
  Users, 
  Pickaxe, 
  FileText, 
  Shield, 
  BarChart3,
  ChevronRight,
  Cpu,
  Download,
  Menu,
  X,
  LogIn,
  LogOut,
  Wallet,
  Settings,
  BookOpen,
  ArrowRightLeft,
  Network,
  Coins,
  Star,
  Terminal,
  Droplets,
  FileCode,
  Copy,
  Check,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { AuthoritiesStatusWidget } from '@/components/admin/AuthoritiesStatusWidget';
import { useBlockStats } from '@/hooks/useBlockStats';

const navItems = [
  { to: '/', icon: BarChart3, label: 'Dashboard' },
  { to: '/explorer', icon: Blocks, label: 'Block Explorer' },
  { to: '/validators', icon: Users, label: 'Validators' },
  { to: '/mining', icon: Pickaxe, label: 'Mining' },
  { to: '/tokens', icon: Coins, label: 'Token Factory' },
  { to: '/defi', icon: ArrowRightLeft, label: 'DeFi' },
  { to: '/wallet', icon: Wallet, label: 'Wallet' },
  { to: '/transactions', icon: ArrowRightLeft, label: 'Transactions' },
  { to: '/watchlist', icon: Star, label: 'Watchlist' },
  { to: '/network', icon: Network, label: 'Network Config' },
  { to: '/node-terminal', icon: Terminal, label: 'Node Terminal' },
  { to: '/faucet', icon: Droplets, label: 'Testnet Faucet' },
  { to: '/smart-contracts', icon: FileCode, label: 'Smart Contracts' },
  { to: '/protocol', icon: FileText, label: 'Protocol Docs' },
  { to: '/security', icon: Shield, label: 'Security Audit' },
  { to: '/download', icon: Download, label: 'Download' },
];

const adminNavItems = [
  { to: '/admin', icon: Settings, label: 'Admin Dashboard' },
  { to: '/docs', icon: BookOpen, label: 'Edit Documentation' },
];

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  isMobile: boolean;
}

const ROLE_COLORS: Record<string, string> = {
  founder: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  admin:   'bg-primary/20 text-primary border-primary/30',
  user:    'bg-muted/40 text-muted-foreground border-border',
};

const WalletSessionCard = ({ onSignOut }: { onSignOut: () => void }) => {
  const { walletUser, roles } = useAuth();
  const [copied, setCopied] = useState(false);

  if (!walletUser) return null;

  const addr = walletUser.wallet_address;
  const short = `${addr.slice(0, 6)}…${addr.slice(-4)}`;
  const role = roles.includes('founder') ? 'founder' : roles.includes('admin') ? 'admin' : 'user';

  const copyAddress = () => {
    navigator.clipboard.writeText(addr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-sidebar-border bg-sidebar-accent/40 p-3 space-y-2"
    >
      {/* Address row */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/60 to-cyan-400/60 flex items-center justify-center shrink-0">
          <Wallet className="w-4 h-4 text-black" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground leading-none mb-0.5">Connected</p>
          <p className="text-sm font-mono font-semibold text-foreground truncate">
            {walletUser.ens_name ?? short}
          </p>
        </div>
        <button
          onClick={copyAddress}
          title="Copy address"
          className="p-1.5 rounded-md hover:bg-sidebar-accent transition-colors text-muted-foreground hover:text-foreground shrink-0"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Full address (monospace, smaller) */}
      <p className="text-[10px] font-mono text-muted-foreground/70 break-all leading-tight px-0.5">
        {addr}
      </p>

      {/* Role + sign-out row */}
      <div className="flex items-center justify-between pt-0.5">
        <span className={cn(
          'text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded border',
          ROLE_COLORS[role]
        )}>
          {role}
        </span>
        <button
          onClick={onSignOut}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
        >
          <LogOut className="w-3 h-3" />
          Sign out
        </button>
      </div>
    </motion.div>
  );
};

export const Sidebar = ({ isOpen, onToggle, isMobile }: SidebarProps) => {
  const { user, signOut, isFounder, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { blockHeight, online } = useBlockStats();

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
    if (isMobile) onToggle();
  };

  const handleSignIn = () => {
    navigate('/auth');
    if (isMobile) onToggle();
  };

  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {isMobile && isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            onClick={onToggle}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <AnimatePresence>
        {(isOpen || !isMobile) && (
          <motion.aside
            initial={isMobile ? { x: -280 } : false}
            animate={{ x: 0 }}
            exit={isMobile ? { x: -280 } : undefined}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={cn(
              "w-64 h-screen bg-sidebar border-r border-sidebar-border flex flex-col z-50",
              isMobile ? "fixed left-0 top-0" : "fixed left-0 top-0"
            )}
          >
            {/* Logo */}
            <div className="p-6 border-b border-sidebar-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gradient-primary">
                  <Cpu className="w-6 h-6 text-primary-foreground" />
                </div>
                <div>
                  <h1 className="font-bold text-lg text-gradient-primary">ChainCore</h1>
                  <p className="text-xs text-muted-foreground">PoS + PoW Hybrid</p>
                </div>
              </div>
              {isMobile && (
                <button
                  onClick={onToggle}
                  className="p-2 rounded-lg hover:bg-sidebar-accent transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
              {navItems.map((item, index) => (
                <motion.div
                  key={item.to}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <NavLink
                    to={item.to}
                    onClick={isMobile ? onToggle : undefined}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all group',
                        isActive
                          ? 'bg-sidebar-accent text-sidebar-primary border border-sidebar-primary/20'
                          : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-primary'
                      )
                    }
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="flex-1">{item.label}</span>
                    <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </NavLink>
                </motion.div>
              ))}

              {/* Admin section */}
              {(isFounder || isAdmin) && (
                <>
                  <div className="pt-4 pb-2">
                    <p className="text-xs font-medium text-muted-foreground px-4 uppercase">Admin</p>
                  </div>
                  {adminNavItems.map((item, index) => (
                    <motion.div
                      key={item.to}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: (navItems.length + index) * 0.05 }}
                    >
                      <NavLink
                        to={item.to}
                        onClick={isMobile ? onToggle : undefined}
                        className={({ isActive }) =>
                          cn(
                            'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all group',
                            isActive
                              ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/20'
                              : 'text-sidebar-foreground hover:bg-yellow-500/10 hover:text-yellow-500'
                          )
                        }
                      >
                        <item.icon className="w-5 h-5" />
                        <span className="flex-1">{item.label}</span>
                        <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </NavLink>
                    </motion.div>
                  ))}
                </>
              )}
            </nav>

            {/* Network Status */}
            <div className="p-4 border-t border-sidebar-border">
              {(isFounder || isAdmin) && (
                <div className="mb-3">
                  <AuthoritiesStatusWidget />
                </div>
              )}
              <div className="glass-card p-4 rounded-lg mb-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className={cn(
                    "w-2 h-2 rounded-full",
                    online ? "bg-neon-emerald animate-pulse" : "bg-yellow-500"
                  )} />
                  <span className={cn(
                    "text-xs font-medium",
                    online ? "text-neon-emerald" : "text-yellow-500"
                  )}>
                    {online ? "Network Active" : "Node Offline"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Block Height:{" "}
                  <span className="font-mono text-foreground">
                    {blockHeight != null
                      ? blockHeight.toLocaleString()
                      : <span className="text-muted-foreground/50">—</span>}
                  </span>
                </p>
              </div>

              {user ? (
                <WalletSessionCard onSignOut={handleSignOut} />
              ) : (
                <Button
                  variant="default"
                  className="w-full gap-2"
                  onClick={handleSignIn}
                >
                  <LogIn className="h-4 w-4" />
                  Connect Wallet
                </Button>
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
};

// Mobile menu button component
export const MobileMenuButton = ({ onClick }: { onClick: () => void }) => (
  <button
    onClick={onClick}
    className="fixed top-4 left-4 z-30 p-3 rounded-lg bg-sidebar border border-sidebar-border shadow-lg md:hidden"
  >
    <Menu className="w-5 h-5" />
  </button>
);