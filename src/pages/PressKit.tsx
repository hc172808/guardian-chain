import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Download, Copy, ExternalLink, Palette, Blocks, FileText, Image } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Layout } from '@/components/layout/Layout';

const BRAND_COLORS = [
  { name: 'Primary Purple', hex: '#8b5cf6', var: '--primary', usage: 'Primary buttons, links, highlights' },
  { name: 'Neon Emerald', hex: '#10b981', var: '--neon-emerald', usage: 'Success states, live indicators' },
  { name: 'Neon Amber', hex: '#f59e0b', var: '--neon-amber', usage: 'Warnings, pending states' },
  { name: 'Background', hex: '#0a0a0f', var: '--background', usage: 'Page backgrounds' },
  { name: 'Card', hex: '#12121a', var: '--card', usage: 'Card surfaces, modals' },
  { name: 'Muted', hex: '#6b7280', var: '--muted-foreground', usage: 'Secondary text, labels' },
];

const CHAIN_STATS = [
  { label: 'Chain Name', value: 'GYDSchain' },
  { label: 'Token Symbol', value: 'GYDS' },
  { label: 'Chain ID', value: '13370' },
  { label: 'RPC URL', value: 'https://rpc.netlifegy.com' },
  { label: 'Explorer', value: 'https://explorer.netlifegy.com' },
  { label: 'Consensus', value: 'Proof of Stake (PoS)' },
  { label: 'Block Time', value: '~120 seconds (2 min)' },
  { label: 'Max TPS', value: '3,000+' },
  { label: 'Total Supply', value: '1,000,000,000 GYDS' },
  { label: 'Native Currency', value: 'GYDS (18 decimals)' },
  { label: 'EVM Compatible', value: 'Yes (Chain ID 13370)' },
  { label: 'Genesis Date', value: 'TBD (Mainnet)' },
];

const LOGOS = [
  { name: 'Primary Logo (Dark BG)', format: 'SVG + PNG', size: '512×512', tag: 'Recommended' },
  { name: 'Primary Logo (Light BG)', format: 'SVG + PNG', size: '512×512', tag: '' },
  { name: 'Horizontal Lockup', format: 'SVG + PNG', size: '1200×400', tag: '' },
  { name: 'Icon Only', format: 'SVG + ICO + PNG', size: '256×256, 128×128, 64×64, 32×32', tag: '' },
  { name: 'Wordmark', format: 'SVG + PNG', size: '800×200', tag: '' },
  { name: 'Token Badge', format: 'SVG + PNG', size: '256×256', tag: 'Exchanges' },
];

const BOILERPLATE = `GYDSchain is a high-performance Layer-1 blockchain designed for the next generation of decentralized finance. Built on a Proof-of-Stake consensus mechanism with ~120-second block time (designed for double-spend prevention) and 3,000+ TPS capacity, GYDSchain provides a full DeFi ecosystem including an AMM DEX (GYDSwap), LP farming, cross-chain bridge (25+ networks), NFT marketplace, token launchpad, and on-chain governance — all accessible through a unified dashboard at netlifegy.com.

Chain ID: 13370 | RPC: rpc.netlifegy.com | Explorer: explorer.netlifegy.com`;

