import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Terminal, Trash2, Download } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useComponentVisibility, KNOWN_COMPONENTS } from '@/hooks/useComponentVisibility';

type Line = { kind: 'in' | 'out' | 'err' | 'sys'; text: string; ts: string };

const HELP = `Available commands:

  help                          Show this help
  clear                         Clear the screen
  version                       Show app + chain version
  status                        Show overall system status

  users [limit=20]              List recent users
  nodes [limit=20]              List node installations
  tokens [active|all]           List tokens
  txs [limit=20]                Recent transactions
  wallet <address>              Look up wallet by address
  tx <hash>                     Look up a transaction by hash
  bridges [limit=20]            Recent cross-chain bridge ops

  visibility list               List hidden components
  hide <componentKey>           Hide a component from non-admin users
  show <componentKey>           Show a previously hidden component
  components                    List all known component keys

  rpc <method> [arg1 arg2 ...]  Call blockchain JSON-RPC (defaults to /rpc)
  ssh <command>                 Generate an SSH command to run on a node

  announce <text>               Broadcast a banner message to all users
  banner clear                  Remove the announcement banner

Tip: ↑/↓ for history, Tab to autocomplete (commands).`;

const ANNOUNCE_KEY = 'announcement_banner';

export const AdminConsole = () => {
  const { user } = useAuth();
  const { hidden, setHiddenList } = useComponentVisibility();
  const [lines, setLines] = useState<Line[]>([
    { kind: 'sys', text: 'GYDSchain Admin Console v1.0  —  type "help" for commands', ts: nowTs() },
  ]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [lines]);

  function nowTs() {
    return new Date().toLocaleTimeString('en-US', { hour12: false });
  }

  const print = (kind: Line['kind'], text: string) =>
    setLines((prev) => [...prev.slice(-500), { kind, text, ts: nowTs() }]);

  const out = (s: string) => print('out', s);
  const err = (s: string) => print('err', s);
  const sys = (s: string) => print('sys', s);

  const fmtTable = (rows: any[]): string => {
    if (!rows.length) return '(empty)';
    const cols = Object.keys(rows[0]);
    const widths = cols.map((c) =>
      Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length))
    );
    const sep = '  ';
    const head = cols.map((c, i) => c.padEnd(widths[i])).join(sep);
    const ruler = widths.map((w) => '─'.repeat(w)).join(sep);
    const body = rows
      .map((r) =>
        cols.map((c, i) => String(r[c] ?? '').slice(0, widths[i]).padEnd(widths[i])).join(sep)
      )
      .join('\n');
    return `${head}\n${ruler}\n${body}`;
  };

  const runCmd = async (raw: string) => {
    const cmd = raw.trim();
    if (!cmd) return;
    print('in', `$ ${cmd}`);
    setHistory((h) => [...h.slice(-50), cmd]);
    setHistIdx(-1);

    const [verb, ...args] = cmd.split(/\s+/);
    setBusy(true);
    try {
      switch (verb.toLowerCase()) {
        case 'help':    out(HELP); break;
        case 'clear':   setLines([]); break;
        case 'version': out(`Frontend: GYDSchain Dashboard v2.1.0\nChain ID: 13370\nBlock time: 120s`); break;

        case 'status': {
          const [users, nodes, tokens, txs] = await Promise.all([
            api.get('/api/admin/users').catch(() => []),
            api.get('/api/nodes').catch(() => []),
            api.get('/api/tokens').catch(() => []),
            api.get('/api/transactions').catch(() => []),
          ]);
          out(
            `Users:        ${Array.isArray(users) ? users.length : '?'}\n` +
            `Nodes:        ${Array.isArray(nodes) ? nodes.length : '?'}\n` +
            `Tokens:       ${Array.isArray(tokens) ? tokens.length : '?'}\n` +
            `Transactions: ${Array.isArray(txs) ? txs.length : '?'}\n` +
            `Hidden cmps:  ${hidden.length}`
          );
          break;
        }

        case 'users': {
          const limit = parseInt(args[0] || '20', 10);
          const data = await api.get(`/api/admin/users`);
          const rows = (Array.isArray(data) ? data : []).slice(0, limit);
          out(fmtTable(rows.map((r: any) => ({
            id: String(r.id || r.user_id || '').slice(0, 8) + '…',
            username: r.username || '-',
            email: r.email || '-',
            role: r.role || 'user',
            created: new Date(r.created_at || Date.now()).toISOString().slice(0, 10),
          }))));
          break;
        }

        case 'nodes': {
          const limit = parseInt(args[0] || '20', 10);
          const data = await api.get('/api/nodes');
          const rows = (Array.isArray(data) ? data : []).slice(0, limit);
          out(fmtTable(rows.map((r: any) => ({
            type: r.node_type || r.nodeType || '-',
            online: r.is_online || r.isOnline ? 'yes' : 'no',
            sync: r.sync_progress || r.syncProgress || '-',
            approved: r.is_approved || r.isApproved ? 'yes' : 'no',
            created: new Date(r.created_at || Date.now()).toISOString().slice(0, 10),
          }))));
          break;
        }

        case 'tokens': {
          const which = (args[0] || 'all').toLowerCase();
          let data = await api.get('/api/tokens');
          if (!Array.isArray(data)) data = [];
          if (which === 'active') data = data.filter((r: any) => r.is_active);
          out(fmtTable(data.slice(0, 50).map((r: any) => ({
            symbol: r.symbol,
            name: r.name,
            address: String(r.address || '').slice(0, 10) + '…',
            active: r.is_active ? 'yes' : 'no',
            supply: Number(r.total_supply).toLocaleString(),
          }))));
          break;
        }

        case 'txs': {
          const limit = parseInt(args[0] || '20', 10);
          const data = await api.get('/api/transactions');
          const rows = (Array.isArray(data) ? data : []).slice(0, limit);
          out(fmtTable(rows.map((r: any) => ({
            tx: String(r.tx_hash || r.txHash || '').slice(0, 12) + '…',
            from: String(r.from_address || r.fromAddress || '').slice(0, 10) + '…',
            to: r.to_address || r.toAddress || '-',
            amount: r.amount,
            status: r.status,
            time: new Date(r.created_at || Date.now()).toISOString().slice(11, 19),
          }))));
          break;
        }

        case 'wallet': {
          if (!args[0]) { err('usage: wallet <address>'); break; }
          const data = await api.get('/api/wallets');
          const matches = (Array.isArray(data) ? data : []).filter((w: any) =>
            String(w.address || '').toLowerCase().includes(args[0].toLowerCase())
          );
          out(fmtTable(matches.map((w: any) => ({
            address: w.address,
            network: w.network,
            created: new Date(w.created_at || Date.now()).toISOString().slice(0, 10),
          }))));
          break;
        }

        case 'tx': {
          if (!args[0]) { err('usage: tx <hash>'); break; }
          const data = await api.get('/api/transactions');
          const match = (Array.isArray(data) ? data : []).find((t: any) =>
            String(t.tx_hash || t.txHash || '').toLowerCase().includes(args[0].toLowerCase())
          );
          out(match ? JSON.stringify(match, null, 2) : 'not found');
          break;
        }

        case 'bridges': {
          const limit = parseInt(args[0] || '20', 10);
          const data = await api.get('/api/token-operations');
          const rows = (Array.isArray(data) ? data : [])
            .filter((r: any) => String(r.wallet_address || '').startsWith('bridge:'))
            .slice(0, limit);
          out(fmtTable(rows.map((r: any) => ({
            type: r.operation_type,
            wallet: String(r.wallet_address).slice(0, 24) + '…',
            amount: r.amount,
            usd: r.usdt_amount,
            status: r.status,
            time: new Date(r.created_at || Date.now()).toISOString().slice(11, 19),
          }))));
          break;
        }

        case 'components': {
          out(KNOWN_COMPONENTS.map((c) => `  ${c.key.padEnd(28)} ${c.label}`).join('\n'));
          break;
        }

        case 'visibility': {
          if (args[0] === 'list') {
            out(hidden.length ? hidden.map((k) => `  ${k}`).join('\n') : '(no components hidden)');
          } else { err('usage: visibility list'); }
          break;
        }

        case 'hide': {
          if (!args[0]) { err('usage: hide <componentKey>'); break; }
          if (!KNOWN_COMPONENTS.find((c) => c.key === args[0])) {
            err(`unknown component: ${args[0]}  (use "components" to list)`); break;
          }
          if (hidden.includes(args[0])) { sys('already hidden'); break; }
          await setHiddenList([...hidden, args[0]]);
          sys(`hidden: ${args[0]}`);
          break;
        }

        case 'show': {
          if (!args[0]) { err('usage: show <componentKey>'); break; }
          if (!hidden.includes(args[0])) { sys('not hidden'); break; }
          await setHiddenList(hidden.filter((k) => k !== args[0]));
          sys(`shown: ${args[0]}`);
          break;
        }

        case 'announce': {
          const msg = args.join(' ');
          if (!msg) { err('usage: announce <text>'); break; }
          await api.post('/api/config', {
            key: ANNOUNCE_KEY,
            value: { message: msg, set_by: user?.id, at: new Date().toISOString() },
          });
          sys(`announcement set: "${msg}"`);
          break;
        }

        case 'banner': {
          if (args[0] === 'clear') {
            await api.post('/api/config', { key: ANNOUNCE_KEY, value: null });
            sys('banner cleared');
          } else err('usage: banner clear');
          break;
        }

        case 'rpc': {
          if (!args[0]) { err('usage: rpc <method> [params...]'); break; }
          const method = args[0];
          const params = args.slice(1).map((p) => {
            try { return JSON.parse(p); } catch { return p; }
          });
          const url = (import.meta as any).env?.VITE_RPC_URL || '/rpc';
          try {
            const res = await fetch(url, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
            });
            const j = await res.json();
            out(JSON.stringify(j, null, 2));
          } catch (e: any) {
            err(`rpc failed: ${e.message}`);
          }
          break;
        }

        case 'ssh': {
          const c = args.join(' ');
          if (!c) { err('usage: ssh <command>'); break; }
          out(`# Copy and run on the node:\nssh root@<node-ip> '${c.replace(/'/g, "'\\''")}'`);
          break;
        }

        default:
          err(`unknown command: ${verb}  (try "help")`);
      }
    } catch (e: any) {
      err(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !busy) {
      const v = input;
      setInput('');
      runCmd(v);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!history.length) return;
      const next = histIdx < 0 ? history.length - 1 : Math.max(0, histIdx - 1);
      setHistIdx(next);
      setInput(history[next] || '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (histIdx < 0) return;
      const next = histIdx + 1;
      if (next >= history.length) { setHistIdx(-1); setInput(''); }
      else { setHistIdx(next); setInput(history[next]); }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const verbs = ['help','clear','version','status','users','nodes','tokens','txs','wallet','tx','bridges','components','visibility','hide','show','announce','banner','rpc','ssh'];
      const m = verbs.filter((v) => v.startsWith(input.trim()));
      if (m.length === 1) setInput(m[0] + ' ');
      else if (m.length > 1) sys(m.join('  '));
    }
  };

  const exportLog = () => {
    const txt = lines.map((l) => `[${l.ts}] ${l.text}`).join('\n');
    const blob = new Blob([txt], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `admin-console-${Date.now()}.log`;
    a.click();
  };

  return (
    <div className="space-y-4" data-testid="panel-admin-console">
      <GlassCard className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-primary/20">
              <Terminal className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Admin Console</h3>
              <p className="text-sm text-muted-foreground">
                Run admin commands. Type <code className="text-primary">help</code> to start.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={busy ? 'default' : 'secondary'} className="gap-1">
              <span className={`w-2 h-2 rounded-full ${busy ? 'bg-yellow-400 animate-pulse' : 'bg-primary'}`} />
              {busy ? 'running' : 'ready'}
            </Badge>
            <Button size="sm" variant="outline" onClick={exportLog} className="gap-1" data-testid="button-export-log">
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
            <Button size="sm" variant="outline" onClick={() => setLines([])} className="gap-1" data-testid="button-clear-console">
              <Trash2 className="h-3.5 w-3.5" /> Clear
            </Button>
          </div>
        </div>

        <div
          ref={scrollRef}
          onClick={() => inputRef.current?.focus()}
          className="font-mono text-xs bg-black/60 rounded-lg p-4 h-[420px] overflow-y-auto cursor-text border border-border/40"
          data-testid="text-console-output"
        >
          {lines.map((l, i) => (
            <div
              key={i}
              className={
                l.kind === 'in'  ? 'text-primary'
              : l.kind === 'err' ? 'text-destructive whitespace-pre-wrap'
              : l.kind === 'sys' ? 'text-yellow-400 whitespace-pre-wrap'
              :                    'text-foreground/90 whitespace-pre-wrap'
              }
            >
              {l.text}
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1">
            <span className="text-primary">$</span>
            <input
              ref={inputRef}
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              disabled={busy}
              className="flex-1 bg-transparent border-0 outline-none text-foreground/90 font-mono text-xs"
              spellCheck={false}
              autoComplete="off"
              data-testid="input-console"
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground mt-3">
          ↑/↓ history · Tab to autocomplete · this console operates on the live database
          and the blockchain RPC. Use with care.
        </p>
      </GlassCard>
    </div>
  );
};
