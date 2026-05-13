import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { FileCode, Plus, Trash2, Save, Rocket, Copy, BookTemplate } from 'lucide-react';

// Pre-built templates
const DEFAULT_TEMPLATES = [
  {
    name: 'GRC-20 Token',
    category: 'token',
    description: 'Standard fungible token compatible with GYDS chain. Includes mint, burn, and transfer functions.',
    solidity_code: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract GRC20Token {
    string public name;
    string public symbol;
    uint8 public decimals = 18;
    uint256 public totalSupply;
    address public owner;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _name, string memory _symbol, uint256 _initialSupply) {
        name = _name;
        symbol = _symbol;
        owner = msg.sender;
        _mint(msg.sender, _initialSupply * 10 ** decimals);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(allowance[from][msg.sender] >= amount, "Allowance exceeded");
        require(balanceOf[from] >= amount, "Insufficient balance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }

    function _mint(address to, uint256 amount) internal {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function burn(uint256 amount) external {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        totalSupply -= amount;
        emit Transfer(msg.sender, address(0), amount);
    }
}`,
    parameters: [
      { name: '_name', type: 'string', description: 'Token name' },
      { name: '_symbol', type: 'string', description: 'Token symbol' },
      { name: '_initialSupply', type: 'uint256', description: 'Initial token supply (without decimals)' }
    ]
  },
  {
    name: 'GRC-721 NFT',
    category: 'nft',
    description: 'Non-fungible token for unique digital assets on GYDS chain.',
    solidity_code: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract GRC721NFT {
    string public name;
    string public symbol;
    address public owner;
    uint256 private _tokenIdCounter;

    mapping(uint256 => address) public ownerOf;
    mapping(address => uint256) public balanceOf;
    mapping(uint256 => string) public tokenURI;
    mapping(uint256 => address) public getApproved;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);

    constructor(string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
        owner = msg.sender;
    }

    function mint(address to, string memory uri) external returns (uint256) {
        require(msg.sender == owner, "Only owner can mint");
        uint256 tokenId = _tokenIdCounter++;
        ownerOf[tokenId] = to;
        balanceOf[to]++;
        tokenURI[tokenId] = uri;
        emit Transfer(address(0), to, tokenId);
        return tokenId;
    }

    function transferFrom(address from, address to, uint256 tokenId) external {
        require(ownerOf[tokenId] == from, "Not owner");
        require(msg.sender == from || getApproved[tokenId] == msg.sender, "Not authorized");
        ownerOf[tokenId] = to;
        balanceOf[from]--;
        balanceOf[to]++;
        delete getApproved[tokenId];
        emit Transfer(from, to, tokenId);
    }

    function approve(address to, uint256 tokenId) external {
        require(ownerOf[tokenId] == msg.sender, "Not owner");
        getApproved[tokenId] = to;
        emit Approval(msg.sender, to, tokenId);
    }
}`,
    parameters: [
      { name: '_name', type: 'string', description: 'NFT collection name' },
      { name: '_symbol', type: 'string', description: 'NFT symbol' }
    ]
  },
  {
    name: 'Staking Contract',
    category: 'defi',
    description: 'Stake GYDS tokens and earn rewards over time.',
    solidity_code: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract StakingContract {
    address public owner;
    uint256 public rewardRate; // rewards per second per token staked
    uint256 public totalStaked;

    struct Stake {
        uint256 amount;
        uint256 stakedAt;
        uint256 rewardDebt;
    }

    mapping(address => Stake) public stakes;

    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event RewardClaimed(address indexed user, uint256 reward);

    constructor(uint256 _rewardRate) {
        owner = msg.sender;
        rewardRate = _rewardRate;
    }

    function stake() external payable {
        require(msg.value > 0, "Must stake > 0");
        Stake storage s = stakes[msg.sender];
        if (s.amount > 0) {
            s.rewardDebt += pendingReward(msg.sender);
        }
        s.amount += msg.value;
        s.stakedAt = block.timestamp;
        totalStaked += msg.value;
        emit Staked(msg.sender, msg.value);
    }

    function unstake(uint256 amount) external {
        Stake storage s = stakes[msg.sender];
        require(s.amount >= amount, "Insufficient stake");
        uint256 reward = pendingReward(msg.sender) + s.rewardDebt;
        s.amount -= amount;
        s.rewardDebt = 0;
        s.stakedAt = block.timestamp;
        totalStaked -= amount;
        payable(msg.sender).transfer(amount + reward);
        emit Unstaked(msg.sender, amount);
        emit RewardClaimed(msg.sender, reward);
    }

    function pendingReward(address user) public view returns (uint256) {
        Stake memory s = stakes[user];
        if (s.amount == 0) return 0;
        return s.amount * rewardRate * (block.timestamp - s.stakedAt) / 1e18;
    }
}`,
    parameters: [
      { name: '_rewardRate', type: 'uint256', description: 'Reward rate (wei per second per token)' }
    ]
  },
  {
    name: 'Multi-Sig Wallet',
    category: 'utility',
    description: 'Multi-signature wallet requiring multiple approvals for transactions.',
    solidity_code: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MultiSigWallet {
    address[] public owners;
    uint256 public required;
    uint256 public transactionCount;

    struct Transaction {
        address to;
        uint256 value;
        bool executed;
        uint256 confirmations;
    }

    mapping(uint256 => Transaction) public transactions;
    mapping(uint256 => mapping(address => bool)) public confirmations;
    mapping(address => bool) public isOwner;

    event SubmitTransaction(uint256 indexed txId, address indexed to, uint256 value);
    event ConfirmTransaction(uint256 indexed txId, address indexed owner);
    event ExecuteTransaction(uint256 indexed txId);

    constructor(address[] memory _owners, uint256 _required) {
        require(_owners.length >= _required && _required > 0, "Invalid config");
        for (uint i = 0; i < _owners.length; i++) {
            isOwner[_owners[i]] = true;
        }
        owners = _owners;
        required = _required;
    }

    function submitTransaction(address to, uint256 value) external returns (uint256) {
        require(isOwner[msg.sender], "Not owner");
        uint256 txId = transactionCount++;
        transactions[txId] = Transaction(to, value, false, 0);
        emit SubmitTransaction(txId, to, value);
        return txId;
    }

    function confirmTransaction(uint256 txId) external {
        require(isOwner[msg.sender], "Not owner");
        require(!confirmations[txId][msg.sender], "Already confirmed");
        confirmations[txId][msg.sender] = true;
        transactions[txId].confirmations++;
        emit ConfirmTransaction(txId, msg.sender);
        if (transactions[txId].confirmations >= required) {
            executeTransaction(txId);
        }
    }

    function executeTransaction(uint256 txId) internal {
        Transaction storage t = transactions[txId];
        require(!t.executed, "Already executed");
        require(t.confirmations >= required, "Not enough confirmations");
        t.executed = true;
        payable(t.to).transfer(t.value);
        emit ExecuteTransaction(txId);
    }

    receive() external payable {}
}`,
    parameters: [
      { name: '_owners', type: 'address[]', description: 'Array of owner addresses' },
      { name: '_required', type: 'uint256', description: 'Number of confirmations required' }
    ]
  }
];

interface ContractTemplate {
  id: string;
  name: string;
  description: string | null;
  category: string;
  solidity_code: string;
  parameters: any;
  is_active: boolean;
}

interface SmartContract {
  id: string;
  name: string;
  description: string | null;
  source_code: string;
  status: string;
  contract_address: string | null;
  created_at: string;
  user_id: string;
}

export const SmartContractManager = () => {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [contracts, setContracts] = useState<SmartContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('templates');

  // Template creation form
  const [newTemplate, setNewTemplate] = useState({
    name: '', description: '', category: 'token', solidity_code: '', parameters: '[]'
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [templatesRes, contractsRes] = await Promise.all([
      supabase.from('contract_templates').select('*').order('created_at', { ascending: false }),
      supabase.from('smart_contracts').select('*').order('created_at', { ascending: false }),
    ]);
    if (templatesRes.data) setTemplates(templatesRes.data as any);
    if (contractsRes.data) setContracts(contractsRes.data as any);
    setLoading(false);
  };

  const seedTemplates = async () => {
    for (const t of DEFAULT_TEMPLATES) {
      await supabase.from('contract_templates').insert({
        name: t.name,
        description: t.description,
        category: t.category,
        solidity_code: t.solidity_code,
        parameters: t.parameters as any,
        created_by: user?.id,
      });
    }
    toast({ title: 'Default templates added' });
    fetchData();
  };

  const addTemplate = async () => {
    if (!newTemplate.name || !newTemplate.solidity_code) {
      toast({ title: 'Name and code required', variant: 'destructive' });
      return;
    }
    let params;
    try { params = JSON.parse(newTemplate.parameters); } catch { params = []; }

    const { error } = await supabase.from('contract_templates').insert({
      name: newTemplate.name,
      description: newTemplate.description,
      category: newTemplate.category,
      solidity_code: newTemplate.solidity_code,
      parameters: params,
      created_by: user?.id,
    });
    if (error) {
      toast({ title: 'Failed to add template', variant: 'destructive' });
    } else {
      toast({ title: 'Template added' });
      setNewTemplate({ name: '', description: '', category: 'token', solidity_code: '', parameters: '[]' });
      fetchData();
    }
  };

  const toggleTemplate = async (id: string, active: boolean) => {
    await supabase.from('contract_templates').update({ is_active: active }).eq('id', id);
    fetchData();
  };

  const deleteTemplate = async (id: string) => {
    await supabase.from('contract_templates').delete().eq('id', id);
    toast({ title: 'Template deleted' });
    fetchData();
  };

  const categoryColor = (cat: string) => {
    switch (cat) {
      case 'token': return 'text-primary border-primary';
      case 'nft': return 'text-purple-400 border-purple-400';
      case 'defi': return 'text-neon-emerald border-neon-emerald';
      case 'utility': return 'text-yellow-500 border-yellow-500';
      default: return 'text-muted-foreground';
    }
  };

  return (
    <GlassCard className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-lg bg-primary/20">
            <FileCode className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Smart Contract Manager</h3>
            <p className="text-sm text-muted-foreground">Manage templates and user-deployed contracts</p>
          </div>
        </div>
        {templates.length === 0 && (
          <Button onClick={seedTemplates} className="gap-2">
            <BookTemplate className="h-4 w-4" />
            Load Default Templates
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="templates">Templates ({templates.length})</TabsTrigger>
          <TabsTrigger value="deployed">Deployed ({contracts.filter(c => c.status === 'deployed').length})</TabsTrigger>
          <TabsTrigger value="add">Add Template</TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="space-y-3 mt-4">
          {loading ? <p className="text-center text-muted-foreground py-8">Loading...</p> : templates.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No templates yet. Click "Load Default Templates" to get started.</p>
          ) : templates.map((t) => (
            <div key={t.id} className="p-4 rounded-lg bg-secondary/30 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium">{t.name}</h4>
                  <Badge variant="outline" className={categoryColor(t.category)}>{t.category}</Badge>
                  {!t.is_active && <Badge variant="outline" className="text-destructive border-destructive">Disabled</Badge>}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => toggleTemplate(t.id, !t.is_active)}>
                    {t.is_active ? 'Disable' : 'Enable'}
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteTemplate(t.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{t.description}</p>
              <details>
                <summary className="text-xs text-muted-foreground cursor-pointer">View Source Code</summary>
                <pre className="mt-2 p-3 rounded bg-background/80 text-xs overflow-auto max-h-48 font-mono">{t.solidity_code}</pre>
              </details>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="deployed" className="space-y-3 mt-4">
          {contracts.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No deployed contracts yet</p>
          ) : contracts.map((c) => (
            <div key={c.id} className="p-4 rounded-lg bg-secondary/30">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">{c.name}</h4>
                  <p className="text-sm text-muted-foreground">{c.description}</p>
                </div>
                <Badge variant="outline" className={
                  c.status === 'deployed' ? 'text-neon-emerald border-neon-emerald' :
                  c.status === 'draft' ? 'text-yellow-500 border-yellow-500' :
                  'text-muted-foreground'
                }>{c.status}</Badge>
              </div>
              {c.contract_address && (
                <p className="text-xs font-mono text-muted-foreground mt-2">Address: {c.contract_address}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">Created: {new Date(c.created_at).toLocaleDateString()}</p>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="add" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Template Name</Label>
              <Input value={newTemplate.name} onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })} placeholder="My Contract Template" />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={newTemplate.category} onValueChange={(v) => setNewTemplate({ ...newTemplate, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="token">Token</SelectItem>
                  <SelectItem value="nft">NFT</SelectItem>
                  <SelectItem value="defi">DeFi</SelectItem>
                  <SelectItem value="utility">Utility</SelectItem>
                  <SelectItem value="governance">Governance</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <Input value={newTemplate.description} onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })} placeholder="What does this contract do?" />
          </div>
          <div>
            <Label>Solidity Source Code</Label>
            <Textarea value={newTemplate.solidity_code} onChange={(e) => setNewTemplate({ ...newTemplate, solidity_code: e.target.value })} className="font-mono text-sm min-h-[200px]" placeholder="// SPDX-License-Identifier: MIT..." spellCheck={false} />
          </div>
          <div>
            <Label>Constructor Parameters (JSON array)</Label>
            <Textarea value={newTemplate.parameters} onChange={(e) => setNewTemplate({ ...newTemplate, parameters: e.target.value })} className="font-mono text-sm" placeholder='[{"name": "_param", "type": "string", "description": "A parameter"}]' spellCheck={false} />
          </div>
          <Button onClick={addTemplate} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Template
          </Button>
        </TabsContent>
      </Tabs>
    </GlassCard>
  );
};
