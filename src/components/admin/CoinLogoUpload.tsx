import { useState, useEffect } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { Loader2, Save, Image as ImageIcon, X } from 'lucide-react';

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

type Coin = 'gyds' | 'gyd' | 'gusd';

interface CoinState {
  url: string;
  preview: string;
  uploading: boolean;
}

const defaultState = (): CoinState => ({ url: '', preview: '', uploading: false });

export const CoinLogoUpload = () => {
  const { toast } = useToast();
  const [coins, setCoins] = useState<Record<Coin, CoinState>>({
    gyds: defaultState(),
    gyd:  defaultState(),
    gusd: defaultState(),
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadLogos(); }, []);

  const loadLogos = async () => {
    const [gydsRow, gydRow, gusdRow] = await Promise.all([
      api.get('/api/config/gyds_logo').catch(() => null),
      api.get('/api/config/gyd_logo').catch(() => null),
      api.get('/api/config/gusd_logo').catch(() => null),
    ]);
    const map: Record<string, Coin> = { gyds_logo: 'gyds', gyd_logo: 'gyd', gusd_logo: 'gusd' };
    for (const [row, key] of [[gydsRow, 'gyds_logo'], [gydRow, 'gyd_logo'], [gusdRow, 'gusd_logo']] as [any, string][]) {
      if (!row) continue;
      const val = row.configValue as Record<string, string>;
      const coinKey = map[key];
      if (val?.url) {
        setCoins(prev => ({ ...prev, [coinKey]: { url: val.url, preview: val.url, uploading: false } }));
      }
    }
  };

  const handleFileUpload = async (file: File, coin: Coin) => {
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid file', description: 'Please select an image file', variant: 'destructive' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Max 2 MB', variant: 'destructive' });
      return;
    }
    setCoins(prev => ({ ...prev, [coin]: { ...prev[coin], uploading: true } }));
    try {
      const dataUrl = await fileToDataUrl(file);
      setCoins(prev => ({ ...prev, [coin]: { url: dataUrl, preview: dataUrl, uploading: false } }));
    } catch {
      toast({ title: 'Failed to read file', variant: 'destructive' });
      setCoins(prev => ({ ...prev, [coin]: { ...prev[coin], uploading: false } }));
    }
  };

  const handleUrlChange = (coin: Coin, value: string) => {
    setCoins(prev => ({ ...prev, [coin]: { url: value, preview: value, uploading: false } }));
  };

  const clearLogo = (coin: Coin) => {
    setCoins(prev => ({ ...prev, [coin]: defaultState() }));
  };

  const saveLogos = async () => {
    setSaving(true);
    const entries: [string, Coin][] = [['gyds_logo', 'gyds'], ['gyd_logo', 'gyd'], ['gusd_logo', 'gusd']];
    for (const [key, coin] of entries) {
      if (!coins[coin].url) continue;
      await api.post('/api/config', {
        key,
        value: { url: coins[coin].url, updated_at: new Date().toISOString() },
      }).catch(() => {});
    }
    toast({ title: 'Coin logos saved!' });
    setSaving(false);
  };

  const CoinRow = ({ coin, label }: { coin: Coin; label: string }) => {
    const state = coins[coin];
    return (
      <div className="space-y-3">
        <Label className="font-semibold">{label}</Label>
        <div className="flex items-center gap-4">
          <div className="relative w-16 h-16 shrink-0">
            <div className="w-16 h-16 rounded-full border-2 border-dashed border-border flex items-center justify-center overflow-hidden bg-secondary/30">
              {state.preview ? (
                <img src={state.preview} alt={label} className="w-full h-full object-cover rounded-full" onError={() => handleUrlChange(coin, '')} />
              ) : (
                <span className="text-xl font-bold text-muted-foreground">{label[0]}</span>
              )}
            </div>
            {state.preview && (
              <button
                onClick={() => clearLogo(coin)}
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center hover:bg-destructive/80"
                title="Remove logo"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <div className="flex-1 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <div className="px-3 py-1.5 rounded-md border border-border text-sm bg-secondary/30 hover:bg-secondary/60 transition-colors flex items-center gap-2">
                {state.uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {state.uploading ? 'Reading…' : 'Choose file'}
              </div>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={state.uploading}
                onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0], coin)}
              />
            </label>
            <p className="text-xs text-muted-foreground">PNG, JPG, SVG · max 2 MB · optional</p>
          </div>
        </div>
        <Input
          placeholder="Or paste a public image URL (optional)"
          value={state.url.startsWith('data:') ? '' : state.url}
          onChange={e => handleUrlChange(coin, e.target.value)}
        />
      </div>
    );
  };

  return (
    <GlassCard className="p-6">
      <h3 className="text-lg font-semibold flex items-center gap-2 mb-1">
        <ImageIcon className="h-5 w-5 text-primary" />
        Native Coin Logos
      </h3>
      <p className="text-sm text-muted-foreground mb-5">
        Upload a file <span className="text-muted-foreground/60">or</span> paste a URL for each coin logo. All fields are optional.
      </p>

      <div className="grid md:grid-cols-3 gap-6">
        <CoinRow coin="gyds" label="GYDS" />
        <CoinRow coin="gyd"  label="GYD"  />
        <CoinRow coin="gusd" label="GUSD" />
      </div>

      <Button onClick={saveLogos} disabled={saving} className="w-full mt-5 gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save Logos
      </Button>
    </GlassCard>
  );
};
