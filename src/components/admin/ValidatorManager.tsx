import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { logAuditEvent } from '@/lib/auditLog';
import {
  Users, Plus, Trash2, Edit, CheckCircle, XCircle, Loader2, Shield,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';

interface Validator {
  id: string;
  address: string;
  name: string | null;
  stake: number;
  commission: number;
  is_active: boolean;
  is_jailed: boolean;
  uptime: number;
  blocks_proposed: number;
  created_at: string;
}

export const ValidatorManager = () => {
  const { user } = useAuth();
  const [validators, setValidators] = useState<Validator[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    address: '', name: '', stake: '100000', commission: '10', is_active: true,
  });

  const fetchValidators = async () => {
    try {
      const data = await api.get('/api/validators');
      setValidators(Array.isArray(data) ? data : []);
    } catch { setValidators([]); }
    setLoading(false);
  };

  useEffect(() => { fetchValidators(); }, []);

  const handleSave = async () => {
    if (!user || !form.address) return;
    setSaving(true);
    const payload = {
      address: form.address,
      name: form.name || null,
      stake: parseFloat(form.stake),
      commission: parseInt(form.commission),
      is_active: form.is_active,
    };
    try {
      if (editingId) {
        await api.patch(`/api/validators/${editingId}`, payload);
      } else {
        await api.post('/api/validators', payload);
      }
      toast({ title: editingId ? 'Validator updated' : 'Validator added' });
      logAuditEvent(user.id, user.email || null, {
        action: editingId ? 'Updated validator' : 'Added validator',
        category: 'validator',
        target_type: 'network_validators',
        details: { address: form.address, name: form.name, stake: form.stake },
      });
      setDialogOpen(false);
      resetForm();
      fetchValidators();
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/api/validators/${id}`);
      toast({ title: 'Validator removed' });
      if (user) {
        logAuditEvent(user.id, user.email || null, {
          action: 'Removed validator',
          category: 'validator',
          target_type: 'network_validators',
          target_id: id,
        });
      }
      fetchValidators();
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    }
  };

  const handleEdit = (v: Validator) => {
    setEditingId(v.id);
    setForm({
      address: v.address,
      name: v.name || '',
      stake: v.stake.toString(),
      commission: v.commission.toString(),
      is_active: v.is_active,
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setEditingId(null);
    setForm({ address: '', name: '', stake: '100000', commission: '10', is_active: true });
  };

  return (
    <GlassCard className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Validator Management
        </h3>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1"><Plus className="h-4 w-4" /> Add Validator</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingId ? 'Edit' : 'Add'} Validator</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Validator Address</Label>
                <Input placeholder="0x..." value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Name (optional)</Label>
                <Input placeholder="Validator name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Stake (GYDS)</Label>
                  <Input type="number" value={form.stake} onChange={(e) => setForm({ ...form, stake: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Commission %</Label>
                  <Input type="number" min={0} max={100} value={form.commission} onChange={(e) => setForm({ ...form, commission: e.target.value })} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label>Active</Label>
                <Switch checked={form.is_active} onCheckedChange={(c) => setForm({ ...form, is_active: c })} />
              </div>
              <Button onClick={handleSave} disabled={saving || !form.address} className="w-full gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                {editingId ? 'Update' : 'Add'} Validator
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : validators.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p>No validators added yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {validators.map((v) => (
            <div key={v.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${v.is_active ? 'bg-primary/20' : 'bg-muted/20'}`}>
                  {v.is_active ? <CheckCircle className="h-4 w-4 text-primary" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}
                </div>
                <div>
                  <p className="text-sm font-medium">{v.name || 'Unnamed'}</p>
                  <code className="text-xs text-muted-foreground">{(v.address ?? '').slice(0, 10)}...{(v.address ?? '').slice(-6)}</code>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right text-sm">
                  <p className="font-mono">{Number(v.stake).toLocaleString()} GYDS</p>
                  <p className="text-xs text-muted-foreground">{v.commission}% commission</p>
                </div>
                <Badge variant={v.is_active ? 'default' : 'secondary'} className="text-xs">
                  {v.is_active ? 'Active' : 'Inactive'}
                </Badge>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(v)}>
                  <Edit className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(v.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
};
