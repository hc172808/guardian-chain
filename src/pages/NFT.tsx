import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '@/components/layout/Layout';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  Image, TrendingUp, Star, Plus, Search, Grid3X3, List,
  Zap, Tag, RefreshCw, Upload, Award, TrendingDown, Gavel
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

const EMOJIS = ['🎨', '🌟', '🔮', '💎', '🚀', '🌈', '⚡', '🔥', '🌊', '🎭'];

const NFTPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tokens, setTokens] = useState<NFTToken[]>([]);
  const [collections, setCollections] = useState<NFTCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [selectedNFT, setSelectedNFT] = useState<NFTToken | null>(null);
  const [minting, setMinting] = useState(false);
  const [mintName, setMintName] = useState('');
  const [mintRarity, setMintRarity] = useState('Common');
  const [mintEmoji, setMintEmoji] = useState('🎨');
  const [mintCollection, setMintCollection] = useState('');
  const [filterCollection, setFilterCollection] = useState('');

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
        if (cols.length > 0 && !mintCollection) setMintCollection(cols[0].id);
      }
      if (tokRes.ok) setTokens(await tokRes.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = tokens.filter(n => {
    const q = search.toLowerCase();
    const matchSearch = !search || n.name.toLowerCase().includes(q) || n.collection_name.toLowerCase().includes(q);
    const matchCol = !filterCollection || n.collection_id === filterCollection;
    return matchSearch && matchCol;
  });

  const totalVolume = collections.reduce((a, c) => a + Number(c.volume_24h), 0);
  const avgFloor = collections.length ? collections.reduce((a, c) => a + Number(c.floor_price), 0) / collections.length : 0;

  const handleBuy = (nft: NFTToken) => {
    if (!user) { toast({ title: 'Sign in to buy', variant: 'destructive' }); return; }
    toast({ title: `Offer placed on ${nft.name}`, description: `${Number(nft.price).toLocaleString()} GYDS` });
    setSelectedNFT(null);
  };

  const handleMint = async () => {
    if (!user) { toast({ title: 'Sign in to mint', variant: 'destructive' }); return; }
    if (!mintName.trim()) { toast({ title: 'NFT name required', variant: 'destructive' }); return; }
    setMinting(true);
    try {
      const res = await fetch('/api/nft/mint', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: mintName.trim(), collectionId: mintCollection, rarity: mintRarity, imageEmoji: mintEmoji }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: '🎨 NFT Minted!', description: `${mintName} has been minted on GYDSchain.` });
      setMintName('');
      fetchData();
    } catch (e: any) {
      toast({ title: 'Mint failed', description: e.message, variant: 'destructive' });
    } finally { setMinting(false); }
  };

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
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
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
          <TabsList>
            <TabsTrigger value="marketplace">Marketplace</TabsTrigger>
            <TabsTrigger value="collections">Collections</TabsTrigger>
            <TabsTrigger value="mint">Mint</TabsTrigger>
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
          <TabsContent value="collections" className="mt-4">
            <div className="space-y-3">
              {collections.map((col, i) => (
                <motion.div key={col.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                  <GlassCard
                    className="p-4 hover:border-primary/40 transition-colors cursor-pointer"
                    onClick={() => setFilterCollection(filterCollection === col.id ? '' : col.id)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-primary/10 to-neon-cyan/10 rounded-xl flex items-center justify-center text-2xl shrink-0">
                        {col.image_emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">{col.name}</p>
                          <Badge variant="secondary" className="text-xs">{col.symbol}</Badge>
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
            </div>
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
                  <Label className="text-xs text-muted-foreground">Collection</Label>
                  <select value={mintCollection} onChange={e => setMintCollection(e.target.value)}
                    className="w-full mt-1 bg-muted/30 border border-border/40 rounded-lg px-3 py-2 text-sm">
                    {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Rarity</Label>
                  <select value={mintRarity} onChange={e => setMintRarity(e.target.value)}
                    className="w-full mt-1 bg-muted/30 border border-border/40 rounded-lg px-3 py-2 text-sm">
                    {['Common', 'Rare', 'Epic', 'Legendary'].map(r => <option key={r}>{r}</option>)}
                  </select>
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
                </div>
              </GlassCard>
            </div>
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
            <GlassCard className="p-6 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
              <div className="aspect-square bg-gradient-to-br from-primary/10 to-neon-cyan/10 rounded-xl flex items-center justify-center text-7xl">
                {selectedNFT.image_emoji}
              </div>
              <div>
                <Badge variant="outline" className={`text-xs mb-1 ${RARITY_COLOR[selectedNFT.rarity] ?? RARITY_COLOR.Common}`}>{selectedNFT.rarity}</Badge>
                <h2 className="text-xl font-bold">{selectedNFT.name}</h2>
                <p className="text-sm text-muted-foreground">{selectedNFT.collection_name}</p>
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
                  <span className="font-mono text-xs">{selectedNFT.owner_address.slice(0, 10)}…</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1 gap-2" onClick={() => handleBuy(selectedNFT)}>
                  <Gavel className="w-4 h-4" /> Buy Now
                </Button>
                <Button variant="outline" onClick={() => { toast({ title: 'Offer submitted!' }); setSelectedNFT(null); }}>
                  Make Offer
                </Button>
              </div>
            </GlassCard>
          </motion.div>
        )}
      </motion.div>
    </Layout>
  );
};

export default NFTPage;
