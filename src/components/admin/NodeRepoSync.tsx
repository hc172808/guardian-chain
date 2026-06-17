import { useState, useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GlassCard } from '@/components/ui/GlassCard';
import {
  RefreshCw, CheckCircle2, XCircle, AlertCircle,
  ExternalLink, GitBranch, Package, Terminal, Loader2,
  ChevronDown, ChevronRight, Webhook, Copy, Bell, BellOff,
  Activity, GitCommit, User,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface RepoConfig {
  label: string;
  repo: string;
  expectedModule: string;
  expectedBinary: string;
  expectedBlockTime?: string;
  installScript?: string;
  rpcPort?: number;
  p2pPort?: number;
}

const REPOS: RepoConfig[] = [
  {
    label: 'Full Node',
    repo: 'hc172808/fullnode',
    expectedModule: 'github.com/gydschain/fullnode',
    expectedBinary: 'gyds-fullnode',
    expectedBlockTime: '120',
    installScript: 'install-fullnode.sh',
    rpcPort: 8545,
    p2pPort: 30303,
  },
  {
    label: 'Genesis Node',
    repo: 'hc172808/genesis',
    expectedModule: 'github.com/gydschain/genesis',
    expectedBinary: 'gyds-genesis',
    expectedBlockTime: '120',
    installScript: 'install-genesis.sh',
    rpcPort: 8544,
    p2pPort: 30300,
  },
  {
    label: 'RPC Node',
    repo: 'hc172808/rpcnode',
    expectedModule: 'github.com/gydschain/rpcnode',
    expectedBinary: 'gyds-rpcnode',
    installScript: 'install-rpcnode.sh',
    rpcPort: 8545,
    p2pPort: 30303,
  },
  {
    label: 'Boost Node',
    repo: 'hc172808/boostnode',
    expectedModule: 'github.com/gydschain/boostnode',
    expectedBinary: 'gyds-boostnode',
    expectedBlockTime: '1',
    installScript: 'install-boostnode.sh',
    rpcPort: 8547,
    p2pPort: 30304,
  },
];

type CheckStatus = 'pass' | 'fail' | 'warn' | 'empty';

interface RepoCheck {
  exists: boolean;
  empty: boolean;
  defaultBranch: string;
  goModExists: boolean;
  mainGoExists: boolean;
  moduleCorrect: CheckStatus;
  moduleFound: string;
  binaryCorrect: CheckStatus;
  binaryFound: string;
  blockTimeCorrect?: CheckStatus;
  blockTimeFound?: string;
  lastPush?: string;
  starCount?: number;
  error?: string;
}

interface RepoResult {
  config: RepoConfig;
  status: 'idle' | 'loading' | 'done' | 'error';
  check?: RepoCheck;
  error?: string;
  expanded: boolean;
  lastChecked?: string;
}

interface WebhookEvent {
  id: string;
  event: string;
  repo: string;
  pusher?: string;
  branch?: string;
  commitCount?: number;
  headCommit?: string;
  timestamp: string;
  verified: boolean;
}

function decodeBase64(b64: string): string {
  try { return atob(b64.replace(/\n/g, '')); } catch { return ''; }
}

async function checkRepo(cfg: RepoConfig): Promise<RepoCheck> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };

  const metaRes = await fetch(`https://api.github.com/repos/${cfg.repo}`, { headers });
  if (!metaRes.ok) {
    const empty = metaRes.status === 404;
    return { exists: false, empty, defaultBranch: 'main', goModExists: false, mainGoExists: false,
      moduleCorrect: 'fail', moduleFound: '', binaryCorrect: 'fail', binaryFound: '',
      error: empty ? 'Repository not found or empty' : `GitHub API ${metaRes.status}` };
  }
  const meta = await metaRes.json();
  const branch = meta.default_branch || 'main';
  const isEmpty = meta.size === 0;

  if (isEmpty) {
    return { exists: true, empty: true, defaultBranch: branch, goModExists: false, mainGoExists: false,
      moduleCorrect: 'empty', moduleFound: '', binaryCorrect: 'empty', binaryFound: '',
      lastPush: meta.pushed_at, starCount: meta.stargazers_count,
      error: 'Repository exists but is completely empty — push the node-fixes files to initialize it.' };
  }

  const check: RepoCheck = {
    exists: true, empty: false, defaultBranch: branch,
    goModExists: false, mainGoExists: false,
    moduleCorrect: 'fail', moduleFound: '',
    binaryCorrect: 'fail', binaryFound: '',
    lastPush: meta.pushed_at, starCount: meta.stargazers_count,
  };

  const goModRes = await fetch(`https://api.github.com/repos/${cfg.repo}/contents/go.mod?ref=${branch}`, { headers });
  if (goModRes.ok) {
    check.goModExists = true;
    const goModData = await goModRes.json();
    const content = decodeBase64(goModData.content || '');
    const moduleMatch = content.match(/^module\s+(\S+)/m);
    check.moduleFound = moduleMatch?.[1] ?? '(not found)';
    check.moduleCorrect = check.moduleFound === cfg.expectedModule ? 'pass'
      : check.moduleFound.includes('litenode') ? 'fail' : 'warn';
  }

  const mainGoRes = await fetch(`https://api.github.com/repos/${cfg.repo}/contents/main.go?ref=${branch}`, { headers });
  if (mainGoRes.ok) {
    check.mainGoExists = true;
    const mainGoData = await mainGoRes.json();
    const content = decodeBase64(mainGoData.content || '');
    const useMatch = content.match(/Use:\s+"([^"]+)"/);
    check.binaryFound = useMatch?.[1] ?? '(not found)';
    check.binaryCorrect = check.binaryFound === cfg.expectedBinary ? 'pass'
      : check.binaryFound.includes('litenode') ? 'fail' : 'warn';

    if (cfg.expectedBlockTime) {
      const btMatch = content.match(/(\d+)\s*\*\s*time\.Second/);
      check.blockTimeFound = btMatch?.[1] ?? '(not found)';
      check.blockTimeCorrect = check.blockTimeFound === cfg.expectedBlockTime ? 'pass' : 'warn';
    }
  }

  return check;
}

