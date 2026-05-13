// Supabase compatibility shim — redirects all DB calls to Express API
// This preserves the supabase.from() call-chain interface so components
// don't need to be individually rewritten.

const API_BASE = '/api';

type FilterOp = 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'like' | 'ilike' | 'in' | 'is';

interface QueryState {
  table: string;
  operation: 'select' | 'insert' | 'update' | 'upsert' | 'delete';
  selectCols: string;
  filters: Array<{ col: string; op: FilterOp; val: unknown }>;
  orderCol?: string;
  orderAsc?: boolean;
  limitVal?: number;
  offsetVal?: number;
  isSingle?: boolean;
  isMaybeSingle?: boolean;
  body?: unknown;
  upsertOnConflict?: string;
  countMode?: 'exact' | 'planned' | 'estimated';
  returning?: string;
}

const buildUrl = (state: QueryState): string => {
  const params = new URLSearchParams();
  params.set('_op', state.operation);
  params.set('_select', state.selectCols || '*');
  if (state.orderCol) {
    params.set('_order', state.orderCol);
    params.set('_asc', String(state.orderAsc ?? false));
  }
  if (state.limitVal !== undefined) params.set('_limit', String(state.limitVal));
  if (state.offsetVal !== undefined) params.set('_offset', String(state.offsetVal));
  if (state.countMode) params.set('_count', state.countMode);
  if (state.upsertOnConflict) params.set('_on_conflict', state.upsertOnConflict);
  for (const f of state.filters) {
    params.append(`_filter_${f.op}`, `${f.col}:${JSON.stringify(f.val)}`);
  }
  return `${API_BASE}/table/${state.table}?${params.toString()}`;
};

const apiFetch = async (url: string, method: string, body?: unknown) => {
  try {
    const resp = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => 'Unknown error');
      return { data: null, error: { message: errText, status: resp.status } };
    }
    const data = await resp.json();
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err?.message || 'Network error' } };
  }
};

const executeQuery = async (state: QueryState): Promise<{ data: any; error: any; count?: number }> => {
  const method =
    state.operation === 'select' ? 'GET' :
    state.operation === 'delete' ? 'DELETE' :
    state.operation === 'update' ? 'PATCH' :
    'POST';

  const url = buildUrl(state);
  const result = await apiFetch(url, method, state.operation !== 'select' && state.operation !== 'delete' ? state.body : undefined);

  if (result.error) return result;

  let data = result.data;
  const count = Array.isArray(data) ? data.length : undefined;

  if (state.isSingle) {
    data = Array.isArray(data) ? data[0] ?? null : data;
  } else if (state.isMaybeSingle) {
    data = Array.isArray(data) ? (data[0] ?? null) : data;
  }

  return { data, error: null, count };
};

const makeQueryBuilder = (state: QueryState) => {
  const builder: any = {
    select(cols = '*', opts?: { count?: 'exact' | 'planned' | 'estimated' }) {
      state.selectCols = cols;
      if (opts?.count) state.countMode = opts.count;
      return builder;
    },
    eq(col: string, val: unknown) { state.filters.push({ col, op: 'eq', val }); return builder; },
    neq(col: string, val: unknown) { state.filters.push({ col, op: 'neq', val }); return builder; },
    gt(col: string, val: unknown) { state.filters.push({ col, op: 'gt', val }); return builder; },
    lt(col: string, val: unknown) { state.filters.push({ col, op: 'lt', val }); return builder; },
    gte(col: string, val: unknown) { state.filters.push({ col, op: 'gte', val }); return builder; },
    lte(col: string, val: unknown) { state.filters.push({ col, op: 'lte', val }); return builder; },
    like(col: string, val: unknown) { state.filters.push({ col, op: 'like', val }); return builder; },
    ilike(col: string, val: unknown) { state.filters.push({ col, op: 'ilike', val }); return builder; },
    in(col: string, val: unknown[]) { state.filters.push({ col, op: 'in', val }); return builder; },
    is(col: string, val: unknown) { state.filters.push({ col, op: 'is', val }); return builder; },
    or(filterStr: string) {
      const validOps = new Set<string>(['eq','neq','gt','lt','gte','lte','like','ilike','in','is']);
      for (const clause of filterStr.split(',')) {
        const parts = clause.trim().split('.');
        if (parts.length < 3) continue;
        const col = parts[0];
        const op = parts[1];
        const val = parts.slice(2).join('.');
        if (validOps.has(op)) state.filters.push({ col, op: op as FilterOp, val });
      }
      return builder;
    },
    order(col: string, opts?: { ascending?: boolean }) {
      state.orderCol = col;
      state.orderAsc = opts?.ascending ?? true;
      return builder;
    },
    limit(n: number) { state.limitVal = n; return builder; },
    range(from: number, to: number) { state.offsetVal = from; state.limitVal = to - from + 1; return builder; },
    single() { state.isSingle = true; return builder; },
    maybeSingle() { state.isMaybeSingle = true; return builder; },
    _setOnConflict(col: string) { state.upsertOnConflict = col; return builder; },
    // Promise interface
    then(resolve: (v: any) => any, reject?: (e: any) => any) {
      return executeQuery(state).then(resolve, reject);
    },
    catch(reject: (e: any) => any) {
      return executeQuery(state).catch(reject);
    },
    finally(cb: () => void) {
      return executeQuery(state).finally(cb);
    },
  };
  return builder;
};

