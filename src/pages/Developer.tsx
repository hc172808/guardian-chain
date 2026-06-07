import { useState } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '@/components/layout/Layout';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  Code2, Key, Plus, Copy, Trash2, Activity,
  BookOpen, Zap, Shield, Globe, ChevronRight
} from 'lucide-react';

interface ApiKey {
  id: string;
  name: string;
  key: string;
  scope: string[];
  requests: number;
  limit: number;
  createdAt: string;
}

const ENDPOINTS = [
  { method: 'GET',  path: '/v1/network/stats',            desc: 'Chain stats: TPS, validators, block height' },
  { method: 'GET',  path: '/v1/tokens',                   desc: 'List all deployed tokens' },
  { method: 'GET',  path: '/v1/blocks/:height',           desc: 'Get block by height' },
  { method: 'GET',  path: '/v1/address/:address/balance', desc: 'Get wallet balance' },
  { method: 'POST', path: '/v1/transactions/submit',      desc: 'Submit a signed transaction' },
  { method: 'GET',  path: '/v1/validators',               desc: 'List all validators with stats' },
  { method: 'GET',  path: '/v1/pools',                    desc: 'List liquidity pools' },
  { method: 'GET',  path: '/v1/tx/:hash',                 desc: 'Get transaction by hash' },
  { method: 'GET',  path: '/v1/oracle/prices',            desc: 'Current oracle price feeds' },
  { method: 'POST', path: '/v1/webhooks/register',        desc: 'Register a webhook endpoint' },
];

const SCOPES = ['read:chain', 'read:wallet', 'write:tx', 'read:oracle', 'webhooks'];

const DeveloperPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [keys, setKeys] = useState<ApiKey[]>([
    {
      id: '1',
      name: 'My App',
      key: 'gyds_live_' + 'x'.repeat(32),
      scope: ['read:chain', 'read:wallet'],
      requests: 1_247,
      limit: 10_000,
      createdAt: '7 days ago',
    },
  ]);
  const [newName, setNewName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['read:chain']);
  const [creating, setCreating] = useState(false);
  const [tryEndpoint, setTryEndpoint] = useState(ENDPOINTS[0]);
  const [tryResult, setTryResult] = useState('');

  const createKey = () => {
    if (!user) { toast({ title: 'Sign in first', variant: 'destructive' }); return; }
    if (!newName.trim()) { toast({ title: 'Name required', variant: 'destructive' }); return; }
    const k: ApiKey = {
      id: Date.now().toString(),
      name: newName,
      key: 'gyds_live_' + Math.random().toString(36).slice(2).padEnd(32, '0'),
      scope: selectedScopes,
      requests: 0,
      limit: 10_000,
      createdAt: 'Just now',
    };
    setKeys(prev => [...prev, k]);
    setNewName('');
    setCreating(false);
    toast({ title: 'API key created', description: 'Copy it now — it won\'t be shown again.' });
  };

  const deleteKey = (id: string) => {
    setKeys(prev => prev.filter(k => k.id !== id));
    toast({ title: 'API key deleted' });
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast({ title: 'Copied to clipboard' });
  };

  const tryApi = async () => {
    setTryResult('Loading…');
    await new Promise(r => setTimeout(r, 600));
    const mock: Record<string, any> = {
      '/v1/network/stats': { tps: 1250, validators: 87, block_height: 1_234_567, chain_id: 13370 },
      '/v1/tokens': [{ symbol: 'GYDS', supply: 20_000_000 }, { symbol: 'GYD', supply: 5_000_000 }],
      '/v1/oracle/prices': { GYDS: 0.0000001, GYD: 1.0, BTC: 65000 },
    };
    const result = mock[tryEndpoint.path] ?? { status: 'ok', message: 'Endpoint available on mainnet' };
    setTryResult(JSON.stringify(result, null, 2));
  };

  return (
    <Layout>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Code2 className="w-6 h-6 text-primary" /> Developer Portal
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            API keys, documentation, and interactive playground for GYDSchain
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'API Keys', value: keys.length, icon: Key },
            { label: 'Total Requests', value: keys.reduce((a, k) => a + k.requests, 0).toLocaleString(), icon: Activity },
            { label: 'Endpoints', value: ENDPOINTS.length, icon: Globe },
          ].map(s => (
            <GlassCard key={s.label} className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <s.icon className="w-4 h-4 text-primary" />
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
              <p className="text-xl font-bold">{s.value}</p>
            </GlassCard>
          ))}
        </div>

        <Tabs defaultValue="keys">
          <TabsList>
            <TabsTrigger value="keys">API Keys</TabsTrigger>
            <TabsTrigger value="docs">Endpoints</TabsTrigger>
            <TabsTrigger value="playground">Playground</TabsTrigger>
            <TabsTrigger value="sdks">SDKs</TabsTrigger>
          </TabsList>

          {/* API Keys */}
          <TabsContent value="keys" className="mt-4 space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setCreating(true)} className="gap-2">
                <Plus className="w-4 h-4" /> New API Key
              </Button>
            </div>

            {creating && (
              <GlassCard className="p-5 space-y-4 border-primary/30">
                <h3 className="font-semibold">Create API Key</h3>
                <div>
                  <Label className="text-xs text-muted-foreground">Key Name</Label>
                  <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="My Application" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-2 block">Scopes</Label>
                  <div className="flex flex-wrap gap-2">
                    {SCOPES.map(s => (
                      <button key={s} onClick={() => setSelectedScopes(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])}
                        className={`px-2.5 py-1 rounded-lg text-xs border transition-all ${selectedScopes.includes(s) ? 'border-primary bg-primary/10 text-primary' : 'border-border/40 text-muted-foreground'}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={createKey}>Create</Button>
                  <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
                </div>
              </GlassCard>
            )}

            <div className="space-y-3">
              {keys.map(k => (
                <GlassCard key={k.id} className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{k.name}</p>
                      <p className="text-xs text-muted-foreground">{k.createdAt}</p>
                    </div>
                    <button onClick={() => deleteKey(k.id)} className="text-muted-foreground hover:text-red-400 transition-colors p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 bg-muted/20 rounded-lg p-2">
                    <code className="text-xs font-mono flex-1 truncate text-muted-foreground">{k.key}</code>
                    <button onClick={() => copyKey(k.key)} className="text-muted-foreground hover:text-primary p-1 transition-colors">
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <div className="flex-1">
                      <div className="flex justify-between text-muted-foreground mb-1">
                        <span>Requests</span>
                        <span>{k.requests.toLocaleString()} / {k.limit.toLocaleString()}</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${(k.requests / k.limit) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {k.scope.map(s => <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>)}
                  </div>
                </GlassCard>
              ))}
            </div>
          </TabsContent>

          {/* Endpoints */}
          <TabsContent value="docs" className="mt-4">
            <GlassCard className="p-5 space-y-2">
              <div className="flex items-center gap-2 mb-3">
                <BookOpen className="w-4 h-4 text-primary" />
                <h2 className="font-semibold">REST API — Base URL: <code className="text-primary text-sm">https://api.netlifegy.com</code></h2>
              </div>
              {ENDPOINTS.map(ep => (
                <div key={ep.path} className="flex items-center gap-3 p-3 bg-muted/20 rounded-lg border border-border/20 hover:border-primary/30 transition-colors">
                  <Badge variant={ep.method === 'GET' ? 'secondary' : 'default'}
                    className={`text-xs w-12 justify-center ${ep.method === 'POST' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : ''}`}>
                    {ep.method}
                  </Badge>
                  <code className="text-sm font-mono text-primary flex-1">{ep.path}</code>
                  <span className="text-xs text-muted-foreground hidden md:block">{ep.desc}</span>
                  <button onClick={() => { setTryEndpoint(ep); }} className="text-xs text-primary hover:underline flex items-center gap-0.5">
                    Try <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </GlassCard>
          </TabsContent>

          {/* Playground */}
          <TabsContent value="playground" className="mt-4 space-y-4">
            <GlassCard className="p-5 space-y-4">
              <h2 className="font-semibold flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" /> Interactive API Playground
              </h2>
              <div>
                <Label className="text-xs text-muted-foreground">Endpoint</Label>
                <div className="flex gap-2 mt-1">
                  <select className="flex-1 bg-muted/30 border border-border/40 rounded-lg px-3 py-2 text-sm"
                    value={tryEndpoint.path} onChange={e => setTryEndpoint(ENDPOINTS.find(x => x.path === e.target.value) ?? ENDPOINTS[0])}>
                    {ENDPOINTS.map(ep => <option key={ep.path} value={ep.path}>{ep.method} {ep.path}</option>)}
                  </select>
                  <Button onClick={tryApi} className="gap-2">
                    <Zap className="w-4 h-4" /> Run
                  </Button>
                </div>
              </div>
              {tryResult && (
                <div>
                  <Label className="text-xs text-muted-foreground">Response</Label>
                  <pre className="mt-1 p-3 bg-muted/20 rounded-lg text-xs font-mono overflow-auto max-h-48 border border-border/30">{tryResult}</pre>
                </div>
              )}
            </GlassCard>
          </TabsContent>

          {/* SDKs */}
          <TabsContent value="sdks" className="mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { lang: 'JavaScript / TypeScript', pkg: '@gydschain/sdk', install: 'npm install @gydschain/sdk', status: 'Coming Soon', icon: '🟨' },
                { lang: 'Python', pkg: 'gydschain-py', install: 'pip install gydschain', status: 'Coming Soon', icon: '🐍' },
                { lang: 'Go', pkg: 'github.com/gydschain/go-sdk', install: 'go get github.com/gydschain/go-sdk', status: 'In Progress', icon: '🔵' },
                { lang: 'Rust', pkg: 'gydschain-rs', install: 'cargo add gydschain', status: 'Planned', icon: '🦀' },
              ].map(sdk => (
                <GlassCard key={sdk.lang} className="p-5 space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{sdk.icon}</span>
                    <div>
                      <p className="font-semibold">{sdk.lang}</p>
                      <code className="text-xs text-muted-foreground">{sdk.pkg}</code>
                    </div>
                    <Badge variant="secondary" className="ml-auto text-xs">{sdk.status}</Badge>
                  </div>
                  <div className="flex items-center gap-2 bg-muted/20 rounded-lg p-2">
                    <code className="text-xs font-mono text-primary flex-1">{sdk.install}</code>
                    <button onClick={() => { navigator.clipboard.writeText(sdk.install); toast({ title: 'Copied!' }); }}
                      className="text-muted-foreground hover:text-primary p-1"><Copy className="w-3 h-3" /></button>
                  </div>
                </GlassCard>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </motion.div>
    </Layout>
  );
};

export default DeveloperPage;
