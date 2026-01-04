import { Layout } from '@/components/layout/Layout';
import { NetworkStats } from '@/components/dashboard/NetworkStats';
import { RecentBlocks } from '@/components/dashboard/RecentBlocks';
import { ValidatorChart } from '@/components/dashboard/ValidatorChart';
import { MiningActivity } from '@/components/dashboard/MiningActivity';
import { ConsensusFlow } from '@/components/dashboard/ConsensusFlow';
import { motion } from 'framer-motion';

const Index = () => {
  return (
    <Layout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-6"
      >
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold">
            <span className="text-gradient-primary">ChainCore</span> Dashboard
          </h1>
          <p className="text-muted-foreground mt-2">
            Real-time overview of the hybrid PoS + PoW blockchain network
          </p>
        </div>

        {/* Network Stats */}
        <NetworkStats />

        {/* Consensus Flow */}
        <ConsensusFlow />

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <RecentBlocks />
          <ValidatorChart />
        </div>

        {/* Mining Activity */}
        <MiningActivity />
      </motion.div>
    </Layout>
  );
};

export default Index;
