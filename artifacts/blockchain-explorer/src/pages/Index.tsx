import { Layout } from '@/components/layout/Layout';
import { LiveNetworkStats } from '@/components/dashboard/LiveNetworkStats';
import { RecentBlocks } from '@/components/dashboard/RecentBlocks';
import { ValidatorChart } from '@/components/dashboard/ValidatorChart';
import { MiningActivity } from '@/components/dashboard/MiningActivity';
import { ConsensusFlow } from '@/components/dashboard/ConsensusFlow';
import { NodeMonitor } from '@/components/dashboard/NodeMonitor';
import { GenesisStatus } from '@/components/dashboard/GenesisStatus';
import { LiveActivityFeed } from '@/components/dashboard/LiveActivityFeed';
import { motion } from 'framer-motion';
import { RequireAuth } from '@/components/auth/RequireAuth';

const IndexContent = () => {
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

        {/* Genesis Status */}
        <GenesisStatus />

        {/* Live Network Stats (WebSocket connected) */}
        <LiveNetworkStats />

        {/* Consensus Flow */}
        <ConsensusFlow />

        {/* Live Activity Feed */}
        <LiveActivityFeed />

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <RecentBlocks />
          <ValidatorChart />
        </div>

        {/* Node Monitor */}
        <NodeMonitor />

        {/* Mining Activity */}
        <MiningActivity />
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
