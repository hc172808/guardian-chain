import { useState, useCallback, useEffect, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { Layout } from '@/components/layout/Layout';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TOKENOMICS } from '@/config/wallets';
import { MiningAlgorithm } from '@/lib/blockchain';
import { motion } from 'framer-motion';
import { Pickaxe, Play, Pause, Lock, Cpu, MonitorPlay, Users, Calculator, BookOpen,
         BarChart3, Activity, Server, Zap, Clock, Hash, Trophy, Medal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { WireGuardStatus } from '@/components/wireguard/WireGuardStatus';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { MiningPoolInterface } from '@/components/mining/MiningPoolInterface';
import { MiningPoolsList } from '@/components/mining/MiningPoolsList';
import { ProfitabilityCalculator } from '@/components/mining/ProfitabilityCalculator';
import { MiningProcess } from '@/components/mining/MiningProcess';
import { createMiningClient, MiningEngine } from '@/lib/miningClient';

function fmtDiff(d: number | undefined) {
  if (!d) return '—';
  if (d >= 1e9) return (d / 1e9).toFixed(2) + 'G';
  if (d >= 1e6) return (d / 1e6).toFixed(2) + 'M';
  if (d >= 1e3) return (d / 1e3).toFixed(2) + 'K';
  return String(d);
}

function PoolStatsTab() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['pool-stats'],
    queryFn: () => fetch('/api/mining/pool-stats').then(r => r.json()),
    refetchInterval: 5000,
  });

  const { data: poolInfo } = useQuery({
    queryKey: ['pool-info-rpc'],
    queryFn: () => fetch('/api/mining/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'mining_getPoolInfo', params: {} }),
    }).then(r => r.json()).then(d => d.result),
    refetchInterval: 10000,
  });

  const { data: leaderboard } = useQuery<{
    rank: number; address: string; totalEarned: number; shareCount: number; lastSeen: string;
  }[]>({
    queryKey: ['mining-leaderboard'],
    queryFn: () => fetch('/api/mining/leaderboard').then(r => r.json()),
    refetchInterval: 30000,
    initialData: [],
  });

  const MAX_HISTORY = 60;
  const [chartData, setChartData] = useState<{ t: string; miners: number; diff: number }[]>([]);
  const firstRender = useRef(true);

  useEffect(() => {
    if (!data) return;
    const now = new Date();
    const t = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const miners = data.activeSessions ?? 0;
    const diff = Math.round((data.currentJob?.difficulty ?? 0) / 1000);
    setChartData(prev => {
      if (!firstRender.current && prev.length > 0) {
        const last = prev[prev.length - 1];
        if (last.miners === miners && last.diff === diff) return prev;
      }
      firstRender.current = false;
      return [...prev.slice(-(MAX_HISTORY - 1)), { t, miners, diff }];
    });
  }, [data]);

  if (isLoading) return <div className="text-center text-muted-foreground py-12">Loading pool stats…</div>;
  if (isError)   return <div className="text-center text-destructive py-12">Failed to load pool stats.</div>;

  const stats = [
    { label: 'Active Miners',   value: data?.activeSessions ?? 0,               icon: Users,   color: 'text-primary' },
    { label: 'Block Height',    value: data?.currentJob?.blockHeight ?? '—',     icon: Hash,    color: 'text-blue-400' },
    { label: 'Difficulty',      value: fmtDiff(data?.currentJob?.difficulty),    icon: Zap,     color: 'text-amber-400' },
    { label: 'Pool Fee',        value: `${((data?.fee ?? 0.01) * 100).toFixed(0)}%`, icon: BarChart3, color: 'text-green-400' },
    { label: 'Reward / Share',  value: `${data?.rewardPerShare ?? 0.001} GYDS`, icon: Activity, color: 'text-emerald-400' },
    { label: 'Block Time',      value: `${poolInfo?.blockTime ?? 120}s`,         icon: Clock,   color: 'text-purple-400' },
  ];

  const jobAge = data?.currentJob?.ageMs ? Math.round(data.currentJob.ageMs / 1000) : 0;

  return (
    <div className="space-y-4">
      {/* Live indicator */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </span>
        Live · refreshes every 5 s
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <GlassCard key={label} className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon className={cn('h-4 w-4', color)} />
              <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
            </div>
            <p className={cn('text-2xl font-bold', color)}>{String(value)}</p>
          </GlassCard>
        ))}
      </div>

      {/* Hashrate / Activity Chart */}
      {chartData.length > 1 && (
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">Pool Activity</h3>
            <Badge variant="outline" className="ml-auto text-xs text-muted-foreground border-border/40">
              Last {chartData.length} samples · 5 s/sample
            </Badge>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorMiners" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorDiff" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="t"
                tick={{ fill: '#6b7280', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                yAxisId="miners"
                orientation="left"
                tick={{ fill: '#6b7280', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={28}
                allowDecimals={false}
                label={{ value: 'Miners', angle: -90, position: 'insideLeft', offset: 10, fill: '#6b7280', fontSize: 9 }}
              />
              <YAxis
                yAxisId="diff"
                orientation="right"
                tick={{ fill: '#6b7280', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={36}
                tickFormatter={v => `${v}K`}
                label={{ value: 'Diff (K)', angle: 90, position: 'insideRight', offset: 12, fill: '#6b7280', fontSize: 9 }}
              />
              <Tooltip
                contentStyle={{ background: 'rgba(10,10,20,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
                labelStyle={{ color: '#9ca3af' }}
                formatter={(value: number, name: string) =>
                  name === 'diff' ? [`${value}K`, 'Difficulty (K)'] : [value, 'Active Miners']
                }
              />
              <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
              <Area
                yAxisId="miners"
                type="monotone"
                dataKey="miners"
                name="miners"
                stroke="#6366f1"
                strokeWidth={1.5}
                fill="url(#colorMiners)"
                dot={false}
                activeDot={{ r: 3, fill: '#6366f1' }}
              />
              <Area
                yAxisId="diff"
                type="monotone"
                dataKey="diff"
                name="diff"
                stroke="#f59e0b"
                strokeWidth={1.5}
                fill="url(#colorDiff)"
                dot={false}
                activeDot={{ r: 3, fill: '#f59e0b' }}
              />
            </AreaChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-muted-foreground/60 text-center mt-1">
            Active miners (left axis) and difficulty in thousands (right axis) — rolling 5-minute window
          </p>
        </GlassCard>
      )}

      {/* Current job */}
      {data?.currentJob && (
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Server className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">Current Mining Job</h3>
            <Badge variant="outline" className="ml-auto text-xs">
              {jobAge}s old
            </Badge>
          </div>
          <div className="space-y-1.5 text-xs text-muted-foreground font-mono">
            <div className="flex justify-between gap-4">
              <span>Job ID</span>
              <span className="text-foreground truncate max-w-48">{data.currentJob.jobId}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Block Height</span>
              <span className="text-foreground">{data.currentJob.blockHeight}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Difficulty</span>
              <span className="text-foreground">{data.currentJob.difficulty.toLocaleString()}</span>
            </div>
          </div>
        </GlassCard>
      )}

      {/* Pool details */}
      {poolInfo && (
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">Pool Details</h3>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-xs">
            {[
              ['Pool Name',      poolInfo.name],
              ['Algorithm',      poolInfo.algorithm],
              ['Chain ID',       poolInfo.chainId],
              ['Network',        poolInfo.network],
              ['Min Payout',     `${poolInfo.minPayout} GYDS`],
              ['Total Shares',   (poolInfo.totalShares ?? 0).toLocaleString()],
            ].map(([k, v]) => (
              <div key={String(k)} className="flex justify-between gap-2">
                <span className="text-muted-foreground">{k}</span>
                <span className="font-medium text-foreground">{String(v)}</span>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Setup guide */}
      <GlassCard className="p-4 border-primary/20 bg-primary/5">
        <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
          <Pickaxe className="h-4 w-4 text-primary" /> Mine with the standalone miner
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Run our Node.js miner on any Ubuntu / Linux server and connect it to this pool.
        </p>
        <div className="bg-black/40 rounded-lg p-3 font-mono text-xs text-green-400 space-y-1">
          <div># Download &amp; install</div>
          <div>wget https://app.netlifegy.com/miner/miner.tar.gz</div>
          <div>tar xzf miner.tar.gz &amp;&amp; cd miner</div>
          <div>npm install</div>
          <div className="mt-2"># Edit config.json — set minerAddress to your GYDS wallet</div>
          <div>node miner.js</div>
          <div className="mt-2"># Dashboard at http://YOUR-SERVER-IP:4500</div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          RPC endpoint: <code className="text-primary">https://app.netlifegy.com/api/mining/rpc</code> · Chain ID 13370
        </p>
      </GlassCard>

      {/* Mining Leaderboard */}
      <GlassCard className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="h-4 w-4 text-amber-400" />
          <h3 className="font-semibold text-sm">Mining Leaderboard</h3>
          <Badge variant="outline" className="ml-auto text-xs">Top 25 Miners</Badge>
        </div>

        {leaderboard && leaderboard.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b border-border/40">
                  <th className="text-left py-2 pr-3 font-medium w-10">#</th>
                  <th className="text-left py-2 pr-3 font-medium">Miner Address</th>
                  <th className="text-right py-2 pr-3 font-medium">Total Earned</th>
                  <th className="text-right py-2 font-medium hidden sm:table-cell">Shares</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((miner) => (
                  <tr key={miner.address} className="border-b border-border/20 hover:bg-white/5 transition-colors">
                    <td className="py-2 pr-3">
                      {miner.rank === 1 ? (
                        <Medal className="h-3.5 w-3.5 text-amber-400" />
                      ) : miner.rank === 2 ? (
                        <Medal className="h-3.5 w-3.5 text-gray-400" />
                      ) : miner.rank === 3 ? (
                        <Medal className="h-3.5 w-3.5 text-amber-600" />
                      ) : (
                        <span className="text-muted-foreground">{miner.rank}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 font-mono">
                      <span className="text-foreground">
                        {miner.address.slice(0, 8)}…{miner.address.slice(-6)}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <span className={cn(
                        'font-semibold',
                        miner.rank === 1 ? 'text-amber-400' :
                        miner.rank === 2 ? 'text-gray-300' :
                        miner.rank === 3 ? 'text-amber-600' : 'text-green-400'
                      )}>
                        {miner.totalEarned.toFixed(6)} GYDS
                      </span>
                    </td>
                    <td className="py-2 text-right text-muted-foreground hidden sm:table-cell">
                      {miner.shareCount.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Trophy className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No mining rewards recorded yet.</p>
            <p className="text-xs mt-1">Start mining to appear on the leaderboard!</p>
          </div>
        )}
      </GlassCard>
    </div>
  );
}

const MiningContent = () => {
  const { user } = useAuth();
  const [isVpnConnected, setIsVpnConnected] = useState(false);
  const [hasApprovedNode, setHasApprovedNode] = useState(false);
  const [selectedAlgorithm, setSelectedAlgorithm] = useState<MiningAlgorithm>('randomx');
  const [isMining, setIsMining] = useState(false);
  const [miningClient, setMiningClient] = useState<MiningEngine | null>(null);
  const [activeTab, setActiveTab] = useState('pools');

  // Auto-detect approved nodes or running test nodes — allow mining without real WireGuard
  useEffect(() => {
    const checkNodes = async () => {
      try {
        const [nodes, stats] = await Promise.all([
          fetch('/api/nodes', { credentials: 'include' }).then(r => r.ok ? r.json() : []),
          fetch('/api/network-stats').then(r => r.ok ? r.json() : null),
        ]);
        const approved = (nodes || []).some(
          (n: any) => (n.isApproved ?? n.is_approved) && (n.isOnline ?? n.is_online)
        );
        const liveNodes = Number(stats?.stats?.liveNodes ?? 0);
        const hasNodes = approved || liveNodes > 0;
        setHasApprovedNode(hasNodes);
        if (hasNodes) setIsVpnConnected(true);
      } catch {}
    };
    checkNodes();
    const iv = setInterval(checkNodes, 15000);
    return () => clearInterval(iv);
  }, [user]);

  const handleVpnConnection = useCallback((connected: boolean) => {
    // Only disconnect if no approved node exists either
    if (connected) {
      setIsVpnConnected(true);
    } else if (!hasApprovedNode) {
      setIsVpnConnected(false);
      if (isMining) stopMining();
    }
  }, [isMining, hasApprovedNode]);

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
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="pools" className="flex items-center gap-1.5 text-xs sm:text-sm">
              <Users className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Pools</span>
            </TabsTrigger>
            <TabsTrigger value="mine" className="flex items-center gap-1.5 text-xs sm:text-sm">
              <Pickaxe className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Engine</span>
            </TabsTrigger>
            <TabsTrigger value="pool-stats" className="flex items-center gap-1.5 text-xs sm:text-sm">
              <BarChart3 className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Pool Stats</span>
            </TabsTrigger>
            <TabsTrigger value="calculator" className="flex items-center gap-1.5 text-xs sm:text-sm">
              <Calculator className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Calculator</span>
            </TabsTrigger>
            <TabsTrigger value="learn" className="flex items-center gap-1.5 text-xs sm:text-sm">
              <BookOpen className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">How It Works</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pools" className="mt-6">
            <MiningPoolsList />
          </TabsContent>

          <TabsContent value="mine" className="mt-6">
            <MiningPoolInterface />
          </TabsContent>

          <TabsContent value="pool-stats" className="mt-6">
            <PoolStatsTab />
          </TabsContent>

          <TabsContent value="calculator" className="mt-6">
            <ProfitabilityCalculator />
          </TabsContent>

          <TabsContent value="learn" className="mt-6">
            <MiningProcess />
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
