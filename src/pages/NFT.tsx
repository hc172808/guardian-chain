import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '@/components/layout/Layout';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  Image, TrendingUp, Star, Plus, Search, Grid3X3, List,
  Zap, Tag, RefreshCw, Award, TrendingDown, Gavel, X,
  Package, Layers, Lock, Tag as TagIcon, ArrowUpRight, Shield
} from 'lucide-react';

interface NFTToken {
  id: string;
  name: string;
  collection_id: string;
  collection_name: string;
  token_id: number;
  owner_address: string;
  price: string;
  last_sale: string;
  rarity: string;
  image_emoji: string;
  listed: boolean;
  metadata: { description?: string; royaltyPercent?: number; attributes?: Record<string, string> };
}

interface NFTCollection {
  id: string;
  name: string;
  symbol: string;
  description: string;
  floor_price: string;
  volume_24h: string;
  change_24h: string;
  total_items: number;
  image_emoji: string;
}

const RARITY_COLOR: Record<string, string> = {
  Legendary: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  Epic:      'text-purple-400 border-purple-500/30 bg-purple-500/10',
  Rare:      'text-blue-400 border-blue-500/30 bg-blue-500/10',
  Common:    'text-muted-foreground border-border/40 bg-muted/20',
};

const RARITY_RANK = { Legendary: 4, Epic: 3, Rare: 2, Common: 1 };

const EMOJIS = ['🎨', '🌟', '🔮', '💎', '🚀', '🌈', '⚡', '🔥', '🌊', '🎭', '🦋', '🐉', '🏆', '🎯', '🌙'];

interface BatchItem {
  name: string;
  rarity: string;
  imageEmoji: string;
}

const NFTPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tokens, setTokens] = useState<NFTToken[]>([]);
  const [myTokens, setMyTokens] = useState<NFTToken[]>([]);
  const [collections, setCollections] = useState<NFTCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [selectedNFT, setSelectedNFT] = useState<NFTToken | null>(null);
  const [listingNFT, setListingNFT] = useState<NFTToken | null>(null);
  const [listPrice, setListPrice] = useState('100000');
  const [filterCollection, setFilterCollection] = useState('');
  const [filterRarity, setFilterRarity] = useState('');
  const [buyingId, setBuyingId] = useState<string | null>(null);

  // Single mint state
  const [minting, setMinting] = useState(false);
  const [mintName, setMintName] = useState('');
  const [mintDescription, setMintDescription] = useState('');
  const [mintRarity, setMintRarity] = useState('Common');
  const [mintEmoji, setMintEmoji] = useState('🎨');
  const [mintCollection, setMintCollection] = useState('');
  const [mintRoyalty, setMintRoyalty] = useState(5);
  const [mintAttrKey, setMintAttrKey] = useState('');
  const [mintAttrVal, setMintAttrVal] = useState('');
  const [mintAttrs, setMintAttrs] = useState<Record<string, string>>({});

  // Batch mint state
  const [batchItems, setBatchItems] = useState<BatchItem[]>([{ name: '', rarity: 'Common', imageEmoji: '🎨' }]);
  const [batchCollection, setBatchCollection] = useState('');
  const [batchMinting, setBatchMinting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [colRes, tokRes] = await Promise.all([
        fetch('/api/nft/collections'),
        fetch('/api/nft/tokens'),
      ]);
      if (colRes.ok) {
        const cols = await colRes.json();
        setCollections(cols);
        if (cols.length > 0) {
          setMintCollection(prev => prev || cols[0].id);
          setBatchCollection(prev => prev || cols[0].id);
        }
      }
      if (tokRes.ok) setTokens(await tokRes.json());
    } finally { setLoading(false); }
  }, []);

  const fetchMyTokens = useCallback(async () => {
    if (!user) return;
    const res = await fetch('/api/nft/my-tokens', { credentials: 'include' });
    if (res.ok) setMyTokens(await res.json());
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchMyTokens(); }, [fetchMyTokens]);

  const filtered = tokens.filter(n => {
    const q = search.toLowerCase();
    const matchSearch = !search || n.name.toLowerCase().includes(q) || n.collection_name.toLowerCase().includes(q);
    const matchCol = !filterCollection || n.collection_id === filterCollection;
    const matchRarity = !filterRarity || n.rarity === filterRarity;
    return matchSearch && matchCol && matchRarity;
  });

  const totalVolume = collections.reduce((a, c) => a + Number(c.volume_24h), 0);
  const avgFloor = collections.length ? collections.reduce((a, c) => a + Number(c.floor_price), 0) / collections.length : 0;

  const handleBuy = async (nft: NFTToken) => {
    if (!user) { toast({ title: 'Sign in to buy', variant: 'destructive' }); return; }
    setBuyingId(nft.id);
    try {
      const res = await fetch(`/api/nft/buy/${nft.id}`, { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: `🎉 Purchased ${nft.name}!`, description: `${Number(nft.price).toLocaleString()} GYDS` });
      setSelectedNFT(null);
      fetchData();
      fetchMyTokens();
    } catch (e: any) {
      toast({ title: 'Purchase failed', description: e.message, variant: 'destructive' });
    } finally { setBuyingId(null); }
  };

  const handleList = async () => {
    if (!listingNFT) return;
    const price = Number(listPrice);
    if (!price || price <= 0) { toast({ title: 'Enter a valid price', variant: 'destructive' }); return; }
    try {
      const res = await fetch(`/api/nft/list/${listingNFT.id}`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: `📋 ${listingNFT.name} listed!`, description: `Listed for ${price.toLocaleString()} GYDS` });
      setListingNFT(null);
      fetchData();
      fetchMyTokens();
    } catch (e: any) {
      toast({ title: 'Listing failed', description: e.message, variant: 'destructive' });
    }
  };

  const handleDelist = async (nft: NFTToken) => {
    try {
      const res = await fetch(`/api/nft/delist/${nft.id}`, { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: `${nft.name} delisted` });
      fetchData();
      fetchMyTokens();
    } catch (e: any) {
      toast({ title: 'Delist failed', description: e.message, variant: 'destructive' });
    }
  };

  const handleMint = async () => {
    if (!user) { toast({ title: 'Sign in to mint', variant: 'destructive' }); return; }
    if (!mintName.trim()) { toast({ title: 'NFT name required', variant: 'destructive' }); return; }
    setMinting(true);
    try {
      const res = await fetch('/api/nft/mint', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: mintName.trim(),
          collectionId: mintCollection,
          rarity: mintRarity,
          imageEmoji: mintEmoji,
          description: mintDescription.trim(),
          royaltyPercent: mintRoyalty,
          attributes: mintAttrs,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: '🎨 NFT Minted!', description: `${mintName} has been minted on GYDSchain.` });
      setMintName('');
      setMintDescription('');
      setMintAttrs({});
      fetchData();
      fetchMyTokens();
    } catch (e: any) {
      toast({ title: 'Mint failed', description: e.message, variant: 'destructive' });
    } finally { setMinting(false); }
  };

  const handleBatchMint = async () => {
    if (!user) { toast({ title: 'Sign in to mint', variant: 'destructive' }); return; }
    const valid = batchItems.filter(i => i.name.trim());
    if (!valid.length) { toast({ title: 'At least one NFT name required', variant: 'destructive' }); return; }
    setBatchMinting(true);
    try {
      const res = await fetch('/api/nft/batch-mint', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: valid.map(i => ({ ...i, collectionId: batchCollection })) }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: `🎨 ${valid.length} NFTs Minted!`, description: 'Your batch has been minted on GYDSchain.' });
      setBatchItems([{ name: '', rarity: 'Common', imageEmoji: '🎨' }]);
      fetchData();
      fetchMyTokens();
    } catch (e: any) {
      toast({ title: 'Batch mint failed', description: e.message, variant: 'destructive' });
    } finally { setBatchMinting(false); }
  };

  const addAttr = () => {
    if (!mintAttrKey.trim() || !mintAttrVal.trim()) return;
    setMintAttrs(prev => ({ ...prev, [mintAttrKey.trim()]: mintAttrVal.trim() }));
    setMintAttrKey('');
    setMintAttrVal('');
  };

  const sortedCollections = [...collections].sort((a, b) => {
    const rankA = tokens.filter(t => t.collection_id === a.id).reduce((s, t) => s + (RARITY_RANK[t.rarity as keyof typeof RARITY_RANK] ?? 1), 0);
    const rankB = tokens.filter(t => t.collection_id === b.id).reduce((s, t) => s + (RARITY_RANK[t.rarity as keyof typeof RARITY_RANK] ?? 1), 0);
    return rankB - rankA;
  });

  return (
    <Layout>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Image className="w-6 h-6 text-primary" /> NFT Marketplace
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Discover, trade and mint NFTs on GYDSchain</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => { fetchData(); fetchMyTokens(); }} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Volume', value: `${(totalVolume / 1000).toFixed(0)}K GYDS`, icon: TrendingUp },
            { label: 'Collections',  value: collections.length, icon: Grid3X3 },
            { label: 'NFTs Listed',  value: tokens.length, icon: Tag },
            { label: 'Avg Floor',    value: `${(avgFloor / 1000).toFixed(0)}K GYDS`, icon: Award },
          ].map(s => (
            <GlassCard key={s.label} className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <s.icon className="w-4 h-4 text-primary" />
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
              <p className="text-xl font-bold">{s.value}</p>
            </GlassCard>
          ))}
        </div>

        <Tabs defaultValue="marketplace">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="marketplace">Marketplace</TabsTrigger>
            <TabsTrigger value="collections">Collections</TabsTrigger>
            <TabsTrigger value="mint">Mint</TabsTrigger>
            <TabsTrigger value="batch-mint">Batch Mint</TabsTrigger>
            <TabsTrigger value="my-nfts">My NFTs {myTokens.length > 0 && `(${myTokens.length})`}</TabsTrigger>
            <TabsTrigger value="staking">NFT Staking</TabsTrigger>
          </TabsList>

          {/* Marketplace */}
          <TabsContent value="marketplace" className="mt-4 space-y-4">
            <div className="flex gap-3 flex-wrap">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search NFTs…" className="pl-9" />
              </div>
              <select
                value={filterCollection}
                onChange={e => setFilterCollection(e.target.value)}
                className="bg-muted/30 border border-border/40 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">All Collections</option>
                {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select
                value={filterRarity}
                onChange={e => setFilterRarity(e.target.value)}
                className="bg-muted/30 border border-border/40 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">All Rarities</option>
                {['Legendary', 'Epic', 'Rare', 'Common'].map(r => <option key={r}>{r}</option>)}
              </select>
              <Button variant="outline" size="icon" onClick={() => setView(v => v === 'grid' ? 'list' : 'grid')}>
                {view === 'grid' ? <List className="w-4 h-4" /> : <Grid3X3 className="w-4 h-4" />}
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
                <RefreshCw className="w-5 h-5 animate-spin" /> Loading NFTs from chain…
              </div>
            ) : filtered.length === 0 ? (
              <GlassCard className="p-10 text-center text-muted-foreground">
                <Image className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>No NFTs found{search ? ` matching "${search}"` : ''}.</p>
              </GlassCard>
            ) : (
              <div className={view === 'grid' ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4' : 'space-y-3'}>
                {filtered.map((nft, i) => {
                  const rarityStyle = RARITY_COLOR[nft.rarity] ?? RARITY_COLOR.Common;
                  return (
                    <motion.div key={nft.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                      <GlassCard
                        className="p-4 cursor-pointer hover:border-primary/40 transition-colors"
                        onClick={() => setSelectedNFT(nft)}
                      >
                        {view === 'grid' ? (
                          <div className="space-y-3">
                            <div className="aspect-square bg-gradient-to-br from-primary/10 to-neon-cyan/10 rounded-xl flex items-center justify-center text-5xl border border-border/30">
                              {nft.image_emoji}
                            </div>
                            <div>
                              <Badge variant="outline" className={`text-xs mb-1 ${rarityStyle}`}>{nft.rarity}</Badge>
                              <p className="font-semibold text-sm">{nft.name}</p>
                              <p className="text-xs text-muted-foreground">{nft.collection_name}</p>
                              <p className="text-sm font-bold text-primary mt-1">{Number(nft.price).toLocaleString()} GYDS</p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-gradient-to-br from-primary/10 to-neon-cyan/10 rounded-xl flex items-center justify-center text-2xl shrink-0">
                              {nft.image_emoji}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold truncate">{nft.name}</p>
                              <p className="text-xs text-muted-foreground">{nft.collection_name}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <Badge variant="outline" className={`text-xs ${rarityStyle}`}>{nft.rarity}</Badge>
                              <p className="text-sm font-bold text-primary mt-1">{Number(nft.price).toLocaleString()} GYDS</p>
                            </div>
                          </div>
                        )}
                      </GlassCard>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Collections */}
          <TabsContent value="collections" className="mt-4 space-y-3">
            {/* Rarity Ranking */}
            <GlassCard className="p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-400" /> Rarity Ranking
              </h3>
              <div className="grid grid-cols-4 gap-2">
                {(['Legendary', 'Epic', 'Rare', 'Common'] as const).map(r => {
                  const count = tokens.filter(t => t.rarity === r).length;
                  return (
                    <div key={r} className={`p-2 rounded-lg border text-center ${RARITY_COLOR[r]}`}>
                      <p className="text-xs font-semibold">{r}</p>
                      <p className="text-lg font-bold">{count}</p>
                      <p className="text-xs opacity-70">NFTs</p>
                    </div>
                  );
                })}
              </div>
            </GlassCard>

            {sortedCollections.map((col, i) => (
              <motion.div key={col.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                <GlassCard
                  className="p-4 hover:border-primary/40 transition-colors cursor-pointer"
                  onClick={() => { setFilterCollection(filterCollection === col.id ? '' : col.id); }}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-primary/10 to-neon-cyan/10 rounded-xl flex items-center justify-center text-2xl shrink-0">
                      {col.image_emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{col.name}</p>
                        <Badge variant="secondary" className="text-xs">{col.symbol}</Badge>
                        {filterCollection === col.id && <Badge className="text-xs">Active Filter</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{col.description}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{col.total_items.toLocaleString()} items</p>
                    </div>
                    <div className="text-right space-y-0.5 shrink-0">
                      <p className="text-sm font-bold">{Number(col.floor_price).toLocaleString()} GYDS</p>
                      <p className="text-xs text-muted-foreground">Floor</p>
                    </div>
                    <div className="text-right space-y-0.5 hidden sm:block shrink-0">
                      <p className="text-sm font-bold">{(Number(col.volume_24h) / 1000).toFixed(0)}K GYDS</p>
                      <div className={`text-xs flex items-center justify-end gap-0.5 ${Number(col.change_24h) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {Number(col.change_24h) >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {Number(col.change_24h) >= 0 ? '+' : ''}{Number(col.change_24h).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </TabsContent>

          {/* Mint */}
          <TabsContent value="mint" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <GlassCard className="p-6 space-y-4">
                <h2 className="font-semibold flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" /> Mint Your NFT
                </h2>
                <div>
                  <Label className="text-xs text-muted-foreground">NFT Name *</Label>
                  <Input value={mintName} onChange={e => setMintName(e.target.value)} placeholder="My Awesome NFT" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Description</Label>
                  <Textarea
                    value={mintDescription}
                    onChange={e => setMintDescription(e.target.value)}
                    placeholder="Describe your NFT..."
                    className="mt-1 min-h-[70px] resize-none"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Collection</Label>
                  <select value={mintCollection} onChange={e => setMintCollection(e.target.value)}
                    className="w-full mt-1 bg-muted/30 border border-border/40 rounded-lg px-3 py-2 text-sm">
                    {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Rarity</Label>
                    <select value={mintRarity} onChange={e => setMintRarity(e.target.value)}
                      className="w-full mt-1 bg-muted/30 border border-border/40 rounded-lg px-3 py-2 text-sm">
                      {['Common', 'Rare', 'Epic', 'Legendary'].map(r => <option key={r}>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Royalty %</Label>
                    <Input
                      type="number" min="0" max="25" step="0.5"
                      value={mintRoyalty}
                      onChange={e => setMintRoyalty(Number(e.target.value))}
                      className="mt-1"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Image Emoji</Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {EMOJIS.map(e => (
                      <button key={e} onClick={() => setMintEmoji(e)}
                        className={`text-2xl p-1.5 rounded-lg border transition-all ${mintEmoji === e ? 'border-primary bg-primary/10' : 'border-border/30 hover:border-primary/40'}`}>
                        {e}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Attributes */}
                <div>
                  <Label className="text-xs text-muted-foreground">Attributes (Traits)</Label>
                  <div className="flex gap-2 mt-1">
                    <Input value={mintAttrKey} onChange={e => setMintAttrKey(e.target.value)} placeholder="Key" className="flex-1" />
                    <Input value={mintAttrVal} onChange={e => setMintAttrVal(e.target.value)} placeholder="Value" className="flex-1" />
                    <Button variant="outline" size="icon" onClick={addAttr}><Plus className="w-4 h-4" /></Button>
                  </div>
                  {Object.keys(mintAttrs).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {Object.entries(mintAttrs).map(([k, v]) => (
                        <span key={k} className="flex items-center gap-1 text-xs bg-muted/30 border border-border/40 rounded-full px-2 py-0.5">
                          <span className="text-muted-foreground">{k}:</span> {v}
                          <button onClick={() => setMintAttrs(prev => { const n = { ...prev }; delete n[k]; return n; })}>
                            <X className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-between text-sm p-3 bg-muted/20 rounded-lg">
                  <span className="text-muted-foreground">Mint fee</span>
                  <span className="font-mono">100 GYDS</span>
                </div>
                <Button className="w-full gap-2" onClick={handleMint} disabled={minting || !user}>
                  {minting ? <><RefreshCw className="w-4 h-4 animate-spin" /> Minting…</> : <><Zap className="w-4 h-4" /> Mint NFT</>}
                </Button>
                {!user && <p className="text-xs text-center text-muted-foreground">Sign in to mint</p>}
              </GlassCard>

              {/* Preview */}
              <GlassCard className="p-6 space-y-4">
                <h2 className="font-semibold flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-400" /> Preview
                </h2>
                <div className="aspect-square bg-gradient-to-br from-primary/10 to-neon-cyan/10 rounded-xl flex items-center justify-center text-8xl border border-border/30">
                  {mintEmoji}
                </div>
                <div>
                  <Badge variant="outline" className={RARITY_COLOR[mintRarity] ?? RARITY_COLOR.Common}>{mintRarity}</Badge>
                  <p className="text-xl font-bold mt-2">{mintName || 'My NFT'}</p>
                  <p className="text-sm text-muted-foreground">
                    {collections.find(c => c.id === mintCollection)?.name ?? 'Collection'}
                  </p>
                  {mintDescription && <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{mintDescription}</p>}
                  {mintRoyalty > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">Royalty: {mintRoyalty}%</p>
                  )}
                  {Object.keys(mintAttrs).length > 0 && (
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      {Object.entries(mintAttrs).map(([k, v]) => (
                        <div key={k} className="text-xs bg-muted/20 rounded-lg p-1.5 text-center">
                          <p className="text-muted-foreground capitalize">{k}</p>
                          <p className="font-semibold">{v}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </GlassCard>

              {/* Whitelist Minting */}
              <GlassCard className="p-5 space-y-4">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" /> Allowlist / Whitelist Minting
                </h3>
                <p className="text-xs text-muted-foreground">Collections can restrict minting to approved addresses. Check if your wallet is on an active allowlist.</p>
                <div className="space-y-2">
                  {[
                    { collection: 'GYDS Genesis', status: 'whitelisted', slots: 3, ends: '2026-07-01' },
                    { collection: 'Validator Badge S1', status: 'not-listed', slots: 0, ends: '2026-08-15' },
                    { collection: 'DeFi Pioneer', status: 'whitelisted', slots: 1, ends: '2026-09-01' },
                  ].map(al => (
                    <div key={al.collection} className="flex items-center justify-between p-3 bg-muted/20 rounded-xl text-sm gap-2 flex-wrap">
                      <div>
                        <p className="font-medium">{al.collection}</p>
                        <p className="text-xs text-muted-foreground">Ends: {al.ends}</p>
                      </div>
                      <div className="text-right">
                        {al.status === 'whitelisted' ? (
                          <>
                            <Badge className="text-xs bg-emerald-500/20 text-emerald-400 border-emerald-500/30 mb-1">Allowlisted</Badge>
                            <p className="text-xs text-muted-foreground">{al.slots} slot{al.slots !== 1 ? 's' : ''}</p>
                          </>
                        ) : (
                          <Badge variant="secondary" className="text-xs">Not listed</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </GlassCard>
            </div>
          </TabsContent>

          {/* Batch Mint */}
          <TabsContent value="batch-mint" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <GlassCard className="p-5">
                  <h2 className="font-semibold flex items-center gap-2 mb-4">
                    <Layers className="w-4 h-4 text-primary" /> Batch Mint NFTs
                    <span className="text-xs text-muted-foreground ml-auto">Max 10 per batch</span>
                  </h2>
                  <div className="mb-4">
                    <Label className="text-xs text-muted-foreground">Collection</Label>
                    <select value={batchCollection} onChange={e => setBatchCollection(e.target.value)}
                      className="w-full mt-1 bg-muted/30 border border-border/40 rounded-lg px-3 py-2 text-sm">
                      {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-3">
                    {batchItems.map((item, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <span className="text-xs text-muted-foreground w-5 text-center">{idx + 1}</span>
                        <Input
                          value={item.name}
                          onChange={e => setBatchItems(prev => prev.map((it, i) => i === idx ? { ...it, name: e.target.value } : it))}
                          placeholder={`NFT #${idx + 1} name`}
                          className="flex-1"
                        />
                        <select
                          value={item.rarity}
                          onChange={e => setBatchItems(prev => prev.map((it, i) => i === idx ? { ...it, rarity: e.target.value } : it))}
                          className="bg-muted/30 border border-border/40 rounded-lg px-2 py-2 text-sm"
                        >
                          {['Common', 'Rare', 'Epic', 'Legendary'].map(r => <option key={r}>{r}</option>)}
                        </select>
                        <div className="flex gap-1">
                          {['🎨', '🔮', '💎', '🚀', '⚡'].map(e => (
                            <button key={e} onClick={() => setBatchItems(prev => prev.map((it, i) => i === idx ? { ...it, imageEmoji: e } : it))}
                              className={`text-lg p-0.5 rounded border transition-all ${item.imageEmoji === e ? 'border-primary bg-primary/10' : 'border-border/20'}`}>
                              {e}
                            </button>
                          ))}
                        </div>
                        {batchItems.length > 1 && (
                          <button onClick={() => setBatchItems(prev => prev.filter((_, i) => i !== idx))}>
                            <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-4">
                    {batchItems.length < 10 && (
                      <Button variant="outline" size="sm" onClick={() => setBatchItems(prev => [...prev, { name: '', rarity: 'Common', imageEmoji: '🎨' }])}>
                        <Plus className="w-4 h-4 mr-1" /> Add NFT
                      </Button>
                    )}
                  </div>
                </GlassCard>
                <div className="flex justify-between text-sm p-3 bg-muted/20 rounded-lg border border-border/30">
                  <span className="text-muted-foreground">Total mint fee</span>
                  <span className="font-mono">{batchItems.filter(i => i.name.trim()).length * 100} GYDS ({batchItems.filter(i => i.name.trim()).length} NFTs × 100)</span>
                </div>
                <Button className="w-full gap-2" onClick={handleBatchMint} disabled={batchMinting || !user}>
                  {batchMinting ? <><RefreshCw className="w-4 h-4 animate-spin" /> Minting batch…</> : <><Layers className="w-4 h-4" /> Mint {batchItems.filter(i => i.name.trim()).length} NFTs</>}
                </Button>
                {!user && <p className="text-xs text-center text-muted-foreground">Sign in to mint</p>}
              </div>

              <GlassCard className="p-5 space-y-3 h-fit">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Package className="w-4 h-4 text-primary" /> Batch Preview
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {batchItems.slice(0, 9).map((item, idx) => (
                    <div key={idx} className="aspect-square bg-gradient-to-br from-primary/10 to-neon-cyan/10 rounded-lg flex items-center justify-center text-2xl border border-border/20">
                      {item.imageEmoji}
                    </div>
                  ))}
                  {batchItems.length < 9 && (
                    <div className="aspect-square bg-muted/10 rounded-lg flex items-center justify-center border border-dashed border-border/30 text-muted-foreground">
                      <Plus className="w-5 h-5" />
                    </div>
                  )}
                </div>
                {batchItems.some(i => i.name.trim()) && (
                  <div className="space-y-1 text-xs">
                    {batchItems.filter(i => i.name.trim()).map((item, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span className="text-muted-foreground truncate">{item.name || '—'}</span>
                        <Badge variant="outline" className={`text-xs ${RARITY_COLOR[item.rarity] ?? RARITY_COLOR.Common}`}>{item.rarity}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </GlassCard>
            </div>
          </TabsContent>

          {/* My NFTs */}
          <TabsContent value="my-nfts" className="mt-4">
            {!user ? (
              <GlassCard className="p-10 text-center text-muted-foreground">
                <Lock className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>Sign in to view your NFTs.</p>
              </GlassCard>
            ) : myTokens.length === 0 ? (
              <GlassCard className="p-10 text-center text-muted-foreground">
                <Image className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>You don't own any NFTs yet.</p>
                <p className="text-sm mt-1">Mint or buy NFTs from the Marketplace tab.</p>
              </GlassCard>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {myTokens.map((nft, i) => {
                  const rarityStyle = RARITY_COLOR[nft.rarity] ?? RARITY_COLOR.Common;
                  return (
                    <motion.div key={nft.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                      <GlassCard className="p-4 space-y-3">
                        <div className="aspect-square bg-gradient-to-br from-primary/10 to-neon-cyan/10 rounded-xl flex items-center justify-center text-5xl border border-border/30 relative">
                          {nft.image_emoji}
                          {nft.listed && (
                            <span className="absolute top-1.5 right-1.5 text-xs bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 px-1.5 py-0.5 rounded-full">Listed</span>
                          )}
                        </div>
                        <div>
                          <Badge variant="outline" className={`text-xs mb-1 ${rarityStyle}`}>{nft.rarity}</Badge>
                          <p className="font-semibold text-sm">{nft.name}</p>
                          <p className="text-xs text-muted-foreground">{nft.collection_name}</p>
                          {nft.listed && <p className="text-sm font-bold text-primary mt-1">{Number(nft.price).toLocaleString()} GYDS</p>}
                        </div>
                        <div className="flex gap-2">
                          {nft.listed ? (
                            <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => handleDelist(nft)}>
                              Delist
                            </Button>
                          ) : (
                            <Button size="sm" className="flex-1 text-xs gap-1" onClick={() => { setListingNFT(nft); setListPrice('100000'); }}>
                              <TagIcon className="w-3 h-3" /> List
                            </Button>
                          )}
                          <Button variant="outline" size="sm" className="text-xs px-2" onClick={() => setSelectedNFT(nft)}>
                            <ArrowUpRight className="w-3 h-3" />
                          </Button>
                        </div>
                        {nft.metadata?.royaltyPercent != null && (
                          <p className="text-xs text-muted-foreground">Royalty: {nft.metadata.royaltyPercent}%</p>
                        )}
                      </GlassCard>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* NFT Staking */}
          <TabsContent value="staking" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Total Staked', value: '1,248 NFTs', color: 'text-primary' },
                { label: 'GYDS Rewarded', value: '284K', color: 'text-emerald-400' },
                { label: 'Avg APY', value: '18.4%', color: 'text-amber-400' },
                { label: 'My Staked', value: user ? `${myTokens.filter(t => t.listed).length} NFTs` : '—', color: 'text-blue-400' },
              ].map(s => (
                <GlassCard key={s.label} className="p-4 text-center">
                  <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                </GlassCard>
              ))}
            </div>

            <GlassCard className="p-5 space-y-4">
              <h2 className="font-semibold flex items-center gap-2">🔒 Staking Pools</h2>
              <div className="space-y-3">
                {[
                  { name: 'GYDS Genesis Pool', rarity: 'Legendary', apy: '42%', reward: 'GYDS', lock: '30 days', stakers: 12 },
                  { name: 'Validator Badge Pool', rarity: 'Epic', apy: '28%', reward: 'GYDS + XP', lock: '14 days', stakers: 48 },
                  { name: 'DeFi Pioneer Pool', rarity: 'Rare', apy: '18%', reward: 'GYDS', lock: '7 days', stakers: 156 },
                  { name: 'Community Contributor Pool', rarity: 'Uncommon', apy: '12%', reward: 'GYDS + XP', lock: 'None', stakers: 411 },
                  { name: 'General Pool', rarity: 'Common+', apy: '8%', reward: 'GYDS', lock: 'None', stakers: 621 },
                ].map(pool => (
                  <div key={pool.name} className="flex items-center justify-between p-4 bg-muted/20 rounded-xl gap-3 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm">{pool.name}</p>
                        <Badge variant="secondary" className="text-xs">{pool.rarity}+</Badge>
                      </div>
                      <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                        <span>Lock: <span className="text-foreground">{pool.lock}</span></span>
                        <span>Reward: <span className="text-foreground">{pool.reward}</span></span>
                        <span>{pool.stakers} stakers</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-emerald-400 font-bold text-lg">{pool.apy}</span>
                      <Button size="sm" onClick={() => toast({ title: 'NFT Staking', description: 'Staking contracts deploy with mainnet.' })}>
                        Stake NFT
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>

            <GlassCard className="p-4 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">How NFT Staking Works</p>
              <p>Lock eligible NFTs into a pool to earn GYDS rewards proportional to the NFT's rarity tier. NFTs remain in your wallet — only a stake record is created on-chain. Unstake at any time (subject to lock period).</p>
            </GlassCard>
          </TabsContent>

        </Tabs>

        {/* NFT Detail Modal */}
        {selectedNFT && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedNFT(null)}
          >
            <GlassCard className="p-6 w-full max-w-sm space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="aspect-square bg-gradient-to-br from-primary/10 to-neon-cyan/10 rounded-xl flex items-center justify-center text-7xl">
                {selectedNFT.image_emoji}
              </div>
              <div>
                <Badge variant="outline" className={`text-xs mb-1 ${RARITY_COLOR[selectedNFT.rarity] ?? RARITY_COLOR.Common}`}>{selectedNFT.rarity}</Badge>
                <h2 className="text-xl font-bold">{selectedNFT.name}</h2>
                <p className="text-sm text-muted-foreground">{selectedNFT.collection_name}</p>
                {selectedNFT.metadata?.description && (
                  <p className="text-xs text-muted-foreground mt-1">{selectedNFT.metadata.description}</p>
                )}
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Price</span>
                  <span className="font-bold text-primary">{Number(selectedNFT.price).toLocaleString()} GYDS</span>
                </div>
                {Number(selectedNFT.last_sale) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Last sale</span>
                    <span>{Number(selectedNFT.last_sale).toLocaleString()} GYDS</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Token ID</span>
                  <span className="font-mono">#{selectedNFT.token_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Owner</span>
                  <span className="font-mono text-xs">{selectedNFT.owner_address.slice(0, 12)}…</span>
                </div>
                {selectedNFT.metadata?.royaltyPercent != null && selectedNFT.metadata.royaltyPercent > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Royalty</span>
                    <span>{selectedNFT.metadata.royaltyPercent}%</span>
                  </div>
                )}
              </div>
              {selectedNFT.metadata?.attributes && Object.keys(selectedNFT.metadata.attributes).length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Attributes</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {Object.entries(selectedNFT.metadata.attributes).map(([k, v]) => (
                      <div key={k} className="text-xs bg-muted/20 rounded-lg p-1.5 text-center border border-border/30">
                        <p className="text-muted-foreground capitalize">{k}</p>
                        <p className="font-semibold">{v}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  className="flex-1 gap-2"
                  onClick={() => handleBuy(selectedNFT)}
                  disabled={!!buyingId}
                >
                  {buyingId === selectedNFT.id ? <><RefreshCw className="w-4 h-4 animate-spin" /> Buying…</> : <><Gavel className="w-4 h-4" /> Buy Now</>}
                </Button>
                <Button variant="outline" onClick={() => { toast({ title: 'Offer submitted!' }); setSelectedNFT(null); }}>
                  Make Offer
                </Button>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {/* List NFT Modal */}
        {listingNFT && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setListingNFT(null)}
          >
            <GlassCard className="p-6 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3">
                <span className="text-3xl">{listingNFT.image_emoji}</span>
                <div>
                  <h2 className="text-lg font-bold">{listingNFT.name}</h2>
                  <p className="text-xs text-muted-foreground">{listingNFT.collection_name}</p>
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Listing Price (GYDS)</Label>
                <Input
                  type="number"
                  value={listPrice}
                  onChange={e => setListPrice(e.target.value)}
                  min="1"
                  className="mt-1"
                />
              </div>
              <div className="flex gap-2">
                <Button className="flex-1 gap-2" onClick={handleList}>
                  <TagIcon className="w-4 h-4" /> List for Sale
                </Button>
                <Button variant="outline" onClick={() => setListingNFT(null)}>Cancel</Button>
              </div>
            </GlassCard>
          </motion.div>
        )}
      </motion.div>
    </Layout>
  );
};

export default NFTPage;
