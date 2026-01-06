import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

export const useInstaller = () => {
  const [installing, setInstalling] = useState(false);
  const { toast } = useToast();

  const downloadAndInstall = async (type: 'litenode' | 'fullnode', options?: {
    rpcEndpoint?: string;
    storageSize?: number;
    enableMining?: boolean;
  }) => {
    setInstalling(true);
    
    try {
      const scriptPath = type === 'litenode' 
        ? '/scripts/install-litenode.sh'
        : '/scripts/install-fullnode.sh';

      // Fetch the script content
      const response = await fetch(scriptPath);
      const scriptContent = await response.text();

      // For litenode, modify script with user options
      let finalScript = scriptContent;
      if (type === 'litenode' && options) {
        finalScript = scriptContent
          .replace(/DEFAULT_RPC_ENDPOINTS="[^"]*"/, `DEFAULT_RPC_ENDPOINTS="${options.rpcEndpoint || 'http://node1.chaincore.io:8546'}"`)
          .replace(/DEFAULT_STORAGE_SIZE=\d+/, `DEFAULT_STORAGE_SIZE=${options.storageSize || 10}`)
          .replace(/DEFAULT_ENABLE_MINING=\w+/, `DEFAULT_ENABLE_MINING=${options.enableMining ? 'true' : 'false'}`);
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

      toast({
        title: 'Installation Script Downloaded',
        description: `Run "chmod +x ${link.download} && ./${link.download}" in your terminal to install.`,
      });

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
