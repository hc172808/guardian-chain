import { useState, useEffect } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Textarea } from '../ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { Megaphone, Trash2, Clock, User, Eye, EyeOff, AlertTriangle, CheckCircle, Info } from 'lucide-react';

const ANNOUNCE_KEY = 'announcement_banner';

const PRESET_MESSAGES = [
  { label: 'Maintenance', text: '🔧 Scheduled maintenance in progress. Some features may be unavailable.' },
  { label: 'New Release', text: '🚀 New ChainCore release deployed! Check the changelog for updates.' },
  { label: 'Network Update', text: '⛓️ GYDS Network upgrade underway. Transactions may be slower than usual.' },
  { label: 'Testnet Reset', text: '🔄 Testnet has been reset. Testnet GYDS balances have been cleared.' },
  { label: 'Custom', text: '' },
];

type BannerType = 'info' | 'warning' | 'success' | 'error';

export const AnnouncementPanel = () => {
  const { toast } = useToast();
  const [message, setMessage] = useState('');
  const [bannerType, setBannerType] = useState<BannerType>('info');
  const [link, setLink] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [current, setCurrent] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState('Custom');

  const fetchCurrent = async () => {
    try {
      const data = await api.get(`/api/config/${ANNOUNCE_KEY}`);
      setCurrent(data?.config_value ?? null);
    } catch { setCurrent(null); }
  };

  useEffect(() => { fetchCurrent(); }, []);

  const publish = async () => {
    if (!message.trim()) {
      toast({ title: 'Enter a message', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      await api.post('/api/config', {
        key: ANNOUNCE_KEY,
        value: {
          message: message.trim(),
          type: bannerType,
          link: link.trim() || null,
          linkLabel: linkLabel.trim() || null,
          at: new Date().toISOString(),
        },
      });
      toast({ title: 'Banner published!' });
      fetchCurrent();
    } catch (e: any) {
      toast({ title: 'Failed to publish', description: e.message, variant: 'destructive' });
    }
    setLoading(false);
  };

  const clearBanner = async () => {
    setLoading(true);
    try {
      await api.post('/api/config', { key: ANNOUNCE_KEY, value: null });
      toast({ title: 'Banner cleared' });
      setCurrent(null);
    } catch (e: any) {
      toast({ title: 'Failed to clear', description: e.message, variant: 'destructive' });
    }
    setLoading(false);
  };

  const TYPE_STYLES: Record<BannerType, string> = {
    info:    'border-blue-500/40 bg-blue-500/10 text-blue-300',
    warning: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
    success: 'border-green-500/40 bg-green-500/10 text-green-300',
    error:   'border-red-500/40 bg-red-500/10 text-red-300',
  };

  const TYPE_ICONS: Record<BannerType, React.FC<any>> = {
    info: Info, warning: AlertTriangle, success: CheckCircle, error: AlertTriangle,
  };

  const TypeIcon = TYPE_ICONS[bannerType];

  return (
    <div className="space-y-4">
      {/* Current banner */}
      {current ? (
        <GlassCard className="p-4 border-amber-500/30 bg-amber-500/5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1.5">
                <Badge variant="outline" className="text-amber-400 border-amber-400/40 text-xs gap-1">
                  <Megaphone className="h-3 w-3" /> Active Banner
                </Badge>
                {current.type && (
                  <Badge variant="outline" className="text-xs capitalize">{current.type}</Badge>
                )}
              </div>
              <p className="text-sm font-medium">{current.message}</p>
              {current.link && (
                <p className="text-xs text-muted-foreground mt-1">
                  Link: <a href={current.link} className="text-primary underline" target="_blank" rel="noreferrer">{current.linkLabel || current.link}</a>
                </p>
              )}
              {current.at && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Published {new Date(current.at).toLocaleString()}
                </p>
              )}
            </div>
            <Button variant="destructive" size="sm" onClick={clearBanner} disabled={loading} className="gap-1.5 shrink-0">
              <Trash2 className="h-3.5 w-3.5" /> Clear
            </Button>
          </div>
        </GlassCard>
      ) : (
        <GlassCard className="p-3 border-dashed">
          <p className="text-sm text-muted-foreground text-center flex items-center justify-center gap-2">
            <Megaphone className="h-4 w-4" /> No active announcement banner
          </p>
        </GlassCard>
      )}

      {/* Compose */}
      <GlassCard className="p-5 space-y-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-primary" /> Compose Banner
        </h3>

        {/* Presets */}
        <div>
          <Label className="text-xs text-muted-foreground mb-2 block">Quick presets</Label>
          <div className="flex flex-wrap gap-2">
            {PRESET_MESSAGES.map(p => (
              <button
                key={p.label}
                onClick={() => { setSelectedPreset(p.label); if (p.text) setMessage(p.text); }}
                className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                  selectedPreset === p.label
                    ? 'border-primary bg-primary/20 text-primary'
                    : 'border-border text-muted-foreground hover:border-primary/40'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <Label>Message</Label>
            <Textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Type your announcement here…"
              className="resize-none h-20"
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground text-right mt-0.5">{message.length}/500</p>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">Banner type</Label>
            <div className="flex gap-2 flex-wrap">
              {(['info', 'warning', 'success', 'error'] as BannerType[]).map(t => (
                <button
                  key={t}
                  onClick={() => setBannerType(t)}
                  className={`text-xs px-3 py-1.5 rounded-lg border capitalize transition-all font-medium ${
                    bannerType === t ? TYPE_STYLES[t] : 'border-border text-muted-foreground hover:border-primary/40'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Action Link (optional)</Label>
              <Input value={link} onChange={e => setLink(e.target.value)} placeholder="https://..." className="text-sm" />
            </div>
            <div>
              <Label className="text-xs">Link Label</Label>
              <Input value={linkLabel} onChange={e => setLinkLabel(e.target.value)} placeholder="Learn more" className="text-sm" />
            </div>
          </div>
        </div>

        {/* Preview */}
        <div>
          <button
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
            onClick={() => setPreviewMode(v => !v)}
          >
            {previewMode ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {previewMode ? 'Hide preview' : 'Preview banner'}
          </button>
          {previewMode && message && (
            <div className={`flex items-start gap-3 px-4 py-3 rounded-lg border text-sm ${TYPE_STYLES[bannerType]}`}>
              <TypeIcon className="h-4 w-4 shrink-0 mt-0.5" />
              <span className="flex-1">{message}</span>
              {link && (
                <a href="#" className="underline font-medium whitespace-nowrap text-xs">{linkLabel || 'Learn more'}</a>
              )}
            </div>
          )}
        </div>

        <Button onClick={publish} disabled={loading || !message.trim()} className="w-full gap-2">
          <Megaphone className="h-4 w-4" />
          {loading ? 'Publishing…' : 'Publish Banner'}
        </Button>
      </GlassCard>
    </div>
  );
};
