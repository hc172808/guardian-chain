import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Socket } from 'net';

export interface ActivityEvent {
  id: string;
  type: 'login' | 'logout' | 'transaction' | 'node_heartbeat' | 'governance_vote' | 'node_approved' | 'token_created' | 'faucet' | 'bridge' | 'admin_action';
  title: string;
  detail: string;
  user?: string;
  ip?: string;
  ts: string;
  meta?: Record<string, any>;
}

const MAX_HISTORY = 200;
const history: ActivityEvent[] = [];
const clients = new Set<WebSocket>();
const wsTokens = new Map<string, { userId: string; isAdmin: boolean; expiresAt: number }>();

let wss: WebSocketServer | null = null;

export function initActivityFeed() {
  wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    ws.on('message', () => {});
    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
    clients.add(ws);
    // Send last N events on connect
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'history', events: history.slice(-100) }));
    }
  });

  return wss;
}

export function handleUpgrade(req: IncomingMessage, socket: Socket, head: Buffer) {
  if (!wss) return;
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  if (url.pathname !== '/ws/admin/activity') return;

  const token = url.searchParams.get('token');
  if (!token) { socket.destroy(); return; }

  const entry = wsTokens.get(token);
  if (!entry || Date.now() > entry.expiresAt || !entry.isAdmin) {
    socket.destroy();
    wsTokens.delete(token);
    return;
  }
  wsTokens.delete(token); // one-time use

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss!.emit('connection', ws, req);
  });
}

export function broadcastActivity(event: Omit<ActivityEvent, 'id' | 'ts'>) {
  const full: ActivityEvent = {
    ...event,
    id: Math.random().toString(36).slice(2),
    ts: new Date().toISOString(),
  };
  history.push(full);
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);

  const msg = JSON.stringify({ type: 'event', event: full });
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

export function issueWsToken(userId: string, isAdmin: boolean): string {
  const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  wsTokens.set(token, { userId, isAdmin, expiresAt: Date.now() + 30_000 });
  // Clean up expired tokens
  for (const [k, v] of wsTokens) {
    if (Date.now() > v.expiresAt) wsTokens.delete(k);
  }
  return token;
}