const PressKit = () => {
  const { toast } = useToast();

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied!` });
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-8">
        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-xl bg-primary/20">
              <FileText className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-black">Press Kit</h1>
              <p className="text-sm text-muted-foreground">Brand assets, chain stats, and boilerplate for media &amp; partners</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="gap-2">
              <Download className="w-3.5 h-3.5" /> Download Full Press Kit (.zip)
            </Button>
            <Button size="sm" variant="outline" className="gap-2" onClick={() => copy(BOILERPLATE, 'Boilerplate')}>
              <Copy className="w-3.5 h-3.5" /> Copy Boilerplate
            </Button>
          </div>
        </div>

        {/* Chain Stats */}
        <GlassCard className="p-6 space-y-4">
          <h2 className="font-bold text-lg flex items-center gap-2">
            <Blocks className="w-5 h-5 text-primary" /> Chain Facts
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CHAIN_STATS.map(s => (
              <div key={s.label} className="flex items-center justify-between p-3 rounded-xl bg-secondary/20 border border-border/30 gap-4">
                <span className="text-sm text-muted-foreground flex-shrink-0">{s.label}</span>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium font-mono text-right truncate">{s.value}</span>
                  <button onClick={() => copy(s.value, s.label)} className="flex-shrink-0 text-muted-foreground hover:text-primary transition-colors">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Brand Colors */}
        <GlassCard className="p-6 space-y-4">
          <h2 className="font-bold text-lg flex items-center gap-2">
            <Palette className="w-5 h-5 text-primary" /> Brand Colors
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {BRAND_COLORS.map(c => (
              <div key={c.hex} className="p-4 rounded-xl border border-border/30 bg-secondary/10 space-y-3">
                <div className="w-full h-12 rounded-lg border border-border/20" style={{ background: c.hex }} />
                <div>
                  <p className="font-medium text-sm">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.usage}</p>
                </div>
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono bg-secondary/50 px-2 py-0.5 rounded">{c.hex}</code>
                  <button onClick={() => copy(c.hex, c.name)} className="text-muted-foreground hover:text-primary transition-colors ml-auto">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Typography */}
        <GlassCard className="p-6 space-y-4">
          <h2 className="font-bold text-lg">Typography</h2>
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-secondary/20 border border-border/30">
              <p className="text-xs text-muted-foreground mb-2">Primary Font</p>
              <p className="text-3xl font-black">GYDSchain</p>
              <p className="text-sm text-muted-foreground mt-1">Inter — Black (900) for headings</p>
            </div>
            <div className="p-4 rounded-xl bg-secondary/20 border border-border/30">
              <p className="text-xs text-muted-foreground mb-2">Monospace / Code</p>
              <p className="text-xl font-mono">0x1337...GYDS</p>
              <p className="text-sm text-muted-foreground mt-1">JetBrains Mono — addresses, hashes, numbers</p>
            </div>
          </div>
        </GlassCard>

        {/* Logo Assets */}
        <GlassCard className="p-6 space-y-4">
          <h2 className="font-bold text-lg flex items-center gap-2">
            <Image className="w-5 h-5 text-primary" /> Logo Assets
          </h2>
          <p className="text-sm text-muted-foreground">Logo files will be available in the full press kit ZIP. Please use official assets only — do not distort, recolor, or modify the logo.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {LOGOS.map(logo => (
              <div key={logo.name} className="flex items-center justify-between p-4 rounded-xl bg-secondary/20 border border-border/30 gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{logo.name}</p>
                    {logo.tag && <Badge variant="outline" className="text-xs">{logo.tag}</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{logo.format} • {logo.size}</p>
                </div>
                <Button size="sm" variant="outline" className="gap-1 flex-shrink-0 h-7 text-xs">
                  <Download className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Boilerplate */}
        <GlassCard className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-lg">Company Boilerplate</h2>
            <Button size="sm" variant="outline" className="gap-2 h-7 text-xs" onClick={() => copy(BOILERPLATE, 'Boilerplate')}>
              <Copy className="w-3 h-3" /> Copy
            </Button>
          </div>
          <div className="p-4 rounded-xl bg-secondary/20 border border-border/30">
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{BOILERPLATE}</p>
          </div>
        </GlassCard>

        {/* Usage Guidelines */}
        <GlassCard className="p-6 space-y-3">
          <h2 className="font-bold text-lg">Usage Guidelines</h2>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">✅ Use official logos from this press kit without modification.</li>
            <li className="flex items-start gap-2">✅ Refer to the chain as "GYDSchain" (one word, capital G and C).</li>
            <li className="flex items-start gap-2">✅ Use "GYDS" as the token ticker symbol in all caps.</li>
            <li className="flex items-start gap-2">❌ Do not use the logo on similarly colored backgrounds without sufficient contrast.</li>
            <li className="flex items-start gap-2">❌ Do not imply official partnership or endorsement without written permission.</li>
            <li className="flex items-start gap-2">❌ Do not modify logo colors, proportions, or add effects.</li>
          </ul>
          <div className="pt-2">
            <p className="text-xs text-muted-foreground">For press inquiries: <a href="mailto:press@netlifegy.com" className="text-primary hover:underline">press@netlifegy.com</a></p>
          </div>
        </GlassCard>
      </div>
    </Layout>
  );
};

export default PressKit;
