import { NavLink, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { 
  Blocks, Users, Pickaxe, FileText, Shield, BarChart3,
  ChevronRight, Download, Menu, X, LogIn, LogOut,
  User, Wallet, Settings, BookOpen, ArrowRightLeft, Network,
  Coins, Star, Terminal, Droplets, UserCircle, Vote, Image,
  TrendingUp, MessageSquare, Code2, Trophy, ShieldCheck,
  Fingerprint, Building2, Lock, ChevronDown, HeartHandshake, BellRing
} from 'lucide-react';
import gydsCoinLogo from '/gyds-coin.jpg';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';

interface NavItem { to: string; icon: any; label: string; }

const coreNav: NavItem[] = [
  { to: '/',           icon: BarChart3,      label: 'Dashboard' },
  { to: '/explorer',   icon: Blocks,         label: 'Block Explorer' },
  { to: '/validators', icon: Users,          label: 'Validators' },
  { to: '/mining',     icon: Pickaxe,        label: 'Mining' },
  { to: '/tokens',     icon: Coins,          label: 'Token Factory' },
  { to: '/defi',       icon: ArrowRightLeft, label: 'DeFi' },
  { to: '/wallet',     icon: Wallet,         label: 'Wallet' },
  { to: '/transactions',icon: ArrowRightLeft,label: 'Transactions' },
  { to: '/watchlist',    icon: Star,     label: 'Watchlist' },
  { to: '/price-alerts', icon: BellRing, label: 'Price Alerts' },
  { to: '/network',    icon: Network,        label: 'Network Config' },
  { to: '/node-terminal',icon: Terminal,     label: 'Node Terminal' },
  { to: '/faucet',     icon: Droplets,       label: 'Testnet Faucet' },
];

const ecosystemNav: NavItem[] = [
  { to: '/governance', icon: Vote,          label: 'Governance' },
  { to: '/nft',        icon: Image,         label: 'NFT Marketplace' },
  { to: '/analytics',  icon: TrendingUp,    label: 'Analytics' },
  { to: '/community',  icon: MessageSquare, label: 'Community' },
  { to: '/leaderboard',icon: Trophy,        label: 'Leaderboard' },
  { to: '/multisig',   icon: ShieldCheck,   label: 'Multi-Sig' },
  { to: '/identity',   icon: Fingerprint,   label: 'Identity' },
  { to: '/rwa',        icon: Building2,       label: 'Real-World Assets' },
  { to: '/insurance',  icon: HeartHandshake, label: 'Insurance' },
  { to: '/developer',  icon: Code2,           label: 'Developer Portal' },
];

const infoNav: NavItem[] = [
  { to: '/protocol', icon: FileText,  label: 'Protocol Docs' },
  { to: '/security', icon: Shield,    label: 'Security Audit' },
  { to: '/download', icon: Download,  label: 'Download' },
];

const adminNavItems: NavItem[] = [
  { to: '/admin', icon: Settings,  label: 'Admin Dashboard' },
  { to: '/docs',  icon: BookOpen,  label: 'Edit Documentation' },
];

const NavSection = ({
  label,
  items,
  isMobile,
  onToggle,
  defaultOpen = true,
}: {
  label: string;
  items: NavItem[];
  isMobile: boolean;
  onToggle: () => void;
  defaultOpen?: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
      >
        {label}
        <ChevronDown className={cn('w-3 h-3 transition-transform', open ? 'rotate-180' : '')} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden space-y-0.5"
          >
            {items.map((item, index) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={isMobile ? onToggle : undefined}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all group',
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-primary border border-sidebar-primary/20'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-primary'
                  )
                }
              >
                <item.icon className="w-4 h-4 shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
                <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </NavLink>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  isMobile: boolean;
}

export const Sidebar = ({ isOpen, onToggle, isMobile }: SidebarProps) => {
  const { user, signOut, isFounder, isAdmin } = useAuth();
  const roles = user?.roles ?? [];
  const navigate = useNavigate();

  const handleAuthClick = async () => {
    if (user) { await signOut(); } else { navigate('/auth'); }
    if (isMobile) onToggle();
  };

  const displayRole = roles.includes('founder') ? 'founder' : roles.includes('admin') ? 'admin' : null;

  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {isMobile && isOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
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
            <div className="p-5 border-b border-sidebar-border flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <img src={gydsCoinLogo} alt="GYDS" className="w-10 h-10 rounded-full object-cover ring-2 ring-primary/40 shrink-0" />
                <div>
                  <h1 className="font-bold text-base text-gradient-primary">GYDSchain</h1>
                  <p className="text-xs text-muted-foreground">PoS + PoW Hybrid</p>
                </div>
              </div>
              {isMobile && (
                <button onClick={onToggle} className="p-2 rounded-lg hover:bg-sidebar-accent transition-colors">
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Navigation */}
            <nav className="flex-1 py-3 px-2 space-y-3 overflow-y-auto">
              <NavSection label="Core" items={coreNav} isMobile={isMobile} onToggle={onToggle} defaultOpen={true} />
              <NavSection label="Ecosystem" items={ecosystemNav} isMobile={isMobile} onToggle={onToggle} defaultOpen={false} />
              <NavSection label="Resources" items={infoNav} isMobile={isMobile} onToggle={onToggle} defaultOpen={false} />

              {/* Admin section */}
              {(isFounder || isAdmin) && (
                <div>
                  <p className="px-4 py-1.5 text-xs font-semibold text-amber-400/70 uppercase tracking-wider">Admin</p>
                  <div className="space-y-0.5">
                    {adminNavItems.map(item => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={isMobile ? onToggle : undefined}
                        className={({ isActive }) =>
                          cn(
                            'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all group',
                            isActive
                              ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/20'
                              : 'text-sidebar-foreground hover:bg-yellow-500/10 hover:text-yellow-500'
                          )
                        }
                      >
                        <item.icon className="w-4 h-4 shrink-0" />
                        <span className="flex-1 truncate">{item.label}</span>
                      </NavLink>
                    ))}
                  </div>
                </div>
              )}
            </nav>

            {/* Bottom panel */}
            <div className="p-4 border-t border-sidebar-border shrink-0 space-y-2">
              {/* Network status */}
              <div className="glass-card p-3 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full bg-neon-emerald animate-pulse" />
                  <span className="text-xs font-medium text-neon-emerald">Network Active</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Block: <span className="font-mono text-foreground">1,234,567</span>
                  <span className="mx-2 text-border">·</span>
                  TPS: <span className="font-mono text-foreground">1,250</span>
                </p>
              </div>

              {/* Profile link */}
              {user && (
                <NavLink
                  to="/profile"
                  onClick={isMobile ? onToggle : undefined}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all',
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-primary border border-sidebar-primary/20'
                        : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-primary'
                    )
                  }
                >
                  <UserCircle className="w-4 h-4" />
                  My Profile
                </NavLink>
              )}

              <Button variant={user ? 'outline' : 'default'} className="w-full gap-2" onClick={handleAuthClick}>
                {user ? <><LogOut className="h-4 w-4" /> Sign Out</> : <><LogIn className="h-4 w-4" /> Sign In</>}
              </Button>

              {user && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
                  <User className="h-3 w-3 shrink-0" />
                  <span className="truncate">{user.email}</span>
                  {displayRole && (
                    <span className="px-1.5 py-0.5 rounded bg-primary/20 text-primary text-[10px] uppercase shrink-0">
                      {displayRole}
                    </span>
                  )}
                </div>
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
};

export const MobileMenuButton = ({ onClick }: { onClick: () => void }) => (
  <button
    onClick={onClick}
    className="fixed top-4 left-4 z-30 p-3 rounded-lg bg-sidebar border border-sidebar-border shadow-lg md:hidden"
  >
    <Menu className="w-5 h-5" />
  </button>
);
