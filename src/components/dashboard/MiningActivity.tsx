import { useMemo, useState, useEffect } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { generateMockMiners, formatHashRate, Miner } from '@/lib/blockchain';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, Area, AreaChart } from 'recharts';
import { Activity } from 'lucide-react';

export const MiningActivity = () => {
  const [hashRateHistory, setHashRateHistory] = useState<{ time: string; hashRate: number }[]>([]);

  useEffect(() => {
    // Generate initial data
    const initial = Array.from({ length: 20 }, (_, i) => ({
      time: `${i}m`,
      hashRate: Math.random() * 1e12 + 1e11,
    }));
    setHashRateHistory(initial);

    // Update every 2 seconds
    const interval = setInterval(() => {
      setHashRateHistory(prev => {
        const newData = [...prev.slice(1), {
          time: `${prev.length}m`,
          hashRate: Math.random() * 1e12 + 1e11,
        }];
        return newData;
      });
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const miners = useMemo(() => generateMockMiners(5), []);
  const totalHashRate = miners.reduce((acc, m) => acc + m.hashRate, 0);

  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">Mining Activity</h3>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">Total Hash Rate</p>
          <p className="font-mono font-bold text-gradient-primary">
            {formatHashRate(totalHashRate)}
          </p>
        </div>
      </div>

      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={hashRateHistory}>
            <defs>
              <linearGradient id="hashRateGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(173, 80%, 50%)" stopOpacity={0.4} />
                <stop offset="100%" stopColor="hsl(173, 80%, 50%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis 
              dataKey="time" 
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(215, 15%, 55%)', fontSize: 10 }}
            />
            <YAxis 
              hide
              domain={['dataMin - 1e11', 'dataMax + 1e11']}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(220, 20%, 9%)',
                border: '1px solid hsl(220, 15%, 18%)',
                borderRadius: '8px',
              }}
              formatter={(value: number) => [formatHashRate(value), 'Hash Rate']}
            />
            <Area
              type="monotone"
              dataKey="hashRate"
              stroke="hsl(173, 80%, 50%)"
              strokeWidth={2}
              fill="url(#hashRateGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-xs text-muted-foreground">Active Miners</p>
          <p className="font-mono font-bold">12,456</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Valid Shares (1h)</p>
          <p className="font-mono font-bold text-neon-emerald">1.2M</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Rejected</p>
          <p className="font-mono font-bold text-neon-rose">0.02%</p>
        </div>
      </div>
    </GlassCard>
  );
};
