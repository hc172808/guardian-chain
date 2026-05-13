import { useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  FolderOpen, File, ChevronRight, ChevronDown, Save, Plus,
  Trash2, FileCode, Terminal, FolderPlus
} from 'lucide-react';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileNode[];
  content?: string;
}

// Project file tree structure (static representation of the Go blockchain source)
const PROJECT_TREE: FileNode[] = [
  {
    name: 'blockchain-go', path: 'blockchain-go', type: 'folder', children: [
      {
        name: 'cmd', path: 'blockchain-go/cmd', type: 'folder', children: [
          { name: 'fullnode', path: 'blockchain-go/cmd/fullnode', type: 'folder', children: [
            { name: 'main.go', path: 'blockchain-go/cmd/fullnode/main.go', type: 'file' }
          ]},
          { name: 'litenode', path: 'blockchain-go/cmd/litenode', type: 'folder', children: [
            { name: 'main.go', path: 'blockchain-go/cmd/litenode/main.go', type: 'file' }
          ]},
        ]
      },
      {
        name: 'internal', path: 'blockchain-go/internal', type: 'folder', children: [
          { name: 'blockchain', path: 'blockchain-go/internal/blockchain', type: 'folder', children: [
            { name: 'blockchain.go', path: 'blockchain-go/internal/blockchain/blockchain.go', type: 'file' },
            { name: 'state.go', path: 'blockchain-go/internal/blockchain/state.go', type: 'file' },
            { name: 'txpool.go', path: 'blockchain-go/internal/blockchain/txpool.go', type: 'file' },
          ]},
          { name: 'consensus', path: 'blockchain-go/internal/consensus', type: 'folder', children: [
            { name: 'pos.go', path: 'blockchain-go/internal/consensus/pos.go', type: 'file' },
          ]},
          { name: 'token', path: 'blockchain-go/internal/token', type: 'folder', children: [
            { name: 'authority.go', path: 'blockchain-go/internal/token/authority.go', type: 'file' },
            { name: 'burn_mint.go', path: 'blockchain-go/internal/token/burn_mint.go', type: 'file' },
            { name: 'dual_coin.go', path: 'blockchain-go/internal/token/dual_coin.go', type: 'file' },
            { name: 'factory.go', path: 'blockchain-go/internal/token/factory.go', type: 'file' },
            { name: 'lp_bank.go', path: 'blockchain-go/internal/token/lp_bank.go', type: 'file' },
          ]},
          { name: 'mining', path: 'blockchain-go/internal/mining', type: 'folder', children: [
            { name: 'antibot.go', path: 'blockchain-go/internal/mining/antibot.go', type: 'file' },
            { name: 'difficulty.go', path: 'blockchain-go/internal/mining/difficulty.go', type: 'file' },
            { name: 'distributor.go', path: 'blockchain-go/internal/mining/distributor.go', type: 'file' },
            { name: 'liteminer.go', path: 'blockchain-go/internal/mining/liteminer.go', type: 'file' },
            { name: 'pool.go', path: 'blockchain-go/internal/mining/pool.go', type: 'file' },
          ]},
          { name: 'rpc', path: 'blockchain-go/internal/rpc', type: 'folder', children: [
            { name: 'server.go', path: 'blockchain-go/internal/rpc/server.go', type: 'file' },
            { name: 'eth_handlers.go', path: 'blockchain-go/internal/rpc/eth_handlers.go', type: 'file' },
            { name: 'pool_handlers.go', path: 'blockchain-go/internal/rpc/pool_handlers.go', type: 'file' },
            { name: 'websocket.go', path: 'blockchain-go/internal/rpc/websocket.go', type: 'file' },
          ]},
          { name: 'network', path: 'blockchain-go/internal/network', type: 'folder', children: [
            { name: 'p2p.go', path: 'blockchain-go/internal/network/p2p.go', type: 'file' },
            { name: 'wireguard.go', path: 'blockchain-go/internal/network/wireguard.go', type: 'file' },
          ]},
          { name: 'wallet', path: 'blockchain-go/internal/wallet', type: 'folder', children: [
            { name: 'wallet.go', path: 'blockchain-go/internal/wallet/wallet.go', type: 'file' },
          ]},
        ]
      },
      { name: 'go.mod', path: 'blockchain-go/go.mod', type: 'file' },
    ]
  },
  {
    name: 'contracts', path: 'contracts', type: 'folder', children: [
      { name: 'README.md', path: 'contracts/README.md', type: 'file' },
    ]
  },
  {
    name: 'scripts', path: 'scripts', type: 'folder', children: [
      { name: 'deploy-ecosystem.sh', path: 'scripts/deploy-ecosystem.sh', type: 'file' },
      { name: 'install-fullnode.sh', path: 'scripts/install-fullnode.sh', type: 'file' },
      { name: 'install-litenode.sh', path: 'scripts/install-litenode.sh', type: 'file' },
    ]
  },
  {
    name: 'docker', path: 'docker', type: 'folder', children: [
      { name: 'docker-compose.yml', path: 'docker/docker-compose.yml', type: 'file' },
      { name: 'Dockerfile.node', path: 'docker/Dockerfile.node', type: 'file' },
    ]
  }
];

