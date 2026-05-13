import { useState, useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { RequireAuth } from '@/components/auth/RequireAuth';
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
import { motion } from 'framer-motion';
import { FileCode, Plus, Rocket, BookOpen, Code, Copy, Trash2 } from 'lucide-react';

interface ContractTemplate {
  id: string;
  name: string;
  description: string | null;
  category: string;
  solidity_code: string;
  parameters: any[];
  is_active: boolean;
}

interface SmartContract {
  id: string;
  name: string;
  description: string | null;
  source_code: string;
  status: string;
  contract_address: string | null;
  constructor_args: any;
  template_id: string | null;
  created_at: string;
}

const SmartContractsContent = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [contracts, setContracts] = useState<SmartContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<ContractTemplate | null>(null);
  const [contractName, setContractName] = useState('');
  const [contractDesc, setContractDesc] = useState('');
  const [contractCode, setContractCode] = useState('');
  const [constructorArgs, setConstructorArgs] = useState<Record<string, string>>({});
  const [deploying, setDeploying] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [templatesRes, contractsRes] = await Promise.all([
      supabase.from('contract_templates').select('*').eq('is_active', true).order('name'),
      supabase.from('smart_contracts').select('*').eq('user_id', user?.id || '').order('created_at', { ascending: false }),
    ]);
    if (templatesRes.data) setTemplates(templatesRes.data as any);
    if (contractsRes.data) setContracts(contractsRes.data as any);
    setLoading(false);
  };

  const selectTemplate = (template: ContractTemplate) => {
    setSelectedTemplate(template);
    setContractName(`My ${template.name}`);
    setContractCode(template.solidity_code);
    setConstructorArgs({});
    const params = Array.isArray(template.parameters) ? template.parameters : [];
    const args: Record<string, string> = {};
    params.forEach((p: any) => { args[p.name] = ''; });
    setConstructorArgs(args);
  };

  const saveContract = async (status: 'draft' | 'pending') => {
    if (!contractName || !contractCode) {
      toast({ title: 'Name and code required', variant: 'destructive' });
      return;
    }
    setDeploying(true);

    const { error } = await supabase.from('smart_contracts').insert({
      user_id: user?.id!,
      template_id: selectedTemplate?.id || null,
      name: contractName,
      description: contractDesc,
      source_code: contractCode,
      constructor_args: constructorArgs as any,
      status,
    });

    if (error) {
      toast({ title: 'Failed to save contract', variant: 'destructive' });
    } else {
      toast({ title: status === 'draft' ? 'Contract saved as draft' : 'Contract submitted for deployment' });
      setContractName('');
      setContractDesc('');
      setContractCode('');
      setSelectedTemplate(null);
      setConstructorArgs({});
      fetchData();
    }
    setDeploying(false);
  };

  const deleteContract = async (id: string) => {
    await supabase.from('smart_contracts').delete().eq('id', id);
    toast({ title: 'Contract deleted' });
    fetchData();
  };

  const copyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr);
    toast({ title: 'Address copied' });
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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <FileCode className="w-8 h-8 text-primary" />
          Smart Contracts
        </h1>
        <p className="text-muted-foreground mt-2">Create and deploy smart contracts on Guardian Chain</p>
      </div>

      <Tabs defaultValue="templates">
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="templates" className="gap-1">
            <BookOpen className="h-4 w-4" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="create" className="gap-1">
            <Code className="h-4 w-4" />
            Create
          </TabsTrigger>
          <TabsTrigger value="contracts" className="gap-1">
            <Rocket className="h-4 w-4" />
            My Contracts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="mt-6">
          {loading ? <p className="text-center text-muted-foreground py-12">Loading templates...</p> : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {templates.map((t) => (
                <GlassCard key={t.id} className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{t.name}</h3>
                      <Badge variant="outline" className={categoryColor(t.category)}>{t.category}</Badge>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">{t.description}</p>
                  {Array.isArray(t.parameters) && t.parameters.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs text-muted-foreground mb-1">Constructor Parameters:</p>
                      <div className="flex flex-wrap gap-1">
                        {t.parameters.map((p: any) => (
                          <Badge key={p.name} variant="secondary" className="text-xs">{p.name}: {p.type}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  <Button onClick={() => selectTemplate(t)} className="w-full gap-2">
                    <Plus className="h-4 w-4" />
                    Use Template
                  </Button>
                </GlassCard>
              ))}
              {templates.length === 0 && (
                <div className="col-span-full text-center py-12 text-muted-foreground">
                  No templates available. Admin needs to add templates first.
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="create" className="mt-6">
          <GlassCard className="p-6 space-y-4">
            {selectedTemplate && (
              <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-between">
                <span className="text-sm">Using template: <strong>{selectedTemplate.name}</strong></span>
                <Button size="sm" variant="ghost" onClick={() => { setSelectedTemplate(null); setContractCode(''); }}>Clear</Button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Contract Name</Label>
                <Input value={contractName} onChange={(e) => setContractName(e.target.value)} placeholder="My Token Contract" />
              </div>
              <div>
                <Label>Description</Label>
                <Input value={contractDesc} onChange={(e) => setContractDesc(e.target.value)} placeholder="What does it do?" />
              </div>
            </div>

            {Object.keys(constructorArgs).length > 0 && (
              <div className="space-y-3">
                <Label className="text-sm font-medium">Constructor Arguments</Label>
                {Object.entries(constructorArgs).map(([key, val]) => {
                  const param = selectedTemplate?.parameters?.find((p: any) => p.name === key);
                  return (
                    <div key={key}>
                      <Label className="text-xs text-muted-foreground">{key} ({(param as any)?.type || 'string'})</Label>
                      <Input
                        value={val}
                        onChange={(e) => setConstructorArgs({ ...constructorArgs, [key]: e.target.value })}
                        placeholder={(param as any)?.description || key}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            <div>
              <Label>Solidity Source Code</Label>
              <Textarea
                value={contractCode}
                onChange={(e) => setContractCode(e.target.value)}
                className="font-mono text-sm min-h-[300px]"
                placeholder="// SPDX-License-Identifier: MIT&#10;pragma solidity ^0.8.20;&#10;&#10;contract MyContract { }"
                spellCheck={false}
              />
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => saveContract('draft')} disabled={deploying} className="gap-2">
                Save Draft
              </Button>
              <Button onClick={() => saveContract('pending')} disabled={deploying} className="gap-2">
                <Rocket className="h-4 w-4" />
                {deploying ? 'Submitting...' : 'Submit for Deployment'}
              </Button>
            </div>
          </GlassCard>
        </TabsContent>

        <TabsContent value="contracts" className="mt-6 space-y-4">
          {contracts.length === 0 ? (
            <GlassCard className="p-12 text-center">
              <FileCode className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No contracts yet. Start from a template or write your own!</p>
            </GlassCard>
          ) : contracts.map((c) => (
            <GlassCard key={c.id} className="p-5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold">{c.name}</h4>
                  <Badge variant="outline" className={
                    c.status === 'deployed' ? 'text-neon-emerald border-neon-emerald' :
                    c.status === 'pending' ? 'text-yellow-500 border-yellow-500' :
                    'text-muted-foreground'
                  }>{c.status}</Badge>
                </div>
                <div className="flex gap-2">
                  {c.contract_address && (
                    <Button size="sm" variant="ghost" onClick={() => copyAddress(c.contract_address!)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  )}
                  {c.status === 'draft' && (
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteContract(c.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
              {c.description && <p className="text-sm text-muted-foreground">{c.description}</p>}
              {c.contract_address && (
                <p className="text-xs font-mono text-muted-foreground mt-2">📍 {c.contract_address}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">Created: {new Date(c.created_at).toLocaleDateString()}</p>
              <details className="mt-2">
                <summary className="text-xs text-muted-foreground cursor-pointer">View Source</summary>
                <pre className="mt-2 p-3 rounded bg-secondary/30 text-xs overflow-auto max-h-48 font-mono">{c.source_code}</pre>
              </details>
            </GlassCard>
          ))}
        </TabsContent>
      </Tabs>
    </motion.div>
  );
};

const SmartContracts = () => (
  <Layout>
    <RequireAuth>
      <SmartContractsContent />
    </RequireAuth>
  </Layout>
);

export default SmartContracts;