// Storage — real two-step presigned URL upload flow
const makeStorageBucket = (bucket: string) => ({
  upload: async (path: string, file: File | Blob, _opts?: unknown) => {
    try {
      const name = file instanceof File ? file.name : path;
      const urlRes = await fetch(`${API_BASE}/storage/uploads/request-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, size: file.size, contentType: file.type || 'application/octet-stream' }),
      });
      if (!urlRes.ok) {
        const msg = await urlRes.text().catch(() => 'Upload URL request failed');
        return { data: null, error: { message: msg } };
      }
      const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };
      const putRes = await fetch(uploadURL, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!putRes.ok) {
        return { data: null, error: { message: `Upload failed: ${putRes.status}` } };
      }
      // Set ACL after upload so the object is readable by the uploader.
      // Token logos and similar public assets use visibility=public.
      const isPublicBucket = bucket.startsWith('token') || bucket.startsWith('site') || bucket.startsWith('logo') || bucket.startsWith('public');
      await fetch(`${API_BASE}/storage/uploads/set-acl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objectPath, visibility: isPublicBucket ? 'public' : 'private' }),
      }).catch(() => {});
      return { data: { path: objectPath }, error: null };
    } catch (err: unknown) {
      return { data: null, error: { message: err instanceof Error ? err.message : 'Upload error' } };
    }
  },
  remove: async (_paths: string[]) => ({ data: null, error: null }),
  getPublicUrl: (filePath: string) => ({
    data: { publicUrl: `${API_BASE}/storage/public-objects/${filePath.replace(/^\/objects\//, '').replace(/^\//, '')}` },
  }),
  list: async (_path?: string) => ({ data: [], error: null }),
  download: async (path: string) => {
    try {
      const cleanPath = path.replace(/^\/objects\//, '');
      const res = await fetch(`${API_BASE}/storage/objects/${cleanPath}`);
      if (!res.ok) return { data: null, error: { message: `Download failed: ${res.status}` } };
      const blob = await res.blob();
      return { data: blob, error: null };
    } catch (err: unknown) {
      return { data: null, error: { message: err instanceof Error ? err.message : 'Download error' } };
    }
  },
});

// Realtime channel shim — no-ops
const makeChannel = (_name: string) => {
  const ch: any = {
    on: (_event: string, _filter: unknown, _cb?: unknown) => ch,
    subscribe: (_cb?: (status: string) => void) => {
      _cb?.('SUBSCRIBED');
      return ch;
    },
    unsubscribe: () => ch,
  };
  return ch;
};

// Auth shim — auth is handled by Clerk, these are kept for interface compatibility
const authShim = {
  getSession: async () => ({ data: { session: null }, error: null }),
  getUser: async () => ({ data: { user: null }, error: null }),
  onAuthStateChange: (_cb: unknown) => ({
    data: { subscription: { unsubscribe: () => {} } },
  }),
  signInWithPassword: async (_creds: unknown) => ({ data: null, error: { message: 'Use Clerk auth' } }),
  signUp: async (_creds: unknown) => ({ data: null, error: { message: 'Use Clerk auth' } }),
  signOut: async () => ({ error: null }),
  resetPasswordForEmail: async (_email: string, _opts?: unknown) => ({ error: null }),
  updateUser: async (_updates: unknown) => ({ data: null, error: null }),
};

export const supabase = {
  from: (table: string) => {
    const make = (op: QueryState['operation'], body?: unknown) =>
      makeQueryBuilder({
        table,
        operation: op,
        selectCols: '*',
        filters: [],
        body,
      });

    return {
      select: (cols = '*', opts?: { count?: 'exact' | 'planned' | 'estimated' }) => {
        const qb = make('select');
        qb.select(cols, opts);
        return qb;
      },
      insert: (rows: unknown, opts?: unknown) => {
        const qb = make('insert', rows);
        return qb;
      },
      update: (row: unknown, opts?: unknown) => {
        const qb = make('update', row);
        return qb;
      },
      upsert: (rows: unknown, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) => {
        const qb = make('upsert', rows);
        if (opts?.onConflict) qb._setOnConflict(opts.onConflict);
        return qb;
      },
      delete: () => make('delete'),
    };
  },

  storage: {
    from: (bucket: string) => makeStorageBucket(bucket),
  },

  channel: (name: string) => makeChannel(name),
  removeChannel: (_ch: unknown) => {},

  auth: authShim,

  functions: {
    invoke: async (_name: string, _opts?: unknown) => ({ data: null, error: null }),
  },

  rpc: async (_fn: string, _args?: unknown) => ({ data: null, error: null }),
};

export type { Database } from './types';