const FileTreeNode = ({ 
  node, 
  depth = 0, 
  onSelect, 
  selectedPath 
}: { 
  node: FileNode; 
  depth?: number; 
  onSelect: (node: FileNode) => void;
  selectedPath: string | null;
}) => {
  const [expanded, setExpanded] = useState(depth < 1);
  const isSelected = selectedPath === node.path;

  if (node.type === 'folder') {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className={`w-full flex items-center gap-1 px-2 py-1 text-sm hover:bg-secondary/50 rounded transition-colors`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          {expanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
          <FolderOpen className="h-4 w-4 text-yellow-500 shrink-0" />
          <span className="truncate">{node.name}</span>
        </button>
        {expanded && node.children?.map((child) => (
          <FileTreeNode key={child.path} node={child} depth={depth + 1} onSelect={onSelect} selectedPath={selectedPath} />
        ))}
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelect(node)}
      className={`w-full flex items-center gap-1 px-2 py-1 text-sm rounded transition-colors ${
        isSelected ? 'bg-primary/20 text-primary' : 'hover:bg-secondary/50'
      }`}
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
    >
      <FileCode className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="truncate">{node.name}</span>
    </button>
  );
};

export const FileEditor = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newFileName, setNewFileName] = useState('');

  const handleSelectFile = async (node: FileNode) => {
    setSelectedFile(node);
    setLoading(true);

    // Try to load from admin_config (stored file edits)
    const { data } = await supabase
      .from('admin_config')
      .select('config_value')
      .eq('config_key', `file_${node.path.replace(/\//g, '_')}`)
      .single();

    if (data?.config_value) {
      const content = (data.config_value as any).content || '';
      setFileContent(content);
      setOriginalContent(content);
    } else {
      // Load from public/ folder via fetch
      try {
        const res = await fetch(`/blockchain-go/${node.path.replace('blockchain-go/', '')}`);
        if (res.ok) {
          const text = await res.text();
          setFileContent(text);
          setOriginalContent(text);
        } else {
          setFileContent('// File not found or not accessible\n// You can add content here');
          setOriginalContent('');
        }
      } catch {
        setFileContent('// Unable to load file\n// You can add content here');
        setOriginalContent('');
      }
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!selectedFile) return;
    setSaving(true);

    const { error } = await supabase
      .from('admin_config')
      .upsert({
        config_key: `file_${selectedFile.path.replace(/\//g, '_')}`,
        config_value: { content: fileContent, path: selectedFile.path, updated: new Date().toISOString() } as any,
        updated_by: user?.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'config_key' });

    if (error) {
      toast({ title: 'Failed to save file', variant: 'destructive' });
    } else {
      setOriginalContent(fileContent);
      toast({ title: 'File saved', description: selectedFile.path });
    }
    setSaving(false);
  };

  const hasChanges = fileContent !== originalContent;

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-3 rounded-lg bg-primary/20">
          <Terminal className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">File Editor Console</h3>
          <p className="text-sm text-muted-foreground">Browse and edit blockchain source files</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4" style={{ minHeight: '500px' }}>
        {/* File Tree */}
        <div className="md:col-span-1 border border-border rounded-lg overflow-auto bg-background/50 p-2" style={{ maxHeight: '600px' }}>
          <p className="text-xs font-medium text-muted-foreground px-2 py-1 uppercase tracking-wider">Project Files</p>
          {PROJECT_TREE.map((node) => (
            <FileTreeNode key={node.path} node={node} onSelect={handleSelectFile} selectedPath={selectedFile?.path || null} />
          ))}
        </div>

        {/* Editor */}
        <div className="md:col-span-3 flex flex-col gap-2">
          {selectedFile ? (
            <>
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2">
                  <FileCode className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-mono">{selectedFile.path}</span>
                  {hasChanges && <Badge variant="outline" className="text-yellow-500 border-yellow-500 text-xs">Modified</Badge>}
                </div>
                <Button size="sm" onClick={handleSave} disabled={saving || !hasChanges} className="gap-1">
                  <Save className="h-4 w-4" />
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              </div>
              {loading ? (
                <div className="flex-1 flex items-center justify-center text-muted-foreground">Loading...</div>
              ) : (
                <Textarea
                  value={fileContent}
                  onChange={(e) => setFileContent(e.target.value)}
                  className="flex-1 font-mono text-sm resize-none bg-background/80 border-border"
                  style={{ minHeight: '500px' }}
                  spellCheck={false}
                />
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <File className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Select a file to edit</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  );
};
