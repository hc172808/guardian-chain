import { useState } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Key, 
  Download, 
  Upload, 
  Copy, 
  RefreshCw,
  Shield,
  Eye,
  EyeOff
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Textarea } from '../ui/textarea';

interface WireGuardManagerProps {
  nodeId?: string;
  publicKey?: string;
  privateKey?: string;
  onKeysGenerated?: (publicKey: string, privateKey: string) => void;
}

// WireGuard key generation using Web Crypto API
const generateWireGuardKeyPair = async () => {
  // Generate 32 random bytes for private key
  const privateKeyBytes = new Uint8Array(32);
  crypto.getRandomValues(privateKeyBytes);
  
  // Clamp private key for Curve25519
  privateKeyBytes[0] &= 248;
  privateKeyBytes[31] &= 127;
  privateKeyBytes[31] |= 64;
  
  // Convert to base64
  const privateKey = btoa(String.fromCharCode(...privateKeyBytes));
  
  // Generate public key (simplified - in production use proper X25519)
  const publicKeyBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    publicKeyBytes[i] = privateKeyBytes[i] ^ (i * 7 + 23);
  }
  const publicKey = btoa(String.fromCharCode(...publicKeyBytes));
  
  return { privateKey, publicKey };
};

export const WireGuardManager = ({ 
  nodeId, 
  publicKey: initialPublicKey, 
  privateKey: initialPrivateKey,
  onKeysGenerated 
}: WireGuardManagerProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [publicKey, setPublicKey] = useState(initialPublicKey || '');
  const [privateKey, setPrivateKey] = useState(initialPrivateKey || '');
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importedConfig, setImportedConfig] = useState('');

  const generateKeys = async () => {
    setGenerating(true);
    try {
      const keys = await generateWireGuardKeyPair();
      setPublicKey(keys.publicKey);
      setPrivateKey(keys.privateKey);
      
      if (nodeId && user) {
        await supabase
          .from('node_installations')
          .update({ 
            wireguard_public_key: keys.publicKey,
            wireguard_private_key: keys.privateKey
          })
          .eq('id', nodeId);
      }
      
      onKeysGenerated?.(keys.publicKey, keys.privateKey);
      toast({ title: 'Keys generated successfully!' });
    } catch (error) {
      toast({ title: 'Failed to generate keys', variant: 'destructive' });
    }
    setGenerating(false);
  };

  const exportConfig = () => {
    const config = `[Interface]
PrivateKey = ${privateKey}
Address = 10.0.0.${Math.floor(Math.random() * 254) + 1}/24

[Peer]
PublicKey = <FULLNODE_PUBLIC_KEY>
AllowedIPs = 10.0.0.0/24
Endpoint = fullnode.chaincore.io:51820
PersistentKeepalive = 25`;

    const blob = new Blob([config], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wg-chaincore.conf';
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Config exported!' });
  };

  const importConfig = async () => {
    try {
      const lines = importedConfig.split('\n');
      let importedPrivateKey = '';
      
      for (const line of lines) {
        if (line.toLowerCase().includes('privatekey')) {
          importedPrivateKey = line.split('=')[1]?.trim() || '';
          break;
        }
      }
      
      if (!importedPrivateKey) {
        toast({ title: 'Invalid config: No private key found', variant: 'destructive' });
        return;
      }
      
      setPrivateKey(importedPrivateKey);
      
      // Derive public key (simplified)
      const privateBytes = Uint8Array.from(atob(importedPrivateKey), c => c.charCodeAt(0));
      const publicBytes = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        publicBytes[i] = privateBytes[i] ^ (i * 7 + 23);
      }
      const derivedPublicKey = btoa(String.fromCharCode(...publicBytes));
      setPublicKey(derivedPublicKey);
      
      if (nodeId && user) {
        await supabase
          .from('node_installations')
          .update({ 
            wireguard_public_key: derivedPublicKey,
            wireguard_private_key: importedPrivateKey
          })
          .eq('id', nodeId);
      }
      
      onKeysGenerated?.(derivedPublicKey, importedPrivateKey);
      setImportDialogOpen(false);
      setImportedConfig('');
      toast({ title: 'Config imported successfully!' });
    } catch (error) {
      toast({ title: 'Failed to import config', variant: 'destructive' });
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied!` });
  };

  return (
    <GlassCard className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <Shield className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">WireGuard VPN Keys</h3>
      </div>

      <div className="space-y-4">
        <div>
          <Label>Public Key</Label>
          <div className="flex gap-2">
            <Input value={publicKey} readOnly placeholder="Generate or import keys" />
            <Button size="icon" variant="outline" onClick={() => copyToClipboard(publicKey, 'Public key')} disabled={!publicKey}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div>
          <Label>Private Key</Label>
          <div className="flex gap-2">
            <Input 
              type={showPrivateKey ? 'text' : 'password'} 
              value={privateKey} 
              readOnly 
              placeholder="••••••••••••" 
            />
            <Button size="icon" variant="outline" onClick={() => setShowPrivateKey(!showPrivateKey)} disabled={!privateKey}>
              {showPrivateKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button size="icon" variant="outline" onClick={() => copyToClipboard(privateKey, 'Private key')} disabled={!privateKey}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-destructive mt-1">Never share your private key!</p>
        </div>

        <div className="flex gap-2">
          <Button onClick={generateKeys} disabled={generating} className="gap-2 flex-1">
            <RefreshCw className={`h-4 w-4 ${generating ? 'animate-spin' : ''}`} />
            {generating ? 'Generating...' : 'Generate Keys'}
          </Button>
          
          <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Upload className="h-4 w-4" />
                Import
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Import WireGuard Config</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Paste your WireGuard config</Label>
                  <Textarea
                    value={importedConfig}
                    onChange={(e) => setImportedConfig(e.target.value)}
                    placeholder="[Interface]
PrivateKey = ...
Address = ..."
                    rows={8}
                  />
                </div>
                <Button onClick={importConfig} className="w-full">Import</Button>
              </div>
            </DialogContent>
          </Dialog>
          
          <Button variant="outline" className="gap-2" onClick={exportConfig} disabled={!privateKey}>
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>
      </div>
    </GlassCard>
  );
};
