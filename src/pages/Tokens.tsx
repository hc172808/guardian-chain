import { Layout } from '@/components/layout/Layout';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { TokenFactory } from '@/components/token/TokenFactory';
import { TokenFeaturePanel } from '@/components/token/TokenFeaturePanel';
import { GlassCard } from '@/components/ui/GlassCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { Coins, Plus, Eye, Search, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useState } from 'react';

// Mock data for existing tokens
const mockTokens = [
  {
    name: 'NetlifeGY Rewards',
    symbol: 'NLGR',
    address: '0x1234567890abcdef1234567890abcdef12345678',
    totalSupply: '1000000000',
    burnedSupply: '50000000',
    gydsLiquidity: '500000',
    lpLockType: 'burned' as const,
    authorities: {
      freeze: { enabled: false, holder: null, locked: true },
      update: { enabled: true, holder: '0xabcd...1234', locked: false },
      mint: { enabled: false, holder: null, locked: true },
    },
    backingCoin: 'GYDS',
  },
  {
    name: 'Community Token',
    symbol: 'COMM',
    address: '0xabcdef1234567890abcdef1234567890abcdef12',
    totalSupply: '500000000',
    burnedSupply: '10000000',
    gydsLiquidity: '250000',
    lpLockType: 'timelocked' as const,
    lpUnlockTime: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
    authorities: {
      freeze: { enabled: true, holder: '0x9876...5432', locked: false },
      update: { enabled: true, holder: '0x9876...5432', locked: false },
      mint: { enabled: true, holder: '0x9876...5432', locked: false },
    },
    backingCoin: 'GYDS',
  },
];

const TokensContent = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedToken, setSelectedToken] = useState<typeof mockTokens[0] | null>(null);

  const filteredTokens = mockTokens.filter(
    token =>
      token.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      token.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      token.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Layout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-6"
      >
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">
              <span className="text-gradient-primary">Token</span> Factory
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">
              Create and manage tokens with protocol-enforced rules
            </p>
          </div>
          <Badge variant="outline" className="gap-2 w-fit">
            <Coins className="h-4 w-4" />
            {mockTokens.length} Tokens Created
          </Badge>
        </div>

        {/* Important Notice */}
        <GlassCard className="p-4 border-warning/30 bg-warning/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium text-warning">Protocol-Enforced Rules</p>
              <p className="text-sm text-muted-foreground">
                All tokens require mandatory GYDS liquidity and follow immutable supply rules. 
                LP is permanently locked (burned or time-locked). Authorities can be purchased with GYDS 
                and can be permanently locked after creation.
              </p>
            </div>
          </div>
        </GlassCard>

        <Tabs defaultValue="browse" className="space-y-6">
          <TabsList className="bg-secondary/50">
            <TabsTrigger value="browse" className="gap-2">
              <Eye className="h-4 w-4" />
              Browse Tokens
            </TabsTrigger>
            <TabsTrigger value="create" className="gap-2">
              <Plus className="h-4 w-4" />
              Create Token
            </TabsTrigger>
          </TabsList>

          <TabsContent value="browse" className="space-y-6">
            {/* Search */}
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, symbol, or address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Token List */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredTokens.map((token) => (
                <motion.div
                  key={token.address}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileHover={{ scale: 1.01 }}
                  className="cursor-pointer"
                  onClick={() => setSelectedToken(token)}
                >
                  <GlassCard className="p-4 hover:border-primary/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/20">
                          <Coins className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold">{token.name}</h3>
                          <p className="text-sm text-muted-foreground">{token.symbol}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">
                          {(parseFloat(token.gydsLiquidity)).toLocaleString()} GYDS
                        </p>
                        <p className="text-xs text-muted-foreground">Liquidity</p>
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2 flex-wrap">
                      {token.authorities.freeze.locked && (
                        <Badge variant="outline" className="text-xs text-neon-emerald border-neon-emerald">
                          Freeze Locked
                        </Badge>
                      )}
                      {token.authorities.mint.locked && (
                        <Badge variant="outline" className="text-xs text-neon-emerald border-neon-emerald">
                          Mint Locked
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs">
                        LP: {token.lpLockType === 'burned' ? 'Burned' : 'Time-Locked'}
                      </Badge>
                    </div>
                  </GlassCard>
                </motion.div>
              ))}
            </div>

            {/* Selected Token Details */}
            {selectedToken && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <h3 className="text-lg font-semibold mb-4">Token Details</h3>
                <TokenFeaturePanel token={selectedToken} />
              </motion.div>
            )}
          </TabsContent>

          <TabsContent value="create">
            <TokenFactory />
          </TabsContent>
        </Tabs>
      </motion.div>
    </Layout>
  );
};

const TokensPage = () => (
  <RequireAuth>
    <TokensContent />
  </RequireAuth>
);

export default TokensPage;
