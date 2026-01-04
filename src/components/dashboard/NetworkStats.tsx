import { StatCard } from '../ui/StatCard';
import { 
  Blocks, 
  Users, 
  Pickaxe, 
  ArrowRightLeft, 
  TrendingUp,
  Shield 
} from 'lucide-react';

export const NetworkStats = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      <StatCard
        title="Block Height"
        value="1,234,567"
        icon={Blocks}
        change={0.12}
      />
      <StatCard
        title="Active Validators"
        value="256"
        icon={Users}
        change={2.5}
      />
      <StatCard
        title="Active Miners"
        value="12,456"
        icon={Pickaxe}
        change={5.8}
      />
      <StatCard
        title="Total TXs (24h)"
        value="2.4M"
        icon={ArrowRightLeft}
        change={12.3}
      />
      <StatCard
        title="Network Hash Rate"
        value="145.2"
        icon={TrendingUp}
        suffix="TH/s"
        change={-2.1}
      />
      <StatCard
        title="PoS Finality"
        value="99.99"
        icon={Shield}
        suffix="%"
        change={0.01}
      />
    </div>
  );
};
