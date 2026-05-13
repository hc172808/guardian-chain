import { useState, useRef, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { 
  Coins, Plus, Lock, Flame, Shield, AlertTriangle, Loader2, CheckCircle, Upload, ShoppingCart, Globe, FileCode
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';

interface TokenAuthority {
  freeze: boolean;
  update: boolean;
  mint: boolean;
}

interface TokenCreationParams {
  name: string;
  symbol: string;
  decimals: number;
  initialSupply: string;
  gydsLiquidity: string;
  authorities: TokenAuthority;
  lpLockType: 'burn' | 'timelock';
  timelockDays: number;
  maxBuyPerWallet: string;
  dailyBuyLimit: string;
  description: string;
  website: string;
  twitter: string;
  telegram: string;
  facebook: string;
  discord: string;
}

interface AdminPricing {
  deployment_fee: number;
  freeze_authority_fee: number;
  update_authority_fee: number;
  mint_authority_fee: number;
  min_liquidity: number;
  website_hosting_fee: number;
  website_max_size_mb: number;
}

const DEFAULT_PRICING: AdminPricing = {
  deployment_fee: 100,
  freeze_authority_fee: 50,
  update_authority_fee: 25,
  mint_authority_fee: 200,
  min_liquidity: 100,
  website_hosting_fee: 500,
  website_max_size_mb: 5,
};

export const TokenFactory = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [siteFile, setSiteFile] = useState<File | null>(null);
  const [wantsHosting, setWantsHosting] = useState(false);
  const [pricing, setPricing] = useState<AdminPricing>(DEFAULT_PRICING);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const siteInputRef = useRef<HTMLInputElement>(null);
  
  const [params, setParams] = useState<TokenCreationParams>({
    name: '', symbol: '', decimals: 18, initialSupply: '1000000',
    gydsLiquidity: '1000',
    authorities: { freeze: false, update: false, mint: false },
    lpLockType: 'burn', timelockDays: 365,
    maxBuyPerWallet: '10000',
    dailyBuyLimit: '5000',
    description: '',
    website: '',
    twitter: '',
    telegram: '',
    facebook: '',
    discord: '',
  });

  useEffect(() => {
    const loadPricing = async () => {
      const { data } = await supabase
        .from('admin_config')
        .select('config_value')
        .eq('config_key', 'token_factory_pricing')
        .maybeSingle();
      if (data?.config_value) {
        const val = data.config_value as Record<string, number>;
        setPricing({
          deployment_fee: val.deployment_fee ?? DEFAULT_PRICING.deployment_fee,
          freeze_authority_fee: val.freeze_authority_fee ?? DEFAULT_PRICING.freeze_authority_fee,
          update_authority_fee: val.update_authority_fee ?? DEFAULT_PRICING.update_authority_fee,
          mint_authority_fee: val.mint_authority_fee ?? DEFAULT_PRICING.mint_authority_fee,
          min_liquidity: val.min_liquidity ?? DEFAULT_PRICING.min_liquidity,
          website_hosting_fee: val.website_hosting_fee ?? DEFAULT_PRICING.website_hosting_fee,
          website_max_size_mb: val.website_max_size_mb ?? DEFAULT_PRICING.website_max_size_mb,
        });
      }
    };
    loadPricing();
  }, []);

  const calculateTotalFees = () => {
    let total = pricing.deployment_fee;
    if (params.authorities.freeze) total += pricing.freeze_authority_fee;
    if (params.authorities.update) total += pricing.update_authority_fee;
    if (params.authorities.mint) total += pricing.mint_authority_fee;
    if (wantsHosting && siteFile) total += pricing.website_hosting_fee;
    return total;
  };

  const calculateTotalGyds = () => calculateTotalFees() + parseFloat(params.gydsLiquidity || '0');

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'Logo must be under 2MB', variant: 'destructive' });
      return;
    }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleSiteSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const maxBytes = pricing.website_max_size_mb * 1024 * 1024;
    if (file.size > maxBytes) {
      toast({ title: `HTML file must be under ${pricing.website_max_size_mb}MB`, variant: 'destructive' });
      return;
    }
    if (!file.name.endsWith('.html') && !file.name.endsWith('.htm')) {
      toast({ title: 'Only .html or .htm files are allowed', variant: 'destructive' });
      return;
    }
    setSiteFile(file);
  };

  const handleCreateToken = async () => {
    if (!user) {
      toast({ title: 'Please sign in first', variant: 'destructive' });
      return;
    }
    if (!params.name || !params.symbol) {
      toast({ title: 'Token name and symbol are required', variant: 'destructive' });
      return;
    }
    if (parseFloat(params.gydsLiquidity) < pricing.min_liquidity) {
      toast({ title: `Minimum ${pricing.min_liquidity} GYDS liquidity required`, variant: 'destructive' });
      return;
    }

    const maxBuy = parseFloat(params.maxBuyPerWallet || '0');
    const dailyLimit = parseFloat(params.dailyBuyLimit || '0');
    const supply = parseFloat(params.initialSupply || '0');

    if (maxBuy > supply) {
      toast({ title: 'Max buy per wallet cannot exceed total supply', variant: 'destructive' });
      return;
    }
    if (dailyLimit > maxBuy) {
      toast({ title: 'Daily buy limit cannot exceed max wallet holding', variant: 'destructive' });
      return;
    }

    setCreating(true);
    try {
      let logoUrl: string | null = null;

      if (logoFile) {
        const ext = logoFile.name.split('.').pop();
        const path = `${user.id}/${params.symbol.toLowerCase()}-${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('token-logos')
          .upload(path, logoFile, { upsert: true });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from('token-logos').getPublicUrl(path);
        logoUrl = urlData.publicUrl;
      }

      // Upload HTML site file if provided
      let hostedSiteUrl: string | null = null;
      if (wantsHosting && siteFile) {
        const sitePath = `${user.id}/${params.symbol.toLowerCase()}-${Date.now()}/index.html`;
        const { error: siteUploadError } = await supabase.storage
          .from('token-sites')
          .upload(sitePath, siteFile, { upsert: true, contentType: 'text/html' });
        if (siteUploadError) throw siteUploadError;
        const { data: siteUrlData } = supabase.storage.from('token-sites').getPublicUrl(sitePath);
        hostedSiteUrl = siteUrlData.publicUrl;
      }

      const address = '0x' + Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

      const { error } = await supabase.from('tokens').insert({
        creator_id: user.id,
        name: params.name,
        symbol: params.symbol,
        decimals: params.decimals,
        total_supply: parseFloat(params.initialSupply),
        gyds_liquidity: parseFloat(params.gydsLiquidity),
        logo_url: logoUrl,
        lp_lock_type: params.lpLockType === 'burn' ? 'burned' : 'timelocked',
        lp_unlock_time: params.lpLockType === 'timelock' 
          ? new Date(Date.now() + params.timelockDays * 86400000).toISOString() 
          : null,
        freeze_enabled: params.authorities.freeze,
        update_enabled: params.authorities.update,
        mint_enabled: params.authorities.mint,
        address,
        description: params.description || null,
        website: params.website || null,
        twitter: params.twitter || null,
        telegram: params.telegram || null,
        facebook: params.facebook || null,
        discord: params.discord || null,
        hosted_site_url: hostedSiteUrl,
        hosted_site_fee_paid: wantsHosting && siteFile ? pricing.website_hosting_fee : 0,
      });

      if (error) throw error;

      await supabase.from('admin_config').upsert({
        config_key: `token_limits_${address}`,
        config_value: {
          max_buy_per_wallet: maxBuy,
          daily_buy_limit: dailyLimit,
        } as any,
        updated_by: user.id,
      }, { onConflict: 'config_key' });

      toast({ title: 'Token Created!', description: `${params.name} (${params.symbol}) is now live on the marketplace.` });
      setDialogOpen(false);
      resetForm();
    } catch (error: any) {
      toast({ title: 'Token creation failed', description: error.message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const resetForm = () => {
    setParams({
      name: '', symbol: '', decimals: 18, initialSupply: '1000000',
      gydsLiquidity: '1000',
      authorities: { freeze: false, update: false, mint: false },
      lpLockType: 'burn', timelockDays: 365,
      maxBuyPerWallet: '10000',
      dailyBuyLimit: '5000',
      description: '',
      website: '',
      twitter: '',
      telegram: '',
      facebook: '',
      discord: '',
    });
    setLogoFile(null);
    setLogoPreview(null);
    setSiteFile(null);
    setWantsHosting(false);
  };

  return (
    <>
      <GlassCard className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-primary/20">
              <Coins className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Token Factory</h2>
              <p className="text-sm text-muted-foreground">Create tokens backed by GYDS with locked liquidity</p>
            </div>
          </div>
          <Button onClick={() => setDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Create Token
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-secondary/30">
            <Lock className="h-5 w-5 text-primary mb-2" />
            <h3 className="font-medium">LP Locking</h3>
            <p className="text-sm text-muted-foreground">Liquidity is permanently locked or time-locked</p>
          </div>
          <div className="p-4 rounded-lg bg-secondary/30">
            <Flame className="h-5 w-5 text-orange-500 mb-2" />
            <h3 className="font-medium">Burn-to-Lock</h3>
            <p className="text-sm text-muted-foreground">Supply burned from creator → deposited to LP Bank</p>
          </div>
          <div className="p-4 rounded-lg bg-secondary/30">
            <Shield className="h-5 w-5 text-primary mb-2" />
            <h3 className="font-medium">GYDS Backed</h3>
            <p className="text-sm text-muted-foreground">All tokens require mandatory GYDS liquidity</p>
          </div>
        </div>
      </GlassCard>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5" /> Create New Token
            </DialogTitle>
            <DialogDescription>Tokens are backed by GYDS with locked liquidity</DialogDescription>
          </DialogHeader>

          <div className="space-y-6 pt-4">
            <Accordion type="single" collapsible defaultValue="details">
              <AccordionItem value="details">
                <AccordionTrigger>
                  <div className="flex items-center gap-2"><Badge variant="outline">1</Badge> Token Details</div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-4">
                  {/* Logo Upload */}
                  <div className="space-y-2">
                    <Label>Token Logo</Label>
                    <div className="flex items-center gap-4">
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-20 h-20 rounded-xl border-2 border-dashed border-border hover:border-primary/50 cursor-pointer flex items-center justify-center overflow-hidden transition-colors bg-secondary/30"
                      >
                        {logoPreview ? (
                          <img src={logoPreview} alt="Logo" className="w-full h-full object-cover" />
                        ) : (
                          <div className="text-center">
                            <Upload className="h-5 w-5 mx-auto text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">Upload</span>
                          </div>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <p>PNG, JPG, or SVG</p>
                        <p>Max 2MB, square recommended</p>
                      </div>
                    </div>
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoSelect} className="hidden" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Token Name</Label>
                      <Input placeholder="My Token" value={params.name} onChange={(e) => setParams({ ...params, name: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Symbol</Label>
                      <Input placeholder="MTK" maxLength={8} value={params.symbol} onChange={(e) => setParams({ ...params, symbol: e.target.value.toUpperCase() })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Initial Supply</Label>
                      <Input type="number" value={params.initialSupply} onChange={(e) => setParams({ ...params, initialSupply: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Decimals</Label>
                      <Input type="number" min={0} max={18} value={params.decimals} onChange={(e) => setParams({ ...params, decimals: parseInt(e.target.value) })} />
                    </div>
                  </div>

                  {/* Description */}
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      placeholder="Describe your token, its purpose, and use cases..."
                      value={params.description}
                      onChange={(e) => setParams({ ...params, description: e.target.value })}
                      maxLength={2000}
                      rows={3}
                    />
                    <p className="text-xs text-muted-foreground">{params.description.length}/2000 characters</p>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Social Links & Website */}
              <AccordionItem value="socials">
                <AccordionTrigger>
                  <div className="flex items-center gap-2"><Badge variant="outline">2</Badge> Website & Socials</div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2"><Globe className="h-4 w-4" /> Website URL</Label>
                    <Input placeholder="https://mytoken.com" value={params.website} onChange={(e) => setParams({ ...params, website: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Twitter / X</Label>
                      <Input placeholder="https://x.com/mytoken" value={params.twitter} onChange={(e) => setParams({ ...params, twitter: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Telegram</Label>
                      <Input placeholder="https://t.me/mytoken" value={params.telegram} onChange={(e) => setParams({ ...params, telegram: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Facebook</Label>
                      <Input placeholder="https://facebook.com/mytoken" value={params.facebook} onChange={(e) => setParams({ ...params, facebook: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Discord</Label>
                      <Input placeholder="https://discord.gg/mytoken" value={params.discord} onChange={(e) => setParams({ ...params, discord: e.target.value })} />
                    </div>
                  </div>

                  {/* HTML Website Hosting */}
                  <div className="mt-4 p-4 rounded-lg border border-border/50 bg-secondary/20 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileCode className="h-4 w-4 text-primary" />
                        <div>
                          <p className="font-medium text-sm">Host a Website</p>
                          <p className="text-xs text-muted-foreground">Upload an HTML file (max {pricing.website_max_size_mb}MB) • {pricing.website_hosting_fee} GYDS</p>
                        </div>
                      </div>
                      <Switch checked={wantsHosting} onCheckedChange={setWantsHosting} />
                    </div>
                    
                    {wantsHosting && (
                      <div className="space-y-2">
                        <div
                          onClick={() => siteInputRef.current?.click()}
                          className="border-2 border-dashed border-border hover:border-primary/50 rounded-lg p-4 cursor-pointer text-center transition-colors"
                        >
                          {siteFile ? (
                            <div className="flex items-center justify-center gap-2">
                              <FileCode className="h-5 w-5 text-primary" />
                              <span className="text-sm font-medium">{siteFile.name}</span>
                              <Badge variant="secondary" className="text-xs">
                                {(siteFile.size / 1024 / 1024).toFixed(2)} MB
                              </Badge>
                            </div>
                          ) : (
                            <div>
                              <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                              <p className="text-sm text-muted-foreground">Click to upload .html file</p>
                              <p className="text-xs text-muted-foreground">Max {pricing.website_max_size_mb}MB</p>
                            </div>
                          )}
                        </div>
                        <input
                          ref={siteInputRef}
                          type="file"
                          accept=".html,.htm"
                          onChange={handleSiteSelect}
                          className="hidden"
                        />
                      </div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="limits">
                <AccordionTrigger>
                  <div className="flex items-center gap-2"><Badge variant="outline">3</Badge> Purchase Limits</div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-4">
                  <p className="text-sm text-muted-foreground">Set limits to prevent whale accumulation and ensure fair distribution.</p>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <ShoppingCart className="h-4 w-4" /> Max Buy Per Wallet
                      </Label>
                      <Input
                        type="number"
                        min={1}
                        value={params.maxBuyPerWallet}
                        onChange={(e) => setParams({ ...params, maxBuyPerWallet: e.target.value })}
                      />
                      <p className="text-xs text-muted-foreground">
                        Maximum tokens a single wallet can hold. Once reached, wallet cannot buy more.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" /> Daily Buy Limit
                      </Label>
                      <Input
                        type="number"
                        min={1}
                        value={params.dailyBuyLimit}
                        onChange={(e) => setParams({ ...params, dailyBuyLimit: e.target.value })}
                      />
                      <p className="text-xs text-muted-foreground">
                        Maximum tokens a wallet can purchase per day (24h rolling window).
                      </p>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-secondary/30 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Max wallet holding</span>
                      <span className="font-mono">{parseFloat(params.maxBuyPerWallet || '0').toLocaleString()} {params.symbol || 'TOKEN'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Daily limit</span>
                      <span className="font-mono">{parseFloat(params.dailyBuyLimit || '0').toLocaleString()} {params.symbol || 'TOKEN'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">% of supply (wallet)</span>
                      <span className="font-mono">
                        {((parseFloat(params.maxBuyPerWallet || '0') / parseFloat(params.initialSupply || '1')) * 100).toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="liquidity">
                <AccordionTrigger>
                  <div className="flex items-center gap-2"><Badge variant="outline">4</Badge> GYDS Liquidity</div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>GYDS Liquidity Amount</Label>
                    <Input type="number" min={pricing.min_liquidity} value={params.gydsLiquidity} onChange={(e) => setParams({ ...params, gydsLiquidity: e.target.value })} />
                    <p className="text-xs text-muted-foreground">Minimum {pricing.min_liquidity} GYDS required.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>LP Lock Type</Label>
                    <div className="flex gap-4">
                      <Button variant={params.lpLockType === 'burn' ? 'default' : 'outline'} size="sm" onClick={() => setParams({ ...params, lpLockType: 'burn' })} className="gap-2">
                        <Flame className="h-4 w-4" /> Burn LP (Permanent)
                      </Button>
                      <Button variant={params.lpLockType === 'timelock' ? 'default' : 'outline'} size="sm" onClick={() => setParams({ ...params, lpLockType: 'timelock' })} className="gap-2">
                        <Lock className="h-4 w-4" /> Time-Lock
                      </Button>
                    </div>
                  </div>
                  {params.lpLockType === 'timelock' && (
                    <div className="space-y-2">
                      <Label>Lock Duration (Days)</Label>
                      <Input type="number" min={30} value={params.timelockDays} onChange={(e) => setParams({ ...params, timelockDays: parseInt(e.target.value) })} />
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="authorities">
                <AccordionTrigger>
                  <div className="flex items-center gap-2"><Badge variant="outline">5</Badge> Authorities (Optional)</div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-4">
                  <p className="text-sm text-muted-foreground">Authorities can be renounced later. Extra GYDS fees apply.</p>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                      <div>
                        <p className="font-medium">Freeze Authority</p>
                        <p className="text-xs text-muted-foreground">Pause/unpause transfers • +{pricing.freeze_authority_fee} GYDS</p>
                      </div>
                      <Switch checked={params.authorities.freeze} onCheckedChange={(checked) => setParams({ ...params, authorities: { ...params.authorities, freeze: checked } })} />
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                      <div>
                        <p className="font-medium">Update Authority</p>
                        <p className="text-xs text-muted-foreground">Modify metadata • +{pricing.update_authority_fee} GYDS</p>
                      </div>
                      <Switch checked={params.authorities.update} onCheckedChange={(checked) => setParams({ ...params, authorities: { ...params.authorities, update: checked } })} />
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
                      <div>
                        <p className="font-medium flex items-center gap-2">Mint Authority <AlertTriangle className="h-3 w-3 text-amber-500" /></p>
                        <p className="text-xs text-muted-foreground">Create new tokens • +{pricing.mint_authority_fee} GYDS</p>
                      </div>
                      <Switch checked={params.authorities.mint} onCheckedChange={(checked) => setParams({ ...params, authorities: { ...params.authorities, mint: checked } })} />
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <GlassCard className="p-4">
              <h4 className="font-medium mb-3">Cost Summary</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Deployment Fee</span><span>{pricing.deployment_fee} GYDS</span></div>
                {params.authorities.freeze && <div className="flex justify-between"><span className="text-muted-foreground">Freeze Authority</span><span>{pricing.freeze_authority_fee} GYDS</span></div>}
                {params.authorities.update && <div className="flex justify-between"><span className="text-muted-foreground">Update Authority</span><span>{pricing.update_authority_fee} GYDS</span></div>}
                {params.authorities.mint && <div className="flex justify-between"><span className="text-muted-foreground">Mint Authority</span><span>{pricing.mint_authority_fee} GYDS</span></div>}
                {wantsHosting && siteFile && <div className="flex justify-between"><span className="text-muted-foreground">Website Hosting</span><span>{pricing.website_hosting_fee} GYDS</span></div>}
                <div className="flex justify-between"><span className="text-muted-foreground">LP Liquidity</span><span>{params.gydsLiquidity} GYDS</span></div>
                <div className="border-t pt-2 flex justify-between font-bold"><span>Total Required</span><span className="text-primary">{calculateTotalGyds().toLocaleString()} GYDS</span></div>
              </div>
            </GlassCard>

            <Button onClick={handleCreateToken} disabled={creating || !params.name || !params.symbol} className="w-full gap-2">
              {creating ? (<><Loader2 className="h-4 w-4 animate-spin" /> Creating Token...</>) : (<><CheckCircle className="h-4 w-4" /> Create {params.symbol || 'Token'}</>)}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
