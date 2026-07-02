import { useState, useEffect } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { supabase } from '@/integrations/supabase/client';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Loader2, Users } from 'lucide-react';

const COLORS = [
  'hsl(173, 80%, 50%)',
  'hsl(160, 84%, 45%)',
  'hsl(270, 70%, 60%)',
  'hsl(38, 92%, 50%)',
  'hsl(350, 80%, 60%)',
];

interface Validator {
  id: string;
  name: string | null;
  address: string;
  stake: number;
  is_active: boolean;
}

export const ValidatorChart = () => {
  const [validators, setValidators] = useState<Validator[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('network_validators')
        .select('id, name, address, stake, is_active')
        .eq('is_active', true)
        .order('stake', { ascending: false })
        .limit(5);
      if (data) setValidators(data as Validator[]);
      setLoading(false);
    };
    fetch();
  }, []);

  const chartData = validators.map((v, i) => ({
    name: v.name || `Validator ${i + 1}`,
    address: v.address ? v.address.slice(0, 10) + '...' : 'Unknown',
    value: Number(v.stake),
  }));

  const totalStake = chartData.reduce((acc, v) => acc + v.value, 0);

  return (
    <GlassCard>
      <h3 className="text-lg font-semibold mb-4">Top Validators by Stake</h3>
      
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : validators.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p>No validators yet</p>
          <p className="text-xs mt-1">Add validators from the admin dashboard</p>
        </div>
      ) : (
        <div className="flex items-center gap-6">
          <div className="w-48 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={70}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {chartData.map((_, index) => (
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
            {chartData.map((v, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                />
                <span className="flex-1 truncate">
                  {v.name}
                </span>
                <span className="font-medium font-mono">
                  {totalStake > 0 ? ((v.value / totalStake) * 100).toFixed(1) : 0}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </GlassCard>
  );
};