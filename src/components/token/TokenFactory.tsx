import { useState, useRef, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { prepareGrc20Deployment, submitGrc20Deployment } from '@/lib/tokenDeployment';
import {
  Coins, Plus, Lock, Flame, Shield, AlertTriangle, Loader2, CheckCircle, Upload, ShoppingCart, Rocket, Info
} from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import {
  ALL_AUTHORITIES,
  AuthorityKey,
  TokenFactoryPricing,
  DEFAULT_PRICING,
  normalizePricing,
} from '@/lib/tokenAuthorities';

// ── Token standards supported on GYDSchain ───────────────────────────────────
export const TOKEN_STANDARDS = [
  {
    value: 'GRC-20',
    label: 'GRC-20 — Fungible Token',
    description: 'Divisible, interchangeable tokens. Use for currencies, utility tokens, governance tokens, meme coins, and stablecoins. Equivalent to ERC-20 on Ethereum.',
    decimalsDefault: 18,
    supplyEditable: true,
    use_cases: ['Utility', 'Governance', 'Meme', 'Stablecoin', 'Reward'],
  },
  {
    value: 'GRC-721',
    label: 'GRC-721 — Non-Fungible Token (NFT)',
    description: 'Unique, indivisible tokens. Each token has a distinct ID. Use for digital art, collectibles, gaming items, and certificates. Equivalent to ERC-721.',
    decimalsDefault: 0,
    supplyEditable: true,
    use_cases: ['Art', 'Collectibles', 'Gaming', 'Identity', 'Certificates'],
  },
  {
    value: 'GRC-1155',
    label: 'GRC-1155 — Multi-Token Standard',
    description: 'Batch-mint both fungible and non-fungible tokens in a single contract. Efficient for gaming assets, bundles, and mixed portfolios. Equivalent to ERC-1155.',
    decimalsDefault: 0,
    supplyEditable: true,
    use_cases: ['Gaming', 'Bundles', 'Mixed assets', 'Marketplaces'],
  },
] as const;

export type TokenStandardValue = typeof TOKEN_STANDARDS[number]['value'];

interface TokenCreationParams {
  name: string;
  symbol: string;
  decimals: number;
  initialSupply: string;
  tokenStandard: TokenStandardValue;
  gydsLiquidity: string;
  authorities: Partial<Record<AuthorityKey, boolean>>;
  transferFeeBps: string; // for transfer_fee authority
  lpLockType: 'burn' | 'timelock';
  timelockDays: number;
  maxBuyPerWallet: string;
  dailyBuyLimit: string;
}

export const TokenFactory = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [pricing, setPricing] = useState<TokenFactoryPricing>(DEFAULT_PRICING);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [params, setParams] = useState<TokenCreationParams>({
    name: '', symbol: '', decimals: 18, initialSupply: '1000000',
    tokenStandard: 'GRC-20',
    gydsLiquidity: '1000',
    authorities: {},
    transferFeeBps: '0',
    lpLockType: 'burn', timelockDays: 365,
    maxBuyPerWallet: '10000',
    dailyBuyLimit: '5000',
  });

  const selectedStandard = TOKEN_STANDARDS.find(s => s.value === params.tokenStandard) ?? TOKEN_STANDARDS[0];

  // Load the configured factory estimate.
  useEffect(() => {
    const loadData = async () => {
      const row = await api.get('/api/config/token_factory_pricing').catch(() => null);
      setPricing(normalizePricing(row?.configValue));
    };
    loadData();
  }, []);

  // Authorities the admin currently lets users enable
  const enabledAuthorities = ALL_AUTHORITIES.filter((a) => pricing.authorities[a.key]?.enabled);

  const calculateAuthorityFees = () =>
    enabledAuthorities
      .filter((a) => params.authorities[a.key])
      .reduce((sum, a) => sum + (pricing.authorities[a.key].fee || 0), 0);

  const calculateTotalFees = () => pricing.deployment_fee + calculateAuthorityFees();
  const calculateTotalGyds = () => calculateTotalFees() + parseFloat(params.gydsLiquidity || '0');

  const toggleAuthority = (key: AuthorityKey, value: boolean) =>
    setParams({ ...params, authorities: { ...params.authorities, [key]: value } });

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'Logo must be under 2MB', variant: 'destructive' });
      return;
    }
    setLogoFile(file);
    // Convert to data URL so no server upload is needed
    const reader = new FileReader();
    reader.onload = () => setLogoPreview(reader.result as string);
    reader.readAsDataURL(file);
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
    if (params.tokenStandard !== 'GRC-20') {
      toast({ title: 'Only GRC-20 can be deployed on-chain right now', variant: 'destructive' });
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
    let deployedContract: Awaited<ReturnType<typeof submitGrc20Deployment>> | null = null;
    try {
      const logoUrl: string | null = logoPreview ?? null;
      const prepared = await prepareGrc20Deployment({
        name: params.name,
        symbol: params.symbol,
        decimals: params.decimals,
        initialSupply: params.initialSupply,
        mintEnabled: !!params.authorities.mint,
      });
      deployedContract = await submitGrc20Deployment(prepared, () => {});
      const walletAddr = deployedContract.creatorWallet;
      const tokenAddress = deployedContract.contractAddress;
      await api.post('/api/tokens', {
        creatorId: user.id,
        name: params.name,
        symbol: deployedContract.symbol,
        decimals: deployedContract.decimals,
        totalSupply: deployedContract.initialSupply,
        tokenStandard: 'GRC-20',
        gydsLiquidity: 0,
        logoUrl,
        lpLockType: 'not_created',
        lpUnlockTime: null,
        freezeEnabled: false,
        updateEnabled: false,
        mintEnabled: deployedContract.mintEnabled,
        address: tokenAddress,
        creatorWallet: walletAddr,
        initialSupplyBaseUnits: deployedContract.initialSupplyBaseUnits,
        deploymentTxHash: deployedContract.deploymentTxHash,
        deploymentChainId: deployedContract.chainId,
        deploymentBlockNumber: deployedContract.deploymentBlockNumber,
        deploymentStatus: 'confirmed',
      });

      // Store purchase limits in admin_config keyed by token address
      await api.post('/api/config', {
        key: `token_limits_${tokenAddress}`,
        value: {
          max_buy_per_wallet: maxBuy,
          daily_buy_limit: dailyLimit,
        },
      });

      toast({
        title: 'Token deployed on GYDS mainnet',
        description: `${deployedContract.symbol} supply was verified from the deployed contract.`,
      });
      setDialogOpen(false);
      resetForm();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error while deploying token.';
      toast({
        title: deployedContract ? 'Token deployed; listing save failed' : 'Token deployment failed',
        description: deployedContract
          ? `${message} Contract: ${deployedContract.contractAddress}. Transaction: ${deployedContract.deploymentTxHash}`
          : message,
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const resetForm = () => {
    setParams({
      name: '', symbol: '', decimals: 18, initialSupply: '1000000',
      tokenStandard: 'GRC-20',
      gydsLiquidity: '1000',
      authorities: {},
      transferFeeBps: '0',
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
              <p className="text-sm text-muted-foreground">Deploy GRC-20 tokens on GYDS mainnet</p>
            </div>
          </div>
          <Button onClick={() => setDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Create Token
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-secondary/30">
            <Coins className="h-5 w-5 text-primary mb-2" />
            <h3 className="font-medium">On-chain Supply</h3>
            <p className="text-sm text-muted-foreground">Wallets read supply directly from the deployed contract</p>
          </div>
          <div className="p-4 rounded-lg bg-secondary/30">
            <Shield className="h-5 w-5 text-primary mb-2" />
            <h3 className="font-medium">Mainnet Deployment</h3>
            <p className="text-sm text-muted-foreground">Your connected wallet deploys the GRC-20 contract</p>
          </div>
          <div className="p-4 rounded-lg bg-secondary/30">
            <Rocket className="h-5 w-5 text-primary mb-2" />
            <h3 className="font-medium">Trading Unlock</h3>
            <p className="text-sm text-muted-foreground">$10,000 market cap measured by a 30-minute on-chain average</p>
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
                  {/* Token Standard */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      Token Standard
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs text-xs">
                            <p className="font-semibold mb-1">GYDSchain Token Standards</p>
                            <p><strong>GRC-20</strong> — Fungible (currencies, utility, meme)</p>
                            <p><strong>GRC-721</strong> — Non-fungible / NFT (art, collectibles)</p>
                            <p><strong>GRC-1155</strong> — Multi-token (gaming, bundles)</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </Label>
                    <Select
                      value={params.tokenStandard}
                      onValueChange={(v: TokenStandardValue) => {
                        const std = TOKEN_STANDARDS.find(s => s.value === v)!;
                        setParams({
                          ...params,
                          tokenStandard: v,
                          decimals: std.decimalsDefault,
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TOKEN_STANDARDS.map(s => (
                          <SelectItem key={s.value} value={s.value} disabled={s.value !== 'GRC-20'}>
                            <span className="font-medium">
                              {s.label}{s.value !== 'GRC-20' ? ' — not deployable yet' : ''}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="rounded-lg bg-secondary/40 border border-border/50 p-3 text-xs text-muted-foreground space-y-1">
                      <p>{selectedStandard.description}</p>
                      <p className="flex flex-wrap gap-1 pt-1">
                        {selectedStandard.use_cases.map(uc => (
                          <span key={uc} className="bg-primary/10 text-primary rounded px-1.5 py-0.5">{uc}</span>
                        ))}
                      </p>
                    </div>
                  </div>

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
                      <Label>Initial Mint Supply</Label>
                      <Input type="number" value={params.initialSupply} onChange={(e) => setParams({ ...params, initialSupply: e.target.value })} />
                      <p className="text-xs text-muted-foreground">
                        This sets the initial on-chain mint. Circulating supply is read automatically from the contract.
                      </p>
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
                    <Label>Planned GYDS Liquidity Amount</Label>
                    <Input type="number" min={pricing.min_liquidity} value={params.gydsLiquidity} onChange={(e) => setParams({ ...params, gydsLiquidity: e.target.value })} />
                    <p className="text-xs text-muted-foreground">
                      Informational only: this form does not transfer GYDS or add a liquidity pool.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Liquidity Pool Lock</Label>
                    <p className="text-xs text-muted-foreground">
                      Unavailable until the DEX is deployed. No LP tokens are created or locked by this form.
                    </p>
                    <div className="flex gap-4">
                      <Button disabled variant={params.lpLockType === 'burn' ? 'default' : 'outline'} size="sm" onClick={() => setParams({ ...params, lpLockType: 'burn' })} className="gap-2">
                        <Flame className="h-4 w-4" /> Burn LP (Permanent)
                      </Button>
                      <Button disabled variant={params.lpLockType === 'timelock' ? 'default' : 'outline'} size="sm" onClick={() => setParams({ ...params, lpLockType: 'timelock' })} className="gap-2">
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
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">4</Badge> Authorities (Optional)
                    <Badge variant="outline" className="ml-2">{enabledAuthorities.length} available</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-4">
                  <p className="text-sm text-muted-foreground">
                    Only mint authority is currently supported by the deployed GRC-20 contract. Other authority options are unavailable on-chain.
                  </p>
                  {enabledAuthorities.length === 0 ? (
                    <div className="p-4 rounded-lg bg-secondary/30 text-sm text-muted-foreground text-center">
                      The admin has not enabled any optional authorities. Your token will launch with no extra authorities.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {enabledAuthorities.map((a) => {
                        const fee = pricing.authorities[a.key].fee;
                        const isOn = !!params.authorities[a.key];
                        return (
                          <div
                            key={a.key}
                            className={`p-3 rounded-lg ${a.warning ? 'border border-amber-500/30 bg-amber-500/5' : 'bg-secondary/30'}`}
                            data-testid={`authority-row-${a.key}`}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium flex items-center gap-2">
                                  {a.label}
                                  {a.warning && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                                </p>
                                <p className="text-xs text-muted-foreground">{a.description} • +{fee} GYDS</p>
                                {a.warning && <p className="text-xs text-amber-500/80 mt-1">{a.warning}</p>}
                              </div>
                              <Switch
                                data-testid={`switch-authority-${a.key}`}
                                checked={isOn}
                                onCheckedChange={(v) => toggleAuthority(a.key, v)}
                                disabled={a.key !== 'mint'}
                              />
                            </div>
                            {a.key === 'transfer_fee' && isOn && (
                              <div className="mt-3 space-y-1">
                                <Label className="text-xs">Fee in basis points (100 bps = 1%)</Label>
                                <Input
                                  data-testid="input-transfer-fee-bps"
                                  type="number" min={0} max={10000}
                                  value={params.transferFeeBps}
                                  onChange={(e) => setParams({ ...params, transferFeeBps: e.target.value })}
                                  placeholder="0"
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <div className="flex items-center gap-2 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
              <Rocket className="h-4 w-4 text-amber-500 shrink-0" />
              <p className="text-xs text-muted-foreground">
                Tokens are deployed to <span className="font-semibold text-emerald-400">GYDS MAINNET</span>.
                Circulating supply is read from the token contract automatically; it is not entered manually.
                Other-coin swaps unlock at $10,000 using circulating supply × a 30-minute on-chain price average.
                The DEX and WGYDS/USDT reference pool must be deployed and funded first.
              </p>
            </div>

            <GlassCard className="p-4">
              <h4 className="font-medium mb-3">Configured Amounts</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Deployment Fee</span><span>{pricing.deployment_fee} GYDS</span></div>
                {enabledAuthorities.filter((a) => params.authorities[a.key]).map((a) => (
                  <div key={a.key} className="flex justify-between">
                    <span className="text-muted-foreground">{a.label}</span>
                    <span>{pricing.authorities[a.key].fee} GYDS</span>
                  </div>
                ))}
                <div className="flex justify-between"><span className="text-muted-foreground">LP Liquidity</span><span>{params.gydsLiquidity} GYDS</span></div>
                <div className="border-t pt-2 flex justify-between font-bold"><span>Configured Total</span><span className="text-primary" data-testid="text-total-gyds">{calculateTotalGyds().toLocaleString()} GYDS</span></div>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                These are saved settings only. This form does not charge GYDS or seed liquidity; your connected wallet pays mainnet deployment gas.
              </p>
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
