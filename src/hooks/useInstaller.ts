import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

const generateWireGuardKeys = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let privateKey = '', publicKey = '';
  for (let i = 0; i < 44; i++) {
    privateKey += chars[Math.floor(Math.random() * 64)];
    publicKey  += chars[Math.floor(Math.random() * 64)];
  }
  return { privateKey: privateKey + '=', publicKey: publicKey + '=' };
};

export const useInstaller = () => {
  const [installing, setInstalling] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const downloadAndInstall = async (type: 'litenode' | 'fullnode', options?: {
    rpcEndpoint?: string;
    storageSize?: number;
    enableMining?: boolean;
  }) => {
    if (!user) {
      toast({ title: 'Login Required', description: 'Please sign in to install a node.', variant: 'destructive' });
      return false;
    }
    setInstalling(true);
    try {
      const wireGuardKeys = type === 'litenode' ? generateWireGuardKeys() : null;
      try {
        await api.post('/api/nodes', {
          user_id: user.id,
          node_type: type,
          wireguard_public_key: wireGuardKeys?.publicKey || null,
          wireguard_private_key: wireGuardKeys?.privateKey || null,
          is_synced: false,
          is_approved: type === 'fullnode',
        });
      } catch (dbErr) {
        console.error('Failed to register node:', dbErr);
      }

      const scriptContent = type === 'litenode'
        ? generateLitenodeScript(options?.rpcEndpoint, wireGuardKeys?.publicKey)
        : generateFullnodeScript(options?.storageSize, options?.enableMining);

      const blob = new Blob([scriptContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = type === 'litenode' ? 'install-litenode.sh' : 'install-fullnode.sh';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: 'Installation Script Downloaded',
        description: `Run the script on your server to install the ${type === 'litenode' ? 'Lite Node' : 'Full Node'}.`,
      });
      return true;
    } catch (error) {
      console.error('Installation error:', error);
      toast({ title: 'Installation Failed', description: 'Failed to prepare installation script.', variant: 'destructive' });
      return false;
    } finally {
      setInstalling(false);
    }
  };

  return { downloadAndInstall, installing };
};

function generateLitenodeScript(rpcEndpoint?: string, publicKey?: string): string {
  const rpc = rpcEndpoint || 'https://rpc.netlifegy.com';
  return `#!/bin/bash
# ChainCore Lite Node Installation Script
set -e
echo "Installing ChainCore Lite Node..."
apt-get update -q && apt-get install -y -q wireguard curl jq
mkdir -p /opt/chaincore
cat > /opt/chaincore/config.json << EOF
{
  "node_type": "litenode",
  "rpc_endpoint": "${rpc}",
  "wireguard_public_key": "${publicKey || ''}",
  "chain_id": 13370
}
EOF
echo "Lite node installed. Please configure WireGuard and start the service."
`;
}

function generateFullnodeScript(storageSize?: number, enableMining?: boolean): string {
  const storage = storageSize || 500;
  const mining = enableMining ?? false;
  return `#!/bin/bash
# ChainCore Full Node Installation Script
set -e
echo "Installing ChainCore Full Node..."
apt-get update -q && apt-get install -y -q curl jq
mkdir -p /opt/chaincore
cat > /opt/chaincore/config.json << EOF
{
  "node_type": "fullnode",
  "storage_gb": ${storage},
  "enable_mining": ${mining},
  "chain_id": 13370,
  "rpc_endpoints": ["https://rpc.netlifegy.com", "https://rpc2.netlifegy.com"]
}
EOF
echo "Full node installed successfully."
`;
}
