import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SwapInterface } from '@/components/defi/SwapInterface';
import { PoolsList } from '@/components/defi/PoolsList';
import { Portfolio } from '@/components/defi/Portfolio';
import { StakeInterface } from '@/components/defi/StakeInterface';
import { Launchpad } from '@/components/defi/Launchpad';
import { PositionDetails } from '@/components/defi/PositionDetails';
import { CrossChainBridge } from '@/components/defi/CrossChainBridge';
import { OrderBook } from '@/components/defi/OrderBook';
import { YieldVaults } from '@/components/defi/YieldVaults';
import { DeFiBottomNav } from '@/components/defi/DeFiBottomNav';
import { WalletConnectBar } from '@/components/defi/WalletConnectBar';

const DeFiPage = () => {
  const [activeTab, setActiveTab] = useState('swap');
  const [selectedPosition, setSelectedPosition] = useState<any>(null);

  const handleViewPosition = (position: any) => {
    setSelectedPosition(position);
    setActiveTab('position');
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'pools':     return <PoolsList />;
      case 'portfolio': return <Portfolio onViewPosition={handleViewPosition} />;
      case 'swap':      return <SwapInterface />;
      case 'stake':     return <StakeInterface />;
      case 'launchpad': return <Launchpad />;
      case 'bridge':    return <CrossChainBridge />;
      case 'orderbook': return <OrderBook />;
      case 'vaults':    return <YieldVaults />;
      case 'position':  return <PositionDetails position={selectedPosition} />;
      default:          return <SwapInterface />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="pb-24 pt-4 px-4 max-w-lg mx-auto">
        <WalletConnectBar />
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </main>
      <DeFiBottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
};

export default DeFiPage;
