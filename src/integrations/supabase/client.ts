// Supabase compatibility shim — routes all calls to the Express API backend.
// This replaces the real Supabase client so no individual component needs changing.

const BASE = '';

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(BASE + path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    return { data: null, error: { message: err.error ?? err.message ?? res.statusText }, count: null };
  }
  const data = await res.json();
  const count = Array.isArray(data) ? data.length : null;
  return { data, error: null, count };
}

// ── Table-to-API route map ──────────────────────────────────────────────────
const TABLE_ROUTES: Record<string, string> = {
  profiles: '/api/profile',
  user_roles: '/api/me',
  wallets: '/api/wallets',
  transactions: '/api/transactions',
  node_installations: '/api/nodes',
  documentation: '/api/docs',
  admin_config: '/api/config',
  token_operations: '/api/token-operations',
  token_price: '/api/token-price',
  tokens: '/api/tokens',
  token_launches: '/api/launches',
  liquidity_pools: '/api/pools',
  token_watchlist: '/api/watchlist',
  token_price_alerts: '/api/alerts',
  network_validators: '/api/validators',
  validator_delegations: '/api/delegations',
  firewall_rules: '/api/firewall/rules',
  fail2ban_jails: '/api/firewall/jails',
  ip_access_list: '/api/firewall/ip-list',
  rate_limit_rules: '/api/firewall/rate-limits',
  ddos_protection: '/api/firewall/ddos',
  audit_logs: '/api/audit-logs',
  faucet_claims: '/api/faucet/claim',
};

// ── Query builder shim ──────────────────────────────────────────────────────

class QueryBuilder {
  private _table: string;
  private _route: string;
  private _filters: Record<string, string> = {};
  private _select: string = '*';
  private _limit?: number;
  private _order?: { column: string; asc: boolean };
  private _single = false;
  private _maybeSingle = false;
  private _head = false;
  private _insertData?: unknown;
  private _updateData?: unknown;
  private _upsertData?: unknown;
  private _upsertConflict?: string;
  private _method: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'UPSERT' = 'SELECT';
  private _id?: string;
  private _eqFilters: Array<[string, string]> = [];
  private _neqFilters: Array<[string, string]> = [];
  private _gteFilters: Array<[string, string]> = [];
  private _inFilters: Array<[string, string[]]> = [];
  private _orFilter?: string;

  constructor(table: string) {
    this._table = table;
    this._route = TABLE_ROUTES[table] ?? `/api/${table.replace(/_/g, '-')}`;
  }

  select(columns?: string, opts?: { count?: string; head?: boolean }) {
    this._select = columns ?? '*';
    if (opts?.head) this._head = true;
    return this;
  }

  insert(data: unknown) {
    this._method = 'INSERT';
    this._insertData = data;
    return this;
  }

  update(data: unknown) {
    this._method = 'UPDATE';
    this._updateData = data;
    return this;
  }

  upsert(data: unknown, opts?: { onConflict?: string }) {
    this._method = 'UPSERT';
    this._upsertData = data;
    this._upsertConflict = opts?.onConflict;
    return this;
  }

  delete() {
    this._method = 'DELETE';
    return this;
  }

  eq(column: string, value: string | number | boolean) {
    this._eqFilters.push([column, String(value)]);
    return this;
  }

  neq(column: string, value: string | number | boolean) {
    this._neqFilters.push([column, String(value)]);
    return this;
  }

  gte(column: string, value: string | number) {
    this._gteFilters.push([column, String(value)]);
    return this;
  }

  in(column: string, values: string[]) {
    this._inFilters.push([column, values]);
    return this;
  }

  or(filter: string) {
    this._orFilter = filter;
    return this;
  }

