import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, Smartphone, Monitor, Apple, X, ExternalLink, ChevronDown, Upload, Trash2, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface WalletRelease {
  id: number;
  platform: 'android' | 'ios' | 'windows' | 'mac';
  version: string;
  original_name: string;
  file_size: number;
  notes: string;
  download_count: number;
  created_at: string;
}

const PLATFORM_META: Record<string, { label: string; icon: typeof Smartphone; color: string; ext: string }> = {
  android: { label: 'Android', icon: Smartphone, color: 'text-green-400', ext: 'APK' },
  ios:     { label: 'iOS',     icon: Apple,      color: 'text-blue-400',  ext: 'IPA' },
  windows: { label: 'Windows', icon: Monitor,    color: 'text-cyan-400',  ext: 'EXE' },
  mac:     { label: 'macOS',   icon: Monitor,    color: 'text-purple-400',ext: 'DMG' },
};

function fmtSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function WalletDownloadButton() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState<number | null>(null);

  const { data: _releases } = useQuery<WalletRelease[]>({
    queryKey: ['wallet-releases'],
    queryFn: async () => {
      const res = await fetch('/api/wallet-releases');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Failed to load releases');
      return Array.isArray(data) ? data : [];
    },
    staleTime: 60_000,
  });
  const releases: WalletRelease[] = Array.isArray(_releases) ? _releases : [];

  if (!user) return null;
  if (releases.length === 0) return null;

  const byPlatform = releases.reduce<Record<string, WalletRelease>>((acc, r) => {
    if (!acc[r.platform]) acc[r.platform] = r;
    return acc;
  }, {});

  const handleDownload = async (release: WalletRelease) => {
    setDownloading(release.id);
    const a = document.createElement('a');
    a.href = `/api/wallet-releases/download/${release.id}`;
    a.download = release.original_name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => setDownloading(null), 2000);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/20 border border-primary/40 text-primary hover:bg-primary/30 transition-all text-sm font-medium"
      >
        <Download className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Wallet App</span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-border bg-gradient-to-r from-primary/10 to-transparent">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
                  <Smartphone className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-foreground">GYDS Wallet App</h2>
                  <p className="text-xs text-muted-foreground">Download the official wallet</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              {Object.values(byPlatform).map((release) => {
                const meta = PLATFORM_META[release.platform];
                const Icon = meta.icon;
                const isDl = downloading === release.id;
                return (
                  <div key={release.id} className="flex items-center justify-between p-4 rounded-xl bg-muted/30 border border-border/60 hover:border-primary/30 transition-all">
                    <div className="flex items-center gap-3">
                      <div className={`h-9 w-9 rounded-lg bg-muted flex items-center justify-center`}>
                        <Icon className={`h-5 w-5 ${meta.color}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">{meta.label}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono">v{release.version}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {meta.ext} · {fmtSize(release.file_size)} · {release.download_count} downloads
                        </p>
                        {release.notes && <p className="text-xs text-muted-foreground/70 mt-0.5 line-clamp-1">{release.notes}</p>}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDownload(release)}
                      disabled={isDl}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all disabled:opacity-60"
                    >
                      {isDl ? <CheckCircle2 className="h-3.5 w-3.5 animate-pulse" /> : <Download className="h-3.5 w-3.5" />}
                      {isDl ? 'Starting…' : 'Download'}
                    </button>
                  </div>
                );
              })}

              {releases.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No wallet builds available yet
                </div>
              )}
            </div>

            <div className="px-5 pb-5 pt-0">
              <div className="flex items-center gap-2 p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/20">
                <div className="h-1.5 w-1.5 rounded-full bg-yellow-400 shrink-0" />
                <p className="text-xs text-yellow-400/80">
                  Android: Enable <strong>Install from unknown sources</strong> before installing the APK.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function WalletReleaseManager() {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ platform: 'android', version: '', notes: '' });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const { data: _releasesAll, isLoading } = useQuery<WalletRelease[]>({
    queryKey: ['wallet-releases'],
    queryFn: async () => {
      const res = await fetch('/api/wallet-releases');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Failed to load releases');
      return Array.isArray(data) ? data : [];
    },
  });
  const releases: WalletRelease[] = Array.isArray(_releasesAll) ? _releasesAll : [];

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/admin/wallet-releases/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wallet-releases'] }),
  });

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return setError('Please select a file');
    if (!form.version.trim()) return setError('Version is required');
    setError(''); setSuccess(''); setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('platform', form.platform);
      fd.append('version', form.version);
      fd.append('notes', form.notes);
      const res = await fetch('/api/admin/wallet-releases/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(`Uploaded ${data.original_name} successfully!`);
      setForm({ platform: 'android', version: '', notes: '' });
      setFile(null);
      queryClient.invalidateQueries({ queryKey: ['wallet-releases'] });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const PLATFORM_OPTIONS = [
    { value: 'android', label: 'Android (APK / AAB)' },
    { value: 'ios',     label: 'iOS (IPA)' },
    { value: 'windows', label: 'Windows (EXE / ZIP)' },
    { value: 'mac',     label: 'macOS (DMG)' },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <Upload className="h-4 w-4 text-primary" />
          Upload New Build
        </h3>
        <form onSubmit={handleUpload} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">Platform</label>
              <select
                value={form.platform}
                onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}
                className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm focus:ring-1 ring-primary outline-none"
              >
                {PLATFORM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">Version</label>
              <input
                value={form.version}
                onChange={e => setForm(f => ({ ...f, version: e.target.value }))}
                placeholder="e.g. 1.0.0"
                className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm focus:ring-1 ring-primary outline-none"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-medium mb-1 block">Release Notes (optional)</label>
            <input
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="e.g. Bug fixes and performance improvements"
              className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm focus:ring-1 ring-primary outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-medium mb-1 block">App File</label>
            <div
              className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary/40 transition-colors"
              onClick={() => document.getElementById('wallet-file-input')?.click()}
            >
              <input
                id="wallet-file-input"
                type="file"
                className="hidden"
                accept=".apk,.aab,.ipa,.exe,.dmg,.zip,.appx"
                onChange={e => setFile(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <div className="space-y-1">
                  <CheckCircle2 className="h-8 w-8 text-green-400 mx-auto" />
                  <p className="text-sm font-medium text-foreground">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{fmtSize(file.size)}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="h-8 w-8 text-muted-foreground mx-auto" />
                  <p className="text-sm text-muted-foreground">Click to select <span className="text-foreground font-medium">APK / IPA / EXE / DMG</span></p>
                  <p className="text-xs text-muted-foreground">Max 500 MB</p>
                </div>
              )}
            </div>
          </div>

          {error && <p className="text-sm text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}
          {success && <p className="text-sm text-green-400 bg-green-400/10 rounded-lg px-3 py-2">{success}</p>}

          <button
            type="submit"
            disabled={uploading || !file}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all disabled:opacity-50"
          >
            {uploading ? (
              <>
                <div className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                Uploading…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Upload Build
              </>
            )}
          </button>
        </form>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <Download className="h-4 w-4 text-primary" />
          Published Builds
        </h3>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Loading…</div>
        ) : releases.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">No builds uploaded yet</div>
        ) : (
          <div className="space-y-3">
            {releases.map((release) => {
              const meta = PLATFORM_META[release.platform] ?? PLATFORM_META.android;
              const Icon = meta.icon;
              return (
                <div key={release.id} className="flex items-center justify-between p-4 rounded-xl bg-muted/30 border border-border/60">
                  <div className="flex items-center gap-3">
                    <Icon className={`h-5 w-5 ${meta.color}`} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{meta.label}</span>
                        <span className="text-xs font-mono text-primary">v{release.version}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {release.original_name} · {fmtSize(release.file_size)} · {release.download_count} downloads
                      </p>
                      {release.notes && <p className="text-xs text-muted-foreground/70 line-clamp-1">{release.notes}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={`/api/wallet-releases/download/${release.id}`}
                      className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                      download={release.original_name}
                    >
                      <ExternalLink className="h-3 w-3" />
                      Download
                    </a>
                    <button
                      onClick={() => { if (confirm('Delete this release?')) deleteMutation.mutate(release.id); }}
                      className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
