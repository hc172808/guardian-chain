import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  Clock, Play, RefreshCw, Settings, CheckCircle, XCircle,
  AlertTriangle, Loader2, Terminal, Calendar, Zap, Database,
  GitBranch, Bell, Activity, Shield, Trash2
} from 'lucide-react';

interface CronJob {
  id: string;
  name: string;
  description: string;
  schedule: string;
  enabled: boolean;
  lastRun: string | null;
  nextRun: string | null;
  lastStatus: 'success' | 'error' | 'running' | 'never';
  lastDuration: number | null;
  runCount: number;
  errorCount: number;
  lastOutput: string | null;
}

const PRESETS = [
  { label: 'Every minute', value: '* * * * *' },
  { label: 'Every 5 minutes', value: '*/5 * * * *' },
  { label: 'Every 15 minutes', value: '*/15 * * * *' },
  { label: 'Every 30 minutes', value: '*/30 * * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Every 12 hours', value: '0 */12 * * *' },
  { label: 'Daily at midnight', value: '0 0 * * *' },
  { label: 'Daily at 3am', value: '0 3 * * *' },
  { label: 'Weekly (Sunday midnight)', value: '0 0 * * 0' },
];

const JOB_ICONS: Record<string, any> = {
  'db-pruner': Database,
  'git-pull': GitBranch,
  'price-feed': Activity,
  'health-check': Shield,
  'network-snapshot': Zap,
  'webhook-retry': Bell,
  'session-cleanup': Trash2,
  'email-token-cleanup': Clock,
};

function statusColor(s: CronJob['lastStatus']) {
  if (s === 'success') return 'text-emerald-400';
  if (s === 'error') return 'text-red-400';
  if (s === 'running') return 'text-cyan-400';
  return 'text-muted-foreground';
}

function StatusIcon({ s }: { s: CronJob['lastStatus'] }) {
  if (s === 'success') return <CheckCircle className="h-4 w-4 text-emerald-400" />;
  if (s === 'error') return <XCircle className="h-4 w-4 text-red-400" />;
  if (s === 'running') return <Loader2 className="h-4 w-4 text-cyan-400 animate-spin" />;
  return <Clock className="h-4 w-4 text-muted-foreground" />;
}

