import { useState } from 'react';
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
  Zap, Tag, RefreshCw, Upload, Clock, Award
} from 'lucide-react';

interface NFTItem {
  id: string;
  name: string;
  collection: string;
  price: number;
  lastSale: number;
  rarity: string;
  image: string;
  owner: string;
}

interface Collection {
  id: string;
  name: string;
  items: number;
  floorPrice: number;
  volume24h: number;
  change24h: number;
  image: string;
}

const RARITY_COLOR: Record<string, string> = {
  Legendary: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  Epic:      'text-purple-400 border-purple-500/30 bg-purple-500/10',
  Rare:      'text-blue-400 border-blue-500/30 bg-blue-500/10',
  Common:    'text-muted-foreground border-border/40 bg-muted/20',
};

const DEMO_COLLECTIONS: Collection[] = [
  { id: '1', name: 'GYDSchain Genesis', items: 1000, floorPrice: 250000, volume24h: 4500000, change24h: 12.5, image: '🌐' },
  { id: '2', name: 'Validator Badges',  items: 500,  floorPrice: 100000, volume24h: 1200000, change24h: -3.2, image: '🛡️' },
  { id: '3', name: 'Node Operators',    items: 250,  floorPrice: 500000, volume24h: 800000,  change24h: 5.8,  image: '⚡' },
  { id: '4', name: 'DeFi Degens',       items: 2000, floorPrice: 50000,  volume24h: 2100000, change24h: 22.1, image: '🔥' },
];

const DEMO_NFTS: NFTItem[] = [
  { id: '1', name: 'Genesis #001', collection: 'GYDSchain Genesis', price: 280000, lastSale: 250000, rarity: 'Legendary', image: '🌐', owner: '0x1234…5678' },
  { id: '2', name: 'Genesis #042', collection: 'GYDSchain Genesis', price: 260000, lastSale: 245000, rarity: 'Epic',      image: '🌐', owner: '0xabcd…ef12' },
  { id: '3', name: 'Validator #007', collection: 'Validator Badges', price: 110000, lastSale: 98000, rarity: 'Rare',      image: '🛡️', owner: '0x9876…4321' },
  { id: '4', name: 'Validator #013', collection: 'Validator Badges', price: 105000, lastSale: 100000, rarity: 'Common',   image: '🛡️', owner: '0xfeed…cafe' },
  { id: '5', name: 'Node Op #001',   collection: 'Node Operators',   price: 520000, lastSale: 490000, rarity: 'Legendary', image: '⚡', owner: '0xdead…beef' },
  { id: '6', name: 'DeFi Degen #777', collection: 'DeFi Degens',    price: 55000,  lastSale: 48000,  rarity: 'Rare',      image: '🔥', owner: '0xcafe…d00d' },
];

const NFTPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [selectedNFT, setSelectedNFT] = useState<NFTItem | null>(null);
  const [minting, setMinting] = useState(false);

  const filtered = DEMO_NFTS.filter(n =>
    n.name.toLowerCase().includes(search.toLowerCase()) ||
    n.collection.toLowerCase().includes(search.toLowerCase())
  );

  const handleBuy = (nft: NFTItem) => {
    if (!user) { toast({ title: 'Sign in to buy', variant: 'destructive' }); return; }
    toast({ title: `Offer placed on ${nft.name}`, description: `${nft.price.toLocaleString()} GYDS` });
    setSelectedNFT(null);
  };

  const handleMint = async () => {
    if (!user) { toast({ title: 'Sign in to mint', variant: 'destructive' }); return; }
    setMinting(true);
    await new Promise(r => setTimeout(r, 2000));
    setMinting(false);
    toast({ title: '🎨 NFT Minted!', description: 'Your NFT has been minted to the GYDSchain.' });
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
          <Button onClick={handleMint} disabled={minting} className="gap-2 shrink-0">
            {minting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Mint NFT
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Volume', value: '8.6M GYDS', icon: TrendingUp },
            { label: 'Collections',  value: DEMO_COLLECTIONS.length,  icon: Grid3X3 },
            { label: 'NFTs Listed',  value: DEMO_NFTS.length,          icon: Tag },
            { label: 'Floor (Avg)',  value: '251K GYDS',               icon: Award },
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
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search NFTs…" className="pl-9" />
              </div>
              <Button variant="outline" size="icon" onClick={() => setView(v => v === 'grid' ? 'list' : 'grid')}>
                {view === 'grid' ? <List className="w-4 h-4" /> : <Grid3X3 className="w-4 h-4" />}
              </Button>
            </div>

            <div className={view === 'grid' ? 'grid grid-cols-2 md:grid-cols-3 gap-4' : 'space-y-3'}>
              {filtered.map((nft, i) => {
                const rarityStyle = RARITY_COLOR[nft.rarity] ?? RARITY_COLOR.Common;
                return (
                  <motion.div key={nft.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                    <GlassCard
                      className="p-4 cursor-pointer hover:border-primary/40 transition-colors"
                      onClick={() => setSelectedNFT(nft)}
                    >
                      {view === 'grid' ? (
                        <div className="space-y-3">
                          <div className="aspect-square bg-gradient-to-br from-primary/10 to-neon-cyan/10 rounded-xl flex items-center justify-center text-5xl border border-border/30">
                            {nft.image}
                          </div>
                          <div>
                            <Badge variant="outline" className={`text-xs mb-1 ${rarityStyle}`}>{nft.rarity}</Badge>
                            <p className="font-semibold text-sm">{nft.name}</p>
                            <p className="text-xs text-muted-foreground">{nft.collection}</p>
                            <p className="text-sm font-bold text-primary mt-1">{nft.price.toLocaleString()} GYDS</p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-gradient-to-br from-primary/10 to-neon-cyan/10 rounded-xl flex items-center justify-center text-2xl">
                            {nft.image}
                          </div>
                          <div className="flex-1">
                            <p className="font-semibold">{nft.name}</p>
                            <p className="text-xs text-muted-foreground">{nft.collection}</p>
                          </div>
                          <div className="text-right">
                            <Badge variant="outline" className={`text-xs ${rarityStyle}`}>{nft.rarity}</Badge>
                            <p className="text-sm font-bold text-primary mt-1">{nft.price.toLocaleString()} GYDS</p>
                          </div>
                        </div>
                      )}
                    </GlassCard>
                  </motion.div>
                );
              })}
            </div>
          </TabsContent>

          {/* Collections */}
          <TabsContent value="collections" className="mt-4">
            <div className="space-y-3">
              {DEMO_COLLECTIONS.map((col, i) => (
                <motion.div key={col.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                  <GlassCard className="p-4 hover:border-primary/40 transition-colors cursor-pointer">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-primary/10 to-neon-cyan/10 rounded-xl flex items-center justify-center text-2xl">
                        {col.image}
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold">{col.name}</p>
                        <p className="text-xs text-muted-foreground">{col.items} items</p>
                      </div>
                      <div className="text-right space-y-0.5">
                        <p className="text-sm font-bold">{col.floorPrice.toLocaleString()} GYDS</p>
                        <p className="text-xs text-muted-foreground">Floor</p>
                      </div>
                      <div className="text-right space-y-0.5 hidden sm:block">
                        <p className="text-sm font-bold">{(col.volume24h / 1000).toFixed(0)}K GYDS</p>
                        <p className={`text-xs ${col.change24h >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {col.change24h >= 0 ? '+' : ''}{col.change24h}%
                        </p>
                      </div>
                    </div>
                  </GlassCard>
                </motion.div>
              ))}
            </div>
          </TabsContent>

          {/* Mint */}
          <TabsContent value="mint" className="mt-4">
            <GlassCard className="p-6 space-y-4 max-w-lg">
              <h2 className="font-semibold flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" /> Mint Your NFT
              </h2>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">NFT Name</Label>
                  <Input placeholder="My Awesome NFT" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Description</Label>
                  <Input placeholder="Describe your NFT…" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Image / Media</Label>
                  <div className="border-2 border-dashed border-border/50 rounded-xl p-8 text-center cursor-pointer hover:border-primary/40 transition-colors">
                    <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Drop file or click to upload</p>
                    <p className="text-xs text-muted-foreground mt-1">PNG, JPG, GIF, MP4 · Max 100MB</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Royalty %</Label>
                    <Input type="number" placeholder="5" min="0" max="20" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Collection</Label>
                    <Input placeholder="New collection" />
                  </div>
                </div>
                <div className="flex justify-between text-sm p-3 bg-muted/20 rounded-lg">
                  <span className="text-muted-foreground">Mint fee</span>
                  <span className="font-mono">100 GYDS</span>
                </div>
                <Button className="w-full gap-2" onClick={handleMint} disabled={minting}>
                  {minting ? <><RefreshCw className="w-4 h-4 animate-spin" /> Minting…</> : <><Zap className="w-4 h-4" /> Mint NFT</>}
                </Button>
              </div>
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
            <GlassCard className="p-6 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
              <div className="aspect-square bg-gradient-to-br from-primary/10 to-neon-cyan/10 rounded-xl flex items-center justify-center text-7xl">
                {selectedNFT.image}
              </div>
              <div>
                <Badge variant="outline" className={`text-xs mb-1 ${RARITY_COLOR[selectedNFT.rarity]}`}>{selectedNFT.rarity}</Badge>
                <h2 className="text-xl font-bold">{selectedNFT.name}</h2>
                <p className="text-sm text-muted-foreground">{selectedNFT.collection}</p>
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Price</span><span className="font-bold text-primary">{selectedNFT.price.toLocaleString()} GYDS</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Last sale</span><span>{selectedNFT.lastSale.toLocaleString()} GYDS</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Owner</span><span className="font-mono">{selectedNFT.owner}</span></div>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => handleBuy(selectedNFT)}>Buy Now</Button>
                <Button variant="outline" onClick={() => toast({ title: 'Offer submitted!' })}>Make Offer</Button>
              </div>
            </GlassCard>
          </motion.div>
        )}
      </motion.div>
    </Layout>
  );
};

export default NFTPage;
