import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { 
  Blocks, 
  Users, 
  Pickaxe, 
  FileText, 
  Shield, 
  BarChart3,
  ChevronRight,
  Cpu
} from 'lucide-react';
import { motion } from 'framer-motion';

const navItems = [
  { to: '/', icon: BarChart3, label: 'Dashboard' },
  { to: '/explorer', icon: Blocks, label: 'Block Explorer' },
  { to: '/validators', icon: Users, label: 'Validators' },
  { to: '/mining', icon: Pickaxe, label: 'Mining Simulator' },
  { to: '/protocol', icon: FileText, label: 'Protocol Docs' },
  { to: '/security', icon: Shield, label: 'Security Audit' },
];

export const Sidebar = () => {
  return (
    <aside className="w-64 h-screen fixed left-0 top-0 bg-sidebar border-r border-sidebar-border flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-primary">
            <Cpu className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-bold text-lg text-gradient-primary">ChainCore</h1>
            <p className="text-xs text-muted-foreground">PoS + PoW Hybrid</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item, index) => (
          <motion.div
            key={item.to}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <NavLink
              to={item.to}
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
      </nav>

      {/* Network Status */}
      <div className="p-4 border-t border-sidebar-border">
        <div className="glass-card p-4 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-neon-emerald animate-pulse" />
            <span className="text-xs font-medium text-neon-emerald">Network Active</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Block Height: <span className="font-mono text-foreground">1,234,567</span>
          </p>
          <p className="text-xs text-muted-foreground">
            TPS: <span className="font-mono text-foreground">1,250</span>
          </p>
        </div>
      </div>
    </aside>
  );
};
