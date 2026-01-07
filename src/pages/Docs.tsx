import { useState, useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { 
  FileText, 
  Edit2, 
  Save, 
  X, 
  Blocks, 
  Shield, 
  Pickaxe, 
  Server 
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';


interface Documentation {
  id: string;
  slug: string;
  title: string;
  content: string;
  updated_at: string;
}

const docTabs = [
  { slug: 'blockchain-core', label: 'Blockchain Core', icon: Blocks },
  { slug: 'pos-consensus', label: 'PoS Consensus', icon: Shield },
  { slug: 'mining-system', label: 'Mining System', icon: Pickaxe },
  { slug: 'rpc-server', label: 'RPC Server', icon: Server },
];

const DocsPage = () => {
  const { isFounder, isAdmin, user } = useAuth();
  const { toast } = useToast();
  const [docs, setDocs] = useState<Documentation[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchDocs();
  }, []);

  const fetchDocs = async () => {
    const { data, error } = await supabase
      .from('documentation')
      .select('*')
      .order('slug');
    
    if (!error && data) {
      setDocs(data);
    }
    setLoading(false);
  };

  const handleEdit = (doc: Documentation) => {
    setEditingSlug(doc.slug);
    setEditContent(doc.content);
  };

  const handleSave = async () => {
    if (!editingSlug) return;
    setSaving(true);

    const { error } = await supabase
      .from('documentation')
      .update({ 
        content: editContent,
        updated_by: user?.id 
      })
      .eq('slug', editingSlug);

    if (error) {
      toast({ title: 'Failed to save', variant: 'destructive' });
    } else {
      toast({ title: 'Documentation updated!' });
      setEditingSlug(null);
      fetchDocs();
    }
    setSaving(false);
  };

  const handleCancel = () => {
    setEditingSlug(null);
    setEditContent('');
  };

  const getDocBySlug = (slug: string) => docs.find(d => d.slug === slug);

  return (
    <Layout>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <FileText className="w-8 h-8 text-primary" />
            Technical Documentation
          </h1>
          <p className="text-muted-foreground mt-2">
            ChainCore blockchain implementation guides
            {(isFounder || isAdmin) && ' • Click edit to modify content'}
          </p>
        </div>

        <Tabs defaultValue="blockchain-core" className="space-y-4">
          <TabsList className="flex-wrap">
            {docTabs.map((tab) => (
              <TabsTrigger key={tab.slug} value={tab.slug} className="gap-2">
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {docTabs.map((tab) => {
            const doc = getDocBySlug(tab.slug);
            const isEditing = editingSlug === tab.slug;

            return (
              <TabsContent key={tab.slug} value={tab.slug}>
                <GlassCard className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                      <tab.icon className="h-5 w-5 text-primary" />
                      {doc?.title || tab.label}
                    </h2>
                    {(isFounder || isAdmin) && (
                      isEditing ? (
                        <div className="flex gap-2">
                          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1">
                            <Save className="h-4 w-4" />
                            {saving ? 'Saving...' : 'Save'}
                          </Button>
                          <Button size="sm" variant="outline" onClick={handleCancel}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => doc && handleEdit(doc)} className="gap-1">
                          <Edit2 className="h-4 w-4" />
                          Edit
                        </Button>
                      )
                    )}
                  </div>

                  {loading ? (
                    <p className="text-muted-foreground">Loading...</p>
                  ) : isEditing ? (
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="min-h-[400px] font-mono text-sm"
                      placeholder="Enter markdown content..."
                    />
                  ) : doc ? (
                    <div className="prose prose-invert max-w-none">
                      <div className="space-y-4 text-foreground">
                        {doc.content.split('\n').map((line, i) => {
                          if (line.startsWith('# ')) {
                            return <h1 key={i} className="text-2xl font-bold mt-6 mb-4 text-gradient-primary">{line.slice(2)}</h1>;
                          }
                          if (line.startsWith('## ')) {
                            return <h2 key={i} className="text-xl font-semibold mt-4 mb-2">{line.slice(3)}</h2>;
                          }
                          if (line.startsWith('- ')) {
                            return <li key={i} className="ml-4 text-muted-foreground">{line.slice(2)}</li>;
                          }
                          if (line.startsWith('```')) {
                            return null;
                          }
                          if (line.trim()) {
                            return <p key={i} className="text-muted-foreground">{line}</p>;
                          }
                          return null;
                        })}
                      </div>
                      <p className="text-xs text-muted-foreground mt-6">
                        Last updated: {new Date(doc.updated_at).toLocaleString()}
                      </p>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">Documentation not found</p>
                  )}
                </GlassCard>
              </TabsContent>
            );
          })}
        </Tabs>
      </motion.div>
    </Layout>
  );
};

export default DocsPage;
