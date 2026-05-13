import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

// Generate WireGuard keypair (simplified - in production use proper crypto)
const generateWireGuardKeys = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let privateKey = '';
  let publicKey = '';
  for (let i = 0; i < 44; i++) {
    privateKey += chars[Math.floor(Math.random() * 64)];
    publicKey += chars[Math.floor(Math.random() * 64)];
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
      toast({
        title: 'Login Required',
        description: 'Please sign in to install a node.',
        variant: 'destructive',
      });
      return false;
    }

    setInstalling(true);
    
    try {
      // Generate WireGuard keys for litenode
      const wireGuardKeys = type === 'litenode' ? generateWireGuardKeys() : null;

      // Register the node installation in database
      const { error: dbError } = await supabase.from('node_installations').insert({
        user_id: user.id,
        node_type: type,
        wireguard_public_key: wireGuardKeys?.publicKey || null,
        is_synced: false,
        is_approved: type === 'fullnode', // Fullnodes are pre-approved for founders
      });

      if (dbError) {
        console.error('Failed to register node:', dbError);
      }

      const scriptPath = type === 'litenode' 
        ? '/scripts/install-litenode.sh'
        : '/scripts/install-fullnode.sh';

      // Fetch the script content
      const response = await fetch(scriptPath);
      const scriptContent = await response.text();

      // For litenode, modify script with user options and WireGuard config
      let finalScript = scriptContent;
      if (type === 'litenode' && options) {
        finalScript = scriptContent
          .replace(/DEFAULT_RPC_ENDPOINTS="[^"]*"/, `DEFAULT_RPC_ENDPOINTS="${options.rpcEndpoint || 'http://node1.chaincore.io:8546'}"`)
          .replace(/DEFAULT_STORAGE_SIZE=\d+/, `DEFAULT_STORAGE_SIZE=${options.storageSize || 10}`)
          .replace(/DEFAULT_ENABLE_MINING=\w+/, `DEFAULT_ENABLE_MINING=${options.enableMining ? 'true' : 'false'}`);
        
        // Add WireGuard config to script
        if (wireGuardKeys) {
          finalScript = `# WireGuard Private Key (keep secret!): ${wireGuardKeys.privateKey}\n# WireGuard Public Key: ${wireGuardKeys.publicKey}\n\n${finalScript}`;
        }
      }

      // Create a Blob and download
      const blob = new Blob([finalScript], { type: 'text/x-shellscript' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = type === 'litenode' ? 'install-litenode.sh' : 'install-fullnode.sh';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      if (type === 'litenode') {
        toast({
          title: 'Node Registered - Pending Approval',
          description: 'Your WireGuard key has been submitted. An admin must approve your node before it can sync.',
        });
      } else {
        toast({
          title: 'Installation Script Downloaded',
          description: `Run "chmod +x ${link.download} && ./${link.download}" in your terminal to install.`,
        });
      }

      return true;
    } catch (error) {
      toast({
        title: 'Download Failed',
        description: 'Could not download the installation script. Please try again.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setInstalling(false);
    }
  };

  return { downloadAndInstall, installing };
};
