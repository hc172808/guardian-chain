// Token Feature Panel - Display token details including authorities and LP status
import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/badge';
import { 
  Coins, 
  Lock, 
  Unlock,
  Flame,
  Shield,
  Edit,
  Plus,
  User,
  Clock,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface TokenAuthorities {
  freeze: { enabled: boolean; holder: string | null; locked: boolean };
  update: { enabled: boolean; holder: string | null; locked: boolean };
  mint: { enabled: boolean; holder: string | null; locked: boolean };
}

interface TokenData {
  name: string;
  symbol: string;
  address: string;
  totalSupply: string;
  burnedSupply: string;
  gydsLiquidity: string;
  lpLockType: 'burned' | 'timelocked';
  lpUnlockTime?: number;
  authorities: TokenAuthorities;
  backingCoin: string;
}

interface TokenFeaturePanelProps {
  token: TokenData;
}

export const TokenFeaturePanel = ({ token }: TokenFeaturePanelProps) => {
  const formatSupply = (value: string) => {
    const num = parseFloat(value);
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
    return num.toLocaleString();
  };

  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const burnedPercent = (parseFloat(token.burnedSupply) / parseFloat(token.totalSupply)) * 100;

  const AuthorityStatus = ({ 
    label, 
    icon: Icon, 
    authority 
  }: { 
    label: string; 
    icon: React.ElementType; 
    authority: { enabled: boolean; holder: string | null; locked: boolean } 
  }) => (
    <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {authority.locked ? (
          <Badge variant="outline" className="text-neon-emerald border-neon-emerald gap-1">
            <Lock className="h-3 w-3" />
            LOCKED
          </Badge>
        ) : authority.enabled ? (
          <Badge variant="outline" className="text-yellow-500 border-yellow-500 gap-1">
            <Unlock className="h-3 w-3" />
            ON
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground gap-1">
            <XCircle className="h-3 w-3" />
            OFF
          </Badge>
        )}
      </div>
    </div>
  );

  return (
    <GlassCard className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-lg bg-primary/20">
            <Coins className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">{token.name}</h2>
            <div className="flex items-center gap-2">
              <code className="text-sm text-muted-foreground">{token.symbol}</code>
              <Badge variant="secondary">{formatAddress(token.address)}</Badge>
            </div>
          </div>
        </div>
        <Badge className="gap-1 bg-primary/20 text-primary border-primary/30">
          <Shield className="h-3 w-3" />
          {token.backingCoin} Backed
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Supply Info */}
        <div className="space-y-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Coins className="h-4 w-4" />
            Supply Information
          </h3>
          
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-secondary/30">
              <div className="flex justify-between mb-1">
                <span className="text-sm text-muted-foreground">Total Supply</span>
                <span className="font-medium">{formatSupply(token.totalSupply)}</span>
              </div>
            </div>
            
            <div className="p-3 rounded-lg bg-secondary/30">
              <div className="flex justify-between mb-2">
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Flame className="h-3 w-3 text-orange-500" />
                  Burned (Locked)
                </span>
                <span className="font-medium">{formatSupply(token.burnedSupply)}</span>
              </div>
              <Progress value={burnedPercent} className="h-1.5" />
              <p className="text-xs text-muted-foreground mt-1">{burnedPercent.toFixed(2)}% of supply</p>
            </div>
          </div>
        </div>

        {/* LP Info */}
        <div className="space-y-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Lock className="h-4 w-4" />
            Liquidity Pool
          </h3>
          
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-secondary/30">
              <div className="flex justify-between mb-1">
                <span className="text-sm text-muted-foreground">GYDS Locked</span>
                <span className="font-medium text-primary">{formatSupply(token.gydsLiquidity)} GYDS</span>
              </div>
            </div>
            
            <div className="p-3 rounded-lg bg-secondary/30">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">LP Lock Status</span>
                {token.lpLockType === 'burned' ? (
                  <Badge className="gap-1 bg-neon-emerald/20 text-neon-emerald border-neon-emerald/30">
                    <Flame className="h-3 w-3" />
                    BURNED (Permanent)
                  </Badge>
                ) : (
                  <Badge className="gap-1 bg-blue-500/20 text-blue-400 border-blue-500/30">
                    <Clock className="h-3 w-3" />
                    Time-Locked
                  </Badge>
                )}
              </div>
              {token.lpLockType === 'timelocked' && token.lpUnlockTime && (
                <p className="text-xs text-muted-foreground mt-2">
                  Unlocks: {new Date(token.lpUnlockTime).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Authorities */}
      <div className="mt-6 space-y-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Authority Status
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <AuthorityStatus 
            label="Freeze" 
            icon={Lock} 
            authority={token.authorities.freeze} 
          />
          <AuthorityStatus 
            label="Update" 
            icon={Edit} 
            authority={token.authorities.update} 
          />
          <AuthorityStatus 
            label="Mint" 
            icon={Plus} 
            authority={token.authorities.mint} 
          />
        </div>

        {/* Authority Holders */}
        {(token.authorities.freeze.holder || token.authorities.update.holder || token.authorities.mint.holder) && (
          <div className="p-3 rounded-lg bg-secondary/20 border border-border">
            <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
              <User className="h-3 w-3" />
              Authority Holders
            </p>
            <div className="space-y-1 text-sm">
              {token.authorities.freeze.holder && !token.authorities.freeze.locked && (
                <p>Freeze: <code className="text-xs bg-background/50 px-1 rounded">{formatAddress(token.authorities.freeze.holder)}</code></p>
              )}
              {token.authorities.update.holder && !token.authorities.update.locked && (
                <p>Update: <code className="text-xs bg-background/50 px-1 rounded">{formatAddress(token.authorities.update.holder)}</code></p>
              )}
              {token.authorities.mint.holder && !token.authorities.mint.locked && (
                <p>Mint: <code className="text-xs bg-background/50 px-1 rounded">{formatAddress(token.authorities.mint.holder)}</code></p>
              )}
            </div>
          </div>
        )}
      </div>
    </GlassCard>
  );
};
