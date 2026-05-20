import { useState, useEffect, useRef } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Boxes, ArrowRight, Wifi, WifiOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface LiveBlock {
  number: number;
  hash: string;
  transactions: number;
  validator: string;
  timestamp: number;
  gasUsed?: number;
  size?: number;
}

const MAX_ITEMS = 12;

function shortAddr(addr: string) {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function timeAgo(ts: number) {
  const secs = Math.floor(Date.now() / 1000) - ts;
  if (secs < 5) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  return `${Math.floor(secs / 60)}m ago`;
}

export const LiveActivityFeed = () => {
  const [blocks, setBlocks] = useState<LiveBlock[]>([]);
  const [connected, setConnected] = useState(false);
  const [totalBlocks, setTotalBlocks] = useState(0);
  const [tick, setTick] = useState(0);
  const esRef = useRef<EventSource | null>(null);

  // Refresh timestamps every 5 s so "Xs ago" stays current
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 5_000);
    return () => clearInterval(id);
  }, []);

  // Bootstrap with recent blocks
  useEffect(() => {
    fetch('/api/blockchain/blocks?limit=8')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.blocks?.length) {
          const mapped: LiveBlock[] = data.blocks.map((b: any) => ({
            number:       Number(b.number ?? b.height ?? 0),
            hash:         b.hash ?? '',
            transactions: Number(b.transactions ?? b.tx_count ?? 0),
            validator:    b.validator ?? b.proposer_addr ?? '0x0',
            timestamp:    Number(b.timestamp ?? Math.floor(Date.now() / 1000)),
            gasUsed:      Number(b.gasUsed ?? 0),
            size:         Number(b.size ?? 0),
          }));
          setBlocks(mapped);
          setTotalBlocks(data.count ?? mapped.length);
        }
      })
      .catch(() => {});
  }, []);

  // SSE stream for live blocks
  useEffect(() => {
    const es = new EventSource('/api/blockchain/stream');
    esRef.current = es;

    es.addEventListener('newBlock', (e) => {
      try {
        const b = JSON.parse(e.data);
        const block: LiveBlock = {
          number:       Number(b.number ?? b.height ?? 0),
          hash:         b.hash ?? '',
          transactions: Number(b.transactions ?? b.tx_count ?? 0),
          validator:    b.validator ?? b.proposer_addr ?? '0x0',
          timestamp:    Number(b.timestamp ?? Math.floor(Date.now() / 1000)),
          gasUsed:      Number(b.gasUsed ?? 0),
          size:         Number(b.size ?? 0),
        };
        setBlocks((prev) => {
          if (prev[0]?.number === block.number) return prev;
          return [block, ...prev].slice(0, MAX_ITEMS);
        });
        setTotalBlocks((n) => n + 1);
        setConnected(true);
      } catch {}
    });

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    return () => { es.close(); esRef.current = null; };
  }, []);

  return (
    <GlassCard className="flex flex-col gap-0 p-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Boxes className="w-5 h-5 text-primary" />
            {connected && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary animate-ping" />
            )}
          </div>
          <h3 className="text-base font-semibold">Live Block Feed</h3>
          <span className={cn(
            'flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium',
            connected
              ? 'bg-primary/10 text-primary'
              : 'bg-muted/30 text-muted-foreground'
          )}>
            {connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {connected ? 'Live' : 'Connecting…'}
          </span>
        </div>
        <Link
          to="/explorer"
          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
        >
          Explorer <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-4 px-5 py-2 text-xs text-muted-foreground border-b border-border/20 bg-muted/10">
        <span>Block</span>
        <span>Txns</span>
        <span className="hidden sm:block">Validator</span>
        <span className="text-right">Time</span>
      </div>

      {/* Block rows */}
      <div className="divide-y divide-border/20">
        {blocks.length === 0 ? (
          <div className="py-10 text-center">
            <Zap className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2 animate-pulse" />
            <p className="text-sm text-muted-foreground">Waiting for blocks…</p>
          </div>
        ) : (
          <AnimatePresence initial={false} mode="popLayout">
            {blocks.map((b, i) => (
              <motion.div
                key={b.number}
                initial={{ opacity: 0, y: -18, backgroundColor: 'rgba(var(--primary-rgb, 34 197 94) / 0.12)' }}
                animate={{ opacity: 1, y: 0, backgroundColor: 'rgba(var(--primary-rgb, 34 197 94) / 0)' }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35 }}
                className="grid grid-cols-4 items-center px-5 py-3 hover:bg-muted/10 transition-colors"
              >
                {/* Block number */}
                <div className="flex items-center gap-2">
                  {i === 0 && connected && (
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0" />
                  )}
                  <Link
                    to={`/explorer?block=${b.number}`}
                    className="font-mono text-sm font-medium text-primary hover:underline"
                  >
                    #{b.number.toLocaleString()}
                  </Link>
                </div>

                {/* Tx count */}
                <div>
                  <span className={cn(
                    'text-xs px-1.5 py-0.5 rounded font-medium',
                    b.transactions > 0
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground'
                  )}>
                    {b.transactions} tx
                  </span>
                </div>

                {/* Validator */}
                <div className="hidden sm:block">
                  <span className="font-mono text-xs text-muted-foreground">
                    {shortAddr(b.validator)}
                  </span>
                </div>

                {/* Time */}
                <div className="text-right">
                  <span className="text-xs text-muted-foreground" suppressHydrationWarning>
                    {timeAgo(b.timestamp)}
                  </span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Footer */}
      {totalBlocks > 0 && (
        <div className="px-5 py-2.5 border-t border-border/20 bg-muted/5 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Chain ID <span className="font-mono text-foreground">13370</span>
          </span>
          <span className="text-xs text-muted-foreground">
            {totalBlocks.toLocaleString()} blocks observed
          </span>
        </div>
      )}
    </GlassCard>
  );
};
