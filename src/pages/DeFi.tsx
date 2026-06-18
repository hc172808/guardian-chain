import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
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
import { ImpermanentLossCalc } from '@/components/defi/ImpermanentLossCalc';
import { Perpetuals } from '@/components/defi/Perpetuals';
import { PredictionMarkets } from '@/components/defi/PredictionMarkets';
import { LPFarmingDashboard } from '@/components/defi/LPFarmingDashboard';
import { StablecoinFactory } from '@/components/defi/StablecoinFactory';
import { DeFiBottomNav } from '@/components/defi/DeFiBottomNav';
import { WalletConnectBar } from '@/components/defi/WalletConnectBar';
import { useComponentVisibility } from '@/hooks/useComponentVisibility';
import { useAuth } from '@/contexts/AuthContext';

const TAB_MAP: Record<string, { featureKey: string; component: React.ReactNode }> = {
  swap:       { featureKey: 'defi.swap',       component: <SwapInterface /> },
  pools:      { featureKey: 'defi.pools',      component: <PoolsList /> },
  stake:      { featureKey: 'defi.stake',      component: <StakeInterface /> },
  farm:       { featureKey: 'defi.farm',       component: <LPFarmingDashboard /> },
  orderbook:  { featureKey: 'defi.orderbook',  component: <OrderBook /> },
  vaults:     { featureKey: 'defi.vaults',     component: <YieldVaults /> },
  bridge:     { featureKey: 'defi.crosschain', component: <CrossChainBridge /> },
  stablecoin: { featureKey: 'defi.stable',     component: <StablecoinFactory /> },
  perps:      { featureKey: 'defi.perps',      component: <Perpetuals /> },
  predict:    { featureKey: 'defi.predict',    component: <PredictionMarkets /> },
  launchpad:  { featureKey: 'defi.launchpad',  component: <Launchpad /> },
  portfolio:  { featureKey: 'defi.portfolio',  component: null },
  ilcalc:     { featureKey: 'defi.ilcalc',     component: <ImpermanentLossCalc /> },
  position:   { featureKey: '', component: null }, // handled separately
};

const DeFiPage = () => {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('swap');
  const [selectedPosition, setSelectedPosition] = useState<any>(null);
  const { isHidden, isAdmin } = useComponentVisibility();
  const { isFounder } = useAuth();
  const isAdminLike = isAdmin || isFounder;

  const visibleTabs = Object.keys(TAB_MAP).filter(
    t => t === 'position' || isAdminLike || !isHidden(TAB_MAP[t].featureKey)
  );

  useEffect(() => {
    const tab = (location.state as any)?.tab;
    if (tab && visibleTabs.includes(tab)) {
      setActiveTab(tab);
    } else if (tab && !visibleTabs.includes(tab)) {
      // requested tab is hidden, fall back to first visible
      setActiveTab(visibleTabs[0] ?? 'swap');
    }
  }, [location.state, visibleTabs.join(',')]);

  // If current tab became hidden, switch to first visible
  useEffect(() => {
    if (activeTab !== 'position' && !visibleTabs.includes(activeTab)) {
      setActiveTab(visibleTabs[0] ?? 'swap');
    }
  }, [visibleTabs.join(','), activeTab]);

  const handleViewPosition = (position: any) => {
    setSelectedPosition(position);
    setActiveTab('position');
  };

  const renderContent = () => {
    if (activeTab === 'position') return <PositionDetails position={selectedPosition} />;
    const entry = TAB_MAP[activeTab];
    if (!entry) return <SwapInterface />;
    if (activeTab === 'portfolio') return <Portfolio onViewPosition={handleViewPosition} />;
    return entry.component;
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
