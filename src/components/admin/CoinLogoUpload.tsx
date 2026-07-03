import { useState, useEffect } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Upload, Loader2, Save, Image as ImageIcon } from 'lucide-react';

export const CoinLogoUpload = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [gydsLogo, setGydsLogo] = useState('');
  const [gydLogo, setGydLogo] = useState('');
  const [gusdLogo, setGusdLogo] = useState('');
  const [gydsPreview, setGydsPreview] = useState('');
  const [gydPreview, setGydPreview] = useState('');
  const [gusdPreview, setGusdPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);

  useEffect(() => {
    loadLogos();
  }, []);

  const loadLogos = async () => {
    const [gydsRow, gydRow, gusdRow] = await Promise.all([
      api.get('/api/config/gyds_logo').catch(() => null),
      api.get('/api/config/gyd_logo').catch(() => null),
      api.get('/api/config/gusd_logo').catch(() => null),
    ]);
    const data = [
      gydsRow ? { config_key: 'gyds_logo', config_value: gydsRow.configValue } : null,
      gydRow  ? { config_key: 'gyd_logo',  config_value: gydRow.configValue  } : null,
      gusdRow ? { config_key: 'gusd_logo', config_value: gusdRow.configValue } : null,
    ].filter(Boolean);

    (data || []).forEach((c: any) => {
      const val = c.config_value as Record<string, string>;
      if (c.config_key === 'gyds_logo' && val?.url) {
        setGydsLogo(val.url);
        setGydsPreview(val.url);
      }
      if (c.config_key === 'gyd_logo' && val?.url) {
        setGydLogo(val.url);
        setGydPreview(val.url);
      }
      if (c.config_key === 'gusd_logo' && val?.url) {
        setGusdLogo(val.url);
        setGusdPreview(val.url);
      }
    });
  };

  const handleFileUpload = async (file: File, coin: 'gyds' | 'gyd' | 'gusd') => {
    if (!file || !file.type.startsWith('image/')) {
      toast({ title: 'Invalid file', description: 'Please select an image file', variant: 'destructive' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Max 2MB', variant: 'destructive' });
      return;
    }

    setUploading(coin);
    const ext = file.name.split('.').pop();
    const path = `coin-logos/${coin}-logo.${ext}`;

    // No storage backend — ask for a URL instead
    const urlInput = window.prompt(`Paste a public image URL for ${coin.toUpperCase()} logo:`);
    if (!urlInput) {
      setUploading(null);
      return;
    }

    const url = urlInput.trim();

    if (coin === 'gyds') {
      setGydsLogo(url);
      setGydsPreview(url);
    } else if (coin === 'gyd') {
      setGydLogo(url);
      setGydPreview(url);
    } else {
      setGusdLogo(url);
      setGusdPreview(url);
    }

    setUploading(null);
    toast({ title: `${coin.toUpperCase()} logo uploaded!` });
  };

  const saveLogos = async () => {
    setSaving(true);

    const saves = [
      { key: 'gyds_logo', url: gydsLogo },
      { key: 'gyd_logo', url: gydLogo },
      { key: 'gusd_logo', url: gusdLogo },
    ];

    for (const { key, url } of saves) {
      if (!url) continue;
      await api.post('/api/config', {
        key,
        value: { url, updated_at: new Date().toISOString() },
      });
    }

    toast({ title: 'Coin logos saved!' });
    setSaving(false);
  };

  return (
    <GlassCard className="p-6">
      <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
        <ImageIcon className="h-5 w-5 text-primary" />
        Native Coin Logos
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        Upload logos for GYDS, GYD, and GUSD that will display across wallets, swap, and explorer.
      </p>

      <div className="grid md:grid-cols-3 gap-6">
        {/* GYDS Logo */}
        <div className="space-y-3">
          <Label className="font-semibold">GYDS Logo</Label>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full border-2 border-dashed border-border flex items-center justify-center overflow-hidden bg-secondary/30">
              {gydsPreview ? (
                <img src={gydsPreview} alt="GYDS" className="w-full h-full object-cover rounded-full" />
              ) : (
                <span className="text-xl font-bold text-muted-foreground">G</span>
              )}
            </div>
            <div className="flex-1 space-y-2">
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'gyds')}
                disabled={uploading === 'gyds'}
              />
              {uploading === 'gyds' && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Uploading...</div>}
            </div>
          </div>
          <Input
            placeholder="Or paste image URL"
            value={gydsLogo}
            onChange={(e) => { setGydsLogo(e.target.value); setGydsPreview(e.target.value); }}
          />
        </div>

        {/* GYD Logo */}
        <div className="space-y-3">
          <Label className="font-semibold">GYD Logo</Label>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full border-2 border-dashed border-border flex items-center justify-center overflow-hidden bg-secondary/30">
              {gydPreview ? (
                <img src={gydPreview} alt="GYD" className="w-full h-full object-cover rounded-full" />
              ) : (
                <span className="text-xl font-bold text-muted-foreground">G</span>
              )}
            </div>
            <div className="flex-1 space-y-2">
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'gyd')}
                disabled={uploading === 'gyd'}
              />
              {uploading === 'gyd' && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Uploading...</div>}
            </div>
          </div>
          <Input
            placeholder="Or paste image URL"
            value={gydLogo}
            onChange={(e) => { setGydLogo(e.target.value); setGydPreview(e.target.value); }}
          />
        </div>

        {/* GUSD Logo */}
        <div className="space-y-3">
          <Label className="font-semibold">GUSD Logo</Label>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full border-2 border-dashed border-border flex items-center justify-center overflow-hidden bg-secondary/30">
              {gusdPreview ? (
                <img src={gusdPreview} alt="GUSD" className="w-full h-full object-cover rounded-full" />
              ) : (
                <span className="text-xl font-bold text-muted-foreground">G</span>
              )}
            </div>
            <div className="flex-1 space-y-2">
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'gusd')}
                disabled={uploading === 'gusd'}
              />
              {uploading === 'gusd' && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Uploading...</div>}
            </div>
          </div>
          <Input
            placeholder="Or paste image URL"
            value={gusdLogo}
            onChange={(e) => { setGusdLogo(e.target.value); setGusdPreview(e.target.value); }}
          />
        </div>
      </div>

      <Button onClick={saveLogos} disabled={saving} className="w-full mt-4 gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save Logos
      </Button>
    </GlassCard>
  );
};
