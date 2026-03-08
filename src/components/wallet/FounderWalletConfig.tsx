import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { GlassCard } from '@/components/ui/GlassCard';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { hashPin, encryptWithPin } from '@/lib/walletCrypto';
import { 
  Crown, 
  Key, 
  Copy, 
  Eye, 
  EyeOff, 
  Save,
  AlertTriangle,
  Shield,
  Wallet
} from 'lucide-react';
import { RESERVED_WALLETS } from '@/config/wallets';

interface FounderWalletConfigProps {
  onWalletConfigured?: (address: string) => void;
}

export const FounderWalletConfig = ({ onWalletConfigured }: FounderWalletConfigProps) => {
  const { user, isFounder } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Form state
  const [walletAddress, setWalletAddress] = useState(RESERVED_WALLETS.founder.address);
  const [privateKey, setPrivateKey] = useState('');
  const [seedPhrase, setSeedPhrase] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  // Simple encryption for demo (use proper crypto in production)
  const encryptData = (data: string, pin: string) => {
    return btoa(data.split('').map((c, i) => 
      String.fromCharCode(c.charCodeAt(0) ^ pin.charCodeAt(i % pin.length))
    ).join(''));
  };

  const hashPin = (pin: string) => {
    let hash = 0;
    for (let i = 0; i < pin.length; i++) {
      hash = ((hash << 5) - hash) + pin.charCodeAt(i);
      hash = hash & hash;
    }
    return hash.toString(16);
  };

  const handleSaveFounderWallet = async () => {
    if (!isFounder) {
      toast({ title: 'Access denied', description: 'Founder access required', variant: 'destructive' });
      return;
    }

    if (!walletAddress || !pin || pin.length < 4) {
      toast({ title: 'Invalid input', description: 'Address and PIN (min 4 digits) are required', variant: 'destructive' });
      return;
    }

    if (pin !== confirmPin) {
      toast({ title: 'PIN mismatch', description: 'PINs do not match', variant: 'destructive' });
      return;
    }

    setLoading(true);

    try {
      // Encrypt seed phrase if provided
      const encryptedSeed = seedPhrase ? encryptData(seedPhrase, pin) : encryptData('founder-genesis-wallet', pin);
      
      // Save to database
      const { error } = await supabase.from('wallets').upsert({
        user_id: user!.id,
        address: walletAddress.toLowerCase(),
        encrypted_seed: encryptedSeed,
        pin_hash: hashPin(pin),
      }, {
        onConflict: 'user_id,address'
      });

      if (error) throw error;

      // Store founder wallet config in admin_config
      await supabase.from('admin_config').upsert({
        config_key: 'founder_wallet',
        config_value: { 
          address: walletAddress.toLowerCase(),
          configured_at: new Date().toISOString(),
          configured_by: user?.id
        },
        updated_by: user?.id
      }, {
        onConflict: 'config_key'
      });

      toast({ title: 'Founder wallet configured!', description: 'Genesis wallet is now set up' });
      onWalletConfigured?.(walletAddress);
      setOpen(false);
      
      // Reset sensitive fields
      setPrivateKey('');
      setSeedPhrase('');
      setPin('');
      setConfirmPin('');
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied!` });
  };

  if (!isFounder) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 border-warning/50 text-warning hover:bg-warning/10">
          <Crown className="h-4 w-4" />
          Configure Founder Wallet
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-warning">
            <Crown className="h-5 w-5" />
            Founder Wallet Configuration
          </DialogTitle>
          <DialogDescription>
            Configure the genesis block recipient wallet. This wallet receives the initial token allocation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Security Warning */}
          <div className="p-3 rounded-lg bg-warning/10 border border-warning/30">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-warning mt-0.5" />
              <div>
                <p className="text-sm font-medium text-warning">Security Notice</p>
                <p className="text-xs text-muted-foreground mt-1">
                  This wallet will control the genesis block allocation. Keep your private key and seed phrase secure. 
                  Never share them with anyone.
                </p>
              </div>
            </div>
          </div>

          {/* Reserved Wallet Info */}
          <GlassCard className="p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Reserved Founder Address</span>
              </div>
              <Badge variant="outline" className="text-warning border-warning">Genesis</Badge>
            </div>
            <div className="flex items-center gap-2">
              <code className="text-xs bg-background/50 px-2 py-1 rounded flex-1 truncate">
                {RESERVED_WALLETS.founder.address}
              </code>
              <Button 
                size="icon" 
                variant="ghost" 
                className="h-6 w-6"
                onClick={() => copyToClipboard(RESERVED_WALLETS.founder.address, 'Address')}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Allocation: {RESERVED_WALLETS.founder.allocation.toLocaleString()} GYDS ({(RESERVED_WALLETS.founder.allocation / 100_000_000_000 * 100).toFixed(0)}%)
            </p>
          </GlassCard>

          {/* Wallet Address */}
          <div>
            <Label htmlFor="walletAddress">Wallet Address</Label>
            <div className="flex gap-2 mt-1">
              <Input
                id="walletAddress"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                placeholder="0x..."
                className="font-mono text-sm"
              />
              <Button 
                size="icon" 
                variant="outline"
                onClick={() => setWalletAddress(RESERVED_WALLETS.founder.address)}
                title="Use reserved address"
              >
                <Wallet className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Use the reserved address or enter your own
            </p>
          </div>

          {/* Private Key (Optional) */}
          <div>
            <Label htmlFor="privateKey" className="flex items-center gap-2">
              <Key className="h-3 w-3" />
              Private Key (Optional)
            </Label>
            <div className="flex gap-2 mt-1">
              <Input
                id="privateKey"
                type={showPrivateKey ? 'text' : 'password'}
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                placeholder="Enter private key (optional)"
                className="font-mono text-sm"
              />
              <Button 
                size="icon" 
                variant="outline"
                onClick={() => setShowPrivateKey(!showPrivateKey)}
              >
                {showPrivateKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Seed Phrase (Optional) */}
          <div>
            <Label htmlFor="seedPhrase">Seed Phrase (Optional)</Label>
            <Textarea
              id="seedPhrase"
              value={seedPhrase}
              onChange={(e) => setSeedPhrase(e.target.value)}
              placeholder="Enter your 12 or 24 word seed phrase (optional)"
              className="font-mono text-sm h-20"
            />
          </div>

          {/* PIN */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="pin">Create PIN (min 4 digits)</Label>
              <Input
                id="pin"
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Enter PIN"
                maxLength={6}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="confirmPin">Confirm PIN</Label>
              <Input
                id="confirmPin"
                type="password"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                placeholder="Confirm PIN"
                maxLength={6}
                className="mt-1"
              />
            </div>
          </div>

          {/* Save Button */}
          <Button 
            onClick={handleSaveFounderWallet} 
            className="w-full gap-2"
            disabled={loading}
          >
            <Save className="h-4 w-4" />
            {loading ? 'Saving...' : 'Save Founder Wallet'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
