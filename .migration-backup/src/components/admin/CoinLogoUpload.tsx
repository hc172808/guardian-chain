import { useState, useEffect } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Upload, Loader2, Save, Image as ImageIcon } from 'lucide-react';

export const CoinLogoUpload = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [gydsLogo, setGydsLogo] = useState('');
  const [gydLogo, setGydLogo] = useState('');
  const [gydsPreview, setGydsPreview] = useState('');
  const [gydPreview, setGydPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);

  useEffect(() => {
    loadLogos();
  }, []);

  const loadLogos = async () => {
    const { data } = await supabase
      .from('admin_config')
      .select('config_key, config_value')
      .in('config_key', ['gyds_logo', 'gyd_logo']);

    (data || []).forEach(c => {
      const val = c.config_value as Record<string, string>;
      if (c.config_key === 'gyds_logo' && val?.url) {
        setGydsLogo(val.url);
        setGydsPreview(val.url);
      }
      if (c.config_key === 'gyd_logo' && val?.url) {
        setGydLogo(val.url);
        setGydPreview(val.url);
      }
    });
  };

  const handleFileUpload = async (file: File, coin: 'gyds' | 'gyd') => {
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

    const { error: uploadError } = await supabase.storage
      .from('token-logos')
      .upload(path, file, { upsert: true });

    if (uploadError) {
      toast({ title: 'Upload failed', description: uploadError.message, variant: 'destructive' });
      setUploading(null);
      return;
    }

    const { data: urlData } = supabase.storage
      .from('token-logos')
      .getPublicUrl(path);

    const url = urlData.publicUrl;

    if (coin === 'gyds') {
      setGydsLogo(url);
      setGydsPreview(url);
    } else {
      setGydLogo(url);
      setGydPreview(url);
    }

    setUploading(null);
    toast({ title: `${coin.toUpperCase()} logo uploaded!` });
  };

  const saveLogos = async () => {
    setSaving(true);

    const saves = [
      { key: 'gyds_logo', url: gydsLogo },
      { key: 'gyd_logo', url: gydLogo },
    ];

    for (const { key, url } of saves) {
      if (!url) continue;
      await supabase.from('admin_config').upsert({
        config_key: key,
        config_value: { url, updated_at: new Date().toISOString() },
        updated_by: user?.id,
      }, { onConflict: 'config_key' });
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
        Upload logos for GYDS and GYD that will display across wallets, swap, and explorer.
      </p>

      <div className="grid md:grid-cols-2 gap-6">
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
      </div>

      <Button onClick={saveLogos} disabled={saving} className="w-full mt-4 gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save Logos
      </Button>
    </GlassCard>
  );
};
