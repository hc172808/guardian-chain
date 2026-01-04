import { useMemo } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { generateMockValidators } from '@/lib/blockchain';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const COLORS = [
  'hsl(173, 80%, 50%)',
  'hsl(160, 84%, 45%)',
  'hsl(270, 70%, 60%)',
  'hsl(38, 92%, 50%)',
  'hsl(350, 80%, 60%)',
];

export const ValidatorChart = () => {
  const validators = useMemo(() => {
    const all = generateMockValidators(10);
    return all
      .sort((a, b) => b.stake - a.stake)
      .slice(0, 5)
      .map((v, i) => ({
        name: `Validator ${i + 1}`,
        address: v.address.slice(0, 10) + '...',
        value: v.stake,
        blocks: v.totalBlocks,
      }));
  }, []);

  const totalStake = validators.reduce((acc, v) => acc + v.value, 0);

  return (
    <GlassCard>
      <h3 className="text-lg font-semibold mb-4">Top Validators by Stake</h3>
      
      <div className="flex items-center gap-6">
        <div className="w-48 h-48">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={validators}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={70}
                paddingAngle={2}
                dataKey="value"
              >
                {validators.map((_, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={COLORS[index % COLORS.length]}
                    stroke="transparent"
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(220, 20%, 9%)',
                  border: '1px solid hsl(220, 15%, 18%)',
                  borderRadius: '8px',
                }}
                labelStyle={{ color: 'hsl(180, 10%, 92%)' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="flex-1 space-y-2">
          {validators.map((v, i) => (
            <div key={v.address} className="flex items-center gap-3 text-sm">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              />
              <span className="flex-1 font-mono text-muted-foreground truncate">
                {v.address}
              </span>
              <span className="font-medium">
                {((v.value / totalStake) * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </GlassCard>
  );
};
