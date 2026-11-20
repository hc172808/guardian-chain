import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

export const updatePhases = ['queued', 'checking', 'backing_up', 'pulling', 'installing', 'building', 'restarting', 'verifying', 'rolling_back', 'succeeded', 'rolled_back', 'failed', 'rollback_failed'] as const;
export type UpdatePhase = typeof updatePhases[number];
const terminal = new Set<UpdatePhase>(['succeeded', 'rolled_back', 'failed', 'rollback_failed']);
export function updateRunning(phase: UpdatePhase) { return !terminal.has(phase); }
function settings() {
  if (process.env.ENABLE_SERVER_UPDATES !== 'true' || process.env.NODE_ENV !== 'production') {
    throw new Error('Automatic updates are available only on your deployed server after enabling server updates.');
  }
  const appDir = path.resolve(process.env.DASHBOARD_APP_DIR || process.cwd());
  const stateDir = process.env.DASHBOARD_UPDATE_STATE_DIR;
  if (!stateDir || !path.isAbsolute(stateDir) || path.resolve(stateDir).startsWith(appDir + path.sep) || path.resolve(stateDir) === appDir) {
    throw new Error('Configure a private update state directory outside the application folder.');
  }
  return { appDir, stateDir, script: path.join(appDir, 'public/scripts/dashboard-update.sh') };
}
export function readDashboardUpdate() {
  const { stateDir } = settings();
  const statusFile = path.join(stateDir, 'status.json');
  if (!fs.existsSync(statusFile)) return { phase: null, updatedAt: null };
  const data = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
  if (!updatePhases.includes(data.phase)) throw new Error('Update status is unavailable.');
  return { phase: data.phase as UpdatePhase, updatedAt: String(data.updatedAt) };
}
export function startDashboardUpdate() {
  const { appDir, stateDir, script } = settings();
  const current = readDashboardUpdate();
  if (current.phase && updateRunning(current.phase)) return { ...current, alreadyRunning: true };
  if (!fs.existsSync(script)) throw new Error('Install the server update script before enabling updates.');
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(stateDir, 0o700);
  // Atomic admission also prevents simultaneous requests from starting two workers.
  const admission = path.join(stateDir, 'admission');
  let fd: number;
  try { fd = fs.openSync(admission, 'wx', 0o600); }
  catch { throw new Error('Another update request is being started.'); }
  try {
    const queued = { phase: 'queued' as const, updatedAt: new Date().toISOString() };
    fs.writeFileSync(path.join(stateDir, 'status.json'), JSON.stringify(queued), { mode: 0o600 });
    // Separate OS session survives PM2 restarting the request-serving process.
    const child = spawn('/bin/bash', [script], {
      cwd: appDir, detached: true, stdio: 'ignore',
      env: { ...process.env, APP_DIR: appDir, UPDATE_STATE_DIR: stateDir },
    });
    child.on('error', () => fs.writeFileSync(path.join(stateDir, 'status.json'), JSON.stringify({ phase: 'failed', updatedAt: new Date().toISOString() }), { mode: 0o600 }));
    child.unref();
    return { ...queued, alreadyRunning: false };
  } finally {
    fs.closeSync(fd);
    fs.unlinkSync(admission);
  }
}