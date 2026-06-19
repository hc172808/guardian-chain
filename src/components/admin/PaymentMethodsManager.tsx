import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  CreditCard, Smartphone, Building, Coins, Plus, Edit, Trash2,
  Loader2, RefreshCw, CheckCircle2, XCircle, ShoppingCart,
  Users, Clock, DollarSign
} from 'lucide-react';

interface PaymentMethod {
  id: number;
  name: string;
  type: string;
  description: string;
  instructions: string;
  icon: string;
  is_enabled: boolean;
  config_json: string;
  created_at: string;
}

interface BuyRequest {
  id: number;
  username: string;
  payment_method_name: string;
  token_symbol: string;
  token_amount: string;
  fiat_amount: string;
  fiat_currency: string;
  status: string;
  reference: string;
  notes: string;
  created_at: string;
  processed_at: string | null;
}

interface CashoutRequest {
  id: number;
  username: string;
  asset: string;
  amount: string;
  destination: string;
  payment_method: string;
  note: string;
  reference: string;
  status: string;
  created_at: string;
  processed_at: string | null;
}

const iconMap: Record<string, React.ReactNode> = {
  paypal: <span className="font-bold text-blue-400 text-sm">PP</span>,
  phone: <Smartphone className="h-4 w-4 text-emerald-400" />,
  building: <Building className="h-4 w-4 text-amber-400" />,
  'credit-card': <CreditCard className="h-4 w-4 text-purple-400" />,
  coins: <Coins className="h-4 w-4 text-yellow-400" />,
};