function StatusBadge({ status, label }: { status: CheckStatus | undefined; label: string }) {
  if (!status) return null;
  const map = {
    pass:  { icon: <CheckCircle2 className="h-3 w-3" />, cls: 'text-green-400 border-green-400/40 bg-green-400/10' },
    fail:  { icon: <XCircle className="h-3 w-3" />,     cls: 'text-red-400 border-red-400/40 bg-red-400/10' },
    warn:  { icon: <AlertCircle className="h-3 w-3" />, cls: 'text-yellow-400 border-yellow-400/40 bg-yellow-400/10' },
    empty: { icon: <AlertCircle className="h-3 w-3" />, cls: 'text-orange-400 border-orange-400/40 bg-orange-400/10' },
  };
  const { icon, cls } = map[status] ?? map.warn;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border ${cls}`}>
      {icon}{label}
    </span>
  );
}

function OverallBadge({ check }: { check?: RepoCheck }) {
  if (!check) return <Badge variant="outline" className="text-muted-foreground">Not checked</Badge>;
  if (check.empty || !check.exists) return <Badge variant="outline" className="text-orange-400 border-orange-400/40">Empty</Badge>;
  const allPass = check.moduleCorrect === 'pass' && check.binaryCorrect === 'pass'
    && (check.blockTimeCorrect === undefined || check.blockTimeCorrect === 'pass');
  const anyFail = check.moduleCorrect === 'fail' || check.binaryCorrect === 'fail';
  if (allPass) return <Badge variant="outline" className="text-green-400 border-green-400/40">✓ OK</Badge>;
  if (anyFail) return <Badge variant="outline" className="text-red-400 border-red-400/40">✗ Errors</Badge>;
  return <Badge variant="outline" className="text-yellow-400 border-yellow-400/40">⚠ Warnings</Badge>;
}

function timeSince(iso?: string) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  const h = Math.floor(diff / 3600000);
  const m = Math.floor(diff / 60000);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  return `${m}m ago`;
}

export function NodeRepoSync() {
  const { toast } = useToast();
  const [results, setResults] = useState<RepoResult[]>(
    REPOS.map(cfg => ({ config: cfg, status: 'idle', expanded: false }))
  );
  const [checking, setChecking] = useState(false);
  const [webhookEvents, setWebhookEvents] = useState<WebhookEvent[]>([]);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [secretConfigured, setSecretConfigured] = useState(false);
  const [showWebhookPanel, setShowWebhookPanel] = useState(false);
  const [pendingRecheck, setPendingRecheck] = useState<string[]>([]);
  const lastEventIdRef = useRef<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchWebhookStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/github-webhook/events');
      if (!res.ok) return;
      const data = await res.json();
      setWebhookEvents(data.events ?? []);
      setWebhookUrl(data.webhookUrl ?? '');
      setSecretConfigured(data.secretConfigured ?? false);

      const pending: string[] = data.pendingRecheck ?? [];
      setPendingRecheck(pending);

      // Auto-trigger recheck for repos that received a push
      if (pending.length > 0) {
        const newLatest = data.events?.[0]?.id;
        if (newLatest && newLatest !== lastEventIdRef.current) {
          lastEventIdRef.current = newLatest;
          for (const repoFull of pending) {
            const idx = REPOS.findIndex(r => r.repo === repoFull);
            if (idx !== -1) {
              toast({ title: `🔔 Push detected — re-checking ${REPOS[idx].label}` });
              checkOneByIdx(idx);
            }
          }
          // Acknowledge
          fetch('/api/admin/github-webhook/ack', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchWebhookStatus();
    pollTimerRef.current = setInterval(fetchWebhookStatus, 30_000);
    return () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current); };
  }, [fetchWebhookStatus]);

  const toggle = (idx: number) =>
    setResults(prev => prev.map((r, i) => i === idx ? { ...r, expanded: !r.expanded } : r));

  const checkAll = useCallback(async () => {
    setChecking(true);
    setResults(prev => prev.map(r => ({ ...r, status: 'loading' as const, check: undefined, error: undefined })));
    await Promise.all(
      REPOS.map(async (cfg, idx) => {
        try {
          const check = await checkRepo(cfg);
          setResults(prev => prev.map((r, i) =>
            i === idx ? { ...r, status: 'done', check, lastChecked: new Date().toISOString() } : r
          ));
        } catch (e: any) {
          setResults(prev => prev.map((r, i) =>
            i === idx ? { ...r, status: 'error', error: e.message } : r
          ));
        }
      })
    );
    setChecking(false);
  }, []);

  const checkOneByIdx = useCallback(async (idx: number) => {
    setResults(prev => prev.map((r, i) =>
      i === idx ? { ...r, status: 'loading', check: undefined, error: undefined } : r
    ));
    try {
      const check = await checkRepo(REPOS[idx]);
      setResults(prev => prev.map((r, i) =>
        i === idx ? { ...r, status: 'done', check, expanded: true, lastChecked: new Date().toISOString() } : r
      ));
    } catch (e: any) {
      setResults(prev => prev.map((r, i) =>
        i === idx ? { ...r, status: 'error', error: e.message } : r
      ));
    }
  }, []);

  const passCount = results.filter(r =>
    r.check && !r.check.empty && r.check.moduleCorrect === 'pass' && r.check.binaryCorrect === 'pass'
  ).length;
  const doneCount = results.filter(r => r.status === 'done').length;

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast({ title: 'Webhook URL copied!' });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/20">
            <GitBranch className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">Node Repository Sync</h3>
            <p className="text-xs text-muted-foreground">
              Auto-checks repos on push · polls every 30s for webhook events
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {pendingRecheck.length > 0 && (
            <Badge className="bg-amber-500/20 text-amber-400 border-amber-400/30 border text-xs animate-pulse">
              {pendingRecheck.length} pending recheck
            </Badge>
          )}
          {doneCount > 0 && (
            <span className="text-xs text-muted-foreground">{passCount}/{doneCount} passing</span>
          )}
          <Button variant="outline" size="sm" className="gap-2 h-8 text-xs"
            onClick={() => setShowWebhookPanel(s => !s)}>
            <Webhook className="h-3.5 w-3.5" />
            Webhooks
          </Button>
          <Button variant="outline" size="sm" className="gap-2 h-8" onClick={checkAll} disabled={checking}>
            {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {checking ? 'Checking…' : 'Check All'}
          </Button>
        </div>
      </div>

      {/* Webhook setup + event log panel */}
      {showWebhookPanel && (
        <GlassCard className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Webhook className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">GitHub Webhook Integration</span>
              <Badge className={secretConfigured
                ? 'bg-green-500/20 text-green-400 border-green-400/30 border text-xs'
                : 'bg-amber-500/20 text-amber-400 border-amber-400/30 border text-xs'}>
                {secretConfigured ? '✓ Secret configured' : '⚠ No secret'}
              </Badge>
            </div>
          </div>

          {/* Setup instructions */}
          <div className="space-y-2 text-xs">
            <p className="text-muted-foreground font-medium">Setup (do once per node repo):</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Go to your GitHub repo → <strong className="text-foreground">Settings → Webhooks → Add webhook</strong></li>
              <li>Paste the payload URL below</li>
              <li>Set <strong className="text-foreground">Content type</strong> to <code className="bg-black/30 px-1 rounded">application/json</code></li>
              <li>Set <strong className="text-foreground">Secret</strong> to the value of <code className="bg-black/30 px-1 rounded">GITHUB_WEBHOOK_SECRET</code> env var</li>
              <li>Select <strong className="text-foreground">Just the push event</strong> → Save</li>
            </ol>
          </div>

          {/* Webhook URL */}
          <div className="flex items-center gap-2 bg-black/30 rounded-lg px-3 py-2">
            <code className="text-xs text-primary flex-1 break-all">{webhookUrl || 'Loading…'}</code>
            <button onClick={copyWebhookUrl} className="text-muted-foreground hover:text-primary shrink-0">
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>

          {!secretConfigured && (
            <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400">
              Add <code className="bg-black/20 px-1 rounded">GITHUB_WEBHOOK_SECRET</code> to your environment variables to enable HMAC signature verification.
            </div>
          )}

          {/* Recent webhook events */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <Activity className="h-3 w-3" /> Recent events ({webhookEvents.length})
            </p>
            {webhookEvents.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No webhook events received yet. Push to a node repo to test.</p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {webhookEvents.slice(0, 20).map(ev => (
                  <div key={ev.id} className="flex items-center gap-2 text-xs bg-secondary/30 rounded-md px-2.5 py-1.5">
                    <GitCommit className="h-3 w-3 text-primary shrink-0" />
                    <span className="font-mono text-muted-foreground shrink-0">{ev.repo.split('/')[1]}</span>
                    {ev.branch && <span className="text-foreground/70">@{ev.branch}</span>}
                    {ev.headCommit && <code className="text-primary/70">{ev.headCommit}</code>}
                    {ev.pusher && (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <User className="h-3 w-3" />{ev.pusher}
                      </span>
                    )}
                    {ev.commitCount != null && ev.commitCount > 0 && (
                      <span className="text-muted-foreground">+{ev.commitCount} commit{ev.commitCount !== 1 ? 's' : ''}</span>
                    )}
                    {ev.verified
                      ? <span className="ml-auto text-green-400">✓ verified</span>
                      : <span className="ml-auto text-amber-400">unverified</span>}
                    <span className="text-muted-foreground/60 shrink-0">{timeSince(ev.timestamp)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </GlassCard>
      )}

      {/* Repo cards */}
      <div className="space-y-3">
        {results.map((r, idx) => (
          <div key={r.config.repo}
            className={`rounded-lg border overflow-hidden transition-colors ${
              pendingRecheck.includes(r.config.repo)
                ? 'border-amber-400/40 bg-amber-500/5'
                : 'border-border/40 bg-secondary/20'
            }`}
          >
            {/* Row header */}
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <button onClick={() => toggle(idx)} className="text-muted-foreground hover:text-foreground transition-colors">
                  {r.expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{r.config.label}</span>
                    <OverallBadge check={r.check} />
                    {pendingRecheck.includes(r.config.repo) && (
                      <Badge className="bg-amber-500/20 text-amber-400 border-amber-400/30 border text-xs animate-pulse">
                        push detected
                      </Badge>
                    )}
                    {r.check?.lastPush && <span className="text-xs text-muted-foreground">{timeSince(r.check.lastPush)}</span>}
                    {r.lastChecked && <span className="text-xs text-muted-foreground/50">checked {timeSince(r.lastChecked)}</span>}
                  </div>
                  <a href={`https://github.com/${r.config.repo}`} target="_blank" rel="noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1">
                    github.com/{r.config.repo}<ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {r.status === 'loading' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs"
                  onClick={() => checkOneByIdx(idx)} disabled={r.status === 'loading' || checking}>
                  Check
                </Button>
              </div>
            </div>

            {/* Expanded details */}
            {r.expanded && (
              <div className="px-4 pb-4 border-t border-border/30 pt-3 space-y-3">
                {r.status === 'loading' && (
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Querying GitHub API…
                  </div>
                )}
                {r.status === 'error' && (
                  <div className="text-sm text-red-400 flex items-center gap-2">
                    <XCircle className="h-4 w-4" /> {r.error}
                  </div>
                )}
                {r.status === 'idle' && (
                  <p className="text-xs text-muted-foreground">Click "Check" to inspect this repo.</p>
                )}

                {r.status === 'done' && r.check && (
                  <div className="space-y-3">
                    {!r.check.exists && (
                      <div className="p-3 rounded bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                        <XCircle className="h-3 w-3 inline mr-1" /> Repository does not exist on GitHub.
                      </div>
                    )}
                    {r.check.empty && (
                      <div className="p-3 rounded bg-orange-500/10 border border-orange-500/20 text-xs text-orange-400 space-y-1">
                        <div><AlertCircle className="h-3 w-3 inline mr-1" /><strong>Empty repository</strong></div>
                        <div className="text-orange-300/80">{r.check.error}</div>
                        <div className="mt-2 font-mono bg-black/30 px-2 py-1 rounded text-orange-200/70">
                          # Push the node-fixes/{r.config.repo.split('/')[1]}/ files to initialize this repo
                        </div>
                      </div>
                    )}

                    {r.check.exists && !r.check.empty && (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="p-3 rounded bg-background/40 border border-border/30 space-y-1">
                            <div className="flex items-center gap-2">
                              <Package className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs font-medium">go.mod module</span>
                              <StatusBadge status={r.check.moduleCorrect} label={r.check.moduleCorrect === 'pass' ? 'Correct' : 'Wrong'} />
                            </div>
                            <div className="text-xs font-mono text-muted-foreground">
                              <div>Expected: <span className="text-foreground">{r.config.expectedModule}</span></div>
                              {r.check.moduleFound && r.check.moduleFound !== r.config.expectedModule && (
                                <div>Found: <span className={r.check.moduleCorrect === 'pass' ? 'text-green-400' : 'text-red-400'}>{r.check.moduleFound}</span></div>
                              )}
                            </div>
                          </div>

                          <div className="p-3 rounded bg-background/40 border border-border/30 space-y-1">
                            <div className="flex items-center gap-2">
                              <Terminal className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs font-medium">Binary name</span>
                              <StatusBadge status={r.check.binaryCorrect} label={r.check.binaryCorrect === 'pass' ? 'Correct' : 'Wrong'} />
                            </div>
                            <div className="text-xs font-mono text-muted-foreground">
                              <div>Expected: <span className="text-foreground">{r.config.expectedBinary}</span></div>
                              {r.check.binaryFound && r.check.binaryFound !== r.config.expectedBinary && (
                                <div>Found: <span className={r.check.binaryCorrect === 'pass' ? 'text-green-400' : 'text-red-400'}>{r.check.binaryFound}</span></div>
                              )}
                            </div>
                          </div>

                          {r.config.expectedBlockTime && r.check.blockTimeCorrect !== undefined && (
                            <div className="p-3 rounded bg-background/40 border border-border/30 space-y-1">
                              <div className="flex items-center gap-2">
                                <RefreshCw className="h-3 w-3 text-muted-foreground" />
                                <span className="text-xs font-medium">Block time</span>
                                <StatusBadge status={r.check.blockTimeCorrect} label={r.check.blockTimeCorrect === 'pass' ? 'Correct' : 'Mismatch'} />
                              </div>
                              <div className="text-xs font-mono text-muted-foreground">
                                <div>Expected: <span className="text-foreground">{r.config.expectedBlockTime}s</span></div>
                                {r.check.blockTimeFound && r.check.blockTimeFound !== r.config.expectedBlockTime && (
                                  <div>Found: <span className="text-yellow-400">{r.check.blockTimeFound}s</span></div>
                                )}
                              </div>
                            </div>
                          )}

                          <div className="p-3 rounded bg-background/40 border border-border/30 space-y-1">
                            <div className="text-xs font-medium text-muted-foreground mb-1">Files present</div>
                            <div className="flex flex-wrap gap-2">
                              <StatusBadge status={r.check.goModExists ? 'pass' : 'fail'} label="go.mod" />
                              <StatusBadge status={r.check.mainGoExists ? 'pass' : 'fail'} label="main.go" />
                            </div>
                          </div>
                        </div>

                        {(r.check.moduleCorrect !== 'pass' || r.check.binaryCorrect !== 'pass') && (
                          <div className="p-3 rounded bg-yellow-500/5 border border-yellow-500/20 space-y-1">
                            <p className="text-xs font-medium text-yellow-400">Fix instructions</p>
                            <p className="text-xs text-muted-foreground">
                              Copy corrected files from <code className="bg-black/30 px-1 rounded">node-fixes/{r.config.repo.split('/')[1]}/</code> and push:
                            </p>
                            <div className="font-mono text-xs bg-black/40 px-2 py-1.5 rounded text-green-300/80 space-y-0.5">
                              <div>git clone https://github.com/{r.config.repo}.git</div>
                              <div>cp -r node-fixes/{r.config.repo.split('/')[1]}/. {r.config.repo.split('/')[1]}/</div>
                              <div>cd {r.config.repo.split('/')[1]} && go mod tidy && git add -A && git commit -m "fix: correct module name and binary" && git push</div>
                            </div>
                          </div>
                        )}

                        {(r.config.rpcPort || r.config.p2pPort) && (
                          <div className="flex gap-4 text-xs text-muted-foreground">
                            {r.config.rpcPort && <span>RPC: <code className="text-foreground">:{r.config.rpcPort}</code></span>}
                            {r.config.p2pPort && <span>P2P: <code className="text-foreground">:{r.config.p2pPort}</code></span>}
                            {r.config.installScript && <span>Install: <code className="text-foreground">{r.config.installScript}</code></span>}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-1">
        <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-400" /> Correct</span>
        <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-red-400" /> Wrong (must fix)</span>
        <span className="flex items-center gap-1"><AlertCircle className="h-3 w-3 text-yellow-400" /> Warning</span>
        <span className="flex items-center gap-1"><AlertCircle className="h-3 w-3 text-orange-400" /> Empty repo</span>
        <span className="ml-auto flex items-center gap-1"><Bell className="h-3 w-3" /> Auto-rechecks on GitHub push · 60 req/hr GitHub API limit</span>
      </div>
    </div>
  );
}
