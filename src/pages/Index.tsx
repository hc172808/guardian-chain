import { Layout } from '@/components/layout/Layout';
import { LiveNetworkStats } from '@/components/dashboard/LiveNetworkStats';
import { RecentBlocks } from '@/components/dashboard/RecentBlocks';
import { ValidatorChart } from '@/components/dashboard/ValidatorChart';
import { MiningActivity } from '@/components/dashboard/MiningActivity';
import { ConsensusFlow } from '@/components/dashboard/ConsensusFlow';
import { NodeMonitor } from '@/components/dashboard/NodeMonitor';
import { GenesisStatus } from '@/components/dashboard/GenesisStatus';
import { UserBalanceCard } from '@/components/dashboard/UserBalanceCard';
import { motion } from 'framer-motion';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { useComponentVisibility } from '@/hooks/useComponentVisibility';

const IndexContent = () => {
  const { isGloballyHidden, isAdmin } = useComponentVisibility();

  const show = (key: string) => !isGloballyHidden(key);

  return (
    <Layout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-6"
      >
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold">
            <span className="text-gradient-primary">ChainCore</span> Dashboard
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Real-time overview • Block time: 120s
          </p>
        </div>

        {/* Balance Card — always visible unless admin hides it */}
        {show('dashboard.balance') && <UserBalanceCard />}

        {/* Genesis Status */}
        {show('dashboard.genesis') && <GenesisStatus />}

        {/* Live Network Stats (WebSocket connected) */}
        {show('dashboard.network_stats') && <LiveNetworkStats />}

        {/* Consensus Flow */}
        {show('dashboard.consensus') && <ConsensusFlow />}

        {/* Main Grid */}
        {(show('dashboard.blocks') || show('dashboard.validators')) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {show('dashboard.blocks') && <RecentBlocks />}
            {show('dashboard.validators') && <ValidatorChart />}
          </div>
        )}

        {/* Node Monitor */}
        {show('dashboard.node_monitor') && <NodeMonitor />}

        {/* Mining Activity */}
        {show('dashboard.mining') && <MiningActivity />}
      </motion.div>
    </Layout>
  );
};

const Index = () => (
  <RequireAuth>
    <IndexContent />
  </RequireAuth>
);

export default Index;