export function PaymentMethodsManager() {
  const { toast } = useToast();
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [buyRequests, setBuyRequests] = useState<BuyRequest[]>([]);
  const [cashoutRequests, setCashoutRequests] = useState<CashoutRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<PaymentMethod | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'methods' | 'buy' | 'cashout'>('methods');

  const [form, setForm] = useState({ name: '', type: '', description: '', instructions: '', icon: 'credit-card' });

  const load = async () => {
    setLoading(true);
    try {
      const [mRes, bRes, cRes] = await Promise.all([
        fetch('/api/admin/payment-methods', { credentials: 'include' }),
        fetch('/api/admin/buy-requests', { credentials: 'include' }),
        fetch('/api/admin/cashouts', { credentials: 'include' }),
      ]);
      if (mRes.ok) setMethods(await mRes.json());
      if (bRes.ok) setBuyRequests(await bRes.json());
      if (cRes.ok) setCashoutRequests(await cRes.json());
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const toggleMethod = async (m: PaymentMethod) => {
    try {
      await fetch(`/api/admin/payment-methods/${m.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ is_enabled: !m.is_enabled }),
      });
      toast({ title: `${m.name} ${!m.is_enabled ? 'enabled' : 'disabled'}` });
      load();
    } catch (e: any) {
      toast({ title: 'Failed to update', variant: 'destructive' });
    }
  };

  const deleteMethod = async (id: number) => {
    if (!confirm('Delete this payment method?')) return;
    await fetch(`/api/admin/payment-methods/${id}`, { method: 'DELETE', credentials: 'include' });
    toast({ title: 'Payment method deleted' });
    load();
  };

  const openEdit = (m: PaymentMethod) => {
    setSelected(m);
    setForm({ name: m.name, type: m.type, description: m.description, instructions: m.instructions, icon: m.icon });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/payment-methods/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Save failed');
      toast({ title: 'Payment method updated' });
      setEditOpen(false);
      load();
    } catch (e: any) {
      toast({ title: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const addMethod = async () => {
    if (!form.name || !form.type) return toast({ title: 'Name and type required', variant: 'destructive' });
    setSaving(true);
    try {
      const res = await fetch('/api/admin/payment-methods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Add failed');
      toast({ title: 'Payment method added' });
      setAddOpen(false);
      setForm({ name: '', type: '', description: '', instructions: '', icon: 'credit-card' });
      load();
    } catch (e: any) {
      toast({ title: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const updateBuyRequest = async (id: number, status: string) => {
    await fetch(`/api/admin/buy-requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status }),
    });
    toast({ title: `Request marked ${status}` });
    load();
  };

  const updateCashout = async (id: number, status: string) => {
    await fetch(`/api/admin/cashouts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status }),
    });
    toast({ title: `Cashout marked ${status}` });
    load();
  };

  const statusBadge = (s: string) => {
    const cls = s === 'approved' || s === 'completed' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
      : s === 'rejected' || s === 'failed' ? 'bg-red-500/20 text-red-400 border-red-500/30'
      : 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    return <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${cls}`}>{s}</span>;
  };

  return (
    <GlassCard className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CreditCard className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-xl font-bold">Payment Methods</h2>
            <p className="text-sm text-muted-foreground">Control which payment options users see</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" className="gap-2" onClick={() => { setForm({ name: '', type: '', description: '', instructions: '', icon: 'credit-card' }); setAddOpen(true); }}>
            <Plus className="h-4 w-4" /> Add Method
          </Button>
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 border-b border-border/40 pb-0">
        {([['methods', 'Payment Methods', CreditCard], ['buy', 'Buy Requests', ShoppingCart], ['cashout', 'Cash Outs', DollarSign]] as const).map(([tab, label, Icon]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
            {tab === 'buy' && buyRequests.filter(r => r.status === 'pending').length > 0 && (
              <Badge variant="destructive" className="h-4 min-w-4 text-xs px-1 ml-1">
                {buyRequests.filter(r => r.status === 'pending').length}
              </Badge>
            )}
            {tab === 'cashout' && cashoutRequests.filter(r => r.status === 'pending').length > 0 && (
              <Badge variant="destructive" className="h-4 min-w-4 text-xs px-1 ml-1">
                {cashoutRequests.filter(r => r.status === 'pending').length}
              </Badge>
            )}
          </button>
        ))}
      </div>

      {/* Payment Methods tab */}
      {activeTab === 'methods' && (
        <div className="space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : methods.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-6">No payment methods yet.</p>
          ) : methods.map(m => (
            <div key={m.id} className="flex items-start justify-between gap-3 p-4 rounded-lg bg-card/50 border border-border/30">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="p-2 rounded-lg bg-primary/10 flex-shrink-0 flex items-center justify-center w-9 h-9">
                  {iconMap[m.icon] || <CreditCard className="h-4 w-4 text-primary" />}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{m.name}</span>
                    <span className="text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">{m.type}</span>
                    {m.is_enabled
                      ? <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Enabled</span>
                      : <span className="text-xs text-muted-foreground flex items-center gap-1"><XCircle className="h-3 w-3" /> Disabled</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{m.description}</p>
                  {m.instructions && (
                    <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-2">{m.instructions}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Switch checked={m.is_enabled} onCheckedChange={() => toggleMethod(m)} />
                <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => openEdit(m)}>
                  <Edit className="h-3 w-3" />
                </Button>
                <Button size="icon" variant="outline" className="h-7 w-7 text-destructive" onClick={() => deleteMethod(m.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Buy Requests tab */}
      {activeTab === 'buy' && (
        <div className="space-y-3">
          {buyRequests.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-6">No buy requests yet.</p>
          ) : buyRequests.map(r => (
            <div key={r.id} className="p-4 rounded-lg bg-card/50 border border-border/30 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{r.username || 'Unknown'}</span>
                    {statusBadge(r.status)}
                    <span className="text-xs font-mono text-muted-foreground">{r.reference}</span>
                  </div>
                  <p className="text-sm mt-1">
                    Buy <strong>{Number(r.token_amount).toLocaleString()} {r.token_symbol}</strong>
                    {r.fiat_amount && <span className="text-muted-foreground"> (≈ {r.fiat_currency} {Number(r.fiat_amount).toFixed(2)})</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">via {r.payment_method_name}</p>
                  {r.notes && <p className="text-xs text-muted-foreground mt-1">Note: {r.notes}</p>}
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    <Clock className="h-3 w-3" /> {new Date(r.created_at).toLocaleString()}
                  </p>
                </div>
                {r.status === 'pending' && (
                  <div className="flex gap-2 flex-shrink-0">
                    <Button size="sm" className="gap-1 h-7 bg-emerald-600 hover:bg-emerald-700 text-white text-xs" onClick={() => updateBuyRequest(r.id, 'approved')}>
                      <CheckCircle2 className="h-3 w-3" /> Approve
                    </Button>
                    <Button size="sm" variant="destructive" className="gap-1 h-7 text-xs" onClick={() => updateBuyRequest(r.id, 'rejected')}>
                      <XCircle className="h-3 w-3" /> Reject
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Cash Out Requests tab */}
      {activeTab === 'cashout' && (
        <div className="space-y-3">
          {cashoutRequests.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-6">No cash out requests yet.</p>
          ) : cashoutRequests.map(r => (
            <div key={r.id} className="p-4 rounded-lg bg-card/50 border border-border/30 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{r.username || 'Unknown'}</span>
                    {statusBadge(r.status)}
                    <span className="text-xs font-mono text-muted-foreground">{r.reference}</span>
                  </div>
                  <p className="text-sm mt-1">
                    Cash out <strong>{Number(r.amount).toLocaleString()} {r.asset}</strong>
                  </p>
                  {r.payment_method && <p className="text-xs text-muted-foreground">via {r.payment_method}</p>}
                  <p className="text-xs text-muted-foreground font-mono">→ {r.destination}</p>
                  {r.note && <p className="text-xs text-muted-foreground mt-1">Note: {r.note}</p>}
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    <Clock className="h-3 w-3" /> {new Date(r.created_at).toLocaleString()}
                  </p>
                </div>
                {r.status === 'pending' && (
                  <div className="flex gap-2 flex-shrink-0">
                    <Button size="sm" className="gap-1 h-7 bg-emerald-600 hover:bg-emerald-700 text-white text-xs" onClick={() => updateCashout(r.id, 'approved')}>
                      <CheckCircle2 className="h-3 w-3" /> Approve
                    </Button>
                    <Button size="sm" variant="destructive" className="gap-1 h-7 text-xs" onClick={() => updateCashout(r.id, 'rejected')}>
                      <XCircle className="h-3 w-3" /> Reject
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Payment Method</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Name</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><Label>Type (identifier)</Label><Input value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} /></div>
            <div><Label>Description</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div><Label>Instructions for users</Label><Textarea rows={3} value={form.instructions} onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))} /></div>
            <div>
              <Label>Icon</Label>
              <select className="w-full mt-1 bg-background border border-input rounded-md px-3 py-2 text-sm" value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))}>
                <option value="paypal">PayPal</option>
                <option value="phone">Phone/Mobile</option>
                <option value="building">Bank/Building</option>
                <option value="credit-card">Credit Card</option>
                <option value="coins">Crypto/Coins</option>
              </select>
            </div>
            <Button onClick={saveEdit} className="w-full" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Payment Method</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Name</Label><Input placeholder="e.g. Bank Transfer" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><Label>Type (identifier)</Label><Input placeholder="e.g. bank_transfer" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} /></div>
            <div><Label>Description</Label><Input placeholder="Short description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div><Label>Instructions for users</Label><Textarea rows={3} placeholder="Step-by-step payment instructions" value={form.instructions} onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))} /></div>
            <div>
              <Label>Icon</Label>
              <select className="w-full mt-1 bg-background border border-input rounded-md px-3 py-2 text-sm" value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))}>
                <option value="paypal">PayPal</option>
                <option value="phone">Phone/Mobile</option>
                <option value="building">Bank/Building</option>
                <option value="credit-card">Credit Card</option>
                <option value="coins">Crypto/Coins</option>
              </select>
            </div>
            <Button onClick={addMethod} className="w-full" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Add Payment Method
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </GlassCard>
  );
}
