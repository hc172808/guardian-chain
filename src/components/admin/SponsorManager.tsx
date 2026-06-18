// Admin panel component for managing fee sponsors (banks)
// Banks can register to pay GYDS gas fees on behalf of users
// Users transact in GYD only - they never touch GYDS

import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { 
  Building2, 
  Plus, 
  Trash2, 
  RefreshCw, 
  Wallet, 
  Activity,
  Shield,
  AlertTriangle,
  Coins
} from 'lucide-react';
import { SponsorFunding } from './SponsorFunding';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface FeeSponsor {
  id: string;
  address: string;
  name: string;
  is_active: boolean;
  daily_gas_limit: string;
  daily_gas_used: string;
  max_gas_per_tx: string;
  tx_count: number;
  balance_gyds: string;
  created_at: string;
}

export const SponsorManager = () => {
  const { toast } = useToast();
  const [sponsors, setSponsors] = useState<FeeSponsor[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [fundingSponsor, setFundingSponsor] = useState<FeeSponsor | null>(null);
  const [fundingOpen, setFundingOpen] = useState(false);
  
  // New sponsor form
  const [newSponsor, setNewSponsor] = useState({
    address: '',
    name: '',
    daily_gas_limit: '1000000000000000000', // 1 GYDS in wei
    max_gas_per_tx: '21000',
  });

  useEffect(() => {
    fetchSponsors();
  }, []);

  const fetchSponsors = async () => {
    setLoading(true);
    try {
      const row = await api.get('/api/config/fee_sponsors');
      const configValue = row?.configValue as { sponsors?: FeeSponsor[] };
      setSponsors(configValue?.sponsors || []);
    } catch (e) {
      console.error('Failed to fetch sponsors:', e);
      setSponsors([]);
    }
    setLoading(false);
  };

  const saveSponsors = async (updatedSponsors: FeeSponsor[]) => {
    // Convert to JSON-compatible format
    const sponsorsJson = updatedSponsors.map(s => ({
      id: s.id,
      address: s.address,
      name: s.name,
      is_active: s.is_active,
      daily_gas_limit: s.daily_gas_limit,
      daily_gas_used: s.daily_gas_used,
      max_gas_per_tx: s.max_gas_per_tx,
      tx_count: s.tx_count,
      balance_gyds: s.balance_gyds,
      created_at: s.created_at,
    }));

    try {
      await api.post('/api/config', {
        key: 'fee_sponsors',
        value: { sponsors: sponsorsJson },
      });
    } catch (err) {
      toast({ title: 'Failed to save sponsors', variant: 'destructive' });
      return false;
    }
    return true;
  };

  const handleAddSponsor = async () => {
    if (!newSponsor.address || !newSponsor.name) {
      toast({ title: 'Address and name are required', variant: 'destructive' });
      return;
    }

    // Validate address format
    if (!newSponsor.address.match(/^0x[a-fA-F0-9]{40}$/)) {
      toast({ title: 'Invalid wallet address format', variant: 'destructive' });
      return;
    }

    // Check for duplicates
    if (sponsors.some(s => s.address.toLowerCase() === newSponsor.address.toLowerCase())) {
      toast({ title: 'Sponsor already registered', variant: 'destructive' });
      return;
    }

    const sponsor: FeeSponsor = {
      id: crypto.randomUUID(),
      address: newSponsor.address,
      name: newSponsor.name,
      is_active: true,
      daily_gas_limit: newSponsor.daily_gas_limit,
      daily_gas_used: '0',
      max_gas_per_tx: newSponsor.max_gas_per_tx,
      tx_count: 0,
      balance_gyds: '0',
      created_at: new Date().toISOString(),
    };

    const updatedSponsors = [...sponsors, sponsor];
    
    if (await saveSponsors(updatedSponsors)) {
      setSponsors(updatedSponsors);
      setNewSponsor({ address: '', name: '', daily_gas_limit: '1000000000000000000', max_gas_per_tx: '21000' });
      setDialogOpen(false);
      toast({ title: 'Sponsor registered successfully' });
    }
  };

  const handleToggleActive = async (sponsorId: string) => {
    const updatedSponsors = sponsors.map(s => 
      s.id === sponsorId ? { ...s, is_active: !s.is_active } : s
    );
    
    if (await saveSponsors(updatedSponsors)) {
      setSponsors(updatedSponsors);
      toast({ title: 'Sponsor status updated' });
    }
  };

  const handleRemoveSponsor = async (sponsorId: string) => {
    const updatedSponsors = sponsors.filter(s => s.id !== sponsorId);
    
    if (await saveSponsors(updatedSponsors)) {
      setSponsors(updatedSponsors);
      toast({ title: 'Sponsor removed' });
    }
  };

  const formatGYDS = (wei: string) => {
    const value = BigInt(wei || '0');
    const gyds = Number(value) / 1e18;
    return gyds.toLocaleString(undefined, { maximumFractionDigits: 6 });
  };

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <GlassCard className="p-4 border-primary/30">
        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 text-primary mt-0.5" />
          <div>
            <h3 className="font-semibold">Fee Sponsorship (Banking UX)</h3>
            <p className="text-sm text-muted-foreground">
              Registered banks/sponsors pay GYDS gas fees on behalf of users. 
              Users only interact with GYD - they never see or touch GYDS.
            </p>
          </div>
        </div>
      </GlassCard>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Fee Sponsors (Banks)
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchSponsors}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Register Sponsor
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Register New Fee Sponsor</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Sponsor Name</Label>
                  <Input
                    placeholder="e.g., Central Bank, PaymentCo"
                    value={newSponsor.name}
                    onChange={(e) => setNewSponsor({ ...newSponsor, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Wallet Address (must hold GYDS)</Label>
                  <Input
                    placeholder="0x..."
                    value={newSponsor.address}
                    onChange={(e) => setNewSponsor({ ...newSponsor, address: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Daily Gas Limit (in wei)</Label>
                  <Input
                    type="text"
                    placeholder="1000000000000000000"
                    value={newSponsor.daily_gas_limit}
                    onChange={(e) => setNewSponsor({ ...newSponsor, daily_gas_limit: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    ≈ {formatGYDS(newSponsor.daily_gas_limit)} GYDS per day
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Max Gas Per Transaction</Label>
                  <Input
                    type="text"
                    placeholder="21000"
                    value={newSponsor.max_gas_per_tx}
                    onChange={(e) => setNewSponsor({ ...newSponsor, max_gas_per_tx: e.target.value })}
                  />
                </div>
                <Button onClick={handleAddSponsor} className="w-full">
                  Register Sponsor
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Sponsors Table */}
      {loading ? (
        <GlassCard className="p-8 text-center">
          <RefreshCw className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
          <p className="mt-2 text-muted-foreground">Loading sponsors...</p>
        </GlassCard>
      ) : sponsors.length === 0 ? (
        <GlassCard className="p-12 text-center">
          <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-lg font-medium">No Fee Sponsors Registered</p>
          <p className="text-muted-foreground">
            Register banks or payment providers to sponsor gas fees for users.
          </p>
        </GlassCard>
      ) : (
        <GlassCard className="p-0 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sponsor</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">GYDS Balance</TableHead>
                <TableHead className="text-right">Daily Usage</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sponsors.map((sponsor) => {
                const usagePercent = (
                  (Number(BigInt(sponsor.daily_gas_used || '0')) / 
                   Number(BigInt(sponsor.daily_gas_limit || '1'))) * 100
                ).toFixed(1);

                return (
                  <TableRow key={sponsor.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <Building2 className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{sponsor.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(sponsor.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-background/50 px-2 py-1 rounded">
                        {formatAddress(sponsor.address)}
                      </code>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={sponsor.is_active}
                          onCheckedChange={() => handleToggleActive(sponsor.id)}
                        />
                        <Badge variant={sponsor.is_active ? "default" : "secondary"}>
                          {sponsor.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className="font-medium text-primary">{formatGYDS(sponsor.balance_gyds)}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 gap-1"
                          onClick={() => {
                            setFundingSponsor(sponsor);
                            setFundingOpen(true);
                          }}
                        >
                          <Coins className="h-3 w-3" />
                          Fund
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="space-y-1">
                        <p className="text-sm">
                          {formatGYDS(sponsor.daily_gas_used)} / {formatGYDS(sponsor.daily_gas_limit)}
                        </p>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary transition-all"
                            style={{ width: `${Math.min(Number(usagePercent), 100)}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">{usagePercent}% used</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleRemoveSponsor(sponsor.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </GlassCard>
      )}

      {/* Funding Dialog */}
      {fundingSponsor && (
        <SponsorFunding
          sponsor={fundingSponsor}
          open={fundingOpen}
          onOpenChange={setFundingOpen}
          onUpdate={fetchSponsors}
        />
      )}

      {/* Important Notes */}
      <GlassCard className="p-4 border-yellow-500/30">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
          <div>
            <h3 className="font-semibold text-yellow-500">Important Rules</h3>
            <ul className="text-sm text-muted-foreground space-y-1 mt-2">
              <li>• Sponsors must maintain sufficient GYDS balance to cover gas fees</li>
              <li>• Gas is ALWAYS paid in GYDS - users never touch GYDS</li>
              <li>• GYD is NEVER used for gas - it's the user's stablecoin</li>
              <li>• Rate limits apply to prevent abuse</li>
              <li>• Sponsors can be deactivated but not removed while pending transactions exist</li>
            </ul>
          </div>
        </div>
      </GlassCard>
    </div>
  );
};