export function CronJobManager({ toast }: { toast: (t: any) => void }) {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [editJob, setEditJob] = useState<CronJob | null>(null);
  const [editSchedule, setEditSchedule] = useState('');
  const [editEnabled, setEditEnabled] = useState(true);
  const [logJob, setLogJob] = useState<CronJob | null>(null);
  const [running, setRunning] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const res = await fetch('/api/admin/cron-jobs', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setJobs(data);
    } catch {
      toast({ title: 'Failed to load cron jobs', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, []);

  const toggle = async (job: CronJob) => {
    try {
      const res = await fetch(`/api/admin/cron-jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled: !job.enabled }),
      });
      if (!res.ok) throw new Error('Failed');
      toast({ title: `${job.name} ${!job.enabled ? 'enabled' : 'disabled'}` });
      load();
    } catch {
      toast({ title: 'Update failed', variant: 'destructive' });
    }
  };

  const runNow = async (job: CronJob) => {
    setRunning(p => ({ ...p, [job.id]: true }));
    try {
      const res = await fetch(`/api/admin/cron-jobs/${job.id}/run`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast({ title: `${job.name} triggered`, description: 'Job started successfully' });
      setTimeout(load, 1500);
    } catch (e: any) {
      toast({ title: 'Run failed', description: e.message, variant: 'destructive' });
    } finally {
      setRunning(p => ({ ...p, [job.id]: false }));
    }
  };

  const saveEdit = async () => {
    if (!editJob) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/cron-jobs/${editJob.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ schedule: editSchedule, enabled: editEnabled }),
      });
      if (!res.ok) throw new Error('Failed');
      toast({ title: 'Schedule updated' });
      setEditJob(null);
      load();
    } catch {
      toast({ title: 'Save failed', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (job: CronJob) => {
    setEditJob(job);
    setEditSchedule(job.schedule);
    setEditEnabled(job.enabled);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" /> Cron Job Scheduler
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage automated background tasks, schedules, and triggers
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <div className="grid gap-4">
        {jobs.map(job => {
          const Icon = JOB_ICONS[job.id] || Clock;
          return (
            <GlassCard key={job.id} className="p-4">
              <div className="flex items-start gap-4">
                <div className="p-2.5 rounded-lg bg-primary/10 border border-primary/20 shrink-0">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{job.name}</span>
                    <Badge variant="outline" className="font-mono text-xs">{job.schedule}</Badge>
                    {job.enabled
                      ? <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Active</Badge>
                      : <Badge variant="secondary">Paused</Badge>
                    }
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{job.description}</p>
                  <div className="flex flex-wrap gap-4 mt-2 text-xs text-muted-foreground">
                    <span className={`flex items-center gap-1 ${statusColor(job.lastStatus)}`}>
                      <StatusIcon s={job.lastStatus} />
                      {job.lastStatus === 'never' ? 'Never run' : job.lastStatus}
                      {job.lastDuration != null && ` (${job.lastDuration}ms)`}
                    </span>
                    {job.lastRun && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Last: {new Date(job.lastRun).toLocaleString()}
                      </span>
                    )}
                    {job.nextRun && job.enabled && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Next: {new Date(job.nextRun).toLocaleString()}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      Runs: <b className="text-foreground">{job.runCount}</b>
                    </span>
                    {job.errorCount > 0 && (
                      <span className="flex items-center gap-1 text-red-400">
                        <AlertTriangle className="h-3 w-3" />
                        Errors: {job.errorCount}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  <Switch
                    checked={job.enabled}
                    onCheckedChange={() => toggle(job)}
                    aria-label="Enable/disable"
                  />
                  <Button
                    variant="outline" size="sm"
                    onClick={() => runNow(job)}
                    disabled={running[job.id]}
                    className="gap-1.5"
                  >
                    {running[job.id]
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Play className="h-3.5 w-3.5" />
                    }
                    Run Now
                  </Button>
                  {job.lastOutput && (
                    <Button variant="ghost" size="sm" onClick={() => setLogJob(job)} className="gap-1.5">
                      <Terminal className="h-3.5 w-3.5" /> Logs
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => openEdit(job)} className="gap-1.5">
                    <Settings className="h-3.5 w-3.5" /> Edit
                  </Button>
                </div>
              </div>
            </GlassCard>
          );
        })}
      </div>

      <Dialog open={!!editJob} onOpenChange={() => setEditJob(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" /> Edit: {editJob?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Preset Schedules</Label>
              <Select onValueChange={setEditSchedule}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a preset…" />
                </SelectTrigger>
                <SelectContent>
                  {PRESETS.map(p => (
                    <SelectItem key={p.value} value={p.value}>
                      <span className="font-mono mr-2 text-primary">{p.value}</span>
                      <span className="text-muted-foreground">{p.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Cron Expression</Label>
              <Input
                value={editSchedule}
                onChange={e => setEditSchedule(e.target.value)}
                placeholder="*/5 * * * *"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Format: minute hour day month weekday
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={editEnabled} onCheckedChange={setEditEnabled} />
              <Label>Enabled</Label>
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={saveEdit} disabled={saving} className="flex-1 gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save Schedule
              </Button>
              <Button variant="outline" onClick={() => setEditJob(null)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!logJob} onOpenChange={() => setLogJob(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Terminal className="h-5 w-5" /> Last Output: {logJob?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2">
            <Textarea
              readOnly
              value={logJob?.lastOutput || '(no output)'}
              className="font-mono text-xs min-h-[200px] bg-black/40"
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
