let password = localStorage.getItem('gyds_miner_password') || '';

function authHeaders() {
  return password ? { 'x-miner-password': password } : {};
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(opts.headers || {}) },
  });
  if (res.status === 401) {
    document.getElementById('loginGate').style.display = 'block';
    document.getElementById('appMain').style.display   = 'none';
    throw new Error('unauthorized');
  }
  return res.json();
}

function submitPassword() {
  password = document.getElementById('passwordInput').value;
  localStorage.setItem('gyds_miner_password', password);
  document.getElementById('loginError').textContent = '';
  refresh();
}

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtHashRate(hr) {
  if (!hr) return '0 H/s';
  if (hr >= 1e9) return (hr / 1e9).toFixed(2) + ' GH/s';
  if (hr >= 1e6) return (hr / 1e6).toFixed(2) + ' MH/s';
  if (hr >= 1e3) return (hr / 1e3).toFixed(2) + ' kH/s';
  return hr.toFixed(0) + ' H/s';
}

function fmtUptime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function fmtDiff(d) {
  if (!d) return '—';
  if (d >= 1e9) return (d / 1e9).toFixed(1) + 'G';
  if (d >= 1e6) return (d / 1e6).toFixed(1) + 'M';
  if (d >= 1e3) return (d / 1e3).toFixed(1) + 'K';
  return String(d);
}

// ── State ────────────────────────────────────────────────────────────────────
let configLoaded = false;
let logLines = [];
const MAX_LOG = 200;

function appendLog(lines) {
  logLines = [...logLines, ...lines].slice(-MAX_LOG);
  const box = document.getElementById('logBox');
  box.textContent = logLines.join('\n');
  box.scrollTop = box.scrollHeight;
}

function clearLog() {
  logLines = [];
  document.getElementById('logBox').textContent = '';
}

// ── Main refresh ──────────────────────────────────────────────────────────────
async function refresh() {
  try {
    const data = await api('/api/status');

    document.getElementById('loginGate').style.display = 'none';
    document.getElementById('appMain').style.display   = 'block';

    // Network label in header
    document.getElementById('networkLabel').textContent = 'GYDS Mainnet · Chain 198282';
    document.getElementById('hostLabel').textContent    =
      `${data.config.workerName} · ${data.system.hostname} · ${data.system.cpus} cores`;

    // Status pill
    const pill = document.getElementById('statusPill');
    pill.textContent = data.running ? (data.connected ? 'Mining' : 'Connecting…') : 'Stopped';
    pill.className = 'pill ' + (data.running && data.connected ? 'pill-on' : 'pill-off');

    // Stats
    setText('hashRate',      fmtHashRate(data.hashRate));
    setText('validShares',   String(data.validShares));
    setText('rejectedShares',String(data.rejectedShares));
    setText('totalReward',   data.totalReward.toFixed(6) + ' GYDS');
    setText('blockHeight',   data.blockHeight || '—');
    setText('difficulty',    fmtDiff(data.currentDifficulty));
    setText('uptime',        fmtUptime(data.uptime));

    // Pool banner
    const banner = document.getElementById('poolBanner');
    if (data.running && data.connected && data.poolName) {
      banner.style.display = 'flex';
      setText('poolName', data.poolName);
      const shareRatio = data.validShares + data.rejectedShares > 0
        ? ((data.validShares / (data.validShares + data.rejectedShares)) * 100).toFixed(1) + '% acceptance'
        : 'Waiting for shares…';
      setText('poolStats', `Block ${data.blockHeight || '—'} · Diff ${fmtDiff(data.currentDifficulty)} · ${shareRatio}`);
    } else {
      banner.style.display = 'none';
    }

    // Controls
    document.getElementById('startBtn').disabled = data.running;
    document.getElementById('stopBtn').disabled  = !data.running;

    // Config (only load once)
    if (!configLoaded) {
      setValue('cfgRpc',     data.config.rpcEndpoint);
      setValue('cfgAddress', data.config.minerAddress);
      setValue('cfgWorker',  data.config.workerName);
      setValue('cfgThreads', data.config.threads);
      configLoaded = true;
    }

    // System
    const sys = data.system;
    document.getElementById('systemInfo').innerHTML = `
      <div>Platform<span>${sys.platform}</span></div>
      <div>CPU Cores<span>${sys.cpus}</span></div>
      <div>Load (1/5/15m)<span>${sys.loadavg.map(n => n.toFixed(2)).join(' / ')}</span></div>
      <div>Memory<span>${sys.totalMemMb - sys.freeMemMb} / ${sys.totalMemMb} MB</span></div>
    `;

    // Append only NEW log lines
    const newLines = (data.log || []).filter(l => !logLines.includes(l));
    if (newLines.length) appendLog(newLines);

    if (data.lastError) {
      document.getElementById('actionMessage').textContent = '⚠ Last error: ' + data.lastError;
    }
  } catch (e) {
    if (e.message !== 'unauthorized') console.error(e);
  }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
function setValue(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val ?? '';
}

// ── Actions ───────────────────────────────────────────────────────────────────
async function callAction(action) {
  const btn = document.getElementById(action + 'Btn');
  if (btn) btn.disabled = true;
  document.getElementById('actionMessage').textContent = action === 'start' ? 'Starting…' : 'Stopping…';
  try {
    const result = await api('/api/' + action, { method: 'POST' });
    document.getElementById('actionMessage').textContent = result.message || '';
    if (!result.ok && result.message) {
      document.getElementById('actionMessage').textContent = '⚠ ' + result.message;
    }
  } catch (e) {
    document.getElementById('actionMessage').textContent = '⚠ ' + (e.message || 'Request failed');
  } finally {
    configLoaded = false; // re-sync config after restart
    refresh();
  }
}

async function saveConfig() {
  const body = {
    rpcEndpoint: document.getElementById('cfgRpc').value.trim(),
    minerAddress: document.getElementById('cfgAddress').value.trim(),
    workerName:   document.getElementById('cfgWorker').value.trim(),
    threads:      parseInt(document.getElementById('cfgThreads').value, 10) || 0,
  };
  const pw = document.getElementById('cfgPassword').value;
  if (pw) body.webPassword = pw;

  try {
    const result = await api('/api/config', { method: 'POST', body: JSON.stringify(body) });
    document.getElementById('configMessage').textContent = result.ok ? '✓ Saved.' : '✗ Save failed.';
    document.getElementById('cfgPassword').value = '';
    configLoaded = false;
    setTimeout(refresh, 400);
  } catch (e) {
    document.getElementById('configMessage').textContent = '✗ ' + (e.message || 'Request failed');
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────
refresh();
setInterval(refresh, 3000);
