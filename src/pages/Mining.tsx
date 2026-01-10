import { useState, useCallback } from 'react';
import { Layout } from '@/components/layout/Layout';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { TOKENOMICS } from '@/config/wallets';
import { MiningAlgorithm } from '@/lib/blockchain';
import { motion } from 'framer-motion';
import { Pickaxe, Play, Pause, Lock, Cpu, MonitorPlay, Users, Calculator } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { WireGuardStatus } from '@/components/wireguard/WireGuardStatus';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { MiningPoolInterface } from '@/components/mining/MiningPoolInterface';
import { ProfitabilityCalculator } from '@/components/mining/ProfitabilityCalculator';
import { createMiningClient, MiningEngine } from '@/lib/miningClient';
import { Badge } from '@/components/ui/badge';

const MiningContent = () => {
  const { user } = useAuth();
  const [isVpnConnected, setIsVpnConnected] = useState(false);
  const [selectedAlgorithm, setSelectedAlgorithm] = useState<MiningAlgorithm>('randomx');
  const [isMining, setIsMining] = useState(false);
  const [miningClient, setMiningClient] = useState<MiningEngine | null>(null);
  const [activeTab, setActiveTab] = useState('mine');

  const handleVpnConnection = useCallback((connected: boolean) => {
    setIsVpnConnected(connected);
    if (!connected && isMining) {
      stopMining();
    }
  }, [isMining]);

  const startMining = async () => {
    if (!isVpnConnected || !user) return;
    
    const client = createMiningClient(user.id, selectedAlgorithm);
    const started = await client.start();
    
    if (started) {
      setMiningClient(client);
      setIsMining(true);
    }
  };

  const stopMining = async () => {
    if (miningClient) {
      await miningClient.stop();
      setMiningClient(null);
    }
    setIsMining(false);
  };

  const toggleMining = () => {
    if (isMining) {
      stopMining();
    } else {
      startMining();
    }
  };

  return (
    <Layout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-6"
      >
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-3">
              <Pickaxe className="w-7 h-7 sm:w-8 sm:h-8 text-primary" />
              Mining
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">
              Production mining • Block time: 120s • WireGuard VPN required
            </p>
          </div>
          
          <div className="flex gap-3 items-center">
            <Badge variant={isMining ? 'default' : 'secondary'}>
              {isMining ? 'MINING' : 'IDLE'}
            </Badge>
            <Button
              onClick={toggleMining}
              variant={isMining ? "destructive" : "default"}
              size="lg"
              disabled={!isVpnConnected}
              className={cn(isMining && 'animate-pulse')}
            >
              {!isVpnConnected ? (
                <>
                  <Lock className="w-4 h-4 mr-2" />
                  VPN Required
                </>
              ) : isMining ? (
                <>
                  <Pause className="w-4 h-4 mr-2" />
                  Stop Mining
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Start Mining
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Algorithm Selection */}
        <GlassCard>
          <h3 className="font-semibold mb-4">Select Mining Algorithm</h3>
          <Tabs value={selectedAlgorithm} onValueChange={(v) => !isMining && setSelectedAlgorithm(v as MiningAlgorithm)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="randomx" disabled={isMining} className="flex items-center gap-2">
                <Cpu className="w-4 h-4" />
                RandomX (CPU)
              </TabsTrigger>
              <TabsTrigger value="kheavyhash" disabled={isMining} className="flex items-center gap-2">
                <MonitorPlay className="w-4 h-4" />
                kHeavyHash (GPU)
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </GlassCard>

        {/* WireGuard VPN Status */}
        <WireGuardStatus onConnected={handleVpnConnection} />

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="mine" className="flex items-center gap-2">
              <Pickaxe className="w-4 h-4" />
              Mining Pool
            </TabsTrigger>
            <TabsTrigger value="pool" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Pool Stats
            </TabsTrigger>
            <TabsTrigger value="calculator" className="flex items-center gap-2">
              <Calculator className="w-4 h-4" />
              Calculator
            </TabsTrigger>
          </TabsList>

          <TabsContent value="mine" className="mt-6">
            <MiningPoolInterface />
          </TabsContent>

          <TabsContent value="pool" className="mt-6">
            <MiningPoolInterface />
          </TabsContent>

          <TabsContent value="calculator" className="mt-6">
            <ProfitabilityCalculator />
          </TabsContent>
        </Tabs>
      </motion.div>
    </Layout>
  );
};

const Mining = () => (
  <RequireAuth>
    <MiningContent />
  </RequireAuth>
);

export default Mining;
