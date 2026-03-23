import { useState, useRef, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useWalletConnect } from '@/hooks/useWalletConnect';
import { getUserAddresses, computeUserBalances } from '@/lib/balances';
import { 
  Coins, Plus, Lock, Flame, Shield, AlertTriangle, Loader2, CheckCircle, Upload, ShoppingCart, Wallet
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
}

interface AdminPricing {
  deployment_fee: number;
  freeze_authority_fee: number;
  update_authority_fee: number;
  mint_authority_fee: number;
  min_liquidity: number;
}

const DEFAULT_PRICING: AdminPricing = {
  deployment_fee: 100,
  freeze_authority_fee: 50,
  update_authority_fee: 25,
  mint_authority_fee: 200,
  min_liquidity: 100,
};

export const TokenFactory = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { address } = useWalletConnect();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [pricing, setPricing] = useState<AdminPricing>(DEFAULT_PRICING);
  const [userGydsBalance, setUserGydsBalance] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [params, setParams] = useState<TokenCreationParams>({
    name: '', symbol: '', decimals: 18, initialSupply: '1000000',
    gydsLiquidity: '1000',
    authorities: { freeze: false, update: false, mint: false },
    lpLockType: 'burn', timelockDays: 365,
    maxBuyPerWallet: '10000',
    dailyBuyLimit: '5000',
  });

  // Load admin pricing and user GYDS balance
  useEffect(() => {
    const loadData = async () => {
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
        });
      }

      if (user) {
        const myAddresses = await getUserAddresses(user.id, address ?? undefined, user.email ?? undefined);
        const { gydsBalance } = await computeUserBalances(user.id, myAddresses);
        setUserGydsBalance(gydsBalance);
      }
    };
    loadData();
  }, [user, address]);

  const calculateTotalFees = () => {
    let total = pricing.deployment_fee;
    if (params.authorities.freeze) total += pricing.freeze_authority_fee;
    if (params.authorities.update) total += pricing.update_authority_fee;
    if (params.authorities.mint) total += pricing.mint_authority_fee;
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

    // Check GYDS balance
    const totalRequired = calculateTotalGyds();
    if (userGydsBalance < totalRequired) {
      toast({
        title: 'Insufficient GYDS Balance',
        description: `You need ${totalRequired.toLocaleString()} GYDS but only have ${userGydsBalance.toLocaleString()} GYDS. Ask an admin to mint GYDS to your wallet.`,
        variant: 'destructive',
      });
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

      const tokenAddress = '0x' + Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
      const walletAddr = address || `user:${user.id}`;

      const { data: newToken, error } = await supabase.from('tokens').insert({
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
        address: tokenAddress,
      }).select('id').single();

      if (error) throw error;

      const tokenId = newToken?.id;

      // Deduct GYDS fee (record as burn operation)
      await supabase.from('token_operations').insert({
        operation_type: 'burn',
        wallet_address: walletAddr.toLowerCase(),
        amount: totalRequired,
        tx_hash: '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
        status: 'confirmed',
        created_by: user.id,
        usdt_amount: 0,
      });

      // Set creator as first holder with full initial supply
      if (tokenId) {
        await supabase.from('admin_config').upsert({
          config_key: `token_holders_${tokenId}`,
          config_value: {
            count: 1,
            holders: [{ address: walletAddr, amount: parseFloat(params.initialSupply), label: 'Creator' }],
          } as any,
          updated_by: user.id,
        }, { onConflict: 'config_key' });
      }

      // Store purchase limits in admin_config keyed by token address
      await supabase.from('admin_config').upsert({
        config_key: `token_limits_${tokenAddress}`,
        config_value: {
          max_buy_per_wallet: maxBuy,
          daily_buy_limit: dailyLimit,
        } as any,
        updated_by: user.id,
      }, { onConflict: 'config_key' });

      // Refresh balance
      const myAddresses = await getUserAddresses(user.id, address ?? undefined, user.email ?? undefined);
      const { gydsBalance } = await computeUserBalances(user.id, myAddresses);
      setUserGydsBalance(gydsBalance);

      toast({ title: 'Token Created!', description: `${params.name} (${params.symbol}) is now live. You are the first holder with ${parseFloat(params.initialSupply).toLocaleString()} ${params.symbol}.` });
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
    });
    setLogoFile(null);
    setLogoPreview(null);
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
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="limits">
                <AccordionTrigger>
                  <div className="flex items-center gap-2"><Badge variant="outline">2</Badge> Purchase Limits</div>
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

                  {/* Preview */}
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
                  <div className="flex items-center gap-2"><Badge variant="outline">3</Badge> GYDS Liquidity</div>
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
                  <div className="flex items-center gap-2"><Badge variant="outline">4</Badge> Authorities (Optional)</div>
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