  limit(n: number) {
    this._limit = n;
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }) {
    this._order = { column, asc: opts?.ascending ?? true };
    return this;
  }

  single() {
    this._single = true;
    return this as any;
  }

  maybeSingle() {
    this._maybeSingle = true;
    return this as any;
  }

  returning() {
    return this as any;
  }

  // Build URL with query params for SELECT
  private buildUrl(): string {
    if (this._table === 'admin_config') {
      const keyFilter = this._eqFilters.find(([c]) => c === 'config_key');
      if (keyFilter) return `/api/config/${keyFilter[1]}`;
      return '/api/config';
    }
    if (this._table === 'documentation') {
      const slugFilter = this._eqFilters.find(([c]) => c === 'slug');
      if (slugFilter) return `/api/docs/${slugFilter[1]}`;
      return '/api/docs';
    }
    if (this._table === 'profiles') {
      return '/api/profile';
    }
    return this._route;
  }

  then(resolve: (result: any) => void, reject?: (err: any) => void): Promise<void> {
    return this.execute().then(resolve, reject);
  }

  async execute(): Promise<{ data: any; error: any; count?: number | null }> {
    try {
      switch (this._method) {
        case 'SELECT': return await this._doSelect();
        case 'INSERT': return await this._doInsert();
        case 'UPDATE': return await this._doUpdate();
        case 'DELETE': return await this._doDelete();
        case 'UPSERT': return await this._doUpsert();
        default: return { data: null, error: null };
      }
    } catch (e: any) {
      return { data: null, error: { message: e.message } };
    }
  }

  private async _doSelect() {
    if (this._head) {
      const url = this.buildUrl();
      const res = await apiFetch(url);
      if (res.error) return { data: null, error: res.error, count: 0 };
      const arr = Array.isArray(res.data) ? res.data : (res.data ? [res.data] : []);
      // Apply client-side filters for count queries
      const filtered = this._applyFilters(arr);
      return { data: null, error: null, count: filtered.length };
    }

    const url = this.buildUrl();
    const res = await apiFetch(url);
    if (res.error) return res;

    let arr = Array.isArray(res.data) ? res.data : (res.data ? [res.data] : []);
    arr = this._applyFilters(arr);
    if (this._limit) arr = arr.slice(0, this._limit);

    if (this._single || this._maybeSingle) {
      return { data: arr[0] ?? null, error: null };
    }
    return { data: arr, error: null, count: arr.length };
  }

  private _applyFilters(arr: any[]): any[] {
    let result = arr;
    for (const [col, val] of this._eqFilters) {
      const apiKey = this._toApiKey(col);
      result = result.filter((r: any) => {
        const rv = r[col] ?? r[apiKey];
        return String(rv ?? '') === String(val);
      });
    }
    for (const [col, val] of this._neqFilters) {
      const apiKey = this._toApiKey(col);
      result = result.filter((r: any) => {
        const rv = r[col] ?? r[apiKey];
        return String(rv ?? '') !== String(val);
      });
    }
    for (const [col, val] of this._gteFilters) {
      const apiKey = this._toApiKey(col);
      result = result.filter((r: any) => {
        const rv = r[col] ?? r[apiKey];
        return new Date(rv) >= new Date(val);
      });
    }
    for (const [col, values] of this._inFilters) {
      const apiKey = this._toApiKey(col);
      result = result.filter((r: any) => {
        const rv = r[col] ?? r[apiKey];
        return values.includes(String(rv ?? ''));
      });
    }
    return result;
  }

  // Convert snake_case DB column to camelCase API key
  private _toApiKey(col: string): string {
    return col.replace(/_([a-z])/g, (_, l) => l.toUpperCase());
  }

  private async _doInsert() {
    const data = Array.isArray(this._insertData) ? this._insertData[0] : this._insertData;

    // Special cases
    if (this._table === 'audit_logs') {
      return apiFetch('/api/audit-logs', { method: 'POST', body: JSON.stringify(data) });
    }
    if (this._table === 'faucet_claims') {
      return apiFetch('/api/faucet/claim', { method: 'POST', body: JSON.stringify({ token_type: (data as any).token_type, wallet_address: (data as any).wallet_address }) });
    }
    if (this._table === 'user_roles') {
      return { data: null, error: null }; // handled server-side
    }
    if (this._table === 'wallets') {
      return apiFetch('/api/wallets', { method: 'POST', body: JSON.stringify(data) });
    }

    return apiFetch(this._route, { method: 'POST', body: JSON.stringify(data) });
  }

  private async _doUpdate() {
    if (this._table === 'profiles') {
      return apiFetch('/api/profile', { method: 'PATCH', body: JSON.stringify(this._updateData) });
    }
    if (this._table === 'token_price') {
      return apiFetch('/api/token-price', { method: 'PATCH', body: JSON.stringify(this._updateData) });
    }

    // Extract ID from eq filters
    const idFilter = this._eqFilters.find(([c]) => c === 'id');
    if (idFilter) {
      return apiFetch(`${this._route}/${idFilter[1]}`, { method: 'PATCH', body: JSON.stringify(this._updateData) });
    }

    // node_installations: find by user_id is handled server-side
    return apiFetch(this._route, { method: 'PATCH', body: JSON.stringify(this._updateData) });
  }

  private async _doDelete() {
    if (this._table === 'token_watchlist') {
      const tokenIdFilter = this._eqFilters.find(([c]) => c === 'token_id');
      if (tokenIdFilter) return apiFetch(`/api/watchlist/${tokenIdFilter[1]}`, { method: 'DELETE' });
    }
    if (this._table === 'token_price_alerts') {
      const idFilter = this._eqFilters.find(([c]) => c === 'id');
      if (idFilter) return apiFetch(`/api/alerts/${idFilter[1]}`, { method: 'DELETE' });
    }

    const idFilter = this._eqFilters.find(([c]) => c === 'id');
    if (idFilter) {
      return apiFetch(`${this._route}/${idFilter[1]}`, { method: 'DELETE' });
    }
    return { data: null, error: null };
  }

  private async _doUpsert() {
    if (this._table === 'admin_config') {
      const d = Array.isArray(this._upsertData) ? this._upsertData[0] : this._upsertData as any;
      return apiFetch('/api/config', { method: 'POST', body: JSON.stringify({ key: d.config_key, value: d.config_value }) });
    }
    if (this._table === 'user_roles') {
      return { data: null, error: null }; // handled server-side
    }
    if (this._table === 'wallets') {
      return apiFetch('/api/wallets', { method: 'POST', body: JSON.stringify(this._upsertData) });
    }
    return apiFetch(this._route, { method: 'POST', body: JSON.stringify(this._upsertData) });
  }
}

// ── Storage shim ────────────────────────────────────────────────────────────
const storageShim = {
  from(bucket: string) {
    return {
      upload: async (path: string, file: File) => {
        // Return a fake URL — storage uploads require separate handling
        console.warn('[storage shim] upload not supported in migration mode:', bucket, path);
        return { data: { path }, error: null };
      },
      getPublicUrl: (path: string) => ({
        data: { publicUrl: path.startsWith('http') ? path : `/api/storage/${bucket}/${path}` },
      }),
    };
  },
};

// ── Auth shim ────────────────────────────────────────────────────────────────
const authShim = {
  getSession: async () => {
    try {
      const res = await fetch('/api/me', { credentials: 'include' });
      const user = await res.json();
      if (!user) return { data: { session: null }, error: null };
      const session = { user, access_token: 'replit-session' };
      return { data: { session }, error: null };
    } catch {
      return { data: { session: null }, error: null };
    }
  },
  getUser: async () => {
    try {
      const res = await fetch('/api/me', { credentials: 'include' });
      const user = await res.json();
      return { data: { user }, error: null };
    } catch {
      return { data: { user: null }, error: null };
    }
  },
  onAuthStateChange: (cb: (event: string, session: any) => void) => {
    // Fire once on load
    fetch('/api/me', { credentials: 'include' })
      .then(r => r.json())
      .then(user => {
        if (user) cb('SIGNED_IN', { user, access_token: 'replit-session' });
        else cb('SIGNED_OUT', null);
      })
      .catch(() => cb('SIGNED_OUT', null));
    return { data: { subscription: { unsubscribe: () => {} } } };
  },
  signUp: async () => ({ data: null, error: { message: 'Use Replit login' } }),
  signInWithPassword: async () => ({ data: null, error: { message: 'Use Replit login' } }),
  signOut: async () => {
    window.location.href = '/api/auth/logout';
    return { error: null };
  },
  resetPasswordForEmail: async () => ({ error: null }),
  updateUser: async () => ({ error: null }),
};

// ── Channel / Realtime shim ─────────────────────────────────────────────────
const channelShim = (_name: string) => ({
  on: (_event: string, _opts: any, _cb?: any) => channelShim(_name),
  subscribe: () => ({ unsubscribe: () => {} }),
});

// ── Main export ──────────────────────────────────────────────────────────────
export const supabase = {
  from: (table: string) => new QueryBuilder(table),
  auth: authShim,
  storage: storageShim,
  channel: channelShim,
  removeChannel: (_ch: any) => {},
} as any;
